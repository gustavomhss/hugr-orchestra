import type { Plugin, PluginInput, Hooks, ToolContext } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { randomUUID } from "node:crypto"
import { AppDockHints } from "./app-dock-hints"
import { AppDockOutline } from "./app-dock-outline"
import { scopeLinuxWorkspace } from "./app-dock-linux"

export { scopeLinuxWorkspace } from "./app-dock-linux"

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
            ? new NativeRPCError("transport-error", AppDockHints.toolErrorMessage(error), "unknown", undefined, entry.target)
            : new Error(AppDockHints.toolErrorMessage(error)))
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
        ? new NativeRPCError("transport-error", AppDockHints.toolErrorMessage(error), "unknown", undefined, entry.target)
        : new Error(AppDockHints.toolErrorMessage(error)))
    }
  })
}

const parentPort = (): ParentPortLike | undefined =>
  (process as typeof process & { parentPort?: ParentPortLike }).parentPort

const toolError = (error: unknown) => error instanceof NativeRPCError
  ? toJSON({ backend: error.backend, code: error.code, message: error.message, outcome: error.outcome,
    ...(error.result === undefined ? {} : { result: error.result }), ...(error.target === undefined ? {} : { target: error.target }),
    ...(error.cleanup === undefined ? {} : { cleanup: error.cleanup }), ...(AppDockHints.hintFor(error.code) ? { hint: AppDockHints.hintFor(error.code) } : {}) })
  : AppDockHints.toolErrorMessage(error)

function cleanupEvidence(value: unknown) {
  if (value === undefined) return
  const code = object(value) ? value.code : undefined
  return Object.freeze({ code: typeof code === "string" && code.length > 0 && code.length <= 256 && !/[^A-Za-z0-9_-]/.test(code)
    ? code : "native-cleanup-failed", outcome: "unknown" as const })
}

const toJSON = (value: unknown) => JSON.stringify(value, null, 2)
// Native pages name roles as ui_look does ("static", not "atspi-role-116"), so a role copied from any tool reads alike.
const readable = (value: unknown) => object(value) && value.backend === "linux-atspi" && Array.isArray(value.items)
  ? { ...value, items: value.items.map((item) => object(item) && typeof item.roleName === "string"
    ? { ...item, roleName: AppDockOutline.role({ role: item.role, roleName: item.roleName }) } : item) }
  : value
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

// window: only an active top-level window (where native key combinations land). focused: only the control with focus.
type NativeQuery = { name?: string; role?: string; capability?: "action" | "observedAction" | "type" | "keyboardType"; maxText?: number;
  window?: boolean; focused?: boolean }
type NativeItem = Record<string, unknown> & { ref: string; name: string; roleName: string }
// occurrence counts earlier matches with the same name and roleName on the same page, and index is the item's position
// on that page, so a rescan can re-identify the control.
type NativeMatch = { item: NativeItem; page: number; index: number; occurrence: number }
type Scoped = ToolContext & { world?: "linux" | "browser" }
type Definition = ReturnType<typeof tool>
type NativeScan = { found: NativeMatch[]; pages: number; more: boolean; complete: boolean; reasons: unknown; restarts?: number }
// One per tool call: an epoch-ms deadline that permission prompts push back.
type Clock = { deadline: number }

// The helper's root catalogue bound (LIMITS.roots).
const MAX_ROOTS = 32
// Bounds one scan at 48 helper pages (~6000 controls); each page is still one bounded native request.
const MAX_FIND_PAGES = 48
// Bounds all scans, restarts and retries of one dock_find/dock_action/dock_type call; nothing is dispatched after it.
const FIND_DEADLINE_MS = 90000
// How the desktop app resolves a Dock address (appDockURL).
const ADDRESS = "Only https:// URLs open, including https://localhost; http:// and other schemes are refused. A bare domain such as example.com gets https://, and words with spaces or without a dot become a Google search."
// AT-SPI state numbers that change what a model can do with a control.
const STATES: Record<number, string> = { 1: "active", 4: "checked", 7: "editable", 10: "expanded", 12: "focused", 16: "modal", 20: "pressed", 23: "selected" }

function nativePage(value: unknown) {
  if (!object(value) || value.backend !== "linux-atspi" || !Array.isArray(value.items) || !object(value.coverage))
    throw new NativeRPCError("unsupported-backend", "This tab is a browser page; native search, targets and key combinations exist only in the Linux workspace", "not-dispatched")
  return value as { items: unknown[]; hasMore?: boolean; cursor?: unknown; scopeKind?: unknown; coverage: { complete?: unknown; reasons?: unknown } }
}

function matches(item: unknown, query: NativeQuery): item is NativeItem {
  if (!object(item) || typeof item.ref !== "string" || typeof item.name !== "string" || typeof item.roleName !== "string") return false
  // An omitted name lists every control of the role; a blank one matches nothing.
  const name = query.name?.trim().toLowerCase()
  if (name !== undefined && (name.length === 0 || !item.name.toLowerCase().includes(name))) return false
  return fits(item as NativeItem, query)
}

