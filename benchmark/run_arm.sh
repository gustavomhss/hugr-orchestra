#!/usr/bin/env bash
# Run one arm on one campaign, in a fresh isolated run dir, then grade it.
#   Usage: run_arm.sh <R|M|D> <campaign_dir> <out_run_dir>
# Arm R: 7-WP sprint, gated.  Arm D: 7-WP sprint, ungated.  Arm M: 1-WP sprint (whole campaign), gated.
# Integrity: gate != grader. The runner's feedback gate is the VISIBLE checks/ (it is told to
# self-check with it); the GRADER scores a HELD-OUT holdout/ suite the runner never sees (stripped
# from the run dir below). Every run archives its verified-trace ledger under benchmark/.relay-ledger/.
set -euo pipefail
ARM="${1:?R|M|D}"; CAMP="${2:?campaign dir}"; OUT="${3:?out run dir}"
BENCH="$(cd "$(dirname "$0")" && pwd)"

rm -rf "$OUT"; mkdir -p "$OUT"
cp -R "$CAMP"/. "$OUT"/
# gate != grader: the held-out grader suite must NEVER be visible to the runner. The runner sees
# only checks/ (its feedback gate); the grader scores holdout/ from the campaign source dir.
rm -rf "$OUT/.relay-state" "$OUT/.claude" "$OUT/holdout"

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
echo "--- grade (HELD-OUT; gate != grader) ---"
HOLDOUT=""
[ -d "$CAMP/holdout" ] && HOLDOUT="--holdout $CAMP/holdout"
python3 "$BENCH/grader.py" --dir "$OUT" $HOLDOUT > "$OUT/grade.json"
jq -c '{rsr, ccr, graded_by, passed: (.passed|length), failed, regressions}' "$OUT/grade.json"
echo "--- relay log ---"
cat "$OUT/.relay-state/relay.log" 2>/dev/null || echo "(none)"

# Persist the verified-trace ledger (the flywheel + compliance artifact); never rm -rf'd.
LEDGER_DIR="$BENCH/.relay-ledger"; mkdir -p "$LEDGER_DIR"
KEY="$(basename "$CAMP")-$ARM-$(date +%Y%m%d-%H%M%S)"
cp "$OUT/grade.json"                "$LEDGER_DIR/$KEY.grade.json"   2>/dev/null || true
cp "$OUT/.relay-state/ledger.jsonl" "$LEDGER_DIR/$KEY.ledger.jsonl" 2>/dev/null || true
cp "$OUT/run.json"                  "$LEDGER_DIR/$KEY.run.json"     2>/dev/null || true
echo "--- archived verified-trace -> $LEDGER_DIR/$KEY.* ---"
