import type { Plugin, PluginInput, Hooks, ToolContext } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"

type ParentPortLike = {
  postMessage(message: unknown): void
  on(event: "message", listener: (event: { data: unknown }) => void): void
}

type Pending = {
  native: boolean
  target?: Record<string, unknown>
  aborted: boolean
  cancel(): void
  finish(error?: Error, value?: unknown): void
}

const pending = new WeakMap<ParentPortLike, Map<string, Pending>>()
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

class NativeRPCError extends Error {
  readonly backend = "linux-atspi"
  constructor(readonly code: string, message: string, readonly outcome: "not-dispatched" | "unknown",
    readonly result?: unknown, readonly target?: Record<string, unknown>, readonly cleanup?: Readonly<{ code: string; outcome: "unknown" }>) {
    super(message)
  }
}

const routerFor = (port: ParentPortLike) => {
  const existing = pending.get(port)
  if (existing) return existing
  const router = new Map<string, Pending>()
  port.on("message", (event: { data: unknown }) => {
    const payload = event.data
    if (!object(payload) || typeof payload.id !== "string") return
    const entry = router.get(payload.id)
    if (!entry) return
    if (payload.type === "dock.rpc.native-pending") {
      if (payload.backend === "linux-atspi" && payload.scopeKind === "workspace") entry.native = true
      return
    }
    if (payload.type === "dock.rpc.native-admitted") {
      if (!object(payload.target) || entry.target !== undefined) return
      entry.native = true
      entry.target = Object.freeze({ ...payload.target })
      // Abort may precede the host's target capture. Repeat cancellation once capture is known.
      if (entry.aborted) entry.cancel()
      return
    }
    if (payload.type !== "dock.rpc.result" || typeof payload.ok !== "boolean") return
    if (payload.ok) {
      entry.finish(undefined, payload.value)
      return
    }
    const error = object(payload.error) ? payload.error : {}
    const message = typeof error.message === "string" ? error.message : "App Dock request failed"
    entry.finish(entry.native || error.backend === "linux-atspi"
      ? new NativeRPCError(typeof error.code === "string" ? error.code : "native-error", message,
        error.outcome === "not-dispatched" ? "not-dispatched" : "unknown", error.result, entry.target, cleanupEvidence(error.cleanup))
      : new Error(message))
  })
  pending.set(port, router)
  return router
}

function request(port: ParentPortLike, op: string, args: Record<string, unknown>, signal: AbortSignal, timeoutMs: number): Promise<unknown> {
  const id = randomUUID()
  const router = routerFor(port)
  const native = op === "action" || (typeof args.ref === "string" && args.ref.startsWith("n:"))
    || args.rootRef !== undefined || args.cursor !== undefined || args.textOffset !== undefined
    // dock_read's mode is the browser tree shape; only action/type modes are native input policy.
    || ((op === "action" || op === "type") && args.mode !== undefined)
  if (router.size >= 32) return Promise.reject(native
    ? new NativeRPCError("capacity", "App Dock request capacity exhausted", "not-dispatched")
    : new Error("App Dock request capacity exhausted"))
  return new Promise((resolve, reject) => {
    const entry: Pending = {
      native, aborted: signal?.aborted ?? false,
      cancel: () => {
        try {
          port.postMessage({ type: "dock.rpc.cancel", id })
        } catch (error) {
          entry.finish(entry.native
            ? new NativeRPCError("transport-error", toolErrorMessage(error), "unknown", undefined, entry.target)
            : new Error(toolErrorMessage(error)))
        }
      },
      finish: (error, value) => {
        if (router.get(id) !== entry) return
        router.delete(id)
        clearTimeout(timer)
        signal?.removeEventListener("abort", abort)
        if (error) reject(error)
        else resolve(value)
      },
    }
    const abort = () => {
      entry.aborted = true
      entry.cancel()
    }
    const timer = setTimeout(() => {
      entry.finish(entry.native
        ? new NativeRPCError("transport-timeout", `App Dock ${op} request timed out`, "unknown", undefined, entry.target)
        : new Error(`App Dock ${op} request timed out`))
      if (entry.native) entry.cancel()
    }, timeoutMs)
    router.set(id, entry)
    signal?.addEventListener("abort", abort, { once: true })
    try {
      port.postMessage({ type: "dock.rpc", id, op, args })
      if (entry.aborted && router.get(id) === entry) entry.cancel()
    } catch (error) {
      entry.finish(entry.native
        ? new NativeRPCError("transport-error", toolErrorMessage(error), "unknown", undefined, entry.target)
        : new Error(toolErrorMessage(error)))
    }
  })
}

