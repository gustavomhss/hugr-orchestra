---
name: maestro-orchestra-start-architecture
description: How Orchestra's packages fit together and in which direction they may depend on each other.
internal: true
when: The owner asks how the code is organised, what core, server, protocol, schema, client or the SDK do, where data is stored, or how plugins and confined code execution work.
not-when: The question is which app to use (open orchestra) or how a seat or tool behaves.
covers: [packages/core, packages/server, packages/protocol, packages/schema, packages/client, packages/sdk-next, packages/effect-drizzle-sqlite, packages/effect-sqlite-node, packages/plugin, packages/script, packages/codemode]
---

# Architecture

Orchestra is TypeScript on Effect, run with Bun. Every package and module is assigned to one of 14 layers,
and an import against that direction is refused.

## Dependency direction

- Runtime dependencies run Schema, then Core and Protocol, then Server.
- Core never imports Client or Server. Server implements the Protocol that Client calls.
- Client may depend on Schema and Protocol, never on Core or Server. Its root has no Effect or runtime code.
- `packages/sdk-next` is the only place that composes Client with Core and Server.
- Product modules (`modules/maestro`, `modules/relay`, `modules/continuity`, engine adapters) reach the server only
  through `Host.Contribution` values from `packages/core/src/host.ts`; `Host.merge` rejects a contribution that
  would own the session execution, session, location map or scheduled-task nodes, so each process has one coordinator.
- The client code generated from the public Protocol and Server HttpApi is never edited by hand.
- Child processes start only through the spawn layer in core (omni); a check fails on other spawn imports.

## Sessions in one paragraph

A prompt becomes a durable `session_input` row, then an advisory wake runs a per-session serialized runner that
promotes inputs at safe boundaries. Each provider turn is one model call with history reloaded from the store.

## `packages/core`
Platform and domain services: V2 session admission, storage and local execution, locations, providers, tools,
configuration, plugin loading, the System Context registry, the agent terminal and the SQLite database with its
migrations (backed up before each migration; three newest kept). No bare export; every subpath is an explicit key.

## `packages/server`
Adapts the Protocol API to Effect HTTP. Handlers (`src/handlers/`, about 50 groups) translate requests and delegate
to Core. `createRoutes()` serves standalone (Basic Auth when a password is set); `createEmbeddedRoutes()` serves
in memory for the SDK.

## `packages/protocol`
The public Effect `HttpApi` contract under `/api`: route schemas, errors and middleware requirements, one file per
group in `src/groups/`. It declares routes and implements none.

## `packages/schema`
Browser-safe wire and storage contracts and stable identity schemas. Its only runtime dependency is `effect`.
Each contract and ID is defined once.

## `packages/client`
Network client generated from the Protocol. `@orchestra/client` is a Promise client over `fetch`;
`@orchestra/client/effect` is the Effect client. Used by app-shell, the CLI, the TUI and plugins.

## `packages/sdk-next`
Effect-native in-process host for embedding: composes Client, Core and Server and runs the router in memory with no
listener. Nothing else in the workspace imports it yet.

## `packages/effect-drizzle-sqlite`
Lets Drizzle SQLite queries run as Effects. It opens no database; the host supplies a SQLite client. Core is its
only user, for the Orchestra database.

## `packages/effect-sqlite-node`
An Effect SQLite client over `node:sqlite`. Nothing imports it; core opens its Node database through its own
`database/sqlite.node.ts`.

## `packages/plugin`
Authoring contracts for plugins: the `tool()` helper, TUI plugin types and V2 server plugins (`define`, Effect or
Promise form). Hosts own loading. Core's external plugin loader accepts only V2 modules; `Hooks` has one member,
`tool`.

## `packages/script`
Build, CI and repository tooling library: release channel and version, workspace and module resolution, shared
native-binary build steps, the spawn-import scanner. Used by the CLI and desktop builds. Not a runtime package.

## `packages/codemode`
Confined code execution: a model writes a small JavaScript program that can call only supplied schema-described
tools, with no filesystem, process, network or module access, interpreted without `eval`. No package imports it yet.

## Storage and safety
State lives in a local SQLite database. Provider, integration and MCP credentials are encrypted with AES-256-GCM
under a key in the system credential store. Specialist seats run in an OS sandbox (macOS Seatbelt, Linux
bubblewrap, Windows AppContainer through omni) and the command is refused when the sandbox cannot be applied.
