export * as ResearchSessionCleanup from "./session-cleanup"

import { Effect, Option } from "effect"
import { ResearchSeatTools } from "./seat-tools"
import { Database } from "@orchestra/core/database/database"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { Project } from "@orchestra/schema/project"
import type { SessionID } from "@/session/schema"

export type Requirements = ResearchArtifacts.Service | Database.Service
/** The layer the cleanup needs beside the Session's own database. */
export const dependency = ResearchArtifacts.node

// A deleted discovery Session takes its host-bound research artifacts with it; any other Session holds none.
export const make = Effect.gen(function* () {
  const artifacts = yield* ResearchArtifacts.Service
  const database = yield* Database.Service
  return (session: { id: SessionID; projectID: string; agent?: string }) => Effect.gen(function* () {
    if (session.agent !== ResearchSeatTools.SEAT) return
    const binding = yield* ResearchBinding.resolve(session.id, Project.ID.make(session.projectID)).pipe(
      Effect.provideService(Database.Service, database), Effect.option,
    )
    if (Option.isSome(binding)) yield* artifacts.remove(binding.value).pipe(Effect.orDie)
  })
})
