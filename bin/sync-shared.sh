#!/bin/bash
# Backward-compatible wrapper: delegates to scripts/sync-shared.mjs (D-02).
set -euo pipefail

exec node "$(dirname "$0")/../scripts/sync-shared.mjs" "$@"
