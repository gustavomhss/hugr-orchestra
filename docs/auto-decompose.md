# Auto-decomposition — draft a sprint from your existing tests

Hand-writing a checklist of 100+ Definition-of-Done controls is the single biggest authoring tax in
Relay. But a repo that already has a test suite has **already encoded its DoD**: every test is a
named, deterministic control. `bin/relay-autodecompose.py` harvests that suite and drafts the gates —
turning *authoring* into *editing*.

```
bin/relay-autodecompose.py <repo-dir> [--tests PATH] [--runner "python3 -m pytest"] \
                           [--per-wp-cap N] [--brief "..."] [-o sprint.json]
```

## What it does

1. **Collects** the suite with `pytest --collect-only -q` — *no tests are run*, only their structure
   is read.
2. **Groups** test nodeids by their test file — each file becomes one Work Package (the natural
   concern boundary). A file with more than `--per-wp-cap` tests (default 12) is split into several
   WPs so no single gate is unwieldy. Order is by filename, so the draft is reproducible.
3. **Drafts** each WP's `checklist`: one named deterministic control per test
   (`id` = the test name, `cmd` = `pytest <nodeid>`), plus a WP-level "suite green" rollup. These are
   exactly the on-disk control format the Relay hook and [SPEC §4.1](../SPEC.md) consume.
4. **Emits** a valid `sprint.json` to stdout (or `-o`).

It does **not** run or judge the tests — it reads structure only. A green suite today becomes a gate
that holds the agent to that same green tomorrow.

## The draft is a starting point

The output is a *draft*, not a finished spec. The lead is expected to:
- rewrite each WP's `instructions` (the auto text just says "make these pass"),
- split or merge WPs where the file boundary isn't the right concern boundary,
- add semantic `judge` controls for criteria a script can't decide (a privacy notice's adequacy, an
  API's ergonomics), and
- drop controls that test the tests rather than the work.

Authoring 100 DoDs by hand → editing a generated 100. That is the adoption lever.

## Example (dogfooding Relay's own suite)

```
$ bin/relay-autodecompose.py . --tests tests/test_relay.py -o sprint.json
[relay-autodecompose] 2 WPs, 22 controls -> sprint.json
```

The 20-test suite becomes 2 work packages (split at the cap) of named controls, e.g.:

```jsonc
{ "id": "test_keyed_wrong_key_fails",
  "assert": "tests/test_relay.py::test_keyed_wrong_key_fails passes",
  "cmd": "python3 -m pytest 'tests/test_relay.py::test_keyed_wrong_key_fails' -q" }
```

Drop that `sprint.json` into a run (or bind it to an agent with the `relay-arm` MCP tool) and the
Relay hook drives the agent through it WP by WP — every control logged on the verified-trace ledger.

## See also

- [per-agent-arms.md](per-agent-arms.md) — bind a drafted chain to a specific spawned agent.
- [authoring-sprints.md](authoring-sprints.md) — writing/refining `sprint.json` by hand.
- [gates.md](gates.md) — the full DoD / checklist control vocabulary.
