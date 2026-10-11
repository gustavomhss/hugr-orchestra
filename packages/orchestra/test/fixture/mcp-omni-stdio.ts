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

// Bun makes fd 2 non-blocking, so a writeSync that finds the pipe momentarily full throws EAGAIN and the fixture dies
// before it serves. process.stderr.write waits for the pipe instead, and the server serves only once the pipe took all
// of it, so a transport that stopped draining stderr still never connects.
const bytes = Number(process.env.MCP_OMNI_STDERR ?? 0)
await new Promise((resolve) =>
  process.stderr.write(("x".repeat(99) + "\n").repeat(Math.ceil(bytes / 100)) + "fixture stderr done\n", resolve),
)

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
