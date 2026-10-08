---
name: relay-authoring
description: Routes native Orchestra authoring maintenance and retained Python authoring regression evidence.
---

# Relay authoring maintenance

## Trigger

Use for native workflow/hook authoring, publication, scopes and skill binding, or retained
`lib/relay_authoring/` regression modules. The former Python `api/v1` host is test-only.

## Read first

- [Authoring API](../../../docs/authoring-api.md) and [SPEC §7](../../../SPEC.md#7-authoring-service-and-host-boundary).
- From the Orchestra root: `packages/server/src/handlers/relay-document.ts`, `relay-hook.ts`,
  `packages/server/src/relay-documents.ts`, and `packages/app/src/orchestra/relay/client.ts`.
- [Application](../../../lib/relay_authoring/application.py), [HTTP host](../../../lib/relay_authoring/server.py),
  [graph compiler](../../../lib/relay_authoring/graph.py), [hooks](../../../lib/relay_authoring/hooks.py),
  [runner](../../../lib/relay_authoring/runs.py), [store](../../../lib/relay_authoring/store.py).
- [Daemon](../relay-daemon/SKILL.md) and [integration](../relay-integration/SKILL.md) before runtime claims.

## Ownership

The Relay catalog owns retained `lib/relay_authoring/`, `tests/test_authoring.py` and
`tests/test_authoring_hooks.py`; it inventories Python/shell sources, not native TypeScript.
Native contracts belong to Schema/Protocol, native compilation/storage to Relay, handlers to Server,
and screens to App. The lead owns shared catalogs. The Python authoring launch pair is retired.

## Installed contracts

- Installed screens call native Server `HttpApi` through generated Client; no Python sidecar starts.
- `RelayDocumentHandler`, `RelayPublishHandler` and `RelayHookHandler` are registered in
  `packages/server/src/handlers.ts`; see the authoring API routing table for their exact source paths.
- `RelayDocuments` uses native graph/hook/store and Location-scoped `SkillV2`, with SQLite under
  `<Global.data>/relay/<projectID>/authoring.sqlite3`.
- Native updates require a version/checksum guard or explicit force; publishing compiles first.
- Public document checks return 403 `maestro-execution-required`. Maestro owns executable checks.
- Native hook installs pin the published snapshot through `RelayHookInstall`; export alone does not install.
- Missing native profile tools remain unavailable; standalone Python tools are separately owned.

## Retained regression contracts

The following describe only the directly imported Python test service, not installed routing:

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
3. Trace installed callers through App, Client, Protocol and Server. For Python regression changes,
   preserve direct test imports, isolated workspace/data state and every frozen ORACLE source byte.
4. Update the API doc and SPEC §7 with any contract change; keep product copy in English.

## Checks

Run tests from the Orchestra root through CI; structural commands run from `packages/relay`:

```sh
bun run test:ci relay tests/test_docs.py tests/test_authoring.py tests/test_authoring_hooks.py --os both
python3 bin/check-docs.py
python3 bin/gen-doc-index.py --check
```

## Cold review

Require author != reviewer in a fresh context. Freeze the source list and hashes. The reviewer checks
native handler registration and App/Client routing; retained tests cover Python compilation against
the daemon, persistence/conflicts, retry budgets and host/origin refusal. Return APPROVE, FIX-FIRST or REJECT
with evidence; fix findings and repeat against a new freeze.

## Failure handling

- Daemon error, busy run or unavailable judge: keep the failure; never report success without a passing outcome.
- Dropped event stream: reload resources; events have no replay.
- Crashed receipt: inspect the ledger; never rerun commands silently.

## Done

Return changed paths, check results and the independent verdict. Name host work that remains.
