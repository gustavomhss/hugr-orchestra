export * as MeetingBriefing from "./meeting-briefing"

import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { SystemContext } from "../system-context/index"
import { MeetingTable } from "./meeting.sql"
import { MeetingMemory } from "./meeting-memory"
import { MeetingItemTable } from "./meeting-memory.sql"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"

// About 600 tokens. The briefing is a courtesy: the cap cuts it, it never grows the prompt.
export const MAX_CHARS = 2400
const MEETINGS = 3
const OPEN = ["proposed", "accepted", "overdue"]

const Value = Schema.Struct({ text: Schema.String })

export interface Interface {
  // Empty unless the Session runs the `live` seat and has a running meeting.
  readonly load: (sessionID: SessionSchema.ID) => Effect.Effect<SystemContext.SystemContext>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/MeetingBriefing") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service

    return Service.of({
      load: Effect.fn("MeetingBriefing.load")(function* (sessionID: SessionSchema.ID) {
        const session = yield* database.db
          .select({ agent: SessionTable.agent })
          .from(SessionTable)
          .where(eq(SessionTable.id, sessionID))
          .get()
          .pipe(Effect.orDie)
        if (session?.agent !== "live") return SystemContext.empty
        const running = yield* database.db
          .select({ id: MeetingTable.id })
          .from(MeetingTable)
          .where(and(eq(MeetingTable.session_id, sessionID), isNull(MeetingTable.time_ended)))
          .get()
          .pipe(Effect.orDie)
        if (!running) return SystemContext.empty

        // Meeting ids sort newest first.
        const recent = yield* database.db
          .select()
          .from(MeetingTable)
          .where(and(ne(MeetingTable.id, running.id), isNotNull(MeetingTable.time_ended)))
          .orderBy(asc(MeetingTable.id))
          .limit(MEETINGS)
          .all()
          .pipe(Effect.orDie)
        const people = yield* MeetingMemory.peopleMap(database.db)
        const commitments = (yield* MeetingMemory.latest(
          database.db,
          and(eq(MeetingItemTable.kind, "commitment"), ne(MeetingItemTable.status, "dismissed")),
        )).flatMap((row) =>
          row.status !== "dismissed" && OPEN.includes(row.state ?? "proposed")
            ? [MeetingMemory.commitmentOf(people, row, row.status)]
            : [],
        )
        const owed = (mine: boolean) =>
          commitments.filter((item) => (item.owner === "me") === mine).map((item) => `- ${describe(item)}`)
        const text = [
          ...recent.map((meeting) => `- ${date(meeting.time_started)} "${meeting.title}": ${meeting.card_summary || "no summary"}`),
          "Open commitments the owner owes:",
          ...owed(true),
          "Open commitments others owe the owner:",
          ...owed(false),
        ]
          .join("\n")
          .slice(0, MAX_CHARS)
        if (recent.length === 0 && commitments.length === 0) return SystemContext.empty

        return SystemContext.make({
          key: SystemContext.Key.make("live/briefing"),
          codec: Schema.toCodecJson(Value),
          load: Effect.succeed({ text }),
          baseline: (current) => `[From memory: briefing of the last meetings]\n${current.text}`,
          update: (_, current) => `[From memory: briefing of the last meetings]\n${current.text}`,
          removed: () => "The meeting briefing no longer applies.",
        })
      }),
    })
  }),
)

const date = (ms: number) => new Date(ms).toISOString().slice(0, 10)

const describe = (item: ReturnType<typeof MeetingMemory.commitmentOf>) => {
  const who = item.owner === "me" ? item.counterparty : item.owner
  const name = who === undefined ? "" : who === "me" ? " (owner)" : ` (${who.name})`
  return `${item.text}${name}${item.due ? `, due ${item.due}` : ""}`
}

export const node = makeLocationNode({ service: Service, layer, deps: [Database.node] })
