#!/usr/bin/env bash
# relay-gate.sh — the shared gate core, sourced by both Relay hooks.
#
# The benchmark hook (benchmark/relay_hook.sh, a plain Stop, single-runner) and the production arm hook
# (bin/relay-arm-hook.sh, SubagentStop, multi-token) historically duplicated the entire gate mechanism.
# A fix to the hash chain or the checklist evaluation had to land in two places — a real maintenance
# debt and a credibility risk (doc says one mechanism; two copies drift). This library is the single
# source of truth for the two things that are byte-identical between them:
#
#   relay_chain_append <json-body>   — append one entry to the tamper-evident hash chain ($LEDGER),
#                                       PLAIN SHA-256 or keyed HMAC-SHA256 when RELAY_LEDGER_KEY is set.
#   relay_run_checklist               — evaluate work_packages[$i].checklist against $RUN_DIR; echo the
#                                       ids of FAILING deterministic (and blocking-judge) items; log
#                                       every item's verdict via `ledger_item` (defined by the caller).
#
# What stays in each hook (because it legitimately differs): the event/keying (Stop+counter vs
# SubagentStop+token), the per-event ledger envelope (`ledger`/`ledger_item` — the benchmark omits the
# `arm` field by design, so its ledger format and historical hashes are unchanged), and the terminal
# behavior (advance/escalate/archive). The caller must define, before sourcing-time use:
#   $LEDGER $SPRINT $RUN_DIR $i  (vars) and  ledger_item()  (function).

# Append one compact JSON body (no prev/seq/h) onto the chain. Same algorithm both hooks always used:
# prev = previous line's h (GENESIS first), seq = running 0-based index, h = MAC over the body.
relay_chain_append() {  # $1 = compact JSON body
  local last prev seq macalg body h
  last=$(tail -1 "$LEDGER" 2>/dev/null || true)
  prev=$(printf '%s' "$last" | jq -r '.h // empty' 2>/dev/null); [ -z "$prev" ] && prev="GENESIS"
  seq=$(printf '%s' "$last" | jq -r '.seq // -1' 2>/dev/null); [ -z "$seq" ] && seq=-1; seq=$((seq + 1))
  # Stamp the MAC algorithm INTO the hashed body (non-secret — the algorithm name, never the key). This
  # binds the mode to the artifact: an attacker who re-seals a keyed chain in plain mode must change
  # `mac` too, which an auditor holding the key detects as a downgrade (verify_ledger.py). `seq` makes
  # the entry count explicit so tail-truncation is detectable.
  if [ -n "${RELAY_LEDGER_KEY:-}" ]; then macalg="hmac-sha256"; else macalg="sha256"; fi
  body=$(printf '%s' "$1" | jq -c --arg p "$prev" --argjson s "$seq" --arg m "$macalg" \
           '. + {prev:$p, seq:$s, mac:$m}') || return 0
  if [ -n "${RELAY_LEDGER_KEY:-}" ]; then
    h=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$RELAY_LEDGER_KEY" | sed -E 's/.* //')
  else
    h=$(printf '%s' "$body" | shasum -a 256 | cut -d' ' -f1)
  fi
  printf '%s' "$body" | jq -c --arg h "$h" '. + {h:$h}' >> "$LEDGER" 2>/dev/null || true
}

# Evaluate the current WP's checklist. Each item with a `cmd` is DETERMINISTIC (a real check is the
# oracle, blocks on fail); an item with only a `judge` prompt is SEMANTIC — run by the non-independent
# LLM judge, ADVISORY by default, blocking only when it sets "blocking": true, and always logged as
# judge (never deterministic) so the audit trail can't mistake it for a real control. Echoes the
# failing item ids; logs every verdict through the caller's ledger_item().
relay_run_checklist() {
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
