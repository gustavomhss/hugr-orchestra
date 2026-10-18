import { describe, expect, test } from "bun:test"
import { adaptServerEvent, coalesceServerEvents, createServerProtocolPromise, enqueueServerEvent, resumeStreamAfterPageShow } from "./server-sdk"
import type { OpenCodeEvent } from "@opencode-ai/client/promise"
import type { Event } from "@orchestra/sdk/v2/client"
import { ServerProtocolUnresolvedError, type ServerProtocol } from "@/utils/server-protocol"
import { createCompatibleApi } from "@/utils/server-compat"
import { createApiForServer, createSdkForServer } from "@/utils/server"
import { rejection } from "@/testing/rejection"

describe("createServerProtocolPromise", () => {
  test("shares in-flight detection and retains a successful connection result", async () => {
    let probes = 0
    const listener = Bun.serve({
      port: 0, hostname: "127.0.0.1",
      fetch: async () => {
        probes++
        await Bun.sleep(20)
        return Response.json({ healthy: true })
      },
    })
    try {
      const protocol = createServerProtocolPromise({ url: listener.url.origin }, fetch)
      expect(await Promise.all([protocol, protocol, protocol.then((kind) => kind)])).toEqual(["v1", "v1", "v1"])
      expect(await protocol).toBe("v1")
      expect(probes).toBe(1)
    } finally {
      listener.stop(true)
    }
  })

  test.each(["v1", "v2"] as const)("existing consumers recover a failed connection as %s", async (kind) => {
    const state = { ready: false, probes: 0, detected: undefined as ServerProtocol | undefined }
    const paths: string[] = []
    const listener = Bun.serve({
      port: 0, hostname: "127.0.0.1",
      fetch: (request) => {
        const path = new URL(request.url).pathname
        paths.push(path)
        if (path === "/global/health" || path === "/api/health") {
          state.probes++
          if (!state.ready) return Response.json({}, { status: 503 })
          if (path === "/global/health") return kind === "v1"
            ? Response.json({ healthy: true }) : Response.json({}, { status: 404 })
          return Response.json({ pid: 123 })
        }
        return Response.json([])
      },
    })
    try {
      const server = { url: listener.url.origin }
      const protocol = createServerProtocolPromise(server, fetch, { attempts: 1 }, (value) => {
        state.detected = value
      })
      const chain = protocol.then((value) => value).then((value) => ({ kind: value }))
      const api = createCompatibleApi({
        protocol,
        current: createApiForServer({ server, fetch }),
        legacy: (directory) => createSdkForServer({ server, fetch, directory, throwOnError: true }),
      })
      expect(await rejection(api.project.list())).toBeInstanceOf(ServerProtocolUnresolvedError)
      expect(state.detected).toBeUndefined()
      expect(state.probes).toBe(6)
      state.ready = true
      expect(await api.project.list()).toEqual([])
      expect(await chain).toEqual({ kind })
      expect(await protocol).toBe(kind)
      expect(state.detected).toBe(kind)
      const probes = state.probes
      await api.project.list()
      expect(state.probes).toBe(probes)
      expect(paths.filter((path) => !path.endsWith("/health"))).toEqual(
        [kind === "v1" ? "/project" : "/api/project", kind === "v1" ? "/project" : "/api/project"],
      )
    } finally {
      listener.stop(true)
    }
  })

  test("settles cancelled consumers and never probes again after connection disposal", async () => {
    const reached = Promise.withResolvers<void>()
    let probes = 0
    const listener = Bun.serve({
      port: 0, hostname: "127.0.0.1",
      fetch: async () => {
        probes++
        reached.resolve()
        await Bun.sleep(500)
        return Response.json({ healthy: true })
      },
    })
    const abort = new AbortController()
    const reason = new DOMException("Connection disposed", "AbortError")
    try {
      const protocol = createServerProtocolPromise({ url: listener.url.origin }, fetch, { signal: abort.signal })
      const chain = protocol.then((kind) => kind)
      const failed = rejection(chain)
      await reached.promise
      abort.abort(reason)
      expect(await failed).toBe(reason)
      expect(await rejection(protocol)).toBe(reason)
      expect(probes).toBe(1)
    } finally {
      listener.stop(true)
    }
  })
})

describe("resumeStreamAfterPageShow", () => {
  test("restarts a stream only after a back-forward cache restore", () => {
    let starts = 0
    const start = () => starts++

    resumeStreamAfterPageShow({ persisted: false } as PageTransitionEvent, start)
    resumeStreamAfterPageShow({ persisted: true } as PageTransitionEvent, start)

    expect(starts).toBe(1)
  })
})

describe("adaptServerEvent", () => {
  test("preserves V2 events while adapting permission requests for existing consumers", () => {
    const current = {
      id: "evt_1",
      created: 1,
      type: "permission.v2.asked",
      data: { id: "perm_1", sessionID: "ses_1", action: "read", resources: ["src/**"] },
    } as OpenCodeEvent

    expect(adaptServerEvent(current)).toMatchObject({
      type: "permission.asked",
      properties: { id: "perm_1", sessionID: "ses_1", permission: "read", patterns: ["src/**"] },
      current,
    })
  })
})

