#!/usr/bin/env bash
set -euo pipefail

# ─── Usage ───────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $0 <world>

Builds the frontend for <world> and deploys it to that world's S3 bucket
(and optionally invalidates its CloudFront distribution).

Arguments:
  <world>   World name. Must match an existing .env.<world> file at the
            repo root (e.g. .env.myworld).

Examples:
  $0 myworld

Required env (loaded from .env then .env.<world>, the latter wins):
  DEPLOY_BUCKET                    S3 bucket for this world's frontend
  VITE_API_URL                     API Gateway URL for this world
  VITE_AWS_REGION                  AWS region
  VITE_COGNITO_IDENTITY_POOL_ID    Cognito identity pool
  VITE_COGNITO_USER_POOL_ID        Cognito user pool
  VITE_COGNITO_CLIENT_ID           Cognito app client
  VITE_COGNITO_DOMAIN              Cognito hosted UI domain

Optional env:
  DEPLOY_CLOUDFRONT_ID             If set, invalidate /index.html after upload
  VITE_TIME_UNIT                   Timeline time-axis label (default "Year").
                                   Set per-world, e.g. "Mission Day" for a
                                   generation-ship setting.

Notes:
  - This script only deploys the frontend bundle. Backend (SAM) deploys are
    handled separately and are not required for frontend-only changes.
  - Run ./scripts/make-env.sh <world> if .env.<world> doesn't exist yet.
EOF
}

if [[ $# -lt 1 ]] || [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  usage
  [[ $# -lt 1 ]] && exit 1 || exit 0
fi
WORLD="$1"

# ─── Load .env then .env.<world> (mode overrides base) ───────
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_ENV="${REPO_DIR}/.env"
MODE_ENV="${REPO_DIR}/.env.${WORLD}"

if [[ ! -f "$MODE_ENV" ]]; then
  echo "ERROR: $MODE_ENV not found. Run ./scripts/make-env.sh $WORLD to generate it." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
[[ -f "$BASE_ENV" ]] && source "$BASE_ENV"
# shellcheck disable=SC1090
source "$MODE_ENV"
set +a

# ─── Validate required vars ───────────────────────────────────
: "${DEPLOY_BUCKET:?Set DEPLOY_BUCKET in .env.${WORLD}}"
: "${VITE_API_URL:?Set VITE_API_URL in .env.${WORLD}}"
: "${VITE_AWS_REGION:?Set VITE_AWS_REGION in .env or .env.${WORLD}}"
: "${VITE_COGNITO_IDENTITY_POOL_ID:?Set VITE_COGNITO_IDENTITY_POOL_ID}"
: "${VITE_COGNITO_USER_POOL_ID:?Set VITE_COGNITO_USER_POOL_ID}"
: "${VITE_COGNITO_CLIENT_ID:?Set VITE_COGNITO_CLIENT_ID}"
: "${VITE_COGNITO_DOMAIN:?Set VITE_COGNITO_DOMAIN}"

# ─── Build ────────────────────────────────────────────────────
echo "▶ Building ${WORLD}..."
npm run build -- --mode "$WORLD"

# ─── Upload to S3 ────────────────────────────────────────────
# index.html — no cache (so browsers always fetch the latest entry point)
echo "▶ Uploading index.html to s3://${DEPLOY_BUCKET}..."
aws s3 cp dist/index.html "s3://${DEPLOY_BUCKET}/index.html" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

# Hashed assets (JS/CSS) — cache forever (filenames change on rebuild)
echo "▶ Syncing assets..."
aws s3 sync dist/assets "s3://${DEPLOY_BUCKET}/assets" \
  --cache-control "max-age=31536000, immutable" \
  --delete

# ─── CloudFront invalidation (optional) ──────────────────────
if [[ -n "${DEPLOY_CLOUDFRONT_ID:-}" ]]; then
  echo "▶ Invalidating CloudFront distribution ${DEPLOY_CLOUDFRONT_ID}..."
  aws cloudfront create-invalidation \
    --distribution-id "$DEPLOY_CLOUDFRONT_ID" \
    --paths "/index.html"
fi

echo "✓ Deployed ${WORLD} to s3://${DEPLOY_BUCKET}"
