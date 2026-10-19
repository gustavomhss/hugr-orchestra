#!/usr/bin/env bash
# Run one Atlas UI build task with an opencode executor model, in its lane's worktree.
# Usage: specs/atlas-ui/build/run-task.sh <ID>
set -euo pipefail

id="$1"
here="$(cd "$(dirname "$0")" && pwd)"
brief="$here/tasks/$id.md"
[ -f "$brief" ] || { echo "no brief: $brief" >&2; exit 1; }

model="$(sed -n 's/^Model: `\([^`]*\)`.*/\1/p' "$brief" | head -1)"
lane="$(sed -n 's/^Lane: \([A-Za-z-]*\).*/\1/p' "$brief" | head -1 | tr '[:upper:]' '[:lower:]')"
[ -n "$model" ] && [ -n "$lane" ] || { echo "brief needs Model: and Lane: lines" >&2; exit 1; }

root="$(git -C "$here" rev-parse --show-toplevel)"
main="$(git -C "$root" worktree list --porcelain | sed -n '1s/^worktree //p')"
tree="$main/.claude/worktrees/atlas-build-$lane"
branch="atlas-build-$lane"
if [ ! -d "$tree" ]; then
  git -C "$root" worktree add "$tree" -b "$branch" atlas-ui-study 2>/dev/null || git -C "$root" worktree add "$tree" "$branch"
fi

mkdir -p "$here/runs"
prompt="$(cat "$here/README.md" | sed -n '/^## Worker contract/,$p')

$(cat "$brief")"
~/.opencode/bin/opencode run -m "$model" --variant max --dir "$tree" --title "atlas-$id" "$prompt" < /dev/null \
  > "$here/runs/$id.out" 2> "$here/runs/$id.err"
echo "$id done in $tree; answer: $here/runs/$id.out"