const parentPort = (): ParentPortLike | undefined =>
  (process as typeof process & { parentPort?: ParentPortLike }).parentPort

const toolErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))
const toolError = (error: unknown) => error instanceof NativeRPCError
  ? toJSON({ backend: error.backend, code: error.code, message: error.message, outcome: error.outcome,
    ...(error.result === undefined ? {} : { result: error.result }), ...(error.target === undefined ? {} : { target: error.target }),
    ...(error.cleanup === undefined ? {} : { cleanup: error.cleanup }) })
  : toolErrorMessage(error)

function cleanupEvidence(value: unknown) {
  if (value === undefined) return
  const code = object(value) ? value.code : undefined
  return Object.freeze({ code: typeof code === "string" && code.length > 0 && code.length <= 256 && !/[^A-Za-z0-9_-]/.test(code)
    ? code : "native-cleanup-failed", outcome: "unknown" as const })
}

const toJSON = (value: unknown) => JSON.stringify(value, null, 2)
const invoke = (context: ToolContext, port: ParentPortLike, op: string, args: Record<string, unknown>, timeoutMs: number,
  clock?: Clock) => {
  const asked = Date.now()
  return context
    .ask({ permission: "dock", patterns: [op], always: [op], metadata: { operation: op } })
    .then(() => {
      // Time spent waiting for the user's permission answer does not count against a tool-call deadline.
      if (clock) clock.deadline += Date.now() - asked
      return request(port, op, args, context.abort, timeoutMs)
    })
}

type NativeQuery = { name: string; role?: string; capability?: "action" | "observedAction" | "type" | "keyboardType"; maxText?: number }
type NativeItem = Record<string, unknown> & { ref: string; name: string; roleName: string }
// occurrence counts earlier matches with the same name and roleName on the same page, and index is the item's position
// on that page, so a rescan can re-identify the control.
type NativeMatch = { item: NativeItem; page: number; index: number; occurrence: number }
type NativeScan = { found: NativeMatch[]; pages: number; more: boolean; complete: boolean; reasons: unknown; restarts?: number }
// One per tool call: an epoch-ms deadline that permission prompts push back.
type Clock = { deadline: number }

// Bounds one scan at 48 helper pages (~6000 controls); each page is still one bounded native request.
const MAX_FIND_PAGES = 48
// Bounds all scans, restarts and retries of one dock_find/dock_action/dock_type call; nothing is dispatched after it.
const FIND_DEADLINE_MS = 90000
// AT-SPI state numbers that change what a model can do with a control.
const STATES: Record<number, string> = { 4: "checked", 7: "editable", 10: "expanded", 12: "focused", 16: "modal", 20: "pressed", 23: "selected" }

function nativePage(value: unknown) {
  if (!object(value) || value.backend !== "linux-atspi" || !Array.isArray(value.items) || !object(value.coverage))
    throw new NativeRPCError("unsupported-backend", "Search runs on the native Linux workspace; use dock_read for browser pages", "not-dispatched")
  return value as { items: unknown[]; hasMore?: boolean; cursor?: unknown; coverage: { complete?: unknown; reasons?: unknown } }
}

function matches(item: unknown, query: NativeQuery): item is NativeItem {
  if (!object(item) || typeof item.ref !== "string" || typeof item.name !== "string" || typeof item.roleName !== "string") return false
  const name = query.name.trim().toLowerCase()
  if (name.length === 0 || !item.name.toLowerCase().includes(name)) return false
  return fits(item as NativeItem, query)
}

// Toolkits and models spell roles differently ("check-box", "checkbox", "check box"), so only letters and digits count.
const roleKey = (role: string) => role.toLowerCase().replace(/[^a-z0-9]/g, "")

function fits(item: NativeItem, query: NativeQuery) {
  if (query.role !== undefined && roleKey(item.roleName) !== roleKey(query.role)) return false
  return query.capability === undefined || supports(item, query.capability)
}

function supports(item: NativeItem, capability: string) {
  const entry = object(item.capabilities) ? item.capabilities[capability] : undefined
  return object(entry) && entry.supported === true
}

