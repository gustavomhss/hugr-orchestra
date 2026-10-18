# Policy bundle contracts

Audience: agents. Status: current.

Procedure: [relay-policies skill](skills/relay-policies/SKILL.md).
Sources: [preprocessor](../bin/relay-policy.py), [bundles](../policies), [gate core](../lib/relay-gate.sh).
Evidence: [policy tests](../tests/test_policy.py), [lint tests](../tests/test_spec_lint.py).

## Input and merge

A bundle is a JSON list or `{"controls":[...]}`. Each control needs an `id` and a truthy `cmd` or `judge`.
When present, `cmd` must be a string; deterministic exit 0 passes and nonzero fails. Judge verdicts are
non-independent and advisory unless `blocking:true`. Bundle commands are trusted executable input.

`relay-policy.py apply` is explicit preprocessing into an ordinary sprint:

| Rule | Current behavior |
|---|---|
| Placement | Prepend bundle union to every WP; absent/null checklist becomes a list |
| Bundle collision | First bundle naming an ID wins |
| WP collision | Organization control replaces matching WP control |
| Provenance | Injected `.policy` is bundle filename stem; kept WP `.policy` is removed |
| Ledger origin | Explicit `.origin`, else `policy:<bundle>`, else `sprint` |

The tool is not mandatory installed enforcement. A harness must run preprocessing and select its output.
Shape validation does not authenticate a bundle, sandbox commands, or fully validate retained WP controls.
`list` can report `INVALID` or an empty directory while exiting 0; inspect its output.

## Current ID mismatch

Applying one bundle to multiple WPs repeats its control IDs across those WPs. Current
[`relay-spec.py lint`](../bin/relay-spec.py) flags `duplicate-control-id` as an error.
Policy preprocessing and lint therefore do not agree on a globally valid merged plan. IDs also key
keep-best and drift/control reports; reachable-sprint audit comparison rejects duplicate checklist IDs
as `SPRINT-INVALID` (exit 2). Resolve the plan with its owner before claiming validated coverage.

## Starter scope

| Bundle | Reach and dependencies |
|---|---|
| `no-debug-prints` | Git pattern scan of tracked content for `console.log(`, `print(`, `dbg!(`; excludes `*test*`, `*spec*`, `*.md` |
| `no-loosened-tests` | Git pattern scan for `.skip(`, `.only(`, `xfail`, `pytest.mark.skip`, `# *type: *ignore`, `@ *unittest.skip`; pathspecs `test*`, `tests`, `spec*`, excluding `*relay*` |
| `coverage-floor` | pytest-cov run plus coverage report, embedded `RELAY_COV_MIN=80`; adapt floor and runner deliberately |

Git preconditions reject non-Git workdirs or unavailable Git. After preflight, both Git detectors interpret
the search status directly, rather than treating empty output as success:

| `git grep` exit | Control result |
|---|---|
| 0: match found | FAIL (control exit 1) |
| 1: no match | PASS (control exit 0) |
| Any other status: search/tool error | FAIL (control exit 1) |

This status handling also applies when Git disappears after preflight. It preserves the pattern/path scope:
untracked files and excluded paths are not inspected. These are text scans, not AST analysis or proof against
arbitrary debug behavior or every way to weaken tests. A no-match result can cover an empty selected scope.

Coverage command uses tooling and reported output; it does not reject skips or establish that expected tests
were collected and executed. Stronger coverage claims require distinct collection/execution, skip, and tool-success
evidence. `RELAY_COV_MIN=80` is assigned inside the command, not taken from an environment override. Run known
clean/violating controls and search/tool-error probes when adapting commands; the coverage starter does not
provide collection or no-skips guarantees.
