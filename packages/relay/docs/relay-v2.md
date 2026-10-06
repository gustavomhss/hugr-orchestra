# Relay v2 — Historical Campaign Record

Audience: agents. Status: historical.

Current authority: [SPEC.md](../SPEC.md). Procedures: [operational skills](../.opencode/skills/).
This record preserves campaign decisions and evidence reconciled against baseline
`684456d571e8deb5f435d39e789e1b1258453d85`. Current-behavior notes also follow the runtime
repair candidate on that baseline; retained campaign observations are unchanged. It is not a
cold-resume runbook or a claim that all proposed v2 surfaces are implemented.

## 1. Frame and evidence boundary

The campaign chose Relay as the engine and PE-format profiles as authoring data. Its goal was
precise protocol progression, bounded retries and per-state transparency, not throughput.
The original test-suite counts were dated snapshots, not current inventory or verification.

The port experiment reported that planning's 16 sub-states/52 criteria yielded 53 controls but
11 ungated execute states, and 389 executions from 53 declared controls (about 7.3× keep-best
work). Those were historical external experiment observations, not a general cost multiplier.

`HuGR/MCP-Statemachine`, its `experiments/relay-port/` tools and frozen EDD documents are
**external, unavailable inputs in this repository**. Profile text such as
`docs/edd/planning-protocol.md@sha256:41808c99e71d` names that external input, not a local link
or permission to invent it. Local profiles/compiled sprints exist under [profiles/](../profiles/);
copied routing text does not bring every external protocol/checker into this repo.

## 2. Settled mechanism

### 2.1 Macros are scopes

One dispatcher owns an arm. A macro contributes instructions when first entered; sub-states
remain WPs in a flat ordered array. A macro carries no independent retry loop or verdict.
The runner is not automatically reset between states. ARM `.run.lock` now serializes each
whole evaluation; contention exits `3` with stderr, independently of `.chain.lock` appends.

### 2.2 Flat schema and two-coordinate position

`macros[]` is a lookup table; `work_packages[].macro` connects a WP to it. Production arm
position is macro-qualified when declared, otherwise a bare legacy WP ID remains usable.
Whole-ID lookup precedes splitting at the first dot, and already-qualified IDs are not prefixed
again. An unset macro is not forcibly materialized as `_` in the position file.
Raw whole-ID/suffix lookup precedes ARM's miss-only legacy trailing-LF fallback; CR
is preserved. Current/migrated/next ARM IDs and macros retain exact decoded strings.
ARM validates next identities inside `advance`, after commands but before passing-round
flush; CLI validates current ID/macro and next ID before `eval` commands. Neither is rollback.

Only declared macro/kind values enter relevant ledger envelopes. Marker files suppress repeated
macro instructions; automatic re-injection on arbitrary amendment/re-entry was not built.
The first state's base ref and initial instructions remain the arm author's responsibility.
CLI `check --position` uses the same whole-ID-first resolution and can bypass a past-end
counter; `check --base-ref` overrides the state base, including explicit empty/unavailable.
Those precondition overrides do not change the counter-driven `eval` lifecycle.

### 2.3 Kinds: plan versus production support

| PE type | Compiled kind | Production arm behavior |
|---|---|---|
| `execute` | `execute` | Work followed by checklist evaluation; default kind |
| `checklist` | `gate` | Checklist evaluation without special work injection |
| `review` | `review` | Gate plus cold-read reminder; fresh context is not enforced |
| `inject` | `inject` | Records file/extracted-inline SHA, evaluates any checklist, delivers extracted text only on successful nonterminal advancement |
| `human_approval` | `human` | **Unsupported:** arm hook records `unknown-kind` and returns without advancing |

The compiler and linter recognizing `human` does not establish runtime support. Missing inject
payloads are reported without advancing; they are not silently replaced with an empty injection.

The inject event records a label and SHA, not payload bytes or proof of delivery. File SHA covers
original bytes, but `$(cat ...)` strips trailing LF from delivered file text. Inline text passes
through `$(jq -r ...)`, stripping trailing LF before both hashing and delivery. The advance reason
wraps the extracted text; it is not a lossless payload record. A checklist/regression failure or
final completion delivers no injection payload even when an inject SHA event was recorded.

