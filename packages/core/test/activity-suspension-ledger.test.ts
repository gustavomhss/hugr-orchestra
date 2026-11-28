import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { ActivityActionLedger } from "../src/activity-action-ledger"
import { ActivitySuspensionExecutor } from "../src/activity-suspension-executor"
import { ActivitySuspensionLedger } from "../src/activity-suspension-ledger"
import { tmpdir } from "./fixture/tmpdir"

const observation = (targetID: string) => ({
  targetID,
  kind: "tree" as const,
  label: `worker ${targetID}`,
  owner: "server",
  identity: `native:${targetID}`,
  members: ["member-a", "member-b"],
  dirty: false,
  eligible: ["suspend", "resume"] as const,
})

const withLedgers = <A, E>(
  filename: string,
  owner: string,
  run: (actions: Effect.Success<typeof ActivityActionLedger.make>, marks: ActivitySuspensionLedger.Interface) => Effect.Effect<A, E>,
) => Effect.gen(function* () {
  const actions = yield* ActivityActionLedger.make
  const marks = ActivitySuspensionLedger.make(yield* Database.Service, owner)
  return yield* run(actions, marks)
}).pipe(Effect.provide(Database.layerFromPath(filename)), Effect.scoped)

const recordScope = (actions: Effect.Success<typeof ActivityActionLedger.make>) =>
  Effect.map(actions.record(observation("tree-a")), (tree) => ({ treeID: tree.targetID, generation: tree.generation }))

test("persists suspend intent before effects and settles only confirmed native members", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const initial = await Effect.runPromise(withLedgers(filename, "boot-a", (actions, marks) =>
    Effect.gen(function* () {
      const scope = yield* recordScope(actions)
      const pending = yield* marks.beginSuspend({ scope, members: ["member-a", "member-b"] })
      expect(pending).toMatchObject({ scope, phase: "suspending", suspended: [], pending: { action: "suspend", members: ["member-a", "member-b"] } })
      return { scope, pending }
    }),
  ))
  expect(initial.pending).toBeDefined()

  const settled = await Effect.runPromise(withLedgers(filename, "boot-a", (_actions, marks) =>
    marks.settle({
      scope: initial.scope,
      markID: initial.pending!.markID,
      attemptID: initial.pending!.pending!.id,
      outcomes: [
        { memberID: "member-a", effect: "changed" },
        { memberID: "member-b", effect: "unknown" },
      ],
    }),
  ))
  expect(settled).toMatchObject({ phase: "partial", suspended: ["member-a"], uncertain: ["member-b"] })
})

test("admits only suspended members for the same generation and removes only confirmed resume outcomes", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const suspended = await Effect.runPromise(withLedgers(filename, "boot-a", (actions, marks) =>
    Effect.gen(function* () {
      const scope = yield* recordScope(actions)
      const started = yield* marks.beginSuspend({ scope, members: ["member-a", "member-b"] })
      return yield* marks.settle({
        scope,
        markID: started!.markID,
        attemptID: started!.pending!.id,
        outcomes: [
          { memberID: "member-a", effect: "changed" },
          { memberID: "member-b", effect: "changed" },
        ],
      })
    }),
  ))
  const outcome = await Effect.runPromise(withLedgers(filename, "boot-a", (actions, marks) =>
    Effect.gen(function* () {
      const current = yield* recordScope(actions)
      expect(yield* marks.beginResume({ scope: { ...current, generation: "stale" }, markID: suspended!.markID, members: ["member-a"] })).toBeUndefined()
      expect(yield* marks.beginResume({ scope: current, markID: suspended!.markID, members: ["member-c"] })).toBeUndefined()
      const started = yield* marks.beginResume({ scope: current, markID: suspended!.markID, members: ["member-a", "member-b"] })
      expect(started).toMatchObject({ phase: "resuming", suspended: ["member-a", "member-b"] })
      return yield* marks.settle({
        scope: current,
        markID: started!.markID,
        attemptID: started!.pending!.id,
        outcomes: [
          { memberID: "member-a", effect: "unchanged" },
          { memberID: "member-b", effect: "unknown" },
        ],
      })
    }),
  ))
  expect(outcome).toMatchObject({ phase: "partial", suspended: ["member-a"], uncertain: ["member-b"] })
  await Effect.runPromise(withLedgers(filename, "boot-a", (_actions, marks) =>
    Effect.gen(function* () {
      expect(yield* marks.beginResume({
        scope: outcome!.scope, markID: outcome!.markID, members: ["member-b"],
      })).toBeUndefined()
    }),
  ))
})

