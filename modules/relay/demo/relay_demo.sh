#!/usr/bin/env bash
# Relay 90-second demo — "your agent cannot lie that it's done."
#
# Drives the REAL Relay hook (benchmark/relay_hook.sh) over a tiny throwaway sprint, with a SCRIPTED
# runner standing in for the LLM (so the demo is deterministic, instant, and free). It shows the one
# beat that lands: the gate fires RED and the door does NOT open until a real check passes — and the
# run leaves a timestamped, verified trace as proof.
#
# Usage:  bash demo/relay_demo.sh
set -uo pipefail
BENCH="$(cd "$(dirname "$0")/../benchmark" && pwd)"
HOOK="$BENCH/relay_hook.sh"
D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
b() { printf '\033[1m%s\033[0m\n' "$1"; }          # bold
red() { printf '\033[31m%s\033[0m\n' "$1"; }
grn() { printf '\033[32m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }
rule() { printf '%s\n' "────────────────────────────────────────────────────────────"; }

# ---- the tiny sprint: implement calc.py (add, sub, mul); one WP each, real pytest DoD ----
mkdir -p "$D/checks"
cat > "$D/checks/test_calc.py" <<'PY'
from calc import add, sub, mul
def test_R1_add(): assert add(2, 3) == 5
def test_R2_sub(): assert sub(5, 2) == 3
def test_R3_mul(): assert mul(4, 3) == 12
PY
cat > "$D/sprint.json" <<'JSON'
{ "brief": "Implement calc.py exposing add, sub, mul.", "retry_budget": 3,
  "work_packages": [
    { "id": "wp1-add", "title": "add", "instructions": "Implement add(a,b)=a+b.",
      "dod": [ {"type":"test","cmd":"python3 -m pytest checks/test_calc.py::test_R1_add -q"} ] },
    { "id": "wp2-sub", "title": "sub", "instructions": "Implement sub(a,b)=a-b.",
      "dod": [ {"type":"test","cmd":"python3 -m pytest checks/test_calc.py::test_R2_sub -q"} ] },
    { "id": "wp3-mul", "title": "mul", "instructions": "Implement mul(a,b)=a*b.",
      "dod": [ {"type":"test","cmd":"python3 -m pytest checks/test_calc.py::test_R3_mul -q"} ] } ] }
JSON

# the runner's PARTIAL work: only add() is real; sub/mul are stubs that "look done"
partial() { cat > "$D/calc.py" <<'PY'
def add(a, b): return a + b
def sub(a, b): return 0      # <-- wrong, but the agent "believes" it's done
def mul(a, b): return 0      # <-- wrong
PY
}
fix_sub() { sed -i.bak 's/def sub.*/def sub(a, b): return a - b/' "$D/calc.py"; rm -f "$D/calc.py.bak"; }
fix_mul() { sed -i.bak 's/def mul.*/def mul(a, b): return a * b/' "$D/calc.py"; rm -f "$D/calc.py.bak"; }
score() { ( cd "$D" && python3 -m pytest checks/ -q 2>/dev/null | tail -1 ); }
# call the REAL hook exactly as Claude Code would on a Stop event; print any injected reason
fire_stop() {
  local out reason
  out="$(echo '{}' | RELAY_RUN_DIR="$D" RELAY_SPRINT="$D/sprint.json" RELAY_GATE=on bash "$HOOK")"
  if [ -z "$out" ]; then echo "__COMPLETE__"; return; fi
  reason="$(printf '%s' "$out" | jq -r '.reason')"
  printf '%s' "$reason"
}

clear 2>/dev/null || true
b "RELAY — your agent cannot lie that it's done."; rule

# ===== ACT 1: no Relay — the agent declares done while it's silently broken =====
partial
b "ACT 1 — a vanilla agent (no Relay)"
dim "the runner implements add(), stubs sub()/mul(), and declares:"
grn '  runner: "All done! ✅"'
dim "the run exits. what actually shipped:"
printf '  pytest: '; red "$(score)   ← 2 of 3 silently wrong. nobody stopped it."
echo

# ===== ACT 2: with Relay — the gate refuses the false "done" =====
rm -rf "$D/.relay-state"; partial
b "ACT 2 — the same runner, under Relay"
dim "every time the runner stops, the Relay hook runs the real DoD before it may finalize."; echo

step() {  # $1 = human label of what the runner just "did"
  printf '  '; dim "runner stops — $1"
  local r; r="$(fire_stop)"
  if [ "$r" = "__COMPLETE__" ]; then
    grn "  GATE: all work packages green → SPRINT COMPLETE — the door opens."; return 0
  fi
  if printf '%s' "$r" | grep -q "is NOT done"; then
    red "  GATE: RED — door STAYS CLOSED."
    printf '    '; dim "$(printf '%s' "$r" | sed 's/ Instructions:.*//')"
  else
    grn "  GATE: green → locked in (keep-best) → next package revealed:"
    printf '    '; dim "$(printf '%s' "$r" | sed 's/ (Edit.*//')"
  fi
  return 1
}

step "claims wp1 done";              echo    # add passes → reveals wp2
step "claims wp2 done (sub stubbed)"; echo    # sub RED → blocked
dim "  …runner fixes sub()…"; fix_sub
step "claims wp2 done (sub fixed)";  echo     # sub passes → reveals wp3
step "claims wp3 done (mul stubbed)"; echo    # mul RED → blocked
dim "  …runner fixes mul()…"; fix_mul
step "claims wp3 done (mul fixed)";  echo     # all green → COMPLETE

rule
b "The proof — verified-trace ledger (what the gate witnessed, timestamped):"
jq -c '{ts, wp, event}' "$D/.relay-state/ledger.jsonl" 2>/dev/null | sed 's/^/  /'
echo
printf 'final state under Relay: '; grn "$(score)   ← it could not exit until every check passed."
rule
b "Vanilla exited at 1/3 and lied.  Relay physically could not finalize until 3/3 — with a signed trace."
