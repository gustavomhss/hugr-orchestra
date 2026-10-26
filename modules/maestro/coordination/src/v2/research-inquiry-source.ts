export * as MaestroResearchInquiryV2 from "./research-inquiry-source"

import { Effect, Layer, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { SystemContext, SystemContextRegistry } from "@orchestra/core/system-context"
import { ResearchDispatchV2 } from "./governance/research"
import { ResearchInquiry } from "./tools/inquiry"

export const key = SystemContext.Key.make("maestro/research-inquiry")

/**
 * The research seat's inquiry snapshot before every provider turn it takes (the earlier runtime's `ResearchInquiry.turn` in
 * `session/prompt.ts`): rebuilt from the dispatch ledger each turn, so it survives compaction, and admitted whole as the
 * update when it changes. Every other agent, and a research Session without a readable dispatch, gets nothing; a failed
 * read never fails the turn.
 */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const registry = yield* SystemContextRegistry.Service
    const database = yield* Database.Service
    const records = yield* ResearchRecords.Service
    // The roster loads lazily (see `seats.ts`); where it cannot load no agent is the research seat.
    const roster = yield* Effect.tryPromise(() => import("../roster")).pipe(Effect.option)
    const services = {
      db: database.db,
      events: yield* EventV2.Service,
      store: yield* SessionStore.Service,
      canonical: (id: string): string => (roster._tag === "Some" ? roster.value.canonicalMemberId(id) : id),
      allowances: yield* ResearchAllowance.Service,
      location: yield* Location.Service,
    }
    yield* registry.register({
      key,
      load: Effect.gen(function* () {
        const turn = yield* SystemContextRegistry.Turn
        if (!turn || services.canonical(turn.agent) !== ResearchSeatTools.SEAT) return SystemContext.empty
        const session = yield* services.store.get(SessionSchema.ID.make(turn.sessionID))
        if (!session) return SystemContext.empty
        const admitted = yield* ResearchDispatchV2.allowance(services, session)
        if (!admitted) return SystemContext.empty
        const text = ResearchInquiry.snapshot(ResearchInquiry.fold(yield* records.dispatch(admitted.allowance)), admitted.allowance)
        return SystemContext.make({
          key,
          codec: Schema.toCodecJson(Schema.String),
          load: Effect.succeed(text),
          baseline: (snapshot) => snapshot,
          update: (_previous, snapshot) => snapshot,
        })
      }).pipe(
        Effect.catch(() => Effect.succeed(SystemContext.empty)),
        Effect.catchDefect(() => Effect.succeed(SystemContext.empty)),
      ),
    })
  }),
)

export const node = makeLocationNode({
  name: "maestro/research-inquiry",
  layer,
  deps: [
    SystemContextRegistry.node,
    Database.node,
    EventV2.node,
    SessionStore.node,
    ResearchAllowance.node,
    ResearchRecords.node,
    Location.node,
  ],
})
