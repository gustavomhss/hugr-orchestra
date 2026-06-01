#!/usr/bin/env bash
# Relay ARM hook — the production SubagentStop gate for per-agent checklist chains.
#
# WHY THIS EXISTS: a TechLead-style orchestrator fans out many async subagents (different models,
# different worktrees) and wants EACH one held to its OWN ordered chain of checklists before it is
# allowed to finish. Subagents spawned via the Task tool share the parent session's cwd, so cwd does
# NOT discriminate them — but the SubagentStop payload's `transcript_path` IS unique per subagent.
# So an "arm" is bound to its subagent by a TOKEN embedded in that subagent's prompt (and therefore
# its transcript). The orchestrator writes the arm with the `relay-arm` MCP tool; this hook reads it.
#
# FLOW (one fire = one subagent stop):
#   1. read the SubagentStop JSON payload on stdin -> transcript_path
#   2. find  RELAY-ARM:<token>  in that transcript (the orchestrator put it in the subagent's prompt)
#   3. load the arm at  $RELAY_ARMS_DIR/<token>/  (sprint.json = the chain; meta.json = workdir; state)
#   4. run the CURRENT gate in the chain (its checklist), cwd = the arm's workdir
#        - all checks pass -> advance the chain (reveal next gate, or COMPLETE on the last)
#        - something fails  -> re-block with exactly what's missing (bounded by retry_budget)
#   5. every verdict is appended to a per-arm tamper-evident hash-chain ledger (the compliance trace)
#
# A stop with no RELAY-ARM token, or an unknown token, is left completely alone (exit 0) — this hook
# never interferes with non-armed agents.
set -euo pipefail

ARMS_DIR="${RELAY_ARMS_DIR:-$HOME/.relay/arms}"
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JUDGE="${RELAY_JUDGE:-$HOOK_DIR/../benchmark/judge.py}"

payload="$(cat 2>/dev/null || true)"   # the SubagentStop JSON on stdin
transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null || true)"

# Resolve the arm token. Primary: scan the subagent's transcript for the marker the orchestrator
# embedded. Fallback: an explicit RELAY_ARM_TOKEN env (useful for tests / claude -p sessions).
token="${RELAY_ARM_TOKEN:-}"
if [ -z "$token" ] && [ -n "$transcript" ] && [ -f "$transcript" ]; then
  token="$(grep -oE 'RELAY-ARM:[A-Za-z0-9_.-]+' "$transcript" 2>/dev/null | tail -1 | cut -d: -f2 || true)"
fi
[ -z "$token" ] && exit 0   # not a relay-armed subagent — do not interfere

ARM="$ARMS_DIR/$token"
SPRINT="$ARM/sprint.json"
[ -f "$SPRINT" ] || exit 0   # unknown/expired token — leave the agent alone

RUN_DIR="$(jq -r '.workdir // "."' "$ARM/meta.json" 2>/dev/null)"
[ -d "$RUN_DIR" ] || RUN_DIR="."
LOG="$ARM/relay.log"; LEDGER="$ARM/ledger.jsonl"
fails=""; reg=""

# ---- per-arm tamper-evident ledger (same hash-chain as benchmark/relay_hook.sh) ----
chain_append() {  # $1 = compact JSON body (no prev/seq/h)
  local last prev seq body h
  last=$(tail -1 "$LEDGER" 2>/dev/null || true)
  prev=$(printf '%s' "$last" | jq -r '.h // empty' 2>/dev/null); [ -z "$prev" ] && prev="GENESIS"
  seq=$(printf '%s' "$last" | jq -r '.seq // -1' 2>/dev/null); [ -z "$seq" ] && seq=-1; seq=$((seq + 1))
  body=$(printf '%s' "$1" | jq -c --arg p "$prev" --argjson s "$seq" '. + {prev:$p, seq:$s}') || return 0
  if [ -n "${RELAY_LEDGER_KEY:-}" ]; then
    h=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$RELAY_LEDGER_KEY" | sed -E 's/.* //')
  else
    h=$(printf '%s' "$body" | shasum -a 256 | cut -d' ' -f1)
  fi
  printf '%s' "$body" | jq -c --arg h "$h" '. + {h:$h}' >> "$LEDGER" 2>/dev/null || true
}
ledger() {  # $1=event  $2=retry(optional)
  chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "${wp_id:-?}" \
         --argjson i "${i:-0}" --arg ev "$1" --arg retry "${2:-0}" --arg fails "$fails" --arg reg "$reg" \
    '{ts:($ts|tonumber),arm:$tok,wp:$wp,i:$i,event:$ev,retry:($retry|tonumber),fails:$fails,reg:$reg}')"
}
ledger_item() {  # $1=id $2=assert $3=verdict $4=graded_by
  chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "${wp_id:-?}" \
         --argjson i "${i:-0}" --arg ev "checklist-item" --arg id "$1" --arg as "$2" --arg v "$3" --arg gb "$4" \
    '{ts:($ts|tonumber),arm:$tok,wp:$wp,i:$i,event:$ev,item:$id,assert:$as,verdict:$v,graded_by:$gb}')"
}

i=$(cat "$ARM/counter" 2>/dev/null || echo 0)
nwp=$(jq '.work_packages | length' "$SPRINT")
rb=$(jq -r '.retry_budget // 3' "$SPRINT")
[ "$i" -ge "$nwp" ] && exit 0   # chain already complete
wp_id=$(jq -r ".work_packages[$i].id" "$SPRINT")

