---
name: relay-daemon
description: Maintains Relay HTTP gate and wait-channel behavior when agents change bin/relay-daemon.py or its service contracts.
---

# Relay daemon maintenance

## Trigger

Use this skill for HTTP request validation, CLI outcome translation, state-directory serialization, arm asks and answers, wait caps, or service diagnostics.
Run maintenance commands from repository root.

## Read first

- Read [bin/relay-daemon.py](../../../bin/relay-daemon.py), [bin/relay-gate](../../../bin/relay-gate), [bin/relay-note](../../../bin/relay-note), and [lib/relay-gate.sh](../../../lib/relay-gate.sh).
- Read [test_daemon.py](../../../tests/test_daemon.py), [test_ask.py](../../../tests/test_ask.py), and [test_gate_cli.py](../../../tests/test_gate_cli.py).
- Read [test_await_human.py](../../../tests/test_await_human.py) and [test_concurrent_gate.sh](../../../tests/test_concurrent_gate.sh) for shared parking and locking semantics.
- Read [daemon reference](../../../docs/daemon.md) and [integration](../relay-integration/SKILL.md), verifying prose against executable routes and locks.

## Ownership

Own `bin/relay-daemon.py`; route gate disposition changes to [gate CLI](../relay-gate-cli/SKILL.md) and chain notes to [gate core](../relay-gate-core/SKILL.md).
Route arm-state compatibility to [arm hook](../relay-arm-hook/SKILL.md) and ledger views to [audit](../relay-audit/SKILL.md) or [telemetry](../relay-telemetry/SKILL.md).
Obtain disjoint claims and an independent reviewer before changing service contracts.

## Contracts

