import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionTable } from "@orchestra/core/session/sql"
import { testEffect } from "./lib/effect"

const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: () => Effect.succeed({ id: ProjectV2.ID.global, directory: AbsolutePath.make("/project") }),
    list: () => Effect.succeed([]),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionV2.node]), [
    [ProjectV2.node, projects],
    [SessionExecution.node, SessionExecution.noopLayer],
  ]),
)
const location = Location.Ref.make({ directory: AbsolutePath.make("/project") })

describe("SessionV2 rename and remove", () => {
  it.live("rename replaces only the title on the shared Session row", () =>
    Effect.gen(function* () {
      const session = yield* SessionV2.Service
      const created = yield* session.create({ location })
      yield* session.rename({ sessionID: created.id, title: "Renamed" })
      const renamed = yield* session.get(created.id)
      expect(renamed.title).toBe("Renamed")
      expect(renamed.projectID).toBe(created.projectID)
      expect(renamed.time.created).toBe(created.time.created)
    }),
  )

  it.live("remove deletes the Session and its children; a missing Session is NotFound", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const session = yield* SessionV2.Service
      const parent = yield* session.create({ location })
      const child = yield* session.create({ location, parentID: parent.id })
      const other = yield* session.create({ location })
      yield* session.remove(parent.id)
      const left = yield* database.db.select({ id: SessionTable.id }).from(SessionTable).all().pipe(Effect.orDie)
      const ids = left.map((row) => row.id)
      expect(ids).toContain(other.id)
      expect(ids).not.toContain(parent.id)
      expect(ids).not.toContain(child.id)
      expect((yield* session.get(child.id).pipe(Effect.flip))._tag).toBe("Session.NotFoundError")
      expect((yield* session.remove(parent.id).pipe(Effect.flip))._tag).toBe("Session.NotFoundError")
      expect((yield* session.rename({ sessionID: parent.id, title: "x" }).pipe(Effect.flip))._tag).toBe(
        "Session.NotFoundError",
      )
    }),
  )
})
