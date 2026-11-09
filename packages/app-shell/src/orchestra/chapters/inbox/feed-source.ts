import type { ServerSDK } from "@/context/server-sdk"

type Api = Pick<ServerSDK["orchestra"]["server.inbox"], "feeds" | "addFeed" | "syncFeed" | "removeFeed">
export type Feed = Awaited<ReturnType<Api["addFeed"]>>["data"]
export type FeedState = {
  feeds: readonly Feed[]
  source: "rss" | "youtube"
  url: string
  name: string
  busy: boolean
  failed: boolean
}

export function createFeedSources(input: {
  api: Api
  directory: string
  change: (state: FeedState) => void
  synced: () => void
}) {
  const controller = new AbortController()
  const location = { directory: input.directory }
  const state = {
    disposed: false,
    value: { feeds: [], source: "rss", url: "", name: "", busy: false, failed: false } as FeedState,
  }
  const change = (patch: Partial<FeedState>) => {
    if (state.disposed) return
    state.value = { ...state.value, ...patch }
    input.change(state.value)
  }
  const run = async (body: () => Promise<void>) => {
    if (state.disposed || state.value.busy) return
    change({ busy: true, failed: false })
    await body().catch(() => change({ failed: true }))
    change({ busy: false })
  }
  return {
    load: () =>
      run(async () => change({ feeds: (await input.api.feeds({ location }, { signal: controller.signal })).data })),
    source: (source: "rss" | "youtube") => {
      if (!state.value.busy) change({ source, url: "", name: "" })
    },
    url: (url: string) => {
      if (!state.value.busy) change({ url })
    },
    name: (name: string) => {
      if (!state.value.busy) change({ name })
    },
    add: () =>
      run(async () => {
        if (!state.value.url.trim()) return
        const feed = (
          await input.api.addFeed(
            {
              location,
              source: state.value.source,
              url: state.value.url.trim(),
              ...(state.value.name.trim() ? { name: state.value.name.trim() } : {}),
            },
            { signal: controller.signal },
          )
        ).data
        change({ feeds: [...state.value.feeds.filter((item) => item.id !== feed.id), feed], url: "", name: "" })
      }),
    sync: (id: string) =>
      run(async () => {
        const feed = (await input.api.syncFeed({ location, id }, { signal: controller.signal })).data
        if (state.disposed) return
        change({ feeds: state.value.feeds.map((item) => (item.id === id ? feed : item)) })
        input.synced()
      }),
    remove: (id: string) =>
      run(async () => {
        await input.api.removeFeed({ location, id }, { signal: controller.signal })
        change({ feeds: state.value.feeds.filter((item) => item.id !== id) })
      }),
    dispose: () => {
      state.disposed = true
      controller.abort()
    },
  }
}
