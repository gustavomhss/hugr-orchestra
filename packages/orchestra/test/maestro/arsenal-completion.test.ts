import { expect } from "bun:test"
import path from "path"
import { Effect, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ChildProcess } from "effect/unstable/process"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { testEffect } from "../lib/effect"
import { tmpdirScoped } from "../fixture/fixture"
import { relayFor } from "./relay-fixture"

const it = testEffect(LayerNode.compile(LayerNode.group([
  filesystem,
  FSUtil.node,
  AppProcess.node,
  CrossSpawnSpawner.node,
  Database.node,
  Session.node,
  EventV2Bridge.node,
])))
const repository = (format = "sha1") => Effect.gen(function* () {
  const directory = yield* tmpdirScoped()
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const git = (args: string[]) => processes.run(ChildProcess.make("git", ["-C", directory, ...args])).pipe(
    Effect.flatMap((result) => result.exitCode === 0 ? Effect.void : Effect.fail(new Error("fixture git failed"))),
  )
  yield* git(["init", `--object-format=${format}`])
  yield* fs.writeFileString(path.join(directory, "source.txt"), "fixture")
  yield* git(["add", "source.txt"])
  yield* git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"])
  return directory
})
// D's public snapshot validator; completion itself is evaluated only on the Relay arm.
const evaluator = Effect.tryPromise({
  // Isolated-worktree conformance may point at D's actual source; assembled-tree default uses its public export.
  try: async (): Promise<unknown> => import(process.env.ARSENAL_COMPLETION_TEST_MODULE ?? "@orchestra/maestro-arsenal"),
  catch: () => new Error("D_COMPLETION_FIXTURE_EXPORT_UNAVAILABLE"),
}).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({
  validateHostSnapshot: Schema.declare<(context: { projectID: string }, sessionID: string, supplied: unknown) => unknown>(
    (value): value is (context: { projectID: string }, sessionID: string, supplied: unknown) => unknown => typeof value === "function",
  ),
}))))

it.live("actual registered filesystem check turns red before configured completion can be verified; the Relay arm gates retry", () =>
  Effect.gen(function* () {
    const directory = yield* repository()
    const stateDirectory = yield* tmpdirScoped()
    const fs = yield* FSUtil.Service
    const relay = yield* relayFor({ directory, projectID: "project" })
    const binding: ArsenalCompletion.Binding = {
      directory, stateDirectory, projectID: "project", sessionID: "parent", taskID: "child",
      callID: "call", planID: "plan", token: "arm-fixture", ownedPaths: ["accept.txt"],
    }
    const file = path.join(stateDirectory, "project", "completion", "arm-fixture.json")
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    yield* fs.writeFileString(file, JSON.stringify({ schema: 1, projectID: "project", contract: {
      sessionID: "parent", label: "fixture", chain: [{ id: "gate", checks: [{ id: "filesystem", hostCheck: "filesystem" }] }],
    } }))
    const captures: ArsenalCompletion.Capture[] = []
    const host: ArsenalCompletion.Host = {
      resolve: () => Effect.succeed(binding),
      checks: new Map([["filesystem", () => fs.readFileString(path.join(directory, "accept.txt")).pipe(
        Effect.map((content) => ({ status: content === "accepted" ? "pass" as const : "fail" as const, exitCode: content === "accepted" ? 0 : 1 })),
      )]]),
      relay: () => Effect.succeed(relay),
      observe: (_binding, capture) => Effect.sync(() => { captures.push(capture) }),
    }
    const completion = yield* ArsenalCompletion.make.pipe(Effect.provideService(ArsenalCompletion.NativeHost, host))
    yield* fs.writeFileString(path.join(directory, "accept.txt"), "not accepted")
    const first = yield* completion.beforeDispatch(binding)
    expect((yield* Effect.flip(completion.verifiedCompletion(first, "child"))).reason).toBe("completion-checks-not-passing")
    expect(captures[0].results[0].status).toBe("fail")
    expect(captures[0].results[0].provenance).toMatchObject({ projectID: "project", sessionID: "parent", source: "host-check" })
    yield* fs.writeFileString(path.join(directory, "accept.txt"), "accepted")
    const second = yield* completion.beforeDispatch(binding)
    expect(yield* completion.verifiedCompletion(second, "child")).toEqual({ verified: true, planID: "plan", taskID: "child", checks: 1 })
    expect((yield* Effect.flip(completion.verifiedCompletion(second, "child"))).reason).toBe("completion-receipt-unbound")
    const forged = { taskID: "child", planID: "plan", directory }
    expect((yield* Effect.flip(completion.verifiedCompletion(forged, "child"))).reason).toBe("completion-receipt-unbound")
    // The arm Relay wrote is the record: a keyed chain that verifies, and an audit that passes.
    expect(yield* relay.audit("arm-fixture")).toMatchObject({ chain_intact: true, result: "PASS", exit: 0 })
  }),
)

