import { expect, test } from "bun:test"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Schema } from "effect"
import { createMemo, createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createServerContextCache } from "../src/context/global"
import { ServerConnection } from "../src/context/server"
import { createServerSdkContext } from "../src/context/server-sdk"
import { ServerScope } from "../src/utils/server-scope"

// Calibrates the future FEN03 ordering fixture, not the chapter's stale-response guard.
// A fetch held before headers would lose the scoped-fetch abort race and never reach the UI.
test("FEN00 real credential cache and generated Fabric client deliver old success and error bodies after disposal", async () => {
  for (const status of [200, 503]) {
    const before = { id: FabricContext.ID.create(), generation: 1 }
    const after = { id: FabricContext.ID.create(), generation: 1 }
    const oldPage = Schema.decodeUnknownSync(FabricContext.Page)({ items: [before] })
    const newPage = Schema.decodeUnknownSync(FabricContext.Page)({ items: [after] })
    const oldBody = status === 200 ? oldPage : { _tag: "ServiceUnavailableError", message: "synthetic old failure" }
    const reading = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const delivered = Promise.withResolvers<void>()
    const requests: Request[] = []
    const first: ServerConnection.Http = {
      type: "http", http: { url: "http://fabric-entry.fixture", username: "operator", password: "synthetic-old" },
    }
    class HeldBody extends Response {
      override async text() {
        reading.resolve()
        const value = await super.text()
        delivered.resolve()
        return value
      }
    }
    const transport = Object.assign(async (input: string | URL | Request, init?: RequestInit) => {
      const request = new Request(input, init)
      const url = new URL(request.url)
      if (url.pathname === "/api/health") return Response.json({ healthy: true, version: "2", pid: 1 })
      expect(url.pathname).toBe("/api/fabric/contexts")
      expect(request.method).toBe("GET")
      requests.push(request)
      if (request.headers.get("authorization") !== `Basic ${btoa("operator:synthetic-old")}`)
        return Response.json(newPage)
      // The real Response and generated decoder consume a body that intentionally ignores abort.
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await release.promise
          controller.enqueue(new TextEncoder().encode(JSON.stringify(oldBody)))
          controller.close()
        },
      }, { highWaterMark: 0 })
      return new HeldBody(body, { status, headers: { "content-type": "application/json" } })
    }, { preconnect: fetch.preconnect })
    const owner = createRoot((dispose) => {
      const [state, setState] = createStore({ servers: [first] as ServerConnection.Any[] })
      const ensure = createServerContextCache(() => state.servers, (connection) =>
        createServerSdkContext(connection, ServerScope.local, {
          platform: "web", fetch: transport, openExternal() {}, async restart() {}, async notify() {},
        }))
      return { dispose, setState, ensure, current: createMemo(() => ensure(first)) }
    })
    const retained = owner.current()
    const pending = retained.orchestra.fabricContexts.list().then(
      (value) => ({ kind: "success" as const, value }),
      (error: unknown) => ({ kind: "error" as const, error }),
    )
    try {
      await reading.promise
      expect(requests).toHaveLength(1)
      expect(requests[0]!.signal.aborted).toBe(false)
      const key = ServerConnection.key(first)
      owner.setState("servers", [{ ...first, http: { ...first.http, password: "synthetic-new" } }])
      const current = owner.current()
      expect(ServerConnection.key(current.server)).toBe(key)
      expect(current.orchestra).not.toBe(retained.orchestra)
      expect(requests[0]!.signal.aborted).toBe(true)
      expect(await current.orchestra.fabricContexts.list()).toEqual(newPage)
      expect(requests.map((request) => request.headers.get("authorization"))).toEqual([
        `Basic ${btoa("operator:synthetic-old")}`, `Basic ${btoa("operator:synthetic-new")}`,
      ])
      // A display-only rename must not change the effective transport lifetime.
      owner.setState("servers", [{ ...current.server, displayName: "Renamed" }])
      expect(owner.current().orchestra).toBe(current.orchestra)
      expect(owner.ensure(first).orchestra).toBe(current.orchestra)
      release.resolve()
      await delivered.promise
      const late = await pending
      expect(late).toEqual(status === 200 ? { kind: "success", value: oldBody } : { kind: "error", error: oldBody })
      // These late values really reached the generated caller; FEN03 must test the UI rejects publication.
      const count = requests.length
      await expect(retained.orchestra.fabricContexts.list()).rejects.toBeDefined()
      expect(requests).toHaveLength(count)
      expect(await current.orchestra.fabricContexts.list()).toEqual(newPage)
    } finally {
      release.resolve()
      await pending
      owner.dispose()
    }
  }
}, 15000)
