---
name: relay-benchmark
description: Use when generating Relay benchmark campaigns, driving M/R/D arms, grading held-out requirements, or interpreting recorded crossover evidence.
---

# Relay benchmark operation

Audience: agents. Status: current.

## Trigger

Use when reproducing or extending a benchmark campaign and reviewing the reach of its evidence.

## Read first

- [Arm runner](../../../benchmark/run_arm.sh), [crossover runner](../../../benchmark/run_crossover.py), [grader](../../../benchmark/grader.py).
- [v1 generator](../../../benchmark/generator/gen_campaign.py), [v2 generator](../../../benchmark/generator/gen_campaign_v2.py).
- [Benchmark hook](../../../benchmark/relay_hook.sh), [methodology](../../../benchmark/METHODOLOGY.md), [results](../../../benchmark/RESULTS.md).
- [Recorded N500 result](../../../benchmark/results/crossover_N500_s1_M.json), [catalog](../../../docs/skills.json).
- [Measurement-validity tests](../../../tests/test_benchmark_runtime.py), [command transport tests](../../../tests/test_command_transport.py).
- Consumer manuals: [judge/calibration](../relay-judge/SKILL.md), [audit/verifier](../relay-audit/SKILL.md).
- [Integration](../relay-integration/SKILL.md) and [examples](../relay-examples/SKILL.md).

## Ownership

- Own catalog-included `benchmark/relay_hook.sh`, `benchmark/run_arm.sh`, `benchmark/run_crossover.py`, `benchmark/grader.py`,
  `benchmark/generator/gen_campaign.py`, `benchmark/generator/gen_campaign_v2.py`, and `benchmark/campaigns/**/*.py`.
- `judge` owns `benchmark/judge.py` and `benchmark/calibrate_judge.py`; `audit` owns `bin/relay` and `benchmark/verify_ledger.py`.
- Catalog dependencies are `gate-core`, `audit`, and `judge`; route changes to those sources through their owners.
- Campaign author owns frozen requirements, weights, visible controls, and held-out assertions.
- Harness owns runnable model environment, output paths, recording, and protection of grader/reference artifacts.
- Analyst owns comparison scope and validity; printed `VALID` is a limited guard result, not provenance proof.

## Contracts

- M uses `sprint_mono.json`, one WP, gated. R uses multi-WP `sprint.json`, gated. D uses that sprint ungated.
- Generated R has retry budget 3 per WP; generated M has `max(3, N // 3)`. Comparisons include these budget choices.
- Runner installs the benchmark `Stop` hook and seeds sprint brief plus first WP instructions.
- Feedback is visible `checks/`; grading uses campaign `holdout/` against run `repo/` through `RELAY_IMPL`.
- Runner removes holdout from its copied workdir. Campaign source and `/tmp` references remain on the same host;
  this layout is not an actual isolation boundary against a model with broader filesystem access.
- `run_arm.sh` deletes its output directory first; generators overwrite their output/reference/cheat directories.
- Runner needs `bash`, `jq`, `python3`, pytest, authenticated `claude`, and GNU `timeout` on PATH.
  On macOS, install coreutils and expose its `gnubin` if only `gtimeout` is otherwise available.
- Model invocation is `claude -p`, JSON output, model `sonnet`, permissive permissions; use an isolated trusted environment.
- Timeout defaults to `RELAY_TIMEOUT` or 1800 seconds in arm runner; crossover passes its own timeout (default 2400).
- Model failure is swallowed by arm runner so grading can proceed; check `run.json`, `run.err`, and guard reasons.
- Artifacts include `run.json`, `run.err`, `grade.json`, `.relay-state`, and archived grade/run/ledger under
  `benchmark/.relay-ledger`. Archiving does not itself run verification or record an authenticated head anchor.
