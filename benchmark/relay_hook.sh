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
mkdir -p "$STATE"
cat >/dev/null  # drain stdin (payload not needed; one runner per run — plain Stop, no agent_id)
fails=""; reg=""
# Structured verified-trace ledger: one JSON line per gate fire (the compliance / RL-signal substrate).
ledger() {  # $1=event  $2=retry(optional)
  jq -nc --arg ts "$(date +%s)" --arg wp "${wp_id:-?}" --argjson i "${i:-0}" \
         --arg ev "$1" --arg retry "${2:-0}" --arg fails "$fails" --arg reg "$reg" \
    '{ts:($ts|tonumber),wp:$wp,i:$i,event:$ev,retry:($retry|tonumber),fails:$fails,reg:$reg}' \
    >> "$LEDGER" 2>/dev/null || true
}

i=$(cat "$STATE/counter" 2>/dev/null || echo 0)
nwp=$(jq '.work_packages | length' "$SPRINT")
rb=$(jq -r '.retry_budget // 3' "$SPRINT")
[ "$i" -ge "$nwp" ] && exit 0
wp_id=$(jq -r ".work_packages[$i].id" "$SPRINT")

advance() {
  local ni=$((i+1))
  echo "$ni" > "$STATE/counter"
  if [ "$ni" -ge "$nwp" ]; then
    printf '[%s] WP %s OK -> SPRINT COMPLETE\n' "$(date +%s)" "$wp_id" >> "$LOG"; ledger sprint-complete; exit 0
  fi
  local nid ninstr
  nid=$(jq -r ".work_packages[$ni].id" "$SPRINT")
  ninstr=$(jq -r ".work_packages[$ni].instructions" "$SPRINT")
  printf '[%s] WP %s OK -> reveal %s\n' "$(date +%s)" "$wp_id" "$nid" >> "$LOG"
  ledger advance-reveal
  jq -n --arg r "Work package $nid. $ninstr  (Edit billing/core.py; self-check with: python3 -m pytest checks/ -q)" \
        '{decision:"block", reason:$r}'
  exit 0
}

if [ "$GATE" = "off" ]; then
  printf '[%s] (ungated) past WP %s\n' "$(date +%s)" "$wp_id" >> "$LOG"; advance
fi

run_dods() {  # args: jq filter selecting dod cmds; echoes failing cmds
  local out=""
  while IFS= read -r cmd; do
    [ -z "$cmd" ] && continue
    ( cd "$RUN_DIR" && eval "$cmd" >/dev/null 2>&1 ) || out="$out; ${cmd##*::}"
  done < <(jq -r "$1" "$SPRINT")
  printf '%s' "$out"
}

fails=$(run_dods ".work_packages[$i].dod[].cmd")
reg=""
[ "$i" -gt 0 ] && reg=$(run_dods ".work_packages[range(0;$i)].dod[].cmd")

if [ -z "$fails" ] && [ -z "$reg" ]; then advance; fi

r=$(cat "$STATE/retry_$i" 2>/dev/null || echo 0)
if [ "$r" -ge "$rb" ]; then
  printf '[%s] WP %s ESCALATE (budget=%s) fails:%s reg:%s\n' "$(date +%s)" "$wp_id" "$rb" "$fails" "$reg" >> "$LOG"
  ledger escalate "$rb"
  exit 0
fi
echo $((r+1)) > "$STATE/retry_$i"
instr=$(jq -r ".work_packages[$i].instructions" "$SPRINT")
printf '[%s] WP %s GATE FAIL (retry %s) fails:%s reg:%s\n' "$(date +%s)" "$wp_id" "$((r+1))" "$fails" "$reg" >> "$LOG"
ledger gate-fail "$((r+1))"
msg="Work package $wp_id is NOT done. Still failing: ${fails}${reg:+ ; regressions:${reg}}. Fix billing/core.py so these pass (run: python3 -m pytest checks/ -q), then finish. Instructions: $instr"
jq -n --arg r "$msg" '{decision:"block", reason:$r}'
exit 0