# Retain the finished trace in a durable corpus (the verified-trace data flywheel). Per-arm state
# under $ARMS_DIR is volatile (a token dir can be cleaned), so on every TERMINAL outcome
# (chain-complete or escalate) we copy the ledger + sprint + meta into $RELAY_CORPUS_DIR, keyed by
# token + the chain head, append-only. This is the RL-signal substrate — runs are no longer ephemeral.
archive_trace() {  # $1 = outcome (complete|escalate)
  local corpus="${RELAY_CORPUS_DIR:-$HOME/.relay/corpus}"
  local head dest
  head=$(tail -1 "$LEDGER" 2>/dev/null | jq -r '.h // "nohash"' 2>/dev/null); head=${head:0:12}
  dest="$corpus/${token}-${head}"
  mkdir -p "$dest" 2>/dev/null || return 0
  cp "$LEDGER" "$dest/ledger.jsonl" 2>/dev/null || true
  cp "$SPRINT" "$dest/sprint.json" 2>/dev/null || true
  cp "$ARM/meta.json" "$dest/meta.json" 2>/dev/null || true
  printf '{"outcome":"%s","token":"%s","head":"%s","ts":%s}' "$1" "$token" "$head" "$(date +%s)" \
    > "$dest/outcome.json" 2>/dev/null || true
}

advance() {  # current gate passed: reveal the next, or finish the chain
  local ni=$((i+1)); echo "$ni" > "$ARM/counter"
  if [ "$ni" -ge "$nwp" ]; then
    printf '[%s] arm %s: gate %s OK -> CHAIN COMPLETE\n' "$(date +%s)" "$token" "$wp_id" >> "$LOG"
    ledger sprint-complete; archive_trace complete; exit 0
  fi
  local nid ninstr
  nid=$(jq -r ".work_packages[$ni].id" "$SPRINT")
  ninstr=$(jq -r ".work_packages[$ni].instructions // \"\"" "$SPRINT")
  printf '[%s] arm %s: gate %s OK -> reveal %s\n' "$(date +%s)" "$token" "$wp_id" "$nid" >> "$LOG"
  ledger advance-reveal
  jq -n --arg r "Relay gate '$wp_id' passed. Next gate: $nid. $ninstr" '{decision:"block", reason:$r}'
  exit 0
}

# ---- gate evaluation (checklist of named controls; deterministic cmd OR advisory judge) ----
run_checklist() {  # echoes ids of FAILING deterministic (or blocking-judge) items; logs each verdict
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
      local crit block jout jverd jback ctxargs cf
      crit=$(jq -r ".work_packages[$i].checklist[$j].judge" "$SPRINT")
      block=$(jq -r ".work_packages[$i].checklist[$j].blocking // false" "$SPRINT")
      ctxargs=()
      while IFS= read -r cf; do [ -n "$cf" ] && ctxargs+=(--file "$RUN_DIR/$cf"); done < <(
        jq -r ".work_packages[$i].checklist[$j].context // empty | if type==\"array\" then .[] else . end" "$SPRINT")
      jout=$(python3 "$JUDGE" --criterion "$crit" "${ctxargs[@]}" 2>/dev/null || true)
      jverd=$(printf '%s' "$jout" | jq -r '.verdict // "advisory"' 2>/dev/null); [ -z "$jverd" ] && jverd=advisory
      jback=$(printf '%s' "$jout" | jq -r '.backend // "judge"' 2>/dev/null); [ -z "$jback" ] && jback=judge
      [ "$block" = "true" ] && [ "$jverd" = "fail" ] && out="$out; $id"
      ledger_item "$id" "$as" "$jverd" "judge:$jback(non-independent)"
    fi
  done
  printf '%s' "$out"
}

fails="$(run_checklist)"
# regression guard: re-run all EARLIER gates' deterministic checks (keep-best / no backsliding).
# Reports the failing item's id (tab-joined id\tcmd so we keep the name, not the raw command).
if [ "$i" -gt 0 ]; then
  while IFS=$'\t' read -r rid rcmd; do
    [ -z "$rcmd" ] && continue
    ( cd "$RUN_DIR" && eval "$rcmd" >/dev/null 2>&1 ) || reg="$reg; $rid"
  done < <(jq -r ".work_packages[range(0;$i)].checklist[]? | select(.cmd) | \"\(.id)\t\(.cmd)\"" "$SPRINT")
fi

if [ -z "$fails" ] && [ -z "$reg" ]; then advance; fi

# something failed -> re-block (bounded). Escalate to the human when the budget is spent.
r=$(cat "$ARM/retry_$i" 2>/dev/null || echo 0)
if [ "$r" -ge "$rb" ]; then
  printf '[%s] arm %s: gate %s ESCALATE (budget=%s) fails:%s reg:%s\n' "$(date +%s)" "$token" "$wp_id" "$rb" "$fails" "$reg" >> "$LOG"
  ledger escalate "$rb"; archive_trace escalate; exit 0
fi
echo $((r+1)) > "$ARM/retry_$i"
instr=$(jq -r ".work_packages[$i].instructions // \"\"" "$SPRINT")
printf '[%s] arm %s: gate %s FAIL (retry %s) fails:%s reg:%s\n' "$(date +%s)" "$token" "$wp_id" "$((r+1))" "$fails" "$reg" >> "$LOG"
ledger gate-fail "$((r+1))"
msg="Relay gate '$wp_id' is NOT satisfied. Still failing:${fails:- (none)}${reg:+ ; regressions:${reg}}. Address these, then finish.${instr:+ Instructions: $instr}"
jq -n --arg r "$msg" '{decision:"block", reason:$r}'
exit 0
