#!/usr/bin/env bash
# Correctness-first benchmark for filePath/offset/limit read modes.
# Usage: ./bench-hardcore.sh <binary> [corpus_dir] [runs] [out_dir]
# Self-test: BENCH_SELF_TEST=1 ./bench-hardcore.sh
set -euo pipefail
BIN="${1:-}"
CORPUS="${2:-/tmp/bench-corpus}"
RUNS="${3:-5}"
OUT="${4:-/tmp/bench-result}"
if [[ "${BENCH_SELF_TEST:-}" != 1 ]]; then
  [[ -n "$BIN" && -x "$BIN" ]] || { echo "usage: $0 <binary> [corpus_dir] [runs] [out_dir]" >&2; exit 2; }
  [[ -f "$CORPUS/manifest.json" ]] || { echo "corpus manifest missing: $CORPUS/manifest.json (run bench-corpus.sh)" >&2; exit 2; }
  [[ "$RUNS" =~ ^[1-9][0-9]*$ ]] || { echo "runs must be positive integer" >&2; exit 2; }
fi
mkdir -p "$OUT"
export BIN CORPUS RUNS OUT BENCH_SELF_TEST
# One process per invocation. Serial avoids SQLite database-locked artifacts.
python3 - <<'PY'
import hashlib, json, os, platform, subprocess, sys, time
from pathlib import Path

def fail(message): raise ValueError(message)

def parsed_content(output):
    if not isinstance(output, str) or output.count("<content>\n") != 1: fail("missing or duplicate content opener")
    _, rest = output.split("<content>\n", 1)
    if rest.count("\n</content>") != 1: fail("missing or duplicate content closer")
    body, _ = rest.split("\n</content>", 1)
    rows, footer = [], False
    for line in body.splitlines():
        number, sep, text = line.partition(": ")
        if sep and number.isdecimal():
            if footer: fail("numbered row after footer")
            rows.append((int(number), text))
        else:
            footer = True
    if not rows: fail("no numbered content rows")
    return rows

def validate_envelope(envelope, params, expected):
    if not isinstance(envelope, dict) or envelope.get("tool") != "read" or envelope.get("params") != params: fail("invalid read envelope")
    expected_outcome = expected["outcome"]
    if expected_outcome == "error":
        if envelope.get("ok") is not False: fail("expected ok:false error envelope")
        if "output" in envelope: fail("error envelope unexpectedly contains output")
        error = envelope.get("error")
        if not isinstance(error, str) or expected["error_fragment"] not in error: fail("expected error fragment missing")
        return "error", None, None
    if envelope.get("ok") is False or "output" not in envelope: fail("expected successful output envelope")
    actual = parsed_content(envelope["output"])
    if actual != expected["rows"]: fail(f"oracle mismatch: expected {expected['rows'][:2]!r}, got {actual[:2]!r}")
    return "success", len(envelope["output"]), [actual[0][0], actual[-1][0]]

def self_test():
    params = {"filePath": "/fixture"}
    success = {"outcome": "success", "rows": [(1, "one")]}
    good = {"tool": "read", "params": params, "output": "<content>\n1: one\n\n(End)\n</content>"}
    if validate_envelope(good, params, success)[0] != "success": raise AssertionError("success self-test")
    error = {"outcome": "error", "error_fragment": "Requested range exceeds 50 KB output limit"}
    bad = {"tool": "read", "params": params, "ok": False, "error": "Requested range exceeds 50 KB output limit"}
    if validate_envelope(bad, params, error)[0] != "error": raise AssertionError("error self-test")
    probes = [
        (lambda: json.loads("not-json"), "malformed envelope"),
        (lambda: validate_envelope({**good, "output": "<content>\n1: wrong\n</content>"}, params, success), "oracle mismatch"),
        (lambda: validate_envelope(good, params, error), "unexpected successful outcome"),
        (lambda: validate_envelope({**bad, "ok": True}, params, error), "unexpected error outcome"),
        (lambda: validate_envelope({**bad, "error": "Requested range exceeds 51 KB output limit"}, params, error), "expected-error fragment mismatch"),
        (lambda: parsed_content("<content>\n1: one\n</content><content>\n2: two\n</content>"), "duplicate delimiter"),
    ]
    for probe, name in probes:
        try: probe()
        except (ValueError, json.JSONDecodeError): continue
        raise AssertionError(f"self-test did not fail closed: {name}")
    print("bench-hardcore self-test: pass")