test("a restart with another owner incarnation returns unknown and cannot resume or recover pending intent", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const pending = await Effect.runPromise(withLedgers(filename, "boot-a", (actions, marks) =>
    Effect.gen(function* () {
      const scope = yield* recordScope(actions)
      const record = yield* marks.beginSuspend({ scope, members: ["member-a"] })
      return { scope, record }
    }),
  ))
  const afterRestart = await Effect.runPromise(withLedgers(filename, "boot-b", (_actions, marks) =>
    Effect.gen(function* () {
      const read = yield* marks.read("tree-a")
      expect(read).toMatchObject({ markID: pending.record!.markID, phase: "unknown", uncertain: ["member-a"] })
      expect(read?.pending).toBeUndefined()
      expect(yield* marks.beginResume({ scope: pending.scope, markID: pending.record!.markID, members: ["member-a"] })).toBeUndefined()
      expect(yield* marks.settle({
        scope: pending.scope,
        markID: pending.record!.markID,
        attemptID: pending.record!.pending!.id,
        outcomes: [{ memberID: "member-a", effect: "changed" }],
      })).toBeUndefined()
      return read
    }),
  ))
  expect(afterRestart?.phase).toBe("unknown")
  await Effect.runPromise(withLedgers(filename, "boot-a", (_actions, marks) =>
    Effect.gen(function* () {
      expect(yield* marks.settle({
        scope: pending.scope,
        markID: pending.record!.markID,
        attemptID: pending.record!.pending!.id,
        outcomes: [{ memberID: "member-a", effect: "changed" }],
      })).toBeUndefined()
      expect(yield* marks.read("tree-a")).toEqual(afterRestart)
    }),
  ))
})

test("rejects replayed, mismatched, incomplete, duplicate, or malformed native receipts", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const state = await Effect.runPromise(withLedgers(filename, "boot-a", (actions, marks) =>
    Effect.gen(function* () {
      const scope = yield* recordScope(actions)
      const first = yield* marks.beginSuspend({ scope, members: ["member-a", "member-b"] })
      expect(yield* marks.beginSuspend({ scope, members: ["member-a"] })).toBeUndefined()
      const input = (attemptID: string, outcomes: readonly ActivitySuspensionLedger.Outcome[]) => marks.settle({ scope, markID: first!.markID, attemptID, outcomes })
      expect(yield* input("wrong-attempt", [{ memberID: "member-a", effect: "changed" }])).toBeUndefined()
      expect(yield* input(first!.pending!.id, [{ memberID: "member-a", effect: "changed" }])).toBeUndefined()
      expect(yield* input(first!.pending!.id, [
        { memberID: "member-a", effect: "changed" },
        { memberID: "member-a", effect: "changed" },
      ])).toBeUndefined()
      return { scope, first }
    }),
  ))
  const malformed = await Effect.runPromise(withLedgers(filename, "boot-a", (_actions, marks) =>
    marks.settle({
      scope: state.scope,
      markID: state.first!.markID,
      attemptID: state.first!.pending!.id,
      outcomes: [{ memberID: "member-a", effect: "changed" }, { memberID: "member-b", effect: "forged" }] as unknown as readonly ActivitySuspensionLedger.Outcome[],
    }),
  ))
  expect(malformed).toBeUndefined()
})

test("serializes overlapping suspend admissions so only one caller owns the pending attempt", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const results = await Effect.runPromise(withLedgers(filename, "boot-a", (actions, marks) =>
    Effect.gen(function* () {
      const scope = yield* recordScope(actions)
      return yield* Effect.all([
        marks.beginSuspend({ scope, members: ["member-a", "member-b"] }),
        marks.beginSuspend({ scope, members: ["member-b", "member-c"] }),
      ], { concurrency: "unbounded" })
    }),
  ))
  expect(results.filter(Boolean)).toHaveLength(1)
  expect(results.filter((value) => value === undefined)).toHaveLength(1)
})

test("commits the intent before native dispatch and blocks retry when the receipt is lost", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const scope = await Effect.runPromise(withLedgers(filename, "boot-a", (actions) => recordScope(actions)))
  const request = { action: "suspend" as const, scope, members: ["member-a"] }
  const seen: Array<ActivitySuspensionLedger.Record | undefined> = []
  const result = await Effect.runPromise(withLedgers(filename, "boot-a", (_actions, marks) =>
    ActivitySuspensionExecutor.execute(marks, async (_scope, _attempt) => {
      seen.push(await Effect.runPromise(withLedgers(filename, "boot-a", (_actions, reader) => reader.read(scope.treeID))))
      throw new Error("fixture lost the native receipt")
    }, request),
  ))
  expect(seen).toMatchObject([{ phase: "suspending", pending: { members: ["member-a"] } }])
  expect(result).toMatchObject({ phase: "unknown", suspended: [], uncertain: ["member-a"] })
  const replay = await Effect.runPromise(withLedgers(filename, "boot-b", (_actions, marks) =>
    ActivitySuspensionExecutor.execute(marks, async () => {
      seen.push(undefined)
      return [{ memberID: "member-a", effect: "changed" }]
    }, request),
  ))
  expect(replay).toBeUndefined()
  expect(seen).toHaveLength(1)
})
