# Codex — API Contract

**Version:** 0.4
**Last updated:** 2026-04-22

This document defines the API contract for all six Codex modules: Overview, Timeline, Species, Factions, Technology, and Locations. It supersedes all earlier versions and is the single source of truth.

---

## Conventions

All modules share these patterns:

- **Full-overwrite GET/PUT** — no partial updates. The frontend holds canonical state in memory and sends the whole blob on save.
- **Optimistic concurrency** — the client sends `expectedVersion` (the version it last received from GET) on every PUT. If the stored version doesn't match, the backend returns 409. On success, the backend increments the version and returns the new value. Version numbers start at 1.
- **Auth** — API key in `x-api-key` header.
- **Content-Type** — `application/json` for all requests and responses.
- **Timestamps** — ISO 8601 UTC. The backend is authoritative for `updatedAt`.
- **CORS** — must allow the frontend's origin and the headers `Content-Type` and `x-api-key`.
- **One DynamoDB table per module**, single-item blob model.
- **Table naming** — `codex-{world}-{module}`, where `{world}` is a short identifier for the universe (e.g., `scifi`, `fantasy-west`) and `{module}` is one of `overview`, `timeline`, `species`, `factions`, `technology`, `locations`. Each world gets its own SAM stack.
- **Stack naming** — `codex-{world}` (e.g., `codex-scifi`).

### Error Shapes

All error responses follow the same shape:

```json
{ "error": "error_code", "message": "Human-readable description" }
```

Standard error codes: `not_found` (404), `bad_request` (400), `version_conflict` (409), `internal_error` (500).

The 409 response includes the stored version:
```json
{
  "error": "version_conflict",
  "message": "Stored version is newer than expectedVersion",
  "storedVersion": 44
}
```

---

## Cross-Module Linking

All entities across all modules use a unified `crossModuleLinks` array of typed references:

```json
{
  "crossModuleLinks": [
    { "type": "event", "id": "abc123" },
    { "type": "faction", "id": "def456" },
    { "type": "species", "id": "ghi789" },
    { "type": "tech", "id": "jkl012" },
    { "type": "location", "id": "mno345" }
  ]
}
```

Valid `type` values: `event`, `faction`, `species`, `tech`, `location`.

Links are directional but the frontend renders both directions: if Event A links to Faction B, the Faction B page shows Event A under "Linked By" even if Faction B's `crossModuleLinks` doesn't contain Event A.

The name `crossModuleLinks` is deliberately verbose to avoid confusion with module-specific relationship fields like `connections` (location-to-location), `prerequisites` (tech-to-tech), `allies`/`enemies` (faction-to-faction), or `parentFaction`/`parent` (hierarchical). Those fields carry domain-specific semantics; `crossModuleLinks` is the generic "this thing references that thing" mechanism.

---

## Module 0: Overview

The overview is the universe's front page — a freeform space for setting the tone, describing the world's premise, recording high-level notes, and anything else that doesn't belong in a structured module. It's intentionally loose: just a title, a body, and a handful of metadata fields.

Unlike the other modules, the overview stores a single document rather than a collection of entities. There's no `crossModuleLinks` field — the overview sits above the entity layer.

### Data Shapes

#### Overview
```json
{
  "title": "string",
  "subtitle": "string",
  "body": "string",
  "notes": "string",
  "tags": ["string"]
}
```

Field notes:
- `title` — the name of the universe (e.g., "The Example Cycle"). Displayed prominently on the overview page. This is distinct from the `WorldName` SAM parameter, which is a short slug for infrastructure naming; this is the human-readable, stylized title.
- `subtitle` — optional tagline or elevator pitch (e.g., "A hard-SF universe of warp drives and galactic cold wars").
- `body` — the main content. Long-form, freeform text. This is where the universe's premise, tone, ground rules, and big-picture lore live. Can be as short or as long as needed.
- `notes` — scratchpad for author-facing notes that aren't part of the lore itself (e.g., "Need to figure out the economics of interstellar trade" or "Remember: no FTL communications"). Optional.
- `tags` — short descriptive labels for the universe (e.g., "hard-sf", "space-opera", "grimdark-fantasy"). Used for the author's own organization if they have multiple worlds.

