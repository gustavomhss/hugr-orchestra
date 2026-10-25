import { Guardrail } from "@orchestra/core/guardrail"
import { GuardrailError } from "@orchestra/protocol/groups/guardrail"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const GuardrailHandler = HttpApiBuilder.group(Api, "server.guardrail", (handlers) =>
  Effect.succeed(
    handlers
      .handle("guardrail.rules", () =>
        response(
          Effect.gen(function* () {
            const guardrail = yield* Guardrail.Service
            return yield* guardrail.rules().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("guardrail.run", (ctx) =>
        response(
          Effect.gen(function* () {
            const guardrail = yield* Guardrail.Service
            return yield* guardrail.run(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      ),
  ),
)

function apiError(error: Guardrail.EngineError) {
  return new GuardrailError({ name: "GuardrailError", data: { kind: error.kind, message: error.message } })
}
