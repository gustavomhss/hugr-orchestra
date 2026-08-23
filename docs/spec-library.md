# Spec library (`relay-spec`)

A **spec** is a sprint you author once and reuse many times. Where the auto-decomposer
(`bin/relay-autodecompose.py`) drafts a fresh `sprint.json` from one repo's test suite, the spec
library lets you keep a *catalog* of generic, parameterized sprints — "make this suite green",
"scaffold a Python package" — and **instantiate** them against any project by binding a few
`${param}` placeholders. Author-once, ratchet-many.

The rendered output is an ordinary `sprint.json`. It is consumed **unchanged** by the Relay hook
(`bin/relay-arm-hook.sh`) and by the model-agnostic gate (`bin/relay-gate`) — a spec is just a
template for the same on-disk control format described in [authoring-sprints](authoring-sprints.md).

## A spec on disk

A spec is a directory under the catalog (default `specs/`, or `$RELAY_SPECS_DIR`):

```
specs/<id>/
  meta.json     { id, title, description, version, params? }
  sprint.json   a normal sprint (SPEC §3) with ${param} placeholders in its text
```

- **`meta.json`** — `id`, `title`, `description`, `version`, and an optional `params` list. Each
  param is either a bare `"name"` string or `{ "name", "description"?, "default"? }`. A param with a
  `default` is optional at instantiate time; one without is **required**.
- **`sprint.json`** — a standard sprint (`brief`, `retry_budget`, `work_packages[]` with
  `id` / `title` / `instructions` and a `checklist[]` of `{id, cmd}` deterministic or `{id, judge}`
  semantic controls). Anywhere in the text you may write `${name}` to mark a substitution point.

A placeholder is strictly `${name}` with a slug-style name, so an ordinary shell `${VAR:-default}`
inside a `cmd` is **not** treated as a relay param.

## The CLI

```
relay-spec.py [--specs DIR] list
relay-spec.py [--specs DIR] show <id>
relay-spec.py [--specs DIR] instantiate <id> [--param k=v ...] [-o sprint.json]
```

- **`list`** — the catalog: each spec's id, version, and title.
- **`show <id>`** — the spec's meta, its work-package titles, and its declared params (with
  defaults). Flags any placeholder used in the sprint but not declared in `meta.params`.
- **`instantiate <id>`** — render the spec. Defaults from `meta.params` are applied first, then your
  `--param k=v` overrides (repeatable; the value may contain `=` and spaces). Every `${k}` is
  substituted in `brief`, `instructions`, `assert`, and `cmd`. If any placeholder is left unbound,
  the command **fails loudly**, listing exactly which params are missing. The rendered sprint is
  validated for the hook schema (every WP has an `id` and a non-empty `checklist`; every control has
  an `id` and either a `cmd` or a `judge`) before it is emitted — so a broken spec is caught at
  render time, not silently inside the gate. Output goes to stdout, or to `-o FILE`.

`--specs` defaults to `$RELAY_SPECS_DIR`, falling back to the `specs/` catalog shipped next to the
tool. The tool is pure stdlib and **never runs a control** — it only renders.

## Example

```console
$ relay-spec.py list
py-package-skeleton  v1.0.0   Scaffold a well-formed Python package
pytest-green         v1.0.0   Make a pytest suite green

$ relay-spec.py instantiate pytest-green --param tests=tests/unit -o sprint.json
wrote sprint -> sprint.json
```

Then run the produced `sprint.json` the usual way — arm it with `relay-arm` and the hook, or evaluate
a gate step directly with `relay-gate eval --sprint sprint.json --workdir . --state .relay`.

## Shipped starter specs

| id | params | what it gates |
| -- | ------ | ------------- |
| `pytest-green` | `tests` (required), `runner` (default `python3 -m pytest`) | The suite at `${tests}` collects cleanly, then passes in full — without modifying the tests. |
| `py-package-skeleton` | `pkg` (required), `root` (default `.`) | `${pkg}/` exists with an `__init__.py`, `import ${pkg}` succeeds from `${root}`, and a smoke test passes. |

Both ship as a frozen `sprint.json` + `meta.json` and instantiate into deterministic, shlex-safe
controls. "shlex-safe" is enforced by the renderer, not by spec authors hand-quoting: a param value
substituted into a `cmd` field is treated as data and re-quoted with `shlex`, so a value containing a
quote, `;`, `&&`, `$(...)`, or a backtick cannot break out of the control and inject a command into
the gate's `eval`. Use them as-is, or copy one into a new `specs/<id>/` as a starting point for your
own — and rely on the renderer for cmd quoting rather than wrapping `${params}` in single quotes
yourself.


---

## `relay-spec lint` — what a sprint does NOT gate

Compiling `profiles/planning.yaml` onto Relay produced 53 controls and **eleven ungated sub-states**
— every `execute` state. Under MCP those states also advanced on nothing, so the port was honest;
but the claim being made is that a state is *earned*, and a state with no deterministic control is
not. Authoring those controls is the migration's real cost, and the pressure while doing it is to
fill a hole with something that passes.

```sh
relay-spec.py lint sprint.json            # exit 1 on any error
relay-spec.py lint sprint.json --json     # machine-readable findings
relay-spec.py lint sprint.json --allow-ungated   # migration in progress
```

| category | severity | what it means |
|---|---|---|
| `ungated` | error | the state advances on nothing. `--allow-ungated` downgrades it |
| `trivial-control` | error | the command cannot fail (`true`, `exit 0`, `test -e .`) |
| `duplicate-control-id` | error | retry state, keep-best and drift detection all key on the id |
| `unknown-kind` | error | the engine refuses it at run time |
| `inject-without-file` | error | delivers nothing, and the Runner is judged against rules it never got |
| `undeclared-macro` | error | the macro's protocol is never injected |
| `advisory-only` | warn | a non-blocking judge is recorded and stops nothing |
| `self-check-restates-control` | warn | it asks what a control already measures |
| `chain-exceeds-default-cap` | warn | see below |

Two of these are worth their reasoning.

**`inject` and `human` states are not expected to be gated.** An `inject` has no work of its own, so
demanding a control there would train authors to add a trivial one — the lint arguing itself into the
exact failure it exists to catch.

**`chain-exceeds-default-cap` is a warning, not an error, and says so honestly.** This tool runs
offline and cannot see the agent's environment, so it compares against the *documented* default of 8.
The hook's preflight reads the live `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` at run time. The two are not
redundant: the lint catches an unrunnable profile at authoring time, the preflight catches a
misconfigured session at run time.

Only an **error** fails the lint. A migration in progress has to be able to run its own instrument.
