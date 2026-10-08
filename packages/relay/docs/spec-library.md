# Executable-spec library contracts

Audience: agents. Status: current.

Procedure: [relay-spec-library skill](skills/relay-spec-library/SKILL.md).
Sources: [renderer/lint/amendment tool](../bin/relay-spec.py), [catalog](../specs).
Evidence: [render tests](../tests/test_spec.py), [lint tests](../tests/test_spec_lint.py), [amendment tests](../tests/test_amend.py).

## Catalog and rendering

Each catalog entry is `<id>/meta.json` plus `sprint.json`. Metadata supplies ID, title, description, version,
and optional params as names or `{name,description?,default?}` objects. Resolution is `--specs`, then
`RELAY_SPECS_DIR`, then shipped catalog. Entry ID must be a single path segment, not absolute or `.`/`..`.

`list` shows catalog metadata; an empty/missing catalog exits 0. `show` reports WPs, defaults, and undeclared
placeholder use. `instantiate` applies defaults then repeatable `--param k=v` overrides and writes JSON to
stdout or `-o`. Missing values are determined by placeholders used in the original sprint, not declaration alone.

Placeholders match `${[A-Za-z_][A-Za-z0-9_]*}`; shell `${VAR:-default}` remains shell syntax.
Substitution changes string leaves, not dictionary keys; supplied values are not recursively re-expanded.
Render validation requires a nonempty WP list, WP IDs, nonempty checklists, and control IDs with cmd or judge.
It does not prove unique IDs, substantive commands, safe params, or runtime support for every kind.

## Quoting and composition boundary

Values substituted into `cmd` are parsed as shell words and re-quoted with `shlex`; unparseable values are
quoted whole. This handles shell-word positions, including a multiword runner. It is not safe composition for
arbitrary embedded Python or already double-quoted shell snippets. Trust and constrain template parameters;
inspect rendered commands. Do not advertise arbitrary-param injection safety.

| Starter | Intended bindings and controls |
|---|---|
| `pytest-green` | `tests` required, `runner` defaults to `python3 -m pytest`; collection and full-suite commands |
| `py-package-skeleton` | `pkg` required, `root` defaults to `.`; directory/init, import, smoke-file and smoke-test commands |

For package template, use a canonical valid Python identifier such as `mylib` for `pkg`. Its `python3 -c`
import snippet embeds that param inside another language/quoting context; renderer does not validate it.

## Lint and amendment limits

`lint` exits 1 for errors, 0 for warnings only. It detects documented trivial commands, ungated work, cross-WP
duplicate control IDs, unknown kinds, inject without payload, and undeclared macros when a declaration list exists.
`--allow-ungated` only downgrades ungated findings. Warnings include advisory judges, repeated self-check wording,
and chain length against documented cap 8; lint cannot read a future session's live cap.

Lint exempts inject/human from deterministic-coverage expectations, but arm hook currently refuses `human`.
Policy preprocessing repeats IDs across WPs that lint rejects; see [guardrails](guardrails.md).
Lint success is not proof that all consumers implement the same FSM.

`amend-check` compares must-pass control membership, deterministic-to-judge downgrades, advisory disarming,
removal, and moves behind an optional cursor. It cannot rank arbitrary commands by strength. `--signed-by REASON`
accepts detected loosening with text attribution; it is not cryptographic signing or mandatory runtime enforcement.
Keep original sprint and check recorded oracles with `relay verify --sprint` after execution.
