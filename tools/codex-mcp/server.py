#!/usr/bin/env python3
"""
Codex MCP server — exposes the Codex worldbuilding database as MCP tools so
Claude can read, create, update, and delete entries directly without going
through the YAML → codex_push.py round-trip.

Architecture:
  - Local stdio MCP server (zero hosting; runs as a subprocess of Claude Code).
  - Talks to DynamoDB directly via boto3 using the local AWS credential chain.
  - Mirrors the server-side validation from src/app.py findDuplicateIds so the
    MCP can't write data that would be rejected by the Lambda API.
  - Uses optimistic concurrency on writes (matches the version conventions in
    src/app.py writeToDynamo and codex_push.py).

Configure in ~/.claude.json or per-project .mcp.json — see tools/codex-mcp/README.md.
"""
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError
from mcp.server.fastmcp import FastMCP


# ── Module wiring ────────────────────────────────────────────────────────────

# Each module is one DynamoDB table per world: codex-{world}-{module}.
# The arrays inside each document have ids that must be unique — matches the
# validation in src/app.py and frontend/shared.jsx.
ENTITY_ARRAYS = {
    "timeline":   ["events", "eras"],
    "species":    ["species"],
    "factions":   ["factions"],
    "technology": ["technology"],
    "locations":  ["locations"],
    "lore":       ["lore"],
    "characters": ["characters"],
    "stories":    ["stories"],
}

# `overview` is a single document, not an array. Read/write it through the
# overview-specific tools rather than the generic entity tools.
SINGLE_DOC_MODULES = {"overview"}

DEFAULT_WORLD = os.environ.get("CODEX_WORLD", "dev")
AWS_REGION    = os.environ.get("AWS_REGION", "us-east-1")
AWS_PROFILE   = os.environ.get("AWS_PROFILE")


# ── boto3 setup ──────────────────────────────────────────────────────────────

def _session():
    if AWS_PROFILE:
        return boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    return boto3.Session(region_name=AWS_REGION)

_dynamo = _session().resource("dynamodb")


def _table(world: str, module: str):
    return _dynamo.Table(f"codex-{world}-{module}")


