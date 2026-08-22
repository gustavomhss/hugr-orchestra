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
  # `gen` — the sprint generation this entry was evaluated under. sprint.json is re-read fresh on
  # every fire, so without this a verdict cannot be attributed to a version of the plan and a mutated
  # chain is indistinguishable from a static one. Resolved once per process (a fire evaluates exactly
  # one generation) and stamped INSIDE the hashed body. Absent `gen` in sprint.json reads as 0, so an
  # un-migrated sprint keeps working. See docs/control-plane.md §3.
  if [ -z "${RELAY_GEN:-}" ]; then
    RELAY_GEN=$(jq -r '.gen // 0' "$SPRINT" 2>/dev/null || echo 0)
    case "$RELAY_GEN" in ''|*[!0-9]*) RELAY_GEN=0 ;; esac
  fi
  last=$(tail -1 "$LEDGER" 2>/dev/null || true)
  prev=$(printf '%s' "$last" | jq -r '.h // empty' 2>/dev/null); [ -z "$prev" ] && prev="GENESIS"
  seq=$(printf '%s' "$last" | jq -r '.seq // -1' 2>/dev/null); [ -z "$seq" ] && seq=-1; seq=$((seq + 1))
  # Stamp the MAC algorithm INTO the hashed body (non-secret — the algorithm name, never the key). This
  # binds the mode to the artifact: an attacker who re-seals a keyed chain in plain mode must change
  # `mac` too, which an auditor holding the key detects as a downgrade (verify_ledger.py). `seq` makes
  # the entry count explicit so tail-truncation is detectable.
  if [ -n "${RELAY_LEDGER_KEY:-}" ]; then macalg="hmac-sha256"; else macalg="sha256"; fi
  body=$(printf '%s' "$1" | jq -c --arg p "$prev" --argjson s "$seq" --arg m "$macalg" \
           --argjson g "$RELAY_GEN" '. + {gen:$g, prev:$p, seq:$s, mac:$m}') || return 0
  if [ -n "${RELAY_LEDGER_KEY:-}" ]; then
    h=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$RELAY_LEDGER_KEY" | sed -E 's/.* //')
  else
    h=$(printf '%s' "$body" | shasum -a 256 | cut -d' ' -f1)
  fi
  # Do NOT swallow a failed append: a verdict silently dropped from the chain weakens "every verdict is
  # on the chain". If the write fails (disk full, perms), record it loudly to the log + stderr so the
  # loss is visible rather than masked. (No flock: it is absent on macOS, the primary target; a per-token
  # ledger is written by one sequential subagent, so concurrent appends to the same file are not a normal
  # path — a rare double-stop fails CLOSED as a spurious TAMPERED, never as an accepted forgery.)
  if ! printf '%s' "$body" | jq -c --arg h "$h" '. + {h:$h}' >> "$LEDGER" 2>/dev/null; then
    printf '[%s] RELAY LEDGER APPEND FAILED for %s\n' "$(date +%s)" "$LEDGER" >> "${LOG:-/dev/stderr}" 2>/dev/null || true
    printf 'relay: ledger append failed (%s) — a verdict was not recorded\n' "$LEDGER" >&2
    return 1
  fi
}

# Evaluate the current WP's checklist. Each item with a `cmd` is DETERMINISTIC (a real check is the
# oracle, blocks on fail); an item with only a `judge` prompt is SEMANTIC — run by the non-independent
# LLM judge, ADVISORY by default, blocking only when it sets "blocking": true, and always logged as
# judge (never deterministic) so the audit trail can't mistake it for a real control. Echoes the
# failing item ids; logs every verdict through the caller's ledger_item().
# sha256 of a string, bare hex. Used to put the ORACLE on the chain without putting the command
# itself there: a `cmd` can carry absolute paths or secrets, and sameness is all an audit needs.
relay_oracle_sha() {  # $1 = the oracle text (a cmd, or a judge criterion)
  printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1
}

# Where a control came from. `origin` is explicit if the author set it (an orchestrator injecting a
# control stamps `injected:<actor>`); otherwise the policy bundle that prepended it
# (bin/relay-policy.py already writes `.policy` — until now nothing read it); otherwise the sprint.
relay_control_origin() {  # $1 = jq path to the control
  local o p
  o=$(jq -r "$1.origin // empty" "$SPRINT")
  if [ -n "$o" ]; then printf '%s' "$o"; return; fi
  p=$(jq -r "$1.policy // empty" "$SPRINT")
  if [ -n "$p" ]; then printf 'policy:%s' "$p"; return; fi
  printf 'sprint'
}

relay_run_checklist() {
  local out="" n j id as cmd verdict oracle origin
  n=$(jq ".work_packages[$i].checklist // [] | length" "$SPRINT")
  for ((j=0; j<n; j++)); do
    id=$(jq -r ".work_packages[$i].checklist[$j].id" "$SPRINT")
    as=$(jq -r ".work_packages[$i].checklist[$j].assert // .work_packages[$i].checklist[$j].id" "$SPRINT")
    cmd=$(jq -r ".work_packages[$i].checklist[$j].cmd // empty" "$SPRINT")
    origin=$(relay_control_origin ".work_packages[$i].checklist[$j]")
    if [ -n "$cmd" ]; then
      oracle=$(relay_oracle_sha "$cmd")
      if ( cd "$RUN_DIR" && eval "$cmd" >/dev/null 2>&1 ); then verdict=pass; else verdict=fail; out="$out; $id"; fi
      ledger_item "$id" "$as" "$verdict" "deterministic" "$oracle" "$origin"
    else
      local crit block jout jverd jback ctxargs cf
      crit=$(jq -r ".work_packages[$i].checklist[$j].judge" "$SPRINT")
      oracle=$(relay_oracle_sha "$crit")
      block=$(jq -r ".work_packages[$i].checklist[$j].blocking // false" "$SPRINT")
      ctxargs=()
      while IFS= read -r cf; do [ -n "$cf" ] && ctxargs+=(--file "$RUN_DIR/$cf"); done < <(
        jq -r ".work_packages[$i].checklist[$j].context // empty | if type==\"array\" then .[] else . end" "$SPRINT")
      jout=$(python3 "$JUDGE" --criterion "$crit" "${ctxargs[@]}" 2>/dev/null || true)
      jverd=$(printf '%s' "$jout" | jq -r '.verdict // "advisory"' 2>/dev/null); [ -z "$jverd" ] && jverd=advisory
      jback=$(printf '%s' "$jout" | jq -r '.backend // "judge"' 2>/dev/null); [ -z "$jback" ] && jback=judge
      [ "$block" = "true" ] && [ "$jverd" = "fail" ] && out="$out; $id"
      ledger_item "$id" "$as" "$jverd" "judge:$jback(non-independent)" "$oracle" "$origin"
    fi
  done
  printf '%s' "$out"
}
