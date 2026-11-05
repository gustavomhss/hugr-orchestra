#!/usr/bin/env bash
# CI-only judgment transport. The optional command is an operator-owned fixture script for remote controls.
# Private attempts are never overwritten or uploaded; only sanitized start/end receipts leave the runner.
set -euo pipefail
set -o noclobber
umask 077
[ "${GITHUB_ACTIONS:-}" = true ] || { echo 'judge-request: run on the authorized remote runner' >&2; exit 2; }
prompt="${1:?judge-request: missing prompt}"
command="${2:-script/atlas-genesis/grok-text.sh}"
[ -f "$prompt" ] && [ -f "$command" ] || { echo 'judge-request: missing prompt or command' >&2; exit 2; }
base="${prompt%.prompt}"
out="$base.out"
printf 'NO_VALID_VERDICT\n' > "$out"
for attempt in 1 2; do
  answer="$base.attempt-$attempt.out"
  error="$base.attempt-$attempt.err"
  printf '{"attempt":%s,"event":"start"}\n' "$attempt" >> "$base.attempts.jsonl"
  if timeout 600 bash "$command" < "$prompt" > "$answer" 2> "$error"; then
    code=0
  else
    code=$?
  fi
  digest=$(sha256sum "$answer")
  digest="${digest%% *}"
  printf '{"attempt":%s,"event":"end","exitCode":%s,"outputSha256":"%s"}\n' "$attempt" "$code" "$digest" >> "$base.attempts.jsonl"
  # A valid JSON fragment from a failed command is not a completed judgment.
  if [ "$code" = 0 ] && node script/atlas-genesis/judge.mjs check "$answer"; then
    cp "$answer" "$out"
    break
  fi
done
# Scoring owns failed-call accounting. An exhausted worker must not prevent the verdict receipt being written.
exit 0
