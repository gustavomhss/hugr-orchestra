#!/bin/sh
# The protected route withholds command stdout until its original bytes are acknowledged externally.
set -eu
if [ "${1:-}" = --version ]; then exec "${0%/*}/grok-text.sh" --version; fi
: "${ATLAS_CHECKPOINT_URL:?checkpoint service required}"
: "${ATLAS_CHECKPOINT_NONCE:?checkpoint capability required}"
case "$ATLAS_CHECKPOINT_URL" in http://127.0.0.1:[0-9]*) ;; *) exit 2 ;; esac
umask 077
directory=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/atlas-reply.XXXXXXXX")
child=''
cleanup() { rm -f "$directory"/*; rmdir "$directory"; }
stop() {
  trap '' HUP INT TERM
  if [ -n "$child" ]; then
    kill -TERM "$child" 2>/dev/null || true
    # A command timeout must not turn into an unbounded wait if the client ignores termination.
    kill -KILL "$child" 2>/dev/null || true
    wait "$child" 2>/dev/null || true
  fi
  exit 143
}
trap cleanup EXIT
trap stop HUP INT TERM
cat > "$directory/prompt"
node --input-type=module - "$directory" <<'NODE'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const bytes = readFileSync(process.argv[2] + '/prompt')
writeFileSync(process.argv[2] + '/dispatch.json', JSON.stringify({promptSha256:createHash('sha256').update(bytes).digest('hex'),promptBytes:bytes.length}))
NODE
# curl's config avoids putting even this local capability in argv or exported evidence.
printf 'header = "Authorization: Bearer %s"\n' "$ATLAS_CHECKPOINT_NONCE" > "$directory/curl.conf"
curl --silent --show-error --fail --max-time 300 --config "$directory/curl.conf" \
  --data-binary "@$directory/dispatch.json" "$ATLAS_CHECKPOINT_URL/dispatch" > "$directory/dispatch-ack.json"
# A replay acknowledgement already includes an externally durable original completion. Never invoke Grok.
node --input-type=module - "$directory" <<'NODE'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const directory = process.argv[2]
const reply = JSON.parse(readFileSync(directory + '/dispatch-ack.json'))
assert(/^[0-9a-f-]{36}$/.test(reply.request), 'checkpoint: invalid dispatch acknowledgement')
if (Object.hasOwn(reply, 'completion')) {
  const completion = reply.completion
  assert(completion && Number.isInteger(completion.exitCode) && completion.exitCode >= 0 && completion.exitCode <= 255,
    'checkpoint: invalid cached command status')
  for (const field of ['stdout', 'stderr']) {
    assert(typeof completion[field] === 'string', 'checkpoint: missing cached command bytes')
    const bytes = Buffer.from(completion[field], 'base64')
    assert.equal(bytes.toString('base64'), completion[field], 'checkpoint: invalid cached command encoding')
    writeFileSync(directory + '/' + field, bytes, { flag: 'wx', mode: 0o600 })
  }
  writeFileSync(directory + '/replay.code', String(completion.exitCode), { flag: 'wx', mode: 0o600 })
}
NODE
if [ -f "$directory/replay.code" ]; then
  cat "$directory/stdout"
  cat "$directory/stderr" >&2
  exit "$(cat "$directory/replay.code")"
fi
exec 3< "$directory/prompt"
rm -f "$directory/prompt"
# The existing wrapper unlinks its own regular stdin before direct Grok exec. This supervisor forwards
# termination to that exact child and waits; tools/subagents remain denied, so it starts no tool tree.
"${0%/*}/grok-text.sh" <&3 3<&- > "$directory/stdout" 2> "$directory/stderr" &
child=$!
exec 3<&-
if wait "$child"; then code=0; else code=$?; fi
child=''
node --input-type=module - "$directory" "$code" <<'NODE'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
const directory = process.argv[2]
const dispatch = JSON.parse(readFileSync(directory + '/dispatch-ack.json'))
assert(/^[0-9a-f-]{36}$/.test(dispatch.request))
writeFileSync(directory + '/completion.json', JSON.stringify({request:dispatch.request,exitCode:Number(process.argv[3]),
  stdout:readFileSync(directory + '/stdout').toString('base64'),stderr:readFileSync(directory + '/stderr').toString('base64')}))
NODE
curl --silent --show-error --fail --max-time 300 --config "$directory/curl.conf" \
  --data-binary "@$directory/completion.json" "$ATLAS_CHECKPOINT_URL/completion" > "$directory/completion-ack.json"
cat "$directory/stdout"
cat "$directory/stderr" >&2
exit "$code"
