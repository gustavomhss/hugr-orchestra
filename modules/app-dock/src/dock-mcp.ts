export * as DockMcp from "./dock-mcp"

// One MCP server per interface open in the MCP Dock: each browser tab and the Linux workspace. A model sees the whole
// interface as an outline (hierarchy, roles, names, states) and acts on it by ref, with no screenshot and no model call
// anywhere in the path: every answer is computed from the accessibility tree the dock already reads.

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import type { ToolContext } from "@orchestra/plugin"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { McpProvided } from "@orchestra/core/mcp/provided"
import { Effect, Layer, Option, Schema } from "effect"
import { createAppDockHooks, request } from "./app-dock"
import { AppDockHints } from "./app-dock-hints"
import { AppDockOutline } from "./app-dock-outline"
import type { Transport } from "./transport"

type Tab = { tabID: string; generation?: number; url?: string; title?: string; scopeKind?: string }
// One line of the outline. `key` identifies the same control across snapshots (the browser's stable ref, or the Linux
// node's path by role, name and occurrence), so a diff can tell what appeared, went away or changed.
type Entry = { key: string; ref: number; line: string; label: string; depth: number; role: string; name: string;
  parent?: number; target?: number }
type Snapshot = { header: string; entries: Entry[]; text?: string; complete: boolean }

const LOOK_LIMIT = 40_000
const TEXT_LIMIT = 20_000
const SETTLE_MS = 300
const ACT_MS = 20_000

export const node = (port: Transport) => makeGlobalNode({ service: McpProvided.Service, layer: layer(port), deps: [] })

export function layer(port: Transport) {
  const servers = new Map<string, { key: string; server: McpProvided.Server }>()
  return Layer.succeed(McpProvided.Service, McpProvided.Service.of({
    servers: () => Effect.tryPromise(async () => {
      const tabs = await request(port, "list", {}, AbortSignal.timeout(3000), 3000)
      return named(Array.isArray(tabs) ? tabs.filter(isTab) : []).map(([name, tab]) => {
        const key = `${tab.tabID}:${tab.generation ?? 0}`
        const known = servers.get(name)
        if (known?.key === key) return known.server
        const server = { name, key, connect: () => serve(port, name, tab) }
        servers.set(name, { key, server })
        return server
      })
    }),
  }))
}

const isTab = (value: unknown): value is Tab =>
  typeof value === "object" && value !== null && typeof (value as Tab).tabID === "string"
const linux = (tab: Tab) => tab.scopeKind === "workspace"

// "dock-linux" for the workspace, "dock-<host>" for a page; a second tab on the same host gets "-2".
function named(tabs: Tab[]) {
  const taken = new Map<string, number>()
  return tabs.map((tab) => {
    const base = linux(tab) ? "dock-linux" : `dock-${host(tab.url)}`
    const seen = (taken.get(base) ?? 0) + 1
    taken.set(base, seen)
    return [seen === 1 ? base : `${base}-${seen}`, tab] as const
  })
}

function host(url?: string) {
  const name = URL.canParse(url ?? "") ? new URL(url!).hostname.replace(/^www\./, "") : ""
  return name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "page"
}

