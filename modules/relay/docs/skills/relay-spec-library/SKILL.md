---
name: relay-spec-library
description: Use when listing, rendering, linting, or reviewing amendments to reusable Relay sprint templates with relay-spec.py.
---

# Relay executable-spec library

Audience: agents. Status: current.

## Trigger

Use when reusing a parameterized sprint, checking its control coverage, or comparing a proposed amendment.

## Read first

- [Renderer and lint](../../../bin/relay-spec.py), [render tests](../../../tests/test_spec.py), [lint tests](../../../tests/test_spec_lint.py).
- [Amendment tests](../../../tests/test_amend.py), [catalog](../../../specs), [reference](../../../docs/spec-library.md).
- [Integration](../relay-integration/SKILL.md) for execution and [policies](../relay-policies/SKILL.md) for preprocessing.

## Ownership

- Catalog author owns template semantics, parameter constraints, commands, and version metadata.
- Renderer substitutes strings and performs a limited shape check; it does not execute controls.
- Lint reports known coverage defects. Amendment comparison does not rank arbitrary oracle strength.

## Contracts

- Catalog resolution: `--specs DIR`, else `RELAY_SPECS_DIR`, else shipped `specs/`.
- An entry is `<id>/meta.json` plus `sprint.json`; ID must be one path segment, not absolute or `.`/`..`.
- Metadata carries `id`, `title`, `description`, `version`, and optional `params` strings or objects.
- Param objects use `name`, optional `description`, optional `default`; defaults precede explicit `--param k=v`.
- Placeholder syntax is `${[A-Za-z_][A-Za-z0-9_]*}`; shell `${VAR:-default}` is not a template placeholder.
- Used placeholders determine required values, even if undeclared in metadata. `show` reports undeclared use.
- Substitution touches string leaves, not dictionary keys, and does not recursively expand supplied values.
- `cmd` values use `shlex.split` then `shlex.join`, falling back to quoting the whole unparseable value.
- This quotes shell words only. It does not safely compose arbitrary values into embedded Python or an
  already double-quoted shell snippet; it does not validate language identifiers or application semantics.
- Treat template and params as trusted, canonical input. For `py-package-skeleton`, use a valid Python
  identifier such as `mylib` for `pkg`, and a reviewed root path. Do not claim arbitrary-param safety.
- Render validation requires a nonempty WP list, WP IDs, nonempty checklists, and control IDs with cmd or judge.
- It does not guarantee unique IDs, exclusive cmd/judge, substantive checks, safe commands, or runtime kind support.
- Lint exits 1 on errors, 0 on warnings only. `--allow-ungated` downgrades only ungated-state errors.
- Lint knows `human`, but arm hook currently refuses that kind; lint acceptance is not runtime implementation.
- `amend-check` detects removed/disarmed/downgraded must-pass controls and moves behind an optional cursor.
- `--signed-by REASON` accepts detected loosening with text attribution; it is not a cryptographic signature
  or an automatically installed runtime amendment boundary. Oracle changes are notes, not strength proofs.

## Procedure

1. Inspect the entry and actual template commands before binding project paths:

   ```sh
   python3 bin/relay-spec.py list
   python3 bin/relay-spec.py show pytest-green
   ```

2. Render with reviewed params into an existing isolated directory:

   ```sh
   python3 bin/relay-spec.py instantiate pytest-green --param tests=tests/unit -o /absolute/run/sprint.json
   python3 bin/relay-spec.py instantiate py-package-skeleton --param pkg=mylib --param root=. \
     -o /absolute/run/package.json
   ```

3. Inspect every rendered command, including nested interpreter snippets; run lint:

   ```sh
   python3 bin/relay-spec.py lint /absolute/run/sprint.json --json
   ```

4. Preserve a before copy when changing a live plan; compare before applying the amendment:

   ```sh
   python3 bin/relay-spec.py amend-check /absolute/run/before.json /absolute/run/after.json \
     --cursor wp1-collects --json
   ```

5. Run the chosen integration with the rendered sprint. Keep it for `relay verify --sprint`.

## Checks

Run `python3 -m pytest tests/test_spec.py tests/test_spec_lint.py tests/test_amend.py -q` for library changes.
Known lint errors include ungated/trivial controls, cross-WP duplicate control IDs, unknown kinds,
inject without payload, and undeclared macros when a macro list exists. Warnings do not establish coverage.
Shell-word injection tests establish their tested composition, not embedded-language safety.

## Cold review

Mandatory: reviewer must differ from author and use a fresh isolated context without author-session history.
Freeze baseline commit, exact diff path, and artifact paths; reviewer inspects renderer, templates, and consumers.
Exercise this skill's render/lint/amendment/gate integration with named checks:
- Run `python3 -m pytest tests/test_spec.py tests/test_spec_lint.py tests/test_amend.py -q`.
- Replay Procedure's commands and rendered controls; inspect shell-word versus embedded Python/double-quote
  composition, canonical package identifiers, missing params, oracle drift, and runtime kind limits.
Write `APPROVE`, `FIX-FIRST`, or `REJECT` to a review evidence file, citing filepaths, exact commands/exits,
observed results, and residual limits. Missing validation evidence blocks `APPROVE`.
Fix findings, freeze revised diff/artifacts, and obtain independent re-review before Done.
This documented duty is not automatic enforcement and does not guarantee error-free results.
Commit or PR requires explicit authorization.

## Failure handling

Missing params or malformed rendered shape: fix template/bindings; do not run partial output.
Duplicate IDs after policy application: inspect the current preprocessing/lint mismatch before acceptance.
Oracle drift or changed on-disk sprint: preserve evidence and reconcile the plan; do not replace a failed oracle.
Unsupported kinds or interpreter-sensitive params: correct the plan or implement the missing driver contract.

## Done

Independent `APPROVE` evidence and validation for the frozen revision are required.
Rendered sprint, constraints, lint findings, and amendment attribution are reviewed and retained.
Execution and explicit-sprint verification demonstrate the intended controls; rendering alone does not.