it.live("missing check binding and callback overflow HOLD before dispatch; absent contract preserves ordinary Task", () =>
  Effect.gen(function* () {
    const directory = yield* repository()
    const stateDirectory = yield* tmpdirScoped()
    const fs = yield* FSUtil.Service
    const binding: ArsenalCompletion.Binding = { directory, stateDirectory, projectID: "project", sessionID: "parent",
      taskID: "child", callID: "call", planID: "plan", token: "arm-fixture", ownedPaths: [] }
    const file = path.join(stateDirectory, "project", "completion", "arm-fixture.json")
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    const relay = yield* relayFor({ directory, projectID: "project" })
    const host: ArsenalCompletion.Host = { resolve: () => Effect.succeed(binding), checks: new Map(),
      relay: () => Effect.succeed(relay), observe: () => Effect.void }
    const completion = yield* ArsenalCompletion.make.pipe(Effect.provideService(ArsenalCompletion.NativeHost, host))
    yield* fs.writeFileString(file, JSON.stringify({ schema: 1, projectID: "project", contract: {
      sessionID: "parent", label: "fixture", chain: [{ id: "gate", checks: [{ id: "missing", hostCheck: "missing" }] }],
    } }))
    expect((yield* Effect.flip(completion.beforeDispatch(binding))).reason).toBe("completion-host-check-unbound")
    yield* fs.writeFileString(file, JSON.stringify({ schema: 1, projectID: "project", contract: {
      sessionID: "parent", label: "fixture", chain: Array.from({ length: 16 }, (_, gate) => ({ id: `gate-${gate}`,
        checks: Array.from({ length: 64 }, (_, check) => ({ id: `check-${gate}-${check}`, hostCheck: "missing" })),
      })),
    } }))
    expect((yield* Effect.flip(completion.beforeDispatch(binding))).reason).toBe("completion-callback-cap-or-duplicate")
    const ordinary = yield* ArsenalCompletion.make
    expect(yield* ordinary.beforeDispatch(binding)).toBeUndefined()
    expect(yield* ordinary.verifiedCompletion(undefined, "child")).toBeUndefined()
  }),
)

Array.of("sha1", "sha256").forEach((format) => {
  it.live(`real ${format} HEAD provenance validates through D host snapshot and completion`, () =>
    Effect.gen(function* () {
      const directory = yield* repository(format)
      const stateDirectory = yield* tmpdirScoped()
      const fs = yield* FSUtil.Service
      const processes = yield* AppProcess.Service
      const implementation = yield* evaluator
      const relay = yield* relayFor({ directory, projectID: "project" })
      const binding: ArsenalCompletion.Binding = { directory, stateDirectory, projectID: "project", sessionID: "parent",
        taskID: "child", callID: "call", planID: "plan", token: "arm-fixture", ownedPaths: ["source.txt"] }
      const file = path.join(stateDirectory, "project", "completion", "arm-fixture.json")
      yield* fs.makeDirectory(path.dirname(file), { recursive: true })
      yield* fs.writeFileString(file, JSON.stringify({ schema: 1, projectID: "project", contract: {
        sessionID: "parent", label: "provenance", chain: [{ id: "gate", checks: [{ id: "filesystem", hostCheck: "filesystem" }] }],
      } }))
      const head = (yield* processes.run(ChildProcess.make("git", ["-C", directory, "rev-parse", "HEAD"]))).stdout.toString("utf8").trim()
      expect(head).toHaveLength(format === "sha1" ? 40 : 64)
      const captures: ArsenalCompletion.Capture[] = []
      const completion = yield* ArsenalCompletion.make.pipe(Effect.provideService(ArsenalCompletion.NativeHost, {
        resolve: () => Effect.succeed(binding),
        checks: new Map([["filesystem", () => fs.readFileString(path.join(directory, "source.txt")).pipe(
          Effect.map((content) => ({ status: content === "fixture" ? "pass" as const : "fail" as const, exitCode: content === "fixture" ? 0 : 1 })),
        )]]),
        relay: () => Effect.succeed(relay),
        observe: (_binding, capture) => Effect.sync(() => {
          expect(implementation.validateHostSnapshot({ projectID: "project" }, "parent", {
            complete: true, usage: [], actions: [{ tool: "completion", outcome: "succeeded", provenance: capture.results[0].provenance }], checks: capture,
          })).toMatchObject({ checks: capture })
          captures.push(capture)
        }),
      }))
      const receipt = yield* completion.beforeDispatch(binding)
      expect(yield* completion.verifiedCompletion(receipt, "child")).toMatchObject({ verified: true })
      expect(captures[0].results[0].provenance).toMatchObject({ source: "host-check", projectID: "project", sessionID: "parent", revision: head, revisionKind: "git" })
      expect((yield* Effect.flip(completion.verifiedCompletion(receipt, "child"))).reason).toBe("completion-receipt-unbound")
      const unknown = yield* completion.beforeDispatch(binding)
      yield* fs.remove(path.join(directory, ".git"), { recursive: true })
      expect((yield* Effect.flip(completion.verifiedCompletion(unknown, "child"))).reason).toBe("completion-git-failed-or-overflow")
      expect((yield* Effect.flip(completion.beforeDispatch(binding))).reason).toBe("completion-git-failed-or-overflow")
      expect(captures).toHaveLength(1)
    }),
  )
})