### 2.4 Controls, self-checks and artifacts

Deterministic `cmd` controls block on nonzero final shell exit. Current and regression readers
preserve each whole command through compact JSONL, including tabs and interior/trailing LF;
runtime command/judge oracle hashing matches decoded JSON bytes. Judges remain non-independent,
advisory unless explicitly blocking. Missing/malformed judge output or nonzero process exit
records unavailable `fail`, blocking only when declared blocking. Authoring doctrine pairs
judges with real outcome checks; runtime does not automatically reject every judge-only or
empty checklist.

Self-check text accompanies next-state instructions; it is not a verdict. For `diff:true`,
the gate computes the artifact from a recorded base ref and records declared scope. Missing
git/base-ref context is recorded as unavailable, blocking only for a blocking judge.
The implementation also records artifact hashes for declared paths; scope and hash do not
prove complete intent coverage.

Current audit reconciliation: supplied/discovered sprint comparison detects added/unrecorded,
changed and removed named controls; invalid sprint/schema yields `SPRINT-INVALID`, intact
unusable control records yield `RECORD-INVALID`, and compared legacy missing oracles yield
`unverified`. No sprint leaves recorded-only `not-run`. Audit does not rerun checks or validate
current artifacts; these repairs do not retroactively extend historical fixture evidence.
Mandatory ARM/CLI/benchmark evidence/transition appends are fatal before corresponding
counter/state/retry/release publication; some ARM ancillary appends and archives remain best-effort.

### 2.5 Bounds and harness cap

Historical probes observed 10 varying-reason blocks, 9 identical-reason blocks and a 20-fire
probe with `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0`. These are vendor-version observations, not a
stable harness contract. The once-per-arm preflight compares live cap (default/fallback 8) with
the implemented estimate `len(work_packages)+1`. This is not a proven lower bound: a clean
N-WP chain emits N−1 advance blocks; the last passing gate exits without a block. A nonzero cap
below the estimate records `cap-risk` and prefixes that invocation's next block with a warning.
It does not refuse evaluation or change the harness cap. `0` skips Relay's comparison and
requests uncapped harness behavior; Relay does not enforce that response or guarantee completion.

Gate and regression retry paths are bounded separately. Identical rounds are collapsed/countable;
retry exhaustion parks. Blocked claims remain recorded; repeated honored claims accelerate
escalation. Corroboration is recorded, but the honored flag follows checklist failure, not judge
agreement. Current release rejects whitespace-only reasons and clears retry/round/repeat/
blocked-claim keys for the resolved full WP ID plus legacy index retry and `reg_retry`; it
restores a fresh budget and rechecks the same gate without authenticating a human. The daemon
ask path uses three pokes per ticket, parks on a fourth unanswered poke, and applies an arm-total
passive cap with a silence deadline. These are endpoint rules, not evidence that every wait
has a forced wall-clock interruption.

## 3. Historical V1–V12 disposition

| Package | Implemented scope / limitation | Source or retained evidence |
|---|---|---|
| V1 | Macro-aware arm position and instructions; CLI outcome carries declared macro but retains counter state | [arm hook](../bin/relay-arm-hook.sh), [gate CLI](../bin/relay-gate) |
| V2 | Live block-cap preflight and implemented-estimate warning, not a proven minimum or completion guarantee | Arm hook `preflight` / `cap-risk` |
| V3 | Regression verdicts recorded; any observed oracle change reported | [gate core](../lib/relay-gate.sh), [bin/relay](../bin/relay) |
| V4 | Next-state self-check injection, never a grading | Arm hook `advance` |
| V5 | Computed diff and recorded scope/artifact context | Gate core `relay_compute_diff`, [judge fixtures](fixtures/enforcement-model/README.md) |
| V6 | `execute`, `gate`, `review`, `inject` implemented; `human` remains unsupported | Arm hook kind dispatch; [compiler](../bin/relay-profile.py) maps more kinds than dispatch implements |
| V7 | `awaiting-human`, consumed reason-bearing release, problems, blocked claims | Arm hook, `bin/relay`; release resumes, never skips |
| V8 | Offline lint with errors/warnings and a closed list of trivial spellings | [relay-spec.py](../bin/relay-spec.py); warnings alone do not fail; no proof of command strength |
| V9 | Compiler, local profile mappings, regeneration `--check`; unmapped criteria compile to nothing | [relay-profile.py](../bin/relay-profile.py), [profiles/](../profiles/) |
| V10 | Ask/answer HTTP endpoints, checklist precondition, ticket/cap/deadline accounting, shared chain append | [daemon](../bin/relay-daemon.py); no authenticated actor boundary |
| V11 | Offline must-pass comparison and textual attribution | `relay-spec.py amend-check`; no cryptographic signature, automatic mutation enforcement or full reachability proof |
| V12 | Recorded wp-execute walking skeleton | [ledger fixture](fixtures/v12-walking-skeleton.ledger.jsonl), bounded below |