// Toolkits, tools and models spell roles differently ("check-box", "Check Box", "atspi-role-7"), so roles compare by
// their readable name with only letters and digits counting.
const roleKey = (role: string) => {
  const number = /^atspi-?role-?(\d+)$/i.exec(role.trim())
  return (number ? AppDockOutline.role({ role: Number(number[1]), roleName: role }) : role).toLowerCase().replace(/[^a-z0-9]/g, "")
}

function fits(item: NativeItem, query: NativeQuery) {
  if (query.role !== undefined && roleKey(item.roleName) !== roleKey(query.role)) return false
  if (query.window && !(AppDockOutline.WINDOWS.has(AppDockOutline.role(item)) && Array.isArray(item.states)
    && item.states.includes(1))) return false
  return query.capability === undefined || supports(item, query.capability)
}

function supports(item: NativeItem, capability: string) {
  const entry = object(item.capabilities) ? item.capabilities[capability] : undefined
  return object(entry) && entry.supported === true
}

function reason(item: NativeItem, capability: string) {
  const entry = object(item.capabilities) ? item.capabilities[capability] : undefined
  return object(entry) && typeof entry.reason === "string" ? entry.reason : "not advertised"
}

// The capabilities that serve the same intent in another input mode.
const ALTERNATIVES: Record<string, string[]> = { action: ["action", "observedAction"], observedAction: ["action", "observedAction"],
  type: ["type", "keyboardType"], keyboardType: ["type", "keyboardType"] }

// A target that names real controls but excludes them by role or input mode must say so, or models keep guessing.
function missed(scan: NativeScan, query: NativeQuery) {
  // Keys and text would land in a window ui_* cannot see (often a native file dialog that exposes no controls).
  if (query.window || (query.focused && query.capability === undefined && scan.found.length === 0))
    return toJSON({ code: "target-not-found", outcome: "not-dispatched", found: 0,
      hint: query.window ? "No app window in the Linux workspace is active, so keys would go to a window ui_* cannot see, often a native dialog that exposes no controls. Do not close or kill windows or processes to get around it; stop and report it, since the owner may need to click the app"
        : "No control in the active app window has keyboard focus; open the field with its shortcut or pass target {name, role}" })
  if (query.focused && scan.found.length === 0) return toJSON({ code: "target-not-found", outcome: "not-dispatched", found: 0,
    hint: "No control has keyboard focus; pass target {name, role} for the field" })
  if (scan.found.length === 0) return compactScan(scan, "target-not-found")
  const items = scan.found.map((match) => match.item)
  const roles = [...new Set(items.map((item) => AppDockOutline.role(item)))]
  const shaped = items.filter((item) => query.role === undefined || roleKey(item.roleName) === roleKey(query.role))
  const hints = [
    ...(shaped.length === 0 ? [`No control with this name has role "${query.role}"; roles found: ${roles.join(", ")}`] : []),
    ...(query.capability === "action" && shaped.some((item) => supports(item, "observedAction"))
      ? ['Controls with this name only support observed actions; retry with mode: "observed"'] : []),
    ...(query.capability === "type" && shaped.some((item) => supports(item, "keyboardType"))
      ? ['Fields with this name only accept keyboard input; retry with mode: "keyboard"'] : []),
    ...(query.focused ? ["The focused control is not a text field ui_type can confirm; ui_keys with text types into whatever has focus, or pass target {name, role} for the field"] : []),
    // The helper never acts on list and tree rows themselves, so a row matched by name otherwise looked like a typo.
    ...(query.capability !== undefined && !query.focused && shaped.length > 0
      && !shaped.some((item) => ALTERNATIVES[query.capability!].some((capability) => supports(item, capability)))
      ? [`The control with this name accepts no ${query.capability === "type" || query.capability === "keyboardType" ? "typing" : "action"} (${
        [...new Set(shaped.map((item) => `${AppDockOutline.role(item)}: ${reason(item, ALTERNATIVES[query.capability!][0]!)}`))].join("; ")
      }); act on a control inside or beside it instead, such as its check box or button (ui_list shows them)`] : []),
  ]
  return toJSON({ code: "target-not-found", outcome: "not-dispatched", found: 0, nameMatches: items.length,
    ...(hints.length ? { hints } : {}), nearMisses: items.slice(0, 10).map(compactItem) })
}

const only = (scan: NativeScan, query: NativeQuery): NativeScan => ({ ...scan, found: scan.found.filter((match) => fits(match.item, query)) })

