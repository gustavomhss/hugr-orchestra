export * as ServerNode from "./node-server"

import { createServer, IncomingMessage } from "node:http"

/** Creates the Node HTTP server while preserving Bun's abort hook until the response settles. */
export function create(): ReturnType<typeof createServer> {
  if (!process.versions.bun) return createServer()

  // Bun 1.3.14 clears the shared native abort hook when a completed request body auto-destroys.
  // https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/js/node/_http_incoming.ts#L297
  class BunIncomingMessage extends IncomingMessage {
    private responseFinished = false
    private cleanupDeferred = false

    override _destroy(error: Error | null, callback: (error?: Error | null) => void) {
      if (!error && this.complete && this.readableEnded && !this.responseFinished) {
        this.cleanupDeferred = true
        callback(null)
        return
      }
      super._destroy(error, callback)
    }

    finishResponse(removeListeners: () => void) {
      if (this.responseFinished) return
      this.responseFinished = true
      removeListeners()
      if (!this.cleanupDeferred) return
      this.cleanupDeferred = false
      super._destroy(null, () => {})
    }
  }

  const server = createServer({ IncomingMessage: BunIncomingMessage })
  server.on("request", (request, response) => {
    const finish = () =>
      request.finishResponse(() => {
        response.off("finish", finish)
        response.off("close", finish)
      })
    response.once("finish", finish)
    response.once("close", finish)
  })
  return server
}