def _decimal_to_native(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    if isinstance(obj, dict):
        return {k: _decimal_to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_decimal_to_native(v) for v in obj]
    return obj


def _inflate(obj):
    """Recursively convert numbers to Decimal for DynamoDB writes."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, int) and not isinstance(obj, bool):
        return Decimal(obj)
    if isinstance(obj, dict):
        return {k: _inflate(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_inflate(v) for v in obj]
    return obj


# ── Validation (mirrors src/app.py findDuplicateIds) ─────────────────────────

def _find_id_problems(arrays: dict) -> list[dict]:
    problems = []
    for key, arr in arrays.items():
        if not isinstance(arr, list):
            continue
        seen = {}
        missing = []
        for idx, entry in enumerate(arr):
            if not isinstance(entry, dict):
                continue
            eid = entry.get("id")
            if not eid:
                missing.append(idx)
                continue
            seen.setdefault(eid, []).append(idx)
        dupes = {k: v for k, v in seen.items() if len(v) > 1}
        if dupes or missing:
            problems.append({"key": key, "duplicates": dupes, "missing_indices": missing})
    return problems


def _slugify(s: str) -> str:
    if not s:
        return ""
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def _resolve_id(arr: list[dict], id_or_slug: str) -> Optional[dict]:
    """Try exact id, then slug match. Mirrors findBySlugOrId in shared.jsx."""
    if not arr or not id_or_slug:
        return None
    for e in arr:
        if e.get("id") == id_or_slug:
            return e
    for e in arr:
        if _slugify(e.get("name") or e.get("title", "")) == id_or_slug:
            return e
    return None


# ── DynamoDB read / write helpers ────────────────────────────────────────────

def _read_doc(world: str, module: str) -> dict:
    try:
        resp = _table(world, module).get_item(Key={"pk": "default"})
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "ResourceNotFoundException":
            raise RuntimeError(f"Table codex-{world}-{module} does not exist") from e
        raise
    item = resp.get("Item")
    if not item:
        return {}
    return _decimal_to_native(item)


def _write_doc(world: str, module: str, doc: dict, expected_version: Optional[int]):
    """Write doc back with optimistic concurrency. Raises on conflict."""
    item = dict(doc)
    item["pk"] = "default"
    item["updatedAt"] = datetime.now(timezone.utc).isoformat()
    item["version"] = (int(expected_version) + 1) if expected_version is not None else 1
    item = _inflate(item)
    try:
        if expected_version is None:
            _table(world, module).put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(pk)",
            )
        else:
            _table(world, module).put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(pk) OR version = :ev",
                ExpressionAttributeValues={":ev": Decimal(expected_version)},
            )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise RuntimeError(
                f"Conflict writing codex-{world}-{module} (expected version "
                f"{expected_version}). Re-read and retry."
            ) from e
        raise
    return int(item["version"])


def _read_array(world: str, module: str) -> tuple[list[dict], dict, int]:
    """Return (the entity array, the full doc, the current version)."""
    if module not in ENTITY_ARRAYS:
        raise ValueError(f"Unknown module: {module}")
    doc = _read_doc(world, module)
    arr_key = ENTITY_ARRAYS[module][0]  # primary array per module
    return doc.get(arr_key) or [], doc, int(doc.get("version") or 0) or None


def _commit_array(world: str, module: str, arr: list[dict], doc: dict, expected_version: Optional[int]):
    """Validate then write back, replacing the primary array."""
    arr_key = ENTITY_ARRAYS[module][0]
    new_doc = dict(doc)
    new_doc[arr_key] = arr
    # Also re-validate any other entity arrays in the same doc (e.g. eras in timeline).
    arrays_to_check = {k: new_doc.get(k) or [] for k in ENTITY_ARRAYS[module]}
    problems = _find_id_problems(arrays_to_check)
    if problems:
        raise ValueError(f"Refusing to write: duplicate or missing ids: {problems}")
    return _write_doc(world, module, new_doc, expected_version)


# ── MCP server + tools ───────────────────────────────────────────────────────

mcp = FastMCP("codex")


@mcp.tool()
def list_worlds() -> list[str]:
    """List the names of all Codex worlds (each world is a set of DynamoDB tables
    named codex-{world}-{module}).

    Returns world slugs (e.g. ["dev", "myworld"]).
    """
    client = _session().client("dynamodb")
    paginator = client.get_paginator("list_tables")
    worlds = set()
    for page in paginator.paginate():
        for name in page["TableNames"]:
            if name.startswith("codex-"):
                rest = name[len("codex-"):]
                # split into <world>-<module>; world may itself contain hyphens
                # so split from the right on the known module suffix.
                for mod in list(ENTITY_ARRAYS) + list(SINGLE_DOC_MODULES):
                    suffix = f"-{mod}"
                    if rest.endswith(suffix):
                        worlds.add(rest[:-len(suffix)])
                        break
    return sorted(worlds)


@mcp.tool()
def list_modules() -> list[str]:
    """List the module names supported by Codex (timeline, species, factions, etc.)."""
    return sorted(list(ENTITY_ARRAYS) + list(SINGLE_DOC_MODULES))


@mcp.tool()
def list_entities(module: str, world: str = DEFAULT_WORLD, name_only: bool = False) -> list[dict]:
    """List all entries in a module of a world. Returns the full entity dicts
    by default; pass name_only=true for a lightweight {id, name} listing.

    Modules with entity arrays: timeline, species, factions, technology,
    locations, lore, characters, stories. Note: timeline includes both events
    and eras as separate arrays — this returns events by default. Use
    get_overview() for the overview module (it's a single document, not a list).
    """
    if module in SINGLE_DOC_MODULES:
        raise ValueError(f"{module} is a single document. Use get_overview() instead.")
    arr, _, _ = _read_array(world, module)
    if name_only:
        return [{"id": e.get("id"), "name": e.get("name") or e.get("title")} for e in arr]
    return arr


@mcp.tool()
def get_entity(module: str, id_or_slug: str, world: str = DEFAULT_WORLD) -> dict:
    """Fetch one entity by its id (UUID) or slug (lowercased name with non-alphanumeric
    replaced by '-'). Slug match falls back to id match.

    Raises if the entity doesn't exist.
    """
    arr, _, _ = _read_array(world, module)
    entity = _resolve_id(arr, id_or_slug)
    if not entity:
        raise ValueError(f"No {module} entity with id-or-slug {id_or_slug!r} in world {world!r}")
    return entity


@mcp.tool()
def get_overview(world: str = DEFAULT_WORLD) -> dict:
    """Read the world's overview document (title, subtitle, body, notes, tags)."""
    doc = _read_doc(world, "overview")
    return doc.get("overview") or {}


@mcp.tool()
def create_entity(module: str, fields: dict, world: str = DEFAULT_WORLD) -> dict:
    """Append a new entity to the given module. A UUID is auto-generated for `id`
    if not provided. Returns the created entity (including its `id`).

    `fields` should be the entity body, e.g. for species:
      {"name": "Hadarans", "classification": "Insectoid", "homeworld": "Hadar-2", ...}
    See the existing entries via list_entities() for the shape of each module.

    Refuses to write if the id would duplicate an existing one or any entry in
    the module is missing an id (mirrors the API's server-side validation).
    """
    if module in SINGLE_DOC_MODULES:
        raise ValueError(f"{module} is a single document. Use set_overview() instead.")
    arr, doc, version = _read_array(world, module)
    entity = dict(fields)
    if not entity.get("id"):
        entity["id"] = str(uuid.uuid4())
    arr = list(arr) + [entity]
    new_version = _commit_array(world, module, arr, doc, version)
    return {"entity": entity, "version": new_version}


@mcp.tool()
def update_entity(module: str, id_or_slug: str, fields: dict, world: str = DEFAULT_WORLD) -> dict:
    """Partial-update an entity: merge `fields` into the existing entry. The entity
    is identified by id or slug. The `id` field on the merged result is preserved
    even if `fields` includes a different id (use a different tool if you need to
    re-id an entity).

    Returns the updated entity.
    """
    if module in SINGLE_DOC_MODULES:
        raise ValueError(f"{module} is a single document. Use set_overview() instead.")
    arr, doc, version = _read_array(world, module)
    target = _resolve_id(arr, id_or_slug)
    if not target:
        raise ValueError(f"No {module} entity with id-or-slug {id_or_slug!r}")
    real_id = target["id"]
    new_arr = []
    updated = None
    for e in arr:
        if e.get("id") == real_id:
            merged = {**e, **fields, "id": real_id}
            new_arr.append(merged)
            updated = merged
        else:
            new_arr.append(e)
    new_version = _commit_array(world, module, new_arr, doc, version)
    return {"entity": updated, "version": new_version}


@mcp.tool()
def delete_entity(module: str, id_or_slug: str, world: str = DEFAULT_WORLD) -> dict:
    """Delete an entity by id or slug. Returns {deleted: id, version: N}.

    Does NOT scrub cross-references from other entities — callers that need
    that should follow up with update_entity calls.
    """
    if module in SINGLE_DOC_MODULES:
        raise ValueError(f"{module} is a single document and can't be deleted via this tool.")
    arr, doc, version = _read_array(world, module)
    target = _resolve_id(arr, id_or_slug)
    if not target:
        raise ValueError(f"No {module} entity with id-or-slug {id_or_slug!r}")
    real_id = target["id"]
    new_arr = [e for e in arr if e.get("id") != real_id]
    new_version = _commit_array(world, module, new_arr, doc, version)
    return {"deleted": real_id, "version": new_version}


@mcp.tool()
def set_overview(fields: dict, world: str = DEFAULT_WORLD) -> dict:
    """Replace the overview document's fields. `fields` is merged onto the existing
    overview, so you can update a subset (e.g. just `body` or `notes`).
    """
    doc = _read_doc(world, "overview")
    version = int(doc.get("version") or 0) or None
    current_overview = doc.get("overview") or {}
    new_overview = {**current_overview, **fields}
    new_doc = dict(doc)
    new_doc["overview"] = new_overview
    new_version = _write_doc(world, "overview", new_doc, version)
    return {"overview": new_overview, "version": new_version}


@mcp.tool()
def search(query: str, world: str = DEFAULT_WORLD, modules: Optional[list[str]] = None, limit: int = 25) -> list[dict]:
    """Case-insensitive substring search across the chosen modules. Returns up
    to `limit` matches, each as {module, id, name, snippet}.

    `modules` defaults to all entity modules. Searches across name/title and
    common text fields (summary, description, body, notes, etc.).
    """
    q = query.lower().strip()
    if not q:
        return []
    target_modules = modules or list(ENTITY_ARRAYS)
    text_fields = ["name", "title", "summary", "description", "body", "notes",
                   "classification", "homeworld", "motto", "bio", "backstory",
                   "physiology", "culture", "history", "detail", "principles",
                   "limitations", "properties"]
    results = []
    for module in target_modules:
        if module not in ENTITY_ARRAYS:
            continue
        try:
            arr, _, _ = _read_array(world, module)
        except RuntimeError:
            continue  # table doesn't exist
        for e in arr:
            for field in text_fields:
                val = e.get(field)
                if isinstance(val, str) and q in val.lower():
                    snippet_start = max(0, val.lower().find(q) - 30)
                    snippet = val[snippet_start:snippet_start + 120]
                    results.append({
                        "module": module,
                        "id": e.get("id"),
                        "name": e.get("name") or e.get("title"),
                        "matched_field": field,
                        "snippet": snippet,
                    })
                    break
            if len(results) >= limit:
                return results
    return results


if __name__ == "__main__":
    mcp.run()
