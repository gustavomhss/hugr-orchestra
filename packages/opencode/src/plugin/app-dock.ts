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
    || args.rootRef !== undefined || args.cursor !== undefined || args.textOffset !== undefined || args.mode !== undefined
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
const invoke = (context: ToolContext, port: ParentPortLike, op: string, args: Record<string, unknown>, timeoutMs: number) =>
  context
    .ask({ permission: "dock", patterns: [op], always: [op], metadata: { operation: op } })
    .then(() => request(port, op, args, context.abort, timeoutMs))

export function createAppDockHooks(port: ParentPortLike, config: { timeoutMs?: number } = {}): Hooks {
  const timeoutMs = config.timeoutMs ?? 15000
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw new Error("Invalid App Dock timeout")
  const call = (context: ToolContext, op: string, args: Record<string, unknown>) => invoke(context, port, op, args, timeoutMs)
  const ref = tool.schema.union([tool.schema.number().min(1), tool.schema.string().min(3).max(256).startsWith("n:")])
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
          "Read the App Dock browser page or bound native app as a structured accessibility snapshot. Browser refs are numeric; native refs are opaque n: strings. Use refs with dock_click / dock_action / dock_type. Re-read after changes; native observations are non-atomic and refs may expire. Native-only rootRef, cursor and textOffset select a bounded read page.",
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
        },
        execute: (args, context) =>
          call(context, "read", { budget: args.budget, maxText: args.maxText,
            ...(args.rootRef === undefined ? {} : { rootRef: args.rootRef }),
            ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
            ...(args.textOffset === undefined ? {} : { textOffset: args.textOffset }) }).then(toJSON, toolError),
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
        description: "Invoke an advertised native actionID on a ref from dock_read. Default mode requires a stable eligible control. Explicit observed mode permits eligible controls below virtual ancestry, revalidates the current control, and never proves durable logical-record identity. Both modes are non-atomic; acknowledgement does not prove task completion.",
        args: { ref: ref.describe("Element ref from dock_read"), actionID: tool.schema.string().min(1).max(256),
          mode: tool.schema.enum(["stable", "observed"]).optional().describe("Native control identity policy (default stable)") },
        execute: (args, context) => call(context, "action", { ref: args.ref, actionID: args.actionID,
          ...(args.mode === undefined ? {} : { mode: args.mode }) }).then(toJSON, toolError),
      }),
      dock_type: tool({
        description: "Replace text in an editable App Dock element by ref from dock_read. Native mode defaults to semantic EditableText replacement; keyboard mode must be explicit and never serves as an automatic fallback. Unicode and empty text are valid.",
        args: {
          ref: ref.describe("Element ref from dock_read"),
          text: tool.schema.string().describe("Text to type into the element"),
          mode: tool.schema.enum(["editable", "keyboard"]).optional().describe("Native input method (default editable)"),
        },
        execute: (args, context) => call(context, "type", { ref: args.ref, text: args.text,
          ...(args.mode === undefined ? {} : { mode: args.mode }) }).then(toJSON, toolError),
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
