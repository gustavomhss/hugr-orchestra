---
name: relay-judge
description: Maintain semantic judge transport and calibration; use when changing benchmark/judge.py, backends, voting or judge evidence delivery.
---

# Relay judge maintenance

## Trigger

Use for transport, backend selection, artifact delivery, voting or calibration changes.
Load [ownership](../relay-ownership/SKILL.md) and [blast radius](../relay-blast-radius/SKILL.md) first.

## Read first

- [Judge](../../../benchmark/judge.py), [calibrator](../../../benchmark/calibrate_judge.py).
- [Gate core](../../../lib/relay-gate.sh): expansion, computed diff, blocking and grading tags.
- [API tests](../../../tests/test_judge_api.py), [CLI tests](../../../tests/test_judge_cli.py),
  [calibration tests](../../../tests/test_judge_calibration.py),
  [core-runtime tests](../../../tests/test_gate_core_runtime.py), [context tests](../../../tests/test_judge_context.py),
  [diff tests](../../../tests/test_judge_diff.py), [labeled cases](../../../benchmark/judge_cases/).
- [SPEC](../../../SPEC.md), [research skill](../relay-research/SKILL.md).

## Ownership

Own `benchmark/judge.py`, `benchmark/calibrate_judge.py` and calibration-case maintenance.
Coordinate checklist callers with gate-core/profile owners. Preserve dated case evidence;
add cases rather than rewriting labels to make agreement improve.

## Contracts

- Selection: forced `RELAY_JUDGE_BACKEND`, then API when `ANTHROPIC_API_KEY` exists, else stub.
  Select explicit `api` for custom gateway credentials; explicit `cli` for local Claude authentication.
- Defaults: `RELAY_JUDGE_MODEL=claude-sonnet-4-6`, `RELAY_JUDGE_MAX_CTX=120000` characters per file,
  `RELAY_JUDGE_MAX_TOKENS=8192`, `RELAY_JUDGE_VOTES=1` (clamped to at least one).
  Inspect source before changing these defaults.
- Normal CLI output is JSON `{verdict, reason, backend, available}`, exit zero; `available` is a boolean
  derived from typed sample/ballot state. Caller decides whether verdict blocks. Stub verdicts are test
  doubles, not semantic evidence, and report `available:true` for both pass and fail.
- API requests non-streaming forced `submit_verdict` tool use. The first matching tool block must contain
  lowercase `pass`/`fail` and a string reason; a valid tool verdict takes priority over conflicting prose.
  Malformed matching tool input or response shape becomes `api-error:<model>` rather than prose rescue.
  API timeout is 60 seconds; CLI runs `claude -p` with the configured model and a 300-second timeout.
- API prose fallback and CLI accept only exact `VERDICT: PASS` or `VERDICT: FAIL` after case and outer-whitespace
  normalization. Search backwards for the last line starting `VERDICT:`; a malformed last declaration is
  unavailable even after an earlier valid one. Substrings, extra explanations on that line, `NOTPASS`, and
  `PASS or FAIL` are not verdicts. The parser can accept a verdict before later non-verdict text; it does
  not enforce the prompt's final-physical-line requirement.
- Single-sample API/CLI helpers return internal `_Sample` objects containing verdict, reason, `_SampleState`, backend kind,
  exact model string, and a tuple of cut filenames. `available` is true only for `ANSWERED`; `ERROR` and
  `NO_VERDICT` abort `_judge_samples` immediately with fail, discarding earlier votes. Later passes cannot
  outvote unavailable evaluation, even when context is truncated. An answered semantic fail remains a vote.
- Strict majority decides available samples; ties fail. `_sample_tag` renders backend/model, optional
  `(votes:n/m)`, no-verdict status, and context-cut metadata after availability/tally decisions. Voting never
  parses that display string. Model aliases and cut filenames containing `(no-verdict)`, `(truncated:...)`,
  error names, or apparent vote tallies cannot change sample availability or tally through their label text.
  Preserve the exact configured model in requests and rendered metadata, including parentheses; there is
  no first-parenthesis model truncation. Display metadata is not authenticated model identity.
- `_judge_samples` returns `_Ballot`; the CLI exports its `available` field without interpreting display
  tags. Error/no-verdict aborts produce `fail`/`available:false`; answered pass/fail ballots, including ties,
  remain available. Public Python `judge_api`/`judge_cli` APIs retain `(verdict, reason, backend)` tuples
  via `as_tuple()`. Availability is producer evaluation metadata, not semantic approval or complete evidence.
- Truncation is announced in prompt and tag and does not alone abort a valid verdict. Missing files become
  `(file not found)` evidence; this placeholder does not mechanically force semantic failure.
