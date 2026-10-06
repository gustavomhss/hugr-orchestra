# R3 — Historical Completed Scope: Executable-Spec Library

Audience: agents. Status: historical.

Current authority: [SPEC.md](../../SPEC.md). Procedures: [operational skills](../../.opencode/skills/).
This card records a completed local scope, not an active catalog-building assignment.

## Delivered scope

[bin/relay-spec.py](../../bin/relay-spec.py) implements catalog `list`/`show` and
`instantiate`: versioned metadata plus sprint templates with `${param}` substitutions,
missing-parameter checks and rendered-shape validation. Parameters in `cmd` fields are
shell-word quoted; IDs must select one catalog entry. Rendering does not execute controls.

[specs/](../../specs/) contains `pytest-green` and `py-package-skeleton` starter specs.
Original ownership: renderer/catalog, [tests/test_spec.py](../../tests/test_spec.py), library docs.
[Auto-decomposition](../../bin/relay-autodecompose.py) is a separate existing-suite draft tool,
not a dependency-aware implementation of the benchmark's proposed partition method.

## Later additions and limits

Offline `lint` and `amend-check` now also live in this module. Lint errors fail; warnings alone
do not. Its closed list of trivial command spellings is not proof that every passing stub is
detected. `--signed-by` accepts attribution text, not a cryptographic signature or automatic
live-plan enforcement. Compiler/linter `human` recognition exceeds production arm support.

Test references record verification intent, not a current suite result or test count.
