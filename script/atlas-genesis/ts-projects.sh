#!/usr/bin/env bash
# Print every TypeScript project scip-typescript should index for the Atlas genesis run, one per line:
# a directory under packages/, apps/ or modules/ that holds BOTH a tsconfig.json and a package.json (a
# workspace package, not a nested test config). modules/atlas is excluded (Atlas does not mine itself), and
# nothing under native/ is listed. Exits 1 when the list is empty, so the index step cannot run on nothing.
set -euo pipefail

projects=$(
  find packages apps modules -maxdepth 3 -name tsconfig.json -not -path '*/node_modules/*' -print 2>/dev/null |
    while read -r config; do
      dir=$(dirname "$config")
      case "$dir" in
        modules/atlas | modules/atlas/*) continue ;;
      esac
      [ -f "$dir/package.json" ] && echo "$dir"
    done | sort -u
)

if [ -z "$projects" ]; then
  echo "ts-projects: no TypeScript project found under packages/, apps/ or modules/" >&2
  exit 1
fi
echo "$projects"
