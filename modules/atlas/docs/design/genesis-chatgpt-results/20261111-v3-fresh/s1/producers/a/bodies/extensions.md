# Plugin, integration, MCP and skill lifetimes

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`State.create` rebuilds each materialized value from its initial state and ordered active transforms. It commits only after optional finalization. A semaphore serializes rebuilds and effectful `withRead` consumers. Disposing a scoped transform removes it and rebuilds; `State.batch` collects reloads until the enclosing effect succeeds. This is in-memory materialization, not a durable transaction. [1]

`PluginV2` owns Location-lifetime scopes and per-ID locks. `ensure` preserves an existing activation; install executes the plugin effect inside a child scope, materializes registrations, then publishes `Added`. Failure closes the scope and replays state while preserving combined failure causes. Boot tries one collected flush, then removes and reinstalls the batch one-by-one if that flush fails. Active ancestry detects own load cycles; a live nested request for another loading target fails `PLUGIN_DEPENDENCY_BLOCKED`. Its own comment explicitly rejects interpreting this as a general dependency-cycle proof or outer-batch atomicity. [2]

Integration definitions are scoped State transforms; connection views combine saved credentials in reverse storage order with available environment methods. `active` chooses the first. Resolving an environment connection reads its variable on demand. OAuth attempts live in an in-memory synchronized map with child scopes, expiry and retained terminal status. Successful settlement stores the returned credential and emits connection/registry updates; cancellation/expiry close attempt resources. A pending OAuth attempt is not durable across process loss. Provider-specific OAuth behavior remains delegated to the registered implementation. [3]

The ordinary MCP service merges configuration entries, runtime additions and provided servers. Only global user configuration can trust a project's local commands; a later document wins a server name and decides its origin. An untrusted local server is refused before opening. Connecting increments a generation and disposes the old client/tool scope. A stale asynchronous result closes its new client. Tools are registered individually, so one invalid tool name need not discard others. Each call asserts the namespaced permission, sends cancellation and timeout controls to the SDK, and maps protocol errors to tool failures. Connected status follows tool registration; client close removes registrations. [4]

Skill discovery loads registered sources with later sources winning names, while reserved bundled names prevent shadowing by another source. It logs malformed/ignored sources and caches by source key. Save/remove invalidate a generation so a stale in-flight list cannot repopulate that cache. Available skills filter the selected agent's denied skills and hide nested leaves behind their parent. `AgentV2` selects a configured selectable default, otherwise selectable Maestro; it never silently chooses an arbitrary remaining agent. Unknown agents receive a deny-all permission set through `withPermissions`. [5,6]

## Normative intent and gaps

The plugin README separates provider plugins from plugin-host mechanics and treats SDK export shims as generated host artifacts. This body establishes the scoped registration boundary; individual provider plugins, shim admission, remote SDKs and OAuth implementations require their own source when changing those mechanisms. MCP tool content and skill text do not become permission authority merely by being registered. Nothing here proves that live servers, credentials or plugin packages are currently available. No connection, OAuth flow, plugin installation or product test was executed. [7]

## Source anchors

- **1.** `packages/core/src/state.ts:116e268bb9edf045985e1598a4e1a3ed1d410872` — batch and scoped state materialization, lines 33–40,63–130.
- **2.** `packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — activation, rollback, boot and wait, lines 23–55,69–164,167–242.
- **3.** `packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — connection projection and OAuth attempt ownership, lines 140–202,231–418,445–535.
- **4.** `packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b` — configuration trust, scoped registry and connection generations, lines 161–193,204–330.
- **5.** `packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0` — availability, source loading, reserved names and cache generation, lines 31–74,95–219.
- **6.** `packages/core/src/agent.ts:53870dcf9d34423ab49a1241e88ec5c5db0985cf` — selection and current permissions, lines 69–101.
- **7.** `packages/core/src/plugin/README.md:24afcfd763b3a57d9de07ee4ccbe4691094be044` — plugin-host/provider source boundaries, lines 1–38.
