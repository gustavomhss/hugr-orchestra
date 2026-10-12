import { describe, expect } from "bun:test"
import path from "node:path"
import { Cause, Deferred, Effect, Exit, Fiber, FileSystem } from "effect"
import fs from "node:fs/promises"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { Database } from "@orchestra/core/database/database"
import { AppProcess } from "@orchestra/core/process"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { ClaudeHostGate } from "@/claude-code/host/gate"
import { Permission } from "@/permission"
import { Git } from "@/git"
import { ArsenalObservations } from "@/maestro/arsenal-observations"
import { EventV2Bridge } from "@/event-v2-bridge"
import { WriteRoots } from "@/maestro/write-roots"
import type { Tool } from "@/tool/tool"
import { seatShellRuns } from "../../fixture/seat-sandbox"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Flag } from "@orchestra/core/flag/flag"
import { Npm } from "@orchestra/core/npm"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Shell } from "@orchestra/core/shell"
import { Account } from "@/account/account"
import { Auth } from "@/auth"
import { Agent } from "@/agent/agent"
import { BackgroundProcess } from "@/background/process"
import { ClaudeHostProcess } from "@/claude-code/host/process-tool"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Plugin } from "@/plugin"
import { SessionRunState } from "@/session/run-state"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { Truncate } from "@/tool/truncate"
import { AccountTest } from "../../fake/account"
import { AuthTest } from "../../fake/auth"
import { NpmTest } from "../../fake/npm"
import { TestInstance } from "../../fixture/fixture"
import { pollWithTimeout, testEffect } from "../../lib/effect"
import { expectSpawn } from "../../../../core/test/fixture/omni-expect"

// The same layer as the shell tool's adoption tests: the process tool feeds the same BackgroundProcess registry.
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      BackgroundProcess.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      AppProcess.node,
      LocationServiceMap.node,
      Permission.node,
      Git.node,
      ArsenalObservations.node,
      Database.node,
      EventV2Bridge.node,
      CrossSpawnSpawner.node,
      FSUtil.node,
      Plugin.node,
      Truncate.node,
      Config.node,
      Agent.node,
      RuntimeFlags.node,
    ]),
    [
      [Auth.node, AuthTest.empty],
      [Account.node, AccountTest.empty],
      [Npm.node, NpmTest.noop],
      [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
    ],
  ),
)

// Adoption needs the real Omni spawner, as the shell tool's does.
const live = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? it.instance.skip : it.instance

const fixture = Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const sessions = yield* Session.Service
  const processes = yield* BackgroundProcess.Service
  const session = yield* sessions.create({})
  yield* Effect.addFinalizer(() => sessions.remove(session.id).pipe(Effect.ignore))
  const tool = yield* Effect.flatMap(ClaudeHostProcess.ProcessTool, (info) => info.init())
  const asks: { permission: string; patterns: readonly string[] }[] = []
  const streamed: unknown[] = []
  const context = (agent = "maestro", callID = MessageID.ascending()): Tool.Context => ({
    sessionID: session.id,
    messageID: MessageID.make("msg_host_process"),
    callID,
    agent,
    agentID: agent,
    abort: new AbortController().signal,
    messages: [],
    metadata: (input) =>
      Effect.sync(() => {
        streamed.push(input.metadata?.output)
      }),
    ask: (request) =>
      Effect.sync(() => {
        asks.push({ permission: request.permission, patterns: request.patterns })
      }),
  })
  const call = (
    params: typeof ClaudeHostProcess.Parameters.Type,
    options?: { agent?: string; profile?: ToolSafety.Profile; ctx?: Tool.Context },
  ) =>
    tool
      .execute(params, options?.ctx ?? context(options?.agent))
      .pipe(Effect.provideService(ToolSafety.RuntimeProfile, options?.profile))
  const node = Effect.fnUntraced(function* (name: string, source: string) {
    const file = path.join(instance.directory, name)
    yield* fs.writeFileString(file, source)
    const ps = Shell.ps(Shell.acceptable())
    return `${ps ? "& " : ""}"${process.execPath.replaceAll("\\", "/")}" "${file.replaceAll("\\", "/")}"${ps ? "; exit $LASTEXITCODE" : ""}`
  })
  return { directory: instance.directory, fs, session, processes, call, context, asks, streamed, node }
})