- Gated benchmark hook runs current DoD, then checklist, then earlier DoD only; it does not regress earlier checklist controls. Compact JSONL preserves full decoded commands, tabs and interior/trailing LF; each DoD command executes as one Bash program by final exit status. Checklist hashes retain exact decoded bytes, and malformed required DoD is a named failure. Ungated D advances without controls.
- Required evidence/transition appends are fatal before corresponding counter/retry publication, including ungated advancement; a later state write can still fail. Some ARM ancillary appends and archives remain best-effort; neither ordering nor archival provides atomicity or rollback.
- Grader combines requirement-matching JUnit cases with AND; a failure or skip prevents that requirement passing. For a valid grade, RSR is passed weight / total weight, CCR requires all requirements to pass. Complete all-skipped coverage can be valid zero quality, but cannot establish grader discrimination.
- Without `--holdout`, grader uses visible checks and labels `visible-checks(NOT-independent)`; smoke evidence only.
- Every grade emits `grade_valid`, `grade_errors`, and `pytest_exit_code`. Missing/unparseable/empty JUnit, collection/setup/teardown errors, unmapped/unknown cases, missing requirements, unsupported/inconsistent pytest exits, or unusable requirements invalidate measurement. Invalid grades have `rsr:null`, `ccr:null`, `passed_w:null`, empty `per_req`/passed/failed/regressions, rather than a zero-quality score. Grader process exit alone does not establish validity.
- The requirements/weights reader still pairs regex-extracted IDs and integer weights; it is not a full YAML/schema validator. Structured JUnit validation does not prove frozen requirement provenance or oracle quality.
- Crossover validates usable model envelope with nonzero turns OR output tokens, no model error, candidate file,
  and nonidentity with an existing reference. Missing reference and transformed copies evade the identity check.
  It also requires a grade object with explicit `grade_valid:true` and finite numeric RSR in `[0,1]` (not Boolean). Invalid runs report `rsr:null` and do not enter headroom means; result records retain `grade_valid` and `grade_errors`.
- `--check-grader` requires valid parsed JUnit from the pristine skeleton, complete expected requirement coverage, pytest exit `1`, real requirement testcase `<failure>` children, and no skips/errors. Infrastructure, collection, tool/report failure or skip cannot satisfy discrimination. Reference-pass and visible-input-cheat-fail remain separate controls.
- Crossover takes one N per invocation, multiple seed/arm arguments, default arm M, headroom threshold 0.85.
- Shipped JSON records N=500, k=25, seed=1, arm=M, RSR=1.0, `valid:true`, `check_grader:false`.
  This is an M saturation point, not a comprehensive seed/size/arm sweep or proof of R-vs-M benefit.
  Historical records remain unchanged; current run validation rejects a grade lacking explicit `grade_valid` rather than backfilling that evidence.
- v1 generates record-processor rules; v2 generates distinct arithmetic functions with earlier-function calls.
  Both derive literal test expectations from references and emit visible-input lookup cheats outside campaign repo.
- Generator default `/tmp` reference and cheat names can collide across runs; preserve evidence before regeneration.

## Procedure

1. Review campaign and artifacts. Choose dedicated disposable output paths; confirm parents before execution.
2. Prove collection and grading use the candidate, and protect held-out/reference access in the actual environment.
3. Pilot M at one N before spending on comparisons; run from Relay root in a working standalone model terminal:

   ```sh
   python3 benchmark/run_crossover.py --n 500 --k 25 --seeds 1 --arms M --check-grader \
     --out-root /absolute/experiment/runs --json-out /absolute/experiment/results.json
   ```

4. If valid M results show headroom, repeat with `--arms M,R,D` and preselected seeds/size points.
   This example spends real model budget and writes runtime artifacts; it is not a documentation check.
   Configure the live hook block cap for long R/D chains; benchmark hook does not run the arm preflight.
5. Grade an existing implementation with explicit independent input:

   ```sh
   python3 benchmark/grader.py --dir /absolute/run --holdout /absolute/campaign/holdout
   python3 benchmark/verify_ledger.py /absolute/run/.relay-state/ledger.jsonl
   ```

