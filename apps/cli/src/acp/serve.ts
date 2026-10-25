import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk"
import type { Orchestra } from "@orchestra/client"
import { OrchestraAgent } from "./agent"

/** Serves the ACP agent over a pair of byte streams until the peer closes them. */
export function serveAcp(client: ReturnType<typeof Orchestra.make>, streams: { input: ReadableStream<Uint8Array>; output: WritableStream<Uint8Array> }) {
  const connection = new AgentSideConnection(
    (conn) => new OrchestraAgent(client, conn),
    ndJsonStream(streams.output, streams.input),
  )
  return connection.closed
}
