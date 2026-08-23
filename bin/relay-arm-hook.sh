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
transcript="$(printf '%s' "$payload" | jq -r '.transcript_path // empty' 2>/dev/null || true)"

# Resolve the arm token. Primary: scan the subagent's transcript for the marker the orchestrator
# embedded. Fallback: an explicit RELAY_ARM_TOKEN env (useful for tests / claude -p sessions).
token="${RELAY_ARM_TOKEN:-}"
if [ -z "$token" ] && [ -n "$transcript" ] && [ -f "$transcript" ]; then
  # Bind to the FIRST marker: the orchestrator embeds it in the subagent's opening prompt, so the
  # earliest occurrence is the agent's own arm. (tail-1 could bind to a token the agent merely echoed
  # or quoted later in its output, mis-binding the gate to another agent's chain.)
  token="$(grep -oE 'RELAY-ARM:[A-Za-z0-9_.-]+' "$transcript" 2>/dev/null | head -1 | cut -d: -f2 || true)"
fi
[ -z "$token" ] && exit 0   # not a relay-armed subagent — do not interfere
# Reject path-traversal tokens (charset allows dots; `..` would escape the arms dir).
case "$token" in *..*|.) exit 0 ;; esac

ARM="$ARMS_DIR/$token"
SPRINT="$ARM/sprint.json"
[ -f "$SPRINT" ] || exit 0   # unknown/expired token — leave the agent alone

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
  relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "${wp_id:-?}" \
         --argjson i "${i:-0}" --arg ev "$1" --arg retry "${2:-0}" --arg fails "$fails" --arg reg "$reg" \
         --arg round "${3:-}" --arg rep "${4:-0}" --arg bref "${LEDGER_BASE:-}" \
    '{ts:($ts|tonumber),arm:$tok,wp:$wp,i:$i,event:$ev,retry:($retry|tonumber),fails:$fails,reg:$reg,round:$round,repeat:($rep|tonumber)}
     | if $bref == "" then . else . + {base_ref:$bref} end' \
    | add_macro)"
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
trap 'rm -f "$ROUND_BUF"' EXIT
ledger_item() {  # $1=id $2=assert $3=verdict $4=graded_by $5=oracle-sha $6=origin $7=scope(optional)
  # `scope` records the artifact a judge control was narrowed to (V5). Emitted only when set, so a
  # deterministic control's entry is byte-identical to what it always was.
  jq -nc --arg tok "$token" --arg wp "${wp_id:-?}" \
         --argjson i "${i:-0}" --arg ev "checklist-item" --arg id "$1" --arg as "$2" --arg v "$3" --arg gb "$4" \
         --arg orc "${5:-}" --arg org "${6:-sprint}" --arg scope "${7:-}" \
    '{arm:$tok,wp:$wp,i:$i,event:$ev,item:$id,assert:$as,verdict:$v,graded_by:$gb,oracle:$orc,origin:$org}
     | if $scope == "" then . else . + {scope:$scope} end' \
    | add_macro >> "$ROUND_BUF"
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
    | add_macro >> "$ROUND_BUF"
}
round_flush() {  # append the buffered round to the chain, stamping each entry at flush time
  local b
  while IFS= read -r b; do
    [ -n "$b" ] || continue
    relay_chain_append "$(printf '%s' "$b" | jq -c --argjson ts "$(date +%s)" '{ts:$ts} + .')"
  done < "$ROUND_BUF"
  : > "$ROUND_BUF"
}
round_shape() {  # $1=fails $2=reg — sha over the verdicts AND the failure set they produced
  # Deliberately excludes `ts`: two fires are "the same round" when every control was graded the same
  # way by the same oracle and the same things are still failing. A judge that flips its verdict, a
  # control whose oracle changed, or a different failing set all yield a different sha and are recorded
  # in full — collapse only ever hides a repetition.
  { cat "$ROUND_BUF"; printf '%s\n%s\n' "$1" "$2"; } | shasum -a 256 | cut -d' ' -f1
}

nwp=$(jq '.work_packages | length' "$SPRINT")
rb=$(jq -r '.retry_budget // 3' "$SPRINT")

