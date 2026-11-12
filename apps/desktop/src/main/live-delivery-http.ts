import { DeliveryRequestError, DeliveryStaleError, LiveDeliveryError } from "./live-delivery-error.ts"
import { deliveryConnection, deliveryObject, sameConnection } from "./live-delivery-values.ts"
import type { DeliveryConnection } from "./live-delivery-values.ts"
import type { LiveDeliveryOptions } from "./live-delivery-contract.ts"
import type { OutboxTarget } from "./live-outbox-contract.ts"

type Operation = "start" | "read" | "append" | "stop"
type Request = {
  readonly signal: AbortSignal
  readonly body?: unknown
  readonly meetingID?: string
  readonly directory?: string
  readonly target?: OutboxTarget
  readonly expected?: DeliveryConnection
  readonly beforeSend?: () => void
  readonly sent?: (connection: DeliveryConnection) => void
}

// Host resolution/backoff transfers no resource. Observe late outcomes without retaining ownership of its Promise.
export function deliveryAwait<A>(work: () => PromiseLike<A>, signal: AbortSignal): Promise<A> {
  if (signal.aborted) return Promise.reject(new LiveDeliveryError("cancelled"))
  return new Promise((resolve, reject) => {
    let settled = false
    const done = (body: () => void) => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", abort)
      body()
    }
    const abort = () => done(() => reject(new LiveDeliveryError("cancelled")))
    signal.addEventListener("abort", abort, { once: true })
    try {
      Promise.resolve(work()).then((value) => done(() => resolve(value)), (error: unknown) => done(() => reject(error)))
    } catch (error) { done(() => reject(error)) }
    if (signal.aborted) abort()
  })
}

export function deliverySleep(milliseconds: number, signal: AbortSignal, sleep?: LiveDeliveryOptions["sleep"]) {
  if (sleep) return deliveryAwait(() => sleep(milliseconds, signal), signal)
  if (signal.aborted) return Promise.reject(new LiveDeliveryError("cancelled"))
  return new Promise<void>((resolve, reject) => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); resolve() }
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(new LiveDeliveryError("cancelled")) }
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
  })
}

