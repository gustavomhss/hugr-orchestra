export * as MeetingRecallTool from "./meeting-recall"

import { ToolFailure } from "@orchestra/llm"
import { and, inArray, ne, or, sql, type SQL } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { PermissionV2 } from "../permission"
import { MeetingTable } from "../session/meeting.sql"
import { MeetingMemory } from "../session/meeting-memory"
import { MeetingItemTable } from "../session/meeting-memory.sql"
import { ToolRegistry } from "./registry"
import { ToolText } from "./text"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "meeting_recall"
export const commitmentsName = "meeting_commitments"

const LIMIT = 20
const DAY = 86_400_000

const Kind = Schema.Literals(["decision", "commitment", "question", "suggestion"])
const person = Schema.optional(Schema.String).annotate({ description: "A person's name or alias" })

export const Input = Schema.Struct({
  query: Schema.optional(Schema.String).annotate({ description: "Words to find in what was said or decided" }),
  person,
  since: Schema.optional(Schema.String).annotate({ description: "Earliest meeting date, ISO (2026-10-01)" }),
  until: Schema.optional(Schema.String).annotate({ description: "Latest meeting date, ISO; a bare date is inclusive" }),
  kind: Schema.optional(Kind),
})

// Provenance travels with every item: the seat labels what it says from memory with it.
const Recalled = Schema.Struct({
  meetingID: Schema.String,
  title: Schema.String,
  date: Schema.String,
  asserter: Schema.String,
  kind: Kind,
  text: Schema.String,
  quote: Schema.String,
})
type Recalled = typeof Recalled.Type

export const Output = Schema.Struct({ items: Schema.Array(Recalled) })

export const CommitmentsInput = Schema.Struct({
  person,
  direction: Schema.optional(Schema.Literals(["mine", "theirs"])).annotate({
    description: "mine: the owner owes it. theirs: someone else owes it",
  }),
  state: Schema.optional(Schema.Literals(["proposed", "accepted", "done", "overdue", "dropped"])),
})

