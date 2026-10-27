export * as MeetingConsolidation from "./meeting-consolidation"

import { LLM, LLMClient, LLMEvent, Message, SystemPart, type Model } from "@orchestra/llm"
import { and, asc, eq, isNotNull, notInArray } from "drizzle-orm"
import { Cause, Clock, Context, Effect, Layer, Option, Schema, Stream } from "effect"
import { Meeting } from "@orchestra/schema/meeting"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { llmClient } from "../effect/app-node-platform"
import { Identifier } from "../util/identifier"
import PROMPT from "./meeting-consolidation.txt"
import { MeetingItemTable, MeetingPersonTable, MeetingProposalTable } from "./meeting-memory.sql"
import { MeetingSegmentTable, MeetingTable } from "./meeting.sql"
import { SessionRunnerModel } from "./runner/model"
import type { SessionSchema } from "./schema"
import { SessionStore } from "./store"
import { SessionSubagentModels } from "./subagent-models"

// After a meeting stops, one model call turns its transcript into the card. Logs carry ids and counts only.
export interface Interface {
  // Runs in the background and never fails; a meeting already being consolidated is skipped.
  readonly start: (meetingID: Meeting.ID) => Effect.Effect<void>
  // The same work, awaited.
  readonly run: (meetingID: Meeting.ID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/MeetingConsolidation") {}

type Db = Database.Interface["db"]
type MeetingRow = typeof MeetingTable.$inferSelect
type SegmentRow = typeof MeetingSegmentTable.$inferSelect

const OUTPUT_TOKENS = 4096
// SessionMeeting reports this id for a meeting whose Session was deleted.
const DETACHED = "ses_detached"

const Output = Schema.Struct({
  summary: Schema.String,
  items: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(["decision", "commitment", "question", "suggestion"]),
      text: Schema.String,
      quote: Schema.String,
      asserter: Schema.String,
      start_ms: Schema.Number,
      owner: Schema.optional(Schema.String),
      counterparty: Schema.optional(Schema.String),
      due: Schema.optional(Schema.String),
      for: Schema.optional(Schema.Literals(["owner", "maestro"])),
    }),
  ),
  people: Schema.Array(Schema.Struct({ name: Schema.String, merge_with: Schema.optional(Schema.String) })),
})
type Output = typeof Output.Type

// Process-global: two Locations serving the same database must not consolidate one meeting twice.
const inflight = new Set<Meeting.ID>()

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const store = yield* SessionStore.Service
    const models = yield* SessionRunnerModel.Service
    const subagentModels = yield* SessionSubagentModels.Service
    const llm = yield* LLMClient.Service
    const db = database.db

    // A pending card of a stopped meeting that nothing is consolidating was cut off by a restart. No retry.
    yield* db
      .update(MeetingTable)
      .set({ card_status: "failed", card_error: "interrupted" })
      .where(
        and(
          eq(MeetingTable.card_status, "pending"),
          isNotNull(MeetingTable.time_ended),
          notInArray(MeetingTable.id, [...inflight]),
        ),
      )
      .run()
      .pipe(Effect.orDie)

    const consolidate = Effect.fn("MeetingConsolidation.consolidate")(function* (meetingID: Meeting.ID) {
      const meeting = yield* db.select().from(MeetingTable).where(eq(MeetingTable.id, meetingID)).get().pipe(Effect.orDie)
      if (!meeting || meeting.card_status !== "pending" || meeting.time_ended === null) return
      const session =
        meeting.session_id === null || meeting.session_id === DETACHED ? undefined : yield* store.get(meeting.session_id)
      if (!session) return yield* markFailed(db, meetingID, "no_session")
      const segments = yield* db
        .select()
        .from(MeetingSegmentTable)
        .where(eq(MeetingSegmentTable.meeting_id, meetingID))
        .orderBy(asc(MeetingSegmentTable.start_ms))
        .all()
        .pipe(Effect.orDie)
      if (segments.length === 0) return yield* markFailed(db, meetingID, "no_transcript")
      const model = yield* models.resolve(session).pipe(
        Effect.tap((resolved) => subagentModels.assert(session.id, SessionRunnerModel.reference(resolved))),
        Effect.option,
      )
      if (Option.isNone(model)) return yield* markFailed(db, meetingID, "no_model")
      const text = yield* ask(llm, model.value, session.id, segments)
      if (text === undefined) return yield* markFailed(db, meetingID, "model_error")
      const output = decodeOutput(text)
      if (Option.isNone(output)) return yield* markFailed(db, meetingID, "invalid_output")
      yield* write(db, meeting, output.value)
      yield* Effect.logInfo("meeting consolidated", {
        meetingID,
        items: output.value.items.length,
        people: output.value.people.length,
      })
    })

    const run = (meetingID: Meeting.ID) =>
      Effect.suspend(() => {
        if (inflight.has(meetingID)) return Effect.void
        inflight.add(meetingID)
        return consolidate(meetingID).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : markFailed(db, meetingID, "internal_error").pipe(
                  Effect.andThen(Effect.logError("meeting consolidation failed", { meetingID })),
                ),
          ),
          // An ephemeral meeting never keeps its transcript, whether or not its card was built.
          Effect.andThen(dropEphemeral(db, meetingID)),
          Effect.ensuring(Effect.sync(() => inflight.delete(meetingID))),
        )
      })

    return Service.of({ run, start: (meetingID) => run(meetingID).pipe(Effect.forkDetach, Effect.asVoid) })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Database.node, SessionStore.node, SessionRunnerModel.node, SessionSubagentModels.node, llmClient],
})

