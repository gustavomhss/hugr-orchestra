export * as ActionsHttpFixture from "./actions-http"

import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../src/process"
import { ActionsTransport } from "../../src/actions/transport"
import { ActionsNetworkFixture } from "./actions-network"
import { ActionsTransportFixture } from "./actions-transport"

export const make = Effect.fnUntraced(function* (mutual = false) {
  const network = yield* ActionsNetworkFixture.make(mutual)
  const executable = yield* network.install()
  const original = { PATH: process.env.PATH, Path: process.env.Path }
  yield* Effect.acquireRelease(Effect.sync(() => {
    process.env.PATH = `${path.dirname(executable)}${path.delimiter}${original.PATH ?? original.Path ?? ""}`
    if (process.platform === "win32") process.env.Path = process.env.PATH
  }), () => Effect.sync(() => {
    Object.entries(original).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value)
  }))
  const config = path.join(network.root, "config")
  yield* Effect.promise(() => fs.mkdir(config, { mode: 0o700 }))
  const configure = (values: Record<string, string | undefined>) => Effect.promise(() => fs.writeFile(path.join(config, "config.yml"), JSON.stringify({ hosts: {
    [network.provider.hostname]: { token: "synthetic-provider", ca_cert: path.join(network.root, "cert.pem"), ...values },
  } }), { mode: 0o600 }))
  yield* configure({})
  const proc = yield* AppProcess.Service
  const observed: string[][] = []
  const state = { beforeLastRead: undefined as (() => Promise<void>) | undefined }
  const service = yield* ActionsTransport.make({ directory: network.root }).pipe(Effect.provideService(AppProcess.Service, {
    ...proc,
    spawn: (command) => {
      if (command._tag !== "StandardCommand" || !command.command.toLowerCase().includes("glab")) return proc.spawn(command)
      observed.push([...command.args])
      if (command.args[0] !== "version" && !(command.args[0] === "config" && command.args[1] === "get"))
        return Effect.die("GitLab fixture forbids API/auth network helpers")
      return proc.spawn(ChildProcess.make(executable, command.args, { ...command.options, env: {
        ...command.options.env, GLAB_CONFIG_DIR: config,
        GITLAB_TOKEN: "", GITLAB_ACCESS_TOKEN: "", OAUTH_TOKEN: "", CI_JOB_TOKEN: "", JOB_TOKEN: "", GLAB_IS_OAUTH2: "", GLAB_USE_KEYRING: "false",
      } })).pipe(Effect.tap((handle) => command.args[2] === "client_key" && state.beforeLastRead
        ? handle.exitCode.pipe(Effect.andThen(Effect.promise(() => state.beforeLastRead?.() ?? Promise.resolve()))) : Effect.void))
    },
    run: () => Effect.die("Credential settings must use bounded inherited capture"),
    runStream: () => Stream.die("Credential settings must not use a line-decoding helper"),
  }))
  return {
    ...network, service, configure, observed, state, config, serverState: network.state,
    binding: () => ActionsTransportFixture.binding(network.root, network.provider),
  }
})
