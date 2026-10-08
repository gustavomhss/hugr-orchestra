#!/usr/bin/env bash
# plan-check-selftest.sh — runs the 4-fixture x 4-phase matrix through plan-check
# and prints a PASS/FAIL/SKIP count summary table per (fixture, phase).
#
# Usage:
#   plan-check-selftest.sh <bench-root> [repo-root]
#
# <bench-root> is a directory holding one subdirectory per fixture (execA,
# execB, execC, execD, ...) each shaped like a plan-dir: frame.json,
# packages.json, sequence.json, manifest.json, packets/*.md. Fixture names
# are discovered from <bench-root>'s subdirectories, so this script survives
# the scratchpad that produced the original 4 fixtures dying — point it at
# wherever a bench root lives now.
#
# [repo-root] defaults to this script's own repo (git toplevel from its own
# location), matching plan-check's own --repo-root default.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAN_CHECK="$SCRIPT_DIR/plan-check"

BENCH_ROOT="${1:-}"
if [[ -z "$BENCH_ROOT" || ! -d "$BENCH_ROOT" ]]; then
    echo "usage: $0 <bench-root> [repo-root]" >&2
    echo "  <bench-root>: directory containing one plan-dir per fixture (execA, execB, ...)" >&2
    exit 2
fi

REPO_ROOT="${2:-}"
if [[ -z "$REPO_ROOT" ]]; then
    REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR")"
fi

PHASES=(frame carve sequence dispatch)

# Discover fixtures: any immediate subdirectory of bench-root that has at
# least a frame.json (the one artifact every phase needs).
FIXTURES=()
for d in "$BENCH_ROOT"/*/; do
    name="$(basename "$d")"
    if [[ -f "$d/frame.json" ]]; then
        FIXTURES+=("$name")
    fi
done

if [[ ${#FIXTURES[@]} -eq 0 ]]; then
    echo "no fixtures found under $BENCH_ROOT (looked for */frame.json)" >&2
    exit 2
fi

echo "plan-check selftest — bench-root: $BENCH_ROOT"
echo "                       repo-root:  $REPO_ROOT"
echo "                       fixtures:   ${FIXTURES[*]}"
echo

declare -A PASS_COUNT FAIL_COUNT SKIP_COUNT
overall_fail=0

for fixture in "${FIXTURES[@]}"; do
    for phase in "${PHASES[@]}"; do
        key="${fixture}:${phase}"
        out="$(python3 "$PLAN_CHECK" --phase "$phase" --plan-dir "$BENCH_ROOT/$fixture" --repo-root "$REPO_ROOT" 2>&1)"
        rc=$?
        p="$(grep -c '^PASS ' <<<"$out")"
        f="$(grep -c '^FAIL ' <<<"$out")"
        s="$(grep -c '^SKIP ' <<<"$out")"
        if grep -q '^Traceback\|internal check error' <<<"$out"; then
            echo "CRASH detected: $fixture/$phase" >&2
            echo "$out" >&2
            overall_fail=1
        fi
        PASS_COUNT[$key]=$p
        FAIL_COUNT[$key]=$f
        SKIP_COUNT[$key]=$s
        if [[ $rc -gt 1 ]]; then
            echo "usage/IO error ($rc) on $fixture/$phase" >&2
            overall_fail=1
        fi
    done
done

# --- summary table -----------------------------------------------------
printf "%-10s" "fixture"
for phase in "${PHASES[@]}"; do
    printf " | %-16s" "$phase"
done
printf "\n"
printf -- "-%.0s" $(seq 1 10)
for _ in "${PHASES[@]}"; do
    printf -- "-%.0s" $(seq 1 19)
done
printf "\n"

for fixture in "${FIXTURES[@]}"; do
    printf "%-10s" "$fixture"
    for phase in "${PHASES[@]}"; do
        key="${fixture}:${phase}"
        printf " | P%-2s F%-2s S%-2s     " "${PASS_COUNT[$key]}" "${FAIL_COUNT[$key]}" "${SKIP_COUNT[$key]}"
    done
    printf "\n"
done

echo
echo "P=PASS F=FAIL S=SKIP, per (fixture, phase) cell."
if [[ $overall_fail -ne 0 ]]; then
    echo "selftest FAILED: crash or usage/IO error detected (see stderr above)"
    exit 1
fi
echo "selftest OK: plan-check ran clean (no crash) on all $((${#FIXTURES[@]} * ${#PHASES[@]})) (fixture, phase) pairs"
exit 0
