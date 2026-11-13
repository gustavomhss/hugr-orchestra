export * as InboxHandoff from "./handoff"

import { Effect, Layer } from "effect"
import { AgentV2 } from "../agent"
import { ProjectV2 } from "../project"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { Location } from "../location"
import { SessionV2 } from "../session"
import { deliver } from "../tool/team-message"
import { globalSessions } from "../tool/task"
import { Inbox } from "./service"

export const Service = Inbox.HandoffService

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const inbox = yield* Inbox.Service
    const database = yield* Database.Service
    const location = yield* Location.Service
    const sessions = yield* SessionV2.Service

    const handoff = Effect.fn("InboxHandoff.handoff")(function* (ids: readonly string[]) {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return { ids: [] }
      yield* inbox.require(unique)
      const send = deliver({
        db: database.db,
        sessions,
        projectID: location.project.id,
        from: "live",
        to: AgentV2.defaultID,
        text: unique.join(" "),
        resume: false,
      })
      yield* send.pipe(
        Effect.catchIf(
          (reason) => reason === "no_conversation" && location.project.id !== ProjectV2.ID.global,
          () =>
            sessions
              .create({ agent: AgentV2.defaultID, location: { directory: location.directory } })
              .pipe(Effect.andThen(send)),
        ),
        Effect.mapError(() => new Inbox.InboxError({ reason: "unavailable" })),
      )
      return yield* inbox.handoff(unique)
    })

    return Service.of({ handoff })
  }),
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [Inbox.node, Database.node, Location.node, globalSessions],
})