- Preserve startup `python3 bin/relay-daemon.py --host 127.0.0.1 --port 8787`; use `RELAY_DAEMON_PORT` as the default port when set, with the CLI flag taking precedence.
- Keep loopback as the default, not an enforced host restriction: `--host` accepts other bind addresses.
- State the security boundary accurately: the service has no authentication, TLS, or authorization and executes caller-supplied sprint commands; do not expose it to an untrusted network.
- Preserve `GET /healthz` returning HTTP 200 and `{status:"ok", gate:"relay-gate"}`; it reports service response, not successful gate execution.
- Preserve `POST /gate/eval` with `workdir`, `state_dir`, and exactly one of `sprint_path` or inline `sprint`.
- Materialize inline sprint JSON in a temporary file and delete it after the request; preserve disk state in the supplied state directory across calls.
- Delegate evaluation to `bin/relay-gate eval`; translate `advance`/`complete` to 200, `gate-fail` to 409, and `escalate` to 423.
- Preserve exact decoded CLI `wp`, `next`, and emitted `macro` strings in outcomes, and `wp`/emitted `macro` in ledger entries, including tabs, CR, and trailing LF. CLI validates the selected WP ID/macro and required next `eval` ID before commands/ledger effects; `check` does not validate future identities. This is driver-scoped identity handling, not full sprint validation.
- Map unusable or missing CLI JSON outcomes to HTTP 500 with `error`, `detail`, and process `exit`; current CLI busy exit 3 therefore surfaces as 500.
- Keep bad request validation at HTTP 400: JSON-object bodies and nonempty NUL-free path strings for `/gate/eval`, nonempty NUL-free token/question/ticket/answer strings for wait routes. Preserve unknown routes at 404 and generic `sprint_path not found` without echoing the requested path.
- Serialize `/gate/eval` requests by realpath of `state_dir` using in-process locks; keep CLI `.run.lock` and shared `.chain.lock` as separate cross-process mechanisms.
- Serialize complete `/ask` and `/answer` operations by arm realpath in that same lock registry, including symlink aliases. This covers one daemon process, not other daemons or whole arm-hook transactions.
- Preserve `POST /ask` body `{token, question}` and `POST /answer` body `{token, ticket, answer}`; resolve arms through `RELAY_ARMS_DIR`.
- Refuse unknown arms with 404; reject invalid payload fields with 400. `complete`, `awaiting-human`, and `escalated` states return 423 before prechecking.
- Read persisted `position` as UTF-8 with `newline=""`, without translating CR/LF. Resolve the raw whole WP ID first, then its first-dot suffix. Only after both raw candidates fail, strip trailing LF for legacy files and retry whole-ID then first-dot-suffix resolution. Keep literal CR and other whitespace; pass the successful raw or normalized string through CLI check's `--position`.
- Named checks override stale or past-end compatibility counters. Use a validated legacy counter only when no position exists; an active arm with no current WP is a 500 arm-data error. ARM also reads raw position with `jq -Rs`/lossless JSON-string decoding, uses raw-first/LF-only fallback, and writes supported identities without adding LF. Existing empty daemon position is invalid; ARM empty-position migration is a separate contract, not universal field-level losslessness.
- Validate daemon WP IDs as nonempty NUL-free strings with uniqueness, retaining whitespace as identity data. Supplied WP macros must be NUL-free strings; daemon rejects explicit null, while CLI/ARM treat absent/null optional macros as empty. Preserve this input-validation asymmetry.
- Resolve the baseline from `base_<safe-actual-wp-id>`, otherwise `meta.base_ref`; sanitize the resolved WP ID byte-wise with the ARM key rule. Pass check's `--base-ref` when position/base metadata or a diff requires it. An explicit empty base must prevent fallback to unrelated CLI `base_ref`; it is not permission to invent a baseline.
- Keep the precondition checklist-only: no DoD, earlier regressions, retries, advancement, or grading-ledger writes. Check still executes command/judge side effects and acquires CLI `.run.lock`.
- Accept only `outcome:check` with the selected `i`/`wp`, a list of declared failing control IDs, and process exit 0/1 consistent with that list. Only a valid empty list returns the passing-checklist refusal (409).
- Map check exit 3 to 503 (`check busy`); unexpected exits or malformed/inconsistent output to 500 (`check error`), retaining process diagnostics and `exit`. Arm metadata, position, counter, and selected-checklist shape errors are 500, not satisfied-checklist refusals.
- Derive tickets from the first 12 hex characters of SHA-256 of the stripped question; reuse a ticket for repeated questions.
- Serve three unanswered pokes per ticket and park on the fourth; deliver stored answers before charging a new unanswered poke.
- Park on delivery of refusal words `no`, `n`, `stop`, `denied`, `refused`, `reject`, or `rejected`; record normal delivery as `ask-answered`. Stored answers remain repeatable without new poke/total charges while the checklist still fails.
- Count unanswered asks per arm, notify on total above default cap 8, and keep serving unless the orchestrator stops or silence reaches the deadline (default 900 seconds).
- Read `ask_cap`, `ask_deadline`, `ask_breach_ts`, and `orchestrator.json`; honor `continue`, `stop`, or `park` as implemented.
- Write parking as `state = awaiting-human`, record `ask-parked`, and return HTTP 423 without advancing the arm.
- Append notes through `bin/relay-note` and join list values for ledger fields; retain lists in HTTP responses.
- Require note subprocess success. Append failure returns 500 (`note error`) before the corresponding counter or parked-state write; earlier notes/directories can remain and later filesystem writes can fail. Do not claim ledger/state rollback or whole-transaction atomicity.
- Validate answer tickets as 12 lowercase hex characters and require a stored ask with a positive poke count. Unknown valid tickets return 404 without creating orphan answers; malformed stored ticket data returns 500. Answer storage adds no ledger note and does not authenticate its author.

## Procedure

1. Inspect baseline, claims, and downstream impact through [maintenance](../relay-maintenance/SKILL.md) and [blast radius](../relay-blast-radius/SKILL.md).
2. Reproduce the changed route with isolated state, arm, and workdir paths; use a loopback ephemeral port for tests.
3. For gate changes, compare HTTP outcomes with direct CLI outcomes and compare normalized ledger semantics rather than timestamp-dependent hashes.
4. For wait changes, inspect ticket files, ask totals, breach timestamps, answer records, arm state, and the shared ledger.
5. Distinguish infrastructure failure from an unsatisfied checklist; preserve CLI stderr when usable gate JSON is absent.
6. Verify the actual scope of request locks, subprocess error handling, raw-versus-legacy position resolution, and each driver's identity decoding/migration. Do not extrapolate lossless position handling to every field or repeat stale comments claiming chain append is unlocked.
7. Update this skill and request integration, consumer, catalog, and index updates from the lead.

## Checks

Select affected commands and run them sequentially:

