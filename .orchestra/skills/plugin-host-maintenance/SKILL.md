---
name: plugin-host-maintenance
description: Ownership boundaries for Core plugin activation and the runtime host contribution API. Use when changing packages/core/src/plugin.ts, plugin/host.ts, plugin loading/reload behavior, or runtime-versus-config ownership.
---

# Plugin host maintenance

## Ownership map

| Surface | Owner | Boundary |
| --- | --- | --- |
| Activation lifecycle | `packages/core/src/plugin.ts` | Location-scoped install, boot, remove, wait, scopes and state reload settling. |
| Runtime contribution API | `packages/core/src/plugin/host.ts` | Adapts plugin callbacks to Core service APIs. |
| Plugin declaration/config | config and plugin schema modules | Inputs and installed definitions, not live activation ownership. |
| Plugin implementation | `@orchestra/plugin/v2/effect` | Runtime contract consumed by Core, not Core lifecycle policy. |

`PluginV2` owns activation scopes and publishes lifecycle events. `PluginHost.make` exposes selected service contributions (agents, catalog, commands, integrations, skills, references and AI SDK hooks); it does not make every config field a runtime contribution. Keep configuration parsing/install separate from runtime activation and host callbacks. Plugin code runs within the activation scope; review callback effects and reload consequences at the host boundary.

The current activation policy uses per-plugin locks and loading ancestry. Its documented dependency-blocked behavior is conservative, not a general wait-for graph or cycle proof. Boot batches reloads, but does not promise outer-batch atomicity; preserve the explicit rollback/flush behavior rather than broadening guarantees.

## Safe changes

- Identify whether a change belongs to config installation, host contribution, or activation lifecycle before editing.
- Preserve child scope close and reload settling on replacement/removal and failure paths.
- When adding a host contribution, verify the service dependency is acquired in `PluginHost.make` and the callback surface is intentional; avoid bypassing the stable host API.
- Keep claims about plugin trust, load order, or dependency cycles limited to what the code implements.
- Existing lifecycle witness: `packages/core/test/plugin.test.ts`. Config install/parse witnesses include `config/plugin-file.test.ts` and `config/plugin.test.ts`; choose based on changed surface. These are pointers only, not execution claims.
- Review that edits stay repo/runtime-owner scoped; do not change root `AGENTS.md` as part of plugin maintenance.

## Source trail

- `packages/core/src/plugin.ts` — activation contract, scope, locks, boot and reload lifecycle.
- `packages/core/src/plugin/host.ts` — concrete runtime contributions and service adapters.
- `packages/core/test/plugin.test.ts` — Core plugin behavior witness.
- `packages/core/test/config/plugin-file.test.ts` — config installation boundary.
- `packages/plugin` — plugin runtime contract; inspect its README/source when changing that contract.
