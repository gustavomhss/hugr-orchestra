export * as ActionsCursor from "./cursor"

import { createHash } from "node:crypto"
import { Actions } from "@orchestra/schema/actions"
import { Option, Schema } from "effect"
import { ActionsError } from "./error"

const PositivePage = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100_000 }))
const Cursor = Schema.Struct({
  binding: Actions.BindingID,
  revision: Schema.Int,
  provider: Actions.ProviderKind,
  host: Schema.String,
  project: Schema.String,
  scope: Schema.String,
  filters: Schema.String,
  page: PositivePage,
})
const decode = Schema.decodeUnknownOption(Schema.fromJsonString(Cursor))

export function page(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, cursor?: string) {
  if (cursor === undefined) return 1
  const value = cursor.length <= 2048 ? decode(Buffer.from(cursor, "base64url").toString("utf8")) : Option.none()
  if (Option.isNone(value) || value.value.binding !== binding.id || value.value.revision !== binding.revision ||
    value.value.provider !== binding.provider.kind || value.value.host !== binding.provider.hostname ||
    value.value.project !== binding.projectID || value.value.scope !== scope || value.value.filters !== fingerprint(filters))
    throw new ActionsError({ kind: "invalid_input", message: "Actions cursor does not belong to this binding and selection", disposition: "definitely_unsent" })
  return value.value.page
}

export function encode(binding: Actions.Binding, scope: string, filters: Readonly<Record<string, unknown>>, page: number) {
  return Buffer.from(JSON.stringify(Cursor.make({
    binding: binding.id, revision: binding.revision, provider: binding.provider.kind,
    host: binding.provider.hostname, project: binding.projectID, scope, filters: fingerprint(filters), page,
  }))).toString("base64url")
}

export function next(headers: Readonly<Record<string, string>>) {
  const explicit = headers["x-next-page"]
  if (explicit !== undefined) {
    if (explicit === "") return
    const page = positive(explicit)
    if (page === undefined) throw paginationError()
    return page
  }
  const link = headers.link?.split(",").find((part) => /;\s*rel="?next"?(?:\s*;|\s*$)/.test(part))
  const address = link && /^\s*<([^>]+)>/.exec(link)?.[1]
  const parsed = address ? URL.parse(address, "https://pagination.invalid") : undefined
  if (!link) return
  const page = parsed && positive(parsed.searchParams.get("page") ?? "")
  if (page === undefined || page === null) throw paginationError()
  return page
}

export function total(headers: Readonly<Record<string, string>>) {
  const raw = headers["x-total"]
  if (raw === undefined) return
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw paginationError()
  return Number(raw)
}

export function limit(input?: number) {
  if (input === undefined) return 50
  if (!Number.isSafeInteger(input) || input < 1 || input > 100)
    throw new ActionsError({ kind: "invalid_input", message: "Actions page size must be between 1 and 100", disposition: "definitely_unsent" })
  return input
}

function positive(text: string) {
  if (!/^[1-9]\d*$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > 100_000) return
  return Number(text)
}

function fingerprint(filters: Readonly<Record<string, unknown>>) {
  return createHash("sha256").update(JSON.stringify(Object.entries(filters)
    .filter(([key, value]) => key !== "cursor" && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right)))).digest("hex")
}

function paginationError() {
  return new ActionsError({ kind: "transport_failed", message: "Provider returned invalid Actions pagination metadata" })
}
