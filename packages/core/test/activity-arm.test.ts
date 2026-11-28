import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { ActivityActionLedger } from "../src/activity-action-ledger"
import { ActivityArmLedger } from "../src/activity-arm"
import { tmpdir } from "./fixture/tmpdir"

const observation = (targetID: string, overrides: Partial<ActivityActionLedger.Observation> = {}) => ({
  targetID,
  kind: "object" as const,
  label: `object ${targetID}`,
  owner: "server",
  identity: `native:${targetID}`,
  members: [targetID],
  dirty: false,
  eligible: ["arm"] as const,
  ...overrides,
})

const withLedgers = <A, E>(
  filename: string,
  run: (ledgers: {
    database: Database.Interface
    actions: Effect.Success<typeof ActivityActionLedger.make>
    arms: ReturnType<typeof ActivityArmLedger.make>
  }) => Effect.Effect<A, E>,
  options?: Parameters<typeof ActivityArmLedger.make>[1],
) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const actions = yield* ActivityActionLedger.make
    return yield* run({ database, actions, arms: ActivityArmLedger.make(database, { verify: () => Effect.succeed(true), ...options }) })
  }).pipe(Effect.provide(Database.layerFromPath(filename)), Effect.scoped)

test("previews exact eligible object targets in request order and confirms one durable receipt", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  await Effect.runPromise(withLedgers(filename, ({ actions, arms, database }) =>
    Effect.gen(function* () {
      const alpha = yield* actions.record(observation("object-a", { label: "Alpha", owner: "backend" }))
      const beta = yield* actions.record(observation("object-b", { label: "Beta", owner: "desktop" }))
      const preview = yield* arms.preview({ targets: [beta, alpha].map(({ targetID, generation }) => ({ targetID, generation })) })
      expect(preview).toMatchObject({
        action: "arm-quarantine",
        targets: [
          { targetID: "object-b", generation: beta.generation, label: "Beta", owner: "desktop" },
          { targetID: "object-a", generation: alpha.generation, label: "Alpha", owner: "backend" },
        ],
      })
      if (!preview) throw new Error("expected preview")
      const receipt = yield* arms.confirm({ previewID: preview.previewID })
      if (!receipt) throw new Error("expected durable receipt")
      expect(receipt).toMatchObject({ action: "arm-quarantine", targets: preview.targets })
      expect(receipt.approvalID).toBeTruthy()
      expect(yield* arms.confirm({ previewID: preview.previewID })).toBeUndefined()
      expect(yield* ActivityArmLedger.list(database)).toEqual([{ receipt, changed: false }])
    }),
  ))
})

test("refuses the whole selection when any generation changed after preview", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  await Effect.runPromise(withLedgers(filename, ({ actions, arms, database }) =>
    Effect.gen(function* () {
      const first = yield* actions.record(observation("object-a"))
      const second = yield* actions.record(observation("object-b"))
      const preview = yield* arms.preview({ targets: [first, second].map(({ targetID, generation }) => ({ targetID, generation })) })
      if (!preview) throw new Error("expected preview")
      yield* actions.record(observation("object-b", { label: "Changed" }))
      expect(yield* arms.confirm({ previewID: preview.previewID })).toBeUndefined()
      expect(yield* ActivityArmLedger.list(database)).toEqual([])
    }),
  ))
})

test("consumes a preview and refuses every receipt when live verification fails for one object", async () => {
  await using directory = await tmpdir()
  const verified: ActivityActionLedger.Target[] = []
  const unavailable = new Set<string>()
  await Effect.runPromise(withLedgers(path.join(directory.path, "activity.sqlite"), ({ actions, arms, database }) =>
    Effect.gen(function* () {
      const first = yield* actions.record(observation("object-a"))
      const second = yield* actions.record(observation("object-b"))
      const preview = yield* arms.preview({ targets: [first, second].map(({ targetID, generation }) => ({ targetID, generation })) })
      if (!preview) throw new Error("expected preview")
      unavailable.add(second.targetID)
      expect(yield* arms.confirm({ previewID: preview.previewID })).toBeUndefined()
      expect(yield* arms.confirm({ previewID: preview.previewID })).toBeUndefined()
      expect(yield* arms.preview({ targets: [{ targetID: second.targetID, generation: second.generation }] })).toBeUndefined()
      expect(verified).toEqual([first, second, first, second, second])
      expect(yield* ActivityArmLedger.list(database)).toEqual([])
    }), {
      verify: (target) => Effect.sync(() => {
        verified.push(target)
        return !unavailable.has(target.targetID)
      }),
    },
  ))
})

test("scopes previews to one factory and one process lifetime", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const { previewID } = await Effect.runPromise(withLedgers(filename, ({ actions, arms }) =>
    Effect.gen(function* () {
      const target = yield* actions.record(observation("object-a"))
      const preview = yield* arms.preview({ targets: [{ targetID: target.targetID, generation: target.generation }] })
      if (!preview) throw new Error("expected preview")
      return preview
    }),
  ))
  await Effect.runPromise(withLedgers(filename, ({ arms }) =>
    arms.confirm({ previewID }).pipe(Effect.map((receipt) => expect(receipt).toBeUndefined())),
  ))
})

test("allows at most one durable receipt when different previews compete for the same target set", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  await Effect.runPromise(withLedgers(filename, ({ actions, arms, database }) =>
    Effect.gen(function* () {
      const target = yield* actions.record(observation("object-a"))
      const request = { targets: [{ targetID: target.targetID, generation: target.generation }] }
      const first = yield* arms.preview(request)
      const second = yield* arms.preview(request)
      if (!first || !second) throw new Error("expected previews")
      const results = yield* Effect.all([
        arms.confirm({ previewID: first.previewID }),
        arms.confirm({ previewID: second.previewID }),
      ], { concurrency: "unbounded" })
      expect(results.filter(Boolean)).toHaveLength(1)
      expect(yield* ActivityArmLedger.list(database)).toHaveLength(1)
    }),
  ))
})

test("refuses duplicate targets, non-object targets, and targets without arm eligibility", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  await Effect.runPromise(withLedgers(filename, ({ actions, arms }) =>
    Effect.gen(function* () {
      const eligible = yield* actions.record(observation("object-a"))
      const ineligible = yield* actions.record(observation("object-b", { eligible: [] }))
      const tree = yield* actions.record(observation("tree-a", { kind: "tree" }))
      const binding = ({ targetID, generation }: ActivityActionLedger.Binding) => ({ targetID, generation })
      expect(yield* arms.preview({ targets: [binding(eligible), binding(eligible)] })).toBeUndefined()
      expect(yield* arms.preview({ targets: [binding(eligible), binding(ineligible)] })).toBeUndefined()
      expect(yield* arms.preview({ targets: [binding(eligible), binding(tree)] })).toBeUndefined()
      expect(yield* arms.preview({ targets: [] })).toBeUndefined()
    }),
  ))
})

test("expires previews at the boundary", async () => {
  await using directory = await tmpdir()
  const filename = path.join(directory.path, "activity.sqlite")
  const clock = { now: 100 }
  await Effect.runPromise(withLedgers(filename, ({ actions, arms }) =>
    Effect.gen(function* () {
      const target = yield* actions.record(observation("object-a"))
      const preview = yield* arms.preview({ targets: [{ targetID: target.targetID, generation: target.generation }] })
      if (!preview) throw new Error("expected preview")
      clock.now = preview.expiresAt
      expect(yield* arms.confirm({ previewID: preview.previewID })).toBeUndefined()
    }),
  { now: () => clock.now }))
})