describe("process MCP tool", () => {
  live(
    "start keeps a long-running command in the Processes panel's registry; tail follows it; stop ends it",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const command = yield* f.node(
          "server.cjs",
          `
      console.log("ready")
      let tick = 0
      setInterval(() => console.log("tick " + tick++), 100)
    `,
        )
        expectSpawn(import.meta.path)
        const started = yield* f.call({ action: "start", command, wait: 1_000 })
        expect(started.output).toContain("ready")
        expect(started.metadata.exit).toBeNull()
        const id = started.metadata.id
        expect(typeof id).toBe("string")
        expect(started.metadata.pid).toBeGreaterThan(0)
        // The shell permission decides the command, as for the shell tool, and the card received the early output live.
        expect(f.asks.some((ask) => ask.permission === "bash")).toBe(true)
        expect(f.streamed.some((output) => typeof output === "string" && output.includes("ready"))).toBe(true)

        // The Processes panel's own data source (session.processes) lists it with its tree.
        const panel = yield* f.processes.list(f.session.id)
        expect(panel.map((item) => item.id)).toEqual([id])
        expect(panel[0].processes.length).toBeGreaterThan(0)

        const listed = yield* f.call({ action: "list" })
        expect(listed.output).toContain(id)

        // Output written after the command went to the background reaches tail.
        const tail = yield* pollWithTimeout(
          f
            .call({ action: "tail", id, bytes: 256 })
            .pipe(Effect.map((result) => (result.output.includes("tick") ? result : undefined))),
          "tail never showed background output",
          "15 seconds",
        )
        expect(tail.metadata.running).toBe(true)
        expect(Buffer.byteLength(tail.output)).toBeLessThanOrEqual(256)

        const stopped = yield* f.call({ action: "stop", id })
        expect(stopped.metadata.stopped).toBe(true)
        expect(yield* f.processes.list(f.session.id)).toEqual([])
        expect((yield* f.call({ action: "tail", id })).metadata.running).toBe(false)
        expect((yield* f.call({ action: "stop", id })).metadata.stopped).toBe(false)
      }),
    60_000,
  )

  live(
    "a command that ends inside the wait returns its exit code and leaves nothing behind",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        expectSpawn(import.meta.path)
        const done = yield* f.call({
          action: "start",
          command: yield* f.node("done.cjs", `console.log("built")`),
          wait: 10_000,
        })
        expect(done.metadata.exit).toBe(0)
        expect(done.output).toContain("built")
        const failed = yield* f.call({
          action: "start",
          command: yield* f.node("fail.cjs", `console.log("broken"); process.exit(3)`),
          wait: 10_000,
        })
        expect(failed.metadata.exit).toBe(3)
        expect(failed.output).toContain("exit code 3")
        expect(yield* f.processes.list(f.session.id)).toEqual([])
      }),
    60_000,
  )

  live(
    "concurrent starts return only their own adopted PIDs",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const commands = yield* Effect.forEach(["first", "second"], (name) =>
          f.node(
            `${name}.cjs`,
            `
      console.log(${JSON.stringify(name)} + " pid=" + process.pid)
      setInterval(() => {}, 100)
    `,
          ),
        )
        expectSpawn(import.meta.path)
        const started = yield* Effect.forEach(
          commands,
          (command) => f.call({ action: "start", command, wait: 1_000 }),
          { concurrency: "unbounded" },
        )
        expect(new Set(started.map((result) => result.metadata.id)).size).toBe(2)
        const panel = yield* f.processes.list(f.session.id)
        started.forEach((result, index) => {
          expect(result.output).toContain(index === 0 ? "first pid=" : "second pid=")
          const runtimePID = Number(/pid=(\d+)/.exec(result.output)?.[1])
          expect(runtimePID).toBeGreaterThan(0)
          const entry = panel.find((item) => item.id === result.metadata.id)
          expect(entry?.pid).toBe(result.metadata.pid)
          expect(entry?.processes.map((item) => item.pid)).toContain(runtimePID)
        })
        yield* f.call({ action: "stop", id: started[0].metadata.id })
        expect((yield* f.processes.list(f.session.id)).map((item) => item.id)).toEqual([started[1].metadata.id])
      }),
    60_000,
  )

  live(
    "a concurrent command that finishes never claims the other start's process",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const ready = yield* Deferred.make<void>()
        const release = path.join(f.directory, "release")
        const command = yield* f.node(
          "short.cjs",
          `
      console.log("waiting")
      const timer = setInterval(() => {
        if (!require("node:fs").existsSync(${JSON.stringify(release)})) return
        clearInterval(timer)
      }, 20)
    `,
        )
        const ctx = f.context()
        expectSpawn(import.meta.path)
        const short = yield* Effect.forkScoped(
          f.call(
            { action: "start", command, wait: 20_000 },
            {
              ctx: {
                ...ctx,
                metadata: (input) =>
                  ctx
                    .metadata(input)
                    .pipe(
                      Effect.andThen(
                        typeof input.metadata?.output === "string" && input.metadata.output.includes("waiting")
                          ? Deferred.succeed(ready, undefined)
                          : Effect.void,
                      ),
                      Effect.asVoid,
                    ),
              },
            },
          ),
        )
        yield* Effect.raceFirst(
          Deferred.await(ready),
          Fiber.join(short).pipe(Effect.andThen(Effect.die(new Error("short command ended before readiness")))),
        ).pipe(Effect.timeout("10 seconds"))
        const long = yield* f.call({
          action: "start",
          wait: 500,
          command: yield* f.node("long.cjs", "setInterval(() => {}, 100)"),
        })
        yield* f.fs.writeFileString(release, "finish")
        const finished = yield* Fiber.join(short)
        expect(finished.metadata.exit).toBe(0)
        expect(finished.metadata.id).toBeUndefined()
        expect(finished.metadata.pid).toBeUndefined()
        expect((yield* f.processes.list(f.session.id)).map((item) => item.id)).toEqual([long.metadata.id])
      }),
    60_000,
  )

  const sandbox = process.platform !== "win32" && seatShellRuns() ? live : it.instance.skip
  sandbox(
    "requireSandbox alone confines a maestro process start",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const root = path.join(f.directory, "allowed")
        yield* Effect.promise(() => fs.mkdir(root))
        const escaped = path.join(f.directory, "escaped")
        const command = yield* f.node(
          "required.cjs",
          `
      const fs = require("node:fs")
      fs.writeFileSync(${JSON.stringify(path.join(root, "written"))}, "inside")
      try { fs.writeFileSync(${JSON.stringify(escaped)}, "escaped"); console.log("ESCAPED") }
      catch { console.log("denied") }
    `,
        )
        expectSpawn(import.meta.path)
        const result = yield* f.call(
          { action: "start", command, wait: 10_000 },
          { profile: { requireSandbox: true, writeRoots: [root] } },
        )
        expect(result.metadata.exit).toBe(0)
        expect(result.output).toContain("denied")
        expect(result.output).not.toContain("ESCAPED")
        expect(yield* Effect.promise(() => Bun.file(path.join(root, "written")).text())).toBe("inside")
        expect(yield* Effect.promise(() => Bun.file(escaped).exists())).toBe(false)
        expect(yield* f.processes.list(f.session.id)).toEqual([])
      }),
    60_000,
  )

  it.instance(
    "a required unavailable sandbox refuses start before any command runs",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const ran = path.join(f.directory, "ran")
        const command = yield* f.node(
          "unavailable.cjs",
          `require("node:fs").writeFileSync(${JSON.stringify(ran)}, "ran")`,
        )
        // Exact endpoint confinement ignores a PATH srt, so the real discovery references can remove every backend.
        const result = yield* f
          .call(
            { action: "start", command, wait: 10_000 },
            {
              profile: {
                requireSandbox: true,
                writeRoots: [f.directory],
                sandbox: {
                  enabled: true,
                  allowedLoopbackEndpoints: [{ directory: f.directory, host: "127.0.0.1", port: 12345 }],
                },
              },
            },
          )
          .pipe(
            Effect.provideService(ToolSafetySandbox.Seatbelt, path.join(f.directory, "missing-sandbox-exec")),
            Effect.provideService(ToolSafetySandboxRuntime.Source, {
              directory: path.join(f.directory, "runtime"),
              artifacts: [],
              dependencies: ["orchestra-missing-sandbox-dependency"],
            }),
            Effect.exit,
          )
        expect(Exit.isFailure(result)).toBe(true)
        if (Exit.isFailure(result))
          expect(Cause.pretty(result.cause)).toMatch(
            /sandbox-loopback-endpoint-(backend-unavailable|exact-policy-unsupported)/,
          )
        expect(yield* Effect.promise(() => Bun.file(ran).exists())).toBe(false)
        expect(yield* f.processes.list(f.session.id)).toEqual([])
      }),
    60_000,
  )

  sandbox(
    "sandboxed start permits its write root, blocks other writes, and retains its jail until stop",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const root = path.join(f.directory, "allowed")
        yield* Effect.promise(() => fs.mkdir(root))
        const allowed = path.join(root, "written")
        const denied = path.join(f.directory, "escaped")
        const profile = WriteRoots.profile(undefined, [root], f.directory)
        const command = yield* f.node(
          "sandbox.cjs",
          `
      const fs = require("node:fs")
      fs.writeFileSync(${JSON.stringify(allowed)}, "inside")
      console.log("scratch=" + process.env.TMPDIR)
      const probe = () => {
        try { fs.writeFileSync(${JSON.stringify(denied)}, "escaped"); console.log("ESCAPED") }
        catch { console.log("denied") }
      }
      probe()
      setInterval(probe, 100)
    `,
        )
        expectSpawn(import.meta.path)
        const started = yield* f.call({ action: "start", command, wait: 1_000 }, { agent: "backend", profile })
        expect(started.metadata.exit).toBeNull()
        expect(started.output).toContain("denied")
        expect(started.output).not.toContain("ESCAPED")
        expect(yield* Effect.promise(() => Bun.file(allowed).text())).toBe("inside")
        expect(yield* Effect.promise(() => Bun.file(denied).exists())).toBe(false)
        const scratch = /scratch=([^\r\n]+)/.exec(started.output)?.[1]
        if (!scratch) throw new Error("sandbox did not report its scratch directory")
        expect(
          yield* Effect.promise(() =>
            fs.stat(scratch).then(
              (stat) => stat.isDirectory(),
              () => false,
            ),
          ),
        ).toBe(true)
        const tail = yield* pollWithTimeout(
          f
            .call({ action: "tail", id: started.metadata.id })
            .pipe(Effect.map((result) => (result.output.includes("denied") ? result : undefined))),
          "adopted sandbox never ran",
          "15 seconds",
        )
        expect(tail.output).not.toContain("ESCAPED")
        yield* f.call({ action: "stop", id: started.metadata.id })
        expect(
          yield* Effect.promise(() =>
            fs.stat(scratch).then(
              () => true,
              () => false,
            ),
          ),
        ).toBe(false)
      }),
    60_000,
  )

  sandbox(
    "a gate-prepared jail transfers once to process start and stays owned by the adopted tree",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        const sessions = yield* Session.Service
        const root = path.join(f.directory, "allowed")
        yield* Effect.promise(() => fs.mkdir(root))
        yield* sessions.setPermission({
          sessionID: f.session.id,
          permission: yield* WriteRoots.bind("backend", ["allowed"], []).pipe(
            Effect.provideService(FileSystem.FileSystem, f.fs),
          ),
        })
        const profile = WriteRoots.profile(undefined, [root], f.directory)
        const ctx = f.context("backend")
        const gate = yield* ClaudeHostGate.live({ granted: { backend: ["process"] }, abort: ctx.abort }).pipe(
          Effect.provideService(FileSystem.FileSystem, f.fs),
        )
        yield* Effect.addFinalizer(() => gate.close)
        const command = yield* f.node(
          "prepared.cjs",
          `console.log("scratch=" + process.env.TMPDIR); setInterval(() => {}, 100)`,
        )
        const updated = yield* gate.confine({ sessionID: f.session.id, seat: "backend" }, command, ctx.callID!, {})
        if (!updated) throw new Error("process start was not jailed by the gate")
        expect(updated).not.toBe(command)
        expectSpawn(import.meta.path)
        const started = yield* f.call({ action: "start", command: updated, wait: 1_000 }, { ctx, profile })
        expect(started.metadata.pid).toBeGreaterThan(0)
        const scratch = /scratch=([^\r\n]+)/.exec(started.output)?.[1]
        if (!scratch) throw new Error("prepared jail did not start")
        // Post-tool cleanup and host closure must not release an adopted process's sandbox files.
        yield* gate.release(ctx.callID!)
        yield* gate.close
        expect(
          yield* Effect.promise(() =>
            fs.stat(scratch).then(
              (stat) => stat.isDirectory(),
              () => false,
            ),
          ),
        ).toBe(true)
        expect((yield* f.processes.list(f.session.id)).map((item) => item.pid)).toEqual([started.metadata.pid])
        yield* f.call({ action: "stop", id: started.metadata.id })
        expect(
          yield* Effect.promise(() =>
            fs.stat(scratch).then(
              () => true,
              () => false,
            ),
          ),
        ).toBe(false)
      }),
    60_000,
  )

  it.instance(
    "tail and stop need an id, start needs a command",
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        for (const params of [{ action: "tail" }, { action: "stop" }, { action: "start" }] as const)
          expect(
            yield* f.call(params).pipe(
              Effect.exit,
              Effect.map((exit) => exit._tag),
            ),
          ).toBe("Failure")
        expect((yield* f.call({ action: "list" })).output).toContain("No background processes")
      }),
    60_000,
  )
})
