import { describe, expect, test } from "bun:test"
import { adaptServerEvent, coalesceServerEvents, createServerReadyPromise, enqueueServerEvent, resumeStreamAfterPageShow } from "./server-sdk"
import type { ClientEvent } from "@/session-types"
import type { Event } from "@/v2-wire"

import { ServerNotReadyError } from "@/utils/server-ready"
import { createCompatibleApi } from "@/utils/server-compat"
import { createApiForServer } from "@/utils/server"
import { rejection } from "@/testing/rejection"

describe("createServerReadyPromise", () => {
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
      const ready = createServerReadyPromise({ url: listener.url.origin }, fetch)
      expect(await Promise.all([ready, ready, ready.then(() => "settled")])).toEqual([undefined, undefined, "settled"])
      expect(await ready).toBeUndefined()
      expect(probes).toBe(1)
    } finally {
      listener.stop(true)
    }
  })

  test("existing consumers recover a failed connection", async () => {
    const state = { ready: false, probes: 0, detected: 0 }
    const paths: string[] = []
    const listener = Bun.serve({
      port: 0, hostname: "127.0.0.1",
      fetch: (request) => {
        const path = new URL(request.url).pathname
        paths.push(path)
        if (path === "/api/health") {
          state.probes++
          if (!state.ready) return Response.json({}, { status: 503 })
          return Response.json({ pid: 123 })
        }
        return Response.json([])
      },
    })
    try {
      const server = { url: listener.url.origin }
      const ready = createServerReadyPromise(server, fetch, { attempts: 1 }, () => {
        state.detected++
      })
      const chain = ready.then(() => ({ settled: true }))
      const api = createCompatibleApi({
        current: createApiForServer({ server, fetch }),
      })
      expect(await rejection(ready)).toBeInstanceOf(ServerNotReadyError)
      expect(state.detected).toBe(0)
      expect(state.probes).toBe(3)
      state.ready = true
      expect(await api.project.list()).toEqual([])
      expect(await chain).toEqual({ settled: true })
      expect(await ready).toBeUndefined()
      expect(state.detected).toBe(1)
      const probes = state.probes
      await api.project.list()
      expect(state.probes).toBe(probes)
      expect(paths.filter((path) => !path.endsWith("/health"))).toEqual(["/api/project", "/api/project"])
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
      const ready = createServerReadyPromise({ url: listener.url.origin }, fetch, { signal: abort.signal })
      const chain = ready.then(() => undefined)
      const failed = rejection(chain)
      await reached.promise
      abort.abort(reason)
      expect(await failed).toBe(reason)
      expect(await rejection(ready)).toBe(reason)
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
  test("keeps V2 permission events under their V2 name with the event data as properties", () => {
    const current = {
      id: "evt_1",
      created: 1,
      type: "permission.v2.asked",
      data: { id: "perm_1", sessionID: "ses_1", action: "read", resources: ["src/**"] },
    } as ClientEvent

    expect(adaptServerEvent(current)).toMatchObject({
      type: "permission.v2.asked",
      properties: { id: "perm_1", sessionID: "ses_1", action: "read", resources: ["src/**"] },
      current,
    })
  })
})

describe("coalesceServerEvents", () => {
  const textDelta = (id: string, value: string, ordinal = 0) =>
    adaptServerEvent({
      id,
      created: 1,
      type: "session.text.delta",
      location: { directory: "/repo" },
      data: { sessionID: "ses", assistantMessageID: "msg", ordinal, delta: value },
    } as ClientEvent)
  const queued = (payload: ReturnType<typeof adaptServerEvent>) => ({ directory: "/repo", payload })

  test("merges adjacent current text deltas", () => {
    const result = coalesceServerEvents([queued(textDelta("evt_1", "hello ")), queued(textDelta("evt_2", "world"))])

    expect(result).toHaveLength(1)
    expect(result[0]?.payload.current).toMatchObject({ id: "evt_2", data: { delta: "hello world" } })
  })

  test("preserves event boundaries and distinct ordinals", () => {
    const boundary = queued(
      adaptServerEvent({
        id: "evt_end",
        created: 1,
        type: "session.text.ended",
        location: { directory: "/repo" },
        data: { sessionID: "ses", assistantMessageID: "msg", ordinal: 0, text: "ab" },
      } as ClientEvent),
    )
    const result = coalesceServerEvents([
      queued(textDelta("1", "a")),
      queued(textDelta("2", "b", 1)),
      boundary,
      queued(textDelta("3", "c")),
    ])

    expect(result.map((event) => event.payload.id)).toEqual(["1", "2", "evt_end", "3"])
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
})
