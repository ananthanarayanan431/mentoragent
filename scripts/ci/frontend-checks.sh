#!/usr/bin/env bash
# Quality gates for the frontend. CI runs exactly this; run it locally too.
#
#   scripts/ci/frontend-checks.sh [unit|audit|all]
#
#   unit   clean install, prettier check, oxlint, tsc, vitest, production build (default)
#   audit  npm audit of production dependencies, high severity and above
#   all    unit, then audit

set -euo pipefail

gate="${1:-unit}"

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root/frontend"

step() { printf '\n==> frontend: %s\n' "$1"; }

unit() {
  step "install (locked)"
  # `ci` installs exactly what package-lock.json pins and fails if it is stale.
  npm ci --no-audit --no-fund
  step "prettier --check"
  npm run --silent format:check
  step "oxlint"
  npm run --silent lint
  step "tsc"
  npm run --silent typecheck
  step "vitest"
  npm test -- --run
  step "build"
  npm run --silent build
}

audit() {
  step "npm audit (production, high and above)"
  npm audit --omit=dev --audit-level=high
}

case "$gate" in
  unit) unit ;;
  audit) audit ;;
  all)
    unit
    audit
    ;;
  *)
    echo "unknown gate: $gate (expected unit, audit or all)" >&2
    exit 2
    ;;
esac
