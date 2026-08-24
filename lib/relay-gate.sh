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
# Serialize the read-tail-then-append. Without it two writers read the same `prev` and both append,
# the chain FORKS, and `verify_ledger.py` reports TAMPERED — an honest run producing the banner that
# means "do not accept this run". The old comment here argued concurrency was not a normal path and
# called the spurious TAMPERED an acceptable fail-closed. Both halves were wrong, and a live run
# proved it: a harness driving `relay-gate` twice over one state dir raced within seconds, and a
# transport failure that reads as tampering is exactly the class of defect the judge work removed
# three times over — worse here, because integrity is the one signal that has no second opinion.
#
# mkdir, not flock: flock is absent on macOS, the primary target. mkdir is atomic on every filesystem
# that matters. Held only across the append, which is milliseconds, never across a gate evaluation.
relay_chain_lock() {  # $1 = ledger path; echoes the lock dir on success, empty on failure
  local lock="$(dirname "$1")/.chain.lock" i
  for i in $(seq 1 200); do
    if mkdir "$lock" 2>/dev/null; then printf '%s' "$lock"; return 0; fi
    sleep 0.05
  done
  return 1
}

relay_chain_append() {  # $1 = compact JSON body
  local last prev seq macalg body h lock
  if ! lock=$(relay_chain_lock "$LEDGER"); then
    # Never silently drop a chain entry: a record that loses writes is worse than one that says so.
    printf 'relay: could not take the chain lock for %s — a verdict was not recorded\n' "$LEDGER" >&2
    return 1
  fi

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
           --argjson g "$RELAY_GEN" '. + {gen:$g, prev:$p, seq:$s, mac:$m}') || {
    rmdir "$lock" 2>/dev/null || true; return 0; }
  if [ -n "${RELAY_LEDGER_KEY:-}" ]; then
    h=$(printf '%s' "$body" | openssl dgst -sha256 -hmac "$RELAY_LEDGER_KEY" | sed -E 's/.* //')
  else
    h=$(printf '%s' "$body" | shasum -a 256 | cut -d' ' -f1)
  fi
  # Do NOT swallow a failed append: a verdict silently dropped from the chain weakens "every verdict is
  # on the chain". If the write fails (disk full, perms), record it loudly to the log + stderr so the
  # loss is visible rather than masked.
  # The lock is released on EVERY path, by hand rather than by a RETURN trap: a RETURN trap set inside
  # a function leaks to later function returns in the same shell, and `set -u` then kills the run on a
  # `$lock` that is out of scope. Found the first time this lock ran.
  if ! printf '%s' "$body" | jq -c --arg h "$h" '. + {h:$h}' >> "$LEDGER" 2>/dev/null; then
    rmdir "$lock" 2>/dev/null || true
    printf '[%s] RELAY LEDGER APPEND FAILED for %s\n' "$(date +%s)" "$LEDGER" >> "${LOG:-/dev/stderr}" 2>/dev/null || true
    printf 'relay: ledger append failed (%s) — a verdict was not recorded\n' "$LEDGER" >&2
    return 1
  fi
  rmdir "$lock" 2>/dev/null || true
}

# Evaluate the current WP's checklist. Each item with a `cmd` is DETERMINISTIC (a real check is the
# oracle, blocks on fail); an item with only a `judge` prompt is SEMANTIC — run by the non-independent
# LLM judge, ADVISORY by default, blocking only when it sets "blocking": true, and always logged as
# judge (never deterministic) so the audit trail can't mistake it for a real control. Echoes the
# failing item ids; logs every verdict through the caller's ledger_item().
# sha256 of a string, bare hex. Used to put the ORACLE on the chain without putting the command
# itself there: a `cmd` can carry absolute paths or secrets, and sameness is all an audit needs.
# Expand ${name} placeholders from the ENVIRONMENT, by substitution and never by `eval`. A `cmd` is
# run through `eval` by construction — it is a command — but a context PATH is data, and running a
# path through the shell would turn `${wp_dir}` in a sprint into an execution site. Unset names are
# left verbatim so a missing parameter surfaces as a missing file rather than as a silently empty
# path that resolves to the workdir root.
relay_expand_params() {  # $1 = text with ${name} placeholders
  local text="$1" name val out=""
  while [[ "$text" =~ ^(.*)\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}(.*)$ ]]; do
    name="${BASH_REMATCH[2]}"
    val="${!name-}"
    if [ -z "${!name+x}" ]; then
      out="${BASH_REMATCH[3]}$out"; text="${BASH_REMATCH[1]}\${$name}"
      # Leave it in place and stop rewriting this one: prepend the literal and continue leftward.
      out="\${$name}$out"; text="${BASH_REMATCH[1]}"
    else
      out="$val${BASH_REMATCH[3]}$out"; text="${BASH_REMATCH[1]}"
    fi
  done
  printf '%s%s' "$text" "$out"
}

