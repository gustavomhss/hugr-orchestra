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
. "$HOOK_DIR/../lib/relay-gate.sh"   # shared gate core: relay_chain_append + relay_run_checklist

payload="$(cat 2>/dev/null || true)"   # the SubagentStop JSON on stdin
# `agent_transcript_path` is the SUBAGENT'S OWN transcript; `transcript_path` is the SESSION's. They
# are different files, and reading the wrong one is what broke a real fan-out: a parent dispatching
# two armed subagents necessarily writes BOTH markers in its own text, so the session transcript held
# 6x armA and 8x armB while each subagent's own transcript held exactly one. Binding by first
# occurrence in the session then pushed armB's agent through armA's chain, and it dutifully created
# the other arm's file to clear a gate that was never its own.
#
# The old rule — "first marker, because the orchestrator embeds it in the subagent's opening prompt"
# — was right about the intent and wrong about the source. It survives only as the tiebreak WITHIN a
# transcript that legitimately quotes its own marker more than once.
transcript="$(printf '%s' "$payload" | jq -r '.agent_transcript_path // empty' 2>/dev/null || true)"
[ -n "$transcript" ] && [ -f "$transcript" ] || \
  transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null || true)"
agent_id="$(printf '%s' "$payload" | jq -r '.agent_id // empty' 2>/dev/null || true)"

token="${RELAY_ARM_TOKEN:-}"   # explicit override, for tests and plain `claude -p` Stop-hook sessions
if [ -z "$token" ] && [ -n "$transcript" ] && [ -f "$transcript" ]; then
  seen="$(grep -oE 'RELAY-ARM:[A-Za-z0-9_.-]+' "$transcript" 2>/dev/null | cut -d: -f2 | sort -u || true)"
  n=$(printf '%s' "$seen" | grep -c . || true)
  if [ "${n:-0}" -gt 1 ]; then
    # FAIL CLOSED. Enforcing the wrong chain is worse than enforcing none: the agent is told to
    # satisfy work it was never given, and the ledger records another arm's verdicts under this stop.
    printf 'relay: this transcript names %s different arms (%s) and nothing says which is this ' \
      "$n" "$(printf '%s' "$seen" | tr '\n' ' ')" >&2
    printf 'agent'"'"'s. Refusing to guess. Dispatch each subagent with its own marker, and let the hook\n' >&2
    printf '      read agent_transcript_path rather than the session transcript.\n' >&2
    exit 0
  fi
  token="$(printf '%s' "$seen" | head -1)"
fi
[ -z "$token" ] && exit 0   # not a relay-armed subagent — do not interfere
# Reject path-traversal tokens (charset allows dots; `..` would escape the arms dir).
case "$token" in *..*|.) exit 0 ;; esac

ARM="$ARMS_DIR/$token"
SPRINT="$ARM/sprint.json"
[ -f "$SPRINT" ] || exit 0   # unknown/expired token — leave the agent alone

# Serialize the entire evaluation, including binding, release, retries, and cost attribution.
# The shared .chain.lock still protects each ledger append; it does not protect ARM state.
RUN_LOCK="$ARM/.run.lock"
RUN_LOCK_OWNED=0
ROUND_BUF=""
cleanup() {
  if [ -n "$ROUND_BUF" ]; then rm -f "$ROUND_BUF" || true; fi
  if [ "$RUN_LOCK_OWNED" = 1 ]; then rmdir "$RUN_LOCK" 2>/dev/null || true; fi
}
trap cleanup EXIT
if ! mkdir "$RUN_LOCK" 2>/dev/null; then
  printf 'relay: another evaluation holds %s\n' "$RUN_LOCK" >&2
  printf 'relay: if no evaluation is running, remove that directory and retry.\n' >&2
  exit 3
fi
RUN_LOCK_OWNED=1

# An arm belongs to ONE agent. A second agent arriving at the same token is either a mis-dispatch or
# a leaked marker, and both are things to stop on rather than serve — a shared arm means two agents
# racing one position file, which is the single-writer invariant the ledger depends on.
if [ -n "$agent_id" ]; then
  bound=$(cat "$ARM/agent_id" 2>/dev/null || true)
  if [ -z "$bound" ]; then
    printf '%s' "$agent_id" > "$ARM/agent_id"
  elif [ "$bound" != "$agent_id" ]; then
    printf 'relay: arm %s was opened by agent %s and this stop is from %s. Refusing.\n' \
      "$token" "$bound" "$agent_id" >&2
    exit 0
  fi
fi

RUN_DIR="$(jq -r '.workdir // "."' "$ARM/meta.json" 2>/dev/null)"
[ -d "$RUN_DIR" ] || RUN_DIR="."
LOG="$ARM/relay.log"; LEDGER="$ARM/ledger.jsonl"
fails=""; reg=""

# ---- per-arm tamper-evident ledger (hash chain from lib/relay-gate.sh; envelope carries the token) ----
# `macro` is added ONLY when the current WP declares one (V1 — docs/relay-v2.md §2.2). The envelope
# is built by lib/relay-gate.sh's chain append, which benchmark/relay_hook.sh also uses, and that
# hook's historical ledger hashes must stay byte-comparable. A sprint with no macros therefore
# produces exactly the bytes it produced before — same reasoning as the benchmark omitting `arm`.
# Both fields are optional and both are omitted when unset, so a v1 sprint's ledger bytes — and
# benchmark/relay_hook.sh's historical hashes — are unchanged.
add_macro() {
  if [ -n "${wp_macro:-}" ] && [ -n "${wp_kind:-}" ]; then
    jq -c --arg m "$wp_macro" --arg k "$wp_kind" '. + {macro:$m, kind:$k}'
  elif [ -n "${wp_macro:-}" ]; then
    jq -c --arg m "$wp_macro" '. + {macro:$m}'
  elif [ -n "${wp_kind:-}" ]; then
    jq -c --arg k "$wp_kind" '. + {kind:$k}'
  else
    cat
  fi
}