# ---- Block-cap preflight (V2 — docs/relay-v2.md §2.5) --------------------------------------------
# MEASURED: the harness caps consecutive hook blocks (10 fires with a varying reason, 9 with an
# identical one, 20 with CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0). Advancement is itself a block — same
# channel, different reason — so the cap bounds a whole CHAIN, not a retry loop, and the default of 8
# kills any chain past roughly eight states silently, in the middle of the work.
#
# This hook runs inside the agent's process, so it is the only thing that can read the LIVE value; an
# offline linter can only compare against the documented default. It reads it once per arm and
# refuses to proceed silently.
#
# `chain_min` is an honest LOWER BOUND: nwp+1 assumes every gate passes first try, and each retry,
# regression re-block and park costs another block on top. A chain that merely fits can still die.
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
    printf '[%s] arm %s: CAP RISK — block cap %s, chain needs at least %s\n' \
      "$(date +%s)" "$token" "$cap" "$chain_min" >> "$LOG"
    CAP_WARN="Relay: this session's hook block cap is $cap, and this chain needs at least $chain_min blocks to finish (${nwp} gates plus completion; retries cost more). It will stop mid-chain. Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0 to disable the cap. "
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
# `position` is a plain FACT (which WP the chain stands on). Whether the chain is still running is a
# separate observation in `$ARM/state` (active|complete|escalated) — position is deliberately NOT a
# status enum. Kubernetes shipped exactly that (`phase`) and deprecated it: a single linear enum
# cannot express two simultaneous truths (e.g. "at wp3" AND "an amendment is pending"), and every new
# value breaks consumers. R8 grows `state` into the full condition set.
pos=$(cat "$ARM/position" 2>/dev/null || true)
chain_state=$(cat "$ARM/state" 2>/dev/null || true)
if [ -z "$pos" ]; then
  ci=$(cat "$ARM/counter" 2>/dev/null || echo 0)
  case "$ci" in ''|*[!0-9]*) ci=0 ;; esac
  if [ "$ci" -ge "$nwp" ]; then
    chain_state="complete"; printf 'complete' > "$ARM/state"
    pos=$(jq -r ".work_packages[-1].id // \"?\"" "$SPRINT")
  else
    pos=$(jq -r ".work_packages[$ci].id" "$SPRINT")
  fi
  printf '%s' "$pos" > "$ARM/position"
fi
# `awaiting-human` is a state a HUMAN's action leaves (R8 — docs/control-plane.md §9). Nothing the
# agent does clears it: not a later fire, not the gate passing because the world changed underneath
# it. The original hardening's reasoning — "an escalated arm must not reopen and self-complete (no
# human in the loop)" — is preserved exactly; what changes is that the loop now exists.
#
# A person leaves it by writing $ARM/release with a REASON. `release` is the only verb that advances
# without a gate passing, so it is the only one that contradicts a stated invariant, and therefore
# the one that must be attributable. An empty reason is refused. (DAP's spec describes `goto` in
# purely mechanical terms and carries no danger language at all; VS, GDB and LLDB each independently
# invented their own guard. No layer below relay will supply this warning.)
#
# `escalated` is still honored for arms written before this change.
if [ "$chain_state" = "awaiting-human" ] || [ "$chain_state" = "escalated" ]; then
  rel_reason=""
  [ -f "$ARM/release" ] && rel_reason=$(tr -d '\r' < "$ARM/release" | tr '\n' ' ' | sed 's/^ *//; s/ *$//')
  if [ -z "$rel_reason" ]; then
    if [ -f "$ARM/release" ]; then
      printf 'relay: arm %s has a release with no reason — a release must say who and why\n' "$token" >&2
    fi
    exit 0
  fi
  # Consumed, never standing: a release file left on disk would silently un-park every future
  # escalation of this arm.
  rm -f "$ARM/release"
  # Resuming into a spent budget is a door that opens onto a wall, so the released gate's counters
  # are cleared. It resumes the gate; it does not skip it — advancing past an unmet control would be
  # a different verb with different consequences.
  rel_safe=$(printf '%s' "$pos" | sed 's/^[^.]*\.//' | tr -c 'A-Za-z0-9._-' '_')
  rm -f "$ARM/retry_$rel_safe" "$ARM/round_$rel_safe" "$ARM/repeat_$rel_safe" "$ARM/reg_retry"
  printf 'active' > "$ARM/state"; chain_state=active
  wp_id="$pos"
  relay_chain_append "$(jq -nc --arg ts "$(date +%s)" --arg tok "$token" --arg wp "$pos" \
         --arg ev "human-release" --arg r "$rel_reason" \
    '{ts:($ts|tonumber),arm:$tok,wp:$wp,event:$ev,reason:$r}')" || true
  printf '[%s] arm %s: RELEASED by human at %s — %s\n' "$(date +%s)" "$token" "$pos" "$rel_reason" >> "$LOG"
fi
case "$chain_state" in complete) exit 0 ;; esac   # finished — leave the agent alone