function serve(port: Transport, name: string, tab: Tab) {
  const [client, side] = InMemoryTransport.createLinkedPair()
  const app = linux(tab) ? linuxApp(port) : browserApp(port, tab)
  const server = new Server({ name, version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } })
  // The last snapshot this server showed; refs in find/act answers point into it.
  const state: { last?: Snapshot } = {}
  const snap = async () => (state.last = await app.snapshot())
  const where = linux(tab) ? "the Linux workspace" : `the browser tab ${tab.title ? `"${tab.title}"` : ""} (${tab.url ?? ""})`

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools(where, linux(tab)) }))
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [{ uri: `dock://${name}/outline`, name: `${name} outline`, mimeType: "text/plain",
      description: `The whole outline of ${where}, as look returns it.` }],
  }))
  server.setRequestHandler(ReadResourceRequestSchema, async (call) => ({
    contents: [{ uri: call.params.uri, mimeType: "text/plain", text: look(await snap()) }],
  }))
  server.setRequestHandler(CallToolRequestSchema, async (call) => {
    const args = (call.params.arguments ?? {}) as Record<string, unknown>
    const text = await run(call.params.name, args).catch(failure)
    return { content: [{ type: "text", text }], isError: text.startsWith("Error:") }
  })
  void server.connect(side)
  return client

  async function run(tool: string, args: Record<string, unknown>) {
    if (tool === "look") {
      const snapshot = await snap()
      const scope = typeof args.scope === "number" ? args.scope : undefined
      const text = snapshot.text ?? ""
      return look(snapshot, scope) + (args.text === true && text
        ? `\n\n--- page text ---\n${text.slice(0, TEXT_LIMIT)}${text.length > TEXT_LIMIT ? `\n… text cut at ${TEXT_LIMIT} characters: find searches all of it` : ""}`
        : "")
    }
    if (tool === "find") return find(await snap(), String(args.query ?? ""), typeof args.role === "string" ? args.role : undefined)
    if (tool === "wait") return wait(args)
    if (tool === "act") return act(args)
    if (tool === "navigate" && !linux(tab)) return change(() => app.navigate!(args))
    if (tool === "apps" && linux(tab)) return apps(port)
    if (tool === "launch" && linux(tab)) {
      // An empty workspace has nothing to read yet; the launched app's window is then all that appeared.
      const before = state.last ?? await snap().catch((): Snapshot => ({ header: "Linux workspace", entries: [], complete: true }))
      const result = await change(async () => {
        const value = await request(port, "launch", { appID: String(args.id ?? "") }, AbortSignal.timeout(30_000), 30_000) as
          { window?: string }
        return value.window === "focused" ? `${args.id} was already open; brought its window forward` : `opened ${args.id}`
      }, before)
      // A window without an accessibility tree (xterm, for example) leaves the outline empty; "no visible change" would
      // send the model to wait for something that never comes.
      if (state.last?.entries.length) return result
      return `${result.split("\n")[0]}\nnothing in the workspace is readable yet. If look stays empty, this app exposes no accessibility tree and these tools cannot drive it: launch another app from apps`
    }
    throw new Error(`Unknown tool ${tool}`)
  }

  async function act(args: Record<string, unknown>) {
    const before = state.last ?? await snap()
    // Without ref, name or role the action goes to whatever has focus (keys, or typing into an unnamed editor).
    const entry = args.ref === undefined && args.name === undefined && args.role === undefined ? undefined : pick(before, args)
    return change(() => app.act(entry, args), before)
  }

  // Runs the action, waits for the interface to settle and answers with what changed, so the model rarely needs to
  // look again after acting.
  async function change(action: () => Promise<string>, previous?: Snapshot) {
    const before = previous ?? state.last ?? await snap()
    const ack = await action()
    if (ack.startsWith("Error:")) return ack
    const after = await settle(before)
    state.last = after
    return [ack, diff(before, after)].filter(Boolean).join("\n")
  }

  async function settle(before: Snapshot) {
    const rounds = linux(tab) ? 2 : 4
    const step = async (previous: Snapshot, left: number): Promise<Snapshot> => {
      await Bun.sleep(SETTLE_MS)
      // A window that just opened may not expose its tree yet; keep the last good read and try again.
      const next = await app.snapshot().catch(() => previous)
      if (left <= 1 || (next !== previous && same(next, previous) && !same(next, before))) return next
      return step(next, left - 1)
    }
    return step(before, rounds)
  }

  async function wait(args: Record<string, unknown>) {
    const wanted = String(args.text ?? "").toLowerCase()
    if (!wanted) return "Error: pass text to wait for"
    const deadline = Date.now() + Math.min(Number(args.timeoutMs ?? 5000) || 5000, 15_000)
    const poll = async (): Promise<string> => {
      const snapshot = await snap()
      const present = snapshot.entries.some((entry) => entry.line.toLowerCase().includes(wanted))
        || (snapshot.text ?? "").toLowerCase().includes(wanted)
      if (present !== (args.gone === true)) {
        const match = snapshot.entries.find((entry) => entry.line.toLowerCase().includes(wanted))
        return args.gone === true ? `"${args.text}" is gone.` : `Found: ${match ? match.line : `"${args.text}" in the page text`}`
      }
      if (Date.now() >= deadline) return `Error: timed out; "${args.text}" is ${args.gone === true ? "still there" : "not there"}. look shows the current state.`
      await Bun.sleep(SETTLE_MS)
      return poll()
    }
    return poll()
  }
}

// A native failure carries a code; the hint for it says what to do next, so the model does not retry blind. Here
// "not-ready" means the workspace has no app window with an accessibility tree, which these servers can fix.
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const code = typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code : undefined
  const hint = code === "not-ready"
    ? "No app window is open in the Linux workspace yet. Open one with launch (ids from apps), then look again; if it stays empty, the app exposes no accessibility tree"
    : code === undefined ? undefined : AppDockHints.hintFor(code)
  return `Error: ${message}${hint ? `. ${hint}` : ""}`
}

