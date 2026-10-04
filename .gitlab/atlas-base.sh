#!/usr/bin/env bash
set -euo pipefail

base=$(node "$(dirname "${BASH_SOURCE[0]}")/base.mjs" atlas)
# A missing commit is an error, not evidence that Atlas was absent at the base.
git cat-file -e "$base^{commit}"
if tree=$(git rev-parse --verify "$base:foundation/atlas"); then
  test "$(git cat-file -t "$tree")" = tree
else
  tree=$(git mktree </dev/null)
fi
EARS_COAMEND_BASE=$(git commit-tree "$tree" -m "Atlas CI baseline")
export EARS_COAMEND_BASE
