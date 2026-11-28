import { expect, test } from "bun:test"
import { Effect } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Location } from "@orchestra/core/location"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema } from "@orchestra/core/session"
import { SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { reply, run, text } from "./fixture/lucy-engagement"
import { decoded, request } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"

const fixRequest = (reportID: string, findingID: string) => ({
  ...request("fix-review-admission"), fixReview: { reportID, findingIDs: [findingID] },
})

test("fix review rejects an unknown report without admitting a Session or provider work", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const before = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
    const requests = root.requests.length
    const result = yield* host.invoke(fixRequest("a".repeat(64), "C1"))
    expect(result.type).toBe("error")
    expect(result.text).toContain("engagement-evidence-not-found")
    expect(root.requests.length).toBe(requests)
    expect(yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual(before)
  }))))
})

test("fix review requires the retained report to belong to the invoking parent and location", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const report = decoded(yield* host.invoke(request("retained-fix-review-source")))
    const findingID = report.report?.findings[0]?.id
    if (!findingID) return yield* Effect.die("quote finding missing from retained report")
    const foreign = [
      yield* host.sessions.create({ agent: AgentV2.ID.make("maestro"), location: host.parent.location,
        ...(host.parent.model ? { model: host.parent.model } : {}) }),
      yield* host.sessions.create({ agent: AgentV2.ID.make("maestro"),
        location: Location.Ref.make({ directory: AbsolutePath.make(root.global.data) }),
        ...(host.parent.model ? { model: host.parent.model } : {}) }),
    ]
    for (const parent of foreign) {
      const before = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
      const requests = root.requests.length
      const result = yield* host.invoke(fixRequest(report.reportID, findingID), "maestro", SessionSchema.ID.make(parent.id))
      expect(result.type).toBe("error")
      expect(result.text).toContain("engagement-evidence-not-found")
      expect(root.requests.length).toBe(requests)
      expect(yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual(before)
    }
  }), variantAdapter((log, modelRequest) => text(reply(log, modelRequest, { quote: true }))))))
})

test("a retained quote-only finding has no fix recipe and starts no work", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const report = decoded(yield* host.invoke(request("quote-only-fix-review-source")))
    const finding = report.report?.findings[0]
    if (!finding) return yield* Effect.die("quote finding missing from retained report")
    expect(finding.rungs).toEqual(["quote"])
    const before = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
    const requests = root.requests.length
    const result = yield* host.invoke(fixRequest(report.reportID, finding.id))
    expect(result.type).toBe("error")
    expect(result.text).toContain("engagement-fix-review-no-recipe")
    expect(root.requests.length).toBe(requests)
    expect(yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual(before)
  }), variantAdapter((log, modelRequest) => text(reply(log, modelRequest, { quote: true }))))))
})

test("fix review rejects command, install, and fetch controls before any work", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => root.open((host) => Effect.gen(function* () {
    const before = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
    const requests = root.requests.length
    for (const field of ["command", "install", "fetch"]) {
      const result = yield* host.invoke({ ...request("reject-fix-control-" + field),
        fixReview: { reportID: "b".repeat(64), findingIDs: ["C1"], [field]: "benign fixture text" } })
      expect(result.type, field).toBe("error")
    }
    expect(root.requests.length).toBe(requests)
    expect(yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)).toEqual(before)
  }))))
})
