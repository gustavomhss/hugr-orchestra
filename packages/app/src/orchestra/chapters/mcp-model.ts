import type { McpServer } from "@opencode-ai/client/promise"

export type McpStatus = McpServer["status"]
export type McpTransport = "stdio" | "http"
export type McpServerConfig = { type: "local"; command: string[] } | { type: "remote"; url: string }

export type McpCard = {
  name: string
  status: McpStatus
  transport?: McpTransport
  endpoint?: string
  tools?: string[]
}

// Mock badges: Connected (good), Error (bad), Disabled (neutral). The remaining live states keep
// their own labels so a server that needs attention never reads as healthy.
export const mcpBadges = {
  connected: { label: "orchestra.mcp.connected", tone: "good" },
  failed: { label: "orchestra.mcp.error", tone: "bad" },
  disabled: { label: "orchestra.mcp.disabled", tone: undefined },
  needs_auth: { label: "orchestra.mcp.needsAuth", tone: "bad" },
  needs_client_registration: { label: "orchestra.mcp.needsClientRegistration", tone: "bad" },
  pending: { label: "orchestra.mcp.pending", tone: undefined },
} as const

// The status map is the inventory; config adds the endpoint and tools add the count.
export function mcpCards(
  status: Record<string, McpStatus>,
  config: Record<string, unknown> | undefined,
  tools: Record<string, readonly string[]> | undefined,
): McpCard[] {
  return Object.entries(status)
    .map(([name, value]) => ({
      name,
      status: value,
      ...mcpEndpoint(config && Object.hasOwn(config, name) ? config[name] : undefined),
      tools: tools && Object.hasOwn(tools, name) ? [...tools[name]] : undefined,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function mcpEndpoint(entry: unknown): { transport?: McpTransport; endpoint?: string } {
  if (!entry || typeof entry !== "object") return {}
  if ("type" in entry && entry.type === "remote" && "url" in entry && typeof entry.url === "string")
    return { transport: "http", endpoint: entry.url }
  if (
    "type" in entry &&
    entry.type === "local" &&
    "command" in entry &&
    Array.isArray(entry.command) &&
    entry.command.every((part) => typeof part === "string")
  )
    return { transport: "stdio", endpoint: formatCommand(entry.command) }
  return {}
}

export function mcpMatches(card: McpCard, query: string, label: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [card.name, card.endpoint, card.transport, label].some((part) => part?.toLowerCase().includes(needle))
}

export function mcpEnabled(status: McpStatus["status"]) {
  return status !== "disabled"
}

/** Builds the config a draft describes, or names the field that blocks saving. */
export function mcpConfig(
  transport: McpTransport,
  endpoint: string,
): { config: McpServerConfig } | { error: "url" | "command" } {
  if (transport === "http") {
    const url = URL.canParse(endpoint.trim()) ? new URL(endpoint.trim()) : undefined
    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) return { error: "url" }
    return { config: { type: "remote", url: endpoint.trim() } }
  }
  const command = parseCommand(endpoint)
  if (!command?.length) return { error: "command" }
  return { config: { type: "local", command } }
}

// Shell-style splitting for a single command line: whitespace separates arguments, single and
// double quotes group them, and a backslash escapes the next character outside single quotes.
export function parseCommand(text: string) {
  const state = { args: [] as string[], current: "", started: false, quote: "" }
  const chars = [...text]
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index]
    if (state.quote === "'") {
      if (char === "'") state.quote = ""
      if (char !== "'") state.current += char
      continue
    }
    if (char === "\\" && index + 1 < chars.length) {
      state.current += chars[++index]
      state.started = true
      continue
    }
    if (state.quote === '"') {
      if (char === '"') state.quote = ""
      if (char !== '"') state.current += char
      continue
    }
    if (char === "'" || char === '"') {
      state.quote = char
      state.started = true
      continue
    }
    if (/\s/.test(char)) {
      if (state.started) state.args.push(state.current)
      state.current = ""
      state.started = false
      continue
    }
    state.current += char
    state.started = true
  }
  if (state.quote) return
  if (state.started) state.args.push(state.current)
  return state.args
}

export function formatCommand(command: readonly string[]) {
  return command.map((part) => (part && !/[\s'"\\]/.test(part) ? part : `'${part.replaceAll("'", `'"'"'`)}'`)).join(" ")
}
