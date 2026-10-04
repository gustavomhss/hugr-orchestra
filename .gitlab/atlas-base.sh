#!/usr/bin/env bash
set -euo pipefail

base=${CI_COMMIT_SHA:?Missing CI_COMMIT_SHA}
if [[ ${CI_PIPELINE_SOURCE:?Missing CI_PIPELINE_SOURCE} == merge_request_event ]]; then
  git fetch origin "${CI_MERGE_REQUEST_TARGET_BRANCH_NAME:?Missing MR target branch}"
  base=$(git rev-parse --verify FETCH_HEAD)
fi
# A missing commit is an error, not evidence that Atlas was absent at the base.
git cat-file -e "$base^{commit}"
if tree=$(git rev-parse --verify "$base:foundation/atlas"); then
  test "$(git cat-file -t "$tree")" = tree
else
  tree=$(git mktree </dev/null)
fi
EARS_COAMEND_BASE=$(git commit-tree "$tree" -m "Atlas CI baseline")
export EARS_COAMEND_BASE
