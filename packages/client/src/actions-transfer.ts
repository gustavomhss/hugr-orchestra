import type { Actions } from "@orchestra/schema/actions"
import type { ClientOptions, RequestOptions } from "./generated/client"
import { ActionsTransferError, actionsTransferResponseError } from "./actions-transfer-error"

export { ActionsTransferError } from "./actions-transfer-error"

type Location = { directory?: string; workspace?: string }
type StreamingRequestInit = RequestInit & { duplex?: "half" }

/**
 * Raw transfers share generated client configuration and never collect successful bodies.
 * The caller owns the successful Response lifetime. Use AbortSignal to guarantee disconnect;
 * reader.cancel() alone follows the configured fetch implementation's cancellation behavior.
 */
export function makeActionsTransfer(options: ClientOptions) {
  const request = async (prepared: ReturnType<typeof prepareTransfer>): Promise<Response> => {
    const fetch = prepared.fetch
    const response = await Promise.resolve()
      .then(() => fetch(prepared.url, prepared.init))
      .catch((cause: unknown) => {
        prepared.controller.abort()
        throw new ActionsTransferError("Transport", { cause })
      })
    if (!response.ok) return actionsTransferResponseError(response).finally(() => prepared.controller.abort())
    return response
  }

  return {
    download: async (
      input: { binding: Actions.BindingRef; target: Actions.TransferInput; location?: Location },
      requestOptions?: RequestOptions,
    ): Promise<Response> => {
      try {
        requireRecord(input, ["binding", "target", "location"], "download")
        const captured = {
          ...input,
          binding: input.binding && { ...input.binding },
          target: input.target && { ...input.target },
          location: input.location && { ...input.location },
        }
        requireTarget(captured.target)
        return request(
          prepareTransfer(
            options,
            captured.binding,
            captured.location,
            {
              kind: captured.target.kind,
              id: captured.target.id,
              runID: captured.target.runID,
              attempt: captured.target.attempt,
              path: captured.target.path,
            },
            undefined,
            requestOptions,
          ),
        )
      } catch (cause) {
        if (cause instanceof ActionsTransferError) throw cause
        throw new ActionsTransferError("Transport", { cause })
      }
    },
    /**
     * Stream uploads require a fetch implementation supporting request streams (duplex: "half").
     * Browsers may require HTTPS/HTTP2 and may not expose a reply until upload completes.
     * A failed capability probe has code "UnsupportedStreaming". A caller-owned Blob skips the
     * probe; no stream-to-Blob fallback occurs. Constructor detection is not a browser runtime proof.
     */
    upload: async (
      input: {
        binding: Actions.BindingRef
        operationID: Actions.OperationID
        filename: string
        body: ReadableStream<Uint8Array> | Blob
        location?: Location
      },
      requestOptions?: RequestOptions,
    ): Promise<Response> => {
      try {
        requireRecord(input, ["binding", "operationID", "filename", "body", "location"], "upload")
        // The admitted payload and request configuration are owned before the capability await.
        const captured = {
          ...input,
          binding: input.binding && { ...input.binding },
          location: input.location && { ...input.location },
        }
        requireText(captured.operationID, "operationID")
        if (!captured.operationID.startsWith("aop_")) invalid("Invalid operationID")
        requireText(captured.filename, "filename")
        if (
          /[/\\:\u0000-\u001f\u007f-\u009f]/.test(captured.filename) ||
          captured.filename === "." ||
          captured.filename === ".."
        )
          invalid("filename must be a basename without control characters")
        if (!(captured.body instanceof Blob) && !(captured.body instanceof ReadableStream))
          invalid("body must be a Blob or ReadableStream")
        const prepared = prepareTransfer(
          options,
          captured.binding,
          captured.location,
          { operationID: captured.operationID, filename: captured.filename },
          captured.body,
          requestOptions,
        )
        if (captured.body instanceof ReadableStream) {
          if (captured.body.locked) invalid("Upload stream is locked")
          let duplexRead = false
          const probe: StreamingRequestInit = {
            method: "POST",
            body: captured.body,
            get duplex(): "half" {
              duplexRead = true
              return "half"
            },
          }
          const supported = await Promise.resolve()
            .then(() => new Request(prepared.url, probe))
            .catch((cause: unknown) => {
              throw new ActionsTransferError("Transport", { code: "UnsupportedStreaming", cause })
            })
          // Browsers must read duplex and must not coerce a stream to text. Bun's constructor
          // need not read duplex here; Bun's streaming fetch is covered by the real HTTP fixture.
          if (supported.headers.has("content-type") || (!duplexRead && typeof Reflect.get(globalThis, "Bun") === "undefined"))
            throw new ActionsTransferError("Transport", {
              code: "UnsupportedStreaming",
              cause: new Error("fetch request streaming is unavailable; supply a Blob"),
            })
        }
        return request(prepared)
      } catch (cause) {
        if (cause instanceof ActionsTransferError) throw cause
        throw new ActionsTransferError("Transport", { cause })
      }
    },
  }
}

