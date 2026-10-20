// Which LSP clients the service owns: starting one for a root, pruning the dead, and closing them all when the
// instance ends. A client started while the instance closes is stopped instead of kept.
import * as LSPClient from "./client"
import type * as LSPServer from "./server"
import { stop } from "./launch"

export interface Owner {
  closing: boolean
  clients: LSPClient.Info[]
  broken: Set<string>
  spawning: Map<string, Promise<LSPClient.Info | undefined>>
}

export async function close(s: Owner) {
  s.closing = true
  await Promise.all([...s.spawning.values(), ...s.clients.map((client) => client.shutdown())])
}

export async function prune(s: Owner) {
  const dead = s.clients.filter((client) => !client.connected)
  // Keep ownership until shutdown finishes; concurrent requests share the client's one stop promise.
  await Promise.all(dead.map((client) => client.shutdown()))
  s.clients = s.clients.filter((client) => !dead.includes(client))
}

export async function schedule(
  s: Owner,
  input: { server: LSPServer.Info; root: string; key: string; ctx: { directory: string; worktree: string; project?: { id: string } }; flags: { experimentalLspTy?: boolean; disableLspDownload?: boolean } },
) {
  const { server, root, key, ctx, flags } = input
  await prune(s)
  if (s.closing) return undefined
  const handle = await server
    .spawn(root, ctx, flags)
    .then((value) => {
      if (!value) s.broken.add(key)
      return value
    })
    .catch(() => {
      s.broken.add(key)
      return undefined
    })

  if (!handle) return undefined
  if (s.closing) {
    await stop(handle.process)
    return undefined
  }
  const client = await LSPClient.create({
    serverID: server.id,
    server: handle,
    root,
    directory: ctx.directory,
    instance: ctx,
  }).catch(async () => {
    s.broken.add(key)
    await stop(handle.process)
    return undefined
  })

  if (!client) return undefined
  if (s.closing) {
    await client.shutdown()
    return undefined
  }

  const existing = s.clients.find((x) => x.root === root && x.serverID === server.id && x.connected)
  if (existing) {
    await stop(handle.process)
    return existing
  }

  s.clients.push(client)
  return client
}

export * as LSPOwnership from "./ownership"