```bash
python3 -m pytest tests/test_daemon.py -q
python3 -m pytest tests/test_ask.py tests/test_await_human.py -q
python3 -m pytest tests/test_gate_cli.py -q
bash tests/test_concurrent_gate.sh
```

Use daemon tests for HTTP validation, disposition mapping, concurrency, and CLI-ledger equivalence; use ask tests for position insertion/past-end counters, exact-ID-before-suffix selection, actual-WP baseline selection, busy/malformed precheck transport, ticket/cap/answer behavior, and parking.
Require raw position cases with distinct `target`/`target\n` IDs, literal CR/CRLF, whitespace-only nonempty IDs, and qualified dotted siblings, plus legacy LF-terminated files that resolve only after raw lookup fails. Verify selected WP, failing IDs, and actual-ID baseline; same-status responses alone cannot establish identity agreement. CLI identity cases must preserve outcome `wp`/`next`/`macro` and ledger `wp`/`macro`; coordinate ARM migration/persistence cases through its owner.
Require realpath-alias concurrent asks, ask/answer serialization, required-note append failures before counters/state, orphan-ticket 404, and payload-type 400 cases when those contracts change.
Run CLI and shell checks for shared gate outputs and CLI `.run.lock` changes; the shell test allows only one appender, so actual append-lock changes require [gate core](../relay-gate-core/SKILL.md)'s direct concurrent-writer probe.
Run [documentation checks](../relay-maintenance/SKILL.md) after skill edits; delegate shared index regeneration to the lead.

## Cold review

- Require `author != reviewer` and a fresh isolated reviewer context for every daemon change.
- Freeze the baseline SHA, exact diff, exact artifact path list, and content hashes, including untracked skills; any revision invalidates approval of the previous artifact set.
- Have the reviewer read `bin/relay-daemon.py`, CLI, note-writer, arm-state, and HTTP-consumer contracts, and affected documentation, then run the named applicable commands in Checks.
- Inspect HTTP/CLI outcome agreement, gate-eval busy 500 versus ask-check busy 503, malformed-output 500, payload-type 400, realpath lock scope, required-note failures, and unauthenticated bind and answer boundaries.
- Confirm raw-ID-before-suffix and raw-before-LF-only-legacy-normalization ordering, CR/LF preservation, driver-specific empty-position/macro validation, actual-ID baseline selection, exact CLI outcome/ledger identity, explicit empty bases, checklist-only preconditions, ticket reuse and orphan 404, caps and caller-driven deadlines, answer/refusal behavior, parking, and normalized ledger equivalence; refuse unsupported claims and missing dependencies.
- For claims about checks, test the actual failure direction with the executable check and a meaningful violating case in isolated scratch state; never substitute a probe of prose.
- Issue exactly `APPROVE`, `FIX-FIRST`, or `REJECT`, with file-path evidence, commands and exits, and residual limitations; independently inspect route, state, and ledger evidence rather than trusting the author's self-report.
- Require every `FIX-FIRST` finding to be fixed, the revised artifact set to be frozen again, and independent re-review before approval.
- Treat this section as mandatory operating procedure; the skill text does not mechanically enforce review or guarantee detection of every error.

## Failure handling

- Preserve gate `detail` and `exit` on HTTP 500; a missing workdir or busy CLI is not a normal 409 control failure.
- Distinguish malformed request fields (400) from malformed stored arm data (500); request validation is not complete sprint validation or a sandbox.
- Preserve check diagnostics on 503/500; missing, malformed, or inconsistent precheck output is not evidence of a passing checklist.
- Inspect ledger and state after note or filesystem failures. Required-note failure cannot return waiting/answered/parked success, but earlier successful notes and directories need not be rolled back.
- Preserve parked state and operator release provenance; answers do not replace the hook's reasoned release mechanism.
- Treat wait deadlines as enforced on subsequent asks, not by a background timer; `waiting` responses do not themselves block or sleep.
- Keep same-user trust and unauthenticated answer attribution explicit; chain integrity does not create network authorization.

## Done

Return changed routes, HTTP/CLI mappings, state and ledger effects, targeted check outcomes, current service limits, and independent-review handoff.
Require independent `APPROVE` for the frozen final artifacts plus applicable validation before declaring Done; the author's self-report is insufficient.