ledger() {  # $1=event  $2=retry(optional)  $3=round-sha(optional)  $4=repeat-count(optional)
  local body
  body=$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "${wp_id:-?}" \
         --argjson i "${i:-0}" --arg ev "$1" --arg retry "${2:-0}" --arg fails "$fails" --arg reg "$reg" \
         --arg round "${3:-}" --arg rep "${4:-0}" --arg bref "${LEDGER_BASE:-}" \
         --argjson cost "${COST_JSON:-null}" --argjson el "${ELAPSED:-0}" \
    '{ts:($ts|tonumber),arm:$tok,wp:$wp,i:$i,event:$ev,retry:($retry|tonumber),fails:$fails,reg:$reg,round:$round,repeat:($rep|tonumber)}
     | if $bref == "" then . else . + {base_ref:$bref} end
     | if $cost == null then . else . + {cost:$cost} end
     | if $el == null then . else . + {elapsed_s:$el} end' \
     | add_macro) || return 1
  relay_chain_append "$body" || return 1
}

# ---- Round collapse (R7 — docs/control-plane.md §8) ---------------------------------------------
# A fire that changes nothing must not grow the record. Temporal writes only the FIRST workflow-task
# failure to history and counts the rest, which is why a stuck execution shows one failure event and
# an attempt counter in the thousands; relay used to append a full checklist round plus a gate-fail on
# every fire, so the D2 livelock wrote twelve byte-identical rounds. So `ledger_item` no longer appends
# directly: it BUFFERS the round, and the decision path below either flushes it (the situation changed,
# or we are terminating and want the full evidence) or discards it in favour of one `gate-fail-repeat`
# entry carrying the round's sha. The sha is the audit link — the collapsed round is on the chain once,
# under that same value, so nothing is lost, only repeated.
# The buffer is a FILE, not a shell array: `relay_run_checklist` is consumed through a command
# substitution, so it runs in a subshell and any in-memory append it made would be discarded with it.
ROUND_BUF="$(mktemp "${TMPDIR:-/tmp}/relay-round.XXXXXX")"
ledger_item() {  # $1=id $2=assert $3=verdict $4=graded_by $5=oracle-sha $6=origin $7=scope(optional) $8=artifact-sha(optional)
  # `scope` records the artifact a judge control was narrowed to (V5) and `artifact` records the
  # sha256 of what was AT those paths when it was graded. Both are emitted only when set, so a
  # deterministic control's entry is byte-identical to what it always was.
  jq -nc --arg tok "$token" --arg wp "${wp_id:-?}" \
         --argjson i "${i:-0}" --arg ev "checklist-item" --arg id "$1" --arg as "$2" --arg v "$3" --arg gb "$4" \
         --arg orc "${5:-}" --arg org "${6:-sprint}" --arg scope "${7:-}" --arg art "${8:-}" \
    '{arm:$tok,wp:$wp,i:$i,event:$ev,item:$id,assert:$as,verdict:$v,graded_by:$gb,oracle:$orc,origin:$org}
     | if $scope == "" then . else . + {scope:$scope} end
     | if $art == "" then . else . + {artifact:$art} end' \
     | add_macro >> "$ROUND_BUF" || return 1
}
# A regression re-run IS a verdict — it re-executes a real control and its result changes the
# decision — but it used to be recorded nowhere: only the failing ids reached the chain, inside the
# gate-fail entry's `reg` string, and a re-run that PASSED left no trace at all. That is the gap that
# let a swapped control launder itself: `relay verify` saw one oracle for the control (from the fire
# that first passed it) and had nothing to compare against. It is a DISTINCT event from
# `checklist-item` so that "the final verdict for this control" (bin/relay control_report, the corpus
# exporter, the dash) keeps meaning "as graded at its own gate" — a re-run reports on kept work, not
# on a gate being cleared. It goes through the same buffer so `round_shape` sees it: a re-run whose
# oracle changed must yield a different round sha, or collapse would hide exactly what this records.
ledger_reg_item() {  # $1=id $2=verdict $3=oracle-sha $4=origin
  jq -nc --arg tok "$token" --arg wp "${wp_id:-?}" \
         --argjson i "${i:-0}" --arg ev "regression-item" --arg id "$1" --arg v "$2" \
         --arg orc "${3:-}" --arg org "${4:-sprint}" \
    '{arm:$tok,wp:$wp,i:$i,event:$ev,item:$id,verdict:$v,graded_by:"deterministic",oracle:$orc,origin:$org}' \
     | add_macro >> "$ROUND_BUF" || return 1
}
round_flush() {  # append the buffered round to the chain, stamping each entry at flush time
  local b stamped
  while IFS= read -r b; do
    [ -n "$b" ] || continue
    stamped=$(printf '%s' "$b" | jq -c --argjson ts "$(date +%s)" '{ts:$ts} + .') || return 1
    relay_chain_append "$stamped" || return 1
  done < "$ROUND_BUF"
  : > "$ROUND_BUF" || return 1
}
round_shape() {  # $1=fails $2=reg — sha over the verdicts AND the failure set they produced
  # Deliberately excludes `ts`: two fires are "the same round" when every control was graded the same
  # way by the same oracle and the same things are still failing. A judge that flips its verdict, a
  # control whose oracle changed, or a different failing set all yield a different sha and are recorded
  # in full — collapse only ever hides a repetition.
  { cat "$ROUND_BUF"; printf '%s\n%s\n' "$1" "$2"; } | shasum -a 256 | cut -d' ' -f1
}

