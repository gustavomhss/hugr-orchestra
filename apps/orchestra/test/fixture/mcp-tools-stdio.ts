import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

// Lists one tool per command-line argument, so tests can choose names that collide once prefixed.
const server = new Server({ name: "mcp-tools-stdio", version: "1.0.0" }, { capabilities: { tools: {} } })

server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: process.argv.slice(2).map((name) => ({ name, inputSchema: { type: "object" as const, properties: {} } })),
  }),
)

await server.connect(new StdioServerTransport())
