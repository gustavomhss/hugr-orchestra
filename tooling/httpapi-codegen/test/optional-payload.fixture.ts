import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const Cursor = Schema.String.pipe(Schema.brand("OptionalPayloadCursor"))

export const Query = Schema.Struct({
  after: Schema.optionalKey(Cursor),
  limit: Schema.optionalKey(Schema.Number),
  enabled: Schema.optionalKey(Schema.Boolean),
  nullable: Schema.optionalKey(Schema.Null),
  text: Schema.optionalKey(Schema.String),
  "": Schema.optionalKey(Schema.String),
  "x-query": Schema.optionalKey(Schema.String),
})

export const RequiredQuery = Schema.Struct({
  required: Cursor,
  after: Schema.optionalKey(Cursor),
})

export const Api = HttpApi.make("optional-payload").add(
  HttpApiGroup.make("probe")
    .add(HttpApiEndpoint.post("list", "/list", { payload: Query, success: Query }))
    .add(HttpApiEndpoint.post("required", "/required", { payload: RequiredQuery, success: RequiredQuery })),
)

export const DefaultApi = Api
