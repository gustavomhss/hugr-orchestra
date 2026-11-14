#!/usr/bin/env bash
# Shared fresh-index route: the same pinned tools for index-only recovery and production mining.
set -euo pipefail
[ "${GITHUB_ACTIONS:-}" = true ] || { echo 'fresh-index: use the authorized remote runner' >&2; exit 2; }
: "${OUT:?fresh-index: missing output directory}"
: "${ATLAS_BIN:?fresh-index: missing compiled Atlas CLI}"
mkdir -p .atlas/index.d "$OUT"
list=$(bash script/atlas-genesis/ts-projects.sh)
mapfile -t projects <<< "$list"
[ "${#projects[@]}" -gt 0 ] && [ -n "${projects[0]}" ] || { echo 'fresh-index: empty TypeScript project list' >&2; exit 1; }
NODE_OPTIONS=--max-old-space-size=12288 npx --yes @sourcegraph/scip-typescript@0.4.0 index \
  --cwd . --output .atlas/index.d/ts.scip "${projects[@]}"
python -m venv "$RUNNER_TEMP/relay-venv"
source "$RUNNER_TEMP/relay-venv/bin/activate"
# pip's wheel build writes build/lib below its input directory; keep those generated copies out of
# the source tree the Python indexer walks, without deleting or excluding any tracked source.
cp -R modules/relay/lib/orchestra_relay "$RUNNER_TEMP/relay-package"
pip install "$RUNNER_TEMP/relay-package"
(
  cd modules/relay
  npx --yes @sourcegraph/scip-python@0.6.6 index --project-name orchestra_relay \
    --output "$GITHUB_WORKSPACE/.atlas/index.d/py.scip"
)
(
  cd native/omni
  rustup show active-toolchain
  rustup component add rust-analyzer
  rust-analyzer --version
  rust-analyzer scip . --output "$GITHUB_WORKSPACE/.atlas/index.d/rust.scip"
)
for file in ts.scip py.scip rust.scip; do test -s ".atlas/index.d/$file" || { echo "fresh-index: missing $file" >&2; exit 1; }; done
# scip-python 0.6.6 chooses the relay project root, not lib/ (verified by its emitted document paths).
printf '{ "py.scip": "modules/relay", "rust.scip": "native/omni" }\n' > .atlas/index.d/roots.json
git ls-tree -rz HEAD > "$OUT/source-tree.nul"
node modules/atlas/scripts/genesis-index-scope.mjs .atlas/index.d "$OUT/raw-index" "$OUT/source-tree.nul" "$OUT/index-scope.json"
node "$ATLAS_BIN" doctor index | tee "$OUT/doctor-index.txt"
git diff --no-renames --name-only -z HEAD -- > "$OUT/source-changes.nul"
revision=$(git rev-parse HEAD)
node script/atlas-genesis/index-reuse.mjs "$OUT/source-changes.nul" "$revision" "$OUT/index-source.json"
node script/atlas-genesis/index-reuse.mjs documents "$OUT/source-changes.nul" "$OUT/index-source.json"
node script/atlas-genesis/index-reuse.mjs checkout "$OUT/source-tree.nul" "$OUT/index-source.json"
