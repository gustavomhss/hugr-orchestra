#!/usr/bin/env bash
# Dispatch-only offline proof; source selection is validated before any source-specific remote read.
set -euo pipefail
[[ "${SOURCE_RUN:-}" =~ ^[1-9][0-9]*$ ]] || { echo 'checkpoint replay: invalid source run' >&2; exit 2; }
receipt="${BASH_SOURCE[0]%/*}/checkpoint-replay-source.json"
case "${CONTINUATION_CONTROL:-0}" in 0|1) ;; *) exit 2 ;; esac
helper=checkpoint-replay-control.mjs
audit=checkpoint-replay-audit.mjs
deadline=900
if [ "${CONTINUATION_CONTROL:-0}" = 1 ]; then
  helper=checkpoint-continuation-compiled-control.mjs
  audit=checkpoint-continuation-compiled-audit.mjs
  deadline=1200
fi
node - "$receipt" "$SOURCE_RUN" "$GITHUB_REPOSITORY" <<'NODE'
const assert=require('node:assert/strict'),fs=require('node:fs'),f=JSON.parse(fs.readFileSync(process.argv[2]))
assert.equal(process.argv[3],f.identity.run,'unsupported replay source')
assert.equal(process.argv[4],f.repository,'unexpected replay repository')
NODE
sandbox=$(mktemp -d /tmp/atlas-exact-replay.XXXXXXXX)
chmod 711 "$sandbox" # Traversal only: the restricted UID cannot list or replace runner-owned siblings.
input="$sandbox/input"
source="$sandbox/atlas-exact-replay-source"
work_output="$sandbox/output"
trusted="$sandbox/trusted"
mkdir -m 700 "$input"
mkdir -m 755 "$trusted"
git show HEAD:script/atlas-genesis/checkpoint-replay-collect.mjs > "$trusted/collect.mjs"
chmod 444 "$trusted/collect.mjs"
chmod 555 "$trusted"
gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN" > "$input/run.json"
revision=$(node - "$input/run.json" "$receipt" <<'NODE'
const assert=require('node:assert/strict'),fs=require('node:fs')
const r=JSON.parse(fs.readFileSync(process.argv[2])),f=JSON.parse(fs.readFileSync(process.argv[3]))
assert.equal(r.conclusion,'failure');assert.equal(String(r.id),f.identity.run)
assert.equal(r.repository.full_name,f.repository);assert.equal(r.head_repository.full_name,f.repository)
assert.equal(r.path,f.workflow);assert.equal(r.event,f.event);assert.equal(r.head_branch,f.branch)
assert.equal(r.head_sha,f.identity.revision);assert.equal(String(r.run_attempt),f.identity.attempt)
console.log(r.head_sha)
NODE
)
# Shared runtime stays exact; the Atlas CLI is rebuilt from the immutable producer checkout below.
git diff --exit-code "$revision" HEAD -- . ':!script/atlas-genesis/**' ':!modules/atlas/docs/**' ':!docs/guides/atlas-genesis.md' ':!.github/workflows/atlas-genesis.yml' ':!modules/atlas/packages/cli/src/mine-pool.ts' ':!modules/atlas/packages/cli/src/mine-worker.ts'
git show "$revision:.github/workflows/atlas-genesis.yml" > "$input/producer-workflow.yml"
node - "$input/producer-workflow.yml" "$receipt" <<'NODE'
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto')
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(process.argv[2])).digest('hex'),JSON.parse(fs.readFileSync(process.argv[3])).workflowSha256)
NODE
git clone --no-local --no-checkout "$GITHUB_WORKSPACE" "$source"
git -C "$source" remote set-url origin "https://github.com/$GITHUB_REPOSITORY"
git -C "$source" switch --detach "$revision"
# Atlas is a standalone npm workspace; do not link it back to the private runner checkout or its caches.
(cd "$source/modules/atlas" && npm ci && bun typecheck)
git -C "$source" diff --exit-code
runtime="$input/runtime"
mkdir -p "$runtime"
git archive HEAD script/atlas-genesis | tar -x -C "$runtime"
ln -s "$source/modules" "$runtime/modules"
gh run download "$SOURCE_RUN" -R "$GITHUB_REPOSITORY" -n atlas-genesis-index -D "$source/.atlas/index.d"
gh run download "$SOURCE_RUN" -R "$GITHUB_REPOSITORY" -n atlas-genesis-mine -D "$input/artifact"
# One archive read instead of hundreds of REST blob reads. Never extract arbitrary tar member paths.
gh api "repos/$GITHUB_REPOSITORY/tarball/genesis-checkpoints" > "$input/checkpoints.tar.gz"
python3 - "$input" "$receipt" <<'PY'
import gzip,io,json,sys,tarfile
from pathlib import Path
root=Path(sys.argv[1]);expected=json.loads(Path(sys.argv[2]).read_text());run=expected['identity']['run'];metadata=json.loads((root/'run.json').read_text())
prefix=f'/runs/{run}-{metadata["run_attempt"]}/production/'
out=root/'envelopes';out.mkdir(mode=0o700)
with tarfile.open(root/'checkpoints.tar.gz','r:gz') as archive:
    members=sorted([m for m in archive.getmembers() if prefix in m.name],key=lambda m:m.name)
    assert len(members)==expected['lastSequence'],'checkpoint replay: incomplete original envelope population'
    for index,member in enumerate(members,1):
        assert member.isfile() and member.size<=20*1024*1024 and Path(member.name).name==f'{index:08}.json.gz'
        (out/Path(member.name).name).write_bytes(archive.extractfile(member).read())
