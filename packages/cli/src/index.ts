#!/usr/bin/env bun

import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { InstallationVersion } from "@orchestra/core/installation/version"
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
  },
  migrate: () => import("./commands/handlers/migrate"),
  service: {
    start: () => import("./commands/handlers/service/start"),
    restart: () => import("./commands/handlers/service/restart"),
    status: () => import("./commands/handlers/service/status"),
    stop: () => import("./commands/handlers/service/stop"),
    password: () => import("./commands/handlers/service/password"),
  },
  serve: () => import("./commands/handlers/serve"),
})

Runtime.run(Commands, Handlers, { version: InstallationVersion }).pipe(
  // Artifact consumers require the exact version, without the CLI formatter's name/prefix.
  Effect.provideService(CliOutput.Formatter, {
    ...CliOutput.defaultFormatter(),
    formatVersion: (_name, version) => version,
  }),
  Effect.provide(Daemon.layer),
  Effect.provide(NodeServices.layer),
  Effect.scoped,
  NodeRuntime.runMain,
)
