import { expect } from "bun:test"
import path from "path"
import { Effect, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { ChildProcess } from "effect/unstable/process"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { testEffect } from "../lib/effect"
import { tmpdirScoped } from "../fixture/fixture"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node, CrossSpawnSpawner.node])))
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
const evaluator = Effect.tryPromise({
  // Isolated-worktree conformance may point at D's actual source; assembled-tree default uses its public export.
  try: async (): Promise<unknown> => import(process.env.ARSENAL_COMPLETION_TEST_MODULE ?? "@orchestra/maestro-arsenal"),
  catch: () => new Error("D_COMPLETION_FIXTURE_EXPORT_UNAVAILABLE"),
}).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({
  evaluateCompletion: Schema.declare<ArsenalCompletion.Host["evaluateCompletion"]>(
    (value): value is ArsenalCompletion.Host["evaluateCompletion"] => typeof value === "function",
  ),
  validateHostSnapshot: Schema.declare<(context: { projectID: string }, sessionID: string, supplied: unknown) => unknown>(
    (value): value is (context: { projectID: string }, sessionID: string, supplied: unknown) => unknown => typeof value === "function",
  ),
}))))

it.live("actual registered filesystem check turns red before configured completion can be verified; real D evaluator gates retry", () =>
  Effect.gen(function* () {
    const directory = yield* repository()
    const stateDirectory = yield* tmpdirScoped()
    const fs = yield* FSUtil.Service
    const implementation = yield* evaluator
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
      evaluateCompletion: implementation.evaluateCompletion,
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
  }),
)

it.live("missing check binding and callback overflow HOLD before dispatch; absent contract preserves ordinary Task", () =>
  Effect.gen(function* () {
    const directory = yield* repository()
    const stateDirectory = yield* tmpdirScoped()
    const fs = yield* FSUtil.Service
    const implementation = yield* evaluator
    const binding: ArsenalCompletion.Binding = { directory, stateDirectory, projectID: "project", sessionID: "parent",
      taskID: "child", callID: "call", planID: "plan", token: "arm-fixture", ownedPaths: [] }
    const file = path.join(stateDirectory, "project", "completion", "arm-fixture.json")
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    const host: ArsenalCompletion.Host = { resolve: () => Effect.succeed(binding), checks: new Map(),
      evaluateCompletion: implementation.evaluateCompletion, observe: () => Effect.void }
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
        evaluateCompletion: implementation.evaluateCompletion,
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
