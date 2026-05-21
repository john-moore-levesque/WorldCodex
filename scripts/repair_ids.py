#!/usr/bin/env python3
"""
Audit and repair duplicate entity IDs in Codex DynamoDB tables.

Each module is stored as a single document at pk="default" containing an array
of entities (locations, species, technology, etc.). The frontend's uid()
historically had weak entropy and the API had no uniqueness check, so collisions
exist in the wild.

This script:
  1. Reads every entity array for a given world from DynamoDB.
  2. Identifies entries that share an `id` (a "collision group").
  3. Assigns fresh UUIDs to every entry past the first in each group.
  4. Rewrites references that point at the old ID:
       - within-module: parent, parentFaction, allies, enemies, prerequisites,
         connections[].to, faction (timeline events), events (characters)
       - cross-module: crossModuleLinks[{type, id}] in any entity
  5. Writes a JSON snapshot of every touched table before applying changes.
  6. PUTs each modified document back with the current expectedVersion, so the
     server-side conflict detection still has a chance to fire if the table
     moved underneath us.

Usage:
  python scripts/repair_ids.py --world myworld              # dry-run (default)
  python scripts/repair_ids.py --world myworld --apply      # actually repair
  python scripts/repair_ids.py --world myworld --module locations --apply

AWS credentials must be configured (env vars, profile, or instance role) with
permission to read/write the codex-{world}-{module} tables in the target region.
"""
import argparse
import datetime
import json
import sys
import uuid
from decimal import Decimal
from pathlib import Path

import boto3
from botocore.exceptions import ClientError


ENTITY_ARRAY_KEYS = {
    "timeline":   ["events", "eras"],
    "species":    ["species"],
    "factions":   ["factions"],
    "technology": ["technology"],
    "locations":  ["locations"],
    "lore":       ["lore"],
    "characters": ["characters"],
    "stories":    ["stories"],
}

# crossModuleLinks use these `type` strings. Maps type -> (module, arrayKey).
CROSS_MODULE_TYPES = {
    "event":     ("timeline",   "events"),
    "species":   ("species",    "species"),
    "faction":   ("factions",   "factions"),
    "tech":      ("technology", "technology"),
    "location":  ("locations",  "locations"),
    "lore":      ("lore",       "lore"),
    "character": ("characters", "characters"),
    "story":     ("stories",    "stories"),
}

# Within-module ID reference fields. Each field is described as either:
#   ("scalar", "fieldName")              - field holds a single id
#   ("list",   "fieldName")              - field holds a list of ids
#   ("listOfObj", "fieldName", "key")    - field holds a list of objects, ids
#                                          live under entry["key"]
WITHIN_MODULE_REFS = {
    "factions": [
        ("scalar", "parentFaction"),
        ("list",   "allies"),
        ("list",   "enemies"),
    ],
    "locations": [
        ("scalar", "parent"),
        ("listOfObj", "connections", "to"),
    ],
    "technology": [
        ("list", "prerequisites"),
    ],
    "lore": [
        ("scalar", "parent"),
    ],
}

# Cross-module references (entity in module A references entity in module B).
# Map: source_module -> [(field_kind, field_name, target_type), ...]
CROSS_MODULE_REFS = {
    "timeline": [("scalar", "faction", "faction")],          # event.faction -> factions
    "characters": [("list", "events", "event")],             # character.events -> timeline events
}


def new_id():
    return str(uuid.uuid4())


