import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { LiveDeliveryManager } from "./live-delivery-contract"
import { mockElectron } from "./electron-mock.fixture"

mockElectron()
const { startSenses } = await import("./live-senses")

test.each(["permission", "meeting"])("cancels senses held at %s without starting capture", async (stage) => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const seen = { started: 0, stopped: 0 }
  const requests: { path: string; length: string | null }[] = []
  const logDirectory = await mkdtemp(join(tmpdir(), "live-senses-"))
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      requests.push({ path: new URL(request.url).pathname, length: request.headers.get("content-length") })
      await request.json()
      if (new URL(request.url).pathname === "/api/meeting/start") {
        seen.started++
        entered.resolve()
        await release.promise
        // This fixture isolates late-acquisition cleanup, not connection reuse. Bun 1.3.14 returns 400 on
        // the reused connection after this held response; live-meeting-client.test.ts retains the reuse control.
        return Response.json({ data: { id: "meeting_pending", timeStarted: 1 } }, { headers: { connection: "close" } })
      }
      if (new URL(request.url).pathname === "/api/meeting/stop") seen.stopped++
      return new Response(null, { status: 204 })
    },
  })
  // This existing M11 unit boundary owns only the held remote acquisition/cancellation leg.
  // The separate Node integration suite exercises the actual SQLite Store and delivery manager.
  const delivery: LiveDeliveryManager = {
    async start(input, signal) {
      const response = await fetch(new URL("/api/meeting/start", server.url), {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input),
      })
      const body = await response.json() as { data: { id: string } }
      if (signal.aborted) {
        await fetch(new URL("/api/meeting/stop", server.url), {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ meetingID: body.data.id }),
        })
        signal.throwIfAborted()
      }
      throw new Error("This unit fixture must cancel acquisition before exposing a producer")
    },
    snapshot: () => ({ state: "ready", items: [], unconfirmedStarts: [] }),
    retry: () => ({ ok: false, reason: "closed" }), finish: () => ({ ok: false, reason: "closed" }),
    discard: async () => ({ ok: false, reason: "closed" }),
    export() { throw new Error("No export in the cancellation unit fixture") },
    shutdown: async () => undefined,
  }
  const attempt = new AbortController()
  const starting = startSenses({
    signal: attempt.signal,
    delivery,
    server: { url: `http://127.0.0.1:${server.port}` },
    sessionID: "ses_pending",
    title: "Pending",
    logDirectory,
    sources: { microphone: true, systemAudio: false },
    onEvent: () => undefined,
    runtime: {
      readKey: () => "test-key-not-a-credential",
      microphone: async () => {
        if (stage === "permission") {
          entered.resolve()
          await release.promise
        }
        return true
      },
    },
  })
  try {
    await entered.promise
    attempt.abort()
    release.resolve()
    await expect(starting).rejects.toMatchObject({ name: "AbortError" })
    expect(seen).toEqual(stage === "permission" ? { started: 0, stopped: 0 } : { started: 1, stopped: 1 })
    expect(requests.map((request) => request.path)).toEqual(
      stage === "permission" ? [] : ["/api/meeting/start", "/api/meeting/stop"],
    )
  } finally {
    release.resolve()
    await starting.catch(() => undefined)
    server.stop(true)
    await rm(logDirectory, { recursive: true, force: true })
  }
})
