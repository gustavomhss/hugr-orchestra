import { describe, expect } from "bun:test"
import path from "node:path"
import { createConnection, createServer, type Socket } from "node:net"
import { randomUUID } from "node:crypto"
import { Cause, Effect, Exit } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Flag } from "@orchestra/core/flag/flag"
import { Npm } from "@orchestra/core/npm"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Shell } from "@orchestra/core/shell"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { Account } from "@/account/account"
import { Auth } from "@/auth"
import { Agent } from "@/agent/agent"
import { BackgroundProcess } from "@/background/process"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Plugin } from "@/plugin"
import { SessionRunState } from "@/session/run-state"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { ShellTool } from "@/tool/shell"
import { Truncate } from "@/tool/truncate"
import { alive, gone, reap, sweep, tree } from "../../../core/test/fixture/process-tree"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  BackgroundProcess.node, Session.node, SessionProjector.node, SessionRunState.node,
  CrossSpawnSpawner.node, FSUtil.node, Plugin.node, Truncate.node, Config.node, Agent.node, RuntimeFlags.node,
]), [
  [Auth.node, AuthTest.empty],
  [Account.node, AccountTest.empty],
  [Npm.node, NpmTest.noop],
  [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
]))

// These assertions require the real Omni spawner, not legacy child-process behavior.
const live = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? it.instance.skip : it.instance
const broker = process.platform === "darwin" ? live : it.instance.skip

const fixture = Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const sessions = yield* Session.Service
  const processes = yield* BackgroundProcess.Service
  const session = yield* sessions.create({})
  const lifetime = { removed: false }
  const remove = sessions.remove(session.id).pipe(Effect.tap(() => Effect.sync(() => { lifetime.removed = true })))
  yield* Effect.addFinalizer(() => lifetime.removed ? Effect.void : remove)
  const info = yield* ShellTool
  const tool = yield* info.init()
  const abort = new AbortController()
  const execute = (command: string, profile?: ToolSafety.Profile) => tool.execute({ command }, {
    sessionID: session.id, messageID: MessageID.make("msg_shell_adoption"), callID: "shell_adoption",
    agent: "maestro", abort: abort.signal, messages: [], metadata: () => Effect.void, ask: () => Effect.void,
  }).pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile))
  const launch = (runtime: string, file: string) => `${Shell.ps(Shell.acceptable()) ? "& " : ""}"${runtime.replaceAll("\\", "/")}" "${file.replaceAll("\\", "/")}"${Shell.ps(Shell.acceptable()) ? "; exit $LASTEXITCODE" : ""}`
  const background = Effect.fnUntraced(function* (exitCode = 0, output = "ready\n") {
    const sample = tree(1)
    yield* Effect.addFinalizer(() => Effect.promise(() => reap(sample.nonce)))
    const script = path.join(instance.directory, "launch.cjs")
    yield* fs.writeFileString(script, `
      // libuv's parent job otherwise kills Windows descendants when this launcher exits; Omni's job still owns them.
      const child = require('node:child_process').spawn(${JSON.stringify(sample.command)}, ${JSON.stringify(sample.args)}, {stdio: ['ignore', 'pipe', 'inherit'], detached: process.platform === 'win32'});
      child.on('error', error => {throw error});
      let seen = '';
      child.stdout.on('data', bytes => {
        seen += bytes;
        if (!seen.includes(${JSON.stringify(sample.ready)})) return;
        process.stdout.write(${JSON.stringify(output)}, () => process.exit(${exitCode}));
      });
    `)
    return { sample, command: launch(process.execPath, script) }
  })
  return { ...instance, fs, remove, processes, session, abort, execute, launch, background }
})

