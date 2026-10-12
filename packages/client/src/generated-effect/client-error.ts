import { Schema } from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClientError } from "effect/unstable/http"

export class ClientError extends Schema.TaggedErrorClass<ClientError>()("ClientError", {
  cause: Schema.Defect(),
}) {}

export const mapClientError = <E>(error: E) =>
  HttpClientError.isHttpClientError(error) || Schema.isSchemaError(error) || Sse.Retry.is(error)
    ? new ClientError({ cause: error })
    : error
