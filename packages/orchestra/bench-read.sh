#!/usr/bin/env bash
# Compatibility entry point. Uses correctness-first harness.
set -euo pipefail
exec "$(dirname "$0")/bench-hardcore.sh" "$@"