export function createDeliveryHttp(connection: LiveDeliveryOptions["connection"]) {
  let active = 0
  const queue: { grant(): void; cancel(): void }[] = []
  const pump = () => { while (active < 2 && queue.length) queue.shift()!.grant() }
  const permit = (signal: AbortSignal) => new Promise<() => void>((resolve, reject) => {
    if (signal.aborted) { reject(new LiveDeliveryError("cancelled")); return }
    const waiter = {
      grant() {
        signal.removeEventListener("abort", waiter.cancel)
        if (signal.aborted) { reject(new LiveDeliveryError("cancelled")); return }
        active++
        let released = false
        resolve(() => { if (released) return; released = true; active--; pump() })
      },
      cancel() {
        const index = queue.indexOf(waiter)
        if (index === -1) return
        queue.splice(index, 1); signal.removeEventListener("abort", waiter.cancel)
        reject(new LiveDeliveryError("cancelled")); pump()
      },
    }
    queue.push(waiter); signal.addEventListener("abort", waiter.cancel, { once: true }); pump()
  })
  const resolve = async (signal: AbortSignal) => {
    try {
      const value = await deliveryAwait(() => connection(signal), signal)
      if (signal.aborted) throw new LiveDeliveryError("cancelled")
      return deliveryConnection(value)
    } catch (error) {
      if (error instanceof LiveDeliveryError) throw error
      throw new DeliveryRequestError("offline", true)
    }
  }
  const check = async (expected: DeliveryConnection, signal: AbortSignal) => {
    if (!sameConnection(expected, await resolve(signal))) throw new DeliveryStaleError()
  }

  return {
    resolve,
    check,
    async request(operation: Operation, input: Request) {
      const observed = await resolve(input.signal)
      const release = await permit(input.signal)
      try {
        const current = await resolve(input.signal)
        if (!sameConnection(observed, current) || (input.expected && !sameConnection(input.expected, current))) throw new DeliveryStaleError()
        if (input.target && input.target.mode !== current.mode) throw new LiveDeliveryError("target")
        if (input.signal.aborted) throw new LiveDeliveryError("cancelled")
        input.beforeSend?.()
        if (input.signal.aborted) throw new LiveDeliveryError("cancelled")
        const url = new URL(operation === "read" ? "/api/meeting" : operation === "append" ? "/api/meeting/segments" : `/api/meeting/${operation}`, current.origin)
        const directory = input.directory ?? current.directory
        if (directory !== undefined) url.searchParams.set("location[directory]", directory)
        if (operation === "read") url.searchParams.set("meetingID", input.meetingID ?? "")
        const headers = new Headers({ "content-type": "application/json" })
        if (current.password) headers.set("authorization", `Basic ${Buffer.from(`${current.username ?? "orchestra"}:${current.password}`).toString("base64")}`)
        const body = input.body === undefined ? undefined : JSON.stringify(input.body)
        if (body !== undefined && Buffer.byteLength(body) > 1024 * 1024) throw new LiveDeliveryError(operation === "append" ? "storage" : "quota")
        const abort = new AbortController()
        const cancel = () => abort.abort()
        let expired = false
        let complete = false
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
        const timer = setTimeout(() => { expired = true; abort.abort() }, 10000)
        input.signal.addEventListener("abort", cancel, { once: true })
        if (input.signal.aborted) cancel()
        try {
          input.sent?.(current)
          const response = await fetch(url, { method: operation === "read" ? "GET" : "POST", headers, body, redirect: "manual", signal: abort.signal })
          const limit = operation === "read" ? 128 * 1024 * 1024 : 1024 * 1024
          const chunks: Uint8Array[] = []
          let length = 0
          if (response.body) {
            reader = response.body.getReader()
            while (true) {
              const chunk = await reader.read()
              if (chunk.done) { complete = true; break }
              length += chunk.value.byteLength
              if (length > limit) throw new DeliveryRequestError("target", false, current)
              chunks.push(chunk.value)
            }
          } else complete = true
          if (input.signal.aborted && operation !== "start") throw new LiveDeliveryError("cancelled")
          if (expired) throw new DeliveryRequestError("deadline", true, current)
          const text = Buffer.concat(chunks, length).toString("utf8")
          if (response.status >= 300 && response.status < 400) throw new DeliveryRequestError("target", false, current)
          if (response.status === 401 || response.status === 403) throw new DeliveryRequestError("authentication", false, current)
          if (response.status === 404) throw new DeliveryRequestError("missing", false, current)
          if (response.status === 408 || response.status === 429 || response.status >= 500) throw new DeliveryRequestError("offline", true, current)
          if (response.status === 400) {
            let reason: unknown
            try { const value = deliveryObject(JSON.parse(text)); reason = value.name === "MeetingError" ? deliveryObject(value.data).reason : undefined } catch { reason = undefined }
            throw new DeliveryRequestError(reason === "missing_meeting" || reason === "missing_session" ? "missing" : reason === "ended" ? "ended" : "conflict", false, current)
          }
          if (response.status !== (operation === "append" ? 204 : 200)) throw new DeliveryRequestError("conflict", false, current)
          if (operation === "append") return { connection: current, data: undefined }
          try { return { connection: current, data: JSON.parse(text) as unknown } }
          catch { throw new DeliveryRequestError("target", false, current) }
        } catch (error) {
          if (input.signal.aborted && !(operation === "start" && complete)) throw new LiveDeliveryError("cancelled")
          if (expired) throw new DeliveryRequestError("deadline", true, current)
          if (error instanceof LiveDeliveryError) throw error
          throw new DeliveryRequestError("offline", true, current)
        } finally {
          try {
            if (!complete) abort.abort()
            if (reader) { await Promise.allSettled([reader.cancel(), reader.closed]); reader.releaseLock() }
            if (expired) throw new DeliveryRequestError("deadline", true, current)
          } finally { clearTimeout(timer); input.signal.removeEventListener("abort", cancel) }
        }
      } finally { release() }
    },
  }
}