async function apps(port: Transport) {
  const list = await request(port, "apps", {}, AbortSignal.timeout(10_000), 10_000) as { id: string; name: string }[]
  if (list.length === 0) return "No apps are installed in the Linux workspace."
  return list.map((app) => `${app.name} — id ${app.id}`).join("\n")
}

type App = {
  snapshot: () => Promise<Snapshot>
  act: (entry: Entry | undefined, args: Record<string, unknown>) => Promise<string>
  navigate?: (args: Record<string, unknown>) => Promise<string>
}

function browserApp(port: Transport, tab: Tab): App {
  const rpc = (op: string, args: Record<string, unknown>) =>
    request(port, op, { ...args, world: "browser", tabID: tab.tabID }, AbortSignal.timeout(15_000), 15_000)
  const ok = (value: unknown) => `ok ${JSON.stringify(value)}`.slice(0, 300)
  return {
    snapshot: async () => {
      const value = await rpc("read", { budget: 500, maxText: 20_000 }) as {
        url?: string; title?: string; items?: BrowserItem[]; text?: string; truncated?: boolean }
      return { header: `${value.title ?? ""} — ${value.url ?? ""}`, entries: browserEntries(value.items ?? []),
        text: value.text, complete: value.truncated !== true }
    },
    act: async (entry, args) => {
      const verb = String(args.do ?? "click")
      if (!entry && (verb === "click" || verb === "type")) return `Error: ${verb} needs the ref (or name and role) of the control`
      if (verb === "click") return ok(await rpc("click", { ref: entry!.ref }))
      if (verb === "type") return ok(await rpc("type", { ref: entry!.ref, text: String(args.text ?? "") }))
      if (verb === "scroll") return ok(await rpc("scroll", { direction: args.direction ?? "down" }))
      if (verb === "keys") {
        const key = String(args.keys ?? "")
        await rpc("keyboard", { type: "keyDown", key })
        return ok(await rpc("keyboard", { type: "keyUp", key }))
      }
      return `Error: unknown do "${verb}"; use click, type, keys or scroll`
    },
    navigate: async (args) => typeof args.address === "string"
      ? ok(await rpc("navigate", { address: args.address }))
      : ok(await rpc("go", { command: args.command ?? "reload" })),
  }
}

type BrowserItem = { ref: number; role?: string; name?: string; href?: string; parentRef?: number | null; actionable?: boolean;
  visible?: boolean; disabled?: boolean; checked?: boolean | string; selected?: boolean; expanded?: boolean; value?: string }

function browserEntries(items: BrowserItem[]) {
  const depth = new Map<number, number>()
  return items.map((item): Entry => {
    const level = item.parentRef == null ? 0 : (depth.get(item.parentRef) ?? -1) + 1
    depth.set(item.ref, level)
    const states = [item.disabled && "disabled", item.checked === true && "checked", item.selected && "selected",
      item.expanded === true && "expanded", item.expanded === false && "collapsed", item.visible === false && "offscreen"].filter(Boolean)
    const role = item.role ?? "generic"
    const name = (item.name ?? "").replace(/\s+/g, " ").trim().slice(0, 160)
    const label = `${role}${name ? ` "${name}"` : ""}${item.value ? ` value="${item.value.slice(0, 80)}"` : ""}`
      + `${states.length ? ` [${states.join(", ")}]` : ""}${item.href && role === "link" ? ` -> ${item.href.slice(0, 80)}` : ""}`
    return { key: String(item.ref), ref: item.ref, label, line: `${label} [${item.ref}]`, depth: Math.max(level, 0), role, name,
      parent: item.parentRef ?? undefined, target: item.ref }
  })
}

