// Whether an LSP client's server is still there, and its one shutdown. The connection closing or being disposed, the
// process exiting, or a shutdown that began all mark the client dead, so the LSP service prunes and replaces it.
import type { MessageConnection } from "vscode-jsonrpc/node"
import { stop } from "./launch"
import type * as LSPServer from "./server"

export function track(connection: MessageConnection, process: LSPServer.Handle["process"]) {
  const state = { connected: true, shutdown: undefined as Promise<void> | undefined }
  connection.onClose(() => {
    state.connected = false
  })
  connection.onDispose(() => {
    state.connected = false
  })
  void process.exited?.then(
    () => {
      state.connected = false
    },
    () => {
      state.connected = false
    },
  )
  return {
    get connected() {
      return state.connected && process.exitCode === null && process.signalCode === null
    },
    shutdown() {
      state.shutdown ??= (async () => {
        state.connected = false
        connection.end()
        connection.dispose()
        // A failed stop still leaves the client dead; caching that rejection would make every prune fail and keep
        // the dead client owned forever.
        await stop(process).catch(() => undefined)
      })()
      return state.shutdown
    },
  }
}

export * as ClientLiveness from "./client-liveness"