# ---- What this state cost -----------------------------------------------------------------------
# The record says precisely whether a state was EARNED and nothing at all about what earning it cost.
# Both halves are obtainable and neither was being taken: elapsed is a subtraction over `ts`, already
# on every entry, and tokens are in the agent's transcript as `usage` per assistant turn — a file
# this hook already opens to find the arm's marker.
#
# Attribution is free because of where this hook stands: it fires when a state ENDS, so every turn in
# the transcript since the previous fire belongs to the state that was open. `$ARM/tr_cursor` is the
# count of rows already charged, and it is the whole mechanism.
#
# The subagent transcript is preferred for the same reason the token binding prefers it: the session
# transcript carries every agent's turns, and charging a state from it bills this arm for another
# agent's work.
#
# A run with NO usage data records no cost fields at all, rather than zeros. A zero is a measurement;
# an absent field is an admission — and it keeps a v1 arm's bytes, and the benchmark hook's
# historical hashes, unchanged.
COST_JSON=""
if [ -n "$transcript" ] && [ -f "$transcript" ]; then
  cur=$(cat "$ARM/tr_cursor" 2>/dev/null || echo 0); case "$cur" in ''|*[!0-9]*) cur=0 ;; esac
  total=$(wc -l < "$transcript" | tr -d ' ')
  # "The window was read and it was empty" is a different fact from "this run records no usage at
  # all", and they must not collapse into the same absent field. If the transcript carries usage
  # anywhere, an empty window is a real zero.
  has_usage=$(jq -sc 'any(.[]?; (.message.usage? // .usage?) != null)' "$transcript" 2>/dev/null || echo false)
  if [ "${total:-0}" -ge "$cur" ]; then
    COST_JSON=$(tail -n +$((cur + 1)) "$transcript" 2>/dev/null | jq -sc --argjson seen "${has_usage:-false}" '
      [ .[]? | .message.usage? // .usage? | select(. != null) ] as $u
      | if ($u | length) == 0 then (if $seen then
             {"in":0,"out":0,"cache_read":0,"cache_write":0,"turns":0} else empty end)
        else { "in":          ([$u[].input_tokens // 0]              | add),
               "out":         ([$u[].output_tokens // 0]             | add),
               "cache_read":  ([$u[].cache_read_input_tokens // 0]   | add),
               "cache_write": ([$u[].cache_creation_input_tokens // 0]| add),
               "turns":       ($u | length) }
        end' 2>/dev/null || true)
  fi
  printf '%s' "${total:-0}" > "$ARM/tr_cursor"
fi
# Entry time for the state being closed, so elapsed is the state's own and not the arm's.
# The FIRST state has no entry stamp — the hook speaks only once an agent has stopped, and by then
# that state has already run. So its elapsed is ABSENT rather than 0, the same rule the cost fields
# follow and the same boundary that puts the first state's base ref and instructions with the arm
# author. A 0 there would report "instant" over a state that took twenty turns.
ENTERED=$(cat "$ARM/entered_at" 2>/dev/null || true)
NOW=$(date +%s)
case "$ENTERED" in ''|*[!0-9]*) ELAPSED="null" ;; *) ELAPSED=$((NOW - ENTERED)) ;; esac
printf '%s' "$NOW" > "$ARM/entered_at"

nwp=$(jq '.work_packages | length' "$SPRINT")
rb=$(jq -r '.retry_budget // 3' "$SPRINT")

# ---- Block-cap preflight (V2 — docs/relay-v2.md §2.5) --------------------------------------------
# Retries and nonterminal advancement emit blocks, so a harness cap can affect a whole chain.
# Actual stopping depends on the harness's behavior; this preflight warns without refusing evaluation
# or changing the cap. Default/invalid values resolve to 8; cap 0 skips the risk comparison.
#
# Read the live CLAUDE_CODE_STOP_HOOK_BLOCK_CAP once per arm and attach any warning to this fire's
# next block. An offline default does not establish the live harness setting.
#
# `chain_min` retains its legacy variable/ledger field name for compatibility. Its value, nwp+1,
# is the implemented conservative warning estimate, not a minimum or a proven stopping prediction.
# A clean terminal pass emits no block, while retries can add blocks beyond the estimate.
CAP_WARN=""
if [ ! -f "$ARM/preflight" ]; then
  : > "$ARM/preflight"
  cap="${CLAUDE_CODE_STOP_HOOK_BLOCK_CAP:-8}"
  # Junk must read as the default, never as "uncapped" — failing open here would silence the warning
  # in exactly the misconfigured sessions it exists for.
  case "$cap" in ''|*[!0-9]*) cap=8 ;; esac
  chain_min=$((nwp + 1))
  if [ "$cap" -ne 0 ] && [ "$cap" -lt "$chain_min" ]; then
    relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg ev "cap-risk" \
           --argjson cap "$cap" --argjson cm "$chain_min" --argjson n "$nwp" \
      '{ts:($ts|tonumber),arm:$tok,event:$ev,cap:$cap,chain_min:$cm,work_packages:$n}')" || true
    printf '[%s] arm %s: CAP RISK — block cap %s, conservative warning estimate %s\n' \
      "$(date +%s)" "$token" "$cap" "$chain_min" >> "$LOG"
    CAP_WARN="Relay: this session's hook block cap is $cap, below the implemented conservative warning estimate of $chain_min blocks for ${nwp} gates. The estimate is not a minimum or a proven prediction: retries can add blocks, and the chain may stop before completion depending on actual harness behavior. Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0 to request an uncapped chain. "
  fi
fi

# Every block leaves through here, so the preflight warning rides the first one out without being
# threaded through each exit path.
emit_block() {  # $1 = reason
  jq -n --arg r "${CAP_WARN}$1" '{decision:"block", reason:$r}'
}

# ---- Position (R6 — docs/control-plane.md §4) ---------------------------------------------------
# The chain's position is a WP **id**, not an array index. sprint.json is re-read fresh on every fire,
# so an index silently re-aims at a different WP the moment anything is inserted ahead of it — the
# hook then demands work the runner was never given. `$ARM/counter` is still WRITTEN as a derived
# mirror for older readers (examples/fleet-chain, docs/sdk.md) but is only READ to migrate an arm
# that predates `position`.
# `position` names the current WP. `$ARM/state` records its disposition
# (active|complete|awaiting-human); legacy `escalated` is still treated as parked.
read_wp_identity() {  # $1=index $2=id output variable $3=macro output variable
  local _arm_identity_json _arm_identity_value _arm_identity_id _arm_identity_macro
  _arm_identity_json=$(jq -c ".work_packages[$1]" "$SPRINT") || return 1
  _arm_identity_value=$(printf '%s' "$_arm_identity_json" | jq -c '.id') || return 1
  if ! relay_json_string _arm_identity_id "$_arm_identity_value" || [ -z "$_arm_identity_id" ]; then
    printf 'relay: work_packages[%s] has invalid id (expected a nonempty NUL-free string)\n' "$1" >&2
    return 1
  fi
  _arm_identity_value=$(printf '%s' "$_arm_identity_json" | jq -c '.macro') || return 1
  if ! relay_json_string _arm_identity_macro "$_arm_identity_value"; then
    printf 'relay: work_packages[%s] has invalid macro (expected a NUL-free string or null)\n' "$1" >&2
    return 1
  fi
  printf -v "$2" '%s' "$_arm_identity_id" || return 1
  printf -v "$3" '%s' "$_arm_identity_macro" || return 1
}
position_value() {  # $1=index; emit compact JSON, never raw identity text through stdout
  local pid pmac
  read_wp_identity "$1" pid pmac || return 1
  # Already-qualified IDs retain their exact prefix, including CR/LF in either identity.
  jq -nc --arg id "$pid" --arg macro "$pmac" '
    if $macro != "" and ($id | startswith($macro + ".") | not)
    then $macro + "." + $id else $id end' || return 1
}
write_position() {
  local value json
  json=$(position_value "$1") || return 1
  relay_json_string value "$json" || return 1
  printf '%s' "$value" > "$ARM/position" || return 1
}

pos=""
if [ -e "$ARM/position" ] || [ -L "$ARM/position" ]; then
  position_json=$(jq -Rs . "$ARM/position") || exit 1
  relay_json_string pos "$position_json" || exit 1
fi
chain_state=$(cat "$ARM/state" 2>/dev/null || true)
if [ -z "$pos" ]; then
  ci=$(cat "$ARM/counter" 2>/dev/null || echo 0)
  case "$ci" in ''|*[!0-9]*) ci=0 ;; esac
  migration_complete=0
  if [ "$ci" -ge "$nwp" ]; then
    migration_complete=1
    if [ "$nwp" -eq 0 ]; then
      pos="?"   # Preserve the legacy empty-plan completion coordinate.
    else
      position_json=$(position_value "$((nwp - 1))") || exit 1
      relay_json_string pos "$position_json" || exit 1
    fi
  else
    position_json=$(position_value "$ci") || exit 1
    relay_json_string pos "$position_json" || exit 1
  fi
  printf '%s' "$pos" > "$ARM/position" || exit 1
  if [ "$migration_complete" = 1 ]; then
    chain_state="complete"
    printf 'complete' > "$ARM/state" || exit 1
  fi
fi
# `awaiting-human` is a state a HUMAN's action leaves (R8 — docs/control-plane.md §9). Nothing the
# agent does clears it: not a later fire, not the gate passing because the world changed underneath
# it. The original hardening's reasoning — "an escalated arm must not reopen and self-complete (no
# human in the loop)" — is preserved exactly; what changes is that the loop now exists.
#
# A person resumes the SAME gate by writing $ARM/release with a nonblank REASON. A release restores
# retry state and records provenance; it never waives a control or advances past a failing gate.
#
# `escalated` is still honored for arms written before this change.
rel_reason=""
if [ "$chain_state" = "awaiting-human" ] || [ "$chain_state" = "escalated" ]; then
  [ -f "$ARM/release" ] && rel_reason=$(tr -d '\r' < "$ARM/release" | tr '\n' ' ' | sed 's/^ *//; s/ *$//')
  if [[ ! "$rel_reason" =~ [^[:space:]] ]]; then
    if [ -f "$ARM/release" ]; then
      printf 'relay: arm %s has a release with no reason — a release must say who and why\n' "$token" >&2
    fi
    exit 0
  fi
fi
case "$chain_state" in complete) exit 0 ;; esac   # finished — leave the agent alone

# The position is TWO coordinates, `<macro>.<sub>` (V1 — docs/relay-v2.md §2.2). Resolution tries the
# WHOLE string as a WP id first: that keeps a pre-v2 arm (a bare id on disk) running, and it keeps an
# id that itself contains a dot unambiguous. Only if that misses do we read the text after the FIRST
# dot as the sub coordinate. Only a raw lookup miss permits legacy trailing-LF normalization;
# literal CR remains identity data. Retry and base keys use the actual resolved plan ID.
if ! i=$(relay_position_index "$pos"); then
  legacy_position_json=$(jq -nc --arg position "$pos" '$position | sub("\\n+$"; "")') || exit 1
  relay_json_string legacy_position "$legacy_position_json" || exit 1
  if ! i=$(relay_position_index "$legacy_position"); then
    # Keep an unresolved release on disk until its position can be repaired.
    i=-1
    wp_id="$pos"
    printf '[%s] arm %s: POSITION LOST — %s is not in gen %s of the plan\n' \
      "$(date +%s)" "$token" "$pos" "$(jq -r '.gen // 0' "$SPRINT")" >> "$LOG"
    ledger position-lost || exit 1
    printf 'relay: arm %s is positioned at %s, which no longer exists in the plan\n' "$token" "$pos" >&2
    exit 0
  fi
fi
read_wp_identity "$i" wp_id wp_macro || exit 1
pos="$wp_id"
# Use the resolved plan ID for exactly the same keys evaluation writes, even when the position
# contains a macro prefix or the ID itself contains dots. Do not resurrect a legacy index retry.
if [ -n "$rel_reason" ]; then
  # The reason remains pending until its required provenance record is durable.
  release_body=$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "$wp_id" \
         --arg ev "human-release" --arg r "$rel_reason" \
    '{ts:($ts|tonumber),arm:$tok,wp:$wp,event:$ev,reason:$r}') || exit 1
  relay_chain_append "$release_body" || exit 1
  rel_safe=$(printf '%s' "$wp_id" | tr -c 'A-Za-z0-9._-' '_') || exit 1
  rm -f "$ARM/release" || exit 1
  rm -f "$ARM/retry_$rel_safe" "$ARM/retry_$i" "$ARM/round_$rel_safe" \
        "$ARM/repeat_$rel_safe" "$ARM/blocked_$rel_safe" "$ARM/reg_retry" || exit 1
  printf 'active' > "$ARM/state" || exit 1
  chain_state=active
  printf '%s\n' "$i" > "$ARM/counter" || exit 1
  printf '[%s] arm %s: RELEASED by human at %s — %s\n' "$(date +%s)" "$token" "$wp_id" "$rel_reason" >> "$LOG"
fi
# The sub-state's KIND (V6 — docs/relay-v2.md §2.3). `execute` is the default and is left UNSET so a
# sprint that declares nothing produces the bytes it always produced. An unknown value is refused
# rather than run as execute: silently treating a typo'd `inject` as a working state means the agent
# is judged against rules it was never handed, which is the exact failure kinds exist to prevent.
wp_kind=$(jq -r ".work_packages[$i].kind // \"\"" "$SPRINT")
case "$wp_kind" in
  ''|execute) wp_kind="" ;;
  gate|review|inject) ;;
  *)
    relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "$pos" \
           --arg ev "unknown-kind" --arg k "$wp_kind" \
      '{ts:($ts|tonumber),arm:$tok,wp:$wp,event:$ev,kind:$k}')" || true
    printf '[%s] arm %s: UNKNOWN KIND %s at %s\n' "$(date +%s)" "$token" "$wp_kind" "$pos" >> "$LOG"
    printf 'relay: arm %s declares kind "%s" at %s, which this engine does not implement\n' \
      "$token" "$wp_kind" "$pos" >&2
    exit 0 ;;