### Endpoints

#### `GET /overview`

Returns the overview document.

**Response 200:**
```json
{
  "overview": {
    "title": "The Example Cycle",
    "subtitle": "...",
    "body": "...",
    "notes": "...",
    "tags": ["hard-sf", "space-opera"]
  },
  "updatedAt": "2026-04-22T14:30:00Z",
  "version": 1
}
```

**Response 404:** no overview data yet. Frontend shows a welcome/setup prompt.

#### `PUT /overview`

**Request body:**
```json
{
  "overview": {
    "title": "The Example Cycle",
    "subtitle": "...",
    "body": "...",
    "notes": "...",
    "tags": ["hard-sf", "space-opera"]
  },
  "expectedVersion": 1
}
```

**Response 200:**
```json
{
  "success": true,
  "updatedAt": "2026-04-22T14:31:00Z",
  "version": 2
}
```

**Response 400 / 409 / 500:** standard error shapes.

### DynamoDB Schema

| Property | Value |
|---|---|
| Table name | `codex-{world}-overview` |
| Partition key | `pk` (String) |
| Sort key | (none) |
| Billing mode | `PAY_PER_REQUEST` |

Single item: `pk = "default"`. Attributes: `overview` (M — a Map, not a List, since this is a single document rather than a collection), `version` (N), `updatedAt` (S).

---

## Module 1: Timeline

### Data Shapes

#### Event
```json
{
  "id": "string (uid)",
  "year": 2045,
  "sortOrder": 0,
  "title": "string",
  "summary": "string",
  "detail": "string",
  "category": "political | technology | military | exploration | science | cultural",
  "faction": "faction-id | null",
  "crossModuleLinks": [{ "type": "string", "id": "string" }]
}
```

Field notes:
- `category` — hardcoded enum. Categories are a UI/filtering concern, not a lore entity.
- `faction` — nullable faction ID referencing an entity in the Factions module. `null` for unaligned events (replaces the old `"neutral"` enum value).

#### Era
```json
{
  "id": "string (uid)",
  "startYear": 2000,
  "endYear": 2060,
  "label": "string",
  "color": "#RRGGBB",
  "track": 0,
  "kind": "in-system | transit | stasis"
}
```

`track` is optional. If omitted, the frontend assigns a track based on overlap detection.

`kind` is optional, defaults to `"in-system"`. It exists so worlds with stasis travel (e.g. generation ships) can distinguish periods where the crew is unconscious from periods where they are active. The frontend uses `kind === "stasis"` to derive a second "crew time" axis: events inside a stasis era are pinned to that era's start when displayed on the crew-time axis, while their ship-time position is unchanged. Eras with other `kind` values are treated identically to `"in-system"` for time math — `"transit"` exists as a labeling convenience for sublight cruise where the crew is awake.

### Frontend configuration

`VITE_TIME_UNIT` (env var, default `"Year"`) — singular label for the time axis used in event forms and legends. Set per-world (e.g. `"Mission Day"` for a generation ship). Not part of the API contract; the wire field stays `year`.

### Endpoints

#### `GET /timeline`

**Response 200:**
```json
{
  "events": [ /* Event[] */ ],
  "eras": [ /* Era[] */ ],
  "updatedAt": "2026-04-20T14:30:00Z",
  "version": 1
}
```

**Response 404:** no timeline data yet. Frontend treats as empty dataset.

#### `PUT /timeline`

**Request body:**
```json
{
  "events": [ /* Event[] */ ],
  "eras": [ /* Era[] */ ],
  "expectedVersion": 1
}
```

**Response 200:**
```json
{
  "success": true,
  "updatedAt": "2026-04-20T14:31:00Z",
  "version": 2
}
```

**Response 400 / 409 / 500:** standard error shapes.

### DynamoDB Schema

| Property | Value |
|---|---|
| Table name | `codex-{world}-timeline` |
| Partition key | `pk` (String) |
| Sort key | (none) |
| Billing mode | `PAY_PER_REQUEST` |

Single item: `pk = "default"`. Attributes: `events` (L), `eras` (L), `version` (N), `updatedAt` (S).

