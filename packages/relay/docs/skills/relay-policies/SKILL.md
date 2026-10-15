---
name: relay-policies
description: Use when applying or reviewing Relay policy bundles, merge precedence, provenance, and preprocessing limitations with relay-policy.py.
---

# Relay policy bundles

Audience: agents. Status: current.

## Trigger

Use when adding organization controls to a sprint or investigating which bundle supplied a control.

## Read first

- [Policy tool](../../../bin/relay-policy.py), [bundles](../../../policies), [tests](../../../tests/test_policy.py).
- [Gate core](../../../lib/relay-gate.sh), [lint](../../../bin/relay-spec.py), [reference](../../../docs/guardrails.md).
- [Integration](../relay-integration/SKILL.md) and [spec library](../relay-spec-library/SKILL.md).

## Ownership

- Organization selects trusted bundles and controls their changes.
- Harness explicitly invokes preprocessing and runs its output; installation does not mandate policy application.
- Gate evaluates the resulting checklist. `policy` and `origin` fields are provenance labels, not authorization.

## Contracts

- Bundle JSON is a control list or `{"controls":[...]}`; controls need an ID and a truthy cmd or judge.
- If `cmd` exists, it must be a string. The tool does not sandbox or make shell commands inert.
- `apply` prepends the union of bundle controls to every WP, including a WP with no checklist.
- Bundle order matters: first bundle naming an ID wins. Organization controls replace matching WP controls.
- Kept WP controls lose their existing `policy` field. Injected controls receive the bundle filename stem.
- Explicit `origin` takes precedence in the ledger; otherwise `.policy` becomes `policy:<bundle>`, else `sprint`.
- Input needs an object with a WP list; WPs must be objects and existing checklists must be lists or absent/null.
- Bundle validation does not comprehensively validate all retained WP controls or acceptance semantics.
- The same organization control ID is repeated across WPs. Current `relay-spec.py lint` reports those IDs
  as `duplicate-control-id`; reachable-sprint audit rejects duplicate checklist IDs as `SPRINT-INVALID`
  (exit 2). This is a shipped preprocessing/validation mismatch, not agreement among layers.
- Repeated IDs also affect ID-keyed reports, keep-best, and oracle drift attribution. Review before running.
- `list` reports malformed bundles as `INVALID` while still exiting 0; missing/empty directories also exit 0.
- Both shipped Git detectors reject failed/non-Git preflight, then map `git grep` exit 0 (match) to control
  FAIL/exit 1, exit 1 (no match) to PASS/exit 0, and every other search status to FAIL/exit 1, including Git
  disappearing after preflight. Guarded search with `set +e` retains the status under supported Bash options.

## Procedure

1. Review bundle commands and their executable dependencies in the target workdir.
2. List the intended catalog; inspect `INVALID` output rather than using exit 0 as validity evidence:

   ```sh
   python3 bin/relay-policy.py list --dir policies
   ```

3. Keep the original sprint, then apply explicitly into an existing isolated directory:

   ```sh
   python3 bin/relay-policy.py apply --bundle policies/no-debug-prints.json \
     --bundle policies/no-loosened-tests.json --sprint /absolute/run/sprint.json \
     -o /absolute/run/sprint.guarded.json
   python3 bin/relay-spec.py lint /absolute/run/sprint.guarded.json --json
   ```

4. Review prepend order, replaced IDs, provenance, and cross-WP duplicates. Surface the mismatch to plan owner;
   do not suppress lint and describe the merged plan as uniformly validated.
5. Run the reviewed output through the chosen gate driver; verify that its policy control verdicts are recorded.

## Checks

Run `python3 -m pytest tests/test_policy.py -q` for preprocessing changes.
Test both a real violation and a clean target when adapting an organization command.
The starter Git detectors scan tracked content with preserved pathspecs: debug detection excludes `*test*`,
`*spec*`, and `*.md`; test detection selects `test*`, `tests`, and `spec*`, excluding `*relay*`. Patterns
remain those declared in the bundles; untracked/excluded files are outside their reach. They are text scans,
not AST analysis or proof against arbitrary debug behavior or test weakening; an empty selected scope can pass.
Use real included clean/violating tracked content as controls and injected search statuses 0, 1, and errors
after successful preflight. Inspect actual status, not empty output. `test_policy.py` exercises these through
Bash options and real apply/gate execution, plus the full shell-status set and preserved exclusions.
`coverage-floor` uses pytest-cov and a reported floor; it does not reject skips or prove expected tests ran.
Stronger claims need distinct collection/execution and skip evidence as well as tool-success status.
Customize the embedded floor/runner deliberately; current starter commands do not supply those stronger checks.
Review [bundle source](../../../policies/coverage-floor.json) rather than assuming the floor is an environment override.

## Cold review

Mandatory: reviewer must differ from author and use a fresh isolated context without author-session history.
Freeze baseline commit, exact diff path, artifact paths and content hashes, including untracked drafts;
reviewer inspects bundles, preprocessor, and consumers. Any revision invalidates the previous approval.
Exercise this skill's apply/lint/gate integration with named checks:
- Run `python3 -m pytest tests/test_policy.py tests/test_spec_lint.py -q`.
- Replay Procedure on isolated clean/violating fixtures and a multi-WP sprint; inspect first-wins replacement,
  policy/origin labels, repeated-ID lint/audit collisions, detector scope, 0-FAIL/1-PASS/all-other-FAIL status mapping,
  post-precondition search/tool errors,
  and skipped or incomplete expected-test execution behind a reported coverage floor.
Write `APPROVE`, `FIX-FIRST`, or `REJECT` to a review evidence file, citing filepaths, exact commands/exits,
observed results, and residual limits. Missing validation evidence blocks `APPROVE`.
Fix findings, freeze revised diff/artifacts, and obtain independent re-review before Done.
This documented duty is not automatic enforcement and does not guarantee error-free results.
Commit or PR requires explicit authorization.

## Failure handling

Bad JSON, missing cmd/judge, nonstring cmd, or malformed checklist: correct the source before preprocessing.
Missing Git or coverage tooling: fix the precondition; a missing detector is not evidence of compliance.
Search/tool error: the shipped Git detectors must fail; preserve status/diagnostics and fix the tool.
Reported coverage despite skipped or incomplete expected tests: preserve separate execution evidence before certification.
Conflicting IDs: inspect first-wins replacement and the lint mismatch with the plan owner.
Gate failure: repair the artifact under the same control; policy application itself does not prove a pass.

## Done

Independent `APPROVE` evidence and validation for the frozen revision are required.
Reviewed output is explicitly selected by the harness; merge decisions and ID conflicts are documented.
Recorded controls and explicit-sprint verification support the stated policy scope without claiming mandatory installation enforcement.