// A target that names real controls but excludes them by role or input mode must say so, or models keep guessing.
function missed(scan: NativeScan, query: NativeQuery) {
  if (scan.found.length === 0) return compactScan(scan, "target-not-found")
  const items = scan.found.map((match) => match.item)
  const roles = [...new Set(items.map((item) => item.roleName))]
  const hints = [
    ...(query.role !== undefined && !items.some((item) => roleKey(item.roleName) === roleKey(query.role!))
      ? [`No control with this name has role "${query.role}"; roles found: ${roles.join(", ")}`] : []),
    ...(query.capability === "action" && items.some((item) => supports(item, "observedAction"))
      ? ['Controls with this name only support observed actions; retry with mode: "observed"'] : []),
    ...(query.capability === "type" && items.some((item) => supports(item, "keyboardType"))
      ? ['Fields with this name only accept keyboard input; retry with mode: "keyboard"'] : []),
  ]
  return toJSON({ code: "target-not-found", outcome: "not-dispatched", found: 0, nameMatches: items.length,
    ...(hints.length ? { hints } : {}), nearMisses: items.slice(0, 10).map(compactItem) })
}

const only = (scan: NativeScan, query: NativeQuery): NativeScan => ({ ...scan, found: scan.found.filter((match) => fits(match.item, query)) })

function compactItem(item: NativeItem) {
  const capabilities = object(item.capabilities) ? item.capabilities : {}
  return {
    ref: item.ref,
    role: item.roleName,
    name: item.name,
    ...(Array.isArray(item.states) ? { states: item.states.flatMap((state) => (STATES[Number(state)] ? [STATES[Number(state)]] : [])) } : {}),
    ...(Array.isArray(item.actions) && item.actions.length ? { actions: item.actions } : {}),
    can: Object.keys(capabilities).filter((key) => object(capabilities[key]) && capabilities[key].supported === true),
    ...(typeof item.text === "string" && item.text ? { text: item.text } : {}),
  }
}

const compactScan = (scan: NativeScan, code?: string) => toJSON({
  ...(code ? { code, outcome: "not-dispatched" } : {}),
  found: scan.found.length, pagesScanned: scan.pages, restarts: scan.restarts ?? 0,
  ...(scan.found.length === 0 || code === "target-search-incomplete" ? { searchComplete: scan.complete, reasons: scan.reasons }
    : scan.more ? { searchComplete: false } : scan.complete ? {} : { searchComplete: false, reasons: scan.reasons }),
  items: scan.found.slice(0, 20).map((match) => compactItem(match.item)),
})

// The tool-call deadline marks the scan incomplete so callers refuse instead of acting on a partial view.
const expired = (scan: NativeScan) =>
  ({ ...scan, complete: false, reasons: [...(Array.isArray(scan.reasons) ? scan.reasons : []), "tool-deadline"] })

// Names are substring-matched, so "Open" also hits "Open Quick Access": a single match wins, else a unique exact name.
function pick(scan: NativeScan, query: NativeQuery) {
  const exact = scan.found.filter((match) => match.item.name.trim().toLowerCase() === query.name.trim().toLowerCase())
  if (scan.found.length === 1) return scan.found[0]
  if (exact.length === 1) return exact[0]
  return undefined
}

