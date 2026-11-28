import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { ActivityFreezeService } from "../src/activity-freeze-service"
import { Database } from "../src/database/database"
import { tmpdir } from "./fixture/tmpdir"

const recordID = "11111111-1111-4111-8111-111111111111"

test("freezes only a freshly previewed singleton and resumes its exact mark", async () => {
  await using directory = await tmpdir()
  const calls: string[] = []
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const service = ActivityFreezeService.make(database, { observe: async () => ({
      identity: "tree-a", label: "worker", owner: "server", member: "123:456",
      apply: async (action) => { calls.push(action); return "changed" },
    }) })
    expect((yield* service.read({ recordID }))?.next).toBe("suspend")
    const preview = yield* service.preview({ recordID, action: "suspend" })
    expect(preview).toBeDefined()
    const receipt = yield* service.confirm({ previewID: preview!.previewID })
    expect(receipt?.phase).toBe("suspended")
    expect(yield* service.confirm({ previewID: preview!.previewID })).toBeUndefined()
    expect((yield* service.read({ recordID }))?.next).toBe("resume")
    const resume = yield* service.preview({ recordID, action: "resume" })
    expect((yield* service.confirm({ previewID: resume!.previewID }))?.markID).toBe(receipt?.markID)
    expect((yield* service.read({ recordID }))?.next).toBe("suspend")
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
  expect(calls).toEqual(["suspend", "resume"])
})

test("rejects changed membership and blocks after an unknown native result", async () => {
  await using directory = await tmpdir()
  const member = { value: "123:456" }
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const service = ActivityFreezeService.make(database, { observe: async () => ({
      identity: "tree-a", label: "worker", owner: "server", member: member.value, apply: async () => "unknown",
    }) })
    const stale = yield* service.preview({ recordID, action: "suspend" })
    member.value = "123:457"
    expect(yield* service.confirm({ previewID: stale!.previewID })).toBeUndefined()
    const preview = yield* service.preview({ recordID, action: "suspend" })
    expect((yield* service.confirm({ previewID: preview!.previewID }))?.phase).toBe("unknown")
    expect((yield* service.read({ recordID }))?.next).toBe("blocked")
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
})
