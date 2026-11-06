#!/usr/bin/env bash
# Quality gates for the backend. CI runs exactly this; run it locally too.
#
#   scripts/ci/python-checks.sh [unit|audit|all]
#
#   unit   lock check, ruff lint, ruff format check, pyright strict, pytest with
#          the coverage floor from [tool.coverage.report] (default)
#   audit  known-vulnerability scan of the locked runtime dependencies
#   all    unit, then audit
#
# ruff, pyright and pytest come from backend/uv.lock, so this script, `make check`
# and the git hooks always run the same versions. pip-audit is pinned here.

set -euo pipefail

PIP_AUDIT_VERSION="2.10.0"

# Advisories with no fix we can install yet. Each entry says why and when to
# re-check; remove it as soon as the blocker is gone.
#
# filelock < 4.0 is pinned by litellm (pulled in by opik for evaluation), and
# every fix is in filelock 4.x. Re-check when litellm drops `filelock<4.0`.
# Recorded 2026-11-06.
AUDIT_IGNORES=(
  CVE-2026-112907 CVE-2026-112908 CVE-2026-112909 CVE-2026-112910
  CVE-2026-112911 CVE-2026-112912 CVE-2026-112913 CVE-2026-112915
  CVE-2026-112935 CVE-2026-112936 CVE-2026-112938 CVE-2026-112939
  CVE-2026-112940
)

gate="${1:-unit}"

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root/backend"

step() { printf '\n==> backend: %s\n' "$1"; }

unit() {
  step "install (locked)"
  uv sync --locked --quiet
  step "ruff check"
  uv run --locked ruff check src tests main.py
  step "ruff format --check"
  uv run --locked ruff format --check src tests main.py
  step "pyright (strict)"
  uv run --locked pyright
  step "pytest (with coverage floor)"
  uv run --locked pytest -q --cov --cov-report=term
}

audit() {
  step "pip-audit (locked runtime dependencies)"
  local requirements
  requirements="$(mktemp)"
  # Runtime dependencies only: what ships in the image.
  uv export --locked --no-dev --no-emit-project --no-hashes --quiet \
    | grep -v -E '^(-e |\.|/)' >"$requirements"
  local ignore_args=()
  for id in "${AUDIT_IGNORES[@]}"; do
    ignore_args+=(--ignore-vuln "$id")
  done
  uvx "pip-audit@$PIP_AUDIT_VERSION" --strict --disable-pip --no-deps \
    ${ignore_args[@]+"${ignore_args[@]}"} -r "$requirements"
  rm -f "$requirements"
}

case "$gate" in
  unit) unit ;;
  audit) audit ;;
  # Sequential, not `unit && audit`: bash ignores `set -e` inside a function that is
  # part of an && list, so a failing step would not stop the run.
  all)
    unit
    audit
    ;;
  *)
    echo "unknown gate: $gate (expected unit, audit or all)" >&2
    exit 2
    ;;
esac
