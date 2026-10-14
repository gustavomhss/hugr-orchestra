import type { Actions } from "@orchestra/schema/actions"
import { ClientError, type ClientErrorReason } from "./generated/client-error"

export class ActionsTransferError extends ClientError {
  readonly code?: "UnsupportedStreaming"
  readonly status?: number
  readonly data?: Actions.ErrorData
  readonly kind?: Actions.ErrorKind
  // The frozen ErrorData has no outcome schema yet. Preserve the wire value without guessing its shape.
  readonly outcome?: unknown
  readonly retryAfter?: number
  readonly truncated: boolean

  constructor(
    reason: ClientErrorReason,
    details: {
      code?: "UnsupportedStreaming"
      cause?: unknown
      status?: number
      data?: Actions.ErrorData & { outcome?: unknown }
      retryAfter?: number
      truncated?: boolean
    } = {},
  ) {
    super(reason, { cause: details.cause })
    this.code = details.code
    this.status = details.status
    this.data = details.data
    this.kind = details.data?.kind
    this.outcome = details.data?.outcome
    this.retryAfter = details.data?.retryAfter ?? details.retryAfter
    this.truncated = details.truncated ?? false
    this.message = details.data?.message ?? details.code ?? reason
  }
}

/** Error bodies only: at most 16 KiB retained, with a five-second read deadline. */
export async function actionsTransferResponseError(response: Response): Promise<never> {
  const details = { status: response.status, retryAfter: retryAfter(response.headers.get("retry-after")) }
  const captured = await capture(response).catch((cause: unknown) => {
    throw new ActionsTransferError("Transport", { ...details, cause })
  })
  if (captured.truncated) throw new ActionsTransferError("MalformedResponse", { ...details, truncated: true })
  if (!/^application\/(?:json|[\w.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get("content-type") ?? ""))
    throw new ActionsTransferError("UnexpectedStatus", details)
  const data = parse(captured.bytes)
  if (!isErrorData(data)) throw new ActionsTransferError("MalformedResponse", details)
  throw new ActionsTransferError("UnexpectedStatus", { ...details, data })
}

async function capture(response: Response) {
  const bytes = new Uint8Array(16_384)
  if (!response.body) return { bytes: bytes.subarray(0, 0), truncated: false }
  const reader = response.body.getReader()
  let length = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Actions error response read timed out")), 5_000)
  })
  try {
    while (true) {
      const next = await Promise.race([reader.read(), deadline])
      if (next.done) return { bytes: bytes.subarray(0, length), truncated: false }
      if (next.value.byteLength > bytes.length - length) return { bytes: bytes.subarray(0, length), truncated: true }
      bytes.set(next.value, length)
      length += next.value.byteLength
    }
  } finally {
    clearTimeout(timer)
    // Do not let a broken peer extend the capture deadline through cancellation.
    void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function parse(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch {
    return undefined
  }
}

function isErrorData(value: unknown): value is Actions.ErrorData & { outcome?: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  if (
    !("kind" in value) ||
    typeof value.kind !== "string" ||
    !("message" in value) ||
    typeof value.message !== "string"
  )
    return false
  const kinds: ReadonlyArray<Actions.ErrorKind> = [
    "binding_missing",
    "binding_stale",
    "host_mismatch",
    "cli_missing",
    "not_authenticated",
    "permission_denied",
    "capability_unavailable",
    "not_found",
    "invalid_input",
    "source_conflict",
    "source_unresolved",
    "rate_limited",
    "metadata_truncated",
    "transport_failed",
    "transfer_failed",
    "outcome_unknown",
    "operation_missing",
    "operation_expired",
    "operation_reused",
    "intent_conflict",
    "maintenance_required",
  ]
  return (
    kinds.some((kind) => kind === value.kind) &&
    (!("bindingID" in value) || (typeof value.bindingID === "string" && value.bindingID.startsWith("ab_"))) &&
    (!("operationID" in value) || (typeof value.operationID === "string" && value.operationID.startsWith("aop_"))) &&
    (!("resourceID" in value) || typeof value.resourceID === "string") &&
    (!("provider" in value) || value.provider === "github" || value.provider === "gitlab") &&
    (!("disposition" in value) ||
      value.disposition === "definitely_unsent" ||
      value.disposition === "definitely_rejected" ||
      value.disposition === "unknown") &&
    (!("retryAfter" in value) ||
      (typeof value.retryAfter === "number" && Number.isFinite(value.retryAfter) && value.retryAfter >= 0))
  )
}

function retryAfter(value: string | null) {
  if (value === null) return undefined
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number.isFinite(Number(value)) ? Number(value) : undefined
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, (date - Date.now()) / 1_000) : undefined
}