esac
# Rewrite the position in canonical two-coordinate form. A pre-v2 arm carrying a bare id is migrated
# here rather than reported as POSITION LOST — the WP it names still exists, only the notation moved.
write_position "$i" || exit 1
# retry state keys by id too, so it follows the WP rather than the slot it happened to occupy.
id_safe=$(printf '%s' "$wp_id" | tr -c 'A-Za-z0-9._-' '_')
RETRY_F="$ARM/retry_$id_safe"
# The base ref a discursive control is graded against (V5 — docs/relay-v2.md §3). It is the workdir's
# HEAD at the moment this state was ENTERED, captured by the advance out of the previous state — the
# only moment the engine runs before the work happens. The FIRST state has no such moment: this hook
# speaks only once the agent has stopped, by which time the work is done. So the first state's base
# ref is the ARM AUTHOR's to record in meta.json, exactly like the first state's instructions and its
# macro's protocol. Absent, a `diff` control fails closed rather than grading a guessed artifact.
BASE_REF=$(cat "$ARM/base_$id_safe" 2>/dev/null || jq -r '.base_ref // empty' "$ARM/meta.json" 2>/dev/null)
[ -f "$RETRY_F" ] || { [ -f "$ARM/retry_$i" ] && cp "$ARM/retry_$i" "$RETRY_F"; } 2>/dev/null || true

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
  local ni=$((i+1)) nid ninstr nmacro nsafe nposition nposition_json macro_enter=""
  if [ "$ni" -lt "$nwp" ]; then
    # Validate and decode required next identities before any verdict/transition publication.
    read_wp_identity "$ni" nid nmacro || return 1
    nposition_json=$(position_value "$ni") || return 1
    relay_json_string nposition "$nposition_json" || return 1
  fi
  round_flush || return 1                          # the passing round goes on the chain, always
  if [ "$ni" -ge "$nwp" ]; then
    ledger sprint-complete || return 1
    rm -f "$ROUND_F" "$REPEAT_F" "$REG_F" || return 1
    printf '%s\n' "$ni" > "$ARM/counter" || return 1
    printf 'complete' > "$ARM/state" || return 1
    printf '[%s] arm %s: gate %s OK -> CHAIN COMPLETE\n' "$(date +%s)" "$token" "$wp_id" >> "$LOG" || return 1
    archive_trace complete || true
    exit 0
  fi
  # Prepare the next state's entry data; publish it only after required records succeed.
  nsafe=$(printf '%s' "$nid" | tr -c 'A-Za-z0-9._-' '_') || return 1
  LEDGER_BASE=$(git -C "$RUN_DIR" rev-parse HEAD 2>/dev/null || true)
  ninstr=$(jq -r ".work_packages[$ni].instructions // \"\"" "$SPRINT") || return 1
  # A macro is a SCOPE, not a loop: entering it costs one injection of its protocol, and its
  # sub-states do not each pay for it again. "First entry" is tracked by a marker file rather than
  # inferred from the position, because once amendments can reorder, position alone cannot say
  # whether this macro has been entered before.
  if [ -n "$nmacro" ]; then
    local mmark minstr
    mmark="$ARM/macro_$(printf '%s' "$nmacro" | tr -c 'A-Za-z0-9._-' '_')" || return 1
    if [ ! -f "$mmark" ]; then
      minstr=$(jq -r --arg m "$nmacro" '(.macros // []) | map(select(.id == $m)) | .[0].instructions // ""' "$SPRINT") || return 1
      macro_enter="$mmark"
      [ -n "$minstr" ] && ninstr="$minstr
