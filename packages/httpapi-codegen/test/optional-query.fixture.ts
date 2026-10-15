import { Effect, Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"

export const Cursor = Schema.String.pipe(Schema.brand("OptionalQueryCursor"))

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

export const Api = HttpApi.make("optional-query").add(
  HttpApiGroup.make("probe")
    .add(HttpApiEndpoint.get("list", "/list", { query: Query, success: Query }))
    .add(HttpApiEndpoint.get("required", "/required", { query: RequiredQuery, success: RequiredQuery }))
    .add(HttpApiEndpoint.get("empty", "/empty", { query: Schema.Struct({}), success: Schema.String })),
)

// Explicit NumberFromString and decoding defaults require authoritative imports.
// The inline client uses the same decoded fields with HttpApi's numeric codec;
// the server owns this default in both cases.
export const DefaultApi = HttpApi.make("optional-query").add(
  HttpApiGroup.make("probe")
    .add(
      HttpApiEndpoint.get("list", "/list", {
        query: Query.mapFields((fields) => ({
          ...fields,
          limit: Schema.optionalKey(Schema.NumberFromString.pipe(Schema.withDecodingDefault(Effect.succeed("25")))),
        })),
        success: Query,
      }),
    )
    .add(HttpApiEndpoint.get("required", "/required", { query: RequiredQuery, success: RequiredQuery }))
    .add(HttpApiEndpoint.get("empty", "/empty", { query: Schema.Struct({}), success: Schema.String })),
)
