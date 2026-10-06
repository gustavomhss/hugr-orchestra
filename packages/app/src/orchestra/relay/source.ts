import { skipToken, useQuery, useQueryClient } from "@tanstack/solid-query"
import { createEffect, createMemo, onCleanup } from "solid-js"
import { useGlobal } from "@/context/global"
import { usePlatform } from "@/context/platform"
import type { ServerConnection } from "@/context/server"
import { pathKey } from "@/utils/path-key"
import { createRelayClient, documentKind, relayUnsupported, type RelayKind, type RelayRun } from "./client"

// One profile's Relay data, shared by the chapter pages and the sidebar through the server's query client.
// Queries never retry: a 404 means the server has no Relay routes and the screens say so.

export const relayKey = (scope: string, directory: string, ...parts: string[]) => [
  scope,
  pathKey(directory),
  "relay",
  ...parts,
]

export function relayClient(
  server: ServerConnection.Any,
  directory: string,
  fetch: typeof globalThis.fetch | undefined,
) {
  // Called through a wrapper: window.fetch throws when invoked as a method of another object.
  return createRelayClient({
    server: server.http,
    directory,
    fetch: (url, init) => (fetch ?? globalThis.fetch)(url, init),
  })
}

export type RelaySource = ReturnType<typeof createRelaySource>

export function createRelaySource(input: { server: ServerConnection.Any; directory: string; kind: RelayKind }) {
  const global = useGlobal()
  const platform = usePlatform()
  const ctx = global.ensureServerCtx(input.server)
  const client = relayClient(input.server, input.directory, platform.fetch)
  const queryClient = () => ctx.queryClient
  const key = (...parts: string[]) => relayKey(ctx.sdk.scope, input.directory, ...parts)

  const documents = useQuery(
    () => ({ queryKey: key("documents"), queryFn: client.documents, retry: false, refetchOnMount: "always" as const }),
    queryClient,
  )
  const supported = () => !documents.isError || !relayUnsupported(documents.error)
  const nodeTypes = useQuery(
    () => ({
      queryKey: key("node-types"),
      queryFn: documents.isSuccess ? client.nodeTypes : skipToken,
      retry: false,
      staleTime: 300_000,
    }),
    queryClient,
  )
  const runs = useQuery(
    () => ({
      queryKey: key("runs"),
      queryFn: input.kind === "workflow" && documents.isSuccess ? () => client.runs() : skipToken,
      retry: false,
      refetchInterval: (query: { state: { data?: RelayRun[] } }) =>
        query.state.data?.some((run) => run.status === "running") ? 10_000 : false,
    }),
    queryClient,
  )
  const installs = useQuery(
    () => ({
      queryKey: key("installs"),
      queryFn: input.kind === "hook" && documents.isSuccess ? client.installs : skipToken,
      retry: false,
    }),
    queryClient,
  )
  const list = createMemo(() =>
    (documents.data ?? [])
      .filter((document) => documentKind(document) === input.kind && !document.isArchived)
      .toSorted((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
  )
  const invalidate = (...parts: string[]) => void ctx.queryClient.invalidateQueries({ queryKey: key(...parts) })

  // Durable relay.* events arrive on the profile's event stream; each one refreshes what it can change.
  onCleanup(
    ctx.sdk.event.on(input.directory, (event) => {
      const type: string = event.type
      if (!type.startsWith("relay.")) return
      if (type.startsWith("relay.hook")) return invalidate("installs")
      invalidate("runs")
      if (type === "relay.document.saved") invalidate("documents")
    }),
  )

  return { client, documents, nodeTypes, runs, installs, list, supported, invalidate, key, queryClient }
}

// The runs that wait for a human in this profile, for the sidebar count. Shares the chapter's cache entry.
export function useAwaitingRuns(target: () => { server: ServerConnection.Any; directory: string } | undefined) {
  const global = useGlobal()
  const platform = usePlatform()
  const fallback = useQueryClient()
  const query = useQuery(
    () => {
      const current = target()
      if (!current) return { queryKey: ["orchestra-relay-awaiting"], queryFn: skipToken }
      const ctx = global.ensureServerCtx(current.server)
      const client = relayClient(current.server, current.directory, platform.fetch)
      return {
        queryKey: relayKey(ctx.sdk.scope, current.directory, "runs"),
        queryFn: () => client.runs(),
        retry: false,
        refetchInterval: (state: { state: { error: unknown } }) => (state.state.error ? false : 30_000),
      }
    },
    () => {
      const current = target()
      return current ? global.ensureServerCtx(current.server).queryClient : fallback
    },
  )
  createEffect(() => {
    const current = target()
    if (!current) return
    const ctx = global.ensureServerCtx(current.server)
    onCleanup(
      ctx.sdk.event.on(current.directory, (event) => {
        const type: string = event.type
        if (type.startsWith("relay.run") || type.startsWith("relay.gate"))
          void ctx.queryClient.invalidateQueries({ queryKey: relayKey(ctx.sdk.scope, current.directory, "runs") })
      }),
    )
  })
  return () => (query.isSuccess ? query.data.filter((run) => run.status === "parked").length : 0)
}
