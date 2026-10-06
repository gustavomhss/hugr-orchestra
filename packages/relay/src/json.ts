export * as RelayJson from "./json"

import { Effect, Schema } from "effect"

// Strict JSON reading and the jq-compatible compact writer every ledger and arm file goes through (WP1).

export class DecodeError extends Schema.TaggedErrorClass<DecodeError>()("RelayJson.DecodeError", {
  reason: Schema.String,
}) {}

export class EncodeError extends Schema.TaggedErrorClass<EncodeError>()("RelayJson.EncodeError", {
  reason: Schema.String,
}) {}

/**
 * Decodes exactly one JSON value, like the verifier's `strict_json_loads`: duplicate decoded keys are rejected at
 * every depth (a key spelled with a unicode escape included), and the `NaN`, `Infinity` and `-Infinity` tokens are
 * rejected while quoted spellings and lexical numbers such as `1e999` stay valid.
 */
export const decode = (text: string): Effect.Effect<unknown, DecodeError> => Effect.die("not implemented")

/**
 * `relay_json_string`: exactly one JSON string, or null as the empty value. Other types and NUL are rejected; tabs and
 * every LF, trailing LF included, are kept.
 */
export const decodeString = (json: string): Effect.Effect<string, DecodeError> => Effect.die("not implemented")

/**
 * `jq -c` byte for byte: key order as given, jq's escape table (0x00–0x1f, 0x7f, `"`, `\`, U+2028, astral
 * characters), integers only. Integer-like object keys are refused, because a JS object would reorder them.
 */
export const compact = (value: unknown): Effect.Effect<string, EncodeError> => Effect.die("not implemented")