if os.environ.get("BENCH_SELF_TEST") == "1":
    self_test()
    raise SystemExit(0)

bin_path, corpus, runs, out = os.environ["BIN"], Path(os.environ["CORPUS"]), int(os.environ["RUNS"]), Path(os.environ["OUT"])
manifest = json.loads((corpus / "manifest.json").read_text())
for fixture in manifest.get("fixtures", []):
    path = corpus / fixture["file"]
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != fixture["sha256"]: raise SystemExit(f"invalid corpus fixture: {path}")
def source_rows(path, params):
    lines = path.read_text(encoding="utf-8").splitlines(); offset, limit = params.get("offset", 1), params.get("limit", 2000)
    start = max(1, len(lines) + 1 + offset) if offset < 0 else offset
    return [(start + i, line) for i, line in enumerate(lines[start - 1:start - 1 + limit])]
cases = [
    {"mode": "default", "file": "lf-unicode.txt", "params": {}, "outcome": "success"},
    {"mode": "explicit_slice", "file": "lf-unicode.txt", "params": {"offset": 2, "limit": 2}, "outcome": "success"},
    {"mode": "tail", "file": "lf-unicode.txt", "params": {"offset": -2}, "outcome": "success"},
    {"mode": "oversized_default", "file": "sparse-large.txt", "params": {}, "outcome": "success"},
    {"mode": "oversized_explicit_range", "file": "dense-large.txt", "params": {"offset": 1, "limit": 1000}, "outcome": "error", "error_fragment": "Requested range exceeds 50 KB output limit"},
]
rows = []
for case in cases:
    path, extra = corpus / case["file"], case["params"]
    expected = dict(case)
    if expected["outcome"] == "success":
        expected["rows"] = source_rows(path, extra)
        if not expected["rows"]: raise SystemExit(f"oracle produced no rows: {case['mode']}")
    for run in range(runs):
        params = {"filePath": str(path), **extra}; before = time.monotonic_ns()
        proc = subprocess.run([bin_path, "debug", "read", "--params", json.dumps(params)], text=True, capture_output=True)
        elapsed_ms = (time.monotonic_ns() - before) / 1_000_000
        if proc.returncode != 0: raise SystemExit(f"unsuccessful process {case['file']}/{case['mode']}/{run}: {proc.stderr.strip()}")
        lines = [line for line in proc.stdout.splitlines() if line.strip()]
        if len(lines) != 1: raise SystemExit(f"invalid envelope count {case['file']}/{case['mode']}/{run}: {len(lines)}")
        try: envelope = json.loads(lines[0]); observed, chars, source_range = validate_envelope(envelope, params, expected)
        except (json.JSONDecodeError, ValueError) as err: raise SystemExit(f"invalid result {case['file']}/{case['mode']}/{run}: {err}")
        rows.append({"file": case["file"], "mode": case["mode"], "run": run, "expected_outcome": case["outcome"], "observed_outcome": observed, "elapsed_ms": elapsed_ms, "output_chars": chars, "range": source_range})
(out / "raw.jsonl").write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
(out / "expected.json").write_text(json.dumps({"runs_per_cell": runs, "cases": [{k: v for k, v in case.items() if k != "params"} for case in cases]}, indent=2) + "\n")
(out / "system.json").write_text(json.dumps({"platform": platform.platform(), "python": sys.version.split()[0], "binary": bin_path}, indent=2) + "\n")
PY
if [[ "${BENCH_SELF_TEST:-}" == 1 ]]; then
  python3 "$(dirname "$0")/bench-report.py" --self-test
  exit 0
fi
python3 "$(dirname "$0")/bench-report.py" "$OUT/raw.jsonl" "$OUT/expected.json" "$OUT/system.json" "$OUT/results.json" "$OUT/report.md"
