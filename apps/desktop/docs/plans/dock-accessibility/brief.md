# App Dock Linux accessibility — planning brief

Status: research wave completed; this document records the original assignments, not shipped behavior. Final design supersedes provisional assumptions below: see [plan.md](plan.md) and [contract.md](contract.md).
Date: 2026-09-30.
Baseline: `5e4bea3b519c04cebfb787e98dfa171f5771d25c` (`feat/app-dock-mcp`).
Lead branch/worktree: `dock-accessibility`, `/Users/gustavoschneiter/Documents/HuGR/_worktrees/dock-accessibility`.
The other session owns the Linux runtime in `dock-runtime`. The accessibility effort is separately owned.

## User requirements

- Expose the semantic interface of real Linux desktop apps through App Dock's MCP tools.
- Operate supported controls through textual references and advertised native actions.
- Cover GTK, Qt, and Chromium/Electron via the Linux accessibility infrastructure, subject to real-app proof.
- Preserve the low-overhead goal: bounded snapshots, bounded resources, and measured costs.
- Reuse existing components; keep a small bridge rather than a new application platform.
- Work in independent branches/worktrees and maximize useful parallelism.
- This assignment is comprehensive planning. Research and documentation precede implementation.

## Original architectural starting point investigated

1. Existing Dock MCP/RPC remains the model-facing entrypoint.
2. A small helper runs inside the guest's accessibility session, using AT-SPI2 over D-Bus.
3. Provisional implementation choice: system Python 3 + PyGObject `Atspi`/GLib, with distro-provided dependencies.
4. Provisional transport: versioned JSON Lines over a runtime-provided bidirectional process channel.
5. The runtime provides app/window ownership and launch lifecycle; the helper supplies semantic observations/actions.
6. Query the target app/window, advertise available actions, and reject stale references rather than retargeting them.
7. Xpra supplies the user's visual interface. The semantic bridge observes the guest application itself.
8. On-demand bounded reads come first; events invalidate cached observations rather than streaming entire trees to models.

Researchers must challenge these assumptions with primary-source evidence. They do not freeze interfaces or choose architecture.

## Research wave P1

GO: parallel, read-only; each assignment has its own branch/worktree.
Shared writable files: none. The lead alone writes the final plan and contracts.
Dependencies between research assignments: none; conclusions feed a single lead-owned contract decision.
Model: available general/explore agent; bounded return cards, not whole transcripts.

| ID | Research domain | Starting sources | Required result |
| --- | --- | --- | --- |
| R1 | Existing Dock MCP/RPC and package boundaries | desktop `app-dock-api.ts`, `app-dock-rpc.ts`, browser helpers, orchestra plugin, App Dock corpus | Exact integration seams, compatibility obligations, proposed file ownership map |
| R2 | Native reads and actions | AT-SPI Accessible/Action/Text/EditableText/Selection/Component and GTK/Qt/Chromium primary docs | Available operations, identity/lifetime facts, semantic limitations, prerequisites for a real proof |
| R3 | Guest deployment/session and runtime handoff | AT-SPI/D-Bus setup, distro packages, toolkit enablement, current desktop packaging | Minimal dependencies and session requirements, transport/lifecycle obligations, unresolved runtime inputs |
| R4 | Functional proof and regression strategy | Existing desktop/orchestra harnesses; primary docs for GTK/Qt/Chromium apps | Real-app test matrix, observable side effects, negative controls, package-local commands and CI reach |
| R5 | Bounded reads/events/performance | AT-SPI cache/collection/events, GTK/Qt/Chromium accessibility behavior | Bounded-work design evidence, profiling protocol, failure controls, costs that require measurement |

Acceptance of every research card: file:line or primary URL plus relevant exact clause; distinguish documented support from measured behavior; name blockers; answer what the framing missed.
Stop line: return the compact research card. No implementation, installs, running apps/tests/benchmarks, commits, pushes, PRs, or merges.

## Consolidation and review

The lead will produce architecture, runtime contract, work-package ownership/dependency graph, concrete acceptance cases, and a measured-performance validation plan.
Implementation waves will be bounded by frozen interfaces and disjoint file ownership. Shared registries/manifests/integration sites are lead-owned serial work.
An independent cold review will inspect the completed plan for executable scope, compatibility, and accidental coupling with the runtime effort.
