#!/usr/bin/env bash
# Run one arm on one campaign, in a fresh isolated run dir, then grade it.
#   Usage: run_arm.sh <R|M|D> <campaign_dir> <out_run_dir>
# Arm R: 7-WP sprint, gated.  Arm D: 7-WP sprint, ungated.  Arm M: 1-WP sprint (whole campaign), gated.
set -euo pipefail
ARM="${1:?R|M|D}"; CAMP="${2:?campaign dir}"; OUT="${3:?out run dir}"
BENCH="$(cd "$(dirname "$0")" && pwd)"

rm -rf "$OUT"; mkdir -p "$OUT"
cp -R "$CAMP"/. "$OUT"/
rm -rf "$OUT/.relay-state" "$OUT/.claude"

case "$ARM" in
  R) SPRINT="$OUT/sprint.json";      GATE=on  ;;
  D) SPRINT="$OUT/sprint.json";      GATE=off ;;
  M) SPRINT="$OUT/sprint_mono.json"; GATE=on  ;;
  *) echo "bad arm $ARM"; exit 1 ;;
esac

mkdir -p "$OUT/.claude"
cat > "$OUT/.claude/settings.json" <<JSON
{"hooks":{"Stop":[{"matcher":"","hooks":[{"type":"command","command":"$BENCH/relay_hook.sh"}]}]}}
JSON

GOAL=$(jq -r '.brief' "$SPRINT")
WP1=$(jq -r '.work_packages[0].instructions' "$SPRINT")
BRIEF="$GOAL

Start now with the first work package: $WP1

Edit billing/core.py. You may run  python3 -m pytest checks/ -q  to check yourself. When you believe the current package is done, stop — you will be guided to the next package, or told what still fails."

cd "$OUT"
RELAY_RUN_DIR="$OUT" RELAY_SPRINT="$SPRINT" RELAY_GATE="$GATE" \
  timeout 700 claude -p "$BRIEF" --output-format json --dangerously-skip-permissions --model sonnet \
  > "$OUT/run.json" 2> "$OUT/run.err" || true

echo "=== ARM $ARM | campaign $(basename "$CAMP") ==="
echo "--- usage ---"
jq -r '"cost_usd=\(.total_cost_usd)  in_tok=\(.usage.input_tokens)  out_tok=\(.usage.output_tokens)  turns=\(.num_turns)  err=\(.is_error)"' "$OUT/run.json" 2>/dev/null || { echo "(no json usage)"; tail -3 "$OUT/run.err"; }
echo "--- grade ---"
python3 "$BENCH/grader.py" --dir "$OUT" | jq -c '{rsr, ccr, passed: (.passed|length), failed, regressions}'
echo "--- relay log ---"
cat "$OUT/.relay-state/relay.log" 2>/dev/null || echo "(none)"