// Linux refs (n:...) expire on every observation, so the outline numbers its own lines and acting resolves a line to
// the target {name, role} the ui_* verbs locate afresh.
function linuxApp(port: Transport): App {
  const hooks = createAppDockHooks(port).tool!
  const invoke = async (tool: string, args: Record<string, unknown>) => {
    const context = { sessionID: "dock-mcp", messageID: "dock-mcp", agent: "", agentID: "", directory: "", worktree: "",
      abort: AbortSignal.timeout(ACT_MS), metadata: () => {}, ask: () => Promise.resolve() } as unknown as ToolContext
    // A frozen app or a wedged display must answer, not leave the model waiting on a call that never returns.
    const result = await Promise.race([hooks[tool]!.execute(args as never, context), Bun.sleep(ACT_MS).then(() => undefined)])
    if (result === undefined)
      return `Error: the workspace gave no answer in ${ACT_MS / 1000}s; the app may be frozen or its window gone. look shows the current state.`
    const text = typeof result === "string" ? result : result.output
    // ui_* answer a failure as JSON carrying code and outcome (see toolError in app-dock.ts).
    const parsed = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text))
    const failed = typeof parsed === "object" && parsed !== null && "code" in parsed && "outcome" in parsed
    return failed ? `Error: ${text}` : text.slice(0, 600)
  }
  return {
    snapshot: () => serial(async () => linuxEntries(await readAll(port))),
    act: async (entry, args) => {
      const verb = String(args.do ?? "click")
      // An unnamed control (an editor's text view) cannot be located by name; typing and keys reach it through focus.
      if (!entry?.name) {
        if (entry && !/\bfocused\b/.test(entry.label))
          return `Error: that control has no name to locate it by and does not have focus; move focus into it (click a named neighbour, or keys Tab), then act with do ${verb === "click" ? "keys" : verb} and no ref`
        if (verb === "type") return invoke("ui_type", { text: String(args.text ?? "") })
        if (verb === "keys") return invoke("ui_keys", { keys: String(args.keys ?? "") })
        if (verb === "scroll") return invoke("ui_keys", { keys: args.direction === "up" ? "Page_Up" : "Page_Down" })
        if (verb === "click") return entry ? "Error: that control has no name to click it by; it already has focus, so type or send keys to it" : "Error: click needs the ref (or name and role) of the control"
        return `Error: unknown do "${verb}"; use click, type, keys or scroll`
      }
      const target = { name: entry.name, role: entry.role }
      if (verb === "click") return invoke("ui_act", { target, ...(typeof args.action === "string" ? { action: args.action } : {}) })
      if (verb === "type") return invoke("ui_type", { target, text: String(args.text ?? "") })
      if (verb === "keys") return invoke("ui_keys", { target, keys: String(args.keys ?? "") })
      if (verb === "scroll") return invoke("ui_keys", { target, keys: args.direction === "up" ? "Page_Up" : "Page_Down" })
      return `Error: unknown do "${verb}"; use click, type, keys or scroll`
    },
  }
}

// Reads of the workspace share one AT-SPI cursor; two at once would expire each other's cursor.
let queue = Promise.resolve() as Promise<unknown>
function serial<T>(work: () => Promise<T>) {
  const next = queue.then(work, work)
  queue = next.catch(() => {})
  return next
}

async function readAll(port: Transport, restarts = 0): Promise<{ items: AppDockOutline.Item[]; complete: boolean }> {
  const page = (cursor?: string) => request(port, "read", { world: "linux", budget: 500, maxText: 0, ...(cursor ? { cursor } : {}) },
    AbortSignal.timeout(15_000), 15_000) as Promise<{ items?: AppDockOutline.Item[]; hasMore?: boolean; cursor?: string;
      coverage?: { complete?: boolean } }>
  const collect = async (items: AppDockOutline.Item[], cursor: string | undefined, pages: number): Promise<{ items: AppDockOutline.Item[]; complete: boolean }> => {
    const value = await page(cursor)
    const all = [...items, ...(value.items ?? [])]
    if (!value.hasMore || !value.cursor || pages >= 48) return { items: all, complete: value.coverage?.complete !== false && !value.hasMore }
    return collect(all, value.cursor, pages + 1)
  }
  return collect([], undefined, 1).catch((error: unknown) => {
    if (restarts < 2 && typeof error === "object" && error !== null && (error as { code?: string }).code === "cursor-stale")
      return readAll(port, restarts + 1)
    throw error
  })
}

