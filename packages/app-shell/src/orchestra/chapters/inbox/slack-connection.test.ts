import { describe, expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { createSlackConnection, type SlackConnectionState } from "./slack-connection"

async function fixture(run: (input: {
  model: ReturnType<typeof createSlackConnection>
  state: { value?: SlackConnectionState; opened: string[]; changes: number; connected: number; malicious: boolean; failDisconnect: boolean; autoComplete: boolean; delayStart: boolean }
  calls: { path: string; method: string; directory: string | null }[]
  started: PromiseWithResolvers<void>
  release: PromiseWithResolvers<void>
  completed: PromiseWithResolvers<void>
}) => Promise<void>, enabled = true) {
  const state = { value: undefined as SlackConnectionState | undefined, opened: [] as string[], changes: 0,
    connected: 0, malicious: false, failDisconnect: false, autoComplete: false, delayStart: false }
  const calls: { path: string; method: string; directory: string | null }[] = []
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const completed = Promise.withResolvers<void>()
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
    const url = new URL(req.url)
    calls.push({ path: url.pathname, method: req.method, directory: url.searchParams.get("location[directory]") })
    if (url.pathname.endsWith("/authorize")) {
      started.resolve()
      if (state.delayStart) await release.promise
      return Response.json({ data: { id: "attempt-1", url: state.malicious ? "https://evil.example/steal" : "https://slack.com/oauth/v2/authorize?client_id=test", expiresAt: Date.now() + 300_000 } })
    }
    if (url.pathname.endsWith("/cancel")) return new Response(null, { status: 204 })
    if (url.pathname.endsWith("/disconnect")) return new Response(null, { status: state.failDisconnect ? 500 : 204 })
    return Response.json({ data: state.autoComplete
      ? { connected: true, state: "connected", user: "ada", team: "Test workspace" }
      : { connected: false, state: url.searchParams.has("id") ? "pending" : "idle" } })
  } })
  const model = createSlackConnection({
    api: Orchestra.make({ baseUrl: server.url.origin })["server.inbox"], directory: "/chosen-project", enabled, pollMs: 10,
    open: (url) => state.opened.push(url),
    change: (value) => { state.value = value; state.changes++; if (value.account?.connected && !value.busy) completed.resolve() },
    connected: () => state.connected++,
  })
  try {
    await run({ model, state, calls, started, release, completed })
  } finally {
    release.resolve()
    model.dispose()
    await server.stop(true)
  }
}

describe("Slack connection flow", () => {
  test("U1 disabled preview/remote mode performs no account calls or browser opens", async () => {
    await fixture(async ({ model, state, calls }) => {
      await model.load()
      await model.start()
      await model.disconnect()
      expect(calls).toHaveLength(0)
      expect(state.opened).toHaveLength(0)
    }, false)
  })

  test("U2 opens provider consent and reads only status until verified completion", async () => {
    await fixture(async ({ model, state, calls, completed }) => {
      await model.load()
      state.autoComplete = true
      await model.start()
      await completed.promise
      expect(state.opened).toEqual(["https://slack.com/oauth/v2/authorize?client_id=test"])
      expect(state.value?.authorization).toBeUndefined()
      expect(state.value?.account).toMatchObject({ connected: true, user: "ada", team: "Test workspace" })
      expect(state.value?.failed).toBe(false)
      expect(state.connected).toBe(1)
      expect(calls.every((call) => call.directory === "/chosen-project")).toBe(true)
      expect(calls.map((call) => call.path)).toEqual(["/api/inbox/slack", "/api/inbox/slack/authorize", "/api/inbox/slack"])
    })
  })

  test("U3 cancel clears the local pending state and cancels that server attempt", async () => {
    await fixture(async ({ model, state, calls }) => {
      await model.start()
      await model.cancel()
      expect(state.value?.busy).toBe(false)
      expect(state.value?.authorization).toBeUndefined()
      expect(calls.some((call) => call.path === "/api/inbox/slack/cancel")).toBe(true)
    })
  })

  test("U4 a late start response after dialog close is cancelled, never opened", async () => {
    await fixture(async ({ model, state, calls, started, release }) => {
      state.delayStart = true
      const result = model.start()
      await started.promise
      model.dispose()
      const changes = state.changes
      release.resolve()
      await result
      expect(state.changes).toBe(changes)
      expect(state.opened).toHaveLength(0)
      expect(calls.some((call) => call.path === "/api/inbox/slack/cancel")).toBe(true)
    })
  })

  test("U5 a non-provider authorization URL is rejected and cancelled", async () => {
    await fixture(async ({ model, state, calls }) => {
      state.malicious = true
      await model.start()
      expect(state.opened).toHaveLength(0)
      expect(state.value?.failed).toBe(true)
      expect(calls.some((call) => call.path === "/api/inbox/slack/cancel")).toBe(true)
    })
  })

  test("U6 failed disconnect preserves the known account instead of claiming success", async () => {
    await fixture(async ({ model, state }) => {
      state.autoComplete = true
      await model.load()
      state.failDisconnect = true
      await model.disconnect()
      expect(state.value?.failed).toBe(true)
      expect(state.value?.account?.connected).toBe(true)
      expect(state.connected).toBe(0)
    })
  })

  test("U7 successful disconnect clears only local connection state", async () => {
    await fixture(async ({ model, state, calls }) => {
      state.autoComplete = true
      await model.load()
      await model.disconnect()
      expect(state.value?.account).toEqual({ connected: false, state: "idle" })
      expect(state.value?.failed).toBe(false)
      expect(calls.map((call) => call.path)).toEqual(["/api/inbox/slack", "/api/inbox/slack/disconnect"])
      expect(state.connected).toBe(1)
    })
  })
})