// A contract armed under "arm-fixture" in a fresh repository. Check `x` passes while `x.txt` says "pass"; every run is
// listed in `ran`, and every observation in `captures`.
const armed = (contract: { readonly retryBudget?: number; readonly chain: ReadonlyArray<{ readonly id: string; readonly checks: ReadonlyArray<{ readonly id: string; readonly hostCheck: string }> }> }) =>
  Effect.gen(function* () {
    const directory = yield* repository()
    const stateDirectory = yield* tmpdirScoped()
    const fs = yield* FSUtil.Service
    const relay = yield* relayFor({ directory, projectID: "project" })
    const binding: ArsenalCompletion.Binding = { directory, stateDirectory, projectID: "project", sessionID: "parent",
      taskID: "child", callID: "call", planID: "plan", token: "arm-fixture", ownedPaths: [] }
    const state = path.join(stateDirectory, "project", "completion", "arm-fixture.json")
    yield* fs.makeDirectory(path.dirname(state), { recursive: true })
    const store = (label: string) =>
      fs.writeFileString(state, JSON.stringify({ schema: 1, projectID: "project", contract: { sessionID: "parent", label, ...contract } }))
    yield* store("fixture")
    const ran: string[] = []
    const captures: ArsenalCompletion.Capture[] = []
    const names = [...new Set(contract.chain.flatMap((gate) => gate.checks.map((check) => check.hostCheck)))]
    const checks = new Map(names.map((name): [string, ArsenalCompletion.HostCheck] => [name, () =>
      fs.readFileString(path.join(directory, `${name}.txt`)).pipe(
        Effect.orElseSucceed(() => ""),
        Effect.map((text) => {
          ran.push(name)
          return { status: text === "pass" ? "pass" as const : "fail" as const, exitCode: text === "pass" ? 0 : 1 }
        }),
      )]))
    const completion = yield* ArsenalCompletion.make.pipe(Effect.provideService(ArsenalCompletion.NativeHost, {
      resolve: () => Effect.succeed(binding),
      checks,
      relay: () => Effect.succeed(relay),
      observe: (_binding, capture) => Effect.sync(() => { captures.push(capture) }),
    }))
    const set = (name: string, text: string) => fs.writeFileString(path.join(directory, `${name}.txt`), text)
    const complete = completion.beforeDispatch(binding).pipe(
      Effect.flatMap((receipt) => completion.verifiedCompletion(receipt, "child")),
    )
    const held = complete.pipe(Effect.flip)
    return { directory, relay, binding, completion, ran, captures, set, complete, held, store }
  })

const twoGates = { chain: [{ id: "A", checks: [{ id: "a", hostCheck: "a" }] }, { id: "B", checks: [{ id: "b", hostCheck: "b" }] }] }

