# Relay — Agent Product Brief

Audience: agents. Status: current product brief.

Baseline commit: `684456d571e8deb5f435d39e789e1b1258453d85`; installed-behavior notes
also reconcile the current runtime repair candidate on that baseline.
Use [SPEC.md](SPEC.md) for the current contract and [operational skills](docs/skills/)
for procedures. This brief records product scope and claim limits; it is not a runbook.

## 1. Product claim

Relay runs external acceptance checks at an agent's stop boundary, controls progression through
an on-disk sprint, and records verdicts in a tamper-evident ledger. Its useful claim is
**checked progression and attributable evidence**, bounded by the checks and execution environment.

Do not restate the old slogan, "physically impossible for an agent to lie that it's done," as a
security guarantee. An unarmed agent is not gated; agents and enforcement commonly share an OS
user; checks can be weak; a harness can end a run before completion. Escalation preserves a
recorded prefix, not a delivered campaign.

## 2. Built surfaces

| Surface | Shipped implementation | Scope |
|---|---|---|
| Authoring service | [bin/relay-api](bin/relay-api), [authoring API](docs/authoring-api.md) | Versioned API for workflow and hook documents, sprint compilation, publication, scopes, skill bindings and gate evaluation through the daemon; Orchestra supervision and screens are host work |
| Per-agent arms | [bin/relay-arm-hook.sh](bin/relay-arm-hook.sh) | `SubagentStop`, transcript-token binding, optional `agent_id` ownership check, named position, macro entry, retries, regression checks, parking and release; whole-evaluation `.run.lock`, busy exit `3` |
| Gate core | [lib/relay-gate.sh](lib/relay-gate.sh) | Checklist evaluation; exact decoded command/judge oracle hashes, generation and origin fields; locked SHA-256/HMAC-SHA256 chain append |
| Vendor-neutral CLI | [bin/relay-gate](bin/relay-gate) | One-step `eval` and checklist-only `check`; JSON outcomes; integer-counter driver; named position/base-ref overrides for `check` |
| HTTP daemon | [bin/relay-daemon.py](bin/relay-daemon.py) | Wraps CLI evaluation; health, ask and answer endpoints; disk-backed state |
| Authoring draft | [bin/relay-autodecompose.py](bin/relay-autodecompose.py) | Collects existing pytest nodeids, groups by file, splits by cap, drafts controls and instructions |
| Policy bundles | [bin/relay-policy.py](bin/relay-policy.py), [policies/](policies/) | Prepends selected controls to WPs, dedupes IDs, stamps policy provenance |
| Executable specs | [bin/relay-spec.py](bin/relay-spec.py), [specs/](specs/) | Catalog, rendering, lint, offline amendment comparison |
| Profile compiler | [bin/relay-profile.py](bin/relay-profile.py), [profiles/](profiles/) | YAML-to-sprint compilation; explicit criteria mappings; regeneration comparison; compiler placeholders preserve `${name}` for later binding |
| Retention and corpus | Hook `archive_trace`, [bin/relay-corpus.py](bin/relay-corpus.py) | Terminal arm snapshots, integrity-checked per-WP signal extraction |
| Dashboard | [bin/relay-dash.py](bin/relay-dash.py) | Read-only corpus burndown and health; terminal outcome from chained events, sanitized terminal text |
| Audit and diagnostics | [bin/relay](bin/relay) | Verification, record-schema checks, oracle drift and bidirectional named-control sprint comparison, derived problems, recorded cost summaries |
| Benchmark | [benchmark/run_arm.sh](benchmark/run_arm.sh), [run_crossover.py](benchmark/run_crossover.py), [grader.py](benchmark/grader.py) | M/R/D runners, held-out final grading with explicit measurement validity, limited run-validity guards |

The dashboard reads retained corpus snapshots, not automatically every live arm. Its totals cover
observed WPs, not necessarily all unrevealed WPs. The daemon defaults to loopback, but `--host` is
configurable; authentication, TLS and actor authorization are not built.

## 3. Mechanism and driver boundaries

- The arm hook prefers `agent_transcript_path`; it falls back to the session transcript. A
  `RELAY-ARM:<token>` marker selects the chain; `agent_id`, when present, prevents reuse by another
  agent. Missing/unknown tokens are left alone. Ambiguous markers and ownership mismatches are
  reported and return without enforcing a guessed chain.
- Named arm position and per-ID retries survive index changes. Keep-best re-runs earlier
  deterministic controls with recorded passes. Compact JSONL preserves full commands, including
  tabs and interior/trailing LF, for regression execution and oracle hashing. CLI/benchmark DoD
  executes each whole program by its final shell exit status. Keep-best does not freeze source
  files or make later artifact mutation impossible.
- Arm escalation parks `awaiting-human`. A reason-bearing, consumed release resumes the same
  gate without skipping controls or authenticating a human. Normalization removes CR, converts
  LF to ASCII spaces and trims edge ASCII spaces; whitespace-only reasons, including tabs-only
  text, are rejected. Cleanup uses the resolved full WP ID for retry/round/repeat/blocked-claim
  keys, also removes legacy index retry and `reg_retry`, and restores the current counter.
  Qualified/dotted IDs receive a fresh retry budget; unresolved positions retain the release.
- The CLI/daemon counter driver and benchmark Stop hook have different state/regression behavior
  from the production arm hook. Shared checklist code does not imply complete driver parity.
  ARM/CLI/benchmark mandatory evidence/transition appends are fatal before corresponding
  state/retry/release updates; some ARM ancillary appends and archives remain best-effort, without atomicity or rollback.