$ninstr"
    fi
  fi
  # The self-check ships WITH the next state's instructions (V4 — docs/relay-v2.md §3), never after
  # a failure. Asked in advance it is a forcing function — an agent that knows what it will be asked
  # works toward it while it still can; asked only once the gate has failed it is a remedy, and
  # unaided self-correction is known to plateau or hurt. It is TEXT: no verdict, no ledger entry.
  # Recording it as one would put the agent's own account of its work on the chain, which is the one
  # thing the chain exists not to do. What grades the outcome is the gate; this probes the steps.
  local nself
  nself=$(jq -r ".work_packages[$ni].self_check // [] | map(\"  - \" + .) | join(\"\n\")" "$SPRINT") || return 1
  [ -n "$nself" ] && ninstr="$ninstr

Before you finish this state, be ready to answer:
$nself"
  # `review` cannot be enforced by this engine — it cannot spawn a fresh context — so it is stated as
  # a requirement rather than pretended to be a guarantee. A reminder that says what it is beats a
  # mechanism that claims more than it does.
  local nkind
  nkind=$(jq -r ".work_packages[$ni].kind // \"\"" "$SPRINT") || return 1
  [ "$nkind" = "review" ] && ninstr="$ninstr

This is a REVIEW state: it must be worked from a cold read of the frozen artifacts. If you produced
what is under review in this context, you are disqualified from reviewing it — say so rather than
proceeding."
  local reason="${INJECTED}Relay gate '$wp_id' passed. Next gate: $nid. $ninstr"
  local compact_after="${RELAY_COMPACT_AFTER:-6}"
  if [ "$ni" -ge "$compact_after" ]; then
    reason="$reason (checkpoint: $ni gates cleared — summarize progress and drop now-stale detail before continuing)"
  fi
  ledger advance-reveal || return 1
  if [ "$ni" -ge "$compact_after" ]; then ledger compaction-hint || return 1; fi
  rm -f "$ROUND_F" "$REPEAT_F" "$REG_F" || return 1
  printf '%s\n' "$ni" > "$ARM/counter" || return 1
  printf '%s' "$nposition" > "$ARM/position" || return 1
  if [ -n "$LEDGER_BASE" ]; then printf '%s' "$LEDGER_BASE" > "$ARM/base_$nsafe" || return 1; fi
  if [ -n "$macro_enter" ]; then : > "$macro_enter" || return 1; fi
  printf '[%s] arm %s: gate %s OK -> reveal %s\n' "$(date +%s)" "$token" "$wp_id" "$nid" >> "$LOG" || return 1
  emit_block "$reason" || return 1
  exit 0
}

