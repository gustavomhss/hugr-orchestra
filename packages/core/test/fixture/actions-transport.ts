export * as ActionsTransportFixture from "./actions-transport"

import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Stream } from "effect"
import type { ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ActionsTransport } from "../../src/actions/transport"
import { testEffect } from "../lib/effect"
import { ActionsNetworkFixture } from "./actions-network"

export const it = testEffect(LayerNode.compile(AppProcess.node))
export type Reply = {
  stdout?: string; stderr?: string; code?: number; binary?: string; blocks?: number;
  padding?: number; hold?: boolean; stdoutEOF?: boolean; help?: string; helpCode?: number;
  version?: string; settings?: Record<string, string>; configCode?: number; routes?: Record<string, Reply>
}
export const binding = (directory: string, provider: Actions.Provider): Actions.Binding => ({
  id: Actions.BindingID.make("ab_fixture"), revision: 1, remote: "origin", provider,
  projectID: "9347", projectPath: "acme/nested/widget", account: "fixture-user", directory,
})
export const github: Actions.Provider = { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" }
export const gitlab: Actions.Provider = { kind: "gitlab", hostname: "gitlab.example.com", apiOrigin: "https://gitlab.example.com" }
export const response = (status: number, body: string, headers = "Content-Type: application/json\r\n") =>
  `HTTP/2.0 ${status} Status\n${headers}\r\n${body}`

export const fixture = Effect.fnUntraced(function* (initial: Reply = {}, install = true) {
  const network = yield* ActionsNetworkFixture.make()
  const root = yield* Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "actions-transport-"))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )
  const original = { PATH: process.env.PATH, Path: process.env.Path }
  yield* Effect.acquireRelease(Effect.sync(() => {
    process.env.PATH = root
    if (process.platform === "win32") process.env.Path = root
  }), () => Effect.sync(() => {
    Object.entries(original).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value)
  }))
  yield* Effect.promise(async () => {
    if (!install) return
    for (const name of ["gh", "glab"]) {
      const script = path.resolve(import.meta.dirname, "actions-cli.ts")
      if (process.platform === "win32") {
        await fs.writeFile(path.join(root, `${name}.cmd`), `@echo off\r\n"${process.execPath}" "${script}" "${root}" "${name}" %*\r\nexit /b %ERRORLEVEL%\r\n`)
        continue
      }
      await fs.writeFile(path.join(root, name), `#!/bin/sh\nexec "${process.execPath}" "${script}" "${root}" "${name}" "$@"\n`)
      await fs.chmod(path.join(root, name), 0o755)
    }
  })
  const proc = yield* AppProcess.Service
  const handles: ChildProcessHandle[] = []
  const commands: import("effect/unstable/process/ChildProcess").Command[] = []
  const service = yield* ActionsTransport.make({ directory: root }).pipe(Effect.provideService(AppProcess.Service, {
    ...proc,
    spawn: (command) => proc.spawn(command).pipe(Effect.tap((handle) => Effect.sync(() => {
      if (command._tag === "StandardCommand" && ["version", "config"].includes(command.args[0])) return
      handles.push(handle)
      commands.push(command)
    }))),
    run: () => Effect.die("Transport must use inherited raw spawner, never run collection"),
    runStream: () => Stream.die("Transport must not use line-decoded runStream"),
  }))
  const current = { reply: initial }
  network.state.handler = (request, response) => {
    const endpoint = (request.url ?? "").replace(/^\/api\/v4\//, "")
    const selected = current.reply.routes?.[endpoint] ?? current.reply
    if (endpoint === "user" && !current.reply.routes?.user) {
      response.writeHead(200, { "Content-Type": "application/json" }); response.end('{"id":913,"username":"fixture-user"}'); return
    }
    const match = /^HTTP\/[^ ]+ (\d+)[^\n]*\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(selected.stdout ?? "")
    const headers = Object.fromEntries((match?.[2] ?? "Content-Type: application/json").split(/\r?\n/).filter(Boolean).map((line) => {
      const index = line.indexOf(":"); return [line.slice(0, index), line.slice(index + 1).trim()]
    }))
    const respond = () => {
      response.writeHead(Number(match?.[1] ?? 200), headers)
      response.write(selected.binary ? Buffer.from(selected.binary, "base64") : match?.[3] ?? selected.stdout ?? "{}")
      if (selected.padding) response.write(" ".repeat(selected.padding))
      if (!selected.hold) response.end()
    }
    if (request.method === "GET") return respond()
    request.once("end", respond)
  }
  const reply = (value: Reply) => Effect.promise(() => {
    current.reply = value
    return fs.writeFile(path.join(root, "reply.json"), JSON.stringify({ ...value,
      settings: { token: "synthetic-provider", ca_cert: path.join(network.root, "cert.pem"), ...value.settings },
    }))
  })
  yield* reply(initial)
  return {
    root, service, handles, commands, reply, network,
    stopped: (index = 0) => Effect.promise(async () => {
      // TestClock wakes the watchdog, but does not wait for the OS exit callback.
      const deadline = Date.now() + 2000
      while (Date.now() < deadline && await Effect.runPromise(handles[index].isRunning)) await Bun.sleep(10)
    }),
    binding: (provider = github) => binding(root, provider === gitlab ? network.provider : provider),
    ready: (file = "ready") => Effect.promise(async () => {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        if (await Bun.file(path.join(root, file)).exists()) return
        await Bun.sleep(10)
      }
      throw new Error("Subprocess fixture never became ready")
    }),
    calls: () => Effect.promise(async () => (await fs.readFile(path.join(root, "calls.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line) as {
        argv: string[]; stdin: string; size: number; digest: string; chunks: number; env: Record<string, string>; cwd: string
      })),
  }
})