// findDeadlineMs is a test seam; production keeps the 90 s default.
export function createAppDockHooks(port: ParentPortLike, config: { timeoutMs?: number; findDeadlineMs?: number } = {}): Hooks {
  const timeoutMs = config.timeoutMs ?? 15000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw new Error("Invalid App Dock timeout")
  const findDeadlineMs = config.findDeadlineMs ?? FIND_DEADLINE_MS
  if (!Number.isSafeInteger(findDeadlineMs) || findDeadlineMs < 0 || findDeadlineMs > FIND_DEADLINE_MS)
    throw new Error("Invalid App Dock find deadline")
  const call = (context: ToolContext, op: string, args: Record<string, unknown>, clock?: Clock) =>
    invoke(context, port, op, args, timeoutMs, clock)
  const ref = tool.schema.union([tool.schema.number().min(1), tool.schema.string().min(3).max(256).startsWith("n:")])
  const target = tool.schema.object({
    name: tool.schema.string().min(1).max(256).describe("Case-insensitive substring of the control's accessible name; when several controls contain it, the one whose whole name equals it wins"),
    role: tool.schema.string().min(1).max(64).optional().describe("Exact roleName from dock_find/dock_read, e.g. push-button, entry"),
  })

  // A model turn takes far longer than a native continuation lives, so the tool,
  // not the model, pages: each page is requested immediately after the previous one.
  // Every native request keeps its own limits; only read-only scans are restarted. `until` stops the scan early,
  // and the clock (one per tool call) stops paging and restarts.
  const find = (context: ToolContext, query: NativeQuery, until: (scan: NativeScan) => boolean, clock: Clock,
    restarts = 0): Promise<NativeScan> =>
    scan(context, query, until, clock, call(context, "read", { budget: 500, maxText: query.maxText ?? 0 }, clock),
      { found: [], pages: 0, more: true, complete: false, reasons: [] }).catch((error: unknown) => {
      if (!(error instanceof NativeRPCError) || !["cursor-stale", "stale-ref"].includes(error.code) || restarts >= 2
        || Date.now() >= clock.deadline) throw error
      return find(context, query, until, clock, restarts + 1)
    }).then((result) => ({ ...result, restarts: result.restarts ?? restarts }))
  const scan = async (context: ToolContext, query: NativeQuery, until: (scan: NativeScan) => boolean, clock: Clock,
    next: Promise<unknown>, previous: NativeScan): Promise<NativeScan> => {
    const page = nativePage(await next)
    const pages = previous.pages + 1
    const matched = page.items.flatMap((item, index) => (matches(item, query) ? [{ item, index }] : []))
    const more = page.hasMore === true
    // Cursors carry earlier pages' partial reasons, so the final page's coverage describes the whole traversal.
    const result = { pages, more, complete: !more && page.coverage.complete === true, reasons: page.coverage.reasons,
      found: [...previous.found, ...matched.map((match, position) => ({ item: match.item, page: pages, index: match.index,
        occurrence: matched.slice(0, position).filter((other) => other.item.name === match.item.name
          && other.item.roleName === match.item.roleName).length }))] }
    if (until(result) || !more || typeof page.cursor !== "string" || pages >= MAX_FIND_PAGES) return result
    if (Date.now() >= clock.deadline) return expired(result)
    return scan(context, query, until, clock, call(context, "read", { cursor: page.cursor }, clock), result)
  }
  // Locate and mutate within one tool call so UI churn between model turns cannot stale the ref.
  // Uniqueness is decided over the whole tree, then a second whole-tree scan must pick the same control by the same
  // rule and supplies a current ref. Only a certainly-undispatched stale target is located again; unknown outcomes are
  // never replayed.
  const act = async (context: ToolContext, query: NativeQuery, run: (item: NativeItem, clock: Clock) => Promise<unknown> | string,
    clock: Clock, attempt = 0): Promise<unknown> => {
    // Scans match by name only; role and input mode filter afterwards so a miss can report what it excluded.
    const loose = { name: query.name, maxText: query.maxText }
    const named = await find(context, loose, () => false, clock)
    const all = only(named, query)
    // A provider error or skipped subtree can end a traversal without more pages, so uniqueness needs full coverage.
    if (!all.complete) return compactScan(all, "target-search-incomplete")
    const winner = pick(all, query)
    if (winner === undefined) return all.found.length === 0 ? missed(named, query) : compactScan(all, "target-ambiguous")
    const fresh = only(await find(context, loose, () => false, clock), query)
    if (Date.now() >= clock.deadline) return compactScan(expired(all), "target-search-incomplete")
    if (!fresh.complete) return compactScan(fresh, "target-search-incomplete")
    const current = pick(fresh, query)
    // A homonym surfacing on any page between the scans leaves no single pick; a moved position or tree depth means
    // the tree no longer has the shape the winner was chosen from.
    if (current === undefined || current.page !== winner.page || current.index !== winner.index
      || current.occurrence !== winner.occurrence || current.item.name !== winner.item.name
      || current.item.roleName !== winner.item.roleName || current.item.depth !== winner.item.depth
      || current.item.scopeDepth !== winner.item.scopeDepth)
      return toJSON({ code: "target-changed", outcome: "not-dispatched", item: compactItem(winner.item) })
    return Promise.resolve(run(current.item, clock)).catch((error: unknown) => {
      if (!(error instanceof NativeRPCError) || error.code !== "stale-ref" || error.outcome !== "not-dispatched" || attempt >= 1) throw error
      return act(context, query, run, clock, attempt + 1)
    })
  }
  return {
    tool: {
      dock_list: tool({
        description:
          "List App Dock tabs and their current state (url, title, loading, audible, active).",
        args: {},
        execute: (_args, context) => call(context, "list", {}).then(toJSON, toolError),
      }),
      dock_activate: tool({
        description: "Activate one App Dock tab by tabID from dock_open or dock_list.",
        args: { tabID: tool.schema.string().min(1) },
        execute: (args, context) => call(context, "activate", { tabID: args.tabID }).then(toJSON, toolError),
      }),
      dock_read: tool({
        description:
          "Read the App Dock browser page or bound native app as a structured accessibility snapshot. Browser refs are numeric; native refs are opaque n: strings. Use refs with dock_click / dock_action / dock_type. Re-read after changes; native observations are non-atomic and refs may expire. Browser pages return a semantic tree where every item carries a stable numeric `ref`, a revalidatable semantic `path`, `parentRef`/`children`, `actionable` and `visible`; a `path` is a selector to revalidate, not a durable identity, so re-read and report ambiguity instead of assuming the first match. Browser-only mode/format/actionable/visible shape the tree (mode=skeleton or a11y omits geometry; format=tree adds `treeText`, format=csv adds `csv`) and are rejected on a native binding. Native-only rootRef, cursor and textOffset select a bounded read page; native cursors expire within seconds, so prefer dock_find to locate native controls.",
        args: {
          budget: tool.schema.number().min(1).max(500).optional().describe(
            "Maximum interactive elements to return (default 100)",
          ),
          maxText: tool.schema.number().min(0).max(20000).optional().describe(
            "Maximum page text characters to return (default 1500)",
          ),
          rootRef: tool.schema.string().min(3).max(256).startsWith("n:").optional().describe("Native subtree ref"),
          cursor: tool.schema.string().min(1).max(256).optional().describe("Native continuation cursor from dock_read"),
          textOffset: tool.schema.number().int().min(0).optional().describe("Native text character offset"),
          mode: tool.schema.enum(["full", "a11y", "skeleton"]).optional().describe(
            "Browser only: full keeps x/y/width/height (default); a11y and skeleton omit geometry",
          ),
          format: tool.schema.enum(["json", "tree", "csv"]).optional().describe(
            "Browser only: json (default) returns items; tree adds indented treeText; csv adds a flat csv table",
          ),
          actionable: tool.schema.boolean().optional().describe(
            "Browser only: keep actionable controls plus the context ancestors that keep parentRef/children closed",
          ),
          visible: tool.schema.boolean().optional().describe(
            "Browser only: keep currently visible nodes plus their context ancestors",
          ),
        },
        execute: (args, context) =>
          call(context, "read", { budget: args.budget, maxText: args.maxText,
            ...(args.rootRef === undefined ? {} : { rootRef: args.rootRef }),
            ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
            ...(args.textOffset === undefined ? {} : { textOffset: args.textOffset }),
            ...(args.mode === undefined ? {} : { mode: args.mode }),
            ...(args.format === undefined ? {} : { format: args.format }),
            ...(args.actionable === undefined ? {} : { actionable: args.actionable }),
            ...(args.visible === undefined ? {} : { visible: args.visible }) }).then(toJSON, toolError),
      }),
      dock_find: tool({
        description:
          "Find controls in the native Linux workspace by accessible name (case-insensitive substring) and optional roleName. The tool pages the accessibility tree itself and returns compact matches from the first page that has any, with refs usable immediately by dock_action/dock_type; searchComplete:false means part of the tree was not searched (later pages, or subtrees listed in reasons). Prefer dock_action/dock_type with `target` to locate and act in one call, because native refs expire when the app changes.",
        args: {
          name: tool.schema.string().min(1).max(256).describe("Case-insensitive substring of the accessible name"),
          role: tool.schema.string().min(1).max(64).optional().describe("Exact roleName, e.g. push-button, entry, check-box"),
          includeText: tool.schema.boolean().optional().describe("Also return each match's current text (default false)"),
        },
        execute: (args, context) =>
          find(context, { name: args.name, role: args.role, ...(args.includeText ? { maxText: 2000 } : {}) }, (scan) => scan.found.length > 0,
            { deadline: Date.now() + findDeadlineMs }).then((result) => compactScan(result), toolError),
      }),
      dock_wait: tool({
        description: "Wait for a bounded duration in the active App Dock tab. Native wait is a cancellable delay, not proof of application readiness.",
        args: {
          milliseconds: tool.schema.number().min(0).max(10000).optional().describe("Wait duration in milliseconds"),
        },
        execute: (args, context) =>
          call(context, "wait", { milliseconds: args.milliseconds }).then(toJSON, toolError),
      }),
      dock_screenshot: tool({
        description: "Capture the active App Dock tab as a base64 PNG.",
        args: {},
        execute: (_args, context) => call(context, "screenshot", {}).then(toJSON, toolError),
      }),
      dock_scroll: tool({
        description: "Scroll the active App Dock tab.",
        args: {
          direction: tool.schema.enum(["up", "down", "top", "bottom"]),
          amount: tool.schema.number().min(1).max(10000).optional(),
        },
        execute: (args, context) =>
          call(context, "scroll", { direction: args.direction, amount: args.amount }).then(toJSON, toolError),
      }),
      dock_keyboard: tool({
        description: "Dispatch a keyDown or keyUp event to the active App Dock tab.",
        args: {
          type: tool.schema.enum(["keyDown", "keyUp"]),
          key: tool.schema.string().min(1),
        },
        execute: (args, context) =>
          call(context, "keyboard", { type: args.type, key: args.key }).then(toJSON, toolError),
      }),
      dock_evaluate: tool({
        description: "Evaluate JavaScript in the active App Dock tab.",
        args: { script: tool.schema.string().min(1) },
        execute: (args, context) => call(context, "evaluate", { script: args.script }).then(toJSON, toolError),
      }),
      dock_storage: tool({
        description: "Read one localStorage or sessionStorage value from the active App Dock tab.",
        args: {
          storage: tool.schema.enum(["local", "session"]),
          key: tool.schema.string().min(1),
        },
        execute: (args, context) =>
          call(context, "storage", { storage: args.storage, key: args.key }).then(toJSON, toolError),
      }),
      dock_network: tool({
        description: "Install page-level fetch/XHR URL filtering for the active App Dock tab.",
        args: {
          blockUrls: tool.schema.array(tool.schema.string()).optional(),
          allowedOrigins: tool.schema.array(tool.schema.string()).optional(),
          blockMethods: tool.schema.array(tool.schema.string()).optional(),
          probeUrl: tool.schema.string().url().optional(),
          probeMethod: tool.schema.string().optional(),
        },
        execute: (args, context) => call(context, "network", args).then(toJSON, toolError),
      }),
      dock_click: tool({
        description: "Click an interactive App Dock element by `ref`, or click page coordinates when x and y are supplied.",
        args: {
          ref: ref.optional().describe("Browser numeric or native opaque element ref from dock_read"),
          x: tool.schema.number().min(0).optional().describe("Page x coordinate"),
          y: tool.schema.number().min(0).optional().describe("Page y coordinate"),
        },
        execute: (args, context) => {
          if (args.x !== undefined || args.y !== undefined) {
            if (args.x === undefined || args.y === undefined) return Promise.resolve("dock_click requires both x and y")
            return call(context, "clickAt", { x: args.x, y: args.y }).then(toJSON, toolError)
          }
          if (args.ref === undefined) return Promise.resolve("dock_click requires ref or both x and y")
          return call(context, "click", { ref: args.ref }).then(toJSON, toolError)
        },
      }),
      dock_action: tool({
        description: "Invoke an advertised native action, either by ref+actionID from dock_read/dock_find or by `target` (name/role) plus optional action name, which locates the control and acts in one call. Default mode requires a stable eligible control. Explicit observed mode permits eligible controls below virtual ancestry, revalidates the current control, and never proves durable logical-record identity. Both modes are non-atomic; acknowledgement does not prove task completion.",
        args: { ref: ref.optional().describe("Element ref from dock_read or dock_find"),
          actionID: tool.schema.string().min(1).max(256).optional().describe("actionID that belongs to ref"),
          target: target.optional().describe("Locate the control by name instead of ref"),
          action: tool.schema.string().min(1).max(256).optional().describe("With target: action name such as press or click; required when the control has several actions"),
          mode: tool.schema.enum(["stable", "observed"]).optional().describe("Native control identity policy (default stable)") },
        execute: (args, context) => {
          const mode = args.mode === undefined ? {} : { mode: args.mode }
          if (args.target === undefined) {
            if (args.ref === undefined || args.actionID === undefined) return Promise.resolve("dock_action with ref needs the actionID from that item's actions (dock_find/dock_read); or pass target {name, role} with an action name to locate and act in one call")
            return call(context, "action", { ref: args.ref, actionID: args.actionID, ...mode }).then(toJSON, toolError)
          }
          return act(context, { ...args.target, capability: args.mode === "observed" ? "observedAction" : "action" }, (item, clock) => {
            const actions = (Array.isArray(item.actions) ? item.actions : []).filter((entry): entry is { id: string; name: string } =>
              object(entry) && typeof entry.id === "string" && typeof entry.name === "string" && (args.action === undefined || entry.name === args.action))
            if (actions.length !== 1) return toJSON({ code: "action-ambiguous", outcome: "not-dispatched", item: compactItem(item),
              hint: `Pass action as one of: ${(Array.isArray(item.actions) ? item.actions : []).flatMap((entry) => object(entry) && typeof entry.name === "string" ? [entry.name] : []).join(", ") || "(none advertised)"}` })
            return call(context, "action", { ref: item.ref, actionID: actions[0]!.id, ...mode }, clock).then(toJSON)
          }, { deadline: Date.now() + findDeadlineMs }).then((value) => (typeof value === "string" ? value : toJSON(value)), toolError)
        },
      }),
      dock_type: tool({
        description: "Replace text in an editable App Dock element, by ref from dock_read/dock_find or by native `target` (name/role), which locates the field and types in one call. Native mode defaults to semantic EditableText replacement; keyboard mode must be explicit and never serves as an automatic fallback. Unicode and empty text are valid.",
        args: {
          ref: ref.optional().describe("Element ref from dock_read or dock_find"),
          target: target.optional().describe("Locate the native field by name instead of ref"),
          text: tool.schema.string().describe("Text to type into the element"),
          mode: tool.schema.enum(["editable", "keyboard"]).optional().describe("Native input method (default editable)"),
        },
        execute: (args, context) => {
          const mode = args.mode === undefined ? {} : { mode: args.mode }
          if (args.target === undefined) {
            if (args.ref === undefined) return Promise.resolve("dock_type requires ref or target")
            return call(context, "type", { ref: args.ref, text: args.text, ...mode }).then(toJSON, toolError)
          }
          return act(context, { ...args.target, capability: args.mode === "keyboard" ? "keyboardType" : "type" },
            (item, clock) => call(context, "type", { ref: item.ref, text: args.text, ...mode }, clock).then(toJSON),
            { deadline: Date.now() + findDeadlineMs })
            .then((value) => (typeof value === "string" ? value : toJSON(value)), toolError)
        },
      }),
      dock_navigate: tool({
        description: "Navigate the active App Dock tab to a new address (https:// URL or a plain search query).",
        args: {
          address: tool.schema.string().describe("URL to navigate to (https://...) or free-text search query"),
        },
        execute: (args, context) => call(context, "navigate", { address: args.address }).then(toJSON, toolError),
      }),
      dock_go: tool({
        description: "Go back, forward, or reload the active App Dock tab.",
        args: {
          command: tool.schema.enum(["back", "forward", "reload"]).describe("Navigation command"),
        },
        execute: (args, context) => call(context, "go", { command: args.command }).then(toJSON, toolError),
      }),
      dock_open: tool({
        description: "Open a new App Dock tab navigating to an address (https:// URL or a plain search query).",
        args: {
          address: tool.schema.string().describe("URL to open (https://...) or a plain search query"),
        },
        execute: (args, context) => call(context, "open", { address: args.address }).then(toJSON, toolError),
      }),
      dock_close: tool({
        description: "Close one App Dock tab. Without tabID, closes only active tab. Returns remaining tabs.",
        args: {
          tabID: tool.schema.string().min(1).optional().describe("Specific tab ID from dock_open or dock_list"),
        },
        execute: (args, context) => call(context, "close", { tabID: args.tabID }).then(toJSON, toolError),
      }),
    },
  }
}

export const AppDockPlugin: Plugin = async (_input: PluginInput): Promise<Hooks> => {
  const port = parentPort()
  if (!port) return {}
  return createAppDockHooks(port)
}
