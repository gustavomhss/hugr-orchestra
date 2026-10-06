# Relay Control Plane — Historical Design Record

Audience: agents. Status: historical.

Current authority: [SPEC.md](../SPEC.md). Procedures: [operational skills](skills/).
This record preserves the R5–R10 design rationale and its reconciliation against baseline
`684456d571e8deb5f435d39e789e1b1258453d85`. Current-behavior notes also follow the runtime
repair candidate on that baseline; historical reproductions remain observations of their time.
It is not a live-mutation runbook or proof that every proposed control-plane surface shipped.

## 0. Settled model

The design retained stop-boundary progression but allowed an orchestrator to edit desired state.
The plan already lived on disk and was re-read at each fire. The unresolved question was whether
those edits were accounted for, not whether editing was physically possible.

The useful separation remains: desired plan, observed position/retries, and an append-only verdict
record. Writer ownership is a design discipline, not an OS-enforced permission boundary.

## 1. Historical defects that motivated the work

| Defect | Original reproduction | Shipped correction and remaining boundary |
|---|---|---|
| D1: oracle absent from the chain | Keep `LGPD-1` assertion fixed, replace failing `! grep -q '@' app.log` with `true`; the old verifier issued PASS while PII remained | Oracle hashes and origins now enter verdicts. Regression re-runs also record hashes; `relay verify` reports any observed oracle drift and reachable-sprint divergence. This detects changed questions, not weak unchanged checks. |
| D2: array index mistaken for identity | Insert EARLY before the cursor; the old hook demanded a newly inserted control as a regression and repeated without spending the current gate's budget | Production arm position/retries key by WP ID; keep-best includes only earlier controls with recorded passes; regression-only failures have their own budget. CLI/benchmark drivers retain counters. |
| D3: policy provenance dropped | Policy merger stamped a bundle name, but the old checklist event omitted it | `relay_control_origin` now carries explicit origin, otherwise `policy:<bundle>`, otherwise `sprint`. These are provenance labels, not authenticated identities. |

These are historical reproductions, not instructions to alter a live arm. Source:
[gate core](../lib/relay-gate.sh), [arm hook](../bin/relay-arm-hook.sh),
[verifier wrapper](../bin/relay), [provenance tests](../tests/test_ledger_provenance.py),
[position tests](../tests/test_position_by_id.py).

## 2. Reconciliation, not scheduling

The arm hook acts at stop boundaries; it does not interrupt reasoning or schedule agents.
The CLI/HTTP drivers evaluate on caller requests. The older statement that Relay "is not an
RPC target" described the proposed mutation model, not the now-built HTTP gate service.

## 3. Generation

Runtime `gen` stamping is built in `relay_chain_append`; missing generation reads as zero.
It labels the plan generation evaluated by a process. The proposed automatic monotonic bump,
`observedGeneration` echo and `(expected_gen, expected_ledger_head)` mutation read-witness
are **not implemented as a guarded mutation API**. A recorded generation is not proof that a
caller followed those rules.

## 4. Position is an ID; status is separate

The production arm stores a named position, macro-qualified when declared, and separate
`active` / `complete` / `awaiting-human` state. Legacy `escalated` remains readable. A lost
position is reported rather than silently re-aimed. The CLI/benchmark counter paths do not
inherit all mutation behavior from this arm implementation. CLI `check --position` can select
a named WP without changing the index-based `eval` lifecycle.
Raw whole-ID/suffix lookup precedes ARM's miss-only legacy trailing-LF fallback;
literal CR is preserved. Current, migrated and next ARM identities are decoded exactly.

## 5. Accountable chain entries

`gen`, `oracle`, `origin`, optional macro/kind/scope/artifact fields, and distinct
`regression-item` events provide recorded provenance. Additive fields are hashed as body data;
legacy entries retain their original verification semantics. The old "breaking change keyed
on gen" migration prescription is superseded by the implemented verifier.

Chain append now has a `mkdir` lock; ARM and CLI have separate whole-evaluation `.run.lock`
directories, with busy exit `3`. Compact JSONL control transport and exact string decoding
preserve tabs and interior/trailing LF in executed commands and oracle hashes. Plain hashes
detect unrecomputed edits; HMAC additionally depends on a protected secret. Neither mode is a
public-key signature or a defense against unanchored tail truncation. Current logic:
[lib/relay-gate.sh](../lib/relay-gate.sh) and [verify_ledger.py](../benchmark/verify_ledger.py).
Mandatory evidence/transition/release appends are fatal before corresponding state
publication; some ARM ancillary appends and archives remain best-effort, without atomicity or rollback.
Strict decoding rejects nested/escaped-equivalent duplicate keys and requires one final
root `h`; writers reject supplied root `h`, preserving original signed-body bytes.

`relay verify` validates interpreted record fields separately from chain integrity. With a
supplied/discovered sprint, named-control comparison detects added/unrecorded, changed, and
removed IDs. Invalid sprint shape/read/parse yields `SPRINT-INVALID`; intact unusable records
yield `RECORD-INVALID`; compared legacy missing oracles yield `unverified`. No supplied/discovered sprint
leaves recorded-only `not-run`. This does not rerun controls or validate current artifacts.

## 6. Amendment compliance: intent versus implementation

Settled rationale: a recorded sub-state/control verdict binds; an open macro does not grant
permission to rewrite it. Loosening is shrinking what must pass, not merely deleting a node.

