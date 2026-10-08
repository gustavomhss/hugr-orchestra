---
name: relay-telemetry
description: Use when auditing retained Relay traces, exporting corpus rows, reading burndown or health, or interpreting problems and token-cost reports.
---

# Relay traces and telemetry

Audience: agents. Status: current.

## Trigger

Use when inspecting recorded execution, preparing corpus exports, or explaining metrics and their limits.

## Read first

- [Corpus](../../../bin/relay-corpus.py), [dashboard](../../../bin/relay-dash.py), [report CLI](../../../bin/relay).
- [Archive writer](../../../bin/relay-arm-hook.sh), [chain verifier](../../../benchmark/verify_ledger.py).
- [Corpus tests](../../../tests/test_corpus.py), [dash tests](../../../tests/test_dash.py), [cost tests](../../../tests/test_cost.py).
- [Integration](../relay-integration/SKILL.md), [telemetry reference](../../../docs/telemetry.md), [retention reference](../../../docs/trace-corpus.md).

## Ownership

- Arm hook attempts terminal snapshots; operator owns durable storage, keys, head anchors, and dataset curation.
- Corpus loader checks chain integrity; views derive statistics from accepted snapshots.
- Consumer owns acceptance decisions and training interpretation. A metric is not a completion certificate.

## Contracts

- Arm completion/escalation archives to `RELAY_CORPUS_DIR`, default `~/.relay/corpus`.
- Directory name is `<token>-<first-12-head-hex>`; snapshot copies ledger, sprint, meta, and unsigned outcome JSON.
- Copying is best-effort, not transactional immutable storage. Verify snapshot contents before deleting arm state.
- CLI and benchmark driver do not use this arm corpus archive; benchmark keeps its own `.relay-ledger` artifacts.
- Corpus discovery scans immediate trace directories containing `ledger.jsonl`; verifier exit 0 marks integrity-valid.
- A chain verifier accepts valid nonterminal prefixes and empty chains; that is weaker than `relay verify` PASS.
- Supply the same `RELAY_LEDGER_KEY` for keyed chains; wrong/missing keys cause exclusion too, not only tampering.
- `per_wp_signal` derives rows from checklist verdicts, failure retries, and advancement/completion events.
- `retries_to_green` is max recorded retry counter per WP, including `gate-fail-repeat`; it is not total fires
  or summed budgets across human releases. `n_controls` is unique checklist IDs seen, not all declared controls.
- `n_fail_verdicts` and difficulty counts count recorded checklist verdicts; regression verdicts are separate.
- Repeated-round collapsing suppresses duplicate checklist entries; fail counts do not count every evaluation.
- Escalation then human release/completion can retain multiple snapshots of one arm; shared prefixes repeat.
  Corpus tools do not collapse snapshots to one execution. Account for duplication before fleet or training claims.
- Corpus `stats` trusts unsigned `outcome.json` OR any matching terminal event, so a snapshot can count in both
  outcome buckets. `export.outcome` comes directly from unsigned outcome JSON; integrity does not authenticate it.
- Dash uses the verified chain's last event-bearing entry for `complete`/`escalate`; otherwise `incomplete`.
- Dash labels prefer chain `arm`; fallback is trace directory name. Burndown total covers observed WP rows,
  not the sprint's entire planned WP count. Current gate is first unpassed row in the signal's sorted order.
- Health rates use all integrity-valid retained traces, including incomplete, as denominator.
- Dashboard is a one-shot view of retained snapshots, not a live arm-state monitor.
- Human dashboard sanitizes C0/C1 control bytes; JSON preserves values with JSON escaping.
- `relay problems` derives attention flags from chain events; exits 1 for problems, 0 for none, 2 for missing input.
- `relay cost` totals recorded `cost` dictionaries. No usage means `total:null`, not zero spend.
- Arm hook reads transcript usage windows via `tr_cursor`; first state's elapsed time is absent unless entry time exists.
- CLI supplies no transcript usage. Cost is token/cache/turn accounting, not dollars or full judge-call billing.
- Total cost sums priced events; state/macro rows use only advance/complete/escalate events, so failure-window
  spending can appear in totals without fully appearing in per-state rollups. Do not claim complete attribution.

## Procedure

1. Locate the run layout and original sprint; inspect integrity and control outcomes before reporting success:

   ```sh
   python3 bin/relay verify /absolute/arm --sprint /absolute/arm/sprint.json --json
   python3 bin/relay problems /absolute/arm --json
   python3 bin/relay cost /absolute/arm --json
   ```

2. Inspect retained snapshots with an explicit corpus, avoiding another experiment's default storage:

   ```sh
   python3 bin/relay-corpus.py --corpus /absolute/corpus stats
   python3 bin/relay-corpus.py --corpus /absolute/corpus controls
   python3 bin/relay-dash.py --corpus /absolute/corpus burndown --json
   python3 bin/relay-dash.py --corpus /absolute/corpus health --json
   ```

3. Review snapshot overlap, keys, unsigned outcomes, collapsed rounds, and observed-WP coverage before export:

   ```sh
   python3 bin/relay-corpus.py --corpus /absolute/corpus export -o /absolute/output/rows.jsonl
   ```

4. For acceptance, use `relay verify --sprint`, not a dashboard headline or corpus outcome label.

## Checks

Run `python3 -m pytest tests/test_corpus.py tests/test_dash.py tests/test_cost.py -q` for telemetry changes.
Use a valid trace and a deliberately altered copy to prove inclusion/exclusion; retain originals.
Check dash terminal behavior with a nonterminal prefix and contradictory unsigned outcome metadata.
Empty/missing corpus exits 0 with an empty message; that is not evidence of a measured healthy fleet.

## Cold review

Mandatory: reviewer must differ from author and use a fresh isolated context without author-session history.
Freeze baseline commit, exact diff path, and artifact paths; reviewer inspects archive/report source and consumers.
Exercise this skill's archive/corpus/dash/verify integration with named checks:
- Run `python3 -m pytest tests/test_corpus.py tests/test_dash.py tests/test_cost.py -q`.
- Replay Procedure with valid, altered, nonterminal, and contradictory unsigned-outcome snapshots; inspect
  sealed versus unsigned metrics, duplicate prefixes, collapsed rounds, and missing/incomplete cost attribution.
Write `APPROVE`, `FIX-FIRST`, or `REJECT` to a review evidence file, citing filepaths, exact commands/exits,
observed results, and residual limits. Missing validation evidence blocks `APPROVE`.
Fix findings, freeze revised diff/artifacts, and obtain independent re-review before Done.
This documented duty is not automatic enforcement and does not guarantee error-free results.
Commit or PR requires explicit authorization.

## Failure handling

Excluded traces: distinguish key/mode mismatch, malformed chain, and actual alteration; preserve evidence.
Missing snapshots: inspect terminal archive and storage permissions; best-effort copying may have failed.
Conflicting outcomes: use terminal chain for dashboard interpretation and verify for acceptance; label corpus exports untrusted here.
Absent cost or first-state time: report unmeasured fields. Never substitute zero or infer judge billing.

## Done

Independent `APPROVE` evidence and validation for the frozen revision are required.
Report states trace population, integrity mode, terminal/control status, duplication, and metric limitations.
Exports retain original snapshots and sprint context; no live-dashboard or full-cost claim exceeds recorded evidence.
