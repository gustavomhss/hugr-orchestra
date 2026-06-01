#!/usr/bin/env python3
"""
relay-corpus — turn the retained verified-trace ledgers into the dense, per-step reward signal.

PRODUCT.md §7.2 names the verified-trace flywheel as "the real asset" but flags it UNBUILT: runs were
ephemeral. The arm hook now RETAINS each terminal trace under $RELAY_CORPUS_DIR (default ~/.relay/corpus,
one dir per token+head with ledger.jsonl + sprint.json + meta.json + outcome.json). This tool reads that
corpus and extracts what an RLVR / process-supervision pipeline wants:

  - per CONTROL: the verdict (pass/fail/advisory) and how it was graded (deterministic vs judge);
  - per WORK PACKAGE: the retry distribution (how many gate-fails before it passed) and final outcome;
  - per TRACE: complete vs escalate, control counts, total retries;
  - aggregate: pass rate, escalation rate, mean retries-to-green, hardest controls (highest fail count).

Every trace is also integrity-checked with verify_ledger.py — a tampered trace is reported and excluded
from the signal (a corrupt reward sample is worse than none).

Usage:
  relay-corpus.py [--corpus DIR] stats              # human-readable rollup (default)
  relay-corpus.py [--corpus DIR] export [-o out.jsonl]   # one JSON row per (trace, wp) — the RL rows
  relay-corpus.py [--corpus DIR] controls            # per-control difficulty table (fail counts)
"""
import argparse, json, os, subprocess, sys
from collections import defaultdict, Counter

HERE = os.path.dirname(os.path.abspath(__file__))
VERIFY = os.path.join(HERE, "..", "benchmark", "verify_ledger.py")


def load_corpus(corpus_dir):
    """Yield (trace_id, entries, outcome, integrity_ok) for each retained trace."""
    if not os.path.isdir(corpus_dir):
        return
    for name in sorted(os.listdir(corpus_dir)):
        d = os.path.join(corpus_dir, name)
        ledger = os.path.join(d, "ledger.jsonl")
        if not os.path.isfile(ledger):
            continue
        entries = []
        for line in open(ledger):
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
        outcome = {}
        op = os.path.join(d, "outcome.json")
        if os.path.isfile(op):
            try:
                outcome = json.load(open(op))
            except Exception:
                pass
        integrity_ok = subprocess.run(["python3", VERIFY, ledger],
                                      capture_output=True, text=True).returncode == 0
        yield name, entries, outcome, integrity_ok


def per_wp_signal(entries):
    """From one trace's entries, derive per-WP rows: retries-to-green, controls, pass/fail."""
    # gate-fail entries carry retry counts per WP index i; advance-reveal/sprint-complete mark a WP done.
    retries = defaultdict(int)          # wp_id -> max retry seen (gate-fails before pass)
    wp_name = {}                        # i -> wp_id
    controls = defaultdict(list)        # wp_id -> [(item, verdict, graded_by)]
    passed_wps = set()
    for e in entries:
        ev = e.get("event")
        wp = e.get("wp", "?")
        wp_name[e.get("i")] = wp
        if ev == "gate-fail":
            retries[wp] = max(retries[wp], e.get("retry", 0))
        elif ev == "checklist-item":
            controls[wp].append((e.get("item"), e.get("verdict"), e.get("graded_by")))
        elif ev in ("advance-reveal", "sprint-complete"):
            passed_wps.add(wp)
    rows = []
    for wp in sorted(set(list(retries) + list(controls) + list(passed_wps))):
        ctl = controls.get(wp, [])
        rows.append({
            "wp": wp,
            "passed": wp in passed_wps,
            "retries_to_green": retries.get(wp, 0),
            "n_controls": len({c[0] for c in ctl}),
            "n_fail_verdicts": sum(1 for _, v, _ in ctl if v == "fail"),
            "graded_by": sorted({g for _, _, g in ctl if g}),
        })
    return rows


def cmd_stats(traces):
    n = len(traces)
    valid = [t for t in traces if t[3]]
    tampered = n - len(valid)
    completes = sum(1 for _, e, o, ok in valid if (o.get("outcome") == "complete"
                    or any(x.get("event") == "sprint-complete" for x in e)))
    escalates = sum(1 for _, e, o, ok in valid if (o.get("outcome") == "escalate"
                    or any(x.get("event") == "escalate" for x in e)))
    all_rows = [r for _, e, _, ok in valid for r in per_wp_signal(e)]
    retries = [r["retries_to_green"] for r in all_rows if r["passed"]]
    mean_retries = sum(retries) / len(retries) if retries else 0.0
    print("== relay verified-trace corpus ==")
    print(f"  traces:            {n}  (valid {len(valid)}, TAMPERED {tampered})")
    print(f"  outcomes:          {completes} complete / {escalates} escalate")
    print(f"  work-packages:     {len(all_rows)}  ({sum(1 for r in all_rows if r['passed'])} passed)")
    print(f"  mean retries→green: {mean_retries:.2f}")
    if tampered:
        print(f"  ⚠ {tampered} tampered trace(s) excluded from the signal")


def cmd_export(traces, out):
    rows = []
    for tid, entries, outcome, ok in traces:
        if not ok:
            continue
        for r in per_wp_signal(entries):
            rows.append({"trace": tid, **r,
                         "outcome": outcome.get("outcome")})
    text = "\n".join(json.dumps(r) for r in rows)
    if out:
        open(out, "w").write(text + "\n")
        print(f"wrote {len(rows)} RL rows -> {out}", file=sys.stderr)
    else:
        print(text)


def cmd_controls(traces):
    fails = Counter()
    total = Counter()
    for _, entries, _, ok in traces:
        if not ok:
            continue
        for e in entries:
            if e.get("event") == "checklist-item":
                total[e["item"]] += 1
                if e.get("verdict") == "fail":
                    fails[e["item"]] += 1
    print("== per-control difficulty (by fail count) ==")
    print(f"{'control':<32} {'fails':>6} {'seen':>6}")
    for item, f in fails.most_common():
        print(f"{item:<32} {f:>6} {total[item]:>6}")
    if not fails:
        print("(no failing controls recorded — every control passed first try, or corpus empty)")


def main():
    ap = argparse.ArgumentParser(description="Extract the reward signal from retained verified traces.")
    ap.add_argument("mode", nargs="?", default="stats", choices=["stats", "export", "controls"])
    ap.add_argument("--corpus", default=os.environ.get("RELAY_CORPUS_DIR",
                    os.path.expanduser("~/.relay/corpus")))
    ap.add_argument("-o", "--out", default=None)
    a = ap.parse_args()

    traces = list(load_corpus(a.corpus))
    if not traces:
        print(f"(empty corpus at {a.corpus} — run some armed agents first)", file=sys.stderr)
        return 0
    if a.mode == "stats":
        cmd_stats(traces)
    elif a.mode == "export":
        cmd_export(traces, a.out)
    elif a.mode == "controls":
        cmd_controls(traces)
    return 0


if __name__ == "__main__":
    sys.exit(main())