[relay-spec.py](../bin/relay-spec.py) implements an **offline** `amend-check` comparison for
removed controls, deterministic-to-judge downgrades, blocking-to-advisory changes and selected
moves behind a supplied cursor. It cannot rank two commands by strength or prove arbitrary
reachability/branch semantics. Same-ID command changes are notes; live recorded changes are
reported by `relay verify`.

`--signed-by` is nonempty attribution text accepting a reported loosening. It is not a
cryptographic signature, human authentication, chained amendment record, or automatic gate
enforcement. The hook does not invoke this comparison before reading an edited sprint.

## 7. Proposed targets and verbs

| Surface | Status at the source baseline and current reconciliation |
|---|---|
| Opaque `targets(arm)` bound to generation; `mutate(target_id, payload)` | Unimplemented proposal |
| Guarded `append`, `splice-after`, `amend` | Unimplemented mutation verbs; direct file edits are not an API guarantee |
| `fork` with replay and retained superseded branch | Unimplemented proposal, reasoned from Temporal reset |
| `wind-down`, `abort` | Unimplemented per-arm lifecycle verbs |
| Release of a parked arm | Built non-whitespace-reason file consumption; records `human-release`, resets resolved full-ID and legacy retry state, resumes the same gate. |

The original table called release "force past a failed gate." That framing was wrong.
Release does **not** advance past an unmet control; the resumed evaluation still must pass.
The reason is recorded, but the writer is not authenticated as a human.

The current normalizer removes CR, maps LF to ASCII spaces and trims edge ASCII spaces;
whitespace-only reasons, including tabs-only text, are rejected. Position resolves whole WP ID
first, then suffix after its first dot. Cleanup clears retry/round/repeat/blocked-claim keys
under that resolved full ID, legacy index retry and `reg_retry`, restoring the current counter
and a fresh budget even for qualified/dotted IDs. Unresolved position keeps the release for
repair. These runtime corrections do not establish human-approval authentication.

## 8. Stuck-gate economics

A hook re-block costs a model turn. Sleeping at a stop boundary adds latency without reducing
turns, so Temporal-style poll backoff was rejected. The arm's gate and regression paths own
bounded retry counters. Consecutive identical rounds become `gate-fail-repeat` entries with a
round hash and repeat count; changed and terminal rounds are written in full. This counts
repetitions rather than guaranteeing immediate escalation on the first unchanged round.

## 9. `awaiting-human`

Escalation parks the arm and permits the runner to stop. It does not mean campaign completion.
Release resumes it on a later fire. `relay problems` derives diagnostic categories from the
record; that command is not itself a notification service or authenticated intervention console.
Completion and parking are distinguished by state/ledger, not a new non-blocking hook output.

## 10. View fidelity

[relay-dash.py](../bin/relay-dash.py) renders retained corpus traces read-only. Its terminal
headline comes from chained events rather than unsigned `outcome.json`; non-terminal prefixes
remain `incomplete`. It sanitizes terminal control bytes. It does **not** implement R10's proposed
live-arm view, distinguish running from tail-truncated prefixes, or enumerate legal actions.

Corpus `stats`/`export` still use unsigned outcome metadata; dashboard hardening must not be
attributed to every corpus consumer. Retention and verification also do not prove trace volume
or a complete planned-WP denominator.

## 11. Oracle injection is a trust decision

Checklist commands run through `eval` on the gate host. Policy/spec libraries validate shape.
The renderer uses `shlex.split`/`shlex.join` for `cmd` parameter values, falling back to quoting
the whole value when splitting fails. This composes shell words only in compatible templates;
it does not protect arbitrary data embedded in Python or already-double-quoted shell code.
Treat templates and canonical params as trusted inputs with identifiers, paths and other
application constraints validated externally; the rendered-shape parser does not check them.
Arbitrary author-supplied commands are not sandboxed by this quoting.
The proposed split between state-edit privilege and trusted-oracle privilege is not enforced
by actor authorization. Agents must not summarize provenance labels as that security boundary.

## 12. Research rationale

Kubernetes generation/conditions, Temporal reset/history/retry economics, DAP target enumeration
and workflow-migration compliance informed the design. They are analogies, not implemented Relay
contracts or local proof of mutation benefit. Mutation usefulness versus static chains and
coupling benefit versus context rot remain unresolved.

## 13. Historical package disposition

| Package | Bounded disposition | Source/evidence |
|---|---|---|
| R5 | Generation/oracle/origin entries and verification built | `lib/relay-gate.sh`, `bin/relay`, `tests/test_ledger_provenance.py` |
| R6 | Named production-arm position and acceptance-filtered keep-best built | `bin/relay-arm-hook.sh`, `tests/test_position_by_id.py` |
| R7 | Round collapse and regression budget built on arm path | `bin/relay-arm-hook.sh`, `bin/relay-corpus.py`, `tests/test_backoff.py` |
| R8 | Parking, consumed release and derived problems built | `bin/relay-arm-hook.sh`, `bin/relay`, `tests/test_await_human.py` |
| R9 | Full targets/verbs/auth surface unimplemented | Offline comparison exists in `bin/relay-spec.py`; it does not close R9 |
| R10 | Live-arm renderer unimplemented | Existing `bin/relay-dash.py` remains corpus-only |

For v2's later corrections and walking-skeleton evidence, use the historical
[relay-v2 record](relay-v2.md), not this package list as an active dispatch plan.