V3's historical premise was wrong: the earlier regression guard had not recorded successful
re-runs, so "the data exists; change the report" was insufficient. Recording `regression-item`
preceded meaningful drift detection. V11 does not exempt legitimate amendments from that report:
there is still no authenticated chained amendment authorization.

### V12 retained observation

The historical report describes one real `claude -p` slugify session on `wp-execute`: 6 macros,
13 sub-states and 25 controls. The committed ledger ends at seq 194 with `sprint-complete`;
the report counted 195 macro-bearing entries, 28 checklist verdicts and 146 regression verdicts.
It records a real `tests_map_to_scenarios` failure and retry, plus the position-prefix defect
that led to the already-qualified-ID correction.

One judge control used `RELAY_JUDGE_STUB=pass`; the chain labels it `judge:stub(non-independent)`.
The run therefore does not establish real judge efficacy, cold-context independence, `human`
support, all-profile completeness or a currently green suite. The historical report says the
cap was explicitly disabled; a terminal fixture alone is not a current harness-cap test.

## 4. Profile migration record

Local YAML/compiled pairs include `planning`, `wp-execute`, `spec-decompose`, `design`,
`research-v2` and `tdd_feature`. The expensive migration artifact is the explicit `criteria_map`,
not merely a compiler. Missing mappings are omitted and reported; they are not filled with
passing stubs. Compiler retry semantics remain per WP, unlike PE's per-macro cap.

Current command-template expansion replaces only bare `{macro}`, `{sub}`, and available
`{criterion}`; `${macro}`, `${sub}`, `${criterion}` and other `${name}` bindings survive for
the caller's later binding stage. Replacement is nonrecursive; other fields are not expanded
by `_expand`. This fixes compiler namespace collisions, not missing-binding validation or
safe shell composition. See [profile compiler tests](../tests/test_profile_compile.py).

The original proposed tiers left `genesis-dependency*` and `finance-funnel-sota` on demand;
which genesis lineage was live and whether research-v2 superseded research were unresolved
external questions. `quick-bug-fix` and notary material were excluded external sealed artifacts.
This record gives agents neither a migration order nor authority to edit those external repos.

## 5. Corrections retained for agent reasoning

- Shared gate code does not make arm, CLI and benchmark drivers identical.
- A macro is a scope; a recorded verdict is the compliance unit.
- A retry costs a model turn; poll backoff does not fix that economics.
- Checklist evaluation runs through command substitution; persisted round buffers are files.
- A self-check or review instruction is not an independent outcome oracle.
- Unmapped criteria, external protocols and unsupported kinds remain explicit gaps.
- `--signed-by` text and ledger HMAC are different mechanisms; neither builds signed actor auth.

## 6. Unimplemented surfaces and unresolved limits

The full legal-target/mutation-verb API, authenticated amendments, enforced state/oracle privilege
split, automatic fresh-context review, production `human` kind and live-arm dashboard remain
outside the built scope. Context rot, corpus volume and usefulness of live mutation versus
static chains remain unresolved. The historical [control-plane record](control-plane.md)
preserves that distinction; agents must not summarize this campaign as "all v2 done."
