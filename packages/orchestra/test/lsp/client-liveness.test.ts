import { describe, expect, test } from "bun:test"
import { PassThrough } from "node:stream"
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node"
import { ClientLiveness } from "@/lsp/client-liveness"

describe("ClientLiveness.shutdown", () => {
  test("settles when the server cannot be stopped, so ownership can drop the dead client", async () => {
    const connection = createMessageConnection(
      new StreamMessageReader(new PassThrough()),
      new StreamMessageWriter(new PassThrough()),
    )
    const liveness = ClientLiveness.track(connection, {
      stdin: null,
      stdout: null,
      stderr: null,
      exitCode: null,
      signalCode: null,
      kill: () => {
        throw new Error("kill refused")
      },
      exited: new Promise<number>(() => {}),
    })

    await liveness.shutdown()
    await liveness.shutdown()
    expect(liveness.connected).toBe(false)
  })
})
