import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { ActivityActionLedger } from "../src/activity-action-ledger"
import { ActivityArmLedger } from "../src/activity-arm"
import { ActivityApplyService } from "../src/activity-apply"
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
    const armPreview = yield* arm.preview({ targets: [target] })
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
    expect(yield* restarted.confirm({ previewID: preview.previewID })).toBeUndefined()
    expect(yield* restarted.preview(request)).toBeUndefined()
    expect((yield* restarted.state()).results).toMatchObject([{ ...request, outcome: "Out" }])
    expect(mutations).toBe(1)
  }).pipe(Effect.provide(Database.layerFromPath(path.join(directory.path, "activity.sqlite"))), Effect.scoped))
})