function linuxEntries(read: { items: AppDockOutline.Item[]; complete: boolean }): Snapshot {
  const roots = AppDockOutline.tree(read.items)
  const shown = new Set(AppDockOutline.visible(roots))
  const entries: Entry[] = []
  // A node's key is its path of role, name and which same-shaped sibling it is, so a row inserted above it does not
  // make the whole list look changed.
  const seen = new Map<string, number>()
  // Unnamed, inert wrappers carry no meaning for a reader; their children move up a level. An editable node (an
  // editor's text view has no name and no actions) is a target, not a wrapper.
  const visit = (node: AppDockOutline.Node, depth: number, path: string, parent?: number) => {
    if (!shown.has(node)) return
    const inert = !node.name && !(Array.isArray(node.item.actions) && node.item.actions.length > 0) && node.role !== "heading"
      && !node.item.states?.includes(7)
    if (inert && node.parent) return node.children.forEach((child) => visit(child, depth, path, parent))
    const shape = `${path}/${node.role}|${node.name}`
    const occurrence = seen.get(shape) ?? 0
    seen.set(shape, occurrence + 1)
    const key = `${shape}#${occurrence}`
    const ref = entries.length + 1
    const label = AppDockOutline.line(node)
    entries.push({ key, ref, label, line: `${label} [${ref}]`, depth, role: node.role, name: node.name, parent })
    node.children.forEach((child) => visit(child, depth + 1, key, ref))
  }
  roots.forEach((root) => visit(root, 0, ""))
  return { header: "Linux workspace", entries, complete: read.complete }
}

function look(snapshot: Snapshot, scope?: number): string {
  const start = scope === undefined ? 0 : snapshot.entries.findIndex((entry) => entry.ref === scope)
  // Models guess refs or reuse them after the page changed; the whole outline answers better than an error.
  if (start < 0) return `no line [${scope}] in the current outline; here is all of it\n${look(snapshot)}`
  const base = snapshot.entries[start]?.depth ?? 0
  const end = scope === undefined ? snapshot.entries.length
    : snapshot.entries.findIndex((entry, index) => index > start && entry.depth <= base)
  const lines = snapshot.entries.slice(start, end < 0 ? undefined : end).map((entry) => `${"  ".repeat(entry.depth - base)}${entry.line}`)
  const body = lines.reduce((text, line) => (text.length + line.length < LOOK_LIMIT ? `${text}${line}\n` : text), "")
  const cut = body.split("\n").length - 1 < lines.length
  return [snapshot.header, body.trimEnd(),
    cut && `… outline cut at ${LOOK_LIMIT} characters: look with scope=<ref> of a region to see the rest`,
    !snapshot.complete && "(the interface reported a partial tree; some of it may be missing)"].filter(Boolean).join("\n")
}

function find(snapshot: Snapshot, query: string, role?: string) {
  const wanted = query.toLowerCase()
  const byRef = new Map(snapshot.entries.map((entry) => [entry.ref, entry]))
  const crumbs = (entry: Entry, left = 3): string[] => {
    const parent = entry.parent === undefined ? undefined : byRef.get(entry.parent)
    return parent && left > 0 ? [...crumbs(parent, left - 1), parent.label] : []
  }
  const matches = snapshot.entries.filter((entry) => (!wanted || entry.label.toLowerCase().includes(wanted))
    && (!role || entry.role.toLowerCase().includes(role.toLowerCase())))
  if (matches.length === 0) return `Nothing matches${query ? ` "${query}"` : ""}${role ? ` with role ${role}` : ""}.`
  return [...matches.slice(0, 30).map((entry) => [...crumbs(entry), entry.line].join(" › ")),
    matches.length > 30 && `… ${matches.length - 30} more; narrow the query or add a role`].filter(Boolean).join("\n")
}

function pick(snapshot: Snapshot, args: Record<string, unknown>) {
  if (typeof args.ref === "number") {
    const entry = snapshot.entries.find((candidate) => candidate.ref === args.ref)
    if (!entry) throw new Error(`no line [${args.ref}] in the last outline; look again`)
    return entry
  }
  const name = typeof args.name === "string" ? args.name.trim().toLowerCase() : ""
  const role = typeof args.role === "string" ? args.role.toLowerCase() : ""
  const matches = snapshot.entries.filter((entry) => (!name || entry.name.toLowerCase().includes(name))
    && (!role || entry.role.toLowerCase().includes(role)))
  const exact = matches.filter((entry) => entry.name.trim().toLowerCase() === name)
  const chosen = exact.length === 1 ? exact : matches
  if (chosen.length === 1) return chosen[0]!
  if (chosen.length === 0) throw new Error(`nothing matches name "${args.name ?? ""}"${role ? ` role ${role}` : ""}; use find`)
  throw new Error(`${chosen.length} controls match; pass ref, one of: ${chosen.slice(0, 8).map((entry) => entry.line).join("; ")}`)
}

const same = (a: Snapshot, b: Snapshot) => a.header === b.header && a.entries.length === b.entries.length
  && a.entries.every((entry, index) => entry.key === b.entries[index]!.key && entry.label === b.entries[index]!.label)

