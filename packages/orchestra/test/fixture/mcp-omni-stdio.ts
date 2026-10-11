import { spawn } from "node:child_process"
import { writeSync } from "node:fs"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

// An MCP stdio server for the omni transport tests (test/mcp/omni-stdio.test.ts). It lists one tool per argument.
// MCP_OMNI_TREE ({command, args}) starts a nonce tree below it; MCP_OMNI_STDERR writes that many bytes of stderr
// lines before it serves; MCP_OMNI_FAIL_LINES writes that many numbered stderr lines and exits 1 instead of serving.

const fail = Number(process.env.MCP_OMNI_FAIL_LINES ?? 0)
if (fail > 0) {
  for (let line = 1; line <= fail; line++) writeSync(2, `fixture stderr line ${line}\n`)
  process.exit(1)
}

const bytes = Number(process.env.MCP_OMNI_STDERR ?? 0)
for (let written = 0; written < bytes; written += 100) writeSync(2, "x".repeat(99) + "\n")
writeSync(2, "fixture stderr done\n")

if (process.env.MCP_OMNI_TREE) {
  const tree = JSON.parse(process.env.MCP_OMNI_TREE) as { command: string; args: string[] }
  spawn(tree.command, tree.args, { stdio: "ignore" })
}

const server = new Server({ name: "mcp-omni-stdio", version: "1.0.0" }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: process.argv.slice(2).map((name) => ({ name, inputSchema: { type: "object" as const, properties: {} } })),
  }),
)
await server.connect(new StdioServerTransport())