6. Inspect `grade_valid`, `grade_errors`, `pytest_exit_code`, complete requirement coverage, and real JUnit outcomes before comparing numeric scores. A valid zero score is a quality observation; a null score is an invalid measurement.
7. Retain requirements, parameters, grades, run envelopes, and trace before modifying the campaign.

## Checks

For offline hook/grader validity changes, select these tests from Relay root:

```sh
python3 -m pytest tests/test_benchmark_runtime.py tests/test_command_transport.py -q
```

`test_benchmark_runtime.py` runs disposable real pytest/JUnit pass, assertion-failure,
skip, collection/setup error, incomplete/unmapped requirement, and generated v2
reference/skeleton/visible-input-cheat controls. It also injects tool/report faults and
recorded-run envelopes to check invalid grades cannot become headroom. It invokes no model
and does not rewrite campaigns or measurements. `test_command_transport.py` covers the
benchmark hook's whole-program DoD, invalid required commands, and driver-specific scope.

Use reference, unimplemented skeleton, and visible-input cheat as positive/negative controls.
Inspect invalid reasons and actual holdout/JUnit failures; a guard flag does not prove isolation or authorship.
Generated benchmark sprints use `dod`; intact benchmark chains alone need not satisfy named-control `relay verify`.
For semantic calibration, follow the judge-owned [procedure](../relay-judge/SKILL.md) and explicitly choose real `api`/`cli`.
Judge JSON adds Boolean `available` from typed sample state, not backend/model/context
substrings. Calibration requires process exit `0`, one object with `pass`/`fail`, string
reason, NUL-free string backend, and `available:true`; invalid cases are excluded from
TP/TN/FP/FN. All-invalid agreement is `unavailable (no valid judgments)`, not measured zero.
Select `tests/test_judge_calibration.py` for subprocess availability and invalid-measurement controls; these plumbing checks do not establish semantic quality.
Audit-owned verification and judge calibration are consumed checks; their results do not expand benchmark source ownership.

## Cold review

Mandatory: reviewer must differ from author and use a fresh isolated context without author-session history.
Freeze baseline commit, exact diff path, artifact paths and content hashes; reviewer inspects generators, runner, grader, and consumers.
Exercise this skill's changed offline contracts with Checks' named suites; use Procedure's generator/runner/grader/verifier commands when their integration requires them, with explicit authorization before live model runs.
Name and record reference-pass, skeleton-fail, visible-cheat-fail, empty/error-envelope, missing-reference,
transformed-copy, skipped-test, and collection-fault checks; inspect `validate_run` and `check_grader_discriminates`.
Require real complete parsed JUnit assertion failures for discrimination, plus skip/collection/report/tool negative controls; inspect `grade_valid` and null invalid scores rather than trusting exit 0.
Review actual JUnit/results, budget choices, held-out exposure, and N500/seed1/M claim scope, not `VALID` alone.
Write `APPROVE`, `FIX-FIRST`, or `REJECT` to a review evidence file, citing filepaths, exact commands/exits,
observed results, and residual limits. Missing validation evidence blocks `APPROVE`.
Fix findings, freeze revised diff/artifacts, and obtain independent re-review before Done.
This documented duty is not automatic enforcement and does not guarantee error-free results.
Commit or PR requires explicit authorization.

## Failure handling

Empty/error run envelope: repair standalone model execution or timeout before interpreting its grade.
Reference identity/leak: reject evidence and repair isolation; renaming/copy transformation is not remediation.
Saturated M: report no observed headroom at that point; do not extrapolate a universal efficacy conclusion.
Grader transport/collection/report failures: retain invalid `grade_errors`/null-score evidence, repair the instrument, and rerun controls. Do not coerce null to zero or treat skips/errors as discrimination.

## Done

Independent `APPROVE` evidence and validation for the frozen revision are required.
Report exact substrate, N/k/seeds/arms, held-out source, execution and grade validity, isolation limits, and recorded evidence.
Separate pipeline smoke, saturation, and comparative efficacy claims by their actual measurements.