const markFailed = (db: Db, meetingID: Meeting.ID, code: string) =>
  db
    .update(MeetingTable)
    .set({ card_status: "failed", card_error: code })
    .where(eq(MeetingTable.id, meetingID))
    .run()
    .pipe(Effect.orDie, Effect.asVoid)

const dropEphemeral = (db: Db, meetingID: Meeting.ID) =>
  Effect.gen(function* () {
    const meeting = yield* db.select().from(MeetingTable).where(eq(MeetingTable.id, meetingID)).get()
    if (meeting?.retention !== "ephemeral" || meeting.time_ended === null) return
    yield* db.delete(MeetingSegmentTable).where(eq(MeetingSegmentTable.meeting_id, meetingID)).run()
  }).pipe(Effect.orDie)

// The model's raw text with reasoning blocks removed, or undefined when the call or the provider failed.
const ask = (
  llm: Context.Service.Shape<typeof LLMClient.Service>,
  model: Model,
  sessionID: SessionSchema.ID,
  segments: SegmentRow[],
) => {
  const chunks: string[] = []
  return llm
    .stream(
      LLM.request({
        model,
        http: { headers: { "x-session-affinity": sessionID, "X-Session-Id": sessionID } },
        system: [SystemPart.make(PROMPT)],
        messages: [
          Message.user(segments.map((segment) => `[${segment.start_ms}] ${segment.track}: ${segment.text}`).join("\n")),
        ],
        generation: { maxTokens: OUTPUT_TOKENS },
      }),
    )
    .pipe(
      Stream.runForEach((event) => {
        if (LLMEvent.is.providerError(event)) return Effect.fail("provider_error" as const)
        if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
        return Effect.void
      }),
      Effect.map((): string | undefined => chunks.join("").replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim()),
      Effect.catch(() => Effect.succeed(undefined)),
    )
}

// Strict: unknown fields, a missing field or a kind outside the card's kinds reject the whole answer.
const decodeOutput = (text: string) =>
  Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text).pipe(
    Option.flatMap((value) => Schema.decodeUnknownOption(Output)(value, { onExcessProperty: "error" })),
  )

// People are only proposed, never merged. A name the model attributes is stored as "unknown:N", N being its place in
// the proposals, until the owner answers them.
const write = Effect.fn("MeetingConsolidation.write")(function* (db: Db, meeting: MeetingRow, output: Output) {
  const now = yield* Clock.currentTimeMillis
  const people = yield* db.select().from(MeetingPersonTable).all().pipe(Effect.orDie)
  const names = output.people.map((entry) => entry.name)
  const code = (who: string) => (who === "me" || /^unknown:\d+$/.test(who) ? who : `unknown:${names.indexOf(who) + 1}`)
  const known = (name: string) =>
    people.find((row) => [row.name, ...row.aliases].some((alias) => alias.toLowerCase() === name.toLowerCase()))?.id ??
    null
  // An ephemeral meeting keeps its card but neither the transcript nor anything pointing into it.
  const ephemeral = meeting.retention === "ephemeral"
  yield* db
    .transaction(() =>
      Effect.gen(function* () {
        if (output.items.length > 0)
          yield* db
            .insert(MeetingItemTable)
            .values(
              output.items.map((item) => ({
                id: `itm_${Identifier.ascending()}`,
                revision: 1,
                meeting_id: meeting.id,
                kind: item.kind,
                text: item.text,
                quote: ephemeral ? "" : item.quote,
                asserter: code(item.asserter),
                start_ms: ephemeral ? null : item.start_ms,
                status: "claimed" as const,
                owner: item.kind === "commitment" ? code(item.owner ?? "me") : null,
                counterparty: item.kind === "commitment" && item.counterparty ? code(item.counterparty) : null,
                due: item.kind === "commitment" ? (item.due ?? null) : null,
                state: item.kind === "commitment" ? ("proposed" as const) : null,
                for: item.kind === "suggestion" ? (item.for ?? "owner") : null,
                created_at: now,
              })),
            )
            .run()
        if (output.people.length > 0)
          yield* db
            .insert(MeetingProposalTable)
            .values(
              output.people.map((entry) => ({
                id: `prp_${Identifier.ascending()}`,
                meeting_id: meeting.id,
                name: entry.name,
                merge_with: known(entry.merge_with ?? entry.name),
              })),
            )
            .run()
        yield* db
          .update(MeetingTable)
          .set({ card_status: "ready", card_error: null, card_summary: output.summary })
          .where(eq(MeetingTable.id, meeting.id))
          .run()
      }),
    )
    .pipe(Effect.orDie)
})