# The position is TWO coordinates, `<macro>.<sub>` (V1 — docs/relay-v2.md §2.2). Resolution tries the
# WHOLE string as a WP id first: that keeps a pre-v2 arm (a bare id on disk) running, and it keeps an
# id that itself contains a dot unambiguous. Only if that misses do we read the text after the FIRST
# dot as the sub coordinate. The macro half is never used to look anything up — the sub id is unique
# in the sprint and is what carries retry state, per R6.
i=$(jq -r --arg p "$pos" '[.work_packages[].id] | index($p) // -1' "$SPRINT")
if { [ "$i" = "-1" ] || [ -z "$i" ]; } && [ "$pos" != "${pos#*.}" ]; then
  pos="${pos#*.}"
  i=$(jq -r --arg p "$pos" '[.work_packages[].id] | index($p) // -1' "$SPRINT")
fi
if [ "$i" = "-1" ] || [ -z "$i" ]; then
  # The plan no longer contains the WP this arm is standing on. Under an index this was invisible
  # (it just pointed somewhere else); named, it is a plan/position mismatch. Fail loudly and let the
  # agent stop rather than blocking it forever against work it cannot be given — every block costs a
  # model turn. R8 turns this into an `awaiting-human` state a person resumes.
  wp_id="$pos"
  printf '[%s] arm %s: POSITION LOST — %s is not in gen %s of the plan\n' \
    "$(date +%s)" "$token" "$pos" "$(jq -r '.gen // 0' "$SPRINT")" >> "$LOG"
  ledger position-lost
  printf 'relay: arm %s is positioned at %s, which no longer exists in the plan\n' "$token" "$pos" >&2
  exit 0
fi
wp_id="$pos"
wp_macro=$(jq -r ".work_packages[$i].macro // \"\"" "$SPRINT")
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
write_position() {  # $1 = wp array index
  local pid pmac
  pid=$(jq -r ".work_packages[$1].id" "$SPRINT")
  pmac=$(jq -r ".work_packages[$1].macro // \"\"" "$SPRINT")
  if [ -n "$pmac" ]; then printf '%s.%s' "$pmac" "$pid" > "$ARM/position"
  else                    printf '%s' "$pid" > "$ARM/position"; fi
}
write_position "$i"
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
  round_flush                                      # the passing round goes on the chain, always
  local ni=$((i+1)); echo "$ni" > "$ARM/counter"   # derived mirror, for pre-R6 readers
  if [ "$ni" -ge "$nwp" ]; then
    printf 'complete' > "$ARM/state"
    printf '[%s] arm %s: gate %s OK -> CHAIN COMPLETE\n' "$(date +%s)" "$token" "$wp_id" >> "$LOG"
    ledger sprint-complete; archive_trace complete; exit 0
  fi
  local nid ninstr nmacro nsafe
  nid=$(jq -r ".work_packages[$ni].id" "$SPRINT")
  write_position "$ni"
  # Stamp the next state's base ref NOW: this fire is that state's entry.
  nsafe=$(printf '%s' "$nid" | tr -c 'A-Za-z0-9._-' '_')
  LEDGER_BASE=$(git -C "$RUN_DIR" rev-parse HEAD 2>/dev/null || true)
  [ -n "$LEDGER_BASE" ] && printf '%s' "$LEDGER_BASE" > "$ARM/base_$nsafe"
  nmacro=$(jq -r ".work_packages[$ni].macro // \"\"" "$SPRINT")
  ninstr=$(jq -r ".work_packages[$ni].instructions // \"\"" "$SPRINT")
  # A macro is a SCOPE, not a loop: entering it costs one injection of its protocol, and its
  # sub-states do not each pay for it again. "First entry" is tracked by a marker file rather than
  # inferred from the position, because once amendments can reorder, position alone cannot say
  # whether this macro has been entered before.
  if [ -n "$nmacro" ]; then
    local mmark minstr
    mmark="$ARM/macro_$(printf '%s' "$nmacro" | tr -c 'A-Za-z0-9._-' '_')"
    if [ ! -f "$mmark" ]; then
      minstr=$(jq -r --arg m "$nmacro" '(.macros // []) | map(select(.id == $m)) | .[0].instructions // ""' "$SPRINT")
      : > "$mmark"
      [ -n "$minstr" ] && ninstr="$minstr
