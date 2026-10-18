import { spawn } from "node:child_process"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

// An MCP stdio server for the omni transport tests (test/mcp/omni-stdio.test.ts). It lists one tool per argument.
// MCP_OMNI_TREE ({command, args}) starts a nonce tree below it; MCP_OMNI_STDERR writes that many bytes of stderr
// lines before it serves; MCP_OMNI_FAIL_LINES writes that many numbered stderr lines and exits 1 instead of serving.

// Bun makes fd 2 non-blocking, so a writeSync that finds the pipe momentarily full throws EAGAIN and the fixture dies
// early. process.stderr.write waits for the pipe instead: the failing fixture exits only once the pipe took every line,
// and the server serves only once it took all of its stderr, so a transport that stopped draining never connects.
const stderr = (text: string) => new Promise((resolve) => process.stderr.write(text, resolve))

const fail = Number(process.env.MCP_OMNI_FAIL_LINES ?? 0)
if (fail > 0) {
  await stderr(Array.from({ length: fail }, (_, index) => `fixture stderr line ${index + 1}\n`).join(""))
  process.exit(1)
}

const bytes = Number(process.env.MCP_OMNI_STDERR ?? 0)
await stderr(("x".repeat(99) + "\n").repeat(Math.ceil(bytes / 100)) + "fixture stderr done\n")

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
