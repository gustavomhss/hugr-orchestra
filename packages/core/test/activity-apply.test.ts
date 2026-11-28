import { expect, test } from "bun:test"
import path from "node:path"
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { ActivityActionLedger } from "../src/activity-action-ledger"
import { ActivityArmLedger } from "../src/activity-arm"
import { ActivityApplyService } from "../src/activity-apply"
import { ActivityApplyTable } from "../src/activity-apply.sql"
import { tmpdir } from "./fixture/tmpdir"

test("confirmed apply reserves once and survives service restart", async () => {
  await using directory = await tmpdir()
  const origin = path.join(directory.path, "origin")
  const destination = path.join(directory.path, "quarantine")
  const claims = new Set<string>()
  await mkdir(origin)
  await writeFile(path.join(origin, "fixture"), "owned")
  let mutations = 0
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const actions = yield* ActivityActionLedger.make
    const target = yield* actions.record({ targetID: "fixture", kind: "object", label: "fixture", owner: "test",
      identity: "fixture-identity", members: ["fixture"], dirty: false, eligible: ["arm"] })
    const arm = ActivityArmLedger.make(database, { verify: () => Effect.succeed(true) })
    const armPreview = yield* arm.preview({ targets: [{ targetID: target.targetID, generation: target.generation }] })
    if (!armPreview) throw new Error("missing arm preview")
    const approval = yield* arm.confirm({ previewID: armPreview.previewID })
    if (!approval) throw new Error("missing approval")
    const reading = async (dir: string) => readFile(path.join(dir, "fixture"), "utf8")
      .then(() => ({ state: "present" as const, identity: "fixture-identity" }))
      .catch(() => ({ state: "absent" as const }))
    const facts = async () => ({ original: await reading(origin), quarantine: await reading(destination) })
    const authority: ActivityApplyService.Authority = {
      describe: () => destination,
      authorize: () => Effect.succeed(true),
      prepare: () => Effect.sync(() => {
        if (claims.has("fixture")) return undefined
        claims.add("fixture")
        return { identity: "fixture-identity", release: async () => { claims.delete("fixture") }, adapter: {
          prepare: async () => ({ facts: await facts(), claimant: "absent" as const, mutation: async () => {
            mutations++
            await rename(origin, destination)
            return "accepted" as const
          } }),
          reread: facts,
        } }
      }),
    }
    const service = ActivityApplyService.make(database, { authority })
    const request = { approvalID: approval.approvalID, targetID: target.targetID, generation: target.generation }
    const preview = yield* service.preview(request)
    if (!preview) throw new Error("missing apply preview")
    expect(mutations).toBe(0)
    expect((yield* service.confirm({ previewID: preview.previewID }))?.outcome).toBe("Out")
    expect((yield* service.confirm({ previewID: preview.previewID }))?.outcome).toBe("Out")
    const restarted = ActivityApplyService.make(database, { authority })
    expect((yield* restarted.confirm({ previewID: preview.previewID }))?.outcome).toBe("Out")
    expect(yield* restarted.preview(request)).toBeUndefined()
    expect((yield* restarted.state()).results).toMatchObject([{ ...request, outcome: "Out" }])
    expect(mutations).toBe(1)
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
})

