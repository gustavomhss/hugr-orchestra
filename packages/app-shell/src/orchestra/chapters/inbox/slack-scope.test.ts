import { expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { createSlackScope, type SlackScope, type SlackScopeState } from "./slack-scope"

async function fixture(
  run: (input: {
    model: ReturnType<typeof createSlackScope>
    state: {
      value?: SlackScopeState
      receipt: SlackScope
      calls: string[]
      pending: boolean
      refreshed: number
      hold: boolean
    }
    started: PromiseWithResolvers<void>
    release: PromiseWithResolvers<void>
  }) => Promise<void>,
) {
  const state = {
    value: undefined as SlackScopeState | undefined,
    receipt: {
      generation: "connection-a",
      conversations: [{ id: "C123", name: "general", kind: "channel" }],
      selected: [],
      state: "idle",
    } as SlackScope,
    calls: [] as string[],
    pending: false,
    refreshed: 0,
    hold: false,
  }
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      state.calls.push(path)
      if (path.endsWith("/scope")) {
        started.resolve()
        if (state.hold) await release.promise
      }
      if (path.endsWith("/selection")) {
        const body = await req.json()
        expect(body.generation).toBe("connection-a")
        state.receipt = { ...state.receipt, selected: body.selected }
      }
      if (path.endsWith("/sync")) state.receipt = { ...state.receipt, state: state.pending ? "pending" : "synced" }
      return Response.json({ data: state.receipt })
    },
  })
  const model = createSlackScope({
    api: Orchestra.make({ baseUrl: server.url.origin })["server.inbox"],
    directory: "/fixture",
    change: (value) => {
      state.value = value
    },
    synced: () => state.refreshed++,
  })
  try {
    await run({ model, state, started, release })
  } finally {
    release.resolve()
    model.dispose()
    await server.stop(true)
  }
}

test("loading scope and saving a selection never acquires messages; dirty selection blocks sync", async () => {
  await fixture(async ({ model, state }) => {
    await model.load()
    expect(state.calls).toEqual(["/api/inbox/slack/scope"])
    model.toggle("C123", true)
    await model.sync()
    expect(state.calls).toEqual(["/api/inbox/slack/scope"])
    await model.save()
    expect(state.value?.selected).toEqual(["C123"])
    expect(state.calls).toEqual(["/api/inbox/slack/scope", "/api/inbox/slack/selection"])
    await model.sync()
    expect(state.value?.scope?.state).toBe("synced")
    expect(state.calls.at(-1)).toBe("/api/inbox/slack/sync")
  })
})

test("one click has a bounded page batch and another click resumes pending work", async () => {
  await fixture(async ({ model, state }) => {
    state.receipt = { ...state.receipt, selected: ["C123"] }
    state.pending = true
    await model.load()
    await model.sync()
    expect(state.calls.filter((path) => path.endsWith("/sync"))).toHaveLength(20)
    expect(state.value?.scope?.state).toBe("pending")
    expect(state.refreshed).toBe(1)
    state.pending = false
    await model.sync()
    expect(state.calls.filter((path) => path.endsWith("/sync"))).toHaveLength(21)
    expect(state.value?.scope?.state).toBe("synced")
  })
})

test("an empty saved selection makes synchronization inert", async () => {
  await fixture(async ({ model, state }) => {
    await model.load()
    await model.sync()
    expect(state.calls).toEqual(["/api/inbox/slack/scope"])
    model.toggle("C999", true)
    expect(state.value?.selected).toEqual([])
  })
})

test("a late scope response after closing cannot update the dialog or start acquisition", async () => {
  await fixture(async ({ model, state, started, release }) => {
    state.hold = true
    const loading = model.load()
    await started.promise
    model.dispose()
    release.resolve()
    await loading
    await model.sync()
    expect(state.value?.scope).toBeUndefined()
    expect(state.calls).toEqual(["/api/inbox/slack/scope"])
    expect(state.refreshed).toBe(0)
  })
})