# ---- inject (V6) --------------------------------------------------------------------------------
# A state with no work of its own: the engine reads the named file and delivers its ACTUAL bytes.
# This is the one kind that must not be faked. A profile that says "load protocol X" and receives an
# empty injection has silently dropped the rules the agent is about to be judged against — so a
# missing file is treated like POSITION LOST: recorded, surfaced, and never advanced past. Blocking
# instead would cost a model turn per fire against a plan defect the agent cannot repair.
#
# The file's sha goes on the chain for the same reason a control's oracle does: otherwise a run's
# rules can be swapped between states with nothing to show it, which is D1 in another costume.
#
# It runs BEFORE the gate and does not replace it. An inject WP that also declares a checklist is
# still gated by it, so `inject` can never be a way to smuggle a state past its controls.
INJECTED=""
if [ "$wp_kind" = "inject" ]; then
  # Two shapes, both "no work of its own, deliver the bytes": a FILE (a skill, a protocol) and
  # inline TEXT written in the plan. A file wins when both are given — an authoring mistake resolved
  # toward the thing that can be independently inspected and whose sha means something outside this
  # sprint. Inline text is recorded as `(inline)` with the sha of the text itself, so an injection
  # can still be attributed even when it has no file to point at.
  ifile=$(jq -r ".work_packages[$i].file // \"\"" "$SPRINT")
  itext=$(jq -r ".work_packages[$i].text // \"\"" "$SPRINT")
  ipath="$RUN_DIR/$ifile"
  if [ -z "$ifile" ] && [ -n "$itext" ]; then
    isha=$(printf '%s' "$itext" | shasum -a 256 | cut -d' ' -f1)
    relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "$wp_id" \
           --arg ev "inject" --arg f "(inline)" --arg sha "$isha" \
      '{ts:($ts|tonumber),arm:$tok,wp:$wp,event:$ev,file:$f,sha:$sha}')" || true
    INJECTED="$itext

"
  elif [ -z "$ifile" ] || [ ! -f "$ipath" ]; then
    relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "$wp_id" \
           --arg ev "inject-missing" --arg f "$ifile" \
      '{ts:($ts|tonumber),arm:$tok,wp:$wp,event:$ev,file:$f}')" || true
    printf '[%s] arm %s: INJECT MISSING %s at %s\n' "$(date +%s)" "$token" "$ifile" "$wp_id" >> "$LOG"
    printf 'relay: arm %s cannot inject "%s" at %s — %s\n' "$token" "${ifile:-(nothing declared)}" \
      "$wp_id" "$([ -z "$ifile" ] && echo 'the state declares neither a file nor inline text' \
                  || echo "the file does not exist under $RUN_DIR")" >&2
    exit 0
  else
  isha=$(shasum -a 256 "$ipath" | cut -d' ' -f1)
  relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "$wp_id" \
         --arg ev "inject" --arg f "$ifile" --arg sha "$isha" \
    '{ts:($ts|tonumber),arm:$tok,wp:$wp,event:$ev,file:$f,sha:$sha}')" || true
  INJECTED="--- $ifile ---
