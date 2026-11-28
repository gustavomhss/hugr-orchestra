export * as ActivityPrivateChannel from "./activity-private-channel"

import { ActivityPrivateChannel as Protocol } from "@orchestra/schema/activity-private-channel"
import type { Readable } from "node:stream"
import type { HttpExtension } from "./http-extensions"

export const option = Protocol.option

/** Acquired only by the desktop-owned server before any listener or installation starts. */
export async function acquire(input: Readable, signal: AbortSignal): Promise<HttpExtension> {
  const frame = new Uint8Array(Protocol.frameBytes)
  const key = await new Promise<Uint8Array>((resolve, reject) => {
    let size = 0
    let finished = false
    const cleanup = () => {
      clearTimeout(timer)
      input.off("data", data)
      input.off("end", end)
      input.off("error", fail)
      input.off("close", close)
      signal.removeEventListener("abort", fail)
    }
    const fail = () => {
      if (finished) return
      finished = true
      cleanup()
      frame.fill(0)
      input.destroy()
      reject(new Error("Activity private channel startup failed"))
    }
    const data = (chunk: Buffer | string) => {
      if (typeof chunk === "string" || size + chunk.length > frame.length) return fail()
      frame.set(chunk, size)
      size += chunk.length
      chunk.fill(0)
    }
    const end = () => {
      if (finished) return
      const secret = size === frame.length ? Protocol.keyFromFrame(frame) : undefined
      frame.fill(0)
      if (!secret) return fail()
      finished = true
      cleanup()
      resolve(secret)
    }
    const close = () => { if (!input.readableEnded) fail() }
    const timer = setTimeout(fail, 5_000)
    input.on("data", data)
    input.once("end", end)
    input.once("error", fail)
    input.once("close", close)
    signal.addEventListener("abort", fail, { once: true })
    if (signal.aborted || input.destroyed) fail()
  })
  const signer = await Protocol.signer(key).finally(() => key.fill(0))
  return {
    mount: Protocol.path,
    async handler(request) {
      const url = new URL(request.url)
      if (request.method !== "POST" || url.pathname !== Protocol.path || url.search ||
        request.headers.has("origin") || request.body !== null || request.headers.has("transfer-encoding") ||
        (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) {
        return new Response(null, { status: 403, headers: { "cache-control": "no-store" } })
      }
      const nonce = request.headers.get(Protocol.nonceHeader)
      if (!await signer.verify("probe-request", nonce, request.headers.get(Protocol.macHeader)) || !nonce) {
        return new Response(null, { status: 403, headers: { "cache-control": "no-store" } })
      }
      return new Response(null, { status: 204, headers: {
        "cache-control": "no-store", [Protocol.macHeader]: await signer.sign("probe-response", nonce),
      } })
    },
  }
}
