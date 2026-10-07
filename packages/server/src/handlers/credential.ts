import { Credential } from "@orchestra/core/credential"
import { Integration } from "@orchestra/core/integration"
import { ConflictError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"

export const CredentialHandler = HttpApiBuilder.group(Api, "server.credential", (handlers) =>
  handlers
    .handle(
      "credential.update",
      Effect.fn(function* (ctx) {
        const integrations = yield* Integration.Service
        yield* integrations.connection
          .update(ctx.params.credentialID, { label: ctx.payload.label })
          .pipe(Effect.catchTag("Credential.InheritedError", inherited))
        return HttpApiSchema.NoContent.make()
      }),
    )
    .handle(
      "credential.remove",
      Effect.fn(function* (ctx) {
        const integrations = yield* Integration.Service
        yield* integrations.connection
          .remove(ctx.params.credentialID)
          .pipe(Effect.catchTag("Credential.InheritedError", inherited))
        return HttpApiSchema.NoContent.make()
      }),
    ),
)

function inherited(error: Credential.InheritedError) {
  return Effect.fail(new ConflictError({ message: error.message, resource: "credential" }))
}
