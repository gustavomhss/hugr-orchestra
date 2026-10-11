---
name: relay-authoring
description: Maintains the Relay authoring service and its versioned API when agents change bin/relay-api or lib/relay_authoring.
---

# Relay authoring service

## Trigger

Use for `bin/relay-api`, `lib/relay_authoring/`, workflow and hook documents, sprint compilation,
publication, scopes, skill bindings and uploads, execution receipts or the `api/v1` contract.

## Read first

- [Authoring API](../../../docs/authoring-api.md) and [SPEC §7](../../../SPEC.md#7-authoring-service-and-host-boundary).
- [Application](../../../lib/relay_authoring/application.py), [HTTP host](../../../lib/relay_authoring/server.py),
  [graph compiler](../../../lib/relay_authoring/graph.py), [hooks](../../../lib/relay_authoring/hooks.py),
  [runner](../../../lib/relay_authoring/runs.py), [store](../../../lib/relay_authoring/store.py).
- [Daemon](../relay-daemon/SKILL.md) and [integration](../relay-integration/SKILL.md) before runtime claims.

## Ownership

Own `bin/relay-api`, `lib/relay_authoring/`, `tests/test_authoring.py` and `tests/test_authoring_hooks.py`.
The lead owns shared catalogs. The Orchestra host owns supervision, proxying, authentication and screens.

## Contracts

- The API is versioned under `<base>api/v1/`; the base path is configurable and confined.
  Refuse unexpected `Host` and `Origin` values. Identity comes from host configuration, not authentication.
- SQLite rows are workspace-scoped. Saves return a real checksum and active version; stale version or
  checksum fails with 409 unless the caller forces the save. Saving never publishes.
- Drafts may be incomplete and carry diagnostics; publication and evaluation compile first.
  Refuse malformed shapes before persistence.
- Edges define one flat WP chain. The start node holds objective and retry budget, stays outside
  phases and is never a WP. Phases are contiguous; refuse interleaving rather than regroup it.
- Preserve exact IDs, control bytes and unknown sprint fields. Refuse cycles, branches, duplicate
  criterion IDs and node types without a Relay implementation.
- One skill per WP; replacement keeps authored instructions. Executions keep effective bytes' digests.
- Hooks export `relay.hook.v1` with `installed: false`; resolve catalog defaults without mutating
  authored parameters. Installing and running hooks is host work and is not simulated here.
- Evaluate through the original daemon. A destination evaluates a prefix. Retry reuses the frozen
  snapshot, state and budget, only for the latest failed attempt, and never after escalation in the run.
- A restart marks in-flight receipts crashed. Never report cancellation, dispatch or release.

## Procedure

1. Claim exact files through [ownership](../relay-ownership/SKILL.md).
2. Select consumers and checks through [blast radius](../relay-blast-radius/SKILL.md).
3. Run the service against an isolated workspace and data directory.
4. Update the API doc and SPEC §7 with any contract change; keep product copy in English.

## Checks

From `packages/relay`; in the Orchestra monorepo run them through `bun run test:ci relay <files>`:

```sh
python3 -m pytest tests/test_authoring.py tests/test_authoring_hooks.py -q
python3 bin/check-docs.py
python3 bin/gen-doc-index.py --check
```

## Cold review

Require author != reviewer in a fresh context. Freeze the source list and hashes. The reviewer checks
compilation against the daemon's sprint contract, persistence and conflicts, retry snapshots and budgets,
workspace isolation and host/origin refusal against the named tests. Return APPROVE, FIX-FIRST or REJECT
with evidence; fix findings and repeat against a new freeze.

## Failure handling

- Daemon error, busy run or unavailable judge: keep the failure; never report success without a passing outcome.
- Dropped event stream: reload resources; events have no replay.
- Crashed receipt: inspect the ledger; never rerun commands silently.

## Done

Return changed paths, check results and the independent verdict. Name host work that remains.
