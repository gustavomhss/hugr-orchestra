export * as GitHubNative from "./native"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsError } from "../error"

export const ID = Schema.Union([
  Schema.String.check(Schema.isPattern(/^[1-9]\d{0,127}$/)),
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER })),
])
export const Positive = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }))
export const Count = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))
export const SHA = Schema.String.check(Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i))
export const Time = Schema.String.check(Schema.isPattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/))
export const Repository = Schema.Struct({
  id: ID, full_name: Schema.NonEmptyString,
  default_branch: Schema.optionalKey(Schema.NullOr(Schema.String)),
  permissions: Schema.optionalKey(Schema.Struct({
    pull: Schema.optionalKey(Schema.Boolean), push: Schema.optionalKey(Schema.Boolean),
    admin: Schema.optionalKey(Schema.Boolean), maintain: Schema.optionalKey(Schema.Boolean),
  })),
})

export function error(binding: Actions.Binding, kind: Actions.ErrorKind, message: string) {
  return new ActionsError({ kind, message, bindingID: binding.id, provider: "github", disposition: "definitely_unsent" })
}

export function decode<A>(binding: Actions.Binding, schema: Schema.Decoder<A>, data: unknown, label: string): A {
  const value = Schema.decodeUnknownOption(schema)(data)
  if (Option.isNone(value)) throw error(binding, "transport_failed", `GitHub returned invalid ${label} metadata`)
  return value.value
}

export function id(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !/^[1-9]\d{0,127}$/.test(value)) throw error(binding, "invalid_input", "GitHub target ID must be a canonical positive decimal")
  return value
}

export function ref(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !value || value.length > 1024 || /[\s\\%?#{}:\x00-\x1f\x7f~^*\[]/.test(value) || value.includes("..") ||
      value.includes("@{") || value === "@" || value.startsWith("-") || value.endsWith(".") ||
      value.split("/").some((part) => !part || part.startsWith(".") || part.endsWith(".lock")))
    throw error(binding, "invalid_input", "GitHub ref must be an exact safe branch, tag or commit")
  return value
}

export function path(binding: Actions.Binding, value: string) {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\\%{}:\x00-\x1f\x7f]/.test(value) ||
      value.split("/").some((part) => !part || part === "." || part === ".."))
    throw error(binding, "invalid_input", "GitHub source path must be an exact repository-relative path")
  return value.split("/").map(encodeURIComponent).join("/")
}

// Every read stays ID-addressed after this lookup; full_name is display metadata.
// Lead qualified these immutable routes with live gh on github.com. An unsupported
// host must return its native error, never fall back to a reused owner/repo path.
// https://docs.github.com/en/rest/repos/repos#get-a-repository
export const repository = Effect.fn("ActionsGitHubRead.repository")(function* (transport: ActionsContract.Transport, binding: Actions.Binding) {
  if (binding.provider.kind !== "github") return yield* error(binding, "host_mismatch", "GitHub read adapter requires a GitHub binding")
  const target = yield* checked(binding, () => id(binding, binding.projectID))
  const response = yield* get(transport, binding, { method: "GET", path: `repositories/${target}` })
  return yield* checked(binding, () => {
    const native = decode(binding, Repository, response.data, "repository")
    if (String(native.id) !== binding.projectID) throw error(binding, "binding_stale", "GitHub repository ID does not match the binding")
    return { native, path: `repositories/${target}`, headers: response.headers }
  })
})

export const get = Effect.fn("ActionsGitHubRead.get")(function* (transport: ActionsContract.Transport, binding: Actions.Binding, input: ActionsContract.Request) {
  const response = yield* transport.request(binding, input)
  if (response.status !== 200) return yield* error(binding, "transport_failed", "GitHub read transport returned a non-success response")
  return response
})

export function checked<A>(binding: Actions.Binding, fn: () => A) {
  return Effect.try({ try: fn, catch: (cause) => cause instanceof ActionsError ? cause : error(binding, "transport_failed", "GitHub metadata could not be decoded") })
}

export function selection(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, cursor?: string, limit?: number) {
  const per_page = ActionsCursor.limit(limit)
  const effective = { ...filters, per_page }
  return { filters: effective, scope, per_page, page: ActionsCursor.page(binding, scope, effective, cursor) }
}

export function pagination(binding: Actions.Binding, response: ActionsContract.Response, request: ActionsContract.Request,
  selected: ReturnType<typeof selection>, count: number, nativeTotal?: number) {
  const headers = response.headers
  const next = ActionsCursor.next(headers)
  const headerTotal = ActionsCursor.total(headers)
  const total = nativeTotal ?? headerTotal
  const fail = () => error(binding, "transport_failed", "GitHub returned invalid or incomplete pagination metadata")
  if (nativeTotal !== undefined && headerTotal !== undefined && nativeTotal !== headerTotal) throw fail()
  if (count > selected.per_page || (next !== undefined && next !== selected.page + 1)) throw fail()
  if (headers.link !== undefined) {
    if (ActionsCursor.next({ link: headers.link }) !== next) throw fail()
    const origin = binding.provider.apiOrigin.replace(/\/$/, "")
    const expected = new URL(`${origin}/${request.path}`)
    headers.link.split(",").forEach((part) => {
      const match = /^\s*<([^>]+)>;\s*rel="?(next|prev|first|last)"?\s*$/.exec(part)
      const url = match && URL.parse(match[1])
      if (!match || !url || url.origin !== expected.origin || url.pathname !== expected.pathname || url.username || url.password || url.hash) throw fail()
      const page = url.searchParams.get("page")
      if (!page || !/^[1-9]\d*$/.test(page) || Number(page) > 100_000) throw fail()
      const query = Object.fromEntries(url.searchParams)
      if (Array.from(url.searchParams.keys()).length !== Object.keys(query).length) throw fail()
      const wanted = { ...request.query, page: Number(page) }
      if (Object.keys(query).length !== Object.keys(wanted).length ||
          Object.entries(wanted).some(([key, value]) => query[key] !== String(value))) throw fail()
    })
  }
  if (total !== undefined && ((count > 0 && total < (selected.page - 1) * selected.per_page + count) ||
      (next === undefined && total > selected.page * selected.per_page) || (next !== undefined && total <= selected.page * selected.per_page))) throw fail()
  if (next !== undefined && count === 0) throw fail()
  if (next === undefined && total === undefined && count === selected.per_page && headers.link === undefined && headers["x-next-page"] === undefined) throw fail()
  return {
    ...(next === undefined ? {} : { next: ActionsCursor.encode(binding, selected.scope, selected.filters, next) }),
    ...(total === undefined ? {} : { total }), capturedAt: Date.now(),
  }
}
