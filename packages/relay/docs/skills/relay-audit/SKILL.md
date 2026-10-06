---
name: relay-audit
description: Maintains Relay verification, problem, and cost reports when agents change bin/relay or benchmark/verify_ledger.py.
---

# Relay audit maintenance

## Trigger

Use this skill for `verify`, `problems`, or `cost` behavior, offline chain verification, ledger resolution, final-control reports, oracle drift, sprint comparison, banners, JSON, or exit codes.
Run maintenance commands from repository root.

## Read first

- Read [bin/relay](../../../bin/relay), [benchmark/verify_ledger.py](../../../benchmark/verify_ledger.py), and [lib/relay-gate.sh](../../../lib/relay-gate.sh).
- Read [test_relay.py](../../../tests/test_relay.py), [test_ledger_provenance.py](../../../tests/test_ledger_provenance.py), [test_oracle_drift.py](../../../tests/test_oracle_drift.py), and [test_sprint_diverged.py](../../../tests/test_sprint_diverged.py).
- Read [test_audit_runtime.py](../../../tests/test_audit_runtime.py) for added IDs, invalid requested/reachable sprints, legacy missing hashes, malformed records, and text/JSON/exit behavior.
- Read [test_gate_core_runtime.py](../../../tests/test_gate_core_runtime.py) and [test_command_transport.py](../../../tests/test_command_transport.py) for current full-string oracle transport and regression command handling.
- Read [test_await_human.py](../../../tests/test_await_human.py) for problem and escalation reports and [test_cost.py](../../../tests/test_cost.py) for recorded usage rollups.
- Read verifier consumers [relay-corpus.py](../../../bin/relay-corpus.py) and downstream [relay-dash.py](../../../bin/relay-dash.py), with [test_corpus.py](../../../tests/test_corpus.py) and [test_dash.py](../../../tests/test_dash.py), before changing integrity results.
- Read [enforcement model](../../../docs/enforcement-model.md) for intent, then verify each claimed boundary against current source.

## Ownership

Own `bin/relay` and `benchmark/verify_ledger.py`; claim exact paths through the catalog before editing either.
Route recorded oracle and envelope changes to [gate core](../relay-gate-core/SKILL.md), [arm hook](../relay-arm-hook/SKILL.md), or [gate CLI](../relay-gate-cli/SKILL.md).
Route corpus and dashboard readers to [telemetry](../relay-telemetry/SKILL.md); obtain disjoint claims and independent review.

## Contracts

