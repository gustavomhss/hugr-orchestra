#!/usr/bin/env bash
# Relay Stop-hook — drives the runner (the headless main agent) through sprint.json.
#   Gated (RELAY_GATE=on, default): run the current WP's dod; pass -> reveal next WP;
#     fail/regression -> re-block with the failing checks (bounded by retry_budget).
#   Ungated (RELAY_GATE=off, arm D): reveal the next WP on every stop, no gate.
#   Arm M is just a 1-WP sprint (whole campaign) run gated — same mechanic.
RUN_DIR="${RELAY_RUN_DIR:?}"
SPRINT="${RELAY_SPRINT:?}"
GATE="${RELAY_GATE:-on}"
STATE="$RUN_DIR/.relay-state"; LOG="$STATE/relay.log"; LEDGER="$STATE/ledger.jsonl"
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JUDGE="$HOOK_DIR/judge.py"
. "$HOOK_DIR/../lib/relay-gate.sh"   # shared gate core: relay_chain_append + relay_run_checklist
driver_fatal() {
  local status="$1"; shift
  printf 'relay-hook: %s\n' "$*" >&2
  exit "$status"
}
mkdir -p "$STATE"
cat >/dev/null  # drain stdin (payload not needed; one runner per run — plain Stop, no agent_id)
fails=""; reg=""
# Verified-trace ledger: the hash chain lives in lib/relay-gate.sh (relay_chain_append). The benchmark's
# envelope is single-runner (no `arm` field) — kept verbatim so historical ledgers + hashes are stable.
ledger() {  # $1=event  $2=retry(optional) — a gate-level event
  relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg wp "${wp_id:-?}" --argjson i "${i:-0}" \
         --arg ev "$1" --arg retry "${2:-0}" --arg fails "$fails" --arg reg "$reg" \
    '{ts:($ts|tonumber),wp:$wp,i:$i,event:$ev,retry:($retry|tonumber),fails:$fails,reg:$reg}')"
}
ledger_item() {  # $1=item-id $2=assertion $3=verdict $4=graded_by $5=oracle-sha $6=origin
  relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg wp "${wp_id:-?}" --argjson i "${i:-0}" \
         --arg ev "checklist-item" --arg id "$1" --arg as "$2" --arg v "$3" --arg gb "$4" \
         --arg orc "${5:-}" --arg org "${6:-sprint}" \
    '{ts:($ts|tonumber),wp:$wp,i:$i,event:$ev,item:$id,assert:$as,verdict:$v,graded_by:$gb,oracle:$orc,origin:$org}')"
}

i=$(cat "$STATE/counter" 2>/dev/null || echo 0)
nwp=$(jq '.work_packages | length' "$SPRINT")
rb=$(jq -r '.retry_budget // 3' "$SPRINT")
[ "$i" -ge "$nwp" ] && exit 0
wp_id=$(jq -r ".work_packages[$i].id" "$SPRINT")

advance() {
  local ni=$((i+1))
  if [ "$ni" -ge "$nwp" ]; then
    # Required evidence precedes state publication. A later state write can still fail.
    ledger sprint-complete || driver_fatal "$?" "sprint-complete record failed"
    printf '%s\n' "$ni" > "$STATE/counter" || driver_fatal "$?" "counter write failed"
    printf '[%s] WP %s OK -> SPRINT COMPLETE\n' "$(date +%s)" "$wp_id" >> "$LOG"
    exit 0
  fi
  local nid ninstr
  nid=$(jq -r ".work_packages[$ni].id" "$SPRINT") || driver_fatal "$?" "next WP lookup failed"
  ninstr=$(jq -r ".work_packages[$ni].instructions" "$SPRINT") || driver_fatal "$?" "next WP instructions lookup failed"
  ledger advance-reveal || driver_fatal "$?" "advance-reveal record failed"
  printf '%s\n' "$ni" > "$STATE/counter" || driver_fatal "$?" "counter write failed"
  printf '[%s] WP %s OK -> reveal %s\n' "$(date +%s)" "$wp_id" "$nid" >> "$LOG"
  jq -n --arg r "Work package $nid. $ninstr  (Edit the code under repo/; self-check with: python3 -m pytest checks/ -q)" \
        '{decision:"block", reason:$r}'
  exit 0
}

