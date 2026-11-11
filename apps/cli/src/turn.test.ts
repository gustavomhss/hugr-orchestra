import { describe, expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { runTurn } from "./turn"
import { clientUrl, stubServer } from "./commands/handlers/test-support"

const prompted = {
  id: "evt_1",
  type: "session.next.prompted",
  data: { timestamp: 1, sessionID: "ses_1", messageID: "msg_1", prompt: { text: "hello" } },
  durable: { aggregateID: "ses_1", seq: 1, version: 1 },
}
const permission = { id: "per_1", sessionID: "ses_1", action: "bash", resources: ["ls"] }

describe("turn lifecycle", () => {
  test.each(["submit", "wait", "history", "event callback", "permission callback"])(
    "stops permission polling after %s fails",
    async (failure) => {
      const controller = new AbortController()
      const state = { polls: 0, history: 0 }
      const server = stubServer(async (request) => {
        const url = new URL(request.url)
        if (url.pathname.endsWith("/history")) {
          state.history++
          if (failure === "history" && state.history > 1) return new Response("history failed", { status: 503 })
          return Response.json({ data: state.history > 1 ? [prompted] : [], hasMore: false })
        }
        if (url.pathname.endsWith("/event"))
          return new Response("", { headers: { "content-type": "text/event-stream" } })
        if (url.pathname.endsWith("/wait")) {
          await Bun.sleep(40)
          return new Response(null, { status: failure === "wait" ? 503 : 204 })
        }
        if (url.pathname === "/api/permission/request") {
          state.polls++
          return Response.json({ location: {}, data: failure === "permission callback" ? [permission] : [] })
        }
        return new Response(null, { status: 204 })
      })
      try {
        const result = runTurn(Orchestra.make({ baseUrl: clientUrl(server) }), {
          sessionID: "ses_1",
          signal: controller.signal,
          submit: async () => {
            if (failure === "submit") throw new Error("submit failed")
            return { id: "msg_1" }
          },
          onEvent: () => {
            if (failure === "event callback") throw new Error("event failed")
          },
          onPermission: async () => {
            throw new Error("permission failed")
          },
        })
        await expect(result).rejects.toThrow()
        const stopped = state.polls
        await Bun.sleep(450)
        expect(state.polls).toBe(stopped)
      } finally {
        controller.abort()
        await Bun.sleep(220)
        server.stop(true)
      }
    },
  )

  test("caller abort cancels an outstanding wait and the submit receives the linked signal", async () => {
    const controller = new AbortController()
    const state: { signal?: AbortSignal } = {}
    const server = stubServer(async (request) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith("/history")) return Response.json({ data: [], hasMore: false })
      if (url.pathname.endsWith("/event")) return new Response("", { headers: { "content-type": "text/event-stream" } })
      if (url.pathname === "/api/permission/request") return Response.json({ location: {}, data: [] })
      if (url.pathname.endsWith("/wait")) await Bun.sleep(1500)
      return new Response(null, { status: 204 })
    })
    const started = Date.now()
    try {
      const result = runTurn(Orchestra.make({ baseUrl: clientUrl(server) }), {
        sessionID: "ses_1",
        signal: controller.signal,
        submit: async (signal?: AbortSignal) => {
          state.signal = signal
          return { id: "msg_1" }
        },
        onEvent: () => {},
        onPermission: async () => "reject",
      })
      await Bun.sleep(50)
      controller.abort()
      await expect(result).rejects.toThrow()
      expect(state.signal?.aborted).toBe(true)
      expect(Date.now() - started).toBeLessThan(1000)
    } finally {
      controller.abort()
      server.stop(true)
    }
  })

  test("event callback failure closes an open SSE subscription and cancels the pending wait", async () => {
    const controller = new AbortController()
    const subscribed = Promise.withResolvers<void>()
    const state = { closed: false }
    const server = stubServer(async (request) => {
      const url = new URL(request.url)
      if (url.pathname.endsWith("/history")) return Response.json({ data: [], hasMore: false })
      if (url.pathname.endsWith("/event"))
        return new Response(
          new ReadableStream({
            start(stream) {
              stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(prompted)}\n\n`))
              subscribed.resolve()
            },
            cancel() {
              state.closed = true
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        )
      if (url.pathname === "/api/permission/request") return Response.json({ location: {}, data: [] })
      await subscribed.promise
      await Bun.sleep(1500)
      return new Response(null, { status: 204 })
    })
    const started = Date.now()
    try {
      await expect(
        runTurn(Orchestra.make({ baseUrl: clientUrl(server) }), {
          sessionID: "ses_1",
          signal: controller.signal,
          submit: async () => ({ id: "msg_1" }),
          onEvent: () => {
            throw new Error("event callback failed")
          },
          onPermission: async () => "reject",
        }),
      ).rejects.toThrow("event callback failed")
      await Bun.sleep(30)
      expect(state.closed).toBe(true)
      expect(Date.now() - started).toBeLessThan(1000)
    } finally {
      controller.abort()
      server.stop(true)
    }
  })

  test.each(["retry", "resolved", "lost acknowledgement"])(
    "permission delivery %s retains one decision and only confirms delivered replies",
    async (mode) => {
      const state = { decisions: 0, replies: 0, polls: 0 }
      const server = stubServer(async (request) => {
        const url = new URL(request.url)
        if (url.pathname.endsWith("/history"))
          return Response.json({ data: state.polls >= 3 ? [prompted] : [], hasMore: false })
        if (url.pathname.endsWith("/event"))
          return new Response("", { headers: { "content-type": "text/event-stream" } })
        if (url.pathname.endsWith("/wait")) {
          await Bun.sleep(250)
          return new Response(null, { status: 204 })
        }
        if (url.pathname === "/api/permission/request") {
          state.polls++
          return Response.json({ location: {}, data: [permission] })
        }
        if (url.pathname.endsWith("/reply")) {
          state.replies++
          expect(await request.json()).toEqual({ reply: "once" })
          if (mode === "resolved" || (mode === "lost acknowledgement" && state.replies > 1))
            return Response.json(
              { _tag: "PermissionNotFoundError", requestID: "per_1", message: "resolved" },
              { status: 404 },
            )
          if (state.replies === 1) return new Response("unavailable", { status: 503 })
        }
        return new Response(null, { status: 204 })
      })
      try {
        expect(
          await runTurn(Orchestra.make({ baseUrl: clientUrl(server) }), {
            sessionID: "ses_1",
            submit: async () => ({ id: "msg_1" }),
            onEvent: () => {},
            onPermission: async () => {
              state.decisions++
              return "once"
            },
          }),
        ).toBe(true)
        expect(state.decisions).toBe(1)
        expect(state.replies).toBe(mode === "resolved" ? 1 : 2)
      } finally {
        server.stop(true)
      }
    },
  )
})
