import { Guardrail } from "@orchestra/schema/guardrail"
import { Location } from "@orchestra/schema/location"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

// `kind` says why the engine could not answer, so clients can explain it without parsing the message.
export class GuardrailError extends Schema.ErrorClass<GuardrailError>("GuardrailError")(
  {
    name: Schema.Literal("GuardrailError"),
    data: Schema.Struct({
      kind: Guardrail.EngineErrorKind,
      message: Schema.String,
    }),
  },
  { httpApiStatus: 400 },
) {}

export const GuardrailGroup = HttpApiGroup.make("server.guardrail")
  .add(
    HttpApiEndpoint.get("guardrail.rules", "/api/guardrail/rules", {
      query: LocationQuery,
      success: Location.response(Guardrail.Rules),
      error: GuardrailError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.guardrail.rules",
          summary: "List guard rules",
          description: "List the guard rules of the location's repository as the merge-base with the target branch defines them.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("guardrail.run", "/api/guardrail/run", {
      query: LocationQuery,
      payload: Guardrail.RunInput,
      success: Location.response(Guardrail.Report),
      error: GuardrailError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.guardrail.run",
          summary: "Run guards",
          description: "Judge the location's current change against its guard rules and return the findings.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "guardrail",
      description: "Guard rules and their findings for the location's repository.",
    }),
  )