describe("full ShellTool adoption boundary", () => {
  live("successful shell adopts live descendants; Esc survives; Session.remove leaves zero", () => Effect.gen(function* () {
    const f = yield* fixture
    const runState = yield* SessionRunState.Service
    const bg = yield* f.background()
    const result = yield* f.execute(bg.command)
    expect(result.metadata.exit).toBe(0)
    expect(result.output).toContain("ready")
    expect(yield* Effect.promise(() => alive(bg.sample.nonce))).toBe(bg.sample.size)
    expect(yield* f.processes.list(f.session.id)).toHaveLength(1)
    f.abort.abort()
    yield* runState.cancel(f.session.id)
    expect(yield* Effect.promise(() => alive(bg.sample.nonce))).toBe(bg.sample.size)
    expect(yield* f.processes.list(f.session.id)).toHaveLength(1)
    yield* f.remove
    expect(yield* Effect.promise(() => gone(bg.sample.nonce))).toBe(0)
    expect(yield* f.processes.list(f.session.id)).toEqual([])
  }), 60_000)

  live("nonzero foreground returns metadata exit code but never adopts its live tree", () => Effect.gen(function* () {
    const f = yield* fixture
    const bg = yield* f.background(7)
    const result = yield* f.execute(bg.command)
    expect(result.metadata.exit).toBe(7)
    expect(result.output).toContain("exit code: 7")
    expect(yield* f.processes.list(f.session.id)).toEqual([])
    expect(yield* Effect.promise(() => gone(bg.sample.nonce))).toBe(0)
  }), 60_000)

  live("line-only output finalization write failure stops tree before adoption", () => Effect.gen(function* () {
    const f = yield* fixture
    const bg = yield* f.background(0, "x\n".repeat(Truncate.MAX_LINES + 1))
    // Real filesystem failure after layer/init: mkdir/write cannot use a regular file as their directory.
    yield* f.fs.remove(Truncate.DIR, { recursive: true, force: true })
    yield* f.fs.writeWithDirs(Truncate.DIR, "not a directory")
    yield* Effect.addFinalizer(() => f.fs.remove(Truncate.DIR, { force: true }).pipe(Effect.orDie))
    const result = yield* f.execute(bg.command).pipe(Effect.exit)
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) expect(Cause.pretty(result.cause)).toMatch(/EEXIST|ENOTDIR|AlreadyExists|NotFound|Unknown/)
    expect(yield* f.processes.list(f.session.id)).toEqual([])
    expect(yield* Effect.promise(() => gone(bg.sample.nonce))).toBe(0)
  }), 60_000)

  broker("broker exchanges bytes after shell return and Esc; Session.remove closes tree, broker and scratch", () => Effect.gen(function* () {
    const f = yield* fixture
    const runState = yield* SessionRunState.Service
    const node = yield* ToolSafetySandbox.available("node")
    if (!node) throw new Error("fixture-prerequisite-missing:node")
    const clients = new Set<Socket>()
    const server = yield* Effect.acquireRelease(Effect.sync(() => createServer((socket) => {
      clients.add(socket)
      socket.on("error", () => socket.destroy())
      socket.on("close", () => clients.delete(socket))
      socket.pipe(socket)
    })), (server) => Effect.promise(() => new Promise<void>((resolve) => {
      clients.forEach((socket) => socket.destroy())
      server.close(() => resolve())
    })))
    yield* Effect.promise(() => new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => resolve())
    }))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("fixture-prerequisite-missing:tcp-target")
    const nonce = `shell-broker-${randomUUID()}`
    const child = path.join(f.directory, "broker-child.cjs")
    const start = path.join(f.directory, "broker-start.cjs")
    const state = path.join(f.directory, "broker-state.json")
    const request = path.join(f.directory, "request")
    const reply = path.join(f.directory, "reply")
    yield* f.fs.writeFileString(child, `
      const fs = require('node:fs'), net = require('node:net');
      const socket = Buffer.from(process.env.ORCHESTRA_TCP_PROXY_ROUTES.split(':')[1], 'hex').toString();
      fs.writeFileSync(${JSON.stringify(state)}, JSON.stringify({socket, scratch: process.env.TMPDIR, pid: process.pid}));
      console.log('BROKER_CHILD_READY');
      let handled = '';
      setInterval(() => {
        if (!fs.existsSync(${JSON.stringify(request)})) return;
        const text = fs.readFileSync(${JSON.stringify(request)}, 'utf8');
        if (text === handled) return;
        handled = text;
        const c = net.createConnection({path: socket});
        c.once('connect', () => c.write(text));
        c.once('data', bytes => {fs.writeFileSync(${JSON.stringify(reply)}, bytes); c.destroy()});
        c.once('error', error => fs.writeFileSync(${JSON.stringify(reply)}, error.code));
      }, 20);
    `)
    yield* f.fs.writeFileString(start, `
      const child = require('node:child_process').spawn(${JSON.stringify(node)}, [${JSON.stringify(child)}, ${JSON.stringify(nonce)}], {stdio: ['ignore', 'pipe', 'inherit']});
      child.on('error', error => {throw error});
      child.stdout.once('data', bytes => process.stdout.write(bytes, () => process.exit(0)));
    `)
    const result = yield* f.execute(f.launch(node, start), {
      requireSandbox: true, writeRoots: [f.directory], sandbox: { enabled: true, scratch: true,
        allowedLoopbackEndpoints: [{ directory: f.directory, host: "127.0.0.1", port: address.port }] },
    })
    expect(result.metadata.exit).toBe(0)
    expect(result.output).toContain("BROKER_CHILD_READY")
    const owned = yield* Effect.promise(async () => JSON.parse(await Bun.file(state).text()) as { socket: string; scratch: string; pid: number })
    expect(yield* Effect.promise(() => sweep(nonce))).toContain(owned.pid)
    expect(yield* f.processes.list(f.session.id)).toHaveLength(1)
    const exchange = (text: string) => Effect.gen(function* () {
      yield* f.fs.writeFileString(request, text)
      return yield* pollWithTimeout(f.fs.readFileString(reply).pipe(
        Effect.map((bytes) => bytes === text ? bytes : undefined),
        Effect.catch(() => Effect.succeed(undefined)),
      ), `post-return broker exchange failed: ${text}`)
    })
    expect(yield* exchange("AFTER_RETURN")).toBe("AFTER_RETURN")
    expect(yield* f.fs.exists(owned.socket)).toBe(true)
    expect(yield* f.fs.exists(owned.scratch)).toBe(true)
    f.abort.abort()
    yield* runState.cancel(f.session.id)
    expect(yield* exchange("AFTER_ESC")).toBe("AFTER_ESC")
    yield* f.remove
    expect(yield* Effect.promise(() => sweep(nonce))).toEqual([])
    expect(yield* f.processes.list(f.session.id)).toEqual([])
    expect(yield* f.fs.exists(owned.scratch)).toBe(false)
    expect(yield* f.fs.exists(path.dirname(owned.socket))).toBe(false)
    const closed = yield* Effect.promise(() => new Promise<string>((resolve) => {
      const c = createConnection(owned.socket)
      c.once("connect", () => { c.destroy(); resolve("CONNECTED") })
      c.once("error", (error: NodeJS.ErrnoException) => resolve(error.code ?? "ERROR"))
    }))
    expect(closed).not.toBe("CONNECTED")
  }), 60_000)
})