export const CommitmentsOutput = Schema.Struct({
  items: Schema.Array(
    Schema.Struct({
      ...Recalled.fields,
      owner: Schema.String,
      counterparty: Schema.optional(Schema.String),
      due: Schema.optional(Schema.String),
      state: Schema.String,
    }),
  ),
})

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const database = yield* Database.Service
    const permission = yield* PermissionV2.Service

    const guard = (tool: string, context: Tool.Context) =>
      Effect.gen(function* () {
        if (context.agent !== "live")
          return yield* new ToolFailure({ message: `${context.agent} has no meeting memory` })
        yield* permission
          .assert({
            action: tool,
            resources: ["meetings"],
            sessionID: context.sessionID,
            agent: context.agent,
            source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
          })
          .pipe(Effect.mapError(() => new ToolFailure({ message: "Not allowed to read meeting memory" })))
      })

    // Latest revisions that pass `where`, newest meeting first, with the meeting each came from.
    const find = Effect.fn("MeetingRecallTool.find")(function* (personQuery: string | undefined, where: SQL[]) {
      const people = yield* MeetingMemory.peopleMap(database.db)
      const ids = personQuery === undefined ? undefined : MeetingMemory.personIDs(people, personQuery)
      if (ids?.length === 0) return { people, entries: [] }
      const rows = yield* MeetingMemory.latest(
        database.db,
        and(
          ne(MeetingItemTable.status, "dismissed"),
          ids
            ? or(
                inArray(MeetingItemTable.asserter, ids),
                inArray(MeetingItemTable.owner, ids),
                inArray(MeetingItemTable.counterparty, ids),
              )
            : undefined,
          ...where,
        ),
      )
      if (rows.length === 0) return { people, entries: [] }
      const meetings = new Map(
        (yield* database.db
          .select()
          .from(MeetingTable)
          .where(inArray(MeetingTable.id, [...new Set(rows.map((row) => row.meeting_id))]))
          .all()
          .pipe(Effect.orDie)).map((meeting) => [meeting.id, meeting]),
      )
      const entries = rows
        .flatMap((row) => {
          const meeting = meetings.get(row.meeting_id)
          return meeting && row.status !== "dismissed" ? [{ row, status: row.status, meeting }] : []
        })
        .toSorted((a, b) => b.meeting.time_started - a.meeting.time_started || a.row.id.localeCompare(b.row.id))
        .slice(0, LIMIT)
        .map((entry) => ({
          ...entry,
          item: {
            meetingID: entry.meeting.id,
            title: entry.meeting.title,
            date: new Date(entry.meeting.time_started).toISOString().slice(0, 10),
            asserter: label(MeetingMemory.asserterOf(people, entry.row.asserter)),
            kind: entry.row.kind,
            text: entry.row.text,
            quote: entry.row.quote,
          } satisfies Recalled,
        }))
      return { people, entries }
    })

    yield* tools
      .register({
        [name]: Tool.make({
          description: ToolText.meetingRecall,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: render(output.items) }],
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* guard(name, context)
              const since = yield* instant(input.since, 0)
              const until = yield* instant(input.until, DAY)
              const found = yield* find(input.person, [
                ...(input.kind ? [sql`${MeetingItemTable.kind} = ${input.kind}`] : []),
                ...(input.query
                  ? [
                      or(
                        MeetingMemory.contains(MeetingItemTable.text, input.query),
                        MeetingMemory.contains(MeetingItemTable.quote, input.query),
                      )!,
                    ]
                  : []),
                ...(since === undefined ? [] : [meetingTime(sql`>=`, since)]),
                ...(until === undefined ? [] : [meetingTime(sql`<`, until)]),
              ])
              return { items: found.entries.map((entry) => entry.item) }
            }),
        }),
        [commitmentsName]: Tool.make({
          description: ToolText.meetingCommitments,
          input: CommitmentsInput,
          output: CommitmentsOutput,
          toModelOutput: ({ output }) => [{ type: "text", text: render(output.items) }],
          execute: (input, context) =>
            Effect.gen(function* () {
              yield* guard(commitmentsName, context)
              // An owner of null means the owner of the meeting, "me".
              const owner = sql`coalesce(${MeetingItemTable.owner}, 'me')`
              const found = yield* find(input.person, [
                sql`${MeetingItemTable.kind} = 'commitment'`,
                ...(input.state ? [sql`coalesce(${MeetingItemTable.state}, 'proposed') = ${input.state}`] : []),
                ...(input.direction === "mine" ? [sql`${owner} = 'me'`] : []),
                ...(input.direction === "theirs" ? [sql`${owner} <> 'me'`] : []),
              ])
              return {
                items: found.entries.map((entry) => {
                  const commitment = MeetingMemory.commitmentOf(found.people, entry.row, entry.status)
                  return {
                    ...entry.item,
                    owner: label(commitment.owner),
                    counterparty: commitment.counterparty ? label(commitment.counterparty) : undefined,
                    due: commitment.due,
                    state: commitment.state,
                  }
                }),
              }
            }),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

const meetingTime = (operator: SQL, at: number) =>
  sql`exists (select 1 from meeting m where m.id = ${MeetingItemTable.meeting_id} and m.time_started ${operator} ${at})`

// An ISO date or time. A bare date as an upper bound runs to the end of that day.
const instant = (value: string | undefined, bareDate: number) => {
  if (value === undefined) return Effect.succeed(undefined)
  const at = Date.parse(value)
  if (Number.isNaN(at)) return Effect.fail(new ToolFailure({ message: `Not an ISO date: ${value}` }))
  return Effect.succeed(value.length === 10 ? at + bareDate : at)
}

const label = (who: "me" | { readonly name: string } | { readonly unknown: number }) => {
  if (who === "me") return "the owner"
  return "name" in who ? who.name : `Speaker ${who.unknown}`
}

const render = (
  items: ReadonlyArray<
    Recalled & { readonly owner?: string; readonly counterparty?: string; readonly due?: string; readonly state?: string }
  >,
) =>
  items.length === 0
    ? "Nothing is stored in your meetings for this. Say so plainly and do not guess."
    : items
        .map((item) =>
          [
            `[From memory: ${item.asserter}, ${item.date}, "${item.title}"] ${item.kind}: ${item.text}`,
            item.owner === undefined
              ? ""
              : `  owner: ${item.owner}${item.counterparty ? `, to: ${item.counterparty}` : ""}${item.due ? `, due ${item.due}` : ""}, ${item.state}`,
            item.quote ? `  quote: "${item.quote}"` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n")

export const node = makeLocationNode({
  name: "tool/meeting-recall",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, Database.node],
})
