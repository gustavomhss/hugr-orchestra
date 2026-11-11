# Source paths after the package split

Historical plans, research reports and qualification records keep the source paths and revisions they inspected. A path under the removed `packages/orchestra` monolith is a historical citation, not an instruction to recreate that package. Preserve those recorded anchors when changing the surrounding document.

For current implementation, start with the owning package below and search for the symbol. There is no single replacement for the old monolith, and old line numbers do not identify the current implementation.

| Area | Current source and maintenance entry |
| --- | --- |
| Session execution, tools, permissions, configuration and storage | [Core](../../packages/core/README.md), `packages/core/src/` |
| HTTP handlers and middleware | [Server](../../packages/server/README.md), `packages/server/src/` |
| Public HTTP contracts | [Protocol](../../packages/protocol/README.md), `packages/protocol/src/groups/` |
| Command-line entry and commands | [CLI](../../apps/cli/README.md), `apps/cli/src/commands/handlers/` |
| Desktop main process, preload and renderer | [Desktop](../../apps/desktop/README.md), `apps/desktop/src/` |
| App views and client state | `packages/app-shell/src/` |
| Maestro and native seats | [Coordination](../../modules/maestro/coordination/README.md), `modules/maestro/coordination/src/` |
| Claude execution host | `modules/engine-adapters/claude-code/` |
| Atlas, formerly `foundation/atlas` | [Atlas](../../modules/atlas/README.md), `modules/atlas/` |
| Embedded browser and workspace | [App dock](../../modules/app-dock/README.md), `modules/app-dock/` |
| Backend and planning specialist skills | `modules/specialists/backend/skills/`, `modules/specialists/archie/skills/` |
| Native process infrastructure | `native/omni/` |

These are current navigation entries, not retrospective verification of a historical result. A test file, source reference or newer implementation does not replace the run receipt and SHA recorded by a qualification document.

Historical [Omni handoff](../../native/omni/HANDOFF.md), [Omni integration plan](../../native/omni/docs/ux/WP10-orchestra-integration.md), [migration reference](../../native/omni/skills/omni-migrate/references/orchestra.md) and [Nix readiness record](../../nix/W5-readiness.md) also retain their original pre-split source citations. Use the current owners above when navigating their implementation; the original records remain unchanged.
