import { expect } from "bun:test"
import path from "node:path"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ChildProcess } from "effect/unstable/process"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { WorktreeEvidence } from "@/maestro/worktree-evidence"
import { Git } from "@/git"
import { testEffect } from "../lib/effect"
import { tmpdirScoped } from "../fixture/fixture"
import { relayFor } from "./relay-fixture"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node, CrossSpawnSpawner.node, Git.node])))
const fixture = Effect.fnUntraced(function* () {
  const directory = yield* tmpdirScoped()
  const stateDirectory = yield* tmpdirScoped()
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const git = (args: string[]) => processes.run(ChildProcess.make("git", ["-C", directory, ...args])).pipe(
    Effect.flatMap((result) => result.exitCode === 0 ? Effect.succeed(result.stdout.toString("utf8").trim())
      : Effect.fail(new Error(`fixture git failed: ${result.stderr}`))),
  )
  const write = (file: string, text: string) => fs.writeFileString(path.join(directory, file), text)
  const commit = () => git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"])
  yield* git(["init"])
  yield* fs.makeDirectory(path.join(directory, ".atlas"))
  yield* write("source.txt", "original")
  yield* write(".atlas/memory.jsonl", "{}\n")
  yield* git(["add", "source.txt", ".atlas/memory.jsonl"])
  yield* commit()
  const baseRevision = yield* git(["rev-parse", "HEAD"])
  const relay = yield* relayFor({ directory, projectID: "project" })
  const binding: ArsenalCompletion.Binding = {
    directory, stateDirectory, projectID: "project", sessionID: "parent", taskID: "child",
    callID: "call", planID: "plan", token: "delta-fixture", ownedPaths: ["source.txt", "new.txt"],
  }
  const state = path.join(stateDirectory, "project", "completion", "delta-fixture.json")
  yield* fs.makeDirectory(path.dirname(state), { recursive: true })
  yield* fs.writeFileString(state, JSON.stringify({ schema: 1, projectID: "project", contract: {
    sessionID: "parent", label: "delta", chain: [
      { id: "A", checks: [{ id: "first", hostCheck: "first" }] },
      { id: "B", checks: [{ id: "second", hostCheck: "second" }] },
    ],
  } }))
  const captures: ArsenalCompletion.Capture[] = []
  const ran: string[] = []
  const make = (first: ArsenalCompletion.HostCheck, second: ArsenalCompletion.HostCheck = () => Effect.succeed({ status: "pass" }),
    observe: ArsenalCompletion.Host["observe"] = (_binding, capture) => Effect.sync(() => { captures.push(capture) })) =>
    ArsenalCompletion.make.pipe(Effect.provideService(ArsenalCompletion.NativeHost, {
      resolve: () => Effect.succeed(binding), relay: () => Effect.succeed(relay), observe,
      checks: new Map<string, ArsenalCompletion.HostCheck>([
        ["first", (input) => Effect.sync(() => { ran.push("first") }).pipe(Effect.andThen(() => first(input)))],
        ["second", (input) => Effect.sync(() => { ran.push("second") }).pipe(Effect.andThen(() => second(input)))],
      ]),
    }))
  return { directory, fs, git, write, commit, relay, binding, baseRevision, captures, ran, make }
})

Array.of("source.txt", "new.txt").forEach((file) => {
  it.live(`postdigest guard rejects dirty ${file} content change between real Relay host callbacks`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      yield* f.write(file, "dirty before checks")
      const completion = yield* f.make(() => f.write(file, "changed between checks").pipe(Effect.as({ status: "pass" })),
        () => f.fs.readFileString(path.join(f.directory, file)).pipe(Effect.map((text) => ({ status: text === "changed between checks" ? "pass" : "fail" }))))
      const receipt = yield* completion.beforeDispatch(f.binding)
      const facts: ArsenalCompletion.Facts[] = []
      const failure = yield* Effect.flip(completion.verifiedCompletion(receipt, "child", (value) => Effect.sync(() => { facts.push(value) })))
      expect(failure.reason).toBe("completion-delta-drift")
      expect(f.ran).toEqual(["first", "second"])
      expect(facts).toHaveLength(1)
      expect(facts[0]).toMatchObject({ state: "host-incomplete", hostReason: failure,
        delta: { baseRevision: f.baseRevision, checkedRevision: f.baseRevision } })
      expect(facts[0].receipt).toBeUndefined()
      expect(facts[0].checks).toEqual(f.captures[1])
      // Relay really ran and audited passing checks; those passes cannot bless changed code.
      expect(yield* f.relay.audit(f.binding.token)).toMatchObject({ result: "PASS" })
    }),
  )
})