- Gate logs `judge:<backend>(non-independent)`. Nonzero judge exit, missing/malformed/multiple response objects,
  or unsupported verdicts become `fail` with an unavailable backend, even if stdout from a nonzero process
  claims pass. Response failure no longer becomes an `advisory` verdict. `blocking:true` holds advancement;
  a nonblocking semantic failure remains recorded fail without blocking. Audit excludes judge verdicts
  from deterministic counts; backend labels do not authenticate the producer or its judgment.
- Preserve the consumer boundary: shared gate core currently validates process exit, one response object,
  supported verdict, and backend decoding; it does not validate or enforce `available` or `reason` fields.
  The built-in producer emits fail when unavailable, but calibration's stricter availability contract is
  not universal response-schema enforcement for custom judge programs or every caller.
- Model sees only supplied evidence; omitted citations, external truth and review independence are not verified.
  Same-user execution provides no privilege boundary; an agent may invoke a judge off-gate.

## Procedure

1. Freeze criterion, artifacts, environment and backend. Separate plumbing failure from model disagreement.
2. Change claimed paths. Keep oracle changes visible; do not weaken a criterion to obtain green.
3. Verify accepted/rejected artifact delivery with controlled fixtures. Fake endpoints establish wire behavior,
   not live-model quality; request explicit authorization for costly live semantic calibration.
4. Propagate environment/backend changes into SPEC, configuration, gate/profile skills and relevant fixtures.

## Checks

```sh
python3 -m pytest tests/test_judge_api.py tests/test_judge_cli.py tests/test_judge_calibration.py tests/test_gate_core_runtime.py tests/test_judge_context.py tests/test_judge_diff.py tests/test_relay.py -q
```

Require exact/ambiguous/last-malformed prose cases, conflicting tool/prose and malformed tool inputs,
error/no-verdict combined with context cuts, immediate sample abort, and valid majority/tie cases that
retain model/tally/truncation. Require marker-bearing model aliases and cut filenames with both answered
tool/prose judgments and real no-verdict responses: label text must neither abort valid ballots nor hide
unavailability, and request/model metadata must remain exact. Core-runtime cases must distinguish blocking
from nonblocking failures.

`python3 benchmark/calibrate_judge.py` invokes selected backend and may spend model calls. Its printed
agreement is a measurement, not an exit-code acceptance gate. `run` requires process exit 0, a JSON object
with verdict `pass`/`fail`, a NUL-free string backend, a string reason, and `available is True` exactly.
Launch/process, parse/shape, and unavailable/invalid availability results return `?` and are excluded from
TP/TN/FP/FN counts. Missing legacy availability, numeric `1`, string `"true"`, null, and false are not inferred
from verdict or backend text. Marker-bearing model/file labels no longer affect calibration classification.
All-invalid input prints `agreement=unavailable (no valid judgments)`. Import is guarded and does not launch
calibration/model calls. Empty backend/reason strings are not rejected, and ordinary `json.loads` is used;
this is not the ledger's duplicate-free decoder or complete response-schema validation. Preserve labeled
cases and historical results; repaired measurement plumbing does not establish live-model quality.

Require `tests/test_judge_calibration.py` cases for all confusion-matrix cells, marker-bearing labels, real
API/CLI subprocess availability, stub pass/fail availability, missing/malformed/false availability,
nonzero processes with pass JSON, launch failure, all-invalid agreement, and import without model calls.

## Cold review

Mandatory: reviewer differs from author and uses a fresh isolated context. Freeze baseline, exact diff/path
list, case labels and artifact hashes, including untracked files; revisions invalidate previous approval.
Reviewer reads source and callers, runs named applicable Checks, verifies positive/negative transport
cases including combined tags and malformed last verdicts, and checks whether each criterion's evidence
was supplied. Trace `_Sample.available`/`_Ballot`/CLI JSON separately from `_sample_tag`, challenge marker-bearing
aliases and filenames in both directions, and inspect calibration's exact-true availability validation,
tuple compatibility, shared core's narrower response validation, and blocking/nonblocking behavior.
Return `APPROVE`, `FIX-FIRST` or `REJECT` with paths, commands/exits and residual limits.
Repair, re-freeze and re-review findings. Skill instructions do not mechanically enforce independence.

## Failure handling

Classify API/CLI errors, no-verdict, truncation and unavailable diff before diagnosing artifact quality.
Use typed sample state for runtime availability; display-tag substrings are not an authoritative state parser.
Treat absent or malformed calibration availability as an invalid measurement, never a legacy inferred verdict.
Keep shared core's lack of availability-field enforcement explicit; an available verdict is not independent review.
Blocking malformed/unavailable evaluation fails the gate; transport rejection does not establish an artifact defect.
Do not certify stub output. A question about unseen evidence requires correcting the input contract.

## Done

Named checks and meaningful failure-direction probes recorded; source/callers/docs agree; independent
cold review returns `APPROVE`. Report unrun live checks and remaining evidence limits explicitly.