$(cat "$ipath")
--- end $ifile ---

"
  fi
fi

# gate evaluation: the shared checklist core (lib/relay-gate.sh) logs each verdict via ledger_item.
fails="$(relay_run_checklist)" || exit 1
# regression guard: re-run all EARLIER gates' deterministic checks (keep-best / no backsliding).
# Compact JSONL keeps each control atomic; exact decoding preserves tabs and all command LF.
# Keep-best re-runs earlier gates' checks — but only for controls this chain ACTUALLY ACCEPTED.
# Enforcing every control at a lower index instead means a control spliced in behind the cursor is
# charged as a "regression" against work the runner was never given, and since a regression-only
# failure deliberately does not burn the current gate's retry budget, nothing ever escalates: the
# runner blocks forever, at a model turn per fire. The rule is the compliance criterion — an amended
# plan binds only where the existing ledger is still a valid trace of it. A control with no recorded
# pass on this chain was never accepted, so there is nothing to regress.
if [ "$i" -gt 0 ] && [ -f "$LEDGER" ]; then
  accepted=$(jq -sc '[.[] | select(.event=="checklist-item" and .verdict=="pass") | .item] | unique' "$LEDGER")
  earlier=$(jq -c ".work_packages[range(0;$i)].checklist[]? | select(.cmd != null)" "$SPRINT")
  while IFS= read -r control; do
    [ -n "$control" ] || continue
    relay_json_string rid "$(printf '%s' "$control" | jq -c '.id')"
    relay_json_string rcmd "$(printf '%s' "$control" | jq -c '.cmd')"
    [ -z "$rcmd" ] && continue
    jq -ne --arg id "$rid" --argjson accepted "$accepted" '$accepted | index($id) != null' \
      >/dev/null || continue   # never accepted -> not a regression
    # Commands get EOF on ambient stdin, never the JSONL reader's remaining control records.
    if ( cd "$RUN_DIR" && eval "$rcmd" </dev/null >/dev/null 2>&1 ); then rverd=pass; else rverd=fail; reg="$reg; $rid"; fi
    ledger_reg_item "$rid" "$rverd" "$(relay_oracle_sha "$rcmd")" "regression" || exit 1
  done <<< "$earlier"
fi

# ---- The agent's blocked claim (V7b — docs/enforcement-model.md §6b) ----------------------------
# An agent that has genuinely hit a wall has exactly one honest move, and a design that does not
# provide it gets a dishonest one instead. The marker is `RELAY-BLOCKED: <why>` in its final message.
#
# Four rules, each a correction over an earlier draft:
#   * Parking is NOT passing. Honored only when the checklist also failed, and even then the position
#     does not move — the work is still undone.
#   * The reason is CROSS-CHECKED against the artifact, like any discursive control. "The checklist
#     also failed" is content-blind on its own: the agent usually controls whether it fails, so it
#     can under-deliver deliberately and attach a plausible blocker.
#   * The marker is NEVER silenced. A hard budget would close the honest channel at the exact moment
#     pressure peaks, which is the regime that produces covert shortcuts.
#   * Recurrence ACCELERATES to a human instead. The same wall twice is a person's problem, so the
#     budget is bypassed rather than spent — the same rule R7 applies to identical rounds.
claim=$(grep -oE 'RELAY-BLOCKED:[^"\\]*' "$transcript" 2>/dev/null | tail -1 | cut -d: -f2- \
        | sed 's/^ *//; s/ *$//' || true)
if [ -n "$claim" ]; then
  csha=$(printf '%s' "$claim" | shasum -a 256 | cut -d' ' -f1)
  honored=false; [ -n "$fails" ] && honored=true
  # Graded against the diff the gate computes, never against a description the agent supplied.
  corrob=unavailable; cgb="judge:unavailable"
  if cdiff=$(relay_compute_diff ""); then
    cjson=$(python3 "$JUDGE" --criterion "The agent claims it cannot complete this state for the following reason: '$claim'. Judge ONLY whether the artifact supports that claim. FAIL if the artifact shows the work was simply not attempted, or shows no trace of the obstacle described." --file "$cdiff" 2>/dev/null || true)
    corrob=$(printf '%s' "$cjson" | jq -r '.verdict // "unavailable"' 2>/dev/null); [ -z "$corrob" ] && corrob=unavailable
    cgb="judge:$(printf '%s' "$cjson" | jq -r '.backend // "judge"' 2>/dev/null)(non-independent)"
  fi
  relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "$wp_id" \
         --arg ev "blocked-claim" --arg r "$claim" --arg sha "$csha" --argjson hon "$honored" \
         --arg cor "$corrob" --arg gb "$cgb" \
    '{ts:($ts|tonumber),arm:$tok,wp:$wp,event:$ev,reason:$r,sha:$sha,honored:$hon,corroborated:$cor,graded_by:$gb}')" || true
  printf '[%s] arm %s: BLOCKED-CLAIM at %s (honored=%s corroborated=%s) %s\n' \
    "$(date +%s)" "$token" "$wp_id" "$honored" "$corrob" "$claim" >> "$LOG"
  # Recorded HERE because a claim on a passing gate must still reach the chain, and that path exits
  # through advance() before the escalation branch below exists. The repeat only raises a flag:
  # escalate() is defined further down, and calling it early made the hook die silently under
  # `set -e` — a gate that stops enforcing without saying so is the worst failure this file has.
  CLAIM_REPEAT=0
  if [ "$honored" = true ]; then
    CLAIM_F="$ARM/blocked_$id_safe"
    [ "$(cat "$CLAIM_F" 2>/dev/null || true)" = "$csha" ] && CLAIM_REPEAT=1
    printf '%s' "$csha" > "$CLAIM_F"
  fi