function compactItem(item: NativeItem) {
  const capabilities = object(item.capabilities) ? item.capabilities : {}
  return {
    ref: item.ref,
    role: AppDockOutline.role(item),
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

// Re-identifies a control across scans by position and shape; refs themselves change with every observation.
const same = (match: NativeMatch, winner: NativeMatch) => match.page === winner.page && match.index === winner.index
  && match.occurrence === winner.occurrence && match.item.name === winner.item.name
  && match.item.roleName === winner.item.roleName && match.item.depth === winner.item.depth
  && match.item.scopeDepth === winner.item.scopeDepth

// Names are substring-matched, so "Open" also hits "Open Quick Access": a single match wins, else a unique exact name.
// ui_look prints names with their shortcut split off ("Explorer" keys=Ctrl+Shift+E), so that spelling is exact too.
function pick(scan: NativeScan, query: NativeQuery) {
  const wanted = query.name?.trim().toLowerCase()
  const exact = scan.found.filter((match) => [match.item.name, AppDockOutline.keys(match.item.name).name]
    .some((name) => name.trim().toLowerCase() === wanted))
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
  // The world comes from the caller, never from the dock tab the user happens to have selected:
  // ui_* tools always address the Linux workspace, and dock_* called by an agent address browser tabs.
  const call = (context: ToolContext, op: string, args: Record<string, unknown>, clock?: Clock) => {
    const world = (context as Scoped).world ?? (context.agent ? "browser" : undefined)
    return invoke(context, port, op, world ? { ...args, world } : args, timeoutMs, clock)
  }
  const browserRef = tool.schema.number().min(1)
  const nativeRef = tool.schema.string().min(3).max(256).startsWith("n:")
  const keyEvent = tool.schema.enum(["keyDown", "keyUp"])
  const keyName = tool.schema.string().min(1).describe("Key name such as Enter, Tab, Escape or ArrowDown, or a single character")
  const target = tool.schema.object({
    name: tool.schema.string().min(1).max(256).describe("Case-insensitive substring of the control's accessible name; when several controls contain it, the one whose whole name equals it wins"),
    role: tool.schema.string().min(1).max(64).optional().describe("Role as ui_look or ui_find shows it, e.g. push button, entry, check box; any spelling of the same role matches"),
  })
  const address = tool.schema.string().describe("https:// URL, bare domain, or search words")

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
  // Every fresh native read re-proves workspace ownership and fences other requests on the tab, so multi-step
  // scans a model issues in parallel cancel each other. Run them one at a time; a call's deadline starts when it runs.
  const queue = { tail: Promise.resolve() as Promise<unknown> }
  const exclusive = <T>(run: () => Promise<T>) => {
    const result = queue.tail.then(run)
    queue.tail = result.then(() => undefined, () => undefined)
    return result
  }
  // Locate and mutate within one tool call so UI churn between model turns cannot stale the ref.
  // Uniqueness is decided over the whole tree, then a second whole-tree scan must pick the same control by the same
  // rule and supplies a current ref. Only a certainly-undispatched stale target is located again; unknown outcomes are
  // never replayed.
  const act = async (context: ToolContext, query: NativeQuery, run: (item: NativeItem, clock: Clock) => Promise<unknown> | string,
    clock: Clock, attempt = 0): Promise<unknown> => {
    // Scans match by name only; role and input mode filter afterwards so a miss can report what it excluded.
    const loose = { name: query.name, maxText: query.maxText }
    // A focus query scans every control so each focused one can be traced to its window.
    const located = (scan: NativeScan) => (query.focused ? { ...scan, found: AppDockOutline.focused(scan.found) } : scan)
    const named = located(await find(context, loose, () => false, clock))
    const all = only(named, query)
    // A provider error or skipped subtree can end a traversal without more pages, so uniqueness needs full coverage.
    if (!all.complete) return compactScan(all, "target-search-incomplete")
    const winner = pick(all, query)
    if (winner === undefined) return all.found.length === 0 ? missed(named, query) : compactScan(all, "target-ambiguous")
    const fresh = only(located(await find(context, loose, () => false, clock)), query)
    if (Date.now() >= clock.deadline) return compactScan(expired(all), "target-search-incomplete")
    if (!fresh.complete) return compactScan(fresh, "target-search-incomplete")
    const current = pick(fresh, query)
    // A homonym surfacing on any page between the scans leaves no single pick; a moved position or tree depth means
    // the tree no longer has the shape the winner was chosen from.
    if (current === undefined || !same(current, winner))
      return toJSON({ code: "target-changed", outcome: "not-dispatched", item: compactItem(winner.item) })
    // Each native page is a new observation that retires the refs of earlier pages, so a winner before the last
    // page needs a scan that stops on its page to hold a live ref, re-identified the same way.
    const live = current.page === fresh.pages ? current
      : only(located(await find(context, loose, (scan) => scan.pages >= winner.page, clock)), query).found.find((match) =>
        same(match, winner))
    if (Date.now() >= clock.deadline) return compactScan(expired(all), "target-search-incomplete")
    if (live === undefined) return toJSON({ code: "target-changed", outcome: "not-dispatched", item: compactItem(winner.item) })
    return Promise.resolve(run(live.item, clock)).catch((error: unknown) => {
      if (!(error instanceof NativeRPCError) || error.code !== "stale-ref" || error.outcome !== "not-dispatched" || attempt >= 1) throw error
      return act(context, query, run, clock, attempt + 1)
    })
  }
  // The helper catalogues every workspace root (at most MAX_ROOTS) before any descendant, so the first page
  // holds all window candidates; the key operation itself re-proves the window active before each key event.
  const activeWindow = async (context: ToolContext, clock: Clock) => {
    const page = nativePage(await call(context, "read", { budget: MAX_ROOTS, maxText: 0 }, clock))
    // An application-scope binding walks each root depth-first, so only a whole-tree scan can decide.
    if (page.scopeKind !== "workspace") return undefined
    const roots = page.items.filter((item): item is NativeItem => matches(item, {}) && item.parentRef === null)
    const scan = { found: roots.flatMap((item, index) => fits(item, { window: true }) ? [{ item, page: 1, index, occurrence: 0 }] : []),
      pages: 1, more: page.hasMore === true, complete: roots.length < page.items.length || page.hasMore !== true, reasons: page.coverage.reasons }
    if (!scan.complete) return compactScan(scan, "target-search-incomplete")
    if (scan.found.length === 1) return scan.found[0]!.item
    return scan.found.length === 0 ? missed(scan, { window: true }) : compactScan(scan, "target-ambiguous")
  }
  const dock = {
      dock_list: tool({
        description:
          "List the browser tabs in the App Dock with their tabID, url, title and whether each is loading, audible or active.",
        args: {},
        execute: (_args, context) => call(context, "list", {}).then(toJSON, toolError),
      }),
      dock_activate: tool({
        description: "Make one browser tab active by its tabID from dock_list or dock_open; the tools that take no tabID act on the active tab.",
        args: { tabID: tool.schema.string().min(1) },
        execute: (args, context) => call(context, "activate", { tabID: args.tabID }).then(toJSON, toolError),
      }),
      dock_read: tool({
        description:
          "Read the active browser tab as a structured accessibility snapshot: page text and a semantic tree in which every item carries a numeric `ref` for dock_click and dock_type, a `path`, `parentRef`/`children`, `actionable` and `visible`. Read again after the page changes. A `path` is a selector to revalidate, not a durable identity: when it matches several elements, read again and report the ambiguity instead of assuming the first.",
        args: {
          budget: tool.schema.number().min(1).max(500).optional().describe(
            "Maximum interactive elements to return (default 100)",
          ),
          maxText: tool.schema.number().min(0).max(20000).optional().describe(
            "Maximum page text characters to return (default 1500)",
          ),
          rootRef: nativeRef.optional().describe("Ref of the subtree to read"),
          cursor: tool.schema.string().min(1).max(256).optional().describe("Cursor from the previous ui_read page; it expires within seconds"),
          textOffset: tool.schema.number().int().min(0).optional().describe("Character offset at which a long text continues"),
          mode: tool.schema.enum(["full", "a11y", "skeleton"]).optional().describe(
            "full keeps x/y/width/height (default); a11y and skeleton omit geometry",
          ),
          format: tool.schema.enum(["json", "tree", "csv"]).optional().describe(
            "json (default) returns items; tree adds indented treeText; csv adds a flat csv table",
          ),
          actionable: tool.schema.boolean().optional().describe(
            "Keep actionable controls plus the context ancestors that keep parentRef/children closed",
          ),
          visible: tool.schema.boolean().optional().describe(
            "Keep currently visible nodes plus their context ancestors",
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
            ...(args.visible === undefined ? {} : { visible: args.visible }) }).then((value) => toJSON(readable(value)), toolError),
      }),
      // Agents never see dock_find or dock_action (see scopeLinuxWorkspace); the linux agent has them as ui_find and ui_act.
      dock_find: tool({
        description: "Find controls of the apps in the Linux workspace by accessible name and/or role.",
        args: {
          name: tool.schema.string().min(1).max(256).optional().describe("Case-insensitive substring of the accessible name; omit it to list every control of a role"),
          role: tool.schema.string().min(1).max(64).optional().describe("Role as ui_look prints it, e.g. push button, entry, check box (any spelling of the same role matches)"),
          includeText: tool.schema.boolean().optional().describe("Also return each match's current text (default false)"),
        },
        execute: (args, context) => args.name === undefined && args.role === undefined
          ? Promise.resolve("Pass name, role or both")
          : exclusive(() => find(context, { name: args.name, role: args.role, ...(args.includeText ? { maxText: 2000 } : {}) },
            (scan) => scan.found.length > 0, { deadline: Date.now() + findDeadlineMs })).then((result) => compactScan(result), toolError),
      }),
      dock_wait: tool({
        description: "Wait up to 10 seconds in the active browser tab, e.g. for a page to settle. It only waits; read again to see the result.",
        args: {
          milliseconds: tool.schema.number().min(0).max(10000).optional().describe("Wait duration in milliseconds (default 100)"),
        },
        execute: (args, context) =>
          call(context, "wait", { milliseconds: args.milliseconds }).then(toJSON, toolError),
      }),
      dock_screenshot: tool({
        description: "Capture the active browser tab as a PNG image.",
        args: {},
        // Base64 in the text output would exceed the tool-output cap and is unreadable as text; an attachment reaches
        // the model as an image, as `read` returns image files.
        execute: (_args, context) => call(context, "screenshot", {}).then((value) =>
          object(value) && value.mime === "image/png" && typeof value.data === "string"
            ? { output: "Screenshot of the active tab attached as a PNG image.",
              attachments: [{ type: "file" as const, mime: "image/png", url: `data:image/png;base64,${value.data}` }] }
            : toJSON(value), toolError),
      }),
      dock_scroll: tool({
        description: "Scroll the active browser tab up or down by a number of pixels, or to its top or bottom.",
        args: {
          direction: tool.schema.enum(["up", "down", "top", "bottom"]),
          amount: tool.schema.number().min(1).max(10000).optional().describe("Pixels for up or down (default 300); omit it for top and bottom"),
        },
        execute: (args, context) =>
          call(context, "scroll", { direction: args.direction, amount: args.amount }).then(toJSON, toolError),
      }),
      dock_keyboard: tool({
        description: "Send one key event to the active browser tab: type keyDown or keyUp with a key such as Enter, Tab, Escape, ArrowDown or a single character. Use dock_type to enter text.",
        args: {
          type: keyEvent.optional(),
          key: keyName.optional(),
          keys: tool.schema.string().min(1).max(64).optional().describe("Modifiers and one key joined by +, e.g. ctrl+shift+p"),
          text: tool.schema.string().min(1).max(256).optional().describe("Printable ASCII to type as key events into the focused control, instead of keys"),
          ref: nativeRef.optional().describe("A control in the window that should receive the keys"),
          target: target.optional().describe("Locate that control by name instead of ref"),
        },
        execute: (args, context) => {
          if (args.keys === undefined && args.text === undefined) {
            if (args.type === undefined || args.key === undefined)
              return Promise.resolve((context as Scoped).world === "linux" ? "Pass keys, such as ctrl+comma, or text" : "Pass type and key")
            return call(context, "keyboard", { type: args.type, key: args.key }).then(toJSON, toolError)
          }
          if (args.keys !== undefined && args.text !== undefined)
            return Promise.resolve("Pass keys or text, not both: press the combination in its own call")
          const input = args.text === undefined ? { keys: args.keys } : { text: args.text }
          if (args.ref !== undefined) return call(context, "keyboard", { ref: args.ref, ...input }).then(toJSON, toolError)
          const send = (item: NativeItem, clock: Clock) => call(context, "keyboard", { ref: item.ref, ...input }, clock).then(toJSON)
          const clock = { deadline: Date.now() + findDeadlineMs }
          const wanted = args.target
          // Without a ref, keys go to the one active window (a single roots page, never a tree walk) and text goes to
          // the control focused in it, which the helper re-proves focused and unprotected before typing.
          return exclusive(() => wanted !== undefined ? act(context, wanted, send, clock)
            : args.text !== undefined ? act(context, { focused: true }, send, clock)
            : activeWindow(context, clock).then((item) =>
              item === undefined ? act(context, { window: true }, send, clock) : typeof item === "string" ? item : send(item, clock)))
            .then((value) => (typeof value === "string" ? value : toJSON(value)), toolError)
        },
      }),
      dock_evaluate: tool({
        description: "Run JavaScript in the page of the active browser tab and return its result.",
        args: { script: tool.schema.string().min(1) },
        execute: (args, context) => call(context, "evaluate", { script: args.script }).then(toJSON, toolError),
      }),
      dock_storage: tool({
        description: "Read one localStorage or sessionStorage value of the active browser tab.",
        args: {
          storage: tool.schema.enum(["local", "session"]),
          key: tool.schema.string().min(1),
        },
        execute: (args, context) =>
          call(context, "storage", { storage: args.storage, key: args.key }).then(toJSON, toolError),
      }),
      dock_network: tool({
        description: "Install page-level fetch/XHR URL filtering in the active browser tab.",
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
        description: "Click an element of the active browser tab by its numeric ref from dock_read, or click the page at coordinates x and y.",
        args: {
          ref: browserRef.optional().describe("Numeric ref from dock_read"),
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
        description: "Invoke an advertised action of a control in a Linux workspace app, by ref and actionID or by target.",
        args: { ref: nativeRef.optional().describe("Ref from ui_read or ui_find"),
          actionID: tool.schema.string().min(1).max(256).optional().describe("actionID from that item's actions"),
          target: target.optional().describe("Locate the control by name instead of ref"),
          action: tool.schema.string().min(1).max(256).optional().describe("With target: action name such as press or click; required when the control has several actions"),
          mode: tool.schema.enum(["stable", "observed"]).optional().describe("stable (default), or observed for controls inside lists and trees") },
        execute: (args, context) => {
          const mode = args.mode === undefined ? {} : { mode: args.mode }
          // Models often pass the actionID they just read in `action`; it is unambiguous, so accept it there.
          const actionID = args.actionID ?? (args.action?.startsWith("a:") ? args.action : undefined)
          if (args.target === undefined) {
            if (args.ref === undefined || actionID === undefined) return Promise.resolve("A ref needs the actionID from that item's actions; or pass target {name, role} with an action name to locate and act in one call")
            return call(context, "action", { ref: args.ref, actionID, ...mode }).then(toJSON, toolError)
          }
          const wanted = args.target
          return exclusive(() => act(context, { ...wanted, capability: args.mode === "observed" ? "observedAction" : "action" }, (item, clock) => {
            const actions = (Array.isArray(item.actions) ? item.actions : []).filter((entry): entry is { id: string; name: string } =>
              object(entry) && typeof entry.id === "string" && typeof entry.name === "string" && (args.action === undefined || entry.name === args.action))
            if (actions.length !== 1) return toJSON({ code: "action-ambiguous", outcome: "not-dispatched", item: compactItem(item),
              hint: `Pass action as one of: ${(Array.isArray(item.actions) ? item.actions : []).flatMap((entry) => object(entry) && typeof entry.name === "string" ? [entry.name] : []).join(", ") || "(none advertised)"}` })
            return call(context, "action", { ref: item.ref, actionID: actions[0]!.id, ...mode }, clock).then(toJSON)
          }, { deadline: Date.now() + findDeadlineMs })).then((value) => (typeof value === "string" ? value : toJSON(value)), toolError)
        },
      }),
      dock_type: tool({
        description: "Replace the value of an editable element of the active browser tab, found by its numeric ref from dock_read, and check that it now holds the text.",
        args: {
          ref: tool.schema.union([browserRef, nativeRef]).optional(),
          target: target.optional().describe("Locate the field by name instead of ref"),
          text: tool.schema.string().describe("Text the field should hold; empty clears it"),
          mode: tool.schema.enum(["editable", "keyboard"]).optional().describe("editable (default) sets the value; keyboard types it for fields that only accept keys"),
        },
        execute: (args, context) => {
          const mode = args.mode === undefined ? {} : { mode: args.mode }
          // Into the focused field: the helper refuses, before any key, a field that lost focus since the scan.
          if (args.target === undefined && args.ref === undefined && (context as Scoped).world === "linux") return args.mode === "editable"
            ? Promise.resolve("Typing into the focused field uses keyboard mode; pass target or ref for editable mode")
            : exclusive(() => act(context, { focused: true, capability: "keyboardType" }, (item, clock) => call(context, "type", { ref: item.ref,
              text: args.text, mode: "keyboard", focused: true }, clock).then(toJSON), { deadline: Date.now() + findDeadlineMs }))
              .then((value) => (typeof value === "string" ? value : toJSON(value)), toolError)
          if (args.target === undefined) {
            // A Linux-scoped call without ref or target already went to the focused field above.
            if (args.ref === undefined) return Promise.resolve("Pass ref")
            return call(context, "type", { ref: args.ref, text: args.text, ...mode }).then(toJSON, toolError)
          }
          const wanted = args.target
          return exclusive(() => act(context, { ...wanted, capability: args.mode === "keyboard" ? "keyboardType" : "type" },
            (item, clock) => call(context, "type", { ref: item.ref, text: args.text, ...mode }, clock).then(toJSON),
            { deadline: Date.now() + findDeadlineMs }))
            .then((value) => (typeof value === "string" ? value : toJSON(value)), toolError)
        },
      }),
      dock_navigate: tool({
        description: `Load an address in the active browser tab. ${ADDRESS}`,
        args: { address },
        execute: (args, context) => call(context, "navigate", { address: args.address }).then(toJSON, toolError),
      }),
      dock_go: tool({
        description: "Go back, forward, or reload the active browser tab.",
        args: {
          command: tool.schema.enum(["back", "forward", "reload"]).describe("Navigation command"),
        },
        execute: (args, context) => call(context, "go", { command: args.command }).then(toJSON, toolError),
      }),
      dock_open: tool({
        description: `Open a new browser tab at an address; it becomes the active tab, and the result carries its tabID. ${ADDRESS}`,
        args: { address },
        execute: (args, context) => call(context, "open", { address: args.address }).then(toJSON, toolError),
      }),
      dock_close: tool({
        description: "Close one browser tab by tabID, or the active one without tabID. Returns the remaining tabs.",
        args: {
          tabID: tool.schema.string().min(1).optional().describe("Tab ID from dock_list or dock_open"),
        },
        execute: (args, context) => call(context, "close", { tabID: args.tabID }).then(toJSON, toolError),
      }),
  }
  // A scope cursor per session: ui_enter zooms into a region, ui_up leaves it, and looks and lists stay inside.
  const scopes = new Map<string, AppDockOutline.Handle[]>()
  const looks = new Map<string, AppDockOutline.Look>()
  const outline = (context: ToolContext) => exclusive(() => find({ ...context, world: "linux" } as Scoped, {}, () => false,
    { deadline: Date.now() + findDeadlineMs })).then((scan) => {
    const roots = AppDockOutline.tree(scan.found.map((match) => match.item as AppDockOutline.Item))
    const stack = scopes.get(context.sessionID) ?? []
    // A region that disappeared (dialog closed, view switched) drops the cursor back to the nearest one still there.
    while (stack.length && !AppDockOutline.locate(roots, stack.at(-1)!)) stack.pop()
    scopes.set(context.sessionID, stack)
    const scope = stack.length ? AppDockOutline.locate(roots, stack.at(-1)!) : undefined
    // The helper leaves out an app that stops answering (busy in a dialog, hung) and names it as app-not-responding:<process>.
    const reasons = Array.isArray(scan.reasons) ? scan.reasons.filter((reason): reason is string => typeof reason === "string") : []
    const silent = reasons.flatMap((reason) => reason.startsWith("app-not-responding:") ? [reason.slice(19)] : [])
    const partial = reasons.filter((reason) => !reason.startsWith("app-not-responding:"))
    const note = (silent.length ? `\nNot responding, so missing from this view: ${silent.join(", ")} (it may be busy in a dialog; ui_look again in a moment)` : "")
      + (scan.complete || (silent.length && !partial.length) ? "" : `\n(partial view: ${JSON.stringify(partial)})`)
    return { roots, scope, stack, note }
  })
  const view = (context: ToolContext, roots: AppDockOutline.Node[], scope: AppDockOutline.Node | undefined, note: string) => {
    const result = AppDockOutline.look(roots, scope)
    looks.set(context.sessionID, result)
    return result.text + note
  }
  const navigation = {
    ui_look: tool({
      description: "Where am I in the Linux workspace: the app windows, any open dialog (which holds the input), the focused control and where it sits, then a map of the current scope — its regions (toolbars, tab lists, lists, panes, menus) numbered with how much they hold, and the controls directly in it. Each control line `role \"name\" keys=...` can be passed as target {name, role} to ui_act/ui_type, and keys= shows its shortcut for ui_keys. Start here and after anything that changes the screen.",
      args: {},
      execute: (_args, context) => outline(context).then((state) => view(context, state.roots, state.scope, state.note), toolError),
    }),
    ui_enter: tool({
      description: "Zoom the view into one region from ui_look, by its number, by {name, role}, or with focus=true straight into the region that holds the focused control however deep it sits. ui_look and ui_list then show only that region until ui_up.",
      args: {
        focus: tool.schema.boolean().optional().describe("Enter the region holding the focused control (the focus: line of ui_look)"),
        region: tool.schema.number().int().min(1).optional().describe("Region number from the last ui_look"),
        name: tool.schema.string().min(1).max(256).optional().describe("Region name, when not using a number"),
        role: tool.schema.string().min(1).max(64).optional().describe("Region role, e.g. tool bar, page tab list, list"),
      },
      execute: (args, context) => outline(context).then((state) => {
        const last = looks.get(context.sessionID)
        if (args.focus) {
          const home = AppDockOutline.focusRegion(state.roots)
          if (!home) return "No control holds the focus inside a region; call ui_look and enter by number"
          state.stack.push(AppDockOutline.handle(state.roots, home))
          return view(context, state.roots, home, state.note)
        }
        if (args.region !== undefined) {
          const wanted = last?.regions[args.region - 1]
          // Numbers always come from the latest view; after an enter, that is the entered region's own map.
          if (!last || !wanted) return last
            ? `The last view (scope ${last.scope}) listed ${last.regions.length} region${last.regions.length === 1 ? "" : "s"}, so there is no #${args.region}; numbers refer to the latest ui_look or ui_enter output, and ui_up leaves an entered region`
            : "No view yet in this session; call ui_look and use one of its region numbers"
          const node = AppDockOutline.locate(state.roots, wanted)
          const step = wanted.at(-1)!
          if (!node) return `Region #${args.region} (${step.role}${step.name ? ` "${step.name}"` : ""}) from the last view is no longer on screen; call ui_look again`
          state.stack.push(wanted)
          return view(context, state.roots, node, state.note)
        }
        if (args.name === undefined && args.role === undefined) return "ui_enter needs a region number from ui_look, a name or role, or focus=true"
        const candidates = AppDockOutline.visible(state.roots).filter((node) =>
          (args.name === undefined || node.name.toLowerCase().includes(args.name.toLowerCase()))
          && (args.role === undefined || roleKey(node.role) === roleKey(args.role)))
        if (candidates.length !== 1) return candidates.length > 1
          ? `${candidates.length} regions match; use a number from ui_look or add the role:\n${candidates.slice(0, 12).map((item) => `  ${AppDockOutline.line(item)}`).join("\n")}`
          : "No region with that name and role is on screen; call ui_look and use one of its numbers"
        state.stack.push(AppDockOutline.handle(state.roots, candidates[0]!))
        return view(context, state.roots, candidates[0]!, state.note)
      }, toolError),
    }),
    ui_up: tool({
      description: "Leave the region entered with ui_enter and show the enclosing view.",
      args: {},
      execute: (_args, context) => {
        scopes.get(context.sessionID)?.pop()
        return outline(context).then((state) => view(context, state.roots, state.scope, state.note), toolError)
      },
    }),
    ui_list: tool({
      description: "List every control of one kind in the current scope, like a screen reader's elements list: buttons, fields, checks, tabs, items, menus, links, headings or regions.",
      args: { kind: tool.schema.enum(["buttons", "fields", "checks", "tabs", "items", "menus", "links", "headings", "regions"]) },
      execute: (args, context) => outline(context).then((state) => {
        const scope = state.scope ?? AppDockOutline.windows(state.roots).find((node) => node.item.states?.includes(1)) ?? state.roots[0]
        return scope ? AppDockOutline.list(scope, args.kind) + state.note : "No app windows are visible in the Linux workspace."
      }, toolError),
    }),
  }
  // Agent calls of dock_* reach only browser tabs and ui_* calls only the Linux workspace (see `call`). dock_read, dock_type
  // and dock_keyboard serve both worlds, so each view below declares only its own world's arguments; the shared executes
  // still take all of them from callers without an agent.
  const argsOf = (definition: Definition, keys: string[]) => Object.fromEntries(keys.map((key) => [key, definition.args[key]!]))
  // The Linux workspace's own verbs: the same machinery bound to the workspace.
  const linux = (definition: Definition, description: string, args: Definition["args"]): Definition => ({
    description,
    args,
    execute: (input, context) => definition.execute(input, { ...context, world: "linux" } as Scoped),
  })
  return {
    tool: {
      ...dock,
      dock_read: { ...dock.dock_read, args: argsOf(dock.dock_read, ["budget", "maxText", "mode", "format", "actionable", "visible"]) },
      dock_type: { ...dock.dock_type, args: { ref: browserRef.describe("Numeric ref from dock_read"),
        text: tool.schema.string().min(1).describe("Text the element should hold") } },
      dock_keyboard: { ...dock.dock_keyboard, args: { type: keyEvent, key: keyName } },
      ...navigation,
      ui_read: linux(dock.dock_read, "Read the accessibility tree of the apps open in the Linux workspace, one bounded page at a time. Items carry opaque refs (n:...) that expire when the app changes or the next page is read; prefer ui_find, or ui_act/ui_type with `target`, which locate and act in one call. Use rootRef to read one subtree and cursor for the next page (cursors expire within seconds).", argsOf(dock.dock_read, ["budget", "maxText", "rootRef", "cursor", "textOffset"])),
      ui_find: linux(dock.dock_find, "Find controls in the Linux workspace apps by accessible name (case-insensitive substring) and/or role. Pages the tree itself and returns compact matches with refs usable right away; searchComplete:false means part of the tree was not searched.", dock.dock_find.args),
      ui_act: linux(dock.dock_action, "Press, click, toggle or otherwise invoke a control in a Linux workspace app. Prefer `target` {name, role} plus an action name: it locates the control and acts in one call. Use mode observed for controls inside lists and trees. Acknowledgement is not proof; read again to confirm the result.", dock.dock_action.args),
      ui_type: linux(dock.dock_type, "Replace the text of a field in a Linux workspace app, by `target` {name, role} or ref, and verify it. Editable mode sets the value; keyboard mode types it for fields that only accept keys. Without target or ref it types, in keyboard mode, into the text field that has keyboard focus (e.g. a search box just opened by a shortcut). When focus is in something that is not a recognized text field (a command palette list, a search box shown as another role), use ui_keys with text instead.", { ...argsOf(dock.dock_type, ["target", "text", "mode"]), ref: nativeRef.optional().describe("Ref from ui_read or ui_find") }),
      ui_pointer: tool({
        description: "Move the mouse onto a control in a Linux workspace app (kind hover) or right-click it (kind contextMenu), by `target` {name, role} or ref. Use it for what apps show only under the mouse, such as a row's gear or toolbar, and for right-click menus that ui_act and ui_keys do not open. It is a real mouse event at the control's center, so apps may react to it as they would to a person (a right-click on a VS Code boolean setting's description toggles it); look again afterwards.",
        args: { kind: tool.schema.enum(["hover", "contextMenu"]), target: target.optional().describe("Locate the control by name"),
          ref: nativeRef.optional().describe("Ref from ui_read or ui_find") },
        execute: (args, context) => {
          const scoped = { ...context, world: "linux" } as Scoped
          if (args.ref !== undefined) return call(scoped, "pointer", { ref: args.ref, kind: args.kind }).then(toJSON, toolError)
          const wanted = args.target
          if (wanted === undefined) return Promise.resolve("ui_pointer requires target or ref")
          return exclusive(() => act(scoped, wanted, (item, clock) => call(scoped, "pointer", { ref: item.ref, kind: args.kind }, clock)
            .then(toJSON), { deadline: Date.now() + findDeadlineMs })).then((value) => (typeof value === "string" ? value : toJSON(value)), toolError)
        },
      }),
      ui_keys: linux(dock.dock_keyboard, "Press a key combination in a Linux workspace app, such as ctrl+comma, ctrl+shift+p, alt+f, Escape, Return, F1; it goes to the active app window, or to the window holding `ref`/`target`. Apps are often fastest through their shortcuts; names often show them, e.g. \"Explorer (Ctrl+Shift+E)\". Or pass `text` (printable ASCII, up to 256 characters) to type it in one call as key events into whatever has keyboard focus in the active window: use it when ui_type finds no text field there, such as a command palette or a search box shown as another role; it is refused for password fields. Prefer ui_type for a field you can name, because it verifies the value. Nothing here is verified, so read again afterwards.", argsOf(dock.dock_keyboard, ["keys", "text", "ref", "target"])),
      ui_wait: linux(dock.dock_wait, "Wait a bounded time for a Linux workspace app to settle; this is a delay, not proof that the app is ready.", dock.dock_wait.args),
    },
  }
}

export const AppDockPlugin: Plugin = async (_input: PluginInput): Promise<Hooks> => {
  const port = parentPort()
  if (!port) return {}
  return { ...createAppDockHooks(port), config: async (config) => scopeLinuxWorkspace(config) }
}