- Preserve `python3 bin/relay verify <run-dir|ledger.jsonl> [--sprint <sprint.json>] [--json]`.
- Resolve directory ledgers first at `.relay-state/ledger.jsonl`, then at `ledger.jsonl`; locate sprints at top-level `sprint.json`, then `.relay-state/sprint.json`.
- Delegate chain integrity to `benchmark/verify_ledger.py`; keep exact signed-body verification separate from control interpretation.
- Preserve `python3 benchmark/verify_ledger.py <ledger.jsonl>` with exit 0 for an intact chain, 1 for broken integrity or a mode mismatch, and 2 for usage errors or a missing ledger.
- Decode ledger entries with `strict_json_loads`/`unique_object`, rejecting duplicate decoded object keys at every nesting depth, including objects inside arrays and escaped-equivalent names such as `verdict`/`\u0076erdict`. Do not silently select the last duplicate, even when the ambiguous original body has a valid MAC.
- The shared decoder's `parse_constant` rejects unquoted `NaN`, `Infinity`, and `-Infinity` at any depth. Quoted strings and valid lexical JSON numbers such as `1e999` remain allowed; this is not arbitrary numeric exactness or complete finite-valued schema validation. `bin/relay` uses the same ledger decoder.
- Require exactly one decoded root `h`, as the final root member, with a valid digest. Reject missing/duplicate root hashes and unsigned members after `h`; a nested `data.h` is ordinary signed data, not the root digest. Recover the signed body from the original serialized line using the final literal `,"h":` suffix and restored closing brace; validate that suffix belongs only to the final root hash. Never reserialize parsed entries before hashing.
- Verify MAC mode, original body hash, `prev`, and `seq` separately from decoded control interpretation. The shared writer reserves root `h` and rejects a supplied top-level hash; that does not make arbitrary input validation or writer identity authenticated. An intact empty/prefix chain is still not an auditable run.
- Return verify exit 1 for nonintact chains, exit 2 for intact but nonauditable runs, and exit 0 for the implemented PASS predicate.
- Require usable audit fields, recorded deterministic controls whose final verdicts are all `pass`, no oracle drift, no invalid/diverged/unverified sprint comparison, and terminal `sprint-complete` rather than escalation or a nonterminal tail for PASS. `not-run` comparison permits only recorded-control scope.
- Keep final per-control reports as the last `checklist-item` per item ID; do not overwrite them with `regression-item` verdicts.
- Use both checklist and regression events for oracle drift; report any recorded oracle change, with `laundered` marking prior-fail/current-pass histories.
- Recompute current sprint oracles from decoded JSON `cmd`, otherwise judge criterion plus ` :: ` and raw space-joined `paths` when nonempty, before environment expansion. Current gate JSON-string decoding preserves tabs, interior LF, and trailing LF; repaired regression readers transport JSON records rather than raw `ID<TAB>cmd` lines. Do not retain the old trailing-LF/truncated-command drift warning as current behavior.
- Compare named IDs in both directions using all checklist/regression events, including legacy events without hashes. Changed or removed recorded controls and added/unrecorded current controls produce `oracle_recheck.status = diverged`, `SPRINT-DIVERGED`, exit 2. Compare available last-recorded hashes; ID agreement alone does not establish oracle agreement.
- Preserve `oracle_recheck.status = not-run` only when no sprint is selected or discovered, including a bare ledger without `--sprint`. A completed usable record can then PASS with explicit recorded-controls-only scope; even legacy missing hashes do not force exit 2 in that scope.
- A requested or discovered sprint that cannot be read/decoded or lacks a usable named-control shape produces `oracle_recheck.status = invalid`, `SPRINT-INVALID`, exit 2. Explicit `--sprint` with no path is invalid, not omitted. Duplicate checklist IDs, nonstring cmd/judge, malformed judge paths, and controls without an oracle are rejected by this comparison reader.
- Any graded event lacking an oracle is legacy unverified evidence. With a reachable matching sprint, report `oracle_recheck.status = unverified` and the missing-hash IDs; an otherwise completed usable record yields `ORACLE-UNVERIFIED`, exit 2. Added/removed/changed IDs still diverge first; never guess absent hashes.
- Distinguish chain defects from audit-field defects: malformed/duplicate-key ledger JSON, nonobjects, nonfinal root `h` or unsigned suffix members, invalid chain fields, hash/link/sequence or mode failures yield `TAMPERED`, exit 1. `verify --json` reports `chain_intact:false` and does not interpret those bytes as controls. Intact chains with unusable interpreted fields yield `RECORD-INVALID`, exit 2 and `record_errors`, not control success or a traceback.
- Graded-event verdicts must be `pass`, `fail`, or `advisory`. An unknown value is `RECORD-INVALID`; deterministic `advisory` is usable data but `CONTROL-FAIL`, exit 2. Neither can contribute a deterministic pass.
- Report judge controls as non-independent and exclude their verdicts from deterministic counts; a judge-caused terminal escalation still makes the run nonauditable.
- Preserve JSON failure precedence: `TAMPERED`, `RECORD-INVALID`, `SPRINT-INVALID`, `SPRINT-DIVERGED`, `NO-CONTROLS`, `CONTROL-FAIL`, `ORACLE-CHANGED`, `ORACLE-DRIFT`, `ESCALATED`, `ORACLE-UNVERIFIED` (unless nonterminal), then `TRUNCATED`. Text banners use spaces and prefer oracle-change/drift over control-fail when both apply; exits agree.
- Keep comparison scope limited to named IDs and cmd/judge-plus-paths hashes. Verification does not rerun controls, revalidate current artifacts or recorded artifact digests, prove every WP/DoD was executed, compare every plan field, or authenticate authors/reviewers.
- Preserve `python3 bin/relay problems <run-dir|ledger.jsonl> [--json]` with exit 1 for derived problems, 0 for none, and 2 for missing arguments or ledger.
- Derive problems from ledger history, not current arm files; plan defects remain reported when present and an earlier escalation remains reported until final completion.
- Preserve `python3 bin/relay cost <run-dir|ledger.jsonl> [--json]` as a rollup of recorded usage and elapsed fields.
- Keep `total: null` for absent usage data, unknown first-state elapsed data distinct from zero, and available fields without invented currency prices.
- Do not describe problem or cost views as integrity-verified: those subcommands load ledger entries directly without running chain verification.

## Procedure

1. Inspect baseline, scope, and consumers through [maintenance](../relay-maintenance/SKILL.md) and [blast radius](../relay-blast-radius/SKILL.md).
2. Trace path resolution, chain status, entry parsing, final-control selection, drift, and sprint recheck separately.
3. Preserve failure precedence in both text and JSON; compare result labels, payload fields, and process exit codes.
4. For oracle changes, compare actual extraction and hashing with the real shell path, including tabs and trailing/interior LF, rather than a second independently typed formula. Preserve legacy evidence without rewriting its hashes.
5. For problem changes, test historical escalation and plan defects separately from self-clearing latest gate failures.
6. For cost changes, compare totals over all cost-bearing events with state rows selected only from advance, completion, and escalation events.
7. Update this skill and request consuming skill, catalog, and index updates through the lead.

## Checks

Select affected groups and run them sequentially:

```bash
python3 -m pytest tests/test_audit_runtime.py -q
python3 -m pytest tests/test_relay.py tests/test_ledger_provenance.py -q
python3 -m pytest tests/test_oracle_drift.py tests/test_sprint_diverged.py -q
python3 -m pytest tests/test_await_human.py tests/test_cost.py -q
python3 -m pytest tests/test_corpus.py tests/test_dash.py -q
```

