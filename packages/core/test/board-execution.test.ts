import { describe, expect } from "bun:test"
import { DateTime, Effect } from "effect"
import { eq, sql } from "drizzle-orm"
import { LLMEvent } from "@orchestra/llm"
import { EventV2 } from "@orchestra/core/event"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionProjector } from "@orchestra/core/session/projector"
import { createLLMEventPublisher } from "@orchestra/core/session/runner/publish-llm-event"
import { Board } from "@orchestra/core/board/board"
import { BoardThread } from "@orchestra/core/board/thread"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ProjectTable } from "@orchestra/core/project/sql"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { SessionLegacyTranscript } from "../src/session/legacy-transcript"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Board.node, Database.node, EventV2.node, SessionProjector.node])))

describe("Board execution report", () => {
  it.live("C2/C5: unknown legacy authorship stays unknown; each terminal cycle keeps its immutable receipt", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "RCPT", name: "Receipts", reason: "Start." })
      yield* board.issue({ project: "RCPT", title: "Historical card", seat: "backend", reason: "Plan." })
      const initial = yield* board.execution("RCPT", 1)
      expect(initial.creator).toBeNull()
      expect(initial.metrics.tokens).toBeNull()
      expect(initial.metrics.modelUsd).toBeNull()
      expect(initial.receipts).toEqual([])
      yield* board.move({ project: "RCPT", number: 1, stage: "cut", reason: "Not needed." })
      const first = (yield* board.execution("RCPT", 1)).receipts
      expect(first).toHaveLength(1)
      expect(first[0]).toMatchObject({ stage: "cut", attempts: 0, metrics: { tokens: null, modelUsd: null, partial: true } })
      yield* board.move({ project: "RCPT", number: 1, stage: "backlog", reason: "Reopen." })
      yield* board.move({ project: "RCPT", number: 1, stage: "shipped", reason: "Documentation only; no PR." })
      const second = (yield* board.execution("RCPT", 1)).receipts
      expect(second).toHaveLength(2)
      expect(second[0]).toEqual(first[0])
      expect(second[1].stage).toBe("shipped")
      yield* board.move({ project: "RCPT", number: 1, stage: "backlog", reason: "Reopen again." })
      yield* board.move({ project: "RCPT", number: 1, stage: "cut", reason: "Close again." })
      expect((yield* board.execution("RCPT", 1)).receipts.slice(0, 2)).toEqual([...second])
    }),
  )

  it.live("C3/C4/C7: all attempts and nested descendants use historical models once, excluding conflicting cards", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "HIST", name: "History", reason: "Start." })
      yield* session("ses_hist_first")
      yield* session("ses_hist_child", "ses_hist_first")
      yield* session("ses_hist_grandchild", "ses_hist_child")
      yield* session("ses_hist_second")
      yield* session("ses_hist_foreign")
      yield* session("ses_hist_review")
      const issue = yield* board.issue({ project: "HIST", title: "Work", session: "ses_hist_first", seat: "backend", branch: "first", reason: "Dispatch." })
      yield* turn("ses_hist_first", "old-model", 10, 0.1)
      yield* turn("ses_hist_child", "child-model", 20, 0.2)
      yield* turn("ses_hist_grandchild", "deep-model", 30, 0.3)
      yield* board.issue({ project: "HIST", number: 1, crash_reason: "Provider failed", reason: "Failure." })
      yield* board.issue({ project: "HIST", number: 1, session: "ses_hist_second", branch: "rework", pr: 9, reason: "Retry." })
      yield* turn("ses_hist_second", "new-model", 40, 0.4)
      yield* turn("ses_hist_second", "switched-model", 50, 0.5)
      yield* turn("ses_hist_review", "review-model", 60, 0.6)
      yield* turn("ses_hist_foreign", "foreign-model", 999, 99)
      yield* board.issue({ project: "HIST", title: "Other card", session: "ses_hist_foreign", reason: "Foreign." })
      yield* BoardThread.write(database.db, { id: "bno_hist_review", issue: issue.issue!.id, kind: "review", author: "review", body: "Original verdict", attempt: 2, sessionID: "ses_hist_review" }).pipe(Effect.orDie)
      yield* BoardThread.write(database.db, { id: "bno_hist_legacy", issue: issue.issue!.id, kind: "brief", author: "backend", body: "Unassociated historical document" }).pipe(Effect.orDie)
      const report = yield* board.execution("HIST", 1)
      expect(report.attempts.map((attempt) => [attempt.n, attempt.branch, attempt.prNumber, attempt.outcome])).toEqual([
        [1, "first", null, "failed"], [2, "rework", 9, null],
      ])
      expect(report.attempts[0].models.map((entry) => String(entry.model.id)).toSorted()).toEqual(["child-model", "deep-model", "old-model"])
      expect(report.attempts[1].models.map((entry) => String(entry.model.id)).toSorted()).toEqual(["new-model", "review-model", "switched-model"])
      expect(report.metrics).toMatchObject({ tokens: { input: 210, output: 21, reasoning: 42, cacheRead: 63, cacheWrite: 84 }, providerMs: 600, toolUses: 6 })
      expect(report.metrics.modelUsd).toBeCloseTo(2.1)
      expect(report.attempts[0].metrics.partial).toBe(false)
      expect(report.attempts[1].participants.find((entry) => entry.sessionID === "ses_hist_review")).toMatchObject({ role: "review", seats: ["historical-seat"] })
      const notes = (yield* board.issuePage("HIST", 1)).notes
      expect(notes.find((note) => note.id === "bno_hist_legacy")).toMatchObject({ attempt: null, body: "Unassociated historical document" })
      expect(notes.find((note) => note.id === "bno_hist_review")).toMatchObject({ attempt: 2, sessionID: "ses_hist_review", body: "Original verdict" })

      // One session claimed by two cards must be excluded from both, including its nested descendants.
      yield* board.issue({ project: "HIST", number: 2, session: "ses_hist_child", reason: "Shared execution is ambiguous." })
      const shared = yield* board.execution("HIST", 1)
      expect(shared.unattributedSessions.toSorted()).toEqual(["ses_hist_child", "ses_hist_grandchild"])
      expect(shared.metrics.tokens?.input).toBe(160)
      expect(shared.metrics.partial).toBe(true)
      expect(shared.attempts[0].metrics.partial).toBe(true)
      expect((yield* BoardThread.bySession(database.db, "ses_hist_second"))?.id).toBe(issue.issue!.id)
      yield* board.issue({ project: "HIST", title: "Conflicting current session", session: "ses_hist_second", reason: "Ambiguous ownership." })
      expect(yield* BoardThread.bySession(database.db, "ses_hist_second")).toBeUndefined()
    }),
  )

  it.live("C4: subscription cost is unknown, but measured zero token counters and tools stay zero", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "SUBS", name: "Subscription", reason: "Start." })
      yield* session("ses_hist_subscription")
      yield* board.issue({ project: "SUBS", title: "Subscription work", session: "ses_hist_subscription", reason: "Dispatch." })
      yield* turn("ses_hist_subscription", "subscription-model", 0, 0, "claude-code")
      const report = yield* board.execution("SUBS", 1)
      expect(report.metrics).toMatchObject({ tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, modelUsd: null, partial: true, toolUses: 0 })
      expect(report.attempts[0].models[0]).toMatchObject({ usd: null, billing: "subscription" })
    }),
  )

  it.live("C5: a measured receipt does not change when its Session later records more work", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "SEAL", name: "Sealed", reason: "Start." })
      yield* session("ses_sealed")
      yield* board.issue({ project: "SEAL", title: "Measure", session: "ses_sealed", reason: "Dispatch." })
      yield* turn("ses_sealed", "original", 100, 1)
      yield* board.move({ project: "SEAL", number: 1, stage: "shipped", reason: "No PR needed." })
      const receipt = (yield* board.execution("SEAL", 1)).receipts[0]
      expect(receipt.metrics.tokens?.input).toBe(100)
      yield* turn("ses_sealed", "later", 200, 2)
      const report = yield* board.execution("SEAL", 1)
      expect(report.metrics.tokens?.input).toBe(300)
      expect(report.receipts[0]).toEqual(receipt)
      expect((yield* board.move({ project: "SEAL", number: 1, stage: "shipped", reason: "Exact repeat." }).pipe(Effect.flip))).toBeDefined()
      expect((yield* board.execution("SEAL", 1)).receipts).toHaveLength(1)
    }),
  )

  it.live("C4: positive host estimates without per-turn billing provenance are not presented as API charges", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "HOST", name: "Host cost provenance", reason: "Start." })
      yield* session("ses_host_estimate")
      yield* board.issue({ project: "HOST", title: "Hosted work", session: "ses_host_estimate", reason: "Dispatch." })
      yield* turn("ses_host_estimate", "recorded-model", 100, 1.25, "anthropic", "unavailable")
      // A historical host marker is not the current agent/model configuration, and it does not attest API billing.
      yield* database.db.update(SessionTable).set({ metadata: { claudeCode: { sessionId: "native-host-session" } } })
        .where(eq(SessionTable.id, SessionV2.ID.make("ses_host_estimate"))).run().pipe(Effect.orDie)
      const report = yield* board.execution("HOST", 1)
      expect(report.metrics).toMatchObject({ tokens: { input: 100 }, modelUsd: null, partial: true })
      expect(report.models[0]).toMatchObject({ usd: null, billing: "unavailable" })
    }),
  )

  it.live("C4: overlapping roots on the same card are counted once without guessing their attempt", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      yield* board.project({ key: "OVER", name: "Overlap", reason: "Start." })
      yield* session("ses_overlap_root")
      yield* session("ses_overlap_child", "ses_overlap_root")
      yield* turn("ses_overlap_root", "parent-model", 10, 0.1)
      yield* turn("ses_overlap_child", "child-model", 20, 0.2)
      yield* board.issue({ project: "OVER", title: "Work", session: "ses_overlap_root", reason: "Dispatch." })
      yield* board.issue({ project: "OVER", number: 1, session: "ses_overlap_child", reason: "Second attempt adopts a descendant." })
      const report = yield* board.execution("OVER", 1)
      expect(report.metrics.tokens?.input).toBe(30)
      expect(report.unattributedSessions).toEqual([])
      expect(report.unassignedSessions).toEqual(["ses_overlap_child"])
      expect(report.attempts[0].metrics.tokens?.input).toBe(10)
      expect(report.attempts[1].metrics.tokens).toBeNull()
      expect(report.models.map((entry) => String(entry.model.id)).toSorted()).toEqual(["child-model", "parent-model"])
    }),
  )

  it.live("C3/C4: historical amounts without provenance remain unknown, and migrated dual projections count once", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "OLD", name: "Legacy turns", reason: "Start." })
      yield* session("ses_legacy_turns")
      yield* board.issue({ project: "OLD", title: "Historical", session: "ses_legacy_turns", reason: "Dispatch." })
      const id = SessionLegacyTranscript.MessageID.make("msg_legacy_usage")
      const data = {
        role: "assistant" as const, agent: "legacy-seat", modelID: Model.ID.make("legacy-model"), providerID: Provider.ID.make("legacy-provider"),
        time: { created: 100, completed: 200 }, cost: 0.5,
        tokens: { input: 70, output: 7, reasoning: 14, cache: { read: 21, write: 28 } },
      }
      yield* database.db.insert(MessageTable).values({ id, session_id: SessionV2.ID.make("ses_legacy_turns"), data }).run().pipe(Effect.orDie)
      const part = { type: "tool" as const, tool: "read", callID: "legacy-call" }
      yield* database.db.insert(PartTable).values({
        id: SessionLegacyTranscript.PartID.make("prt_legacy_usage"), message_id: id, session_id: SessionV2.ID.make("ses_legacy_turns"),
        data: part,
      }).run().pipe(Effect.orDie)
      const legacy = yield* board.execution("OLD", 1)
      expect(legacy.metrics).toMatchObject({ tokens: null, modelUsd: null, providerMs: 100, toolUses: 1, partial: true })
      expect(legacy.models[0].model.id).toBe(Model.ID.make("legacy-model"))
      const current = { agent: "legacy-seat", model: { id: data.modelID, providerID: data.providerID }, time: data.time, cost: data.cost, tokens: data.tokens, content: [], usageKnown: true, costSource: "provider" as const }
      yield* database.db.insert(SessionMessageTable).values({ id: SessionMessage.ID.make(id), session_id: SessionV2.ID.make("ses_legacy_turns"), seq: 1, type: "assistant", data: current }).run().pipe(Effect.orDie)
      expect((yield* board.execution("OLD", 1)).metrics.tokens?.input).toBe(70)
      expect((yield* board.execution("OLD", 1)).metrics.modelUsd).toBe(0.5)
    }),
  )

  it.live("C4: real settlement projection preserves unknown usage and cost sources, including historical event fallback", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      yield* board.project({ key: "SRC", name: "Source provenance", reason: "Start." })
      yield* session("ses_source_provenance")
      yield* board.issue({ project: "SRC", title: "Unknown usage", session: "ses_source_provenance", reason: "Dispatch." })
      const id = SessionV2.ID.make("ses_source_provenance")
      const model = { id: Model.ID.make("oauth-model"), providerID: Provider.ID.make("openai") }
      const publisher = createLLMEventPublisher(events, { sessionID: id, agent: "backend", model })
      yield* publisher.publish(LLMEvent.textStart({ id: "text_missing_usage" }))
      yield* publisher.publish(LLMEvent.stepFinish({ index: 0, reason: "stop" }))
      const settlement = publisher.stepSettlement()!
      expect(settlement.usageKnown).toBe(false)
      expect(settlement.tokens.input).toBe(0)
      const row = yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.session_id, id)).get().pipe(Effect.orDie)
      yield* events.publish(SessionEvent.Step.Ended, {
        sessionID: id, assistantMessageID: row!.id, timestamp: DateTime.makeUnsafe(Date.now()), finish: "stop",
        tokens: settlement.tokens, usageKnown: settlement.usageKnown, cost: 1.25, costSource: "catalog",
      })
      const projected = (yield* database.db.select().from(SessionMessageTable).where(eq(SessionMessageTable.id, row!.id)).get().pipe(Effect.orDie))!
      expect(projected.data).toMatchObject({ usageKnown: false, costSource: "catalog", tokens: { input: 0 }, cost: 1.25 })
      expect((yield* board.execution("SRC", 1)).metrics).toMatchObject({ tokens: null, modelUsd: null, partial: true })
      // Reproduce an older projection that discarded flags, while retaining the durable settlement.
      yield* database.db.update(SessionMessageTable).set({ data: sql`json_remove(${SessionMessageTable.data}, '$.usageKnown', '$.costSource')` }).where(eq(SessionMessageTable.id, row!.id)).run().pipe(Effect.orDie)
      expect((yield* board.execution("SRC", 1)).metrics).toMatchObject({ tokens: null, modelUsd: null, partial: true })
      yield* board.move({ project: "SRC", number: 1, stage: "cut", reason: "Record unknowns honestly." })
      expect((yield* board.execution("SRC", 1)).receipts[0].metrics).toMatchObject({ tokens: null, modelUsd: null, partial: true })

      // A real known settlement survives the same historical projection gap.
      const known = SessionMessage.ID.create()
      yield* events.publish(SessionEvent.Step.Started, { sessionID: id, assistantMessageID: known, timestamp: DateTime.makeUnsafe(Date.now()), agent: "backend", model })
      yield* events.publish(SessionEvent.Step.Ended, {
        sessionID: id, assistantMessageID: known, timestamp: DateTime.makeUnsafe(Date.now()), finish: "stop",
        tokens: { input: 10, output: 2, reasoning: 0, cache: { read: 0, write: 0 } }, usageKnown: true, cost: 0.25, costSource: "provider",
      })
      yield* database.db.update(SessionMessageTable).set({ data: sql`json_remove(${SessionMessageTable.data}, '$.usageKnown', '$.costSource')` }).where(eq(SessionMessageTable.id, known)).run().pipe(Effect.orDie)
      expect((yield* board.execution("SRC", 1)).metrics).toMatchObject({ tokens: { input: 10 }, modelUsd: 0.25, partial: true })
      yield* turn("ses_source_provenance", "catalog-oauth", 100, 5, "openai", "catalog")
      yield* turn("ses_source_provenance", "hosted-estimate", 200, 6, "anthropic", "unavailable")
      const report = yield* board.execution("SRC", 1)
      expect(report.metrics).toMatchObject({ tokens: { input: 310 }, modelUsd: 0.25, partial: true })
      expect(report.models.find((entry) => entry.model.id === "catalog-oauth")).toMatchObject({ usd: null, billing: "unavailable" })
      expect(report.models.find((entry) => entry.model.id === "oauth-model")).toMatchObject({ usd: 0.25, billing: "reported" })
      expect(report.receipts[0].metrics.tokens).toBeNull()
    }),
  )

  it.live("C7: a retried host packet keeps its original attempt, including an explicitly unknown historical association", () =>
    Effect.gen(function* () {
      const board = yield* Board.Service
      const database = yield* Database.Service
      yield* board.project({ key: "NOTE", name: "Note attribution", reason: "Start." })
      const made = yield* board.issue({ project: "NOTE", title: "Work", session: "ses_note_first", reason: "Dispatch." })
      const issue = made.issue!.id
      const attempt = yield* BoardThread.association(database.db, "bno_retry_packet", issue)
      expect(attempt).toBe(1)
      yield* BoardThread.write(database.db, { id: "bno_retry_packet", issue, kind: "brief", author: "maestro", body: "Original packet", attempt }).pipe(Effect.orDie)
      yield* BoardThread.write(database.db, { id: "bno_old_packet", issue, kind: "brief", author: "maestro", body: "Historical packet" }).pipe(Effect.orDie)
      yield* board.issue({ project: "NOTE", number: 1, session: "ses_note_second", reason: "Redispatch." })
      expect(yield* BoardThread.association(database.db, "bno_retry_packet", issue)).toBe(1)
      expect(yield* BoardThread.association(database.db, "bno_old_packet", issue)).toBeNull()
      expect(yield* BoardThread.association(database.db, "bno_new_packet", issue)).toBe(2)
      yield* BoardThread.write(database.db, { id: "bno_retry_packet", issue, kind: "brief", author: "maestro", body: "Must not replace the original", attempt: 2 }).pipe(Effect.orDie)
      expect((yield* board.issuePage("NOTE", 1)).notes.find((note) => note.id === "bno_retry_packet")).toMatchObject({ attempt: 1, body: "Original packet" })
    }),
  )
})