function prepareTransfer(
  options: ClientOptions,
  binding: Actions.BindingRef,
  location: Location | undefined,
  query: Record<string, string | number | undefined>,
  body: ReadableStream<Uint8Array> | Blob | undefined,
  requestOptions?: RequestOptions,
) {
  requireBinding(binding)
  requireLocation(location)
  const fetch = options.fetch ?? globalThis.fetch
  const url = new URL(
    `/api/actions/transfer/${encodeURIComponent(binding.id)}${body === undefined ? "" : "/upload"}`,
    options.baseUrl,
  )
  if (url.protocol !== "http:" && url.protocol !== "https:") invalid("baseUrl must use HTTP or HTTPS")
  url.searchParams.set("revision", String(binding.revision))
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value))
  })
  if (location?.directory !== undefined) url.searchParams.set("location[directory]", location.directory)
  if (location?.workspace !== undefined) url.searchParams.set("location[workspace]", location.workspace)
  const headers = new Headers(options.headers)
  new Headers(requestOptions?.headers).forEach((value, key) => headers.set(key, value))
  // Native multipart framing and its boundary belong to the server, never this adapter.
  if (body !== undefined) headers.set("content-type", "application/octet-stream")
  const controller = new AbortController()
  const signal = requestOptions?.signal
  const init: StreamingRequestInit = {
    method: body === undefined ? "GET" : "POST",
    headers,
    body,
    signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    // A provider/signed redirect must not receive the configured Orchestra credentials.
    redirect: "manual",
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  }
  return { fetch, url, init, controller }
}

function requireBinding(binding: Actions.BindingRef) {
  requireRecord(binding, ["id", "revision"], "binding")
  requireText(binding.id, "binding.id")
  if (!binding.id.startsWith("ab_") || !Number.isSafeInteger(binding.revision) || binding.revision <= 0)
    invalid("Invalid binding identity or revision")
}

function requireTarget(target: Actions.TransferInput) {
  requireRecord(target, ["kind", "id", "runID", "attempt", "path"], "target")
  if (!["jobLog", "runLog", "artifact", "secureFile"].includes(target.kind)) invalid("Invalid transfer kind")
  requireText(target.id, "target.id")
  if (target.runID !== undefined) requireText(target.runID, "target.runID", true)
  if (target.path !== undefined) requireText(target.path, "target.path", true)
  if (target.attempt !== undefined && (!Number.isSafeInteger(target.attempt) || target.attempt <= 0))
    invalid("Invalid target.attempt")
}

function requireLocation(location?: Location) {
  if (location === undefined) return
  requireRecord(location, ["directory", "workspace"], "location")
  if (location.directory !== undefined) requireText(location.directory, "location.directory", true)
  if (location.workspace !== undefined) requireText(location.workspace, "location.workspace", true)
}

function requireRecord(value: unknown, keys: string[], name: string) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    invalid(`Invalid ${name} fields`)
}

function requireText(value: unknown, name: string, empty = false): asserts value is string {
  if (typeof value !== "string" || (!empty && value.length === 0) || !value.isWellFormed()) invalid(`Invalid ${name}`)
}

function invalid(message: string): never {
  throw new ActionsTransferError("MalformedResponse", { data: { kind: "invalid_input", message } })
}
