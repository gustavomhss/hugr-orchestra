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
JUDGE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/judge.py"
mkdir -p "$STATE"
cat >/dev/null  # drain stdin (payload not needed; one runner per run — plain Stop, no agent_id)
fails=""; reg=""
# Tamper-evident verified-trace ledger: an append-only hash chain (one JSON line per event).
# Each line carries prev=h(previous line) and h=sha256(this line w/o h), so any edit, reorder or
# deletion breaks the chain — verifiable offline with benchmark/verify_ledger.py. This is the
# compliance artifact: a signed proof of *what the gate witnessed*, not the agent's self-report.
chain_append() {  # $1 = compact JSON body (no prev/seq/h); links it onto the chain
  local last prev seq body h
  last=$(tail -1 "$LEDGER" 2>/dev/null)
  prev=$(printf '%s' "$last" | jq -r '.h // empty' 2>/dev/null); [ -z "$prev" ] && prev="GENESIS"
  seq=$(printf '%s' "$last" | jq -r '.seq // -1' 2>/dev/null); [ -z "$seq" ] && seq=-1; seq=$((seq + 1))
  body=$(printf '%s' "$1" | jq -c --arg p "$prev" --argjson s "$seq" '. + {prev:$p, seq:$s}') || return 0
  # h = HMAC-SHA256(key, body) when RELAY_LEDGER_KEY is set (UNFORGEABLE without the key),
  # else plain SHA-256 (tamper-EVIDENT vs in-place edits, but a holder of the file can rewrite
  # the whole chain — see verify_ledger.py). `seq` makes the entry count explicit (truncation).
  if [ -n "${RELAY_LEDGER_KEY:-}" ]; then
    h=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$RELAY_LEDGER_KEY" | sed -E 's/.* //')
  else
    h=$(printf '%s' "$body" | shasum -a 256 | cut -d' ' -f1)
  fi
  printf '%s' "$body" | jq -c --arg h "$h" '. + {h:$h}' >> "$LEDGER" 2>/dev/null || true
}
ledger() {  # $1=event  $2=retry(optional) — a gate-level event
  chain_append "$(jq -nc --arg ts "$(date +%s)" --arg wp "${wp_id:-?}" --argjson i "${i:-0}" \
         --arg ev "$1" --arg retry "${2:-0}" --arg fails "$fails" --arg reg "$reg" \
    '{ts:($ts|tonumber),wp:$wp,i:$i,event:$ev,retry:($retry|tonumber),fails:$fails,reg:$reg}')"
}
ledger_item() {  # $1=item-id $2=assertion $3=verdict $4=graded_by — a per-checklist-item verdict
  chain_append "$(jq -nc --arg ts "$(date +%s)" --arg wp "${wp_id:-?}" --argjson i "${i:-0}" \
         --arg ev "checklist-item" --arg id "$1" --arg as "$2" --arg v "$3" --arg gb "$4" \
    '{ts:($ts|tonumber),wp:$wp,i:$i,event:$ev,item:$id,assert:$as,verdict:$v,graded_by:$gb}')"
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
  jq -n --arg r "Work package $nid. $ninstr  (Edit the code under repo/; self-check with: python3 -m pytest checks/ -q)" \
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

# Checklist gate: each item is an explicit, named control (LGPD / guardrail / business rule).
# Items with a `cmd` are DETERMINISTIC (a real check is the oracle); items with only a `judge`
# prompt are SEMANTIC and logged as non-independent/advisory — they NEVER silently block, because
# an LLM self-judgement is not an auditable control. Every item's verdict is written to the chain.
run_checklist() {  # echoes ids of FAILING deterministic items; logs every item's verdict
  local out="" n j id as cmd verdict
  n=$(jq ".work_packages[$i].checklist // [] | length" "$SPRINT")
  for ((j=0; j<n; j++)); do
    id=$(jq -r ".work_packages[$i].checklist[$j].id" "$SPRINT")
    as=$(jq -r ".work_packages[$i].checklist[$j].assert // .work_packages[$i].checklist[$j].id" "$SPRINT")
    cmd=$(jq -r ".work_packages[$i].checklist[$j].cmd // empty" "$SPRINT")
    if [ -n "$cmd" ]; then
      if ( cd "$RUN_DIR" && eval "$cmd" >/dev/null 2>&1 ); then verdict=pass; else verdict=fail; out="$out; $id"; fi
      ledger_item "$id" "$as" "$verdict" "deterministic"
    else
      # semantic item: run the (non-independent) LLM judge. ADVISORY by default — it blocks
      # advancement only when the item sets "blocking": true, and even then it is logged as
      # judge (never deterministic), so the audit trail can't mistake it for a real control.
      local crit block jout jverd jback ctxargs cf
      crit=$(jq -r ".work_packages[$i].checklist[$j].judge" "$SPRINT")
      block=$(jq -r ".work_packages[$i].checklist[$j].blocking // false" "$SPRINT")
      ctxargs=()
      while IFS= read -r cf; do [ -n "$cf" ] && ctxargs+=(--file "$RUN_DIR/$cf"); done < <(
        jq -r ".work_packages[$i].checklist[$j].context // empty | if type==\"array\" then .[] else . end" "$SPRINT")
      jout=$(python3 "$JUDGE" --criterion "$crit" "${ctxargs[@]}" 2>/dev/null)
      jverd=$(printf '%s' "$jout" | jq -r '.verdict // "advisory"' 2>/dev/null); [ -z "$jverd" ] && jverd=advisory
      jback=$(printf '%s' "$jout" | jq -r '.backend // "judge"' 2>/dev/null); [ -z "$jback" ] && jback=judge
      [ "$block" = "true" ] && [ "$jverd" = "fail" ] && out="$out; $id"
      ledger_item "$id" "$as" "$jverd" "judge:$jback(non-independent)"
    fi
  done
  printf '%s' "$out"
}

fails=$(run_dods ".work_packages[$i].dod[].cmd")
fails="$fails$(run_checklist)"
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
msg="Work package $wp_id is NOT done. Still failing: ${fails}${reg:+ ; regressions:${reg}}. Fix the code under repo/ so these pass (run: python3 -m pytest checks/ -q), then finish. Instructions: $instr"
jq -n --arg r "$msg" '{decision:"block", reason:$r}'
exit 0
