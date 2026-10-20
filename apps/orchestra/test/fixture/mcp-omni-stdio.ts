import { spawn } from "node:child_process"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

// An MCP stdio server for the omni transport tests (test/mcp/omni-stdio.test.ts). It lists one tool per argument.
// MCP_OMNI_TREE ({command, args}) starts a nonce tree below it; MCP_OMNI_STDERR writes that many bytes of stderr
// lines before it serves; MCP_OMNI_FAIL_LINES writes that many numbered stderr lines and exits 1 instead of serving.
// MCP_OMNI_RESOURCE (a URI) also offers that resource, whose text names it, and one template, plus a `greet` prompt
// with one `name` argument.

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

const resource = process.env.MCP_OMNI_RESOURCE
const server = new Server(
  { name: "mcp-omni-stdio", version: "1.0.0" },
  { capabilities: resource ? { tools: {}, resources: {}, prompts: {} } : { tools: {} } },
)
if (resource) {
  server.setRequestHandler(ListResourcesRequestSchema, () =>
    Promise.resolve({ resources: [{ name: "fixture note", uri: resource, mimeType: "text/plain" }] }),
  )
  server.setRequestHandler(ListResourceTemplatesRequestSchema, () =>
    Promise.resolve({ resourceTemplates: [{ name: "fixture notes", uriTemplate: `${resource}/{id}` }] }),
  )
  server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    Promise.resolve({ contents: [{ uri: request.params.uri, mimeType: "text/plain", text: `text of ${request.params.uri}` }] }),
  )
  server.setRequestHandler(ListPromptsRequestSchema, () =>
    Promise.resolve({
      prompts: [{ name: "greet", description: "Greets someone", arguments: [{ name: "name", required: true }] }],
    }),
  )
  server.setRequestHandler(GetPromptRequestSchema, (request) =>
    Promise.resolve({
      messages: [
        { role: "user" as const, content: { type: "text" as const, text: `Greet ${request.params.arguments?.name}` } },
      ],
    }),
  )
}
server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: process.argv.slice(2).map((name) => ({ name, inputSchema: { type: "object" as const, properties: {} } })),
  }),
)
await server.connect(new StdioServerTransport())