Concurrency control:
```
ConditionExpression: "attribute_not_exists(pk) OR version = :expectedVersion"
```

---

## Module 2: Species

### Data Shapes

#### Species
```json
{
  "id": "string (uid)",
  "name": "string",
  "classification": "string",
  "homeworld": "string",
  "physiology": "string",
  "culture": "string",
  "history": "string",
  "traits": ["string"],
  "status": "extant | endangered | extinct | unknown",
  "crossModuleLinks": [{ "type": "string", "id": "string" }]
}
```

Field notes:
- `classification` — free-text taxonomic description (e.g., "Carbon-based bipedal mammalian"). No enforced taxonomy.
- `homeworld` — free-text name. Cross-link to a location via `crossModuleLinks` for the structured connection.
- `physiology`, `culture`, `history` — long-form lore fields. All optional.
- `traits` — short descriptive tags (e.g., "telepathic", "silicon-based", "hive-mind"). Used for filtering and at-a-glance display.
- `status` — species-level status in the universe's "present day."

### Endpoints

#### `GET /species`

**Response 200:**
```json
{
  "species": [ /* Species[] */ ],
  "updatedAt": "2026-04-20T14:30:00Z",
  "version": 1
}
```

**Response 404 / 500:** standard error shapes.

#### `PUT /species`

**Request body:**
```json
{
  "species": [ /* Species[] */ ],
  "expectedVersion": 1
}
```

**Response 200:**
```json
{
  "success": true,
  "updatedAt": "2026-04-20T14:31:00Z",
  "version": 2
}
```

**Response 400 / 409 / 500:** standard error shapes.

### DynamoDB Schema

| Property | Value |
|---|---|
| Table name | `codex-{world}-species` |
| Partition key | `pk` (String) |
| Sort key | (none) |
| Billing mode | `PAY_PER_REQUEST` |

Single item: `pk = "default"`. Attributes: `species` (L), `version` (N), `updatedAt` (S).

---

## Module 3: Factions

### Data Shapes

#### Faction
```json
{
  "id": "string (uid)",
  "name": "string",
  "shortName": "string",
  "color": "#RRGGBB",
  "type": "government | corporation | military | religious | insurgent | criminal | other",
  "motto": "string",
  "description": "string",
  "history": "string",
  "territory": "string",
  "leadership": "string",
  "species": ["species-id"],
  "status": "active | dissolved | underground | unknown",
  "parentFaction": "faction-id | null",
  "allies": ["faction-id"],
  "enemies": ["faction-id"],
  "crossModuleLinks": [{ "type": "string", "id": "string" }]
}
```

Field notes:
- `shortName` — abbreviation for compact display (e.g., "UEG" for "United Earth Government").
- `color` — used for UI theming, timeline era coloring, and location display.
- `type` — broad organizational category. `other` as escape hatch.
- `motto`, `description`, `history`, `territory`, `leadership` — long-form lore fields. All optional.
- `species` — optional multi-select list of species IDs. A faction can be multi-species or empty.
- `parentFaction` — nullable faction ID for hierarchical relationships (e.g., a military branch under a government).
- `allies` / `enemies` — arrays of faction IDs. One-directional in data; the frontend shows the relationship on both sides. Asymmetric relationships (A considers B an ally, B considers A an enemy) are valid.
- `status` — current state in the universe's present day.

### Endpoints

#### `GET /factions`

**Response 200:**
```json
{
  "factions": [ /* Faction[] */ ],
  "updatedAt": "2026-04-20T14:30:00Z",
  "version": 1
}
```

**Response 404 / 500:** standard error shapes.

#### `PUT /factions`

**Request body:**
```json
{
  "factions": [ /* Faction[] */ ],
  "expectedVersion": 1
}
```

**Response 200:**
```json
{
  "success": true,
  "updatedAt": "2026-04-20T14:31:00Z",
  "version": 2
}
```

**Response 400 / 409 / 500:** standard error shapes.

### DynamoDB Schema

| Property | Value |
|---|---|
| Table name | `codex-{world}-factions` |
| Partition key | `pk` (String) |
| Sort key | (none) |
| Billing mode | `PAY_PER_REQUEST` |

