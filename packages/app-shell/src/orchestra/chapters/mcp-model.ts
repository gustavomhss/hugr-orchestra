import type { McpServer } from "@/v2-wire"
import { pathKey } from "@/utils/path-key"

export type McpStatus = McpServer["status"]
export type McpTransport = "stdio" | "http"
export type McpServerConfig =
  | { type: "local"; command: string[]; environment?: Record<string, string> }
  | { type: "remote"; url: string; headers?: Record<string, string> }
/** Only the fields the page shows or edits; anything else in a server's config never reaches it. */
export type McpEntry = { type?: "local" | "remote"; command?: readonly string[]; url?: string }

export type McpCard = {
  name: string
  status: McpStatus
  transport?: McpTransport
  /** Display text with credentials masked. */
  endpoint?: string
  /** The profile file's own entry, unresolved, when the profile defines this server. */
  entry?: McpEntry
  tools?: string[]
}

const MASK = "•••"
const SECRET = /token|key|secret|passw|auth|credential/i

/** Where the page's MCP writes land by default (`McpProjectConfig.files`); env, headers and OAuth go there too. */
export const MCP_CONFIG_FILE = "orchestra.json"

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

// Same dispatch as the shared MCP toggle: the switch shows a live connection, so a failed server is
// off and switching it on retries.
export function mcpAction(status: McpStatus["status"]) {
  if (status === "pending") return
  if (status === "connected") return "disconnect"
  if (status === "needs_auth") return "authenticate"
  return "connect"
}

export function mcpError(status: McpStatus) {
  return "error" in status ? status.error : undefined
}

/**
 * The status map is the inventory. The profile's own entry (unresolved) wins over the server's
 * resolved config for display; either way credentials are masked. Tools add the count.
 */
