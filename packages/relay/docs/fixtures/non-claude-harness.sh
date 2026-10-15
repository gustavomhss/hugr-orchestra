#!/usr/bin/env bash
# The loop from docs/sdk.md §"Example: a non-Claude harness loop", with run_my_agent filled in by a
# free non-Claude engine behind the Omnirouter gateway. Nothing Claude-specific is involved: no hook,
# no {"decision":"block"}, no transcript. The harness calls the gate and translates its outcome.
set -uo pipefail
RELAY=/Users/gustavoschneiter/Documents/HuGR/relay
OMNI=/Users/gustavoschneiter/Documents/Omnirouter
GW_PY="$OMNI/.venv/bin/python"; [ -x "$GW_PY" ] || GW_PY=python3
N=/tmp/nonclaude-test
ENGINE="${ENGINE:-claude-openrouter-free-nemotron-super}"
SPRINT=$N/sprint.json; WORK=$N/work; STATE=$N/state

# The agent's first instruction comes from the plan, exactly as the arm author would seed it.
prompt=$(jq -r '.brief + "\n\n" + .work_packages[0].instructions' "$SPRINT")

for turn in $(seq 1 14); do
  echo "--- turn $turn [$ENGINE] ---"
  "$GW_PY" "$OMNI/scripts/gw_agent.py" --model "$ENGINE" --mode worker --cwd "$WORK" \
    --task "You are working in the current directory. $prompt" > "$N/agent-$turn.log" 2>&1

  result=$("$RELAY/bin/relay-gate" eval --sprint "$SPRINT" --workdir "$WORK" --state "$STATE" 2>/dev/null)
  outcome=$(printf '%s' "$result" | jq -r '.outcome')
  echo "gate: $outcome  wp=$(printf '%s' "$result" | jq -r '.wp')  failing=$(printf '%s' "$result" | jq -r '(.failing // []) | join(",")')"

  case "$outcome" in
    advance)   nid=$(printf '%s' "$result" | jq -r '.next')
               prompt=$(jq -r --arg n "$nid" '.work_packages[] | select(.id==$n) | .instructions' "$SPRINT") ;;
    complete)  echo "SPRINT COMPLETE"; exit 0 ;;
    gate-fail) f=$(printf '%s' "$result" | jq -r '(.failing // []) | join(", ")')
               wp=$(printf '%s' "$result" | jq -r '.wp')
               instr=$(jq -r --arg n "$wp" '.work_packages[] | select(.id==$n) | .instructions' "$SPRINT")
               prompt="Your previous attempt did not satisfy the check. Still failing: $f. $instr" ;;
    escalate)  echo "ESCALATED — human review needed"; exit 2 ;;
    *)         echo "unexpected: $result"; exit 3 ;;
  esac
done
echo "turn budget exhausted"; exit 4
