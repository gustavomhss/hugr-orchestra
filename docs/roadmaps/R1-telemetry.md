# Roadmap R1 — Telemetry / burndown over the trace corpus

**Owns (disjoint):** `bin/relay-dash.py`, `tests/test_dash.py`, `docs/telemetry.md`. Nothing else.
**Frozen contract:** consumes the corpus written by `bin/relay-arm-hook.sh` `archive_trace` and the rows
`bin/relay-corpus.py` already exposes (`per_wp_signal`: `wp, passed, retries_to_green, n_controls,
n_fail_verdicts, graded_by`). Read-only over `$RELAY_CORPUS_DIR`; never mutates a trace.

The signal exists (`relay-corpus.py export`); the *view* does not. R1 builds the human surface.

`bin/relay-dash.py` — pure-stdlib (no deps). Subcommands:
- `burndown [--corpus DIR]` — per-arm progress: gates cleared / total, current gate, retries spent,
  terminal outcome (complete/escalate). ASCII bars, one row per arm.
- `health [--corpus DIR]` — fleet rollup: pass rate, escalation rate, mean retries→green, the N
  hardest controls (highest fail count, reuse the corpus `controls` logic — do NOT duplicate it; import
  or shell out to `relay-corpus.py`).
- `--json` on both for machine consumption.

Integrity: a tampered trace must be EXCLUDED (reuse `relay-corpus.py`'s verify-then-include path; do not
reimplement the verifier). Empty corpus → clean "no traces yet" message, exit 0.

**Tests:** drive real `bin/relay-dash.py` via subprocess over a tmp corpus built by firing the real
arm hook (mirror `tests/test_corpus.py` harness). Assert burndown rows, health rollup, tampered-exclusion,
empty-corpus. Isolate `$RELAY_CORPUS_DIR` in tmp_path.
