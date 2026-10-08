#!/usr/bin/env bash
# Two evaluations over one state dir must not fork the chain.
#
# Found by a LIVE run, not by any test here: a harness fired `relay-gate` twice over one state
# directory within seconds, both processes read the same `prev` hash, both appended, the chain forked,
# and `relay verify` reported TAMPERED — an honest run producing the banner that means "do not accept
# this run". The comment in lib/relay-gate.sh had predicted exactly this and called it acceptable:
# "concurrent appends to the same file are not a normal path — a rare double-stop fails CLOSED as a
# spurious TAMPERED, never as an accepted forgery." Both halves were wrong. Driving the CLI twice IS a
# normal path for any harness, and a transport failure that reads as tampering is the same class of
# defect the judge work removed three times over — worse here, because integrity has no second opinion.
#
# Two locks, two failures:
#   the CHAIN lock (lib/relay-gate.sh) serializes read-tail-then-append, so the chain cannot fork
#   the RUN lock (bin/relay-gate) serializes the whole evaluation, so the COUNTER cannot double-advance
#     and the loser is told it is busy (exit 3) rather than queued — a harness that fired twice by
#     mistake wants to know.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GATE="$ROOT/bin/relay-gate"
VERIFY="$ROOT/benchmark/verify_ledger.py"
fails=0
note() { printf '%s %s\n' "$1" "$2"; [ "$1" = FAIL ] && fails=$((fails + 1)); return 0; }

mk() {  # $1 = dir
  mkdir -p "$1/work" "$1/state"
  cat > "$1/sprint.json" <<'JSON'
{"brief":"concurrency","retry_budget":9,
 "work_packages":[
  {"id":"wp1","checklist":[{"id":"C-1","cmd":"true"},{"id":"C-2","cmd":"true"},{"id":"C-3","cmd":"true"},
                           {"id":"C-4","cmd":"true"},{"id":"C-5","cmd":"true"},{"id":"C-6","cmd":"true"}]},
  {"id":"wp2","checklist":[{"id":"D-1","cmd":"true"}]}]}
JSON
}

# ---- the chain survives concurrent evaluation, repeatedly ----------------------------------------
# Repeated because a race that reproduces 3 times in 3 is a race, and one clean run proves nothing.
for round in 1 2 3; do
  D=$(mktemp -d); mk "$D"
  "$GATE" eval --sprint "$D/sprint.json" --workdir "$D/work" --state "$D/state" >"$D/a.out" 2>"$D/a.err" &
  "$GATE" eval --sprint "$D/sprint.json" --workdir "$D/work" --state "$D/state" >"$D/b.out" 2>"$D/b.err" &
  wait

  if python3 "$VERIFY" "$D/state/ledger.jsonl" >/dev/null 2>&1; then
    note PASS "round $round: chain intact under concurrent evaluation"
  else
    note FAIL "round $round: chain FORKED — $(python3 "$VERIFY" "$D/state/ledger.jsonl" 2>&1 | head -1)"
  fi

  # Exactly one evaluation graded the state: the counter moved once, not twice.
  c=$(cat "$D/state/counter" 2>/dev/null || echo missing)
  [ "$c" = 1 ] && note PASS "round $round: counter advanced once" \
                || note FAIL "round $round: counter is '$c', expected 1"

  # One winner, one told it is busy — and the loser must say so on stderr rather than silently no-op.
  busy=0
  grep -q 'another evaluation holds' "$D/a.err" && busy=$((busy + 1))
  grep -q 'another evaluation holds' "$D/b.err" && busy=$((busy + 1))
  [ "$busy" = 1 ] && note PASS "round $round: the loser was told the state dir is busy" \
                  || note FAIL "round $round: $busy processes reported busy, expected 1"

  # And it must not have recorded a verdict on the way out.
  n=$(grep -c 'checklist-item' "$D/state/ledger.jsonl" 2>/dev/null || echo 0)
  [ "$n" = 6 ] && note PASS "round $round: 6 verdicts recorded, not 12" \
               || note FAIL "round $round: $n checklist-item entries, expected 6"
  rm -rf "$D"
done

# ---- a busy state dir is a distinct exit code, not a gate failure --------------------------------
# A harness must be able to tell "someone else is grading" from "the gate said no": one is a retry,
# the other is work to do.
D=$(mktemp -d); mk "$D"
mkdir "$D/state/.run.lock"
"$GATE" eval --sprint "$D/sprint.json" --workdir "$D/work" --state "$D/state" >/dev/null 2>"$D/e"; rc=$?
[ "$rc" = 3 ] && note PASS "a held lock exits 3, distinct from gate-fail(1) and escalate(2)" \
              || note FAIL "a held lock exited $rc, expected 3"
grep -q 'remove that directory' "$D/e" && note PASS "the message says how to clear a stale lock" \
                                       || note FAIL "no remediation in the message"
rmdir "$D/state/.run.lock"

# ---- and the lock is released, so the next evaluation runs ---------------------------------------
# A lock that outlives its process turns a race into a deadlock, which is not an improvement.
out=$("$GATE" eval --sprint "$D/sprint.json" --workdir "$D/work" --state "$D/state" 2>/dev/null)
printf '%s' "$out" | grep -q '"outcome"' && note PASS "the lock is released for the next evaluation" \
                                        || note FAIL "no outcome after the lock was cleared: $out"
[ -d "$D/state/.run.lock" ] && note FAIL "the run lock survived the process" \
                            || note PASS "the run lock did not survive the process"
[ -d "$D/state/.chain.lock" ] && note FAIL "the chain lock survived the process" \
                              || note PASS "the chain lock did not survive the process"
rm -rf "$D"

printf '\n%s\n' "$([ "$fails" = 0 ] && echo 'all concurrency checks passed' || echo "$fails FAILED")"
exit "$fails"
