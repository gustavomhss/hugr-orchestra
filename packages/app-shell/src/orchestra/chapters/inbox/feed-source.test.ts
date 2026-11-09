import { expect, test } from "bun:test"
import { Orchestra } from "@orchestra/client"
import { createFeedSources, type Feed, type FeedState } from "./feed-source"

async function fixture(
  run: (
    model: ReturnType<typeof createFeedSources>,
    state: { value?: FeedState; calls: string[]; fail: boolean; refreshed: number },
  ) => Promise<void>,
) {
  const state = { value: undefined as FeedState | undefined, calls: [] as string[], fail: false, refreshed: 0 }
  const feeds: Feed[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      state.calls.push(`${req.method} ${path}`)
      if (state.fail) return new Response(null, { status: 500 })
      if (req.method === "GET") return Response.json({ data: feeds })
      if (path.endsWith("/remove")) {
        feeds.length = 0
        return new Response(null, { status: 204 })
      }
      if (path.endsWith("/sync")) {
        feeds[0] = { ...feeds[0]!, initialized: true, state: "synced" }
        return Response.json({ data: feeds[0] })
      }
      const body = await req.json()
      const feed: Feed = {
        id: "feed-1",
        source: body.source,
        url: body.url,
        name: body.name ?? "Public feed",
        initialized: false,
        state: "idle",
      }
      feeds.push(feed)
      return Response.json({ data: feed })
    },
  })
  const model = createFeedSources({
    api: Orchestra.make({ baseUrl: server.url.origin })["server.inbox"],
    directory: "/fixture",
    change: (value) => {
      state.value = value
    },
    synced: () => state.refreshed++,
  })
  try {
    await run(model, state)
  } finally {
    model.dispose()
    await server.stop(true)
  }
}

test("following a feed saves configuration only; baseline/acquisition require a separate explicit sync", async () => {
  await fixture(async (model, state) => {
    await model.load()
    expect(state.calls).toEqual(["GET /api/inbox/feeds"])
    model.url(" https://feeds.example/rss ")
    model.name(" Updates ")
    await model.add()
    expect(state.calls).toEqual(["GET /api/inbox/feeds", "POST /api/inbox/feeds"])
    expect(state.value?.feeds[0]).toMatchObject({
      source: "rss",
      url: "https://feeds.example/rss",
      name: "Updates",
      initialized: false,
    })
    expect(state.refreshed).toBe(0)
    await model.sync("feed-1")
    expect(state.value?.feeds[0]?.initialized).toBe(true)
    expect(state.refreshed).toBe(1)
    state.fail = true
    await model.remove("feed-1")
    expect(state.value?.failed).toBe(true)
    expect(state.value?.feeds).toHaveLength(1)
    state.fail = false
    await model.remove("feed-1")
    expect(state.value?.feeds).toEqual([])
  })
})

test("YouTube type change clears old input; failures retain edits and disposed controllers do not request", async () => {
  await fixture(async (model, state) => {
    model.url("https://old.example/rss")
    model.source("youtube")
    expect(state.value?.url).toBe("")
    model.url("UCabcdefghijklmnopqrstuv")
    state.fail = true
    await model.add()
    expect(state.value?.url).toBe("UCabcdefghijklmnopqrstuv")
    expect(state.value?.failed).toBe(true)
    const count = state.calls.length
    model.dispose()
    await model.add()
    await model.load()
    await model.sync("feed-1")
    expect(state.calls).toHaveLength(count)
  })
})
