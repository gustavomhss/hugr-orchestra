---
name: relay-research
description: Use when capturing, recording, contesting, or checking Relay research-v2 evidence and calibrated conclusions.
---

## Trigger
Use this skill for `profiles/research-v2.yaml`, `tools/research/*`, evidence replay, or research review failures.
Load [relay-profiles](../relay-profiles/SKILL.md) for compiler/template contracts.

## Read first
Read [research-v2.yaml](../../../profiles/research-v2.yaml) and [compiled sprint](../../../profiles/research-v2.sprint.json).
Read [research-check](../../../tools/research/research-check): phase functions, `split_conclusions`, `floor_reached`, and constants.
Read [capture](../../../tools/research/research-capture), [note](../../../tools/research/research-note), [memo](../../../tools/research/research-memo), and [replay](../../../tools/research/replay-evidence).
Read [judge.py](../../../benchmark/judge.py), [gate core](../../../lib/relay-gate.sh), and [historical verdict finding](../../../docs/FINDING-self-graded-review-verdicts.md).
Read [judge maintenance](../relay-judge/SKILL.md), [CLI judge tests](../../../tests/test_judge_cli.py), and [core-runtime tests](../../../tests/test_gate_core_runtime.py) for current response-failure and sampling behavior.

## Ownership
Limit source work to the assigned subset of `profiles/research-v2.yaml` and `tools/research/{research-check,research-capture,research-note,research-memo,replay-evidence}`.
Regenerate `profiles/research-v2.sprint.json` with `--qualify-ids`; preserve historical fixtures as snapshots.
Keep run data under bound `research_dir`; coordinate shared `tools/criterion`, judge, and gate changes with their owners.

## Contracts
Produce `question.json` with question, setting/context, answer criteria A-n, exclusions, prior belief, and competing hypotheses H-n.
Produce `sources.json` with searches, excluded/not-searched records, saturation declaration, and S-n sources.
Record source kind/ref/reliability/retrieval date; use snapshots and SHA-256 for web/file sources, recorded command output for command sources.
Produce `findings.json` as F-n entries with claim, typed evidence, credibility, falsifier, found_at, and later findings' relations to earlier ones.
Produce `memos.json` as dated notes; produce `contest.json` with search refs, hypothesis scores, diagnosticity, contradictions, and resolution.
Produce `conclusions.json` as `{calibration_policy,conclusions}` with kind-based starts, downgrade domains, certainty, cited findings, answer IDs, and would_change.
Use `high/moderate/low/very-low`; do not copy the stale `proven/likely/undetermined` enum from omitted YAML `output_contract`.
Produce `review-evidence.json`, `review-synthesis.json`, and `report.md`; retain review writing even though its APPROVE value no longer decides research cold-review gates.
Consume these artifacts through `research-check`, replay, profile controls, and explicitly bound downstream readers; no automatic upstream handoff exists.
Emit `[{criterion,status,evidence}]`; interpret checker exits as 0 no FAIL or 1 FAIL, and CLI usage errors as 2.

