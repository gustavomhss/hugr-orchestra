import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LiveRunState } from "@orchestra/app/live"
import type { LiveOverlay } from "./live-overlay"
import { mockElectron } from "./electron-mock.fixture"

mockElectron()
const { registerLiveLoop } = await import("./live-loop")
const { liveSettings } = await import("./live-settings")
const { initialState } = await import("./live-overlay-state")

test.each(["server", "session", "senses", "overlay", "running", "subscriber"])("Stop cancels startup held at %s", async (stage) => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const logDirectory = await mkdtemp(join(tmpdir(), "live-start-"))
  const state = { opened: 0, closed: 0, overlayStarts: 0, overlayStops: 0 }
  const published: LiveRunState[] = []
  const actions: Promise<void>[] = []
  const overlayActions = new Set<Parameters<LiveOverlay["onAction"]>[0]>()
  const values = new Map<string, unknown>()
  const settings = liveSettings(
    { get: (key) => values.get(key), set: (key, value) => void values.set(key, value) },
    { register: () => true, unregister: () => undefined },
  )
  settings.set({ sources: { microphone: true, "system-audio": false } })
  const overlay = {
    onAction: (listener: Parameters<LiveOverlay["onAction"]>[0]) => {
      overlayActions.add(listener)
      return () => overlayActions.delete(listener)
    },
    state: () => initialState(true),
    start: () => void state.overlayStarts++,
    stop: () => void state.overlayStops++,
    setView: () => undefined,
    setError: () => undefined,
  } as LiveOverlay
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/api/session") {
        if (stage === "session") {
          entered.resolve()
          await release.promise
        }
        return Response.json({ data: { id: "ses_start" } })
      }
      if (new URL(request.url).pathname === "/api/event")
        return new Response(new ReadableStream(), { headers: { "content-type": "text/event-stream" } })
      return Response.json({ data: {} })
    },
  })
  const loop = registerLiveLoop({
    overlay,
    logDirectory,
    openSettings: () => undefined,
    server: async () => {
      if (stage === "server") {
        entered.resolve()
        await release.promise
      }
      return { url: server.url.href }
    },
    runtime: {
      settings,
      readKey: () => "test-key-not-a-credential",
      permissions: () => ({ microphone: "granted", "system-audio": "granted" }),
      senses: async () => {
        state.opened++
        if (stage === "senses" || stage === "overlay") {
          entered.resolve()
          await release.promise
        }
        return {
          meetingID: "meeting_start",
          look: async () => { throw new Error("No frame requested") },
          stop: async () => {
            state.closed++
            return { unsent: 0 }
          },
        }
      },
    },
  })
  loop.onRunState((value) => {
    published.push(value)
    if (stage === "subscriber" && value.running) actions.push(loop.stop())
  })
  const starting = loop.start()
  try {
    if (stage === "running" || stage === "subscriber") {
      expect((await starting).ok).toBe(true)
      if (stage === "running") await loop.stop()
      await Promise.all(actions)
      expect(state.opened).toBe(1)
      expect(state.closed).toBe(1)
      expect(loop.runState()).toEqual({ running: false })
      expect(loop.running()).toBe(false)
      return
    }
    await entered.promise
    expect(loop.running()).toBe(true)
    if (stage === "overlay") overlayActions.forEach((listener) => listener({ kind: "stop" }))
    if (stage !== "overlay") await loop.stop()
    release.resolve()
    expect((await starting).ok).toBe(false)
    expect(loop.running()).toBe(false)
    expect(loop.runState()).toEqual({ running: false })
    expect(published.some((value) => value.running)).toBe(false)
    expect(state.opened - state.closed).toBe(0)
    if (stage !== "senses" && stage !== "overlay") expect(state.opened).toBe(0)
  } finally {
    release.resolve()
    await starting
    loop.destroy()
    server.stop(true)
    await rm(logDirectory, { recursive: true, force: true })
  }
})
