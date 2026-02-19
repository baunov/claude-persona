#!/usr/bin/env bash
# Install claude-persona from the local repo for testing.
# Usage: ./scripts/local-install.sh [--global|--project] [--persona <name>]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Building from $REPO_ROOT ..."
npm run build --prefix "$REPO_ROOT"

echo "Running: claude-persona init $*"
node "$REPO_ROOT/dist/cli/index.js" init "$@"