$ninstr"
    fi
  fi
  printf '[%s] arm %s: gate %s OK -> reveal %s\n' "$(date +%s)" "$token" "$wp_id" "$nid" >> "$LOG"
  ledger advance-reveal
  # The self-check ships WITH the next state's instructions (V4 — docs/relay-v2.md §3), never after
  # a failure. Asked in advance it is a forcing function — an agent that knows what it will be asked
  # works toward it while it still can; asked only once the gate has failed it is a remedy, and
  # unaided self-correction is known to plateau or hurt. It is TEXT: no verdict, no ledger entry.
  # Recording it as one would put the agent's own account of its work on the chain, which is the one
  # thing the chain exists not to do. What grades the outcome is the gate; this probes the steps.
  local nself
  nself=$(jq -r ".work_packages[$ni].self_check // [] | map(\"  - \" + .) | join(\"\n\")" "$SPRINT")
  [ -n "$nself" ] && ninstr="$ninstr

Before you finish this state, be ready to answer:
$nself"
  # `review` cannot be enforced by this engine — it cannot spawn a fresh context — so it is stated as
  # a requirement rather than pretended to be a guarantee. A reminder that says what it is beats a
  # mechanism that claims more than it does.
  local nkind
  nkind=$(jq -r ".work_packages[$ni].kind // \"\"" "$SPRINT")
  [ "$nkind" = "review" ] && ninstr="$ninstr

This is a REVIEW state: it must be worked from a cold read of the frozen artifacts. If you produced
what is under review in this context, you are disqualified from reviewing it — say so rather than
proceeding."
  local reason="${INJECTED}Relay gate '$wp_id' passed. Next gate: $nid. $ninstr"
  local compact_after="${RELAY_COMPACT_AFTER:-6}"
  if [ "$ni" -ge "$compact_after" ]; then
    ledger compaction-hint
    reason="$reason (checkpoint: $ni gates cleared — summarize progress and drop now-stale detail before continuing)"
  fi
  emit_block "$reason"
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
fails="$(relay_run_checklist)"
# regression guard: re-run all EARLIER gates' deterministic checks (keep-best / no backsliding).
# Reports the failing item's id (tab-joined id\tcmd so we keep the name, not the raw command).
# Keep-best re-runs earlier gates' checks — but only for controls this chain ACTUALLY ACCEPTED.
# Enforcing every control at a lower index instead means a control spliced in behind the cursor is
# charged as a "regression" against work the runner was never given, and since a regression-only
# failure deliberately does not burn the current gate's retry budget, nothing ever escalates: the
# runner blocks forever, at a model turn per fire. The rule is the compliance criterion — an amended
# plan binds only where the existing ledger is still a valid trace of it. A control with no recorded
# pass on this chain was never accepted, so there is nothing to regress.
if [ "$i" -gt 0 ] && [ -f "$LEDGER" ]; then
  accepted=$(jq -r 'select(.event=="checklist-item" and .verdict=="pass") | .item' "$LEDGER" 2>/dev/null | sort -u)
  while IFS=$'\t' read -r rid rcmd; do
    [ -z "$rcmd" ] && continue
    printf '%s\n' "$accepted" | grep -qxF "$rid" || continue   # never accepted -> not a regression
    if ( cd "$RUN_DIR" && eval "$rcmd" >/dev/null 2>&1 ); then rverd=pass; else rverd=fail; reg="$reg; $rid"; fi
    ledger_reg_item "$rid" "$rverd" "$(relay_oracle_sha "$rcmd")" "regression"
  done < <(jq -r ".work_packages[range(0;$i)].checklist[]? | select(.cmd) | \"\(.id)\t\(.cmd)\"" "$SPRINT")
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

rsha=$(round_shape "$fails" "$reg")
ROUND_F="$ARM/round_$id_safe"     # sha of the last round RECORDED in full at this gate
REPEAT_F="$ARM/repeat_$id_safe"   # consecutive identical rounds collapsed since then
REG_F="$ARM/reg_retry"            # the regression path's own budget (see below)

if [ -z "$fails" ] && [ -z "$reg" ]; then rm -f "$ROUND_F" "$REPEAT_F" "$REG_F"; advance; fi

# Same verdicts, same failures as last fire? Then this fire carries no new information. Record the
# first occurrence in full (it is already on the chain) and count the rest against its sha.
collapsed=0; rep=0
if [ "$(cat "$ROUND_F" 2>/dev/null || true)" = "$rsha" ]; then
  collapsed=1
  rep=$(cat "$REPEAT_F" 2>/dev/null || echo 0); case "$rep" in ''|*[!0-9]*) rep=0 ;; esac
  rep=$((rep+1)); printf '%s' "$rep" > "$REPEAT_F"