- Compaction shortens retry feedback and emits checkpoint hints. It does not reset or control
  the model's context window. Cold-context review is an instruction, not enforced isolation.

## 4. Evidence and baseline correction

Use [WHITEPAPER.md](WHITEPAPER.md) and the historical [benchmark results](benchmark/RESULTS.md)
for evidence boundaries.

**M already includes the end-gated repair baseline.** `run_arm.sh` selects `sprint_mono.json`
with `GATE=on`; the Stop hook evaluates the whole campaign's checks and permits bounded aggregate
repair. The earlier product claim that "M+CI is absent" was wrong. This is a campaign full-check
baseline, not a promise that arbitrary project CI is configured or budgets are matched.

The low-N billing pipeline recorded equal RSR with higher R cost/turns. Generated v1 observations
were reported through N=300; v2 observations through N=300 plus **one committed N=500, seed-1,
M-only record**. That record reports RSR 1.0, 7 turns, 88,178 output tokens and $1.8373098.
It does not establish a two-substrate N=500 sweep, first-pass success, an equal-budget high-N
M/R/D comparison, confidence intervals, or a universal absence of crossover.

The amplifier/speed claim remains unsupported. Position Relay around external checks, progression
and evidence; do not promote those observations into universal win/loss or compliance-certification
claims.

## 5. Limits agents must preserve in summaries

| Limit | Exact boundary |
|---|---|
| Oracle reach | A passing command proves only what that command tested; skip/collection behavior can undermine it. Judges remain non-independent. Missing/malformed judge output or nonzero judge exit records unavailable `fail`; blocking depends on `blocking: true`. |
| Audit reach | A supplied/discovered sprint detects added/unrecorded, changed and removed named controls; malformed sprint/schema yields `SPRINT-INVALID`, intact unusable records yield `RECORD-INVALID`, and compared legacy missing oracles yield `unverified`. No sprint leaves recorded-only `not-run`. Audit does not rerun checks, validate current artifacts or compare every plan field. |
| Ledger trust | Strict decoding rejects duplicate keys at any depth, including escaped equivalents, and requires one final root `h`; writers reject supplied root `h`, signed-body bytes stay unchanged. Plain hashes can be recomputed by a writer. HMAC requires a protected key. Either mode accepts a valid truncated prefix without an external head anchor. Neither is a public-key signature. |
| Mutation | Runtime generation/oracle hashes exist. Opaque legal targets, guarded mutation verbs, automatic amendment enforcement and cryptographically signed actor authorization do not. |
| Amendment attribution | `amend-check --signed-by` accepts nonempty attribution text; it neither verifies a signature nor changes or seals the live plan. Command-strength comparisons are notes, not proofs. |
| Profile kinds | Compiler/linter recognize `human`; production arm dispatch rejects it as `unknown-kind`. Compiled output is not proof of executable support. |
| Injection delivery | File/extracted-inline-text SHA records are not payload records. Extracted text is delivered only on successful nonterminal advancement, not failure or final completion; see [v2 source reconciliation](docs/relay-v2.md#23-kinds-plan-versus-production-support) for trailing-LF loss and digest scope. |
| Cap preflight | `len(work_packages)+1` is the implemented warning estimate, not a proven lower bound: a clean N-WP chain emits N−1 advance blocks. Preflight does not change the harness cap or guarantee completion; `0` skips Relay's comparison and requests uncapped harness behavior. |
| Template parameters | Compiler bare `{macro}`/`{sub}`/available `{criterion}` replacement preserves `${name}` and does not recursively expand inserted values; later binding remains caller-owned. Spec renderer `cmd` values receive shell-word quoting, safe only with compatible template composition. Embedded Python/already-double-quoted code can interpret arbitrary data as code. Templates and canonical params require trusted, externally validated constraints; rendered-shape checks do not establish that safety. |
| Benchmark validity | Skips fail their requirement. `grade_valid`, `grade_errors`, and `pytest_exit_code` distinguish a measurement from an instrument fault; invalid RSR/CCR are `null`, not zero quality. Crossover requires explicit valid grading and finite RSR; `--check-grader` requires complete parsed JUnit, real requirement failures, pytest exit `1`, and no skips/errors. Weights still use a regex reader; byte-identity reference guards do not prove authorship, provenance or OS isolation. |
| Retention | Terminal archive copies and benchmark archival are best-effort. Existing-run archival happens after grading; a failed run can miss it. Corpus export still includes unsigned outcome metadata. |
| Scale and cost | No full statistical sweep or measured coupling-benefit/context-rot boundary. Auto-decomposition drafts structure; it does not prove coverage, oracle strength or authoring cost near zero. |

## 6. Strategy record, not delivered commercial scope

The original wedge was coupled, test-oracle-rich work: migrations, codemods and refactors where
later edits can regress earlier results. Orchestrators can dispatch gated workers; Relay supplies
acceptance control rather than scheduling. Final CI remains useful.

The original open-core, team, compliance, OEM and data tiers were commercial proposals. Hosted
ledger services, SSO/RBAC, SLAs, packaged multi-language SDKs, marketplaces and a trace-data moat
at usage volume are not established by the local tools. Regulated acceptance and willingness to
pay remain product hypotheses. R1–R4 local scopes shipped; their
[historical cards](docs/roadmaps/) record those bounded deliverables.
