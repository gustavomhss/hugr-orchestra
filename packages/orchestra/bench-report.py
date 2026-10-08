#!/usr/bin/env python3
"""Validate correctness-checked rows. Usage: raw expected system results report."""
import json
import statistics
import sys

def fail(message): raise ValueError(message)

def percentile(values, p):
    values = sorted(values)
    return values[min((len(values) - 1) * p // 100, len(values) - 1)]

def validate(rows, expected):
    if not rows: fail("no valid rows")
    runs = expected.get("runs_per_cell")
    if not isinstance(runs, int) or runs < 1: fail("invalid expected run count")
    cells = {(case.get("file"), case.get("mode")): {"expected_outcome": case.get("outcome"), "rows": []} for case in expected.get("cases", [])}
    if not cells or any(cell["expected_outcome"] not in {"success", "error"} for cell in cells.values()): fail("invalid expected cells")
    for row in rows:
        key = (row.get("file"), row.get("mode"))
        if key not in cells: fail(f"unexpected cell: {key}")
        if row.get("expected_outcome") != cells[key]["expected_outcome"]: fail(f"wrong expected outcome: {key}")
        if row.get("observed_outcome") != cells[key]["expected_outcome"]: fail(f"outcome mismatch: {key}")
        if not isinstance(row.get("elapsed_ms"), (int, float)): fail(f"missing elapsed_ms: {key}")
        if row["observed_outcome"] == "success" and not isinstance(row.get("output_chars"), int): fail(f"missing output_chars: {key}")
        if row["observed_outcome"] == "error" and row.get("output_chars") is not None: fail(f"error row has output chars: {key}")
        cells[key]["rows"].append(row)
    missing = [key for key, cell in cells.items() if len(cell["rows"]) != runs]
    if missing: fail(f"missing expected cells or rows: {missing}")
    return cells, runs

def self_test():
    expected = {"runs_per_cell": 1, "cases": [{"file": "x", "mode": "default", "outcome": "success"}]}
    good = [{"file": "x", "mode": "default", "expected_outcome": "success", "observed_outcome": "success", "elapsed_ms": 1, "output_chars": 2}]
    validate(good, expected)
    probes = [([], "zero rows"), ([{**good[0], "observed_outcome": "error"}], "outcome mismatch"), ([{**good[0], "output_chars": None}], "missing chars")]
    for rows, name in probes:
        try: validate(rows, expected)
        except ValueError: continue
        raise AssertionError(f"self-test did not fail closed: {name}")
    print("bench-report self-test: pass")

def main():
    if sys.argv[1:] == ["--self-test"]:
        self_test()
        return
    if len(sys.argv) != 6: raise SystemExit("usage: bench-report.py raw.jsonl expected.json system.json results.json report.md")
    raw_path, expected_path, system_path, results_path, report_path = sys.argv[1:]
    expected, system = json.load(open(expected_path, encoding="utf-8")), json.load(open(system_path, encoding="utf-8"))
    rows = []
    for line_number, line in enumerate(open(raw_path, encoding="utf-8"), 1):
        if not line.strip(): continue
        try:
            row = json.loads(line)
            if not isinstance(row, dict): fail("not object")
        except (json.JSONDecodeError, ValueError) as err: raise SystemExit(f"malformed raw row {line_number}: {err}")
        rows.append(row)
    try: cells, runs = validate(rows, expected)
    except ValueError as err: raise SystemExit(str(err))
    summary = {}
    for key, cell in sorted(cells.items()):
        values, elapsed = cell["rows"], [row["elapsed_ms"] for row in cell["rows"]]
        ms = {"min": min(elapsed), "max": max(elapsed), "avg": statistics.mean(elapsed)}
        if len(values) >= 2: ms.update(p50=percentile(elapsed, 50), p95=percentile(elapsed, 95))
        chars = [row["output_chars"] for row in values if row["output_chars"] is not None]
        summary["|".join(key)] = {"expected_outcome": cell["expected_outcome"], "observed_outcomes": sorted({row["observed_outcome"] for row in values}), "rows": len(values), "elapsed_ms": ms, "output_chars": None if not chars else {"min": min(chars), "max": max(chars), "avg": statistics.mean(chars)}}
    results = {"scope": "filePath, offset, limit only", "system": system, "successful_rows": len(rows), "expected_rows": len(cells) * runs, "cells": summary}
    json.dump(results, open(results_path, "w", encoding="utf-8"), indent=2)
    lines = ["# Read Benchmark", "", "Correctness-first, reproducible harness for `filePath`, `offset`, `limit`.", "", "## Scope", "", "Modes: default, explicit slice, tail, oversized default, oversized explicit range. Every cell validates expected versus observed outcome; success rows also validate numbered-line range and exact content.", "", "No symbol, search, depth, sparse, token, byte, or accuracy measurement. No LSP oracle.", "", "## System", "", f"- Platform: `{system.get('platform', 'unknown')}`", f"- Python: `{system.get('python', 'unknown')}`", f"- Binary: `{system.get('binary', 'unknown')}`", f"- Test rows/expected rows: {len(rows)}/{len(cells) * runs}", f"- Complete cells: {len(cells)}/{len(cells)}", "", "## Results", "", "| fixture | mode | expected | observed | rows | elapsed ms avg | p50 | p95 | output chars avg |", "|---|---|---|---|---:|---:|---:|---:|---:|"]
    for key, metric in summary.items():
        file, mode = key.split("|", 1); ms, chars = metric["elapsed_ms"], metric["output_chars"]
        p50 = f"{ms['p50']:.1f}" if "p50" in ms else "n/a (n<2)"; p95 = f"{ms['p95']:.1f}" if "p95" in ms else "n/a (n<2)"; average_chars = "n/a (expected error)" if chars is None else f"{chars['avg']:.1f}"
        lines.append(f"| {file} | {mode} | {metric['expected_outcome']} | {','.join(metric['observed_outcomes'])} | {metric['rows']} | {ms['avg']:.1f} | {p50} | {p95} | {average_chars} |")
    lines += ["", "## Limits", "", "Elapsed time includes one serial CLI process per row. `output_chars` is JavaScript string character count, not bytes or tokens. System fields describe runtime software/platform only; no CPU, memory, disk, or load controls are collected. Corpus contains LF, CRLF, Unicode/emoji, long-line, dense-large, sparse-large fixtures; cases use range-relevant fixtures. Debug runner removes throwaway session through `Session.remove` finalizer."]
    open(report_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines))
if __name__ == "__main__": main()
