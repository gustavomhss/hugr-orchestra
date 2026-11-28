import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { ActivityActionLedger } from "../src/activity-action-ledger"
import { tmpdir } from "./fixture/tmpdir"

const temporary = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()),
)

const observation = (targetID: string, overrides: Partial<ActivityActionLedger.Observation> = {}) => ({
  targetID,
  kind: "tree" as const,
  label: `worker ${targetID}`,
  owner: "server",
  identity: `native:${targetID}`,
  members: [`${targetID}-root`, `${targetID}-child`],
  dirty: false,
  eligible: ["stop-tree"] as const,
  ...overrides,
})

const withLedger = <A, E>(
  filename: string,
  run: (ledger: Effect.Success<typeof ActivityActionLedger.make>) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const ledger = yield* ActivityActionLedger.make
    return yield* run(ledger)
  }).pipe(Effect.provide(Database.layerFromPath(filename)), Effect.scoped)

test("persists generations across reconnects and changes them only when the recorded facts change", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const first = await Effect.runPromise(
    withLedger(filename, (ledger) => ledger.record(observation("tree-a"))),
  )
  const equivalent = await Effect.runPromise(
    withLedger(filename, (ledger) =>
      ledger.record(observation("tree-a", { members: ["tree-a-child", "tree-a-root"] })),
    ),
  )
  expect(equivalent.generation).toBe(first.generation)

  const changedFacts = [
    observation("tree-a", { members: ["tree-a-root", "tree-a-child", "tree-a-extra"] }),
    observation("tree-a", { members: ["tree-a-root"] }),
    observation("tree-a", { identity: "native:replacement" }),
    observation("tree-a", { dirty: true }),
    observation("tree-a", { eligible: [] }),
  ]
  let previous = equivalent
  for (const facts of changedFacts) {
    const next = await Effect.runPromise(withLedger(filename, (ledger) => ledger.record(facts)))
    expect(next.generation).not.toBe(previous.generation)
    previous = next
  }

  const reacquired = await Effect.runPromise(
    withLedger(filename, (ledger) => ledger.record(observation("tree-a"))),
  )
  expect(reacquired.generation).not.toBe(previous.generation)
  expect(reacquired.generation).not.toBe(equivalent.generation)
  expect(
    await Effect.runPromise(
      withLedger(filename, (ledger) => ledger.record(observation("tree-a"))),
    ),
  ).toMatchObject({ generation: reacquired.generation })
})

test("captures exact eligible bindings in request order and refuses the whole invalid, stale, mixed or duplicate set", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  await Effect.runPromise(
    withLedger(filename, (ledger) =>
      Effect.gen(function* () {
        const first = yield* ledger.record(observation("tree-a", { label: "Alpha" }))
        const second = yield* ledger.record(observation("tree-b", { label: "Beta" }))
        const accepted = yield* ledger.capture("stop-tree", [
          { targetID: second.targetID, generation: second.generation },
          { targetID: first.targetID, generation: first.generation },
        ])
        expect(accepted).toEqual([second, first])

        expect(
          yield* ledger.capture("stop-tree", [
            { targetID: first.targetID, generation: first.generation },
            { targetID: "missing", generation: first.generation },
          ]),
        ).toBeUndefined()
        expect(
          yield* ledger.capture("stop-tree", [
            { targetID: first.targetID, generation: first.generation },
            { targetID: second.targetID, generation: "stale-generation" },
          ]),
        ).toBeUndefined()

        const ineligible = yield* ledger.record(observation("tree-c", { eligible: [] }))
        expect(
          yield* ledger.capture("stop-tree", [
            { targetID: first.targetID, generation: first.generation },
            { targetID: ineligible.targetID, generation: ineligible.generation },
          ]),
        ).toBeUndefined()
        expect(
          yield* ledger.capture("stop-tree", [
            { targetID: first.targetID, generation: first.generation },
            { targetID: first.targetID, generation: first.generation },
          ]),
        ).toBeUndefined()
        expect(yield* ledger.capture("suspend", [{ targetID: first.targetID, generation: first.generation }])).toBeUndefined()
      }),
    ),
  )
})

test("keeps concurrent independent records and their captured facts after reopening the database", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const recorded = await Effect.runPromise(
    withLedger(filename, (ledger) =>
      Effect.all(
        ["tree-a", "tree-b", "tree-c"].map((targetID) => ledger.record(observation(targetID))),
        { concurrency: "unbounded" },
      ),
    ),
  )
  const reopened = await Effect.runPromise(
    withLedger(filename, (ledger) =>
      ledger.capture(
        "stop-tree",
        recorded.toReversed().map(({ targetID, generation }) => ({ targetID, generation })),
      ),
    ),
  )
  expect(reopened).toEqual(recorded.toReversed())
})
