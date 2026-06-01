# Roadmap R2 — Org guardrail policy bundles

**Owns (disjoint):** `bin/relay-policy.py`, `policies/` (bundle library), `tests/test_policy.py`,
`docs/guardrails.md`. Nothing else.
**Frozen contract:** a *policy bundle* is a JSON file = a list of checklist controls in the EXACT shape
the relay hook + SPEC §4.1 consume: `{id, assert, cmd}` (deterministic) or `{id, assert, judge,
blocking?}`. `relay-policy.py merge` produces a `sprint.json` (or injects into an existing one) by
PREPENDING the bundle's controls to every work package — so org-mandated DoD is enforced on every WP.
Output is consumed unchanged by `bin/relay-arm-hook.sh` / `bin/relay-gate`.

The arm hook is the enforcement mechanism (built); R2 is the *policy layer* on top.

`bin/relay-policy.py` (pure stdlib):
- `apply --bundle <b.json>... --sprint <in.json> [-o out.json]` — prepend the union of the named
  bundles' controls to each WP's `checklist` (dedupe by control id; org controls win). Validates each
  control has a `cmd` or `judge` (reject otherwise). Stamp a `policy` field on each injected control so
  the ledger/audit can tell org-mandated from WP-specific.
- `list` — list available bundles under `policies/` with their control counts.

`policies/` — ship 2-3 REAL starter bundles as JSON, each control a genuine deterministic check:
- `no-debug-prints.json` (grep_absent-style: no `console.log`/`print(`/`dbg!` left in source),
- `no-loosened-tests.json` (no `.skip`/`xfail`/`# type: ignore`/`@pytest.mark.skip` added),
- `coverage-floor.json` (a `cmd` asserting a coverage threshold — make it parametric/commented).
Keep `cmd`s POSIX-sh and inert (shlex-safe; no injection surface).

**Tests:** real `bin/relay-policy.py` via subprocess. Assert: apply prepends to every WP, dedupe by id,
reject control with neither cmd nor judge, the merged sprint is schema-valid for the hook, `list` works.
Tmp-isolated.
