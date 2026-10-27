import { ClientError } from "@orchestra/client"

export type ConfigInvalidError = {
  name: "ConfigInvalidError"
  data: {
    path?: string
    message?: string
    issues?: Array<{ message: string; path: string[] }>
  }
}

export type ProviderModelNotFoundError = {
  name: "ProviderModelNotFoundError"
  data: {
    providerID: string
    modelID: string
    suggestions?: string[]
  }
}

type Translator = (key: string, vars?: Record<string, string | number>) => string

function tr(translator: Translator | undefined, key: string, text: string, vars?: Record<string, string | number>) {
  if (!translator) return text
  const out = translator(key, vars)
  if (!out || out === key) return text
  return out
}

export function formatServerError(error: unknown, translate?: Translator, fallback?: string) {
  const unwrapped = unwrapNamedError(error)
  if (isConfigInvalidErrorLike(unwrapped)) return parseReadableConfigInvalidError(unwrapped, translate)
  if (isProviderModelNotFoundErrorLike(unwrapped)) return parseReadableProviderModelNotFoundError(unwrapped, translate)
  // The client throws a declared error's typed body (`{ _tag, message }`) as is, or a boundary wraps it as the cause of
  // a generic Error; its message is the server's own words, so it wins over the wrapper's.
  if (
    unwrapped &&
    typeof unwrapped === "object" &&
    "message" in unwrapped &&
    typeof unwrapped.message === "string" &&
    unwrapped.message
  )
    return unwrapped.message
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "string" && error) return error
  if (fallback) return fallback
  return tr(translate, "error.chain.unknown", "Unknown error")
}

/**
 * `generic` followed by the server's own reason, so a failure says what the server answered. A bare ClientError (an
 * undeclared answer) carries no message worth showing, so it keeps only `generic`.
 */
export function withServerReason(generic: string, error: unknown) {
  if (error instanceof ClientError) return generic
  const reason = formatServerError(error, undefined, "")
  return reason && reason !== generic ? `${generic} ${reason}` : generic
}

function unwrapNamedError(error: unknown): unknown {
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object") return error
  if ("body" in error.cause) return (error.cause as Record<string, unknown>).body
  // A boundary wraps a thrown non-Error value as `new Error("Unknown error", { cause })`, as Solid does with the server's
  // typed error bodies the clients throw; the body is the cause.
  if (!(error.cause instanceof Error)) return error.cause
  return error
}

// Client-synthesized session not-found errors share one constructor and
// predicate so the message contract cannot drift between the sync store
// (server-session.ts), the route lineage (session-lineage.ts), and the
// not-found fallback matching (session.tsx).
const sessionNotFoundMessage = (sessionID: string) => `Session not found: ${sessionID}`

export function sessionNotFoundError(sessionID: string) {
  return new Error(sessionNotFoundMessage(sessionID))
}

export function isLocalSessionNotFoundError(error: unknown, sessionID: string) {
  return error instanceof Error && error.message === sessionNotFoundMessage(sessionID)
}

export function isSessionNotFoundError(error: unknown, sessionID: string) {
  const unwrapped = unwrapNamedError(error)
  if (typeof unwrapped !== "object" || unwrapped === null) return false
  const value = unwrapped as Record<string, unknown>
  return value._tag === "SessionNotFoundError" && value.sessionID === sessionID
}

/** The server's answer for a Location whose directory no longer exists, e.g. a project folder that was removed. */
export function isLocationNotFoundError(error: unknown) {
  const unwrapped = unwrapNamedError(error)
  if (typeof unwrapped !== "object" || unwrapped === null) return false
  const value = unwrapped as Record<string, unknown>
  return value._tag === "InvalidRequestError" && value.kind === "location_not_found"
}

/** The hook that stopped a prompt before the server admitted it, with the hook's own words. */
export function hookRefusal(error: unknown) {
  const unwrapped = unwrapNamedError(error)
  if (typeof unwrapped !== "object" || unwrapped === null) return undefined
  const body = unwrapped as Record<string, unknown>
  if (body.name !== "PromptBlockedError" || typeof body.data !== "object" || body.data === null) return undefined
  const hook = (body.data as Record<string, unknown>).hook
  if (typeof hook !== "object" || hook === null) return undefined
  const value = hook as Record<string, unknown>
  if (typeof value.name !== "string" || typeof value.message !== "string") return undefined
  return { name: value.name, message: value.message }
}

function isConfigInvalidErrorLike(error: unknown): error is ConfigInvalidError {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return o.name === "ConfigInvalidError" && typeof o.data === "object" && o.data !== null
}

function isProviderModelNotFoundErrorLike(error: unknown): error is ProviderModelNotFoundError {
  if (typeof error !== "object" || error === null) return false
  const o = error as Record<string, unknown>
  return o.name === "ProviderModelNotFoundError" && typeof o.data === "object" && o.data !== null
}

export function parseReadableConfigInvalidError(errorInput: ConfigInvalidError, translator?: Translator) {
  const file = errorInput.data.path && errorInput.data.path !== "config" ? errorInput.data.path : "config"
  const detail = errorInput.data.message?.trim() ?? ""
  const issues = (errorInput.data.issues ?? [])
    .map((issue) => {
      const msg = issue.message.trim()
      if (!issue.path.length) return msg
      return `${issue.path.join(".")}: ${msg}`
    })
    .filter(Boolean)
  const msg = issues.length ? issues.join("\n") : detail
  if (!msg) return tr(translator, "error.chain.configInvalid", `Config file at ${file} is invalid`, { path: file })
  return tr(translator, "error.chain.configInvalidWithMessage", `Config file at ${file} is invalid: ${msg}`, {
    path: file,
    message: msg,
  })
}

function parseReadableProviderModelNotFoundError(errorInput: ProviderModelNotFoundError, translator?: Translator) {
  const p = errorInput.data.providerID.trim()
  const m = errorInput.data.modelID.trim()
  const list = (errorInput.data.suggestions ?? []).map((v) => v.trim()).filter(Boolean)
  const body = tr(translator, "error.chain.modelNotFound", `Model not found: ${p}/${m}`, { provider: p, model: m })
  const tail = tr(translator, "error.chain.checkConfig", "Check your config (orchestra.json) provider/model names")
  if (list.length) {
    const suggestions = list.slice(0, 5).join(", ")
    return [body, tr(translator, "error.chain.didYouMean", `Did you mean: ${suggestions}`, { suggestions }), tail].join(
      "\n",
    )
  }
  return [body, tail].join("\n")
}