Single item: `pk = "default"`. Attributes: `factions` (L), `version` (N), `updatedAt` (S).

---

## Module 4: Technology

### Data Shapes

#### Technology
```json
{
  "id": "string (uid)",
  "name": "string",
  "category": "propulsion | weapons | energy | computing | biotech | materials | communications | other",
  "tier": "string",
  "inventor": "string",
  "yearInvented": 2045,
  "yearObsoleted": null,
  "summary": "string",
  "principles": "string",
  "limitations": "string",
  "impact": "string",
  "status": "theoretical | experimental | operational | widespread | obsolete | lost",
  "prerequisites": ["tech-id"],
  "crossModuleLinks": [{ "type": "string", "id": "string" }]
}
```

Field notes:
- `category` — broad classification. `other` as escape hatch.
- `tier` — free-text maturity/advancement label (e.g., "Tier 3 — Interstellar"). Not enforced as an enum because tier systems vary by universe.
- `inventor` — free-text. Cross-link to the inventing faction/species via `crossModuleLinks`.
- `yearInvented` / `yearObsoleted` — nullable integers. Let the frontend place tech on the timeline and filter by era.
- `principles`, `limitations`, `impact` — long-form lore fields. All optional.
- `status` — current availability in the universe.
- `prerequisites` — direct tech-to-tech dependency chain (e.g., "you need Steam Power before you can build a Locomotive"). The frontend renders this as a tech tree with dependency arrows. This is distinct from `crossModuleLinks` with `{ type: "tech" }`, which represents adjacency/relatedness without dependency (e.g., power steering and antilock brakes are related but neither requires the other).

### Endpoints

#### `GET /technology`

**Response 200:**
```json
{
  "technology": [ /* Technology[] */ ],
  "updatedAt": "2026-04-20T14:30:00Z",
  "version": 1
}
```

**Response 404 / 500:** standard error shapes.

#### `PUT /technology`

**Request body:**
```json
{
  "technology": [ /* Technology[] */ ],
  "expectedVersion": 1
}
```

**Response 200:**
```json
{
  "success": true,
  "updatedAt": "2026-04-20T14:31:00Z",
  "version": 2
}
```

**Response 400 / 409 / 500:** standard error shapes.

### DynamoDB Schema

| Property | Value |
|---|---|
| Table name | `codex-{world}-technology` |
| Partition key | `pk` (String) |
| Sort key | (none) |
| Billing mode | `PAY_PER_REQUEST` |

Single item: `pk = "default"`. Attributes: `technology` (L), `version` (N), `updatedAt` (S).

---

## Module 5: Locations

The locations module stores places in the universe — star systems, planets, stations, cities, regions, or anything that has a "where." Locations can be connected to each other to represent transit routes, adjacency, or other spatial relationships, but the module is a text-and-data catalog, not a visual map editor.

A future version of the frontend may render connections as a node graph, but the data model doesn't assume any visual layout. There are no coordinates.

### Data Shapes

#### Location
```json
{
  "id": "string (uid)",
  "name": "string",
  "type": "star-system | planet | moon | station | city | region | other",
  "parent": "location-id | null",
  "description": "string",
  "properties": "string",
  "history": "string",
  "status": "inhabited | uninhabited | contested | destroyed | unknown",
  "tags": ["string"],
  "connections": [
    {
      "to": "location-id",
      "label": "string",
      "connectionType": "warp-lane | trade-route | political-border | orbit | hyperspace | other",
      "distance": "string (optional)",
      "travelTime": "string (optional)",
      "detail": "string"
    }
  ],
  "crossModuleLinks": [{ "type": "string", "id": "string" }]
}
```