it.live("Memory exclusion allows tracked and untracked log writes; facts follow actual audited pass and retain dispatch HEAD", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const completion = yield* f.make(() => Effect.gen(function* () {
      yield* f.write(".atlas/memory.jsonl", '{"new":true}\n')
      yield* f.write(".atlas/orientation.jsonl", '{"new":true}\n')
      return { status: "pass" }
    }))
    const receipt = yield* completion.beforeDispatch(f.binding)
    expect(Object.keys(receipt ?? {}).sort()).toEqual(["directory", "planID", "taskID"])
    // Work done after dispatch may move HEAD; baseRevision must stay the real dispatch HEAD.
    yield* f.write("source.txt", "committed task output")
    yield* f.git(["add", "source.txt"])
    yield* f.commit()
    const checkedRevision = yield* f.git(["rev-parse", "HEAD"])
    expect(checkedRevision).not.toBe(f.baseRevision)
    const before = yield* WorktreeEvidence.current(f.directory)
    const facts: ArsenalCompletion.Facts[] = []
    const result = yield* completion.verifiedCompletion(receipt, "child", (value) => Effect.gen(function* () {
      expect(yield* f.relay.audit(f.binding.token).pipe(Effect.orDie)).toMatchObject({ result: "PASS", chain_intact: true })
      facts.push(value)
    }))
    expect(result).toEqual({ verified: true, planID: "plan", taskID: "child", checks: 2 })
    expect(facts[0]).toMatchObject({ state: "host-verified", receipt: result,
      delta: { baseRevision: f.baseRevision, checkedRevision } })
    expect(facts[0].delta?.worktreeDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(facts[0].checks).toEqual(f.captures[1])
    expect(yield* WorktreeEvidence.current(f.directory)).toEqual(before)
    expect(f.ran).toEqual(["first", "second"])
  }),
)

const failingStatuses: ArsenalCompletion.CheckOutcome["status"][] = ["fail", "skip", "missing", "acquisition-error"]
failingStatuses.forEach((status) => {
  it.live(`real ${status} capture determines facts before failure; false worker pass is not input`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const completion = yield* f.make(() => Effect.succeed({ status }))
      const receipt = yield* completion.beforeDispatch(f.binding)
      const worker = { checks: [{ status: "pass" }], card: { verdict: "PASS" } }
      const facts: ArsenalCompletion.Facts[] = []
      const failure = yield* Effect.flip(completion.verifiedCompletion(receipt, "child", (value) => Effect.sync(() => {
        expect(worker.card.verdict).toBe("PASS")
        facts.push(value)
      })))
      expect(facts).toHaveLength(1)
      expect(facts[0].state).toBe(status === "fail" ? "host-failed" : "host-incomplete")
      expect(facts[0].hostReason).toBe(failure)
      expect(failure.reason).toBe("completion-checks-not-passing")
      expect(facts[0].checks).toEqual(f.captures[0])
      expect(facts[0].checks?.results[0].status).toBe(status)
      expect(facts[0].receipt).toBeUndefined()
    }),
  )
})

it.live("unbound and absent receipts publish facts without running host checks", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const completion = yield* f.make(() => Effect.succeed({ status: "pass" }))
    const facts: ArsenalCompletion.Facts[] = []
    const observe = (value: ArsenalCompletion.Facts) => Effect.sync(() => { facts.push(value) })
    expect(yield* completion.verifiedCompletion(undefined, "child", observe)).toBeUndefined()
    expect(facts[0]).toEqual({ state: "not-host-verified" })
    const forged = { directory: f.directory, planID: "plan", taskID: "child" }
    const failure = yield* Effect.flip(completion.verifiedCompletion(forged, "child", observe))
    expect(failure.reason).toBe("completion-receipt-unbound")
    expect(facts[1]).toEqual({ state: "host-incomplete", hostReason: failure })
    expect(f.ran).toEqual([])
  }),
)

