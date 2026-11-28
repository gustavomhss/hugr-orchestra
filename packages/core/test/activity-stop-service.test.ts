import { expect, test } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { ActivityStopService } from "../src/activity-stop-service"
import { tmpdir } from "./fixture/tmpdir"

const recordID = "11111111-1111-1111-1111-111111111111"

test("refuses changed membership and replay, and fences parallel and uncertain dispatch", async () => {
  await using directory = await tmpdir()
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const state = { members: ["1:1", "2:2"], calls: 0, release: undefined as (() => void) | undefined }
    const service = ActivityStopService.make(database, { observe: async () => ({
      identity: "native-tree", label: "worker", owner: "server", members: [...state.members],
      stop: async (members) => {
        state.calls++
        await new Promise<void>((resolve) => { state.release = resolve })
        return members.map(() => "unknown" as const)
      },
    }) })
    const stale = yield* service.preview({ recordID })
    expect(stale).toBeDefined()
    state.members.push("3:3")
    expect(yield* service.confirm({ previewID: stale!.previewID })).toBeUndefined()
    expect(yield* service.confirm({ previewID: stale!.previewID })).toBeUndefined()
    const first = yield* service.preview({ recordID })
    const second = yield* service.preview({ recordID })
    const pending = Effect.runPromise(service.confirm({ previewID: first!.previewID }))
    yield* Effect.promise(async () => {
      while (!state.release) await new Promise((resolve) => setTimeout(resolve, 1))
    })
    expect(yield* service.confirm({ previewID: second!.previewID })).toBeUndefined()
    state.release()
    expect((yield* Effect.promise(() => pending))?.outcomes.every((outcome) => outcome.state === "unknown")).toBe(true)
    state.members.push("4:4")
    const retry = yield* service.preview({ recordID })
    expect(yield* service.confirm({ previewID: retry!.previewID })).toBeUndefined()
    expect(state.calls).toBe(1)
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
})

test("refuses when the registered owner is unavailable", async () => {
  await using directory = await tmpdir()
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const service = ActivityStopService.make(database, { observe: async () => undefined })
    expect(yield* service.preview({ recordID })).toBeUndefined()
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
})
