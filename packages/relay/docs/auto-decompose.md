# Draft a sprint from pytest controls

Audience: agents. Status: current.

Load [relay-autodecompose](skills/relay-autodecompose/SKILL.md).
`bin/relay-autodecompose.py` collects pytest node IDs and emits a checklist
draft. It does not prove test success, control fidelity, or complete requirements.

## Invoke

```sh
python3 bin/relay-autodecompose.py /path/to/repo --tests tests \
  --runner "python3 -m pytest" --per-wp-cap 12 --retry-budget 3 \
  --brief "Repair implementation against existing acceptance tests" \
  -o /path/to/draft-sprint.json
```

The runner executes in the target repo. Omit `-o` for JSON on stdout; output
diagnostics and collection warnings go to stderr. `--tests` restricts collection;
omitting it uses pytest's default discovery. Use a simple runner command: the
collector splits `--runner` on whitespace, not shell quoting.

## Generated contract

1. Run `<runner> --collect-only -q [tests-path]`. Test bodies are not run;
   collection can still import modules and execute collection hooks.
2. Keep stdout lines containing `.py::`, excluding lines starting `=` or `ERROR`.
   Group by file and sort filenames; within a file, retain collected order.
3. Split files into chunks at `--per-wp-cap` (default `12` tests per chunk;
   `0` disables splitting). Use nonnegative values.
4. Add one named `cmd` per node ID and one whole-chunk rollup command. The cap
   counts tests, so each checklist also includes that extra rollup.
5. Emit `brief`, `retry_budget`, and WPs with `id`, `title`, `instructions`, and
   `checklist`. Instructions are explicitly marked `DRAFT`.

```json
{"id": "test_feature", "assert": "tests/test_feature.py::test_feature passes",
 "cmd": "python3 -m pytest tests/test_feature.py::test_feature -q"}
```

Node IDs in generated commands use `shlex.quote`. Collection parsing is an
output filter, not a general pytest schema parser or sprint validator.

## Review before dispatch

- **Partial collection:** no node IDs causes failure. If IDs exist but pytest
  exits outside `0`/`5`, the tool warns and still emits a draft. Investigate
  collection errors and compare expected tests with output before accepting it;
  successful tool exit does not prove collection was complete.
- **ID collisions:** `item_id()` removes the file prefix and sanitizes only the
  node-ID tail. Same test names across files, or distinct parameter spellings
  that sanitize alike, can collide. Rename control IDs to be unique across the
  sprint; keep each original node ID in its assertion/command. IDs drive audit
  maps, accepted-control lookup, and drift checks.
- **Task scope:** replace draft instructions, order dependencies, and split or
  merge packages by actual work. Filename order is not dependency analysis.
- **Coverage:** inspect skips, fixture/environment needs, missing requirements,
  and vacuous assertions. Keep independent acceptance tests protected from the
  implementation author. A collected test is not evidence that its gate can fail.
- **Cost:** per-test checks plus rollups run overlapping tests, and later gates
  rerun prior deterministic controls. Size packages for the real tools and
  harness block budget.

Bind the reviewed draft through [per-agent arms](per-agent-arms.md) or
[gate CLI](sdk.md). The author still seeds first-state instructions and base ref;
the collector does neither. Prefer named checklist controls over historical
typed `dod` entries.

Authorities: [collector and drafter](../bin/relay-autodecompose.py),
[drafting tests](../tests/test_autodecompose.py),
[shared checklist core](../lib/relay-gate.sh).
