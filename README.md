# WorldCodex

A per-world worldbuilding database with a React UI and a serverless AWS
backend. Each world (a setting, a universe, a campaign) gets its own
isolated stack: its own DynamoDB tables, its own subdomain, its own Cognito
pool. The frontend gives you timelines, factions, species, characters,
locations, technology, lore, and stories, all cross-linked.

The repo also ships a Claude Code skill (`worldbuilding-interviewer`) and a
local MCP server (`codex-mcp`) that let Claude read and write your world
directly during a worldbuilding session.

## Architecture

- **Frontend**: React + Vite, deployed as a static bundle to S3 behind CloudFront.
- **Backend**: Python Lambda (AWS Powertools) behind API Gateway.
- **Auth**: Cognito User Pool with Google as the OIDC provider, plus a
  Cognito Identity Pool that vends temporary AWS credentials so the
  browser can sign API requests with SigV4.
- **Storage**: one DynamoDB table per module per world, single-document
  blob model with optimistic concurrency (`expectedVersion`).
- **Infra-as-code**: AWS SAM (`infrastructure/template.yaml`). One stack
  per world.

See [docs/codex-api-contract.md](docs/codex-api-contract.md) for the full
API contract and schema.

## Prerequisites

- AWS account with admin (or close to it) for the initial SAM deploy
- Node 18+
- Python 3.11+
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- A [Google OAuth 2.0 app](https://console.cloud.google.com/apis/credentials) (Client ID + Secret)
- A domain you own + Route53 hosted zone in the same AWS account (only
  needed if you want the custom-domain setup; you can strip those resources
  from the SAM template and use the raw API Gateway URL instead)

## Local dev

```sh
git clone https://github.com/john-moore-levesque/WorldCodex.git
cd WorldCodex
cp .env.example .env
# edit .env with your API URL, Cognito IDs, region
npm install
npm run dev
```

The dev server runs at http://localhost:3000 and points at whatever
`VITE_API_URL` you set. For local development you'll typically point at a
deployed `dev` stack.

## Deploy

### 1. First-time SAM deploy (per world)

```sh
cd infrastructure
cp example.samconfig.toml myworld-samconfig.toml
# edit myworld-samconfig.toml with: WorldName, GoogleClientId,
# GoogleClientSecret, RootDomain, HostedZoneId, CognitoHostedUIDomain,
# ApiDomainName, IsRootWorld
sam build
sam deploy --config-file myworld-samconfig.toml
```

This provisions: DynamoDB tables, Lambda, API Gateway, Cognito User Pool +
Identity Pool, CloudFront distribution, Route53 records, ACM cert.

### 2. Frontend deploys

After the first SAM deploy, populate `.env.myworld` with the outputs (S3
bucket, API URL, Cognito IDs), then:

```sh
./scripts/make-env.sh myworld   # generates .env.myworld if missing
./deploy.sh myworld
```

`deploy.sh` builds with Vite and ships the bundle to that world's S3
bucket, optionally invalidating CloudFront.

## Bundled Claude skill: worldbuilding-interviewer

The repo ships a Claude Code skill at
`.claude/skills/worldbuilding-interviewer/` that turns Claude into a
careful interviewer: it asks one focused question at a time, records
verbatim, flags contradictions, and writes results directly to your Codex
via the bundled MCP server. Open this repo in Claude Code and say "let's
worldbuild" — the skill triggers automatically.

The MCP server lives at `tools/codex-mcp/`. See
[tools/codex-mcp/README.md](tools/codex-mcp/README.md) for setup. Register
one MCP entry per world; each entry is the same server with a different
`CODEX_WORLD` env var.

## Repo layout

```
frontend/        React UI (Vite)
src/             Python Lambda handler
infrastructure/  SAM template + per-world samconfigs
tools/codex-mcp/ Local MCP server for Claude
.claude/skills/  Bundled Claude Code skills
scripts/         Operational scripts (env generation, id repair)
docs/            API contract, OpenAPI-ish JSON schema
tests/           Unit tests for the Lambda handler
```

## License

MIT — see [LICENSE](LICENSE).
