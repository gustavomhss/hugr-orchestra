#!/usr/bin/env bun

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { Database } from "@orchestra/core/database/database"
import { Effect } from "effect"
import { CliOutput } from "effect/unstable/cli"
import { Commands } from "./commands/commands"
import { Runtime } from "./framework/runtime"
import { Daemon } from "./services/daemon"

const Handlers = Runtime.handlers(Commands, {
  $: () => import("./commands/handlers/default"),
  api: () => import("./commands/handlers/api"),
  debug: {
    agents: () => import("./commands/handlers/debug/agents"),
    symbols: () => import("./commands/handlers/debug/symbols"),
  },
  session: {
    list: () => import("./commands/handlers/session/list"),
    delete: () => import("./commands/handlers/session/delete"),
  },
  models: () => import("./commands/handlers/models"),
  upgrade: () => import("./commands/handlers/upgrade"),
  uninstall: () => import("./commands/handlers/uninstall"),
  pr: () => import("./commands/handlers/pr"),
  db: {
    query: () => import("./commands/handlers/db/query"),
    path: () => import("./commands/handlers/db/path"),
    compact: () => import("./commands/handlers/db/compact"),
  },
  export: () => import("./commands/handlers/export"),
  import: () => import("./commands/handlers/import"),
  migrate: () => import("./commands/handlers/migrate"),
  service: {
    start: () => import("./commands/handlers/service/start"),
    restart: () => import("./commands/handlers/service/restart"),
    status: () => import("./commands/handlers/service/status"),
    stop: () => import("./commands/handlers/service/stop"),
    password: () => import("./commands/handlers/service/password"),
  },
  serve: () => import("./commands/handlers/serve"),
  run: () => import("./commands/handlers/run"),
  attach: () => import("./commands/handlers/attach"),
  stats: () => import("./commands/handlers/stats"),
  agent: {
    list: () => import("./commands/handlers/agent/list"),
    create: () => import("./commands/handlers/agent/create"),
  },
  mcp: {
    list: () => import("./commands/handlers/mcp/list"),
    add: () => import("./commands/handlers/mcp/add"),
    auth: {
      $: () => import("./commands/handlers/mcp/auth"),
      list: () => import("./commands/handlers/mcp/auth-list"),
    },
    logout: () => import("./commands/handlers/mcp/logout"),
  },
  providers: {
    list: () => import("./commands/handlers/providers/list"),
    login: () => import("./commands/handlers/providers/login"),
    logout: () => import("./commands/handlers/providers/logout"),
  },
})

Runtime.run(Commands, Handlers, { version: InstallationVersion }).pipe(
  // Artifact consumers require the exact version, without the CLI formatter's name/prefix.
  Effect.provideService(CliOutput.Formatter, {
    ...CliOutput.defaultFormatter(),
    formatVersion: (_name, version) => version,
  }),
  Effect.provide(Daemon.layer),
  Effect.provide(Database.layerFromPath(Database.path())),
  Effect.provide(NodeServices.layer),
  Effect.scoped,
  NodeRuntime.runMain,
)
