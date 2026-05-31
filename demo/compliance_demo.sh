#!/usr/bin/env bash
# Relay compliance demo — "the agent runs your checklist, and you get a signed proof it did."
#
# Drives the REAL Relay hook over a one-WP sprint whose Definition of Done is an ITEMIZED CHECKLIST
# of controls (LGPD / guardrail / business rule). Each item is a named, deterministic check; every
# verdict is written to a tamper-evident hash-chained ledger. A SCRIPTED runner stands in for the LLM
# so the demo is deterministic, instant, and free.
#
# It shows the three beats that matter for the compliance wedge:
#   1. the gate refuses "done" while any control is violated, and names which ones;
#   2. each control's verdict (pass/fail + how it was graded) is on the chain;
#   3. the chain is offline-verifiable — flip one byte and verify_ledger.py screams TAMPERED.
#
# Usage:  bash demo/compliance_demo.sh
set -uo pipefail
BENCH="$(cd "$(dirname "$0")/../benchmark" && pwd)"
HOOK="$BENCH/relay_hook.sh"
VERIFY="$BENCH/verify_ledger.py"
D="$(mktemp -d)"; trap 'rm -rf "$D"' EXIT
b() { printf '\033[1m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }
grn() { printf '\033[32m%s\033[0m\n' "$1"; }
dim() { printf '\033[2m%s\033[0m\n' "$1"; }
rule() { printf '%s\n' "────────────────────────────────────────────────────────────"; }

# ---- the sprint: ship service.py; DoD = a checklist of 3 deterministic controls + 1 advisory ----
cat > "$D/sprint.json" <<'JSON'
{ "brief": "Ship service.py: process(record) handling a user record.", "retry_budget": 5,
  "work_packages": [
    { "id": "wp1-process", "title": "process()", "instructions": "Implement process(record).",
      "dod": [],
      "checklist": [
        { "id": "LGPD-1", "assert": "no raw email (PII) reaches the application logs",
          "cmd": "rm -f app.log; python3 service.py >/dev/null 2>&1; ! grep -q '@' app.log" },
        { "id": "LGPD-2", "assert": "processing is refused for records without consent",
          "cmd": "python3 -c \"import service; import sys; sys.exit(0 if service.process({'email':'x@y.z','amount':1,'consent':False}).get('rejected') else 1)\"" },
        { "id": "BIZ-1",  "assert": "monetary amount is clamped at 10000",
          "cmd": "python3 -c \"import service; import sys; sys.exit(0 if service.process({'email':'x@y.z','amount':99999,'consent':True}).get('amount',0)<=10000 else 1)\"" },
        { "id": "PRIV-1", "assert": "privacy-notice wording is clear and adequate",
          "judge": "Is the user-facing privacy notice adequate?" }
      ] } ] }
JSON

# the runner's BROKEN first cut: logs raw email, no consent gate, no clamp — but "looks done"
broken() { cat > "$D/service.py" <<'PY'
def process(record):
    with open("app.log", "a") as f:                       # logs raw PII -> LGPD-1 violated
        f.write(f"processing {record['email']} amount={record['amount']}\n")
    return {"ok": True, "amount": record["amount"]}        # no consent gate, no clamp
if __name__ == "__main__":
    process({"email": "ana@example.com", "amount": 99999, "consent": False})
PY
}
fixed() { cat > "$D/service.py" <<'PY'
import hashlib
def _redact(email): return "user:" + hashlib.sha256(email.encode()).hexdigest()[:8]
def process(record):
    if not record.get("consent"):
        return {"rejected": True, "reason": "no consent"}  # LGPD-2
    amount = min(record["amount"], 10000)                  # BIZ-1
    with open("app.log", "a") as f:
        f.write(f"processing {_redact(record['email'])} amount={amount}\n")  # LGPD-1
    return {"ok": True, "amount": amount}
if __name__ == "__main__":
    process({"email": "ana@example.com", "amount": 99999, "consent": True})
PY
}
fire_stop() {
  local out
  out="$(echo '{}' | RELAY_RUN_DIR="$D" RELAY_SPRINT="$D/sprint.json" RELAY_GATE=on bash "$HOOK")"
  [ -z "$out" ] && { echo "__COMPLETE__"; return; }
  printf '%s' "$out" | jq -r '.reason'
}

clear 2>/dev/null || true
b "RELAY — the agent runs your checklist, and you get a signed proof it did."; rule

# ===== ACT 1: no Relay — every control silently violated, agent declares done =====
broken
b "ACT 1 — a vanilla agent (no Relay)"
dim "implements process(), declares done. what actually shipped, against the controls:"
( cd "$D" && rm -f app.log; python3 service.py >/dev/null 2>&1 )
printf '  LGPD-1 (no PII in logs):     '; ( cd "$D" && grep -q '@' app.log ) && red "VIOLATED — raw email in app.log"
printf '  LGPD-2 (consent required):   '; red "VIOLATED — processes without consent"
printf '  BIZ-1  (amount clamped):     '; red "VIOLATED — amount=99999 passed through"
dim "  …and nobody stopped it."
echo

# ===== ACT 2: with Relay — the checklist gate refuses the false "done" =====
rm -rf "$D/.relay-state"; broken
b "ACT 2 — the same runner, under Relay"
dim "on every stop, the hook runs the checklist before the runner may finalize."; echo

r="$(fire_stop)"
red "  GATE: RED — door STAYS CLOSED. Controls still failing:"
printf '    '; dim "$(printf '%s' "$r" | sed 's/^.*Still failing://; s/Fix the code.*//')"
echo
dim "  …runner fixes service.py (redacts PII, gates on consent, clamps amount)…"; fixed
r="$(fire_stop)"
[ "$r" = "__COMPLETE__" ] && grn "  GATE: every control green → SPRINT COMPLETE — the door opens."
echo

# ===== the proof =====
rule
b "The proof #1 — per-control verdicts on the chain (what the gate witnessed, how it graded):"
jq -r 'select(.event=="checklist-item") | "  [\(.verdict|ascii_upcase)] \(.item)  —  \(.assert)   ·\(.graded_by)"' \
   "$D/.relay-state/ledger.jsonl" | tail -8
echo
b "The proof #2 — the ledger is a tamper-evident hash chain:"
printf '  '; python3 "$VERIFY" "$D/.relay-state/ledger.jsonl" | sed 's/^/  /'
echo
b "Now an auditor's nightmare: someone edits one verdict in the ledger after the fact."
# flip the FIRST recorded 'fail' verdict to 'pass' — exactly the lie compliance must catch
python3 - "$D/.relay-state/ledger.jsonl" <<'PY'
import sys
p = sys.argv[1]
lines = open(p).read().splitlines()
for k, ln in enumerate(lines):
    if '"verdict":"fail"' in ln:
        lines[k] = ln.replace('"verdict":"fail"', '"verdict":"pass"', 1)
        break
open(p, "w").write("\n".join(lines) + "\n")
PY
dim "  (changed one 'fail' verdict to 'pass' — leaving its own hash intact)"
printf '  '; python3 "$VERIFY" "$D/.relay-state/ledger.jsonl" | sed 's/^/  /'
rule
b "Vanilla shipped 3 violated controls and called it done."
b "Relay refused to finalize until every control passed — and left a proof you cannot forge."