Array.of("before", "after").forEach((when) => {
  it.live(`untracked overflow ${when} real checks fails closed with delta acquisition facts`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const overflow = f.write("huge.txt", "x".repeat(8 * 1024 * 1024 + 1))
      const completion = yield* f.make(() => when === "after" ? overflow.pipe(Effect.as({ status: "pass" })) : Effect.succeed({ status: "pass" }))
      const receipt = yield* completion.beforeDispatch(f.binding)
      if (when === "before") yield* overflow
      const facts: ArsenalCompletion.Facts[] = []
      const failure = yield* Effect.flip(completion.verifiedCompletion(receipt, "child", (value) => Effect.sync(() => { facts.push(value) })))
      expect(failure.reason).toBe("completion-delta-acquisition")
      expect(facts[0]).toMatchObject({ state: "host-incomplete", hostReason: failure })
      expect(f.ran).toEqual(when === "before" ? [] : ["first", "second"])
      expect(facts[0].receipt).toBeUndefined()
    }),
  )
})

it.live("durable observer failure preserves typed host reason; facts observer cannot hide it", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const reason = new ToolSafety.Denied({ reason: "native-capture-write-denied", detail: "capture store unavailable" })
    const completion = yield* f.make(() => Effect.succeed({ status: "pass" }), undefined, () => Effect.die(reason))
    const receipt = yield* completion.beforeDispatch(f.binding)
    const facts: ArsenalCompletion.Facts[] = []
    const failure = yield* Effect.flip(completion.verifiedCompletion(receipt, "child", (value) => Effect.sync(() => {
      facts.push(value)
      throw new Error("facts observer defect")
    })))
    expect(failure).toBe(reason)
    expect(facts[0]).toMatchObject({ state: "host-incomplete", hostReason: reason })
    expect(facts[0].receipt).toBeUndefined()
  }),
)

Array.of("git-read", "tracked-overflow").forEach((kind) => {
  it.live(`${kind} after real host callbacks is delta acquisition, never verified`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const completion = yield* f.make(() => Effect.succeed({ status: "pass" }), () => (kind === "git-read"
        ? f.fs.remove(path.join(f.directory, ".git"), { recursive: true })
        : f.write("source.txt", "x".repeat(600 * 1024))).pipe(Effect.as({ status: "pass" })))
      const receipt = yield* completion.beforeDispatch(f.binding)
      const facts: ArsenalCompletion.Facts[] = []
      const failure = yield* Effect.flip(completion.verifiedCompletion(receipt, "child", (value) => Effect.sync(() => { facts.push(value) })))
      expect(failure.reason).toBe("completion-delta-acquisition")
      expect(facts[0]).toMatchObject({ state: "host-incomplete", hostReason: failure })
      expect(facts[0].receipt).toBeUndefined()
      expect(facts[0].checks?.results.every((result) => result.status === "pass")).toBe(true)
      expect(f.ran).toEqual(["first", "second"])
    }),
  )
})

it.live("facts observer defect cannot manufacture success or replace real captured failure", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const completion = yield* f.make(() => Effect.succeed({ status: "fail" }))
    const first = yield* completion.beforeDispatch(f.binding)
    const failure = yield* Effect.flip(completion.verifiedCompletion(first, "child", () => Effect.die("observer defect")))
    expect(failure.reason).toBe("completion-checks-not-passing")
    const passing = yield* f.make(() => Effect.succeed({ status: "pass" }))
    const second = yield* passing.beforeDispatch(f.binding)
    const exit = yield* Effect.exit(passing.verifiedCompletion(second, "child", () => Effect.die("observer defect")))
    expect(Exit.isFailure(exit)).toBe(true)
    expect(yield* f.relay.audit(f.binding.token)).toMatchObject({ result: "PASS" })
  }),
)

it.live("interrupted real host callback publishes incomplete facts before fiber exit", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const ready = yield* Deferred.make<void>()
    const completion = yield* f.make(() => Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never)))
    const receipt = yield* completion.beforeDispatch(f.binding)
    const facts: ArsenalCompletion.Facts[] = []
    const fiber = yield* completion.verifiedCompletion(receipt, "child", (value) => Effect.sync(() => { facts.push(value) })).pipe(Effect.forkChild)
    yield* Deferred.await(ready)
    yield* Fiber.interrupt(fiber)
    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ state: "host-incomplete", hostReason: { reason: "completion-evaluation-interrupted" } })
    expect(facts[0].receipt).toBeUndefined()
    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
  }),
)
