import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  type ListPromptsResult,
} from "@modelcontextprotocol/sdk/types.js"
import type { McpProvided } from "@orchestra/core/mcp/provided"

export function promptServer(
  name: string,
  list: (cursor: string | undefined, signal: AbortSignal) => Promise<ListPromptsResult>,
) {
  const observed = { connections: 0, gets: 0 }
  const provided: McpProvided.Server = {
    name,
    key: name,
    connect() {
      observed.connections++
      const [client, side] = InMemoryTransport.createLinkedPair()
      const server = new Server({ name, version: "1.0.0" }, { capabilities: { prompts: {} } })
      server.setRequestHandler(ListPromptsRequestSchema, (request, extra) => list(request.params?.cursor, extra.signal))
      server.setRequestHandler(GetPromptRequestSchema, async () => {
        observed.gets++
        return { messages: [] }
      })
      void server.connect(side)
      return client
    },
  }
  return { provided, observed }
}