function session(id: string, parent?: string) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* database.db.insert(SessionTable).values({
      id: SessionV2.ID.make(id), parent_id: parent ? SessionV2.ID.make(parent) : null,
      project_id: Project.ID.global, slug: id, directory: "/project", title: id, version: "test",
      model: { id: "current-config-must-not-appear", providerID: "current-provider" }, cost: 9999,
    }).run().pipe(Effect.orDie)
  })
}

function turn(session: string, model: string, input: number, cost: number, provider = "historical-provider", costSource: "provider" | "catalog" | "unavailable" = "provider") {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const data = {
      agent: "historical-seat", model: { id: Model.ID.make(model), providerID: Provider.ID.make(provider) },
      content: input > 0 ? [{ type: "tool", id: `tool_${input}`, name: "read", state: { status: "pending", input: "{}" }, time: { created: 1000 } }] : [], cost,
      tokens: { input, output: input / 10, reasoning: input / 5, cache: { read: input * 3 / 10, write: input * 4 / 10 } },
      time: { created: 1000, completed: 1100 },
      usageKnown: true, costSource,
    }
    yield* database.db.insert(SessionMessageTable).values({
      id: SessionMessage.ID.create(), session_id: SessionV2.ID.make(session), type: "assistant", seq: input, data,
    }).run().pipe(Effect.orDie)
  })
}
