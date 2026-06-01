# Roadmap R3 — Executable-spec library

**Owns (disjoint):** `bin/relay-spec.py`, `specs/` (the catalog), `tests/test_spec.py`,
`docs/spec-library.md`. Nothing else.
**Frozen contract:** a *spec* is a versioned, reusable `sprint.json` (SPEC §3 schema) plus a `meta.json`
(`{id, title, description, version, params?}`). `relay-spec.py instantiate` materializes a spec into a
runnable `sprint.json`, substituting `${param}` placeholders. Output consumed unchanged by the hook /
`bin/relay-gate`. Author-once-ratchet-many: the auto-decomposer (`bin/relay-autodecompose.py`) is the
first author of these; R3 is the *catalog + instantiation* layer.

`bin/relay-spec.py` (pure stdlib):
- `list` — catalog of specs under `specs/` (id, title, version).
- `show <id>` — the spec's meta + WP titles + param list.
- `instantiate <id> [--param k=v ...] [-o sprint.json]` — render the spec, substituting `${k}` in
  instructions/cmds, validate all params supplied (error listing any missing), emit valid sprint.json.

`specs/` — ship 2 REAL starter specs (each a frozen sprint.json + meta.json), e.g.:
- `pytest-green/` — a generic "make the suite pass" spec parameterized on the test path,
- `py-package-skeleton/` — gates for a well-formed Python package (has `__init__`, importable, a smoke
  test passes). Make controls deterministic + shlex-safe.

**Tests:** real `bin/relay-spec.py` via subprocess. Assert: list/show, instantiate substitutes params,
missing-param errors clearly, the rendered sprint is schema-valid for the hook (work_packages[].id +
checklist[].{id,cmd}). Tmp-isolated.
