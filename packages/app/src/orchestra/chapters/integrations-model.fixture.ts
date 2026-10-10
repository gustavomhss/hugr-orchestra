import { afterEach } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { SessionID } from "@orchestra/schema/session-id"
import { createRoot } from "solid-js"
import type { Api, Options } from "./integrations-contract"
import { createIntegrationModel } from "./integrations-model"

const cleanup = new Set<() => void>()
afterEach(() => { cleanup.forEach((dispose) => dispose()); cleanup.clear() })

// happydom replaces Response, but Bun.serve requires Bun's native wire response.
export const Response = (await Bun.fetch("data:application/json,{}")).constructor as typeof global.Response

export function connection(index = 1) {
  return CapabilityManagement.Connection.make({ connection: {
    id: Capability.ConnectionID.make(`cconn_${String(index).padStart(26, "0")}`), provider: "slack", generation: 0,
  }, credential: "present", state: "active", label: `account ${index}` })
}
export function target(index = 1, parent = 1) {
  return CapabilityManagement.Target.make({ target: {
    id: Capability.TargetID.make(`ctgt_${String(index).padStart(26, "0")}`), connectionID: connection(parent).connection.id,
    generation: 0, environment: "test",
  } })
}
export function binding(index = 1) {
  return CapabilityManagement.Binding.make({ sessionID: SessionID.make(`ses_${String(index).padStart(26, "0")}`), actions: ["send"] })
}
export function json(value: unknown, status = 200) { return Response.json(value, { status }) }
export function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

// Test-only HTTP transport intentionally leaves JSON unvalidated: controller must check the wire DTO.
export function fixture(handler: (request: Request) => Response | Promise<Response>, ignoreAbort = false) {
  const signals: AbortSignal[] = []
  const requests: { method: string; url: string; key: string | null; body: unknown }[] = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    requests.push({ method: request.method, url: request.url, key: request.headers.get("idempotency-key"),
      body: request.method === "POST" ? await request.clone().json() : undefined })
    return handler(request)
  } })
  cleanup.add(() => server.stop(true))
  const request = async <T>(path: string, options?: Options, body?: unknown, key?: string): Promise<T> => {
    if (options?.signal) signals.push(options.signal)
    const response = await Bun.fetch(new URL(path, server.url), { method: body === undefined ? "GET" : "POST",
      signal: ignoreAbort ? undefined : options?.signal, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "content-type": "application/json", ...(key === undefined ? {} : { "idempotency-key": key }) } })
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status)) throw await response.json()
      throw new Error("UnexpectedStatus", { cause: { status: response.status } })
    }
    return response.json()
  }
  const query = (after?: string) => after === undefined ? "" : `?after=${encodeURIComponent(after)}`
  const api: Api = {
    list: (after, options) => request(`/api/capability/connections${query(after)}`, options),
    targets: (id, after, options) => request(`/api/capability/connections/${id}/targets${query(after)}`, options),
    bindings: (id, after, options) => request(`/api/capability/targets/${id}/bindings${query(after)}`, options),
    connect: (input, key, options) => request("/api/capability/connections/connect", options, input, key),
    createTarget: (connection, input, key, options) => request("/api/capability/targets", options, { connection, input }, key),
    retargetTarget: (target, input, key, options) => request("/api/capability/targets/retarget", options, { target, input }, key),
    removeTarget: (target, key, options) => request("/api/capability/targets/remove", options, { target }, key),
    disconnect: (connection, key, options) => request("/api/capability/connections/disconnect", options, { connection }, key),
    bind: (target, input, key, options) => request("/api/capability/bindings", options, { target, input }, key),
    unbind: (target, sessionID, key, options) => request("/api/capability/bindings/remove", options, { target, sessionID }, key),
  }
  const root = createRoot((dispose) => {
    cleanup.add(dispose)
    let serial = 0
    return { model: createIntegrationModel(api, () => `private-intent-${++serial}`), dispose }
  })
  return { ...root, api, requests, signals, stop: () => server.stop(true) }
}

export function reads(request: Request) {
  if (request.method !== "GET") throw new Error("Unexpected fixture mutation")
  const path = new URL(request.url).pathname
  if (path.endsWith("/bindings")) return json(CapabilityManagement.BindingPage.make({ items: [binding()], coverage: "current-actor" }))
  if (path.endsWith("/targets")) return json(CapabilityManagement.TargetPage.make({ items: [target()], coverage: "live" }))
  return json(CapabilityManagement.ConnectionPage.make({ items: [connection(), connection(2)], coverage: "live" }))
}
