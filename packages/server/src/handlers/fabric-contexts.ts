import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { Global } from "@orchestra/core/global"
import { Project } from "@orchestra/core/project"
import { FabricContexts } from "@orchestra/fabric/context"
import { ConflictError, ForbiddenError, InvalidRequestError, ServiceUnavailableError } from "@orchestra/protocol/errors"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ServerFabricContexts } from "../fabric-contexts"
import { capabilityError } from "../middleware/capability-authorization"
import { ServerOperator } from "../operator"

export const FabricContextsHandler = HttpApiBuilder.group(Api, "server.fabric.context", (handlers) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const project = yield* Project.Service
    const global = yield* Global.Service
    const operator = yield* ServerOperator.Service
    const config = yield* ServerFabricContexts.Config
    const root = config.root ?? AbsolutePath.make(path.join(global.data, "fabric", "contexts"))

    // Capture host services here, but acquire the domain only inside an authenticated request.
    const run = <A>(
      action: (
        contexts: Effect.Success<ReturnType<typeof FabricContexts.make>>,
      ) => Effect.Effect<A, Effect.Error<ReturnType<typeof FabricContexts.make>>>,
    ) => Effect.gen(function* () {
      const contexts = yield* FabricContexts.make({ operators: operator, root })
      return yield* action(contexts)
    }).pipe(
      Effect.provideService(Database.Service, database),
      Effect.provideService(Project.Service, project),
      // Map typed failures only; defects and interruption retain their original cause.
      Effect.mapError((error) => error instanceof FabricContext.Failure
        ? fabricContextError(error)
        : capabilityError(error)),
    )

    return handlers
      .handle("fabric.context.list", (ctx) => run((contexts) => contexts.list(ctx.query)))
      .handle("fabric.context.preparing", (ctx) => run((contexts) => contexts.preparing(ctx.query)))
      .handle("fabric.context.create", (ctx) => run((contexts) => contexts.create(ctx.payload)))
      .handle("fabric.context.resolve", (ctx) => run((contexts) => contexts.resolve({
        id: ctx.params.id,
        generation: ctx.query.generation,
      })))
      .handle("fabric.context.remove", (ctx) => run((contexts) => contexts.remove(ctx.payload)))
  }),
)

/** Fixed public projection; never copy internal messages, paths or causes. */
export function fabricContextError(error: FabricContext.Failure) {
  switch (error.code) {
    case "invalid-input": return new InvalidRequestError({ message: "Fabric context input is invalid" })
    case "denied": return new ForbiddenError({ message: "Fabric context access is denied" })
    case "expired": return new ConflictError({ message: "Fabric context reference has expired" })
    case "conflict": return new ConflictError({ message: "Fabric context request conflicts" })
    case "limit": return new ConflictError({ message: "Fabric context limit is reached" })
    case "unavailable": return new ServiceUnavailableError({ message: "Fabric context is unavailable" })
  }
}
