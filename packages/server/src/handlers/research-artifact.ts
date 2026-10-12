import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { SessionTable } from "@orchestra/core/session/sql"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchArtifactNotFoundError } from "@orchestra/protocol/groups/research-artifact"
import { ConflictError, InvalidRequestError, ServiceUnavailableError } from "@orchestra/protocol/errors"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const ResearchArtifactHandler = HttpApiBuilder.group(Api, "server.research", (handlers) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const artifacts = yield* ResearchArtifacts.Service
    return handlers.handle("research.artifact", (ctx) => Effect.gen(function* () {
      const session = yield* database.db.select({ projectID: SessionTable.project_id }).from(SessionTable)
        .where(eq(SessionTable.id, ctx.params.sessionID)).get().pipe(Effect.orDie)
      if (!session) return yield* new ResearchArtifactNotFoundError({ message: "Research artifact not found" })
      const binding = yield* ResearchBinding.resolve(ctx.params.sessionID, session.projectID)
      const page = yield* artifacts.read(binding, { id: ctx.params.artifactID, revision: ctx.query.revision }, ctx.query.cursor, "task")
      if (page.receipt.binding.executionSessionID !== binding.executionSessionID || page.receipt.binding.taskId !== binding.taskId)
        return yield* new ResearchArtifactNotFoundError({ message: "Research artifact not found" })
      return page
    }).pipe(
      Effect.provideService(Database.Service, database),
       Effect.catchTag("Research.Error", (error) => {
         return Effect.fail(["not_found", "binding_missing", "binding_mismatch", "reference_invalid"].includes(error.code)
           ? new ResearchArtifactNotFoundError({ message: "Research artifact not found" })
           : error.code === "conflict" ? new ConflictError({ message: "Research revision or cursor conflicts" })
           : error.code === "over_cap" ? new InvalidRequestError({ message: "Research request exceeds supported bounds" })
           : new ServiceUnavailableError({ message: "Research artifact is unavailable", service: "research" }))
      }),
    ))
  }),
)
