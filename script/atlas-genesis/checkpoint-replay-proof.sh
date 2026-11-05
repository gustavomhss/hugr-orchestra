#!/usr/bin/env bash
# Dispatch-only offline proof; source selection is validated before any source-specific remote read.
set -euo pipefail
[[ "${SOURCE_RUN:-}" =~ ^[1-9][0-9]*$ ]] || { echo 'checkpoint replay: invalid source run' >&2; exit 2; }
input="$RUNNER_TEMP/atlas-exact-replay-input"
source="$RUNNER_TEMP/atlas-exact-replay-source"
mkdir -m 700 "$input"
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN" > "$input/run.json"
revision=$(node -e 'const r=JSON.parse(require("node:fs").readFileSync(process.argv[1])); if(r.conclusion!=="failure" || !/^[0-9a-f]{40}$/.test(r.head_sha) || !Number.isSafeInteger(r.run_attempt) || r.run_attempt<1) throw Error("invalid failed source run"); console.log(r.head_sha)' "$input/run.json")
# Exact compiled inputs; only repo-only orchestration/documentation may differ from the producer.
git diff --exit-code "$revision" HEAD -- . ':!script/atlas-genesis/**' ':!modules/atlas/docs/**' ':!docs/guides/atlas-genesis.md' ':!.github/workflows/atlas-genesis.yml'
git worktree add --detach "$source" "$revision"
gh run download "$SOURCE_RUN" -R "$GITHUB_REPOSITORY" -n atlas-genesis-index -D "$source/.atlas/index.d"
gh run download "$SOURCE_RUN" -R "$GITHUB_REPOSITORY" -n atlas-genesis-mine -D "$input/artifact"
# One archive read instead of hundreds of REST blob reads. Never extract arbitrary tar member paths.
gh api "repos/$GITHUB_REPOSITORY/tarball/genesis-checkpoints" > "$input/checkpoints.tar.gz"
python3 - "$input" "$SOURCE_RUN" <<'PY'
import gzip,json,sys,tarfile
from pathlib import Path
root=Path(sys.argv[1]);run=sys.argv[2];metadata=json.loads((root/'run.json').read_text())
prefix=f'/runs/{run}-{metadata["run_attempt"]}/production/'
out=root/'envelopes';out.mkdir(mode=0o700)
with tarfile.open(root/'checkpoints.tar.gz','r:gz') as archive:
    members=sorted([m for m in archive.getmembers() if prefix in m.name],key=lambda m:m.name)
    assert members,'checkpoint replay: missing production envelopes'
    for index,member in enumerate(members,1):
        assert member.isfile() and member.size<=20*1024*1024 and Path(member.name).name==f'{index:08}.json.gz'
        (out/Path(member.name).name).write_bytes(archive.extractfile(member).read())
first=json.loads(gzip.decompress((out/'00000001.json.gz').read_bytes()))
identity=first['identity']
assert str(identity['run'])==run and str(identity['attempt'])==str(metadata['run_attempt']) and identity['revision']==metadata['head_sha'] and identity['mode']=='production'
(root/'identity.json').write_text(json.dumps(identity)+'\n')
PY
mkdir -m 700 "$input/home"
# Calibrate the network oracle on this real runner, then delegate isolation to the kernel, not a JS scanner.
ip -json route show > "$input/network-positive.json"
sudo -n unshare --net -- ip -json route show > "$input/network-isolated.json"
node - "$input" <<'NODE'
const assert=require('node:assert/strict'),fs=require('node:fs'),root=process.argv[2]
assert(JSON.parse(fs.readFileSync(root+'/network-positive.json')).length>0,'positive network oracle is empty')
assert.equal(JSON.parse(fs.readFileSync(root+'/network-isolated.json')).length,0,'isolated namespace has external routes')
NODE
sudo -n unshare --net -- setpriv --reuid="$(id -u)" --regid="$(id -g)" --clear-groups --no-new-privs \
  env -i PATH="$PATH" HOME="$input/home" \
  timeout 900 node "$GITHUB_WORKSPACE/script/atlas-genesis/checkpoint-replay-control.mjs" \
  "$input/envelopes" "$input/identity.json" "$source" "$input/artifact" "$OUT/exact-replay"
cp "$input/network-positive.json" "$input/network-isolated.json" "$OUT/exact-replay/"