## Procedure
Run commands from the repository root; bind `research_dir`, `repo_root`, and gate `research_tools=tools/research` to the run.
Use Python 3 stdlib for research tools, network access for URL capture/API judging, PyYAML for compilation, pytest for tests, and jq for review controls.
Frame competing hypotheses before weighing evidence; record access gaps and a stop rule instead of manufacturing saturation.
Capture sources, then add reliability/search/exclusion/saturation fields yourself; capture does not author them.
Use the actual source/claim/quote/falsifier values in these command forms:
```sh
python3 tools/research/research-capture --file "$source_file" --into "$research_dir" --repo-root "$repo_root" --json
python3 tools/research/research-capture --url "$source_url" --into "$research_dir" --json
python3 tools/research/research-note --into "$research_dir" --source S-1 --claim "$claim" --quote "$quote" --falsifier "$falsifier" --credibility 2 --json
python3 tools/research/research-memo --into "$research_dir" --note "$analytic_note" --about F-1 H-1 --json
```
Add `--relates-to F-n:supports|refines|contradicts|independent` using one actual relation for each finding after the first.
Use note `--cmd` for command-backed findings; it requires zero exit and records stripped stdout. Capture `--cmd` records nonzero exits too.
Treat snapshots as stored text: URL capture decodes UTF-8/Latin-1 then writes text; it does not preserve arbitrary original HTTP bytes.
Contest every finding against every hypothesis; derive diagnosticity from mixed versus uniform scores.
Declare one calibration policy, apply named GRADE downgrades, and disclose absorbed/tied labels; judge policy soundness separately from arithmetic.
Run all phases and replay commands in the actual subject directory:
```sh
python3 tools/research/research-check --phase question --research-dir "$research_dir" --repo-root "$repo_root" --json
python3 tools/research/research-check --phase survey --research-dir "$research_dir" --repo-root "$repo_root" --json
python3 tools/research/research-check --phase evidence --research-dir "$research_dir" --repo-root "$repo_root" --json
python3 tools/research/research-check --phase contest --research-dir "$research_dir" --repo-root "$repo_root" --json
python3 tools/research/research-check --phase synthesis --research-dir "$research_dir" --repo-root "$repo_root" --json
python3 tools/research/research-check --phase report --research-dir "$research_dir" --repo-root "$repo_root" --json
python3 tools/research/replay-evidence "$research_dir/findings.json" --cwd "$repo_root" --json
python3 tools/criterion tools/research/research-check evidence quotes_are_verbatim --research-dir "$research_dir" --repo-root "$repo_root"
```
Write report sections exactly `## Conclusions`, `## Sources`, `## Hypotheses`; carry IDs, certainty, dates, open contradictions, setting, prior's fate, and floor-domain disclosures.
Inspect actual judge inputs: `evidence-withstands-cold-review` gets only the findings diff; `conclusions-withstand-cold-review` gets only the conclusions diff.
Do not claim those judges inspected snapshots, sources.json, or cited findings for conclusions: neither control declares that upstream `context`.
Treat review-engagement judges as scoped diff plus review file only; inspect omitted evidence before claiming GROUNDED or DERIVED assurance.
Blocking gate-run judges now record `fail` with unavailable grading for missing/malformed/unsupported responses
or nonzero judge exit, even when that process prints pass JSON. API/CLI `_Sample.available` rejects typed
error/no-verdict states before voting, even with context cuts; marker text in model aliases or filenames
does not decide availability. Exact configured model metadata is retained. CLI JSON now exports boolean
`available` from `_Ballot`; answered fail/tie and stub pass/fail remain available. Calibration requires
process exit 0, valid response fields, and `available is True`, without display-tag or legacy inference.
Nonblocking response failures still record fail without holding advancement. Shared gate core does not
validate the `available` field; inspect [judge maintenance](../relay-judge/SKILL.md) for this consumer asymmetry.
This transport repair does not supply omitted context, authenticate review provenance, meter off-gate calls,
or remove executor-writable APPROVE proxies in design/planning/spec-decompose. Preserve dated findings as evidence.
Select a live backend explicitly with `RELAY_JUDGE_BACKEND=api` or `cli`; auto-selection uses API only when `ANTHROPIC_API_KEY` exists, otherwise stub.
Bind API endpoint/key/model through `RELAY_JUDGE_BASE_URL`, `RELAY_JUDGE_API_KEY`, and `RELAY_JUDGE_MODEL`; require authenticated `claude` for CLI judging.
Propagate schema/criterion/replay/policy/report changes to all authoring tools, YAML mappings, compiled JSON, tests, bindings, and this skill.

