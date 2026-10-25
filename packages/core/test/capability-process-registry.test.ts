import { describe, expect } from "bun:test"
import { tmpdir } from "node:os"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { Deferred, Effect, Exit, Fiber, Option, Schedule, Scope } from "effect"
import { TestClock } from "effect/testing"
import { ChildProcess } from "effect/unstable/process"
import type { CapabilityProcessContract } from "../src/capability/process-control/contract"
import { CapabilityProcessRegistry } from "../src/capability/process-control/registry"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { testEffect } from "./lib/effect"

// Real child processes (bun -e). Qualified on macOS only; Linux and Windows kill-tree are unqualified.
const it = testEffect(LayerNode.compile(AppProcess.node))
// Windows has no POSIX signals or pgrep: a stopped or self-killed child reports an exit code instead.
const posix = process.platform === "win32" ? it.live.skip : it.live
const encode = (text: string) => new TextEncoder().encode(text)
const owner = (): Capability.Owner => ({
  projectID: Project.ID.make("project"), location: { directory: AbsolutePath.make(tmpdir()) },
  sessionID: SessionID.create(), agentID: Agent.ID.make("actor"),
})
type Settled = Parameters<CapabilityProcessContract.StartInput["settle"]>[0]

function harness(options?: CapabilityProcessRegistry.Options) {
  return Effect.gen(function* () {
    const registry = yield* CapabilityProcessRegistry.make(options)
    const settled: Settled[] = []
    const start = (script: string, overrides: Partial<CapabilityProcessContract.StartInput> = {}) => {
      const input: CapabilityProcessContract.StartInput = {
        ref: { id: Capability.JobID.create() }, owner: owner(),
        command: ChildProcess.make(process.execPath, ["-e", script]), prepare: Effect.succeed,
        settle: (outcome) => Effect.sync(() => { settled.push(outcome) }), ...overrides,
      }
      return registry.start(input).pipe(Effect.map((live) => ({ live, owner: input.owner })))
    }
    return { registry, settled, start }
  })
}

// Reads the whole retained output until predicate holds or eof.
function until(live: CapabilityProcessContract.Live, predicate: (text: string) => boolean): Effect.Effect<string> {
  return Effect.suspend(() => {
    const chunk = live.output.read(0, 65_536)
    if (predicate(chunk.text) || chunk.eof) return Effect.succeed(chunk.text)
    return live.output.changed(chunk.end).pipe(Effect.andThen(until(live, predicate)))
  })
}

// A registry in its own Scope under the test Scope, so a test can shut it down early.
function closable() {
  return Effect.gen(function* () {
    const scope = yield* Scope.fork(yield* Effect.scope)
    return { scope, h: yield* harness().pipe(Scope.provide(scope)) }
  })
}

function gone(pid: number | (() => boolean)) {
  return Effect.sync(typeof pid === "number" ? () => alive(pid) : pid).pipe(
    Effect.repeat({ while: (running) => running, schedule: Schedule.spaced("20 millis") }),
    Effect.timeoutOption("2 seconds"), Effect.map(Option.isSome))
}

const signal = (pid: number, sig: NodeJS.Signals | 0) => Effect.runSync(Effect.try({ try: () => process.kill(pid, sig), catch: () => "dead" })
  .pipe(Effect.match({ onFailure: () => false, onSuccess: () => true })))
const alive = (pid: number) => signal(pid, 0)
const kill = (pid: number) => Effect.sync(() => signal(pid, "SIGKILL"))

const echo = "process.stdin.once('data', (d) => { process.stdout.write('got:' + d); process.exit(0) })"
const descendant = (options: string) => "const c = require('node:child_process').spawn(process.execPath," +
  ` ['-e', 'setInterval(() => {}, 1000)'], ${options}); process.stdout.write(c.pid + '\\n'); setInterval(() => {}, 1000)`
const pidLine = (live: CapabilityProcessContract.Live) => until(live, (text) => text.endsWith("\n")).pipe(Effect.map((text) => Number(text.trim())))
const hold = "process.stdout.write(String(process.pid) + '\\n'); setInterval(() => {}, 1000)"

