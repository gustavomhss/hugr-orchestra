export * as McpCatalog from "./catalog"

import type { Client } from "@modelcontextprotocol/sdk/client/index.js"
import type { SchemaOutput } from "@modelcontextprotocol/sdk/server/zod-compat.js"
import { CallToolResultSchema, ListToolsResultSchema, ToolSchema } from "@modelcontextprotocol/sdk/types.js"
import type { ToolContent } from "@orchestra/llm"
import { Effect } from "effect"

const DEFAULT_TIMEOUT = 30_000
const MAX_LIST_PAGES = 1_000

const TolerantListToolsResultSchema = ListToolsResultSchema.extend({
  tools: ToolSchema.omit({ outputSchema: true }).array(),
})

export async function paginate<T, R extends { nextCursor?: string }>(
  list: (cursor?: string) => Promise<R>,
  items: (result: R) => T[],
) {
  const result: T[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const page = await list(cursor)
    result.push(...items(page))
    if (page.nextCursor === undefined) return result
    if (cursors.has(page.nextCursor)) throw new Error(`MCP list returned duplicate cursor: ${page.nextCursor}`)
    cursors.add(page.nextCursor)
    cursor = page.nextCursor
  }

  throw new Error(`MCP list exceeded ${MAX_LIST_PAGES} pages`)
}

/** The server's tools, or undefined when listing fails (a list-changed refresh then keeps the previous set). */
export function defs(client: Client, timeout?: number) {
  return listTools(client, timeout ?? DEFAULT_TIMEOUT).pipe(Effect.catch(() => Effect.void))
}

/** The server's tools; a listing failure stays a typed failure so the caller can report it. */
export function tools(client: Client, timeout?: number) {
  return listTools(client, timeout ?? DEFAULT_TIMEOUT)
}

export function fetch<T extends { name: string }>(
  clientName: string,
  client: Client,
  list: (client: Client) => Promise<T[]>,
  label: string,
  key?: (item: T) => string,
) {
  return Effect.tryPromise({
    try: () => list(client),
    catch: (error) => error,
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning(`failed to get ${label}`, {
        clientName,
        error: error instanceof Error ? error.message : String(error),
      }),
    ),
    Effect.map((items) => {
      const sanitizedClient = sanitize(clientName)
      // Escape both the separator and escape marker so `server:uri` keys remain unambiguous.
      const resourceClient = clientName.replaceAll("%", "%25").replaceAll(":", "%3A")
      return Object.fromEntries(
        items.map((item) => [
          key ? resourceClient + ":" + key(item) : sanitizedClient + ":" + sanitize(item.name),
          { ...item, client: clientName },
        ]),
      )
    }),
    Effect.orElseSucceed(() => undefined),
  )
}

export const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_")

export const toolName = (clientName: string, name: string) => sanitize(clientName) + "_" + sanitize(name)

export function prompts(client: Client, timeout?: number) {
  if (!client.getServerCapabilities()?.prompts) return Promise.resolve([])
  return paginate(
    (cursor) => client.listPrompts(cursor === undefined ? undefined : { cursor }, { timeout }),
    (result) => result.prompts,
  )
}

export function resources(client: Client, timeout?: number) {
  if (!client.getServerCapabilities()?.resources) return Promise.resolve([])
  return paginate(
    (cursor) => client.listResources(cursor === undefined ? undefined : { cursor }, { timeout }),
    (result) => result.resources,
  )
}

export function resourceTemplates(client: Client, timeout?: number) {
  if (!client.getServerCapabilities()?.resources) return Promise.resolve([])
  return paginate(
    (cursor) => client.listResourceTemplates(cursor === undefined ? undefined : { cursor }, { timeout }),
    (result) => result.resourceTemplates,
  )
}

function listTools(client: Client, timeout: number) {
  return Effect.tryPromise({
    try: () =>
      paginate(
        async (cursor) => {
          const params = cursor === undefined ? undefined : { cursor }
          try {
            return await client.listTools(params, { timeout })
          } catch (error) {
            if (!(error instanceof Error) || !isOutputSchemaValidationError(error)) throw error
            return client.request({ method: "tools/list", params }, TolerantListToolsResultSchema, { timeout })
          }
        },
        (result) => result.tools,
      ),
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })
}

function isOutputSchemaValidationError(error: Error) {
  return /can't resolve reference|resolves to more than one schema|outputSchema|schema.*reference|reference.*schema/i.test(
    error.message,
  )
}

export function described(item: { description?: string; mimeType?: string }) {
  return {
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.mimeType === undefined ? {} : { mimeType: item.mimeType }),
  }
}

// `callTool` returns the schema output, which SDK 1.32 no longer types the same as the exported `CallToolResult`.
type CallToolResult = SchemaOutput<typeof CallToolResultSchema>

/** The text parts of a tool result, for an error message. */
export function resultText(result: Pick<CallToolResult, "content">) {
  return result.content.flatMap((item) => (item.type === "text" && item.text.trim() ? [item.text] : [])).join("\n\n")
}

export function resultContent(result: Pick<CallToolResult, "content" | "structuredContent">): ToolContent[] {
  if (result.content.length === 0 && result.structuredContent !== undefined)
    return [{ type: "text", text: JSON.stringify(result.structuredContent) }]
  return result.content.map((item): ToolContent => {
    if (item.type === "text") return { type: "text", text: item.text }
    if (item.type === "image" || item.type === "audio")
      return { type: "file", uri: `data:${item.mimeType};base64,${item.data}`, mime: item.mimeType }
    return { type: "text", text: JSON.stringify(item) }
  })
}
