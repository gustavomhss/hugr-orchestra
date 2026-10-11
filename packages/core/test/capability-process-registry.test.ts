import { describe, expect } from "bun:test"
import { tmpdir } from "node:os"
import { Agent } from "@orchestra/schema/agent"
import { Capability } from "@orchestra/schema/capability"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { Deferred, Effect, Exit, Fiber, Scope } from "effect"
import { TestClock } from "effect/testing"
import { ChildProcess } from "effect/unstable/process"
import type { CapabilityProcessContract } from "../src/capability/process-control/contract"
import { CapabilityProcessRegistry } from "../src/capability/process-control/registry"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { testEffect } from "./lib/effect"

// Real child processes (bun -e). Qualified on macOS only; Linux and Windows kill-tree are unqualified.
const it = testEffect(LayerNode.compile(AppProcess.node))
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
    const start = (script: string, who = owner(), settle?: CapabilityProcessContract.StartInput["settle"]) =>
      registry.start({
        ref: { id: Capability.JobID.create() }, owner: who,
        command: ChildProcess.make(process.execPath, ["-e", script]), prepare: Effect.succeed,
        settle: settle ?? ((outcome) => Effect.sync(() => { settled.push(outcome) })),
      }).pipe(Effect.map((live) => ({ live, owner: who })))
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

function gone(pid: number): Effect.Effect<boolean> {
  return Effect.gen(function* () {
    for (const _ of Array.from({ length: 100 })) {
      if (!alive(pid)) return true
      yield* Effect.sleep("20 millis")
    }
    return false
  })
}

function alive(pid: number) {
  return Effect.runSync(Effect.try({ try: () => process.kill(pid, 0), catch: () => "dead" }).pipe(Effect.match({ onFailure: () => false, onSuccess: () => true })))
}

const echo = "process.stdin.once('data', (d) => { process.stdout.write('got:' + d); process.exit(0) })"
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
    const started = yield* Effect.forkChild(h.start(echo, who).pipe(Effect.andThen(Deferred.succeed(ready, undefined)), Effect.andThen(Effect.never)))
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(started)
    const [live] = yield* h.registry.list(who)
    yield* live.write(encode("ping"))
    expect(yield* live.exited).toEqual({ code: 0 })
    expect(live.output.read(0, 1024).text).toBe("got:ping")
  }))

  it.live("merges stdout and stderr in arrival order and reports lost bytes", Effect.gen(function* () {
    const script = "process.stdout.write('aaaa'); setTimeout(() => process.stderr.write('bbbb'), 80);" +
      "setTimeout(() => process.stdout.write('cccc'), 160)"
    const wide = yield* (yield* harness()).start(script)
    yield* wide.live.exited
    expect(wide.live.output.read(0, 1024).text).toBe("aaaabbbbcccc")
    const narrow = yield* (yield* harness({ capacity: 4 })).start(script)
    yield* narrow.live.exited
    expect(narrow.live.output.read(0, 1024)).toMatchObject({ start: 8, end: 12, text: "cccc", lost: { from: 0, to: 8 }, eof: true })
  }))

  it.live("stop kills the process tree and settles once as stopped", Effect.gen(function* () {
    const h = yield* harness()
    const p = yield* h.start("const c = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });" +
      "process.stdout.write(c.pid + '\\n'); setInterval(() => {}, 1000)")
    const grandchild = Number((yield* until(p.live, (text) => text.endsWith("\n"))).trim())
    expect(alive(grandchild)).toBe(true)
    expect(yield* p.live.stop()).toBe("local-stop")
    expect(yield* p.live.exited).toEqual({ signal: "SIGTERM" })
    expect(yield* gone(grandchild)).toBe(true)
    expect(yield* p.live.stop()).toBe("local-stop")
    expect(h.settled).toEqual([{ exit: { signal: "SIGTERM" }, stopped: true }])
    expect(h.registry.live().has(p.live.ref.id)).toBe(false)
  }))

  it.live("records exit codes and signals; a failing settle does not break the registry", Effect.gen(function* () {
    const h = yield* harness()
    expect(yield* (yield* h.start("process.exit(7)")).live.exited).toEqual({ code: 7 })
    expect(yield* (yield* h.start("process.kill(process.pid, 'SIGKILL')")).live.exited).toEqual({ signal: "SIGKILL" })
    const broken = yield* h.start("process.exit(0)", owner(), () => Effect.die(new Error("settle defect")))
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
    expect({ code: foreign.code, message: foreign.message }).toEqual({ code: unknown.code, message: unknown.message })
    expect(foreign.code).toBe("target_denied")
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
    expect((yield* Effect.flip(p.live.transfer(parent, p.owner))).code).toBe("unsupported_operation")
  }))

  it.effect("evicts exited entries past retention time and count", Effect.gen(function* () {
    const h = yield* harness({ retainMs: 1_000, maxExited: 2 })
    const exit = (who: Capability.Owner) => h.start("process.exit(0)", who).pipe(
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
    const scope = yield* Scope.make()
    const h = yield* harness().pipe(Scope.provide(scope))
    const p = yield* h.start(hold)
    const pid = Number((yield* until(p.live, (text) => text.endsWith("\n"))).trim())
    expect(alive(pid)).toBe(true)
    yield* Scope.close(scope, Exit.void)
    expect(yield* gone(pid)).toBe(true)
  }))
})