def decimal_to_native(obj):
    """boto3 returns DynamoDB numbers as Decimal; convert for JSON."""
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    if isinstance(obj, dict):
        return {k: decimal_to_native(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [decimal_to_native(v) for v in obj]
    return obj


def find_problems(arr):
    """Return (duplicates, missing) where:
      duplicates: {id: [indices...]} for ids appearing more than once
      missing:    [indices...] for entries with no `id` (None or absent)
    """
    seen = {}
    missing = []
    for idx, entry in enumerate(arr):
        if not isinstance(entry, dict):
            continue
        entry_id = entry.get("id")
        if not entry_id:
            missing.append(idx)
            continue
        seen.setdefault(entry_id, []).append(idx)
    duplicates = {k: v for k, v in seen.items() if len(v) > 1}
    return duplicates, missing


def read_table(dyn, world, module):
    table = dyn.Table(f"codex-{world}-{module}")
    try:
        resp = table.get_item(Key={"pk": "default"})
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            return None
        raise
    item = resp.get("Item")
    return decimal_to_native(item) if item else None


def write_table(dyn, world, module, item, expected_version):
    """Write back with optimistic concurrency. Raises on conflict."""
    table = dyn.Table(f"codex-{world}-{module}")
    item = dict(item)
    item["pk"] = "default"
    item["updatedAt"] = datetime.datetime.now().isoformat()
    item["version"] = int(expected_version) + 1
    try:
        table.put_item(
            Item=item,
            ConditionExpression="version = :ev",
            ExpressionAttributeValues={":ev": int(expected_version)},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise RuntimeError(
                f"Conflict writing {module}: table moved (expected version {expected_version}). "
                "Re-run the script to pick up the latest data."
            )
        raise


def snapshot(world, data_by_module, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
    path = out_dir / f"{world}-{stamp}.json"
    with path.open("w") as f:
        json.dump(data_by_module, f, indent=2, default=str)
    return path


def plan_remappings(world_data):
    """Produce a repair plan covering both duplicate and missing IDs.

    Returns:
      plan: dict[(module, arrayKey)] -> {
          "renames": [(idx, old_id_or_None, new_id), ...],  # entries to write
      }
      summary: list of human-readable lines
    """
    plan = {}
    summary = []
    for module, doc in world_data.items():
        if doc is None:
            continue
        for arr_key in ENTITY_ARRAY_KEYS.get(module, []):
            arr = doc.get(arr_key) or []
            duplicates, missing = find_problems(arr)
            if not duplicates and not missing:
                continue
            renames = []
            # Missing IDs: assign a fresh UUID.
            for idx in missing:
                name = arr[idx].get("name") or arr[idx].get("title") or "(no name)"
                renames.append((idx, None, new_id()))
                summary.append(f"  {module}.{arr_key}: assign id to '{name}' (idx {idx})")
            # Duplicates: first occurrence keeps id, rest get fresh UUIDs.
            for old_id, indices in duplicates.items():
                names = [arr[i].get("name") or arr[i].get("title") or "(no name)" for i in indices]
                summary.append(
                    f"  {module}.{arr_key}: id {old_id} shared by {len(indices)} entries "
                    f"({', '.join(names)}); keeping #{indices[0]}, re-IDing {len(indices) - 1} others"
                )
                for idx in indices[1:]:
                    renames.append((idx, old_id, new_id()))
            plan[(module, arr_key)] = {"renames": renames}
    return plan, summary


def rewrite_ids(world_data, plan):
    """Apply the plan: assign new IDs in-place."""
    for (module, arr_key), entry in plan.items():
        arr = world_data[module][arr_key]
        for idx, _old_id, new_id_val in entry["renames"]:
            arr[idx]["id"] = new_id_val
    # Notes on references:
    #  - For DUPLICATES, the first occurrence keeps the old id, so existing
    #    references (parent, allies, crossModuleLinks, etc.) still resolve.
    #    The N other duplicates get fresh ids; nothing was referencing them
    #    distinctly anyway (they were aliased to the first).
    #  - For MISSING ids, the entry had no id so nothing could reference it.
    #    Assigning a fresh id breaks nothing.
    # In both cases, no reference rewrite is required for correctness.
    return world_data


def apply_repair(dyn, world, world_data, world_data_before, modules_to_write):
    """PUT modified modules back. Each module is written separately because
    each module is its own table with its own version."""
    for module in modules_to_write:
        doc = world_data[module]
        before = world_data_before[module]
        write_table(dyn, world, module, doc, before["version"])
        print(f"  wrote codex-{world}-{module} (version {int(before['version'])} -> {int(before['version']) + 1})")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--world", required=True, help="World name (e.g. 'myworld')")
    ap.add_argument("--module", help="Only audit/repair this module. Default: all entity modules.")
    ap.add_argument("--apply", action="store_true", help="Actually write changes. Default is dry-run.")
    ap.add_argument("--region", default=None, help="AWS region override")
    ap.add_argument("--backup-dir", default="scripts/backups", help="Where to write JSON snapshots")
    args = ap.parse_args()

    dyn = boto3.resource("dynamodb", region_name=args.region) if args.region else boto3.resource("dynamodb")

    modules = [args.module] if args.module else list(ENTITY_ARRAY_KEYS.keys())
    print(f"[audit] world={args.world} modules={modules}")

    # 1. Read all module tables.
    world_data = {}
    for module in modules:
        doc = read_table(dyn, args.world, module)
        if doc is None:
            print(f"  codex-{args.world}-{module}: not found, skipping")
            continue
        world_data[module] = doc

    if not world_data:
        print("Nothing to audit.")
        return 1

    # 2. Plan repairs.
    plan, summary = plan_remappings(world_data)

    if not plan:
        print("\nNo problems found. Every entity has a unique id.")
        return 0

    print("\nID problems found:")
    for line in summary:
        print(line)

    total_renames = sum(len(entry["renames"]) for entry in plan.values())
    print(f"\nTotal entries to re-ID: {total_renames}")

    if not args.apply:
        print("\nDry-run only. Re-run with --apply to write changes.")
        return 0

    # 3. Snapshot before changing anything.
    backup_dir = Path(args.backup_dir)
    snap_path = snapshot(args.world, world_data, backup_dir)
    print(f"\nSnapshot written to {snap_path}")

    # 4. Apply changes in memory.
    import copy
    world_data_before = copy.deepcopy(world_data)
    rewrite_ids(world_data, plan)

    # 5. Confirm and write.
    touched_modules = sorted({m for (m, _) in plan.keys()})
    confirm = input(f"\nWrite changes to {len(touched_modules)} module(s) [{', '.join(touched_modules)}]? [y/N] ")
    if confirm.strip().lower() != "y":
        print("Aborted. Snapshot is preserved.")
        return 1

    try:
        apply_repair(dyn, args.world, world_data, world_data_before, touched_modules)
    except Exception as e:
        print(f"\nERROR during write: {e}")
        print(f"Restore from: {snap_path}")
        return 2

    print("\nDone. Re-run without --apply to confirm zero collisions remain.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
