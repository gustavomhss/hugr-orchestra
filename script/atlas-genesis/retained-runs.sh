#!/usr/bin/env bash
# CI-only provenance preparation. Candidate integrity/grounding and atomic union stay in the real importer.
set -euo pipefail
[ "${GITHUB_ACTIONS:-}" = true ] || { echo 'retained-runs: use the authorized remote runner' >&2; exit 2; }
: "${OUT:?retained-runs: missing output directory}"
mkdir -p "$OUT/retained-sources"
node --input-type=module <<'NODE'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
const text = process.env.RETAINED_RUNS ?? ''
const runs = text === '' ? [] : text.split(',')
assert(runs.length <= 4 && new Set(runs).size === runs.length && runs.every(id => /^[1-9][0-9]*$/.test(id)), 'retained-runs: expected at most four distinct comma-separated run IDs')
assert(!runs.includes(process.env.SOURCE_RUN), 'retained-runs: primary replay run is already restored')
writeFileSync(process.env.OUT + '/retained-run-ids.json', JSON.stringify(runs), {flag: 'wx'})
NODE
while IFS= read -r run; do
  root="$OUT/retained-sources/$run"
  mkdir -p "$root"
  gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run" > "$root/run.json"
  revision=$(node --input-type=module - "$root/run.json" <<'NODE'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const run = JSON.parse(readFileSync(process.argv[2]))
assert(run.head_repository?.full_name === process.env.GITHUB_REPOSITORY, 'retained-runs: foreign source repository')
assert(run.path?.split('@')[0] === '.github/workflows/atlas-genesis.yml', 'retained-runs: wrong source workflow')
assert(/^[0-9a-f]{40}$/.test(run.head_sha), 'retained-runs: missing immutable source revision')
console.log(run.head_sha)
NODE
  )
  git cat-file -e "$revision^{commit}"
  git merge-base --is-ancestor "$revision" HEAD
  git diff --no-renames --name-only -z "$revision" HEAD -- > "$root/source-changes.nul"
  node script/atlas-genesis/index-reuse.mjs "$root/source-changes.nul" "$revision" "$root/index-reuse.json"
  gh run download "$run" -R "$GITHUB_REPOSITORY" -n atlas-genesis-mine -D "$root/artifact"
done < <(node -e 'for (const id of JSON.parse(require("node:fs").readFileSync(process.env.OUT+"/retained-run-ids.json"))) console.log(id)')
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'
const runs = JSON.parse(readFileSync(process.env.OUT + '/retained-run-ids.json'))
const sources = runs.map(id => ({
  artifactRoot: `${process.env.OUT}/retained-sources/${id}/artifact`,
  sourceRevision: JSON.parse(readFileSync(`${process.env.OUT}/retained-sources/${id}/run.json`)).head_sha,
}))
writeFileSync(process.env.OUT + '/retained-import-sources.json', JSON.stringify(sources), {flag: 'wx'})
NODE