function diff(before: Snapshot, after: Snapshot) {
  const old = new Map(before.entries.map((entry) => [entry.key, entry]))
  const now = new Map(after.entries.map((entry) => [entry.key, entry]))
  const appeared = after.entries.filter((entry) => !old.has(entry.key))
  const gone = before.entries.filter((entry) => !now.has(entry.key))
  const changed = after.entries.filter((entry) => old.has(entry.key) && old.get(entry.key)!.label !== entry.label)
  const focus = after.entries.find((entry) => /\bfocused\b/.test(entry.label))
  const section = (title: string, list: string[], cap: number) =>
    list.length ? [`${title}:`, ...list.slice(0, cap), ...(list.length > cap ? [`  … ${list.length - cap} more (look to see all)`] : [])] : []
  const lines = [
    ...(before.header !== after.header ? [`now: ${after.header}`] : []),
    ...(focus ? [`focus: ${focus.line}`] : []),
    ...section("appeared", appeared.map((entry) => `+ ${entry.line}`), 40),
    ...section("gone", gone.map((entry) => `- ${entry.label}`), 20),
    ...section("changed", changed.map((entry) => `~ ${old.get(entry.key)!.label} => ${entry.line}`), 20),
  ]
  if (appeared.length + gone.length + changed.length === 0 && before.header === after.header)
    return "no visible change in the outline (the action may still be running; wait or look)"
  return lines.join("\n")
}

function tools(where: string, workspace: boolean) {
  const ref = { type: "integer", description: "The [n] number at the end of a line from look or find" }
  return [
    { name: "look", description: `See ${where} without a screenshot: every visible control as an indented outline, one line per control — role, "name", states and its [ref]. Indentation is the hierarchy (window > region > control). Start here; after acting, act's own answer says what changed.`,
      inputSchema: { type: "object", properties: {
        scope: { ...ref, description: "Show only the subtree under one line: its [n] from your latest look or find (refs change when the page does)" },
        ...(workspace ? {} : { text: { type: "boolean", description: "Also return the page's visible text" } }) } } },
    { name: "find", description: `Search ${where} by text and/or role. Each match shows where it sits (its last regions › the control) and its [ref].`,
      inputSchema: { type: "object", properties: { query: { type: "string", description: "Case-insensitive text in the role, name or value" },
        role: { type: "string", description: "Role such as button, link, textbox, push button, entry, menu item" } } } },
    { name: "act", description: `Act on ${where} by ref (or by name and role) and get back what changed: focus, lines that appeared, went away or changed. do: click (default), type (replace a field's text), keys (e.g. Enter, Escape${workspace ? ", ctrl+s" : ""}), scroll.${workspace ? " With no ref, type and keys go to the control that has focus, such as an editor's unnamed text view; type then adds the text at the cursor." : ""}`,
      inputSchema: { type: "object", properties: { ref, name: { type: "string" }, role: { type: "string" },
        do: { type: "string", enum: ["click", "type", "keys", "scroll"] }, text: { type: "string", description: "Text for do=type" },
        keys: { type: "string", description: workspace ? "Key combination for do=keys, e.g. Return, Escape, ctrl+comma" : "One key for do=keys, e.g. Enter, Tab, Escape, ArrowDown" },
        direction: { type: "string", enum: ["up", "down", ...(workspace ? [] : ["top", "bottom"])] },
        ...(workspace ? { action: { type: "string", description: "Action name when the control has several, e.g. press, activate" } } : {}) } } },
    { name: "wait", description: `Wait until text appears in ${where} (or goes away, with gone=true), up to timeoutMs (default 5000, at most 15000).`,
      inputSchema: { type: "object", properties: { text: { type: "string" }, gone: { type: "boolean" }, timeoutMs: { type: "integer" } }, required: ["text"] } },
    ...(workspace ? [
      { name: "apps", description: "List the apps installed in the Linux workspace, each with the id launch takes.",
        inputSchema: { type: "object", properties: {} } },
      { name: "launch", description: "Open an app in the Linux workspace (or bring its window forward if it is already open) and get back what changed. Take the id from apps.",
        inputSchema: { type: "object", properties: { id: { type: "string", description: "An id from apps, e.g. org.gnome.TextEditor.desktop" } }, required: ["id"] } },
    ] : [{ name: "navigate", description: `Open an address in ${where}, or go back, forward or reload; answers with what changed.`,
      inputSchema: { type: "object", properties: { address: { type: "string", description: "https:// URL, bare domain or search words" },
        command: { type: "string", enum: ["back", "forward", "reload"] } } } }]),
  ]
}
