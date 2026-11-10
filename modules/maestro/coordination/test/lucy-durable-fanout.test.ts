import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { SessionInputTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { call } from "./fixture/lucy-pr-entry"
import { open, stage, type Ctx } from "./fixture/lucy-durable"

// Registered maestro_request_review admits through SessionV2.prompt and drains through SessionExecution.
// The captures are the real nodes. The model stream is the only script.
// ReviewPRFactsV2.read is the Unix-only private replay reader; it refuses Windows before any child.
// Governed review receipts are cross-platform and are not that store.

const scope = (base: string, head: string) => ({ base, head, files: 2, changedLines: 4 })

function run<A, E>(body: (ctx: Ctx) => Effect.Effect<A, E, Database.Service>) {
  expectSpawn(import.meta.path)
  return open(body)
}

describe("lucy durable fanout", () => {
  test(process.platform === "win32"
    ? "Standard PR refuses the unsupported private replay store before durable admission"
    : "Standard admits distinct lens children and reuses the completed facts", () =>
    Effect.runPromise(run((ctx) => Effect.gen(function* () {
      const model = ctx.parent.model
      if (!model) return yield* Effect.die("fixture parent has no model")
      const database = yield* Database.Service
      const before = yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const request = call(ctx.registry, "maestro", ctx.parent.id, { kind: "pr", baseRef: ctx.base, headRef: ctx.head, tier: "standard" })
      if (process.platform === "win32") {
        const refused = yield* request
        expect(refused.type).toBe("error")
        expect(refused.text).toContain("pr-facts-unsupported")
        expect(yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(before)
        const sessions = yield* database.db.select().from(SessionTable).all().pipe(Effect.orDie)
        expect(sessions.filter((row) => row.parent_id === ctx.parent.id)).toEqual([])
        expect(ctx.requests).toEqual([])
        return
      }
      const settled = yield* request.pipe(
        Effect.ensuring(database.db.select().from(SessionInputTable).all().pipe(Effect.orDie, Effect.tap((rows) => Effect.sync(() => {
          expect(rows.length, "registered review must durably admit its prompts, including when execution fails").toBeGreaterThan(before.length)
          expect(rows.some((row) => row.promoted_seq !== null), "the real runner must promote a durable review input").toBe(true)
        })))),
      )
      expect(settled.type).not.toBe("error")
      expect(settled.text).not.toContain("session-execution-unavailable")
      const card = ReviewResultV2.parse(settled.text)
      expect(card?.profile).toBe("pr")
      expect(card?.tier).toBe("standard")
      expect(card?.scope).toEqual(scope(ctx.base, ctx.head))
      expect(card?.findings).toEqual([])

      const sessions = yield* database.db.select().from(SessionTable).all().pipe(Effect.orDie)
      const lead = sessions.find((row) => row.parent_id === ctx.parent.id)
      if (!lead) return yield* Effect.die("pr review created no lead")
      const lenses = sessions.filter((row) => row.parent_id === lead.id)
      expect(lenses.length).toBeGreaterThan(1)
      const entries = yield* Effect.forEach(lenses, (row) => ctx.store.scope(row.id))
      expect(new Set(entries.map((item) => item?.scope.skills.entry)).size).toBe(lenses.length)
      const names = ctx.skills.map((skill) => skill.name)
      for (const item of entries) {
        if (!item) return yield* Effect.die("lens child has no scope")
        expect(item.scope.skills.entry).not.toBe("lucy-review")
        expect(names.some((name) => !item.scope.skills.allow.includes(name))).toBe(true)
      }
      const leadScope = yield* ctx.store.scope(lead.id)
      expect(leadScope?.scope.skills.entry).toBe("lucy-review")
      expect(leadScope?.scope.skills.allow).toEqual([])
      for (const row of [lead, ...lenses]) {
        expect(row.agent).toBe("lucy")
        expect(row.model).toEqual(model)
      }

      const stages = ctx.requests.map((request) => stage(request.text))
      expect(ctx.requests.length).toBe(lenses.length + 2)
      expect(stages[0]).toBe("entry")
      expect(stages.at(-1)).toBe("finish")
      expect(stages.slice(1, -1).every((item) => item === "lens")).toBe(true)
      expect(stages).not.toContain("verify")
      expect(new Set(ctx.requests.map((request) => request.sessionID)).size).toBe(lenses.length + 1)
      expect(ctx.requests[0]?.sessionID).toBe(lead.id)
      expect(ctx.requests.at(-1)?.sessionID).toBe(lead.id)

      const inputs = yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const reviewInputs = inputs.filter((row) => row.session_id !== ctx.parent.id)
      expect(reviewInputs.length).toBe(ctx.requests.length)
      expect(reviewInputs.every((row) => row.promoted_seq !== null)).toBe(true)
      const assistants = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.type, "assistant")).all().pipe(Effect.orDie)
      expect(assistants.length).toBe(ctx.requests.length)

      yield* ctx.sessions.prompt({ sessionID: ctx.parent.id, prompt: { text: "ambient history after the completed review" }, resume: false })
      const admitted = yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      expect(admitted.length).toBe(inputs.length + 1)
      const calls = ctx.requests.length
      const again = yield* call(ctx.registry, "maestro", ctx.parent.id, { kind: "pr", baseRef: ctx.base, headRef: ctx.head, tier: "standard" })
      expect(again.text).toBe(settled.text)
      expect(ctx.requests.length).toBe(calls)
      expect(yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(admitted)
    }))), 60_000)

  test(process.platform === "win32"
    ? "Quick PR refuses the unsupported private replay store before durable admission"
    : "Quick drains hunt and finish in the lead and admits no extra user turn", () =>
    Effect.runPromise(run((ctx) => Effect.gen(function* () {
      const model = ctx.parent.model
      if (!model) return yield* Effect.die("fixture parent has no model")
      const database = yield* Database.Service
      const before = yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const request = call(ctx.registry, "maestro", ctx.parent.id, { kind: "pr", baseRef: ctx.base, headRef: ctx.head, tier: "quick" })
      if (process.platform === "win32") {
        const refused = yield* request
        expect(refused.type).toBe("error")
        expect(refused.text).toContain("pr-facts-unsupported")
        expect(yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(before)
        const sessions = yield* database.db.select().from(SessionTable).all().pipe(Effect.orDie)
        expect(sessions.filter((row) => row.parent_id === ctx.parent.id)).toEqual([])
        expect(ctx.requests).toEqual([])
        return
      }
      const settled = yield* request.pipe(
        Effect.ensuring(database.db.select().from(SessionInputTable).all().pipe(Effect.orDie, Effect.tap((rows) => Effect.sync(() => {
          expect(rows.length, "registered review must durably admit its prompts, including when execution fails").toBeGreaterThan(before.length)
          expect(rows.some((row) => row.promoted_seq !== null), "the real runner must promote a durable review input").toBe(true)
        })))),
      )
      expect(settled.type).not.toBe("error")
      expect(settled.text).not.toContain("session-execution-unavailable")
      const card = ReviewResultV2.parse(settled.text)
      expect(card?.tier).toBe("quick")
      expect(card?.scope).toEqual(scope(ctx.base, ctx.head))
      expect(ctx.requests.map((request) => stage(request.text))).toEqual(["entry", "finish"])
      expect(ctx.requests[1]?.text).toContain("Stage: hunt and finish")
      expect(new Set(ctx.requests.map((request) => request.sessionID)).size).toBe(1)

      const sessions = yield* database.db.select().from(SessionTable).all().pipe(Effect.orDie)
      const lead = sessions.find((row) => row.parent_id === ctx.parent.id)
      if (!lead) return yield* Effect.die("quick review created no lead")
      expect(sessions.filter((row) => row.parent_id === lead.id)).toEqual([])
      expect(lead.agent).toBe("lucy")
      expect(lead.model).toEqual(model)
      const inputs = yield* database.db.select().from(SessionInputTable).where(eq(SessionInputTable.session_id, lead.id)).all().pipe(Effect.orDie)
      expect(inputs.length).toBe(2)
      expect(inputs.every((row) => row.promoted_seq !== null)).toBe(true)
      const users = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, lead.id)).all().pipe(Effect.orDie)
      expect(users.filter((row) => row.type === "user").length).toBe(2)
      expect(users.filter((row) => row.type === "assistant").length).toBe(2)
    }))), 60_000)
})