with gzip.GzipFile(fileobj=io.BytesIO((out/'00000001.json.gz').read_bytes())) as packed:
    first_bytes=packed.read(128*1024*1024+1)
assert len(first_bytes)<=128*1024*1024,'checkpoint replay: first envelope exceeds decode bound'
first=json.loads(first_bytes)
identity=first['identity']
assert identity==expected['identity'],'checkpoint replay: original identity differs from frozen source receipt'
(root/'expected.json').write_text(json.dumps(expected)+'\n')
PY
mkdir -m 700 "$input/home"
# Calibrate the network oracle on this real runner, then delegate isolation to the kernel, not a JS scanner.
network_control="$RUNNER_TEMP/atlas-replay-network-control"
mkdir -m 700 "$network_control"
ip -json route show > "$network_control/network-positive.json"
sudo -n unshare --net -- ip -json route show > "$network_control/network-isolated.json"
node - "$network_control" <<'NODE'
const assert=require('node:assert/strict'),fs=require('node:fs'),root=process.argv[2]
assert(JSON.parse(fs.readFileSync(root+'/network-positive.json')).length>0,'positive network oracle is empty')
assert.equal(JSON.parse(fs.readFileSync(root+'/network-isolated.json')).length,0,'isolated namespace has external routes')
NODE
if [ "${CONTINUATION_CONTROL:-0}" = 1 ]; then
  node "$GITHUB_WORKSPACE/script/atlas-genesis/$audit" source "$input/envelopes" "$receipt" "$network_control/source-receipts.json"
fi
uid=$(id -u nobody)
gid=$(id -g nobody)
[ "$uid" != 0 ] && [ "$uid" != "$(id -u)" ]
private_control="$RUNNER_TEMP/atlas-replay-private-control"
mkdir -m 700 "$private_control"
printf '%s\n' 'synthetic-private-control-not-a-credential' > "$private_control/sentinel"
chmod 600 "$private_control/sentinel"
[ "$(cat "$private_control/sentinel")" = synthetic-private-control-not-a-credential ]
[ ! -e "$OUT/exact-replay" ]
sudo -n install -d -m 700 -o "$uid" -g "$gid" "$work_output"
python3 - "$input" "$source" <<'PY'
import os,stat,sys
from collections import defaultdict
from pathlib import Path
roots=[Path(path).resolve() for path in sys.argv[1:]]
links=defaultdict(list)
for root in roots:
    for directory,dirs,files in os.walk(root,followlinks=False):
        for name in dirs+files:
            path=Path(directory)/name;info=path.lstat()
            if stat.S_ISREG(info.st_mode):links[(info.st_dev,info.st_ino)].append((path,info.st_nlink))
            if path.is_symlink() and ('node_modules' in path.parts or roots[0]/'runtime' in path.parents):
                target=path.resolve()
                assert any(target.is_relative_to(allowed) for allowed in roots),f'external runtime symlink: {path}'
for entries in links.values():
    assert all(count==len(entries) for _,count in entries),'replay data shares an inode outside its isolated roots'
PY
restricted() {
  # The synthetic control needs loopback only; no external interface or route exists in either mode.
  sudo -n unshare --net -- sh -c 'if [ "$1" = 1 ]; then ip link set lo up; fi; shift; exec "$@"' sh "${CONTINUATION_CONTROL:-0}" \
    setpriv --reuid="$uid" --regid="$gid" --clear-groups --no-new-privs \
    env -i PATH="$PATH" HOME="$input/home" REPLAY_RUNNER_UID="$(id -u)" REPLAY_PRIVATE_CONTROL="$private_control/sentinel" \
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0="$source" "$@"
}
(
  cd "$source"
  # All root ownership changes happen before the restricted workload starts, over checked input inodes.
  sudo -n chown -hRP "$uid:$gid" "$input" "$source"
  restricted /usr/bin/test -r "$runtime/script/atlas-genesis/$helper"
  code=0
  restricted timeout "$deadline" node "$runtime/script/atlas-genesis/$helper" \
    "$input/envelopes" "$input/expected.json" "$source" "$input/artifact" "$work_output" || code=$?
  # Permission normalization runs as the data owner, never with root or runner authority.
  restricted node "$trusted/collect.mjs" publish "$work_output"
  printf '%s\n' "$code" > "$sandbox/exit-code"
)
node "$GITHUB_WORKSPACE/script/atlas-genesis/checkpoint-replay-collect.mjs" output "$work_output" "$OUT/exact-replay" "$uid"
node "$GITHUB_WORKSPACE/script/atlas-genesis/checkpoint-replay-collect.mjs" network "$network_control" "$OUT/exact-replay"
code=$(cat "$sandbox/exit-code")
node - "$OUT/exact-replay" "$code" <<'NODE'
const fs=require('node:fs');fs.writeFileSync(process.argv[2]+'/execution.json',JSON.stringify({exitCode:Number(process.argv[3])})+'\n',{flag:'wx',mode:0o600})
NODE
[ "$code" = 0 ] || exit "$code"
if [ "${CONTINUATION_CONTROL:-0}" = 1 ]; then
  node "$GITHUB_WORKSPACE/script/atlas-genesis/$audit" audit "$OUT/exact-replay" "$receipt" "$network_control/source-receipts.json" "$uid"
else
  node "$GITHUB_WORKSPACE/script/atlas-genesis/$audit" "$OUT/exact-replay" "$receipt" "$uid"
fi
