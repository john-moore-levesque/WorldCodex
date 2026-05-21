# codex-mcp

A local MCP server that exposes the Codex worldbuilding database as tools
for Claude. Replaces the YAML → `codex_push.py` round-trip: Claude can read,
create, update, and delete worldbuilding entries directly.

Runs as a stdio subprocess of Claude Code. Zero hosting cost.

## How it works

- Talks to your Codex DynamoDB tables directly via `boto3`, using your local
  AWS credentials.
- Mirrors the server-side validation from `src/app.py` so it can't write data
  that the Lambda API would reject (duplicate / missing ids).
- Uses optimistic concurrency (`expectedVersion`) on every write — same
  contract as the frontend and `codex_push.py`.

## Setup

### 1. Install dependencies

From the repo root:

```sh
cd tools/codex-mcp
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

(Or use `uv`, `pipenv`, etc. — anything that gets `mcp` and `boto3` installed
into a Python the server can run with.)

### 2. Verify AWS access

The server uses the standard boto3 credential chain — env vars, `~/.aws/credentials`,
instance roles, SSO, all of it. To check:

```sh
aws sts get-caller-identity
aws dynamodb list-tables --query 'TableNames[?starts_with(@, `codex-`)]'
```

You should see your `codex-{world}-{module}` tables.

### 3. Register with Claude Code

Register one MCP entry per world in `~/.claude.json` (global) or `.mcp.json`
(per-project). Each entry is the same server binary with a different
`CODEX_WORLD` baked in — that way Claude sees each world as a separate tool
namespace and there's no ambiguity about which world a write is hitting.

```json
{
  "mcpServers": {
    "codex-scifi": {
      "command": "/absolute/path/to/WorldCodex/tools/codex-mcp/.venv/bin/python",
      "args": ["/absolute/path/to/WorldCodex/tools/codex-mcp/server.py"],
      "env": {
        "CODEX_WORLD": "scifi",
        "AWS_REGION": "us-east-1"
      }
    },
    "codex-fantasy": {
      "command": "/absolute/path/to/WorldCodex/tools/codex-mcp/.venv/bin/python",
      "args": ["/absolute/path/to/WorldCodex/tools/codex-mcp/server.py"],
      "env": {
        "CODEX_WORLD": "fantasy",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

Add one block per world you want to edit from Claude. Every tool also accepts
an explicit `world` argument that overrides `CODEX_WORLD`, so cross-world
queries (`list_worlds`, copying between worlds, etc.) still work from any entry.

Optional env vars:
- `CODEX_WORLD` — default world for tools that don't get one passed explicitly.
  Defaults to `dev`.
- `AWS_REGION` — defaults to `us-east-1`.
- `AWS_PROFILE` — name of a profile in `~/.aws/credentials` to use.

Restart Claude Code and run `/mcp` — you should see one entry per world.

## Tools

| Tool | What it does |
|---|---|
| `list_worlds()` | Discover what worlds exist in DynamoDB. |
| `list_modules()` | The set of module names (timeline, species, factions, …). |
| `list_entities(module, world?, name_only?)` | All entries in a module. `name_only` gives `{id, name}` only. |
| `get_entity(module, id_or_slug, world?)` | Fetch one entity. Accepts a UUID or a slug. |
| `get_overview(world?)` | Read the world's overview document. |
| `create_entity(module, fields, world?)` | Append a new entity. UUID auto-assigned if missing. |
| `update_entity(module, id_or_slug, fields, world?)` | Merge `fields` into an existing entity. |
| `delete_entity(module, id_or_slug, world?)` | Remove an entity. Does not scrub cross-references. |
| `set_overview(fields, world?)` | Update the overview document (partial merge). |
| `search(query, world?, modules?, limit?)` | Substring search across name/title and common text fields. |

## Coexistence with codex_push.py and codex_export.py

The MCP server doesn't replace either script — they're complementary:

- **MCP** for live Claude-driven editing: small targeted changes during a
  worldbuilding session.
- **`codex_export.py`** for grabbing a YAML snapshot of the current state of
  the canonical data on disk.
- **`codex_push.py`** for bulk-pushing a directory of YAML files back up.

They all share the same validation rules, so writes from any of them are
consistent.

## Troubleshooting

- **"Conflict writing codex-…"**: someone (or another tool) updated the table
  between your read and write. Just retry — the MCP re-reads the version on
  every call.
- **"Refusing to write: duplicate or missing ids"**: validation rejected your
  payload. Likely a duplicate UUID or a missing `id` field. Use
  `list_entities(module, name_only=true)` to inspect, or run
  `scripts/repair_ids.py --world <name>` to audit.
- **"Table codex-… does not exist"**: wrong world name or that module hasn't
  been provisioned yet. `list_worlds()` will show you what's actually there.