relay_oracle_sha() {  # $1 = the oracle text (a cmd, or a judge criterion)
  printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1
}

# The STATE of the artifact a discursive control was graded against, as one sha256.
#
# `oracle` records WHAT was asked and `scope` records WHERE it was asked, but neither records what
# was actually there when the question was put. Two fires of the same control over a file that
# tripled in size between them are byte-identical on the chain. That is not hypothetical: a measured
# run grew `conclusions.json` from 11,365 to 35,664 characters across 21 review rounds and the chain
# recorded a clean first-try pass, reconstructable afterwards only because the dead reviewer clones'
# transcripts happened to still be on disk (docs/FINDING-self-graded-review-verdicts.md). This is the
# field that makes that growth a fact on the record instead of archaeology.
#
# sha256 rather than a faster hash, and the reason is not speed. The chain is sha256 end to end
# (relay_chain_append, relay_oracle_sha, and hmac-sha256 when keyed), `shasum` is already a
# dependency of this file, and a second algorithm in the same record is one more thing a verifier has
# to know. At kilobyte artifacts hashed once per gate fire — inside a fire that already spends
# seconds on an LLM call — the difference does not exist.
#
# Each path contributes its own NAME as well as its contents, so a rename with identical bytes still
# moves the digest; a path that is not a readable file contributes the marker `absent` rather than
# nothing, so a control graded against a file that disappeared is distinguishable from one graded
# against an empty file. Order follows the declared `paths` order, which is part of the oracle.
relay_artifact_sha() {  # $1 = space-separated paths, relative to $RUN_DIR (may be empty)
  [ -n "${1:-}" ] || return 1
  local p acc=""
  for p in $1; do
    if [ -f "$RUN_DIR/$p" ]; then
      acc="$acc$p:$(shasum -a 256 < "$RUN_DIR/$p" | cut -d' ' -f1)\n"
    else
      acc="$acc$p:absent\n"
    fi
  done
  printf '%b' "$acc" | shasum -a 256 | cut -d' ' -f1
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

# ---- The artifact a discursive control is graded against (V5 — docs/relay-v2.md §3) --------------
# A judge item may set `diff: true`. The gate then computes `git diff <base_ref>` ITSELF and hands
# the result to the judge, instead of grading whatever static paths the plan happened to list. Two
# holes closed, both named in docs/enforcement-model.md §5: the base ref / moment / author of the
# artifact was undefined, so the control was undefined; and artifact selection sat in a plan field,
# which moved the scope-narrowing attack out of the agent's prose and into the orchestrator's.
#
# `git diff <base>` covers committed and uncommitted work alike, so an agent that commits is not
# invisible to the control. Narrowing via `paths` stays legal — sometimes it is right — but it is
# folded into the ORACLE (below) and written onto the chain, so it is visible and a narrowing
# introduced mid-run reads as ORACLE DRIFT.
#
# The caller supplies $BASE_REF, resolved from its own state: the ref recorded when this state was
# ENTERED. Echoes the path to the computed diff, or returns non-zero — never a partial artifact and
# never an empty one silently, because a judge handed nothing at all would grade the absence.
relay_compute_diff() {  # $1 = space-separated pathspec (may be empty = everything)
  [ -n "${BASE_REF:-}" ] || return 1
  git -C "$RUN_DIR" rev-parse --git-dir >/dev/null 2>&1 || return 1
  git -C "$RUN_DIR" cat-file -e "${BASE_REF}^{commit}" 2>/dev/null || return 1
  local dir out
  dir=$(mktemp -d "${TMPDIR:-/tmp}/relay-diff.XXXXXX") || return 1
  out="$dir/computed.diff"   # the basename is what the judge sees as the artifact's label
  # shellcheck disable=SC2086 — $1 is an intentional pathspec split
  git -C "$RUN_DIR" diff "$BASE_REF" -- $1 > "$out" 2>/dev/null || { rm -rf "$dir"; return 1; }
  # `git diff` shows TRACKED changes only, and a brand-new file is the most common shape of new work
  # — so without this an agent that creates a file is invisible to the very control meant to see what
  # it did. Appended as no-index diffs against /dev/null.
  #
  # Deliberately NOT `git add -N`: intent-to-add would make one command do it, at the cost of the
  # gate writing into the index of the workspace it is judging. A checker that mutates its own
  # subject is the confused-deputy shape this whole design exists to avoid, and the agent would
  # inherit a dirtied index it never asked for. Read-only is worth four extra lines.
  # shellcheck disable=SC2086
  git -C "$RUN_DIR" ls-files --others --exclude-standard -- $1 2>/dev/null | while IFS= read -r u; do
    [ -n "$u" ] || continue
    # --no-index exits 1 when the files differ, which is the normal case here.
    git -C "$RUN_DIR" diff --no-index -- /dev/null "$u" >> "$out" 2>/dev/null || true
  done
  printf '%s' "$out"
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
      local crit block jout jverd jback ctxargs cf wantdiff scope dfile artsha
      crit=$(jq -r ".work_packages[$i].checklist[$j].judge" "$SPRINT")
      block=$(jq -r ".work_packages[$i].checklist[$j].blocking // false" "$SPRINT")
      wantdiff=$(jq -r ".work_packages[$i].checklist[$j].diff // false" "$SPRINT")
      scope=$(jq -r ".work_packages[$i].checklist[$j].paths // [] | join(\" \")" "$SPRINT")
      # What a control MEASURES is the criterion AND the artifact it measures it against, so the
      # scope belongs in the oracle. Same criterion over a narrower artifact is a different question,
      # and V3 reports a mid-run change of it as drift.
      oracle=$(relay_oracle_sha "$crit${scope:+ :: $scope}")
      # The oracle above hashes the RAW scope, and so does the ledger below: `${spec_dir}/x.json` is
      # the same question in every run, and recording the expanded path would make two identical runs
      # read as oracle drift. The expansion lives in its own variable, used only where a real path is
      # needed to compute the diff.
      scope_real=$(relay_expand_params "$scope")
      artsha=$(relay_artifact_sha "$scope_real" 2>/dev/null || true)
      ctxargs=()
      while IFS= read -r cf; do
        [ -n "$cf" ] || continue
        cf=$(relay_expand_params "$cf")
        ctxargs+=(--file "$RUN_DIR/$cf")
      done < <(
        jq -r ".work_packages[$i].checklist[$j].context // empty | if type==\"array\" then .[] else . end" "$SPRINT")
      if [ "$wantdiff" = "true" ]; then
        if dfile=$(relay_compute_diff "$scope_real"); then
          ctxargs+=(--file "$dfile")
        else
          # FAIL CLOSED. No base ref, or not a git workdir: the control cannot be evaluated, so it
          # did not pass. `judge:unavailable` marks it as an infrastructure failure rather than a
          # judgment — and note this still only BLOCKS if the item is blocking. An advisory control
          # that cannot run is still only advisory, which is exactly why docs/enforcement-model.md §5
          # never lets a discursive control stand alone.
          [ "$block" = "true" ] && out="$out; $id"
          ledger_item "$id" "$as" "fail" "judge:unavailable(no-diff)" "$oracle" "$origin" "$scope" "$artsha"
          continue
        fi
      fi
      jout=$(python3 "$JUDGE" --criterion "$crit" "${ctxargs[@]}" 2>/dev/null || true)
      jverd=$(printf '%s' "$jout" | jq -r '.verdict // "advisory"' 2>/dev/null); [ -z "$jverd" ] && jverd=advisory
      jback=$(printf '%s' "$jout" | jq -r '.backend // "judge"' 2>/dev/null); [ -z "$jback" ] && jback=judge
      [ "$block" = "true" ] && [ "$jverd" = "fail" ] && out="$out; $id"
      ledger_item "$id" "$as" "$jverd" "judge:$jback(non-independent)" "$oracle" "$origin" "$scope" "$artsha"
    fi
  done
  printf '%s' "$out"
}
