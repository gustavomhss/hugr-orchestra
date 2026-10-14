import { Actions } from "@orchestra/schema/actions"
import { createHash } from "node:crypto"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsError } from "../error"
import { GitHubNative } from "../github/native"
import { ActionsResponse } from "../transport/response"
import { bytes, decode, error, native, source, version } from "./input"
import type { Services } from "./input"

export type Plan = {
  readonly request: ActionsContract.Request
  readonly status: number
  readonly acknowledge: (response: ActionsContract.Response) => Effect.Effect<ActionsContract.CommandResult, ActionsError>
}

export function guard<A>(binding: Actions.Binding, fn: () => A) {
  return Effect.try({ try: fn, catch: (cause) => cause instanceof ActionsError
    ? error(binding, cause.kind, cause.message, cause.disposition) : error(binding, "invalid_input", "Source metadata could not be validated") })
}

export function before<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  return effect.pipe(Effect.mapError((cause) => error(binding, cause.kind, "Source mutation preflight failed")))
}

export function after<A>(binding: Actions.Binding, effect: Effect.Effect<A, ActionsError>) {
  // Once a write was sent, a failed proof is never a definitive rejection or a retry instruction.
  return effect.pipe(Effect.mapError(() => error(binding, "outcome_unknown", "Source mutation outcome was not proved", "unknown")))
}

export const get = Effect.fn("ActionsAuthoring.get")(function* (services: Services, binding: Actions.Binding, path: string, query?: ActionsContract.Request["query"]) {
  const response = yield* before(binding, services.transport.request(binding, { method: "GET", path, ...(query ? { query } : {}) }))
  if (response.status !== 200) {
    const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
    return yield* error(binding, failure.kind, "Source preflight read was rejected")
  }
  return response
})

export const actor = Effect.fn("ActionsAuthoring.actor")(function* (services: Services, binding: Actions.Binding) {
  if (!binding.account) return yield* error(binding, "not_authenticated", "Source authoring requires the captured signed-in account")
  const response = yield* get(services, binding, "user")
  const account = yield* guard(binding, () => binding.provider.kind === "github"
    ? native(binding, Schema.Struct({ login: Schema.NonEmptyString }), response.data).login
    : native(binding, Schema.Struct({ username: Schema.NonEmptyString }), response.data).username)
  if (account.toLowerCase() !== binding.account.toLowerCase())
    return yield* error(binding, "binding_stale", "Source authoring account changed after admission")
})

export const current = Effect.fn("ActionsAuthoring.current")(function* (services: Services, binding: Actions.Binding, intent: Actions.OperationIntent) {
  if (!intent.target.path || !intent.target.ref) return yield* error(binding, "invalid_input", "Source precondition requires a path and branch")
  const value = yield* before(binding, services.reader.source(binding, { path: intent.target.path, ref: intent.target.ref }))
  return yield* guard(binding, () => source(binding, intent, value))
})

export function blob(text: string, algorithm: string) {
  const value = bytes(text)
  return createHash(algorithm.length === 40 ? "sha1" : "sha256").update(`blob ${value.length}\0`).update(value).digest("hex")
}

export const written = Effect.fn("ActionsAuthoring.written")(function* (
  services: Services, binding: Actions.Binding, intent: Actions.OperationIntent, text: string, commit?: string, blobID?: string,
) {
  if (!intent.target.path || !intent.target.ref) return yield* error(binding, "outcome_unknown", "Written source target is missing", "unknown")
  const value = yield* services.reader.source(binding, { path: intent.target.path, ref: intent.target.ref })
  return yield* guard(binding, () => {
    const native = version(binding, value.version)
    if (value.bindingID !== binding.id || value.path !== intent.target.path || value.ref !== intent.target.ref || !value.commit ||
      value.commit.toLowerCase() === intent.expected?.commit?.toLowerCase() ||
      commit !== undefined && value.commit.toLowerCase() !== commit.toLowerCase() || value.text !== text ||
      native.blob_id.toLowerCase() !== blob(text, native.blob_id) || blobID !== undefined && native.blob_id.toLowerCase() !== blobID.toLowerCase() ||
      native.last_commit_id !== undefined && native.last_commit_id.toLowerCase() !== value.commit.toLowerCase())
      throw error(binding, "outcome_unknown", "Provider did not prove the exact written file, branch, blob and new commit", "unknown")
    decode(binding, GitHubNative.SHA, value.commit)
    return { acknowledgement: { resourceID: value.commit } }
  })
})

export function reviewURL(binding: Actions.Binding, url: string, path: string) {
  const parsed = URL.parse(url)
  if (!parsed || parsed.protocol !== "https:" || parsed.host !== binding.provider.hostname || parsed.username || parsed.password ||
    parsed.search || parsed.hash || parsed.pathname !== path)
    throw error(binding, "outcome_unknown", "Review response did not prove its native request URL", "unknown")
  return url
}

export const send = Effect.fn("ActionsAuthoring.send")(function* (services: Services, binding: Actions.Binding, plan: Plan) {
  yield* actor(services, binding)
  const response = yield* services.transport.request(binding, plan.request).pipe(Effect.mapError((cause) => {
    const disposition = cause.disposition === "definitely_unsent" || cause.disposition === "definitely_rejected" ? cause.disposition : "unknown"
    return error(binding, disposition === "unknown" ? "outcome_unknown" : cause.kind, "Source provider write failed", disposition)
  }))
  if (response.status !== plan.status) {
    if ([400, 401, 403, 404, 409, 422, 429].includes(response.status)) {
      const failure = ActionsResponse.failure(binding.provider, 1, Buffer.alloc(0), response.status, { ...response.headers }, true)
      return yield* error(binding, failure.kind, "Source provider write was rejected", "definitely_rejected")
    }
    return yield* error(binding, "outcome_unknown", "Source write returned an unqualified native status", "unknown")
  }
  return yield* after(binding, plan.acknowledge(response))
})
