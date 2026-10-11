import { describe, expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
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

// The same layer as the shell tool's adoption tests: the process tool feeds the same BackgroundProcess registry.
const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  BackgroundProcess.node, Session.node, SessionProjector.node, SessionRunState.node,
  CrossSpawnSpawner.node, FSUtil.node, Plugin.node, Truncate.node, Config.node, Agent.node, RuntimeFlags.node,
]), [
  [Auth.node, AuthTest.empty],
  [Account.node, AccountTest.empty],
  [Npm.node, NpmTest.noop],
  [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
]))

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
  const call = (params: typeof ClaudeHostProcess.Parameters.Type) => tool.execute(params, {
    sessionID: session.id, messageID: MessageID.make("msg_host_process"), callID: "host_process", agent: "maestro", agentID: "maestro",
    abort: new AbortController().signal, messages: [],
    metadata: (input) => Effect.sync(() => { streamed.push(input.metadata?.output) }),
    ask: (request) => Effect.sync(() => { asks.push({ permission: request.permission, patterns: request.patterns }) }),
  })
  const node = Effect.fnUntraced(function* (name: string, source: string) {
    const file = path.join(instance.directory, name)
    yield* fs.writeFileString(file, source)
    const ps = Shell.ps(Shell.acceptable())
    return `${ps ? "& " : ""}"${process.execPath.replaceAll("\\", "/")}" "${file.replaceAll("\\", "/")}"${ps ? "; exit $LASTEXITCODE" : ""}`
  })
  return { session, processes, call, asks, streamed, node }
})

describe("process MCP tool", () => {
  live("start keeps a long-running command in the Processes panel's registry; tail follows it; stop ends it", () => Effect.gen(function* () {
    const f = yield* fixture
    const command = yield* f.node("server.cjs", `
      console.log("ready")
      let tick = 0
      setInterval(() => console.log("tick " + tick++), 100)
    `)
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
    const tail = yield* pollWithTimeout(f.call({ action: "tail", id, bytes: 256 }).pipe(
      Effect.map((result) => result.output.includes("tick") ? result : undefined)), "tail never showed background output", "15 seconds")
    expect(tail.metadata.running).toBe(true)
    expect(Buffer.byteLength(tail.output)).toBeLessThanOrEqual(256)

    const stopped = yield* f.call({ action: "stop", id })
    expect(stopped.metadata.stopped).toBe(true)
    expect(yield* f.processes.list(f.session.id)).toEqual([])
    expect((yield* f.call({ action: "tail", id })).metadata.running).toBe(false)
    expect((yield* f.call({ action: "stop", id })).metadata.stopped).toBe(false)
  }), 60_000)

  live("a command that ends inside the wait returns its exit code and leaves nothing behind", () => Effect.gen(function* () {
    const f = yield* fixture
    const done = yield* f.call({ action: "start", command: yield* f.node("done.cjs", `console.log("built")`), wait: 10_000 })
    expect(done.metadata.exit).toBe(0)
    expect(done.output).toContain("built")
    const failed = yield* f.call({ action: "start", command: yield* f.node("fail.cjs", `console.log("broken"); process.exit(3)`), wait: 10_000 })
    expect(failed.metadata.exit).toBe(3)
    expect(failed.output).toContain("exit code 3")
    expect(yield* f.processes.list(f.session.id)).toEqual([])
  }), 60_000)

  it.instance("tail and stop need an id, start needs a command", () => Effect.gen(function* () {
    const f = yield* fixture
    for (const params of [{ action: "tail" }, { action: "stop" }, { action: "start" }] as const)
      expect(yield* f.call(params).pipe(Effect.exit, Effect.map((exit) => exit._tag))).toBe("Failure")
    expect((yield* f.call({ action: "list" })).output).toContain("No background processes")
  }), 60_000)
})