## Checks
Run generated-data, checker-mutation, capture/replay, and judge-transport/context tests:
```sh
python3 bin/relay-profile.py profiles/research-v2.yaml --qualify-ids -o profiles/research-v2.sprint.json --check
python3 bin/relay-spec.py lint profiles/research-v2.sprint.json --json
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest -q -p no:cacheprovider tests/test_research_check.py tests/test_research_capture.py tests/test_research_tools.py tests/test_shipped_profiles.py tests/test_judge_context.py tests/test_judge_api.py tests/test_judge_cli.py tests/test_gate_core_runtime.py
git diff --check
```
Use fabricated-quote, changed-snapshot, output-drift, missing-artifact, non-diagnostic-evidence, majority/tie,
combined no-verdict/truncation, malformed response, and nonzero-exit-with-pass cases as negative controls.
Include marker-bearing model/filename cases that preserve valid votes and still reject genuinely unavailable
responses; trace producer availability across real subprocess output into calibration's exact-true check.
Do not equate that calibration contract with availability-schema enforcement by shared gate core.
Do not infer semantic quality from fake-endpoint/stub tests or an author's declared ID relation.

## Cold review
Require a reviewer other than the author, working in a fresh, isolated context without the author's conversation.
Freeze the baseline revision, complete diff including untracked drafts, and exact artifact/file list with content digests before review.
Have the reviewer read the linked research tools, compiler and gate/judge consumers, research YAML/compiled profile, [historical fixtures](../../../docs/fixtures/), named test fixtures, cited snapshots/findings, and artifact/calibration contracts.
Trace exactly which cited evidence reaches each judge: distinguish findings/conclusions diffs from supplied upstream context and identify omitted source or findings files.
Inspect self-graded verdict residuals and callable off-gate review paths; distinguish consistency proxies, semantic quality, authenticated independence, and actual review provenance.
Have the reviewer run the named applicable checks under Checks and record commands, exits, skips, and unavailable evidence; do not substitute the author's prior results for independent review.
For changed checkers, require a known-good pass and a targeted fabricated-quote, snapshot/output-drift, calibration, or context mutation rejected for the intended reason, not transport noise or an unrelated crash.
Require an APPROVE/FIX-FIRST/REJECT report identifying the frozen snapshot, exact file-path evidence, commands/exits, and residual limitations.
Fix every FIX-FIRST, freeze the revised diff/artifact list, and obtain independent re-review; stop on REJECT until the scope or contract is resolved.
Treat this as a mandatory review procedure, not mechanical enforcement or proof that reviewers cannot miss bugs; do not infer commit/PR authorization from the verdict.

## Failure handling
Distinguish retrieval/IO failure, replay drift, missing-context transport, and semantic rejection; preserve original evidence when reporting each.
Treat whitespace-normalized quote containment and a stored hash as consistency checks, not source truth or protection against rewriting both snapshot and register.
Treat credibility-1 corroboration as another registered source ID, not proof of source independence or supporting content.
Treat memo times, saturation tails, text lengths, and report substring checks as proxies; manual timestamps and crafted text can satisfy them.
Do not claim atomicity is mechanically checked; `test_atomicity_is_not_claimed_as_a_mechanical_criterion` intentionally pins this limit.
Treat empty expected command output as exit-status-only replay; no command findings is a legitimate zero-work replay, not command evidence inspected.
Inspect display tags for diagnostics, model identity claims, context cuts, and vote tally; runtime availability
comes from `_Sample.state`, not those label strings. Sampling is repeated calls, not guaranteed independent reviewers.
Treat current malformed/unavailable blocking responses as failed evaluation, not the former advisory fallback.
Typed error/no-verdict states abort ballots even with truncation. Calibration excludes invalid/unavailable
measurements and reports all-invalid agreement as unavailable; shared core still does not enforce the new
availability field. Exact prose parsing and consumer-specific validation are documented in judge maintenance.
These checks establish wiring, not semantic truth or independent reviewers. Preserve historical corpus/case evidence.

## Done
Require independent APPROVE on the current frozen snapshot plus applicable validation before declaring completion; keep pending review explicit.
Return captured-file provenance, phase rows, replay strength, calibration derivation, supplied judge files, and unresolved semantic/access gaps.
Claim evidence consistency within supplied artifacts; do not claim world truth, fresh review contexts, or an uncircumventable reviewer boundary.