Field notes:
- `type` — what kind of place this is. `other` as escape hatch.
- `parent` — nullable location ID for hierarchical containment (e.g., a planet's parent is its star system, a city's parent is its planet). Distinct from `connections`, which represent lateral/transit relationships.
- `description` — long-form description of the location.
- `properties` — physical or notable characteristics (e.g., "Class M atmosphere, 1.1g gravity, 23-hour day"). Free-text because what matters varies by location type.
- `history` — long-form historical notes. Optional.
- `status` — current state in the universe's present day.
- `tags` — short descriptive labels (e.g., "capital", "mining colony", "contested"). Used for filtering.
- `connections` — transit/adjacency relationships to other locations. Directional in data, rendered bidirectionally by the frontend. Fields:
  - `to` — target location ID.
  - `label` — name of the route/connection (e.g., "Sol–Centauri Corridor").
  - `connectionType` — lets the frontend group or style connections differently.
  - `distance` — optional free-text (e.g., "4.37 ly", "200 km"). Free-text because units vary.
  - `travelTime` — optional free-text (e.g., "14 days at standard warp", "3 hours by shuttle").
  - `detail` — optional flavor text.
- `crossModuleLinks` — generic cross-module references (to events, factions, species, tech). Separate from `connections`, which are specifically location-to-location spatial relationships.

### Endpoints

#### `GET /locations`

**Response 200:**
```json
{
  "locations": [ /* Location[] */ ],
  "updatedAt": "2026-04-20T14:30:00Z",
  "version": 1
}
```

**Response 404 / 500:** standard error shapes.

#### `PUT /locations`

**Request body:**
```json
{
  "locations": [ /* Location[] */ ],
  "expectedVersion": 1
}
```

**Response 200:**
```json
{
  "success": true,
  "updatedAt": "2026-04-20T14:31:00Z",
  "version": 2
}
```

**Response 400 / 409 / 500:** standard error shapes.

### DynamoDB Schema

| Property | Value |
|---|---|
| Table name | `codex-{world}-locations` |
| Partition key | `pk` (String) |
| Sort key | (none) |
| Billing mode | `PAY_PER_REQUEST` |

Single item: `pk = "default"`. Attributes: `locations` (L), `version` (N), `updatedAt` (S).

---

## Summary of API Gateway Routes

All routes share one API Gateway resource per stack. The single Lambda function routes internally based on HTTP method and path.

| Method | Path | Table |
|---|---|---|
| `GET` | `/overview` | `codex-{world}-overview` |
| `PUT` | `/overview` | `codex-{world}-overview` |
| `GET` | `/timeline` | `codex-{world}-timeline` |
| `PUT` | `/timeline` | `codex-{world}-timeline` |
| `GET` | `/species` | `codex-{world}-species` |
| `PUT` | `/species` | `codex-{world}-species` |
| `GET` | `/factions` | `codex-{world}-factions` |
| `PUT` | `/factions` | `codex-{world}-factions` |
| `GET` | `/technology` | `codex-{world}-technology` |
| `PUT` | `/technology` | `codex-{world}-technology` |
| `GET` | `/locations` | `codex-{world}-locations` |
| `PUT` | `/locations` | `codex-{world}-locations` |

The Lambda's IAM role needs `dynamodb:GetItem` and `dynamodb:PutItem` permissions on all six tables.

---

## DynamoDB Schema Notes

All six tables follow the same pattern:

- Single item per table, `pk = "default"`.
- `PAY_PER_REQUEST` billing.
- Concurrency control via conditional expression: `attribute_not_exists(pk) OR version = :expectedVersion`.
- On `ConditionalCheckFailedException`, return HTTP 409.
- Point-in-time recovery recommended (~pennies/month at this volume).
- The `{world}` segment in table names is set at deploy time via a SAM parameter (e.g., `WorldName: scifi`), so the Lambda and template are generic — no world-specific code.

**Note:** The overview module stores its data as a single Map attribute (`overview`: M) rather than a List. The Lambda handler should treat the `overview` key the same way it treats `events`, `species`, etc. — it's just the value that goes into and comes out of the PUT/GET. No special handling is needed beyond accepting a Map where other modules accept a List.

### CloudFormation Snippet (Illustrative)

```yaml
Parameters:
  WorldName:
    Type: String
    Description: Short identifier for the world (e.g., scifi, fantasy-west)
    AllowedPattern: '[a-z0-9-]+'

Resources:
  CodexTimelineTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub codex-${WorldName}-timeline
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: pk
          AttributeType: S
      KeySchema:
        - AttributeName: pk
          KeyType: HASH
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: true

  # Repeat for overview, species, factions, technology, locations
```
