#!/usr/bin/env bash
# Run a sequence of tasks in one lane, in order. After each task that ends with `RESULT: DONE`, commit its changes in the
# lane worktree so the next task builds on them. Stop the lane at the first task that does not.
# Usage: specs/atlas-ui/build/run-lane.sh <ID> [<ID>...]
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
for id in "$@"; do
  "$here/run-task.sh" "$id" || { echo "LANE STOP $id: runner failed"; exit 1; }
  out="$here/runs/$id.out"
  if ! tail -5 "$out" | grep -q 'RESULT: DONE'; then
    echo "LANE STOP $id: $(tail -5 "$out" | grep -o 'RESULT:.*' || echo 'no RESULT line')"
    exit 1
  fi
  lane="$(sed -n 's/^Lane: \([A-Za-z-]*\).*/\1/p' "$here/tasks/$id.md" | head -1 | tr '[:upper:]' '[:lower:]')"
  main="$(git -C "$here" worktree list --porcelain | sed -n '1s/^worktree //p')"
  tree="$main/.claude/worktrees/atlas-build-$lane"
  title="$(head -1 "$here/tasks/$id.md" | sed 's/^# [^·]*· //')"
  git -C "$tree" add -A
  # Executors sometimes leave shell heredoc ends or tool-call markup inside source files; refuse those commits.
  junk="$(git -C "$tree" diff --cached --name-only | grep -v '\.\(md\|sh\)$' | (cd "$tree" && xargs -r grep -lE '^(PY|EOF|echo (done|written))$|<\|start\|>|rfl:parameter|</write>' 2>/dev/null))"
  if [ -n "$junk" ]; then
    echo "LANE STOP $id: leftover shell or tool markup in: $junk"
    exit 1
  fi
  git -C "$tree" commit -q -m "chore(atlas): $id $title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || echo "$id: nothing to commit"
  echo "LANE OK $id"
done
echo "LANE SEGMENT DONE"