it.live("one completion grades every gate in order, records each gate's checks before its disposition and audits PASS", () =>
  Effect.gen(function* () {
    const arm = yield* armed(twoGates)
    yield* arm.set("a", "pass")
    yield* arm.set("b", "pass")
    expect(yield* arm.complete).toEqual({ verified: true, planID: "plan", taskID: "child", checks: 2 })
    // Each check ran once: a gate this evaluation already graded is not re-run for the next one.
    expect(arm.ran).toEqual(["a", "b"])
    expect(arm.captures.map((capture) => capture.results.map((result) => result.name))).toEqual([["a"], ["a", "b"]])
    const audit = yield* arm.relay.audit("arm-fixture")
    expect(audit).toMatchObject({ chain_intact: true, result: "PASS", oracle_recheck: { status: "ok" } })
    expect(audit.controls.map((control) => [control.id, control.verdict])).toEqual([["a", "pass"], ["b", "pass"]])
  }),
)

it.live("a later completion re-runs the gates it accepted, so a gate that regressed never passes", () =>
  Effect.gen(function* () {
    const arm = yield* armed(twoGates)
    yield* arm.set("a", "pass")
    expect((yield* arm.held).reason).toBe("completion-checks-not-passing")
    yield* arm.set("b", "pass")
    yield* arm.set("a", "broken")
    arm.ran.length = 0
    expect((yield* arm.held).reason).toBe("completion-checks-not-passing")
    expect(arm.ran).toEqual(["b", "a"])
    yield* arm.set("a", "pass")
    expect(yield* arm.complete).toMatchObject({ verified: true, checks: 2 })
  }),
)

it.live("a HEAD that moves during the checks holds completion-revision-drift and records no disposition", () =>
  Effect.gen(function* () {
    const arm = yield* armed({ chain: [{ id: "A", checks: [{ id: "a", hostCheck: "a" }] }] })
    const processes = yield* AppProcess.Service
    const fs = yield* FSUtil.Service
    const moved = { done: false }
    const git = (args: string[]) => processes.run(ChildProcess.make("git", ["-C", arm.directory, ...args]))
    const completion = yield* ArsenalCompletion.make.pipe(Effect.provideService(ArsenalCompletion.NativeHost, {
      resolve: () => Effect.succeed(arm.binding),
      // The first run commits while it checks; later runs leave HEAD alone.
      checks: new Map([["a", () => Effect.gen(function* () {
        if (!moved.done) {
          moved.done = true
          yield* fs.writeFileString(path.join(arm.directory, "moved.txt"), "moved")
          yield* git(["add", "moved.txt"])
          yield* git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "moved"])
        }
        return { status: "pass" as const, exitCode: 0 }
      })]]),
      relay: () => Effect.succeed(arm.relay),
      observe: () => Effect.void,
    }))
    const receipt = yield* completion.beforeDispatch(arm.binding)
    expect((yield* Effect.flip(completion.verifiedCompletion(receipt, "child"))).reason).toBe("completion-revision-drift")
    // No verdict and no disposition reached the arm's ledger.
    expect((yield* Effect.flip(arm.relay.audit("arm-fixture")))._tag).toBe("LedgerRead.Missing")
    const next = yield* completion.beforeDispatch(arm.binding)
    expect(yield* completion.verifiedCompletion(next, "child")).toMatchObject({ verified: true, checks: 1 })
  }),
)

it.live("an arm that already passed every gate cannot verify more work and says so", () =>
  Effect.gen(function* () {
    const arm = yield* armed({ chain: [{ id: "A", checks: [{ id: "a", hostCheck: "a" }] }] })
    yield* arm.set("a", "pass")
    expect(yield* arm.complete).toMatchObject({ verified: true })
    const again = yield* arm.held
    expect(again.reason).toBe("completion-evaluation-acquisition")
    expect(again.message).toBe(
      "Tool safety HOLD: completion-evaluation-acquisition. This arm already passed every gate and cannot verify new " +
        "work; arm a new contract for the next task.",
    )
  }),
)

it.live("a contract changed under the same token is completion-contract-drift at dispatch and at completion", () =>
  Effect.gen(function* () {
    const arm = yield* armed({ chain: [{ id: "A", checks: [{ id: "a", hostCheck: "a" }] }] })
    const receipt = yield* arm.completion.beforeDispatch(arm.binding)
    yield* arm.store("changed")
    expect((yield* Effect.flip(arm.completion.verifiedCompletion(receipt, "child"))).reason).toBe("completion-contract-drift")
    expect((yield* Effect.flip(arm.completion.beforeDispatch(arm.binding))).reason).toBe("completion-contract-drift")
    expect(arm.ran).toEqual([])
  }),
)
