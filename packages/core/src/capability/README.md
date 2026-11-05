# Capability

Canonical integration tools for one Location. This directory registers tools, resolves a bound connection, and runs leaf business functions. It does not settle them.

User-facing Account, Target, and Binding are in the [integrations guide](../../../../docs/guides/integrations.md). Here a saved login is a Connection (`connection/index.ts`): integration, credential, subject, and endpoint. `createTarget` and `bind` record the target and the session binding. `resolve` returns host `Resolution` material; `loadCredential` returns the credential value. Neither may be projected into model output. The factory is Location-scoped. Its management methods are trusted-host boundaries, not model tools.

## Layer map

`CapabilityTools.node` (`tools.ts`) is `makeLocationNode({ name: "capability/tools" })`. It registers canonical leaves once per Location through `Tools.Service.register`. Account resolution and vendor I/O stay first-use. The node composes connections, jobs, artifacts, channels, media, documents, sheets, process control, schedule, catalog discovery, service execution, and `CapabilityMcp.make()`. This note does not describe each family's I/O.

`CapabilityDiscovery.make` (`catalog/discovery.ts`) returns `find`, `describe`, `locate`, and `validateCurrent`. Disclosure action is `service_discover`. A `Selection` is a `CapabilityConnections.Resolution` plus owner and credential. `tools.ts` injects MCP `listTools`, then `CapabilityServiceProviders.filterCatalog`. `CapabilityVendorSchema` (`catalog/schema.ts`) compiles schemas at use, not while the node is constructed. `CapabilityServiceProviders.names` is the leaf-registration set, not an inventory of providers or operations.

`CapabilityServices.make` (`service/index.ts`) builds `service_find`, `service_describe`, `service_call`, and on-demand `platform_${provider}` tools. `service_call` reaches `ToolRegistry.Materialization.settle` through `CapabilityChildren.dispatcher.settle` (`children.ts`).

`CapabilityServiceExecution.make` (`service/execute.ts`) is one platform leaf's business function. It calls `policy.assert`, `connections.resolve`, and `connections.loadCredential`, then `transport.open` with that resolution, owner, and credential. The comment on `make` holds: the registry remains the only tool settlement boundary.

`CapabilityPolicy.make` (`policy.ts`) returns `binding`, `authorize`, `assert`, `commit`, and `commitMany`. `assert` authorizes and discards the permit. The native deny floor is restrict-only. That permission decision is not in the MCP transport.

`ToolRegistry.Materialization.settle` (`tool/registry.ts`) is the settlement entry. `ToolRegistry.captured` is the issuing snapshot. Captured identity is metadata, not an execution grant; callers compare it with `currentRegistrationIdentity`. Settlement is not the permission decision.

## MCP transport is narrower than this directory

"No model tool, executor, permission decision, schema compiler, credential lookup, account selection, or durable replay" is only the `CapabilityMcp.make` contract in [mcp/README.md](./mcp/README.md). It is not a rule for this directory.

`tools.ts` registers tools. `service/execute.ts` executes the leaf and calls `policy.assert`. `policy.ts` authorizes. `ToolRegistry.Materialization.settle` settles.

The caller supplies an approved scoped Connection resolution and its exact credential before MCP `listTools` or `open`. `selection.endpoint` is that Connection's scoped endpoint. Target resource data and credential metadata cannot change the URL or authorization. The transport does not grant authority, select an account, or look up a credential. `CapabilityMcp.make()` in `tools.ts` only builds the host factory. Vendor I/O waits until a leaf opens or lists with the supplied credential.

## Tests

These names are from tracked tests. They are not every security outcome, a provider inventory, a universal sandbox, or a generated map. From the repository root:

```sh
bun run test:ci core test/capability-tools.test.ts test/capability-service-call.test.ts test/capability-mcp-protocol.test.ts
```

- `packages/core/test/capability-tools.test.ts` — `Location capability producer registers canonical leaves and settlement requires real bound accounts`
- `packages/core/test/capability-tools.test.ts` — `Location service discovery uses the real bound-account facade and default platform advertisement stays lazy`
- `packages/core/test/capability-service-call.test.ts` — `canonical JSON/SSE service call binds selected account and persists acknowledged worker outcome`
- `packages/core/test/capability-mcp-protocol.test.ts` — `expired/empty/header-injected credentials, bad endpoints and unknown providers fail before I/O`
