---
name: relay-autodecompose
description: Use when drafting a Relay sprint from an existing pytest suite with relay-autodecompose.py and reviewing collection, grouping, and control IDs.
---

# Relay auto-decomposition

Audience: agents. Status: current.

## Trigger

Use when a repository already encodes acceptance behavior in pytest tests and needs an initial sprint draft.
The result is a draft to review, not an inferred product specification.

## Read first

- [Tool](../../../bin/relay-autodecompose.py) and [tests](../../../tests/test_autodecompose.py).
- [Sprint lint](../../../bin/relay-spec.py) and [integration](../relay-integration/SKILL.md).

## Ownership

- Tool collects nodeids, groups and splits them, and emits commands.
- Author owns completeness, instructions, ordering, ID uniqueness, and acceptance scope.
- Gate executes the resulting controls later; collection does not prove they pass.

## Contracts

- Collection runs `runner.split() + ["--collect-only", "-q", tests_path?]` in the target repo.
- Keep output lines containing `.py::`, excluding lines beginning `=` or `ERROR`; no nodeids is fatal.
- Nonzero collection exit other than 5 warns when nodeids exist and still emits a possibly partial draft.
- Files sort by path. Each file becomes a WP, split into chunks by `--per-wp-cap` (default 12).
- Each chunk gets one deterministic item per test plus one chunk-wide rollup, so cap excludes the rollup.
- `--per-wp-cap 0` disables splitting. Use positive caps or zero; negative values are not a valid plan.
- Test-part IDs normalize punctuation and omit file paths; same test names across files can collide.
- Nodeids are `shlex.quote`-quoted in emitted commands; `--runner` remains trusted command text.
- Runner collection uses whitespace splitting, not shell parsing. Use a plain runner such as `python3 -m pytest`.
- Output schema is `brief`, `retry_budget`, `work_packages[].{id,title,instructions,checklist}`.
- Controls contain `id`, `assert`, `cmd`; retry budget defaults to 3. `-o` writes a file, otherwise JSON stdout.

## Procedure

1. Resolve the target repo and install its test dependencies in the Python environment on gate host PATH.
2. Collect the intended acceptance slice yourself and inspect errors before trusting the tool's draft:

   ```sh
   python3 -m pytest --collect-only -q tests/unit
   ```

3. From Relay root, draft into an isolated run directory whose parent already exists:

   ```sh
   python3 bin/relay-autodecompose.py /absolute/project --tests tests/unit \
     --runner "python3 -m pytest" --per-wp-cap 12 --retry-budget 3 \
     --brief "Repair unit behavior; preserve acceptance tests." -o /absolute/run/sprint.json
   ```

4. Review collected nodeids against the intended suite. A warning is evidence of incomplete collection.
5. Replace `DRAFT` instructions with precise implementation boundaries; reorder WPs for dependencies.
6. Make checklist IDs globally unique, including same-named tests and parameter values collapsed by normalization.
7. Add missing acceptance controls. Add scoped semantic review only alongside deterministic controls.
8. Lint the edited sprint and integrate it using the chosen driver:

   ```sh
   python3 bin/relay-spec.py lint /absolute/run/sprint.json --json
   ```

## Checks

Run `python3 -m pytest tests/test_autodecompose.py -q` for tool changes.
Compare draft controls to actual collection; run representative generated commands in target workdir.
Check per-file splits, rollup coverage, and global control IDs rather than relying on draft counts.

## Cold review

Mandatory: reviewer must differ from author and use a fresh isolated context without author-session history.
Freeze baseline commit, exact diff path, and artifact paths; reviewer inspects tool source and gate/lint consumers.
Exercise this skill's collection-to-draft-to-gate integration with named checks:
- Run `python3 -m pytest tests/test_autodecompose.py -q`; check partial/empty collection, caps, rollups, and IDs.
- Replay Procedure's collection, draft, and lint commands; run generated controls and `relay-gate eval`
  against an isolated fixture, observing both a real failure and repaired pass, including ID collision findings.
Write `APPROVE`, `FIX-FIRST`, or `REJECT` to a review evidence file, citing filepaths, exact commands/exits,
observed results, and residual limits. Missing validation evidence blocks `APPROVE`.
Fix findings, freeze revised diff/artifacts, and obtain independent re-review before Done.
This documented duty is not automatic enforcement and does not guarantee error-free results.
Commit or PR requires explicit authorization.

## Failure handling

No tests collected: inspect reported command and stdout/stderr tails; fix imports, test path, and runner.
Partial collection: repair collection and regenerate before accepting the draft as complete.
Duplicate IDs: rename controls before running; lint and verification key controls by ID.
Oversized or weak WPs: edit the plan; passing current tests does not establish missing requirements.

## Done

Independent `APPROVE` evidence and validation for the frozen revision are required.
Reviewed sprint covers the intended suite, uses unique IDs, and has actionable instructions.
First WP is delivered before the first gate call; gate output and final trace are checked via integration.