else
  printf '%s' "$rsha" > "$ROUND_F"; printf '0' > "$REPEAT_F"
fi
# Non-terminal collapsed fire: the buffered round is a duplicate, drop it. Every other path flushes.
emit_round() { if [ "$collapsed" = 1 ]; then : > "$ROUND_BUF"; else round_flush; fi; }

escalate() {  # $1 = which budget was spent (for the log) — always terminal, always full evidence
  printf '[%s] arm %s: gate %s ESCALATE (%s budget=%s) fails:%s reg:%s\n' \
    "$(date +%s)" "$token" "$wp_id" "$1" "$rb" "$fails" "$reg" >> "$LOG"
  round_flush   # a terminal outcome records the round in full even mid-collapse: this is the evidence
  ledger escalate "$rb" "$rsha" "$rep"; archive_trace escalate
  # Escalation is TERMINAL: a gate handed to a human must not silently reopen and self-resolve on a
  # later fire. The terminal fact lives in `state`, distinct from `complete` — R8 turns `escalated`
  # into `awaiting-human`, a state a person's action leaves.
  printf 'awaiting-human' > "$ARM/state"
  echo "$nwp" > "$ARM/counter"
  exit 0
}

# The same wall twice is a person's problem, so this bypasses the retry budget rather than spending
# it — the claim was already recorded above, and recording it a third and fourth time would only
# defer the human it is asking for.
[ "${CLAIM_REPEAT:-0}" = 1 ] && escalate blocked-claim-repeat

# A regression-ONLY failure (current gate passes, an earlier gate backslid) is NOT a failure of the
# current gate: it must not burn THIS gate's retry budget nor escalate it. But "not this gate's
# budget" is not "no budget" — it had none at all, so an unfixable regression re-blocked forever at a
# model turn per fire. Relay's retry unit is a model turn, not a worker poll (docs/control-plane.md
# §8), which is why the bound here is a turn count and not a wall-clock backoff: this hook only fires
# when the agent stops, so sleeping would buy latency and save nothing. The regression path gets its
# own counter, so it terminates without ever charging the gate the runner did satisfy.
if [ -z "$fails" ] && [ -n "$reg" ]; then
  rr=$(cat "$REG_F" 2>/dev/null || echo 0); case "$rr" in ''|*[!0-9]*) rr=0 ;; esac
  [ "$rr" -ge "$rb" ] && escalate regression
  echo $((rr+1)) > "$REG_F"
  printf '[%s] arm %s: gate %s REGRESSION in earlier gate (retry %s) reg:%s\n' \
    "$(date +%s)" "$token" "$wp_id" "$((rr+1))" "$reg" >> "$LOG"
  emit_round
  if [ "$collapsed" = 1 ]; then ledger gate-fail-repeat "$((rr+1))" "$rsha" "$rep"
  else                          ledger gate-fail        "$((rr+1))" "$rsha" "$rep"; fi
  emit_block "Relay: an earlier gate regressed — restore these before finishing: ${reg#; }. (Current gate '$wp_id' is satisfied; this is a backslide in prior work.)"
  exit 0
fi

# something failed at the current gate -> re-block (bounded). Escalate to the human when budget spent.
r=$(cat "$RETRY_F" 2>/dev/null || echo 0)
[ "$r" -ge "$rb" ] && escalate gate
echo $((r+1)) > "$RETRY_F"
instr=$(jq -r ".work_packages[$i].instructions // \"\"" "$SPRINT")
printf '[%s] arm %s: gate %s FAIL (retry %s) fails:%s reg:%s\n' "$(date +%s)" "$token" "$wp_id" "$((r+1))" "$fails" "$reg" >> "$LOG"
emit_round
if [ "$collapsed" = 1 ]; then ledger gate-fail-repeat "$((r+1))" "$rsha" "$rep"
else                          ledger gate-fail        "$((r+1))" "$rsha" "$rep"; fi
if [ "$r" -ge 1 ]; then
  # Compaction: subsequent retries of the same gate — inject only the failing ids to curb context growth.
  # The full audit trail in the ledger is unchanged; only the agent-facing reason shrinks.
  msg="Relay gate '$wp_id' still failing. Fix these: ${fails:-${reg:- (none)}}${reg:+ ; regressions:${reg}}"
else
  msg="Relay gate '$wp_id' is NOT satisfied. Still failing:${fails:- (none)}${reg:+ ; regressions:${reg}}. Address these, then finish.${instr:+ Instructions: $instr}"
fi
emit_block "$msg"
exit 0
