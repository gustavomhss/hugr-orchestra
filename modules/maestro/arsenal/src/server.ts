// Native stdio MCP seam. No global configuration, subprocess harness or implicit permission grants.
import { realpath } from "node:fs/promises"
import { isAbsolute, resolve } from "node:path"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { ArsenalContext, Effect } from "./contract"
import { Arsenal } from "./index"
import { inside } from "./engine/acquisition"

export function createServer(context: ArsenalContext): Server {
  if (!context.directory || !context.stateDirectory || !context.projectID || typeof context.authorize !== "function") throw new Error("standalone server requires explicit ArsenalContext")
  const server = new Server({ name: "maestro-arsenal", version: "0.0.0" }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: (await Arsenal.list()).map((tool) => ({ name: tool.name, description: tool.description, inputSchema: { ...tool.inputSchema, type: "object" as const }, annotations: { readOnlyHint: !tool.effects.includes("write") && !tool.effects.includes("process"), destructiveHint: tool.effects.includes("write"), openWorldHint: false } })) }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await Arsenal.execute(request.params.name, request.params.arguments ?? {}, context)
    return { content: result.content, ...(result.isError !== undefined ? { isError: result.isError } : {}) }
  })
  return server
}

export async function start(context: ArsenalContext): Promise<Server> {
  const server = createServer(context)
  await server.connect(new StdioServerTransport())
  return server
}

if (import.meta.main) {
  const options = new Map<string, string>()
  const allowed = new Set<Effect>()
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]
    const value = args[i + 1]
    if (!["--directory", "--state-directory", "--project-id", "--allow"].includes(key) || !value) throw new Error("usage: server.ts --directory <absolute project root> --state-directory <absolute external project data root> --project-id <id> [--allow read|write|process]")
    if (key === "--allow") {
      if (!["read", "write", "process"].includes(value)) throw new Error(`unknown authorization effect: ${value}`)
      allowed.add(value as Effect)
      continue
    }
    if (options.has(key)) throw new Error(`duplicate option: ${key}`)
    options.set(key, value)
  }
  const directory = options.get("--directory")
  const stateDirectory = options.get("--state-directory")
  const projectID = options.get("--project-id")
  if (!directory || !stateDirectory || !projectID || !isAbsolute(directory) || !isAbsolute(stateDirectory)) throw new Error("explicit absolute --directory, --state-directory and --project-id are required")
  const roots = await Promise.all([realpath(directory), realpath(stateDirectory)])
  if (inside(roots[0], roots[1]) || inside(roots[1], roots[0])) throw new Error("project root and state root must be disjoint; state root must be project-isolated")
  await start({ directory: roots[0], stateDirectory: roots[1], projectID,
    async authorize(request) {
      if (!allowed.has(request.effect)) throw new Error(`authorization denied: ${request.effect}; supply explicit --allow ${request.effect}`)
      if (!request.paths.length && !request.commands.length) throw new Error("authorization request requires explicit paths or commands")
      if (request.paths.some((path) => !isAbsolute(path) || !roots.some((root) => inside(root, resolve(path))))) throw new Error("authorization denied: path outside explicit roots")
      if (request.commands.length && request.effect !== "process") throw new Error("authorization denied: command requires process effect")
      // I/O owners additionally resolve symlinks and fence exact process inputs/outputs before execution.
    },
  })
}