Use audit-runtime tests for real completed runs plus added false controls, invalid explicit/discovered sprint inputs, bare-ledger scope, legacy hashes, intact unusable records, deterministic advisory, malformed chain fields, raw plain/keyed/legacy modes, and failure precedence.
Require the C5 cases with real HMAC unsigned suffixes, literal/escaped root duplicates, MAC-valid nested duplicates, final-root-h enforcement, and accepted nested `h` data in compact/spaced bodies. Positive controls must retain their original bytes; valid-prefix truncation remains a separate limitation. Report-loader tests verify shared duplicate-free decoding, not integrity checks in every report subcommand.
Require `tests/test_audit_runtime.py::test_c5b_non_json_constants_break_signed_chain` for unquoted constant rejection in plain/keyed/legacy bodies and nested objects/arrays, alongside accepted lexical numbers (including `1e999`) and quoted constant strings. Verify reports `TAMPERED`/exit 1; these cases do not establish a complete finite-valued schema.
Use the other groups for chain/result interpretation, oracle continuity, problem/usage reports, and verifier effects on [telemetry](../relay-telemetry/SKILL.md) consumers respectively. For oracle transport changes, select `tests/test_gate_core_runtime.py` and `tests/test_command_transport.py`; named cases establish full-string handling within their exercised scope.
Inspect `oracle_recheck.status`, terminal event, deterministic counts, and exit code together before interpreting a PASS.
Run [documentation checks](../relay-maintenance/SKILL.md) after skill edits; hand shared index regeneration to the lead.

## Cold review

- Require `author != reviewer` and a fresh isolated reviewer context for every audit change.
- Freeze the baseline SHA, exact diff, exact artifact path list, and content hashes, including untracked skills; any revision invalidates approval of the previous artifact set.
- Have the reviewer read `bin/relay`, `benchmark/verify_ledger.py`, ledger writers, corpus/dashboard and other report-consumer contracts, and affected documentation, then run the named applicable commands in Checks.
- Inspect text/JSON/exit precedence, final checklist verdict selection versus regression history, full-string oracle handling, bidirectional ID comparison including added/unrecorded IDs, and invalid/unverified/`not-run` distinctions.
- Confirm duplicate decoded keys at every nesting depth, escaped-equivalent names, exactly one final root hash, unsigned suffix rejection, accepted nested hash data, and original-body hashing. Distinguish structured chain failures from intact-record failures, unknown/advisory deterministic rejection, named-control comparison from full-plan/current-artifact coverage, and plain/keyed/tail-truncation limits; inspect problem-history and partial-usage semantics, refusing unsupported or stale claims and missing dependencies.
- For claims about checks, test the actual failure direction with the executable check and a meaningful violating case in isolated scratch state; never substitute a probe of prose.
- Issue exactly `APPROVE`, `FIX-FIRST`, or `REJECT`, with file-path evidence, commands and exits, and residual limitations; independently inspect audit predicates and artifacts rather than trusting the author's self-report.
- Require every `FIX-FIRST` finding to be fixed, the revised artifact set to be frozen again, and independent re-review before approval.
- Treat this section as mandatory operating procedure; the skill text does not mechanically enforce review or guarantee detection of every error.

## Failure handling

- Preserve original evidence and diagnostics; do not reseal, truncate, or replace an audited ledger to obtain PASS.
- Preserve historical ledger/corpus bytes when stricter parsing rejects ambiguous records. Record the rejection and source version; parser repair is not permission to rewrite dated evidence or case labels.
- Treat plain chains as resealable by a writer and HMAC as stronger only with key isolation; both modes admit valid-prefix truncation without an external head anchor.
- Use verify's structured JSON for exercised malformed-chain and interpreted-field failures. Offline verification rejects broken records before control interpretation; intact audit-field failures are exit 2, with their errors named. Usage/missing-ledger failures remain stderr plus exit 2 rather than a verify JSON report.
- All report loaders now share duplicate-free decoding, but `problems` and `cost` still call `load_entries` directly without integrity verification or complete interpreted-field validation. Their parsing errors can raise directly; do not extend verify's structured failure-report guarantee to those views.
- Preserve current verifier limits: named-ID comparison rejects additions/removals but does not reexecute commands, prove every WP/DoD ran, revalidate artifacts, or compare every judge configuration field.
- Only final deterministic `pass` counts as passed. Keep unknown verdict rejection separate from deterministic advisory/control failure.
- Describe cost and dashboard values as partial recorded usage; state or macro sums can omit retry usage and are not invoices or full spend coverage.

## Done

Return changed report predicates, text/JSON/exit effects, source-supported verifier limits, targeted check outcomes, and independent-review handoff.
Require independent `APPROVE` for the frozen final artifacts plus applicable validation before declaring Done; the author's self-report is insufficient.