describe("CapabilityProcessRegistry", () => {
  it.live("writes exact stdin bytes and the child echoes them", Effect.gen(function* () {
    const h = yield* harness()
    const p = yield* h.start(echo)
    expect(p.live.input()).toBe("open")
    yield* p.live.write(encode("héllo"))
    expect(yield* p.live.exited).toEqual({ code: 0 })
    expect(p.live.output.read(0, 1024)).toMatchObject({ text: "got:héllo", eof: true })
    expect(h.settled).toEqual([{ exit: { code: 0 }, stopped: false }])
  }))

  it.live("close-input delivers EOF; later input fails unsupported_operation", Effect.gen(function* () {
    const h = yield* harness()
    const p = yield* h.start("process.stdin.on('data', () => {}); process.stdin.on('end', () => { process.stdout.write('eof'); process.exit(3) })")
    yield* p.live.closeInput()
    expect(p.live.input()).toBe("closed")
    expect(yield* p.live.exited).toEqual({ code: 3 })
    expect(yield* until(p.live, (text) => text === "eof")).toBe("eof")
    expect((yield* Effect.flip(p.live.write(encode("x")))).code).toBe("unsupported_operation")
    expect((yield* Effect.flip(p.live.closeInput())).code).toBe("unsupported_operation")
  }))

  it.live("the child outlives the interrupted starting fiber", Effect.gen(function* () {
    const h = yield* harness()
    const who = owner()
    const ready = yield* Deferred.make<void>()
    const started = yield* Effect.forkChild(h.start(echo, { owner: who }).pipe(Effect.andThen(Deferred.succeed(ready, undefined)), Effect.andThen(Effect.never)))
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(started)
    const [live] = yield* h.registry.list(who)
    yield* live.write(encode("ping"))
    expect(yield* live.exited).toEqual({ code: 0 })
    expect(live.output.read(0, 1024).text).toBe("got:ping")
  }))

  it.live("merges stdout and stderr in arrival order and reports lost bytes", Effect.gen(function* () {
    // Each next chunk is released by one stdin byte, so arrival order is fixed without timers.
    const script = "const next = [[process.stderr, 'bbbb'], [process.stdout, 'cccc']]; process.stdout.write('aaaa');" +
      "process.stdin.on('data', () => { const [stream, text] = next.shift(); stream.write(text) })"
    const run = (options: CapabilityProcessRegistry.Options) => Effect.gen(function* () {
      const h = yield* harness(options)
      const p = yield* h.start(script)
      yield* Effect.forEach(["aaaa", "bbbb"], (text) =>
        until(p.live, (all) => all.endsWith(text)).pipe(Effect.andThen(p.live.write(encode("1")))), { discard: true })
      yield* until(p.live, (all) => all.endsWith("cccc"))
      yield* p.live.closeInput()
      yield* p.live.exited
      return p.live.output.read(0, 1024)
    })
    expect((yield* run({})).text).toBe("aaaabbbbcccc")
    expect(yield* run({ capacity: 4 })).toMatchObject({ start: 8, end: 12, text: "cccc", lost: { from: 0, to: 8 }, eof: true })
  }))

  posix("stop kills the process tree and settles once as stopped", Effect.gen(function* () {
    const h = yield* harness()
    const p = yield* h.start(descendant("{ stdio: 'ignore' }"))
    const grandchild = yield* pidLine(p.live)
    yield* Effect.gen(function* () {
      expect(alive(grandchild)).toBe(true)
      expect(yield* p.live.stop()).toBe("local-stop")
      expect(yield* p.live.exited).toEqual({ signal: "SIGTERM" })
      expect(yield* gone(grandchild)).toBe(true)
      expect(yield* p.live.stop()).toBe("local-stop")
      expect(h.settled).toEqual([{ exit: { signal: "SIGTERM" }, stopped: true }])
      expect(h.registry.live().has(p.live.ref.id)).toBe(false)
    }).pipe(Effect.ensuring(kill(grandchild)))
  }))

  it.live("a full stdin backlog fails quota_exceeded instead of blocking", Effect.gen(function* () {
    const h = yield* harness()
    const p = yield* h.start(hold)
    const chunk = new Uint8Array(65_536)
    const error = yield* Effect.flip(Effect.forEach(Array.from({ length: 512 }), () => p.live.write(chunk), { discard: true }))
    expect(error.code).toBe("quota_exceeded")
    expect(yield* p.live.stop()).toBe("local-stop")
  }))

  it.live("a safety hold from prepare propagates unchanged; spawn failures are acquisition_failed", Effect.gen(function* () {
    const h = yield* harness()
    const held = new ToolSafety.Denied({ reason: "sandbox" })
    expect(yield* Effect.flip(h.start(hold, { prepare: () => Effect.fail(held) }))).toBe(held)
    const missing = yield* Effect.flip(h.start(hold, { command: ChildProcess.make("/nonexistent/orchestra-binary") }))
    expect(missing).toBeInstanceOf(Capability.Failure)
    expect(missing).toMatchObject({ code: "acquisition_failed" })
    expect(h.registry.live().size).toBe(0)
  }))

  it.live("concurrent duplicate starts spawn once; the loser is denied", Effect.gen(function* () {
    const h = yield* harness()
    const ref = { id: Capability.JobID.create() }
    const slow = { ref, prepare: (command: ChildProcess.Command) => Effect.sleep("100 millis").pipe(Effect.as(command)) }
    const exits = yield* Effect.all([h.start(hold, slow), h.start(hold, slow)].map(Effect.exit), { concurrency: "unbounded" })
    expect(exits.filter(Exit.isSuccess)).toHaveLength(1)
    expect(exits.filter(Exit.isFailure).map((exit) => Option.getOrUndefined(Exit.findErrorOption(exit))))
      .toMatchObject([{ code: "target_denied" }])
    expect([...h.registry.live()]).toEqual([ref.id])
  }))

  posix("records exit codes and signals; a failing settle does not break the registry", Effect.gen(function* () {
    const h = yield* harness()
    const coded = yield* h.start("process.exit(7)")
    expect(yield* coded.live.exited).toEqual({ code: 7 })
    const signalled = yield* h.start("process.kill(process.pid, 'SIGKILL')")
    expect(yield* signalled.live.exited).toEqual({ signal: "SIGKILL" })
    const broken = yield* h.start("process.exit(0)", { settle: () => Effect.die(new Error("settle defect")) })
    expect(yield* broken.live.exited).toEqual({ code: 0 })
    expect(yield* h.registry.get(broken.live.ref, broken.owner)).toBe(broken.live)
    expect(h.settled).toEqual([{ exit: { code: 7 }, stopped: false }, { exit: { signal: "SIGKILL" }, stopped: false }])
  }))

  it.live("unknown and foreign IDs fail identically; list and live are owner-scoped", Effect.gen(function* () {
    const h = yield* harness()
    const p = yield* h.start(hold)
    const other = owner()
    const foreign = yield* Effect.flip(h.registry.get(p.live.ref, other))
    const unknown = yield* Effect.flip(h.registry.get({ id: Capability.JobID.create() }, p.owner))
    expect(foreign).toBeInstanceOf(Capability.Failure)
    expect([foreign.code, unknown.code, foreign.message]).toEqual(["target_denied", "target_denied", unknown.message])
    expect(yield* h.registry.get(p.live.ref, p.owner)).toBe(p.live)
    expect(yield* h.registry.list(p.owner)).toEqual([p.live])
    expect(yield* h.registry.list(other)).toEqual([])
    expect([...h.registry.live()]).toEqual([p.live.ref.id])
    expect(h.registry.startedAt).toBeLessThanOrEqual(Date.now())
    yield* p.live.stop()
  }))

  it.live("transfer swaps the owner atomically and denies the old owner", Effect.gen(function* () {
    const h = yield* harness()
    const p = yield* h.start(hold)
    const parent = owner()
    expect((yield* Effect.flip(p.live.transfer(parent, p.owner))).code).toBe("target_denied")
    yield* p.live.transfer(p.owner, parent)
    expect(p.live.owner()).toEqual(parent)
    expect((yield* Effect.flip(h.registry.get(p.live.ref, p.owner))).code).toBe("target_denied")
    expect(yield* h.registry.get(p.live.ref, parent)).toBe(p.live)
    yield* p.live.stop()
    // An exited entry still swaps owner; retention keeps it readable for the new owner.
    yield* p.live.transfer(parent, p.owner)
    expect(yield* h.registry.get(p.live.ref, p.owner)).toBe(p.live)
    expect((yield* Effect.flip(h.registry.get(p.live.ref, parent))).code).toBe("target_denied")
  }))

  it.effect("evicts exited entries past retention time and count", Effect.gen(function* () {
    const h = yield* harness({ retainMs: 1_000, maxExited: 2 })
    const exit = (who: Capability.Owner) => h.start("process.exit(0)", { owner: who }).pipe(
      Effect.tap((p) => p.live.exited), Effect.tap(() => TestClock.adjust("10 millis")))
    const who = owner()
    const [first, second, third] = [yield* exit(who), yield* exit(who), yield* exit(who)]
    expect((yield* Effect.flip(h.registry.get(first.live.ref, who))).code).toBe("target_denied")
    expect(yield* h.registry.list(who)).toEqual([second.live, third.live])
    yield* TestClock.adjust("985 millis")
    expect(yield* h.registry.get(third.live.ref, who)).toBe(third.live)
    expect((yield* Effect.flip(h.registry.get(second.live.ref, who))).code).toBe("target_denied")
    yield* TestClock.adjust("20 millis")
    expect(yield* h.registry.list(who)).toEqual([])
  }))

  it.live("closing the registry scope kills live children", Effect.gen(function* () {
    const { scope, h } = yield* closable()
    const pids = yield* Effect.forEach([1, 2, 3], () => h.start(hold).pipe(Effect.flatMap((p) => pidLine(p.live))))
    expect(pids.every(alive)).toBe(true)
    yield* Scope.close(scope, Exit.void)
    expect(yield* Effect.forEach(pids, gone)).toEqual([true, true, true])
  }))

  posix("shutdown racing a fresh start still kills the child", Effect.gen(function* () {
    const token = Capability.JobID.create()
    const { scope, h } = yield* closable()
    yield* h.start(`${hold} // ${token}`)
    yield* Scope.close(scope, Exit.void)
    expect(yield* gone(() => Bun.spawnSync(["pgrep", "-f", token]).exitCode === 0)).toBe(true)
  }))

  it.live("shutdown is bounded when an escaped descendant holds the output pipe", Effect.gen(function* () {
    const { scope, h } = yield* closable()
    const p = yield* h.start(descendant("{ detached: true, stdio: ['ignore', 'inherit', 'ignore'] }"))
    const escaped = yield* pidLine(p.live)
    yield* Effect.gen(function* () {
      const began = Date.now()
      yield* Scope.close(scope, Exit.void)
      expect(Date.now() - began).toBeLessThan(8_000)
    }).pipe(Effect.ensuring(kill(escaped)))
  }), 20_000)
})
