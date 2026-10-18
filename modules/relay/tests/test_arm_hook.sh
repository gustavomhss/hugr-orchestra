#!/usr/bin/env bash
# End-to-end test for bin/relay-arm-hook.sh — the per-agent checklist-chain SubagentStop gate.
# Simulates an orchestrator arming a subagent with a 2-gate chain, then drives the hook the way
# Claude Code would (one invocation per subagent "stop"), asserting block/advance/complete + ledger.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$ROOT/bin/relay-arm-hook.sh"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL %s\n' "$1"; }
chk()  { if eval "$2"; then ok "$1"; else bad "$1 [$2]"; fi; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
ARMS="$TMP/arms"; WORK="$TMP/work"; mkdir -p "$ARMS" "$WORK"
export RELAY_CORPUS_DIR="$TMP/corpus"   # isolate trace retention from the real ~/.relay/corpus
TOKEN="sec-test01"
ARM="$ARMS/$TOKEN"; mkdir -p "$ARM"

# A fake subagent transcript carrying the arm marker (what the orchestrator pasted into the prompt).
TRANSCRIPT="$TMP/transcript.jsonl"
printf '{"type":"user","content":"do the work. RELAY-ARM:%s"}\n' "$TOKEN" > "$TRANSCRIPT"

# Arm: a 2-gate chain. Gate 1 requires done1.txt; gate 2 requires done2.txt. Both deterministic.
cat > "$ARM/sprint.json" <<JSON
{ "brief": "test chain", "retry_budget": 2,
  "work_packages": [
    { "id": "g1-first",  "instructions": "make done1",
      "checklist": [ { "id": "C1", "assert": "done1 exists", "cmd": "test -f done1.txt" } ] },
    { "id": "g2-second", "instructions": "make done2",
      "checklist": [ { "id": "C2", "assert": "done2 exists", "cmd": "test -f done2.txt" } ] }
  ] }
JSON
printf '{"workdir":"%s","token":"%s"}' "$WORK" "$TOKEN" > "$ARM/meta.json"

# Drive the hook one "stop" at a time. Payload mimics the SubagentStop JSON on stdin.
fire() { printf '{"transcript_path":"%s"}' "$TRANSCRIPT" | RELAY_ARMS_DIR="$ARMS" bash "$HOOK" 2>/dev/null; }

echo "test_arm_hook: 2-gate chain, async single-subagent drive"

# --- Stop 1: nothing done yet -> gate 1 must BLOCK ---
out1="$(fire)"
chk "stop1 blocks"                 '[ "$(printf "%s" "$out1" | jq -r .decision)" = "block" ]'
chk "stop1 names the failing gate" 'printf "%s" "$out1" | grep -q "g1-first"'
chk "counter still at 0"           '[ "$(cat "$ARM/counter" 2>/dev/null || echo 0)" = "0" ]'

# --- Stop 2: still nothing -> retry (block), retry counter ticks ---
out2="$(fire)"
chk "stop2 blocks again"           '[ "$(printf "%s" "$out2" | jq -r .decision)" = "block" ]'

# --- Stop 3: satisfy gate 1 -> ADVANCE to gate 2 (block w/ next instructions), counter -> 1 ---
touch "$WORK/done1.txt"
out3="$(fire)"
chk "stop3 advances (still block)" '[ "$(printf "%s" "$out3" | jq -r .decision)" = "block" ]'
chk "stop3 reveals gate 2"         'printf "%s" "$out3" | grep -q "g2-second"'
chk "counter advanced to 1"        '[ "$(cat "$ARM/counter")" = "1" ]'

# --- Stop 4: gate 2 not satisfied -> BLOCK on gate 2 ---
out4="$(fire)"
chk "stop4 blocks on gate 2"       'printf "%s" "$out4" | grep -q "g2-second"'

# --- Stop 5: satisfy gate 2 -> CHAIN COMPLETE: no block (empty stdout), counter past end ---
touch "$WORK/done2.txt"
out5="$(fire)"
chk "stop5 complete = no block"    '[ -z "$(printf "%s" "$out5" | jq -r ".decision // empty" 2>/dev/null)" ]'
chk "counter past end (=2)"        '[ "$(cat "$ARM/counter")" = "2" ]'

# --- regression guard: if gate 1 artifact is removed and we somehow re-fire, it must NOT silently pass.
# (chain is complete so it exits 0; assert ledger captured the completion instead.) ---
chk "ledger has sprint-complete"   'grep -q "sprint-complete" "$ARM/ledger.jsonl"'
chk "ledger has advance-reveal"    'grep -q "advance-reveal" "$ARM/ledger.jsonl"'
chk "ledger logged C1 + C2"        'grep -q "\"item\":\"C1\"" "$ARM/ledger.jsonl" && grep -q "\"item\":\"C2\"" "$ARM/ledger.jsonl"'

# --- ledger integrity: the per-arm chain must verify with the existing offline verifier ---
if [ -f "$ROOT/benchmark/verify_ledger.py" ]; then
  chk "ledger hash-chain verifies" 'python3 "$ROOT/benchmark/verify_ledger.py" "$ARM/ledger.jsonl" >/dev/null 2>&1'
fi

# --- isolation: an unmarked transcript (no RELAY-ARM token) must be left ALONE (no output) ---
printf '{"type":"user","content":"just a normal agent"}\n' > "$TMP/plain.jsonl"
outp="$(printf '{"transcript_path":"%s"}' "$TMP/plain.jsonl" | RELAY_ARMS_DIR="$ARMS" bash "$HOOK" 2>/dev/null)"
chk "unarmed agent untouched"      '[ -z "$outp" ]'

# --- unknown token must also be left alone ---
printf '{"type":"user","content":"RELAY-ARM:does-not-exist"}\n' > "$TMP/ghost.jsonl"
outg="$(printf '{"transcript_path":"%s"}' "$TMP/ghost.jsonl" | RELAY_ARMS_DIR="$ARMS" bash "$HOOK" 2>/dev/null)"
chk "unknown token untouched"      '[ -z "$outg" ]'

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
