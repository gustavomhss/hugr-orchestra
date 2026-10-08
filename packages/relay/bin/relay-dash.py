#!/usr/bin/env python3
"""
relay-dash — the human view over the verified-trace corpus.

The signal already exists: bin/relay-corpus.py turns each retained, integrity-checked trace into
per-WP reward rows (wp, passed, retries_to_green, n_controls, n_fail_verdicts, graded_by). What was
missing was the *view* — the surface you put in front of a human watching a fleet of armed agents.

This tool is read-only over $RELAY_CORPUS_DIR and never mutates a trace. It REUSES relay-corpus.py's
verify-then-include load path (load_corpus) and its per-WP signal (per_wp_signal) rather than
reimplementing the ledger, the verifier, or the gate evaluation — a tampered trace is excluded by the
exact same code that excludes it from the RL signal.

Subcommands:
  relay-dash.py [--corpus DIR] burndown [--json]   # per-arm progress: gates cleared/total, current
                                                   # gate, retries spent, terminal outcome. ASCII bars.
  relay-dash.py [--corpus DIR] health   [--json]   # fleet rollup: pass rate, escalation rate, mean
                                                   # retries→green, the hardest controls (by fail count).

Empty corpus -> a clean "no traces yet" message, exit 0.
"""
import argparse, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))

# C0 control bytes (incl. ESC, CR, BS) and the C1 range. These ride INSIDE the signed ledger body, so
# they survive integrity verification while remaining fully agent/orchestrator-chosen (wp/item/token/arm
# text). Rendered raw to a terminal, a crafted ESC/CR (e.g. \x1b[2K\r) can erase or overwrite the dash's
# own lines — including the "tampered trace(s) excluded" warning — and spoof a clean board to a human who
# is told to trust this surface. Integrity is real but orthogonal to render-safety, so we sanitize every
# corpus-derived string before printing it to the human view. The --json path needs no help (json.dumps
# escapes control bytes already).
_CTRL = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def _safe(value, width=None):
    """Render a corpus-derived string safe for a TTY: replace C0/C1 control bytes (ESC, CR, etc.) with a
    visible placeholder and optionally clamp to a column width. Non-strings pass through as their str()."""
    s = "" if value is None else str(value)
    s = _CTRL.sub("�", s)
    if width is not None and len(s) > width:
        s = s[: max(0, width - 1)] + "…"
    return s