describe("coalesceServerEvents", () => {
  const delta = (value: string, field = "text", partID = "part") => ({
    directory: "/repo",
    payload: {
      type: "message.part.delta",
      properties: { messageID: "msg", partID, field, delta: value },
    } as Event,
  })

  test("merges adjacent deltas for the same field", () => {
    const first = delta("hello ")
    const second = delta("world")
    first.payload.id = "first"
    second.payload.id = "second"
    const result = coalesceServerEvents([first, second])

    expect(result).toHaveLength(1)
    expect(result[0]?.payload).toMatchObject({ id: "second", properties: { delta: "hello world" } })
  })

  test("merges adjacent current text deltas", () => {
    const current = (id: string, value: string) =>
      adaptServerEvent({
        id,
        created: 1,
        type: "session.text.delta",
        location: { directory: "/repo" },
        data: { sessionID: "ses", assistantMessageID: "msg", ordinal: 0, delta: value },
      } as OpenCodeEvent)
    const result = coalesceServerEvents([
      { directory: "/repo", payload: current("evt_1", "hello ") },
      { directory: "/repo", payload: current("evt_2", "world") },
    ])

    expect(result).toHaveLength(1)
    expect(result[0]?.payload.current).toMatchObject({ id: "evt_2", data: { delta: "hello world" } })
  })

  test("preserves event boundaries and distinct fields", () => {
    const status = {
      directory: "/repo",
      payload: { type: "session.status", properties: { sessionID: "ses", status: { type: "idle" } } } as Event,
    }
    const result = coalesceServerEvents([delta("a"), delta("b", "metadata"), status, delta("c")])

    expect(result.map((event) => event.payload.type)).toEqual([
      "message.part.delta",
      "message.part.delta",
      "session.status",
      "message.part.delta",
    ])
  })

  test("preserves event ID order across interleaved deltas", () => {
    const first = delta("a")
    const other = delta("b", "text", "other")
    const last = delta("c")
    first.payload.id = "1"
    other.payload.id = "2"
    last.payload.id = "3"

    const result = coalesceServerEvents([first, other, last])

    expect(result.map((event) => event.payload.id)).toEqual(["1", "2", "3"])
  })
})

describe("enqueueServerEvent", () => {
  const partUpdated = (text: string) =>
    ({
      type: "message.part.updated",
      properties: {
        sessionID: "session",
        part: { id: "part", sessionID: "session", messageID: "message", type: "text", text },
      },
    }) as Event

  test("preserves part updates across message remove and re-add barriers", () => {
    const events: Array<{ directory: string; payload: Event }> = []
    const enqueue = (payload: Event) => enqueueServerEvent(events, { directory: "/repo", payload })

    enqueue(partUpdated("old"))
    enqueue({ type: "message.removed", properties: { sessionID: "session", messageID: "message" } } as Event)
    enqueue({
      type: "message.updated",
      properties: {
        sessionID: "session",
        info: {
          id: "message",
          sessionID: "session",
          role: "user",
          time: { created: 1 },
          agent: "build",
          model: { providerID: "provider", modelID: "model" },
        },
      },
    } as Event)
    enqueue(partUpdated("new"))

    expect(events.map((event) => event.payload.type)).toEqual([
      "message.part.updated",
      "message.removed",
      "message.updated",
      "message.part.updated",
    ])
  })

  test("preserves deltas after a replacement snapshot", () => {
    const events: Array<{ directory: string; payload: Event }> = []
    const enqueue = (payload: Event) => enqueueServerEvent(events, { directory: "/repo", payload })

    enqueue(partUpdated("a"))
    enqueue(partUpdated("ab"))
    enqueue({
      type: "message.part.delta",
      properties: { sessionID: "session", messageID: "message", partID: "part", field: "text", delta: "c" },
    } as Event)

    const result = coalesceServerEvents(events)
    expect(result.map((event) => event.payload.type)).toEqual(["message.part.updated", "message.part.delta"])
    expect(result[0]?.payload).toMatchObject({ properties: { part: { text: "ab" } } })
    expect(result[1]?.payload).toMatchObject({ properties: { delta: "c" } })
  })

  test("preserves updates after session deletion", () => {
    const events: Array<{ directory: string; payload: Event }> = []
    const enqueue = (payload: Event) => enqueueServerEvent(events, { directory: "/repo", payload })

    enqueue(partUpdated("old"))
    enqueue({
      type: "session.deleted",
      properties: { sessionID: "session", info: { id: "session" } },
    } as Event)
    enqueue(partUpdated("new"))

    expect(events.map((event) => event.payload.type)).toEqual([
      "message.part.updated",
      "session.deleted",
      "message.part.updated",
    ])
  })

  test("does not coalesce edge-triggered session statuses", () => {
    const events: Array<{ directory: string; payload: Event }> = []
    const enqueue = (status: "retry" | "busy") =>
      enqueueServerEvent(events, {
        directory: "/repo",
        payload: {
          type: "session.status",
          properties: {
            sessionID: "session",
            status: status === "retry" ? { type: "retry", attempt: 1, message: "retry", next: 1 } : { type: "busy" },
          },
        } as Event,
      })

    enqueue("retry")
    enqueue("busy")

    expect(events).toHaveLength(2)
  })
})
