export * as ActionsVariableGitHubPage from "./config-variable-github-page"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsCursor } from "../cursor"
import { ActionsConfigCommon } from "./config-common"

const C = ActionsConfigCommon
export const Variable = Schema.Struct({ name: C.Text, value: Schema.String, created_at: Schema.String, updated_at: Schema.String })
export const Secret = Schema.Struct({ name: C.Text, created_at: Schema.String, updated_at: Schema.String })
const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
const Cursor = Schema.Struct({ variable: Schema.optionalKey(Schema.String), secret: Schema.optionalKey(Schema.String) })

export const list = Effect.fn("ActionsVariables.githubPage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string) {
  const budget = yield* C.guard(binding, () => ActionsCursor.limit(input.limit))
  if (budget === 1) return yield* one(services, binding, input, path)
  const cursor = yield* C.guard(binding, () => {
    if (input.cursor === undefined) return undefined
    if (!input.cursor.startsWith("combined:") || input.cursor.length > 8192) throw C.fail(binding, "invalid_input", "Invalid combined variable cursor")
    const value = C.decode(binding, Schema.fromJsonString(Cursor), Buffer.from(input.cursor.slice(9), "base64url").toString("utf8"))
    if (!value.variable && !value.secret) throw C.fail(binding, "invalid_input", "Combined variable cursor has no native continuation")
    return value
  })
  const pages = yield* Effect.forEach((["variable", "secret"] as const).filter((kind) => cursor === undefined || cursor[kind] !== undefined),
    (kind) => read(services, binding, { ...input, limit: Math.floor(budget / 2), cursor: cursor?.[kind] }, path, kind, budget), { concurrency: 1 })
  const next = Object.fromEntries(pages.flatMap((page) => page.next === undefined ? [] : [[page.kind, page.next]]))
  return { rows: pages.flatMap((page) => page.rows), capturedAt: Date.now(),
    ...(Object.keys(next).length ? { next: `combined:${Buffer.from(JSON.stringify(next)).toString("base64url")}` } : {}) }
})

const read = Effect.fn("ActionsVariables.githubNativePage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string, kind: "variable" | "secret", budget: number) {
  const selected = yield* C.guard(binding, () => C.page(binding, input, `${kind}:budget${budget}`))
  const response = yield* C.get(services, binding, { method: "GET", path: `${path}/${kind === "secret" ? "secrets" : "variables"}`,
    query: { page: selected.number, per_page: selected.limit } })
  return yield* C.guard(binding, () => {
    const native = kind === "secret"
      ? C.decode(binding, Schema.Struct({ total_count: Count, secrets: Schema.Array(Secret) }), response.data, true)
      : C.decode(binding, Schema.Struct({ total_count: Count, variables: Schema.Array(Variable) }), response.data, true)
    const rows = "secrets" in native ? native.secrets : native.variables
    return { rows, kind, ...C.pagination(binding, selected, response, rows.length, native.total_count) }
  })
})

const one = Effect.fn("ActionsVariables.githubSinglePage")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding,
  input: Actions.ResourceListInput, path: string) {
  const kind = input.cursor?.startsWith("secret:") ? "secret" : "variable"
  const page = yield* read(services, binding, { ...input, cursor: input.cursor?.replace(/^(?:secret|variable):/, "") }, path, kind, 1)
  if (kind === "secret") return { rows: page.rows, capturedAt: page.capturedAt, ...(page.next ? { next: `secret:${page.next}` } : {}) }
  const secretSelection = yield* C.guard(binding, () => C.page(binding, { ...input, cursor: undefined }, "secret:budget1"))
  if (page.rows.length === 0 && page.next === undefined) {
    const secrets = yield* read(services, binding, { ...input, cursor: undefined }, path, "secret", 1)
    return { rows: secrets.rows, capturedAt: secrets.capturedAt, ...(secrets.next ? { next: `secret:${secrets.next}` } : {}) }
  }
  return { rows: page.rows, capturedAt: page.capturedAt, next: page.next ? `variable:${page.next}`
    : `secret:${ActionsCursor.encode(binding, secretSelection.scope, secretSelection.filters, 1)}` }
})