if [ "$GATE" = "off" ]; then
  printf '[%s] (ungated) past WP %s\n' "$(date +%s)" "$wp_id" >> "$LOG"; advance
fi

run_dods() {  # $1 = jq filter selecting WPs; emits a JSON failure string, nonzero on extraction failure
  local out="" records record cmd label value
  # Keep commands inside compact JSONL until lossless decoding. Optional absent/empty
  # DoD passes; malformed collections or required commands produce named failures.
  records=$(jq -c "$1 | . as \$wp |
    if .dod == null then empty
    elif (.dod | type) != \"array\" then {wp:\$wp.id, invalid:true}
    else .dod | to_entries[] | {wp:\$wp.id, index:.key, control:.value} end" "$SPRINT") || return 1
  while IFS= read -r record; do
    [ -n "$record" ] || continue
    value=$(printf '%s' "$record" | jq -c '
      if .invalid then "dod:\(.wp):invalid-array"
      elif (.control | type) == "object" and (.control.id | type) == "string" and .control.id != ""
      then .control.id else "dod:\(.wp):\(.index):invalid-command" end') || return 1
    relay_json_string label "$value" || return 1
    if [ "$(printf '%s' "$record" | jq -r '.invalid // false')" = true ]; then
      out="$out; $label"; continue
    fi
    value=$(printf '%s' "$record" | jq -c '
      if (.control | type) == "object" then .control.cmd else null end') || return 1
    if ! relay_json_string cmd "$value" || [ -z "$cmd" ]; then
      out="$out; $label"; continue
    fi
    # Give commands EOF, not the JSONL reader's remaining records.
    ( cd "$RUN_DIR" && eval "$cmd" </dev/null >/dev/null 2>&1 ) || out="$out; ${cmd##*::}"
  done <<< "$records"
  jq -nc --arg out "$out" '$out'
}

# Checklist gate (named controls) is the shared core in lib/relay-gate.sh: relay_run_checklist logs
# each item's verdict via ledger_item above. run_dods covers this benchmark's separate `.dod[]` checks.
dod_result=$(run_dods ".work_packages[$i]") || { rc=$?; exit "$rc"; }
relay_json_string fails "$dod_result" || { rc=$?; exit "$rc"; }
# This hook does not use errexit. A fatal shared-core failure must stop before
# counter/retry changes, rather than looking like an empty successful checklist.
checklist_fails=$(relay_run_checklist) || { rc=$?; exit "$rc"; }
fails="$fails$checklist_fails"
reg=""
if [ "$i" -gt 0 ]; then
  dod_result=$(run_dods ".work_packages[range(0;$i)]") || { rc=$?; exit "$rc"; }
  relay_json_string reg "$dod_result" || { rc=$?; exit "$rc"; }
fi

if [ -z "$fails" ] && [ -z "$reg" ]; then advance; fi

r=$(cat "$STATE/retry_$i" 2>/dev/null || echo 0)
if [ "$r" -ge "$rb" ]; then
  ledger escalate "$rb" || driver_fatal "$?" "escalate record failed"
  printf '[%s] WP %s ESCALATE (budget=%s) fails:%s reg:%s\n' "$(date +%s)" "$wp_id" "$rb" "$fails" "$reg" >> "$LOG"
  exit 0
fi
instr=$(jq -r ".work_packages[$i].instructions" "$SPRINT") || driver_fatal "$?" "WP instructions lookup failed"
ledger gate-fail "$((r+1))" || driver_fatal "$?" "gate-fail record failed"
printf '%s\n' "$((r+1))" > "$STATE/retry_$i" || driver_fatal "$?" "retry write failed"
printf '[%s] WP %s GATE FAIL (retry %s) fails:%s reg:%s\n' "$(date +%s)" "$wp_id" "$((r+1))" "$fails" "$reg" >> "$LOG"
msg="Work package $wp_id is NOT done. Still failing: ${fails}${reg:+ ; regressions:${reg}}. Fix the code under repo/ so these pass (run: python3 -m pytest checks/ -q), then finish. Instructions: $instr"
jq -n --arg r "$msg" '{decision:"block", reason:$r}'
exit 0