fi

rsha=$(round_shape "$fails" "$reg") || exit 1
ROUND_F="$ARM/round_$id_safe"     # sha of the last round RECORDED in full at this gate
REPEAT_F="$ARM/repeat_$id_safe"   # consecutive identical rounds collapsed since then
REG_F="$ARM/reg_retry"            # the regression path's own budget (see below)

if [ -z "$fails" ] && [ -z "$reg" ]; then advance || exit 1; fi

# Same verdicts, same failures as last fire? Then this fire carries no new information. Record the
# first occurrence in full (it is already on the chain) and count the rest against its sha.
collapsed=0; rep=0
if [ "$(cat "$ROUND_F" 2>/dev/null || true)" = "$rsha" ]; then
  collapsed=1
  rep=$(cat "$REPEAT_F" 2>/dev/null || echo 0); case "$rep" in ''|*[!0-9]*) rep=0 ;; esac
  rep=$((rep+1))
fi
# Non-terminal collapsed fire: the buffered round is a duplicate, drop it. Every other path flushes.
emit_round() {
  if [ "$collapsed" = 1 ]; then : > "$ROUND_BUF" || return 1; else round_flush || return 1; fi
}
remember_round() {  # Persist collapse metadata only after the required disposition record.
  printf '%s' "$rsha" > "$ROUND_F" || return 1
  printf '%s' "$rep" > "$REPEAT_F" || return 1
}

escalate() {  # $1 = which budget was spent (for the log) — always terminal, always full evidence
  round_flush || return 1   # terminal evidence is recorded in full even mid-collapse
  ledger escalate "$rb" "$rsha" "$rep" || return 1
  remember_round || return 1
  printf '[%s] arm %s: gate %s ESCALATE (%s budget=%s) fails:%s reg:%s\n' \
    "$(date +%s)" "$token" "$wp_id" "$1" "$rb" "$fails" "$reg" >> "$LOG" || return 1
  # A recorded escalation parks the current gate until a recorded release resumes it.
  printf 'awaiting-human' > "$ARM/state" || return 1
  printf '%s\n' "$nwp" > "$ARM/counter" || return 1
  archive_trace escalate || true
  exit 0
}

# The same wall twice is a person's problem, so this bypasses the retry budget rather than spending
# it — the claim was already recorded above, and recording it a third and fourth time would only
# defer the human it is asking for.
if [ "${CLAIM_REPEAT:-0}" = 1 ]; then escalate blocked-claim-repeat || exit 1; fi

# A regression-ONLY failure (current gate passes, an earlier gate backslid) is NOT a failure of the
# current gate: it must not burn THIS gate's retry budget nor escalate it. But "not this gate's
# budget" is not "no budget" — it had none at all, so an unfixable regression re-blocked forever at a
# model turn per fire. Relay's retry unit is a model turn, not a worker poll (docs/control-plane.md
# §8), which is why the bound here is a turn count and not a wall-clock backoff: this hook only fires
# when the agent stops, so sleeping would buy latency and save nothing. The regression path gets its
# own counter, so it terminates without ever charging the gate the runner did satisfy.
if [ -z "$fails" ] && [ -n "$reg" ]; then
  rr=$(cat "$REG_F" 2>/dev/null || echo 0); case "$rr" in ''|*[!0-9]*) rr=0 ;; esac
  if [ "$rr" -ge "$rb" ]; then escalate regression || exit 1; fi
  emit_round || exit 1
  if [ "$collapsed" = 1 ]; then ledger gate-fail-repeat "$((rr+1))" "$rsha" "$rep" || exit 1
  else                          ledger gate-fail        "$((rr+1))" "$rsha" "$rep" || exit 1; fi
  remember_round || exit 1
  printf '%s\n' "$((rr+1))" > "$REG_F" || exit 1
  printf '[%s] arm %s: gate %s REGRESSION in earlier gate (retry %s) reg:%s\n' \
    "$(date +%s)" "$token" "$wp_id" "$((rr+1))" "$reg" >> "$LOG"
  emit_block "Relay: an earlier gate regressed — restore these before finishing: ${reg#; }. (Current gate '$wp_id' is satisfied; this is a backslide in prior work.)" || exit 1
  exit 0
fi

# something failed at the current gate -> re-block (bounded). Escalate to the human when budget spent.
r=$(cat "$RETRY_F" 2>/dev/null || echo 0)
if [ "$r" -ge "$rb" ]; then escalate gate || exit 1; fi
instr=$(jq -r ".work_packages[$i].instructions // \"\"" "$SPRINT") || exit 1
emit_round || exit 1
if [ "$collapsed" = 1 ]; then ledger gate-fail-repeat "$((r+1))" "$rsha" "$rep" || exit 1
else                          ledger gate-fail        "$((r+1))" "$rsha" "$rep" || exit 1; fi
remember_round || exit 1
printf '%s\n' "$((r+1))" > "$RETRY_F" || exit 1
printf '[%s] arm %s: gate %s FAIL (retry %s) fails:%s reg:%s\n' "$(date +%s)" "$token" "$wp_id" "$((r+1))" "$fails" "$reg" >> "$LOG"
if [ "$r" -ge 1 ]; then
  # Compaction: subsequent retries of the same gate — inject only the failing ids to curb context growth.
  # The full audit trail in the ledger is unchanged; only the agent-facing reason shrinks.
  msg="Relay gate '$wp_id' still failing. Fix these: ${fails:-${reg:- (none)}}${reg:+ ; regressions:${reg}}"
else
  msg="Relay gate '$wp_id' is NOT satisfied. Still failing:${fails:- (none)}${reg:+ ; regressions:${reg}}. Address these, then finish.${instr:+ Instructions: $instr}"
fi
emit_block "$msg" || exit 1
exit 0