export function mcpCards(
  status: Record<string, McpStatus>,
  resolved: Record<string, McpEntry> | undefined,
  entries: Record<string, McpEntry> | null | undefined,
  tools: Record<string, readonly string[]> | null | undefined,
): McpCard[] {
  return Object.entries(status)
    .map(([name, value]) => {
      const entry = entries && Object.hasOwn(entries, name) ? entries[name] : undefined
      const shown = endpoint(entry) ?? endpoint(resolved && Object.hasOwn(resolved, name) ? resolved[name] : undefined)
      return {
        name,
        status: value,
        ...shown,
        entry,
        tools: tools && Object.hasOwn(tools, name) ? [...tools[name]] : undefined,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Keeps only the displayed fields so headers, environment and OAuth secrets are never cached.
export function mcpEntry(value: unknown): McpEntry {
  if (!value || typeof value !== "object") return {}
  const type = "type" in value && (value.type === "local" || value.type === "remote") ? value.type : undefined
  const command =
    "command" in value &&
    Array.isArray(value.command) &&
    value.command.every((part): part is string => typeof part === "string")
      ? value.command
      : undefined
  const url = "url" in value && typeof value.url === "string" ? value.url : undefined
  return { ...(type ? { type } : {}), ...(command ? { command } : {}), ...(url !== undefined ? { url } : {}) }
}

function endpoint(entry: McpEntry | undefined): { transport: McpTransport; endpoint: string } | undefined {
  if (entry?.type === "remote" && entry.url !== undefined) return { transport: "http", endpoint: maskUrl(entry.url) }
  if (entry?.type === "local" && entry.command)
    return { transport: "stdio", endpoint: formatCommand(maskCommand(entry.command)) }
}

/** The draft the Configure dialog starts from: the raw file entry, never resolved values. */
export function mcpDraft(entry: McpEntry | undefined): string | undefined {
  if (entry?.type === "remote" && entry.url !== undefined) return entry.url
  if (entry?.type === "local" && entry.command) return formatCommand(entry.command)
}

// What the user typed decides the transport: a URL connects over HTTP, anything else is a local command.
export function mcpTransport(endpoint: string): McpTransport {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(endpoint.trim()) ? "http" : "stdio"
}

// Whether a folder is, or sits inside, one of the folders the global config lists as trusted.
export function trustedDirectory(roots: readonly string[], directory: string) {
  const target = pathKey(directory)
  return roots.some((root) => {
    const base = pathKey(root)
    return target === base || target.startsWith(`${base}/`)
  })
}

// An unedited save writes nothing. Typed environment or headers always count as an edit.
export function mcpUnchanged(entry: McpEntry | undefined, config: McpServerConfig) {
  if (!entry || entry.type !== config.type) return false
  if (config.type === "remote") return entry.url === config.url && config.headers === undefined
  return (
    config.environment === undefined &&
    entry.command?.length === config.command.length &&
    config.command.every((part, i) => entry.command?.[i] === part)
  )
}

// Mirrors the server's rule: names are JSON keys and URL path segments.
export function mcpNameValid(name: string) {
  return name.trim() !== "" && name !== "." && name !== ".." && name !== "__proto__" && !/[/\\\p{Cc}]/u.test(name)
}

export function maskUrl(value: string) {
  if (!URL.canParse(value)) return value
  const url = new URL(value)
  const userinfo = url.username || url.password ? `${MASK}@` : ""
  const query = [...new Set(url.searchParams.keys())].map((key) => `${key}=${MASK}`).join("&")
  return `${url.protocol}//${userinfo}${url.host}${url.pathname}${query ? `?${query}` : ""}${url.hash ? `#${MASK}` : ""}`
}

// Masks values that follow or belong to secret-looking flags, secret NAME=value pairs, and URL credentials.
export function maskCommand(command: readonly string[]) {
  return command.map((part, index) => {
    const pair = /^(-{0,2}[\w.-]+)=/.exec(part)
    if (pair && SECRET.test(pair[1])) return `${pair[1]}=${MASK}`
    const previous = command[index - 1]
    if (previous?.startsWith("-") && !previous.includes("=") && SECRET.test(previous) && !part.startsWith("-"))
      return MASK
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(part)) return maskUrl(part)
    return part
  })
}

export function mcpMatches(card: McpCard, query: string, label: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [card.name, card.endpoint, card.transport, label].some((part) => part?.toLowerCase().includes(needle))
}

/** The free-text fields of the dialog. Only the ones for the inferred transport are read. */
export type McpFields = { environment?: string; headers?: string }

/** Builds the config a draft describes, or names the field that blocks saving. */
export function mcpConfig(
  endpoint: string,
  fields: McpFields = {},
): { config: McpServerConfig } | { error: "url" | "command" | "environment" | "headers" } {
  if (mcpTransport(endpoint) === "http") {
    const url = endpoint.trim()
    const parsed = URL.canParse(url) ? new URL(url) : undefined
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return { error: "url" }
    const headers = parseKeyValues(fields.headers, ":")
    if (headers === null) return { error: "headers" }
    return { config: { type: "remote", url, ...(headers ? { headers } : {}) } }
  }
  const command = parseCommand(endpoint)
  if (!command?.length) return { error: "command" }
  const environment = parseKeyValues(fields.environment, "=")
  if (environment === null) return { error: "environment" }
  return { config: { type: "local", command, ...(environment ? { environment } : {}) } }
}

// `KEY=value` lines for the environment and `Name: value` lines for headers. Blank lines are skipped. An empty set
// is undefined, so the save leaves the file's own set alone; a line without a name and separator makes it null.
function parseKeyValues(text: string | undefined, separator: "=" | ":") {
  const lines = (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const pairs = lines.flatMap((line) => {
    const index = line.indexOf(separator)
    const key = index > 0 ? line.slice(0, index).trim() : ""
    return key ? [[key, line.slice(index + 1).trim()] as const] : []
  })
  if (pairs.length !== lines.length) return null
  return pairs.length ? Object.fromEntries(pairs) : undefined
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