def _load_corpus_module():
    """Import the sibling bin/relay-corpus.py (hyphenated filename -> load by path) so we reuse its
    verify-then-include corpus loader, per-WP signal, and control-difficulty logic verbatim."""
    path = os.path.join(HERE, "relay-corpus.py")
    spec = importlib.util.spec_from_file_location("relay_corpus", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


corpus = _load_corpus_module()


def _terminal(entries, outcome=None):
    """The terminal outcome of a trace, sourced ONLY from the verified ledger chain.

    outcome.json is written by the hook OUTSIDE the hash chain (relay-arm-hook.sh archive_trace: a plain
    printf, never fed through relay_chain_append) and is NOT checked by verify_ledger.py. Trusting it would
    let anyone with write access to the one unsigned file in a trace dir flip the headline outcome with zero
    effect on integrity_ok — exactly the file Relay's "trust the gate" thesis must NOT source from. So we
    ignore it for the terminal verdict and read the signed chain's events instead. The `outcome` arg is
    accepted (and ignored) only for call-site compatibility.

    A verified chain also verifies as a valid PREFIX after tail-truncation (verify_ledger only NOTEs it),
    so a chain whose LAST event is not sprint-complete/escalate is treated as non-terminal — reported as
    'incomplete' rather than folded into complete/escalate. This covers both an in-progress run and a
    truncated one (an agent that failed its gate and was cut mid-trace must not surface as a clean pass)."""
    last = next((e.get("event") for e in reversed(entries) if e.get("event")), None)
    if last == "sprint-complete":
        return "complete"
    if last == "escalate":
        return "escalate"
    return "incomplete"


def _arm_summary(tid, entries, outcome):
    """Collapse one trace into a burndown row: gates cleared/total, current gate, retries, outcome."""
    rows = corpus.per_wp_signal(entries)
    total = len(rows)
    cleared = sum(1 for r in rows if r["passed"])
    retries = sum(r["retries_to_green"] for r in rows)
    term = _terminal(entries)
    # current gate = the first not-yet-passed WP; none means the chain cleared every gate it revealed.
    current = next((r["wp"] for r in rows if not r["passed"]), None)
    # arm label: prefer the SIGNED `arm` field from the chain over the unsigned outcome.json token (which
    # the gate never sealed); fall back to the trace dir name only when the chain carries no arm at all.
    arm = next((e.get("arm") for e in entries if e.get("arm")), None) or tid
    return {
        "trace": tid,
        "arm": arm,
        "gates_total": total,
        "gates_cleared": cleared,
        "current_gate": current,
        "retries": retries,
        "outcome": term,
    }


def _bar(cleared, total, width=20):
    """ASCII progress bar: filled cells proportional to gates cleared / total."""
    if total <= 0:
        return "[" + " " * width + "]"
    filled = int(round(width * cleared / total))
    filled = max(0, min(width, filled))
    return "[" + "#" * filled + "-" * (width - filled) + "]"


def cmd_burndown(traces, as_json):
    valid = [(tid, e, o) for tid, e, o, ok in traces if ok]
    rows = [_arm_summary(tid, e, o) for tid, e, o in valid]
    # None-safe sort key: arm now falls back to the (string) trace dir name, but a None would still abort
    # the ENTIRE view (text and --json) over a real corpus, so guard the comparison rather than trust it.
    rows.sort(key=lambda r: r["arm"] or "")
    tampered = sum(1 for *_, ok in traces if not ok)
    if as_json:
        print(json.dumps({"arms": rows, "tampered": tampered}))
        return 0
    print("== relay burndown (per-arm gate progress) ==")
    print(f"{'arm':<20} {'progress':<24} {'gates':>7}  {'cur':<8} {'retry':>5}  outcome")
    for r in rows:
        bar = _bar(r["gates_cleared"], r["gates_total"])
        gates = f"{r['gates_cleared']}/{r['gates_total']}"
        cur = _safe(r["current_gate"] or "-", 8)
        print(f"{_safe(r['arm'], 20):<20} {bar:<24} {gates:>7}  {cur:<8} {r['retries']:>5}  {_safe(r['outcome'])}")
    if tampered:
        print(f"\n  ! {tampered} tampered trace(s) excluded from the view")
    return 0


def _control_difficulty(traces):
    """Per-control fail/seen counts over integrity-valid traces — the same accounting relay-corpus.py's
    `controls` mode does. Reused here (not duplicated downstream) to surface the hardest controls."""
    from collections import Counter
    fails, total = Counter(), Counter()
    for _, entries, _, ok in traces:
        if not ok:
            continue
        for e in entries:
            if e.get("event") == "checklist-item":
                item = e.get("item")
                if not item:
                    continue
                total[item] += 1
                if e.get("verdict") == "fail":
                    fails[item] += 1
    return fails, total


def cmd_health(traces, as_json, hardest_n=5):
    valid = [(tid, e, o) for tid, e, o, ok in traces if ok]
    tampered = sum(1 for *_, ok in traces if not ok)
    n = len(valid)
    completes = sum(1 for _, e, _ in valid if _terminal(e) == "complete")
    escalates = sum(1 for _, e, _ in valid if _terminal(e) == "escalate")
    # Traces whose verified chain ends non-terminal (in-progress or tail-truncated) are neither pass nor
    # escalate — surface them in their own bucket so a failed-then-truncated agent is never folded into
    # pass_rate. complete + escalate + incomplete == n.
    incomplete = n - completes - escalates
    all_rows = [r for _, e, _ in valid for r in corpus.per_wp_signal(e)]
    green = [r["retries_to_green"] for r in all_rows if r["passed"]]
    mean_retries = sum(green) / len(green) if green else 0.0
    pass_rate = completes / n if n else 0.0
    escalation_rate = escalates / n if n else 0.0
    fails, total = _control_difficulty(traces)
    hardest = [{"control": item, "fails": f, "seen": total[item]}
               for item, f in fails.most_common(hardest_n)]

    if as_json:
        print(json.dumps({
            "traces": n, "tampered": tampered,
            "complete": completes, "escalate": escalates, "incomplete": incomplete,
            "pass_rate": pass_rate, "escalation_rate": escalation_rate,
            "mean_retries_to_green": mean_retries,
            "hardest_controls": hardest,
        }))
        return 0
    print("== relay fleet health ==")
    print(f"  traces:             {n}  ({completes} complete / {escalates} escalate / {incomplete} incomplete)")
    print(f"  pass rate:          {pass_rate:6.1%}")
    print(f"  escalation rate:    {escalation_rate:6.1%}")
    print(f"  mean retries→green: {mean_retries:.2f}")
    if tampered:
        print(f"  ! {tampered} tampered trace(s) excluded from the view")
    print(f"\n  hardest controls (top {hardest_n} by fail count):")
    if hardest:
        print(f"  {'control':<32} {'fails':>6} {'seen':>6}")
        for h in hardest:
            print(f"  {_safe(h['control'], 32):<32} {h['fails']:>6} {h['seen']:>6}")
    elif n == 0:
        # No VALID traces at all (every trace excluded as tampered) is NOT "every control passed first
        # try" — that would tell a reader the fleet is clean when in fact nothing survived verification.
        print(f"  (no valid traces — all {tampered} excluded as tampered)")
    else:
        print("  (no failing controls recorded — every control passed first try)")
    return 0


def main():
    ap = argparse.ArgumentParser(description="The human view over the verified-trace corpus.")
    ap.add_argument("mode", choices=["burndown", "health"])
    ap.add_argument("--corpus", default=os.environ.get("RELAY_CORPUS_DIR",
                    os.path.expanduser("~/.relay/corpus")))
    ap.add_argument("--json", action="store_true", dest="as_json")
    a = ap.parse_args()

    traces = list(corpus.load_corpus(a.corpus))
    if not traces:
        if a.as_json:
            print(json.dumps({"corpus": a.corpus, "traces": 0, "message": "no traces yet"}))
        else:
            print(f"(no traces yet at {a.corpus} — run some armed agents first)")
        return 0
    if a.mode == "burndown":
        return cmd_burndown(traces, a.as_json)
    return cmd_health(traces, a.as_json)


if __name__ == "__main__":
    sys.exit(main())