test.each(["second-read", "origin-remains", "revalidation"] as const)("%s settles safely and survives restart", async (scenario) => {
  await using directory = await tmpdir()
  const source = path.join(directory.path, "source")
  const destination = path.join(directory.path, "destination")
  await mkdir(source)
  await writeFile(path.join(source, "fixture"), "owned")
  let mutations = 0
  let authorized = true
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    const actions = yield* ActivityActionLedger.make
    const record = (targetID: string, label = source) => actions.record({ targetID, kind: "object", label, owner: "test",
      identity: "observed-git", members: [targetID], dirty: false, eligible: ["arm"] })
    const target = yield* record("fixture")
    const arms = ActivityArmLedger.make(database, { verify: () => Effect.succeed(true) })
    const armPreview = yield* arms.preview({ targets: [{ targetID: target.targetID, generation: target.generation }] })
    if (!armPreview) throw new Error("missing arm preview")
    const approval = yield* arms.confirm({ previewID: armPreview.previewID })
    if (!approval) throw new Error("missing approval")
    const claims = new Set<string>()
    const authority: ActivityApplyService.Authority = {
      describe: () => destination,
      authorize: () => Effect.sync(() => authorized),
      prepare: () => Effect.sync(() => {
        if (claims.has(source)) return undefined
        claims.add(source)
        return { identity: "native-fixture", release: async () => { claims.delete(source) }, adapter: {
          prepare: async () => ({ facts: { original: { state: "present" as const, identity: "native-fixture" },
            quarantine: { state: "absent" as const } }, claimant: "absent" as const, mutation: async () => {
              mutations++
              if (scenario === "origin-remains") await cp(source, destination, { recursive: true })
              else await rename(source, destination)
              return "accepted" as const
            } }),
          reread: async () => scenario === "origin-remains"
            ? { original: { state: "present" as const, identity: "native-fixture" }, quarantine: { state: "present" as const, identity: "native-fixture" } }
            : { original: { state: "unavailable" as const }, quarantine: { state: "unavailable" as const } },
        } }
      }),
    }
    const service = ActivityApplyService.make(database, { authority })
    const request = { approvalID: approval.approvalID, targetID: target.targetID, generation: target.generation }
    const first = yield* service.preview(request)
    const second = yield* service.preview(request)
    if (!first || !second) throw new Error("missing previews")
    authorized = scenario !== "revalidation"
    const [result, competing] = yield* Effect.all([service.confirm({ previewID: first.previewID }),
      service.confirm({ previewID: second.previewID })], { concurrency: "unbounded" })
    expect(result?.outcome).toBe(scenario === "revalidation" ? "Refused" : "Unknown")
    expect(competing).toBeUndefined()
    expect(mutations).toBe(scenario === "revalidation" ? 0 : 1)
    const restarted = ActivityApplyService.make(database, { authority })
    expect((yield* restarted.state()).results[0]?.outcome).toBe(result?.outcome)
    expect((yield* restarted.confirm({ previewID: first.previewID }))?.outcome).toBe(result?.outcome)
    expect(yield* restarted.preview(request)).toBeUndefined()
    if (scenario !== "revalidation") {
      const changed = yield* record("fixture", source + "/changed")
      const changedPreview = yield* arms.preview({ targets: [{ targetID: changed.targetID, generation: changed.generation }] })
      if (!changedPreview) throw new Error("missing new generation preview")
      const changedApproval = yield* arms.confirm({ previewID: changedPreview.previewID })
      if (!changedApproval) throw new Error("missing new generation approval")
      expect(yield* restarted.preview({ approvalID: changedApproval.approvalID, targetID: changed.targetID, generation: changed.generation })).toBeUndefined()
      const replacement = yield* record("replacement")
      const replacementPreview = yield* arms.preview({ targets: [{ targetID: replacement.targetID, generation: replacement.generation }] })
      if (!replacementPreview) throw new Error("missing replacement preview")
      const replacementApproval = yield* arms.confirm({ previewID: replacementPreview.previewID })
      if (!replacementApproval) throw new Error("missing replacement approval")
      expect(yield* restarted.preview({ approvalID: replacementApproval.approvalID, targetID: replacement.targetID, generation: replacement.generation })).toBeUndefined()
      expect((yield* restarted.state()).eligible).toEqual([])
    }
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
})


test("a reservation left Unknown by a stopped process blocks reuse after restart", async () => {
  await using directory = await tmpdir()
  await Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Service
    yield* database.db.insert(ActivityApplyTable).values({ preview_id: "prior-preview", approval_id: "prior-approval",
      target_id: "prior-target", generation: "1", source: directory.path, destination: path.join(directory.path, "out"),
      identity: "native-identity", outcome: "Unknown" }).run()
    const service = ActivityApplyService.make(database)
    expect(yield* service.state()).toMatchObject({ available: false, results: [{ approvalID: "prior-approval",
      targetID: "prior-target", generation: "1", outcome: "Unknown" }] })
    expect(yield* service.confirm({ previewID: "prior-preview" })).toBeUndefined()
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
})
