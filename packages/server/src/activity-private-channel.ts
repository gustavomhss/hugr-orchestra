export * as ActivityPrivateChannelServer from "./activity-private-channel"

import type { ActivityArmLedger } from "@orchestra/core/activity-arm"
import { ActivityArm } from "@orchestra/schema/activity-arm"
import { Effect, Option } from "effect"
import { ActivityPrivateChannel } from "@orchestra/schema/activity-private-channel"
import type { Readable } from "node:stream"
import type { HttpExtension } from "./http-extensions"

/** Acquired only by the desktop-owned server before any listener or installation starts. */
export async function acquire(input: Readable, signal: AbortSignal, arm?: ActivityArmLedger.Interface): Promise<HttpExtension> {
  const frame = new Uint8Array(ActivityPrivateChannel.frameBytes)
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
      const secret = size === frame.length ? ActivityPrivateChannel.keyFromFrame(frame) : undefined
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
  const signer = await ActivityPrivateChannel.signer(key).finally(() => key.fill(0))
  return {
    mount: ActivityPrivateChannel.mount,
    async handler(request) {
      const url = new URL(request.url)
      const forbidden = () => new Response(null, { status: 403, headers: { "cache-control": "no-store" } })
      if (request.method !== "POST" || url.search || request.headers.has("origin")) return forbidden()
      const nonce = request.headers.get(ActivityPrivateChannel.nonceHeader)
      const mac = request.headers.get(ActivityPrivateChannel.macHeader)
      if (url.pathname === ActivityPrivateChannel.path) {
        if (request.body !== null || request.headers.has("transfer-encoding") ||
          (request.headers.has("content-length") && request.headers.get("content-length") !== "0") ||
          !nonce || !await signer.verify("probe-request", nonce, mac)) return forbidden()
        return new Response(null, { status: 204, headers: {
          "cache-control": "no-store", [ActivityPrivateChannel.macHeader]: await signer.sign("probe-response", nonce),
        } })
      }
      if (!arm || (url.pathname !== ActivityPrivateChannel.previewPath && url.pathname !== ActivityPrivateChannel.confirmPath)) {
        return forbidden()
      }
      const endpoint = url.pathname
      const body = await readBody(request)
      if (body === undefined || !nonce || !await signer.verifyArm("arm-request", endpoint, nonce, mac, body)) return forbidden()
      const decoded = parseBody(body, endpoint)
      if (!decoded || request.signal.aborted) return forbidden()
      const result = await (decoded.kind === "preview"
        ? Effect.runPromise(arm.preview(decoded.value), { signal: request.signal })
        : Effect.runPromise(arm.confirm(decoded.value), { signal: request.signal })).catch(() => undefined)
      if (!result) return new Response(null, { status: 409, headers: { "cache-control": "no-store" } })
      const receipt: Option.Option<ActivityArm.Preview | ActivityArm.Receipt> = endpoint === ActivityPrivateChannel.previewPath
        ? ActivityArm.decodePreview(result)
        : ActivityArm.decodeReceipt(result)
      if (receipt._tag === "None") return new Response(null, { status: 409, headers: { "cache-control": "no-store" } })
      const json = JSON.stringify(receipt.value)
      return new Response(json, { status: 200, headers: {
        "cache-control": "no-store", "content-type": "application/json",
        [ActivityPrivateChannel.macHeader]: await signer.signArm("arm-response", endpoint, nonce, json),
      } })
    },
  }
}


function parseBody(body: string, endpoint: ActivityPrivateChannel.ArmPath) {
  try {
    const json: unknown = JSON.parse(body)
    if (endpoint === ActivityPrivateChannel.previewPath) {
      const request = ActivityArm.decodeRequest(json)
      return Option.isSome(request) ? { kind: "preview" as const, value: request.value } : undefined
    }
    const confirm = ActivityArm.decodeConfirm(json)
    return Option.isSome(confirm) ? { kind: "confirm" as const, value: confirm.value } : undefined
  } catch {
    return undefined
  }
}

async function readBody(request: Request): Promise<string | undefined> {
  if (!request.body || request.signal.aborted) return undefined
  const length = request.headers.get("content-length")
  if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > ActivityPrivateChannel.maxBodyBytes)) return undefined
  const reader = request.body.getReader()
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
  const controller = new AbortController()
  const abort = () => controller.abort()
  request.signal.addEventListener("abort", abort, { once: true })
  const timer = setTimeout(abort, 5_000)
  const interrupted = new Promise<undefined>((resolve) => {
    controller.signal.addEventListener("abort", () => resolve(undefined), { once: true })
  })
  try {
    const read = async () => {
      let size = 0
      let body = ""
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) return body + decoder.decode()
        size += chunk.value.byteLength
        if (size > ActivityPrivateChannel.maxBodyBytes) return undefined
        body += decoder.decode(chunk.value, { stream: true })
      }
    }
    return await Promise.race([read(), interrupted])
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
    request.signal.removeEventListener("abort", abort)
    void reader.cancel().catch(() => undefined)
  }
}
