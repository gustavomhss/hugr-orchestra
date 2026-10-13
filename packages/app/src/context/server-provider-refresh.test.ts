import { expect, test } from "bun:test"
import { QueryClient, queryOptions } from "@tanstack/solid-query"
import type { NormalizedProviderListResponse } from "@orchestra/session-ui/context"
import { createProviderRefresher } from "./server-sync"
import { ServerScope } from "@/utils/server-scope"

const catalog = (id: string): NormalizedProviderListResponse => ({
  all: new Map([[id, { id, name: id, source: "api", env: [], options: {}, models: {} }]]),
  connected: [id],
  default: {},
})

test("owner refresh replaces a delayed pre-auth request without touching other scopes", async () => {
  const owner = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const view = new QueryClient()
  const queryKey = [ServerScope.local, "/repo", "providers"]
  const otherDirectory = [ServerScope.local, "/other", "providers"]
  const otherServer = ["other-server", "/repo", "providers"]
  const global = [ServerScope.local, null, "providers"]
  const before = catalog("before")
  const connected = catalog("openrouter")
  const pending = Promise.withResolvers<NormalizedProviderListResponse>()
  const calls: Array<string | null> = []
  const options = {
    providers: (directory: string | null) =>
      queryOptions({
        queryKey: [ServerScope.local, directory, "providers"],
        queryFn: () => {
          calls.push(directory)
          return calls.length === 1 ? pending.promise : Promise.resolve(connected)
        },
      }),
  }
  const refresh = createProviderRefresher(owner, ServerScope.local, options)
  owner.setQueryData(otherDirectory, before)
  owner.setQueryData(otherServer, before)
  owner.setQueryData(global, before)
  view.setQueryData(queryKey, before)
  const initial = owner.fetchQuery(options.providers("/repo")).catch(() => undefined)
  try {
    expect(calls).toEqual(["/repo"])
    const refreshed = refresh("/repo")
    pending.resolve(before)
    await refreshed
    await initial
    expect(calls).toEqual(["/repo", "/repo"])
    expect(owner.getQueryData<NormalizedProviderListResponse>(queryKey)).toEqual(connected)
    expect(owner.getQueryData<NormalizedProviderListResponse>(otherDirectory)).toEqual(before)
    expect(owner.getQueryData<NormalizedProviderListResponse>(otherServer)).toEqual(before)
    expect(owner.getQueryData<NormalizedProviderListResponse>(global)).toEqual(before)
    expect(view.getQueryData<NormalizedProviderListResponse>(queryKey)).toEqual(before)
  } finally {
    pending.resolve(before)
    owner.clear()
    view.clear()
  }
})

test("explicit global refresh propagates failure and retries in the owner's cache", async () => {
  const owner = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  const queryKey = [ServerScope.local, null, "providers"]
  const before = catalog("opencode")
  const connected = catalog("openrouter")
  const requests = { fail: false }
  const options = {
    providers: (directory: string | null) =>
      queryOptions({
        queryKey: [ServerScope.local, directory, "providers"],
        queryFn: async () => {
          if (requests.fail) throw new Error("catalog unavailable")
          return connected
        },
      }),
  }
  await owner.fetchQuery(options.providers(null))
  owner.setQueryData(queryKey, before)
  const refresh = createProviderRefresher(owner, ServerScope.local, options)
  try {
    requests.fail = true
    await expect(refresh(null)).rejects.toThrow("catalog unavailable")
    expect(owner.getQueryData<NormalizedProviderListResponse>(queryKey)).toEqual(before)
    requests.fail = false
    await refresh(null)
    expect(owner.getQueryData<NormalizedProviderListResponse>(queryKey)).toEqual(connected)
  } finally {
    owner.clear()
  }
})
