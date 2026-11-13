import { Context, Schema } from "effect"
import type { Effect } from "effect"

const Offset = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const Operation = Schema.Literals([
  "construct", "test", "exec", "match", "matchAll", "search", "split", "replace", "replaceAll",
  "collectReplace", "collectReplaceAll",
])
export const State = Schema.Struct({ source: Schema.String, flags: Schema.String, lastIndex: Offset })
export type State = typeof State.Type

// JSON cannot carry undefined captures. Decode these tags before invoking callbacks or copyOut.
export const Capture = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("text"), value: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("undefined") }),
])
export type Capture = typeof Capture.Type
export const Match = Schema.Struct({
  captures: Schema.Array(Capture),
  index: Schema.optionalKey(Offset),
  groups: Schema.optionalKey(Schema.Record(Schema.String, Capture)),
})
export type Match = typeof Match.Type
export const Replacement = Schema.Struct({
  match: Schema.String,
  offset: Offset,
  captures: Schema.Array(Capture),
  groups: Schema.optionalKey(Schema.Record(Schema.String, Capture)),
})
export type Replacement = typeof Replacement.Type

export const Request = Schema.Union([
  Schema.Struct({ version: Schema.Literal(1), operation: Schema.Literal("construct"), pattern: Schema.String, flags: Schema.String }),
  Schema.Struct({
    version: Schema.Literal(1),
    operation: Schema.Literals(["test", "exec", "match", "matchAll", "search", "collectReplace", "collectReplaceAll"]),
    regex: State,
    subject: Schema.String,
  }),
  Schema.Struct({
    version: Schema.Literal(1), operation: Schema.Literal("split"), regex: State, subject: Schema.String,
    limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 4_294_967_295 }))),
  }),
  Schema.Struct({
    version: Schema.Literal(1), operation: Schema.Literals(["replace", "replaceAll"]), regex: State,
    subject: Schema.String, replacement: Schema.String,
  }),
])
export type Request = typeof Request.Type

export const Result = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("constructed") }),
  Schema.Struct({ kind: Schema.Literal("boolean"), value: Schema.Boolean }),
  Schema.Struct({ kind: Schema.Literal("number"), value: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)) }),
  Schema.Struct({ kind: Schema.Literal("string"), value: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("match"), value: Schema.NullOr(Match) }),
  Schema.Struct({ kind: Schema.Literal("strings"), value: Schema.NullOr(Schema.Array(Schema.String)) }),
  Schema.Struct({ kind: Schema.Literal("matches"), value: Schema.Array(Match) }),
  Schema.Struct({ kind: Schema.Literal("split"), value: Schema.Array(Capture) }),
  Schema.Struct({ kind: Schema.Literal("replacements"), value: Schema.Array(Replacement) }),
])
export type Result = typeof Result.Type
const success = { version: Schema.Literal(1), ok: Schema.Literal(true), regex: State }
const matched = Schema.Struct({ kind: Schema.Literal("match"), value: Schema.NullOr(Match) })
const strings = Schema.Struct({ kind: Schema.Literal("strings"), value: Schema.NullOr(Schema.Array(Schema.String)) })
export const Reply = Schema.Union([
  Schema.Struct({ ...success, operation: Schema.Literal("construct"), result: Schema.Struct({ kind: Schema.Literal("constructed") }) }),
  Schema.Struct({ ...success, operation: Schema.Literal("test"), result: Schema.Struct({ kind: Schema.Literal("boolean"), value: Schema.Boolean }) }),
  Schema.Struct({ ...success, operation: Schema.Literal("exec"), result: matched }),
  Schema.Struct({ ...success, operation: Schema.Literal("match"), result: Schema.Union([matched, strings]) }),
  Schema.Struct({ ...success, operation: Schema.Literal("matchAll"), result: Schema.Struct({ kind: Schema.Literal("matches"), value: Schema.Array(Match) }) }),
  Schema.Struct({ ...success, operation: Schema.Literal("search"), result: Schema.Struct({ kind: Schema.Literal("number"), value: Schema.Int.check(Schema.isGreaterThanOrEqualTo(-1)) }) }),
  Schema.Struct({ ...success, operation: Schema.Literal("split"), result: Schema.Struct({ kind: Schema.Literal("split"), value: Schema.Array(Capture) }) }),
  Schema.Struct({ ...success, operation: Schema.Literals(["replace", "replaceAll"]), result: Schema.Struct({ kind: Schema.Literal("string"), value: Schema.String }) }),
  Schema.Struct({ ...success, operation: Schema.Literals(["collectReplace", "collectReplaceAll"]), result: Schema.Struct({ kind: Schema.Literal("replacements"), value: Schema.Array(Replacement) }) }),
  Schema.Struct({
    version: Schema.Literal(1), ok: Schema.Literal(false), operation: Operation,
    regex: Schema.optionalKey(State), name: Schema.String, message: Schema.String,
  }),
])
export type Reply = typeof Reply.Type

export function decodeReply(request: Request, value: unknown): Reply {
  const reply = Schema.decodeUnknownSync(Reply, { onExcessProperty: "error" })(value)
  if (reply.operation !== request.operation) throw new Error("Native regex reply operation mismatch")
  return reply
}

export type Provider = {
  /** Own and join one isolated child within the caller's remaining absolute execution budget. */
  readonly run: (request: Request, remainingMs: number) => Effect.Effect<Reply, unknown>
}

// Explicit host selection. Timed regex without a provider fails closed; untimed execution keeps its native path.
export const Executor = Context.Reference<Provider | undefined>("@orchestra/CodeMode/NativeRegexExecutor", {
  defaultValue: () => undefined,
})
