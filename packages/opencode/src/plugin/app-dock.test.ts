import { expect, spyOn, test } from "bun:test"
import type { Hooks, PluginInput, ToolContext } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { AppDockPlugin, createAppDockHooks, scopeLinuxWorkspace } from "./app-dock"
import { Permission } from "@/permission"
import { context, input, fakePort, turn, admission, control, type Envelope } from "./app-dock.fixture"

type PermissionConfig = Parameters<typeof Permission.fromConfig>[0]


test("observed native action mode is explicit and survives actual tool schema and RPC", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const schema = tool.schema.object(hooks.tool.dock_action.args)
  expect(schema.parse({ ref: "n:observed", actionID: "a:checked", mode: "observed" }).mode).toBe("observed")
  expect(() => schema.parse({ ref: "n:observed", actionID: "a:checked", mode: "unsafe" })).toThrow()
  const result = hooks.tool.dock_action.execute({ ref: "n:observed", actionID: "a:checked", mode: "observed" }, context)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const envelope = f.sent[0] as { id: string; args: Record<string, unknown> }
  expect(envelope.args).toEqual({ ref: "n:observed", actionID: "a:checked", mode: "observed" })
  f.deliver({ type: "dock.rpc.result", id: envelope.id, ok: true, value: { identity: "observed-control", logicalIdentity: "unverified" } })
  expect(JSON.parse(String(await result))).toEqual({ identity: "observed-control", logicalIdentity: "unverified" })
})

const toolNames = [
  "ui_look",
  "ui_enter",
  "ui_up",
  "ui_list",
  "ui_read",
  "ui_find",
  "ui_act",
  "ui_type",
  "ui_keys",
  "ui_wait",
  "dock_list",
  "dock_activate",
  "dock_read",
  "dock_find",
  "dock_wait",
  "dock_screenshot",
  "dock_scroll",
  "dock_keyboard",
  "dock_evaluate",
  "dock_storage",
  "dock_network",
  "dock_click",
  "dock_action",
  "dock_type",
  "dock_navigate",
  "dock_go",
  "dock_open",
  "dock_close",
]

test("AppDockPlugin registers no tools without parentPort", async () => {
    const hooks = await AppDockPlugin(input)
    expect(hooks.tool ?? {}).toEqual({})
})

test("AppDockPlugin registers dock_* tools when parentPort present", async () => {
    const { port } = fakePort()
    const hooks = createAppDockHooks(port) as Required<Hooks>
    expect(Object.keys(hooks.tool).sort()).toEqual([...toolNames].sort())
})

test("AppDockPlugin executes posts dock.rpc envelope and resolves matching result", async () => {
    const { port, sent, deliver } = fakePort()
    const hooks = createAppDockHooks(port) as Required<Hooks>
    const promise = hooks.tool.dock_list.execute({}, context)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const envelope = sent[0] as { type: string; id: string; op: string; args: Record<string, unknown> }
    expect(envelope.type).toBe("dock.rpc")
    expect(envelope.op).toBe("list")
    expect(typeof envelope.id).toBe("string")
    expect(envelope.id.length).toBeGreaterThan(0)
    deliver({ type: "dock.rpc.result", id: envelope.id, ok: true, value: { count: 2 } })
    await expect(promise).resolves.toBe('{\n  "count": 2\n}')
})

test("AppDockPlugin asks scoped dock permission before sending RPC", async () => {
    const { port, sent, deliver } = fakePort()
    const requests: unknown[] = []
    const hooks = createAppDockHooks(port) as Required<Hooks>
    const promise = hooks.tool.dock_evaluate.execute(
      { script: "document.title" },
      { ...context, ask: async (request) => void requests.push(request) },
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(requests).toEqual([
      { permission: "dock", patterns: ["evaluate"], always: ["evaluate"], metadata: { operation: "evaluate" } },
    ])
    const envelope = sent[0] as { id: string; op: string }
    expect(envelope.op).toBe("evaluate")
    deliver({ type: "dock.rpc.result", id: envelope.id, ok: true, value: "ok" })
    await expect(promise).resolves.toBe('"ok"')
})

test("AppDockPlugin ignores results for other request ids", async () => {
    const { port, sent, deliver } = fakePort()
    const hooks = createAppDockHooks(port) as Required<Hooks>
    const promise = hooks.tool.dock_list.execute({}, context)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const envelope = sent[0] as { id: string }
    deliver({ type: "dock.rpc.result", id: "other", ok: true, value: 1 })
    await new Promise((resolve) => setTimeout(resolve, 0))
    deliver({ type: "dock.rpc.result", id: envelope.id, ok: true, value: 2 })
    await expect(promise).resolves.toBe("2")
})

test("AppDockPlugin rejects with error message from result", async () => {
    const { port, sent, deliver } = fakePort()
    const hooks = createAppDockHooks(port) as Required<Hooks>
    const promise = hooks.tool.dock_click.execute({ ref: 7 }, context)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const envelope = sent[0] as { id: string; op: string; args: { ref: number } }
    expect(envelope.op).toBe("click")
    expect(envelope.args.ref).toBe(7)
    deliver({ type: "dock.rpc.result", id: envelope.id, ok: false, error: { message: "Element ref 7 is gone" } })
    await expect(promise).resolves.toBe("Element ref 7 is gone")
})

test("AppDockPlugin passes typed args through envelope", async () => {
    const { port, sent, deliver } = fakePort()
    const hooks = createAppDockHooks(port) as Required<Hooks>
    const promise = hooks.tool.dock_read.execute({ budget: 25, maxText: 400 }, context)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const envelope = sent[0] as { id: string; op: string; args: { budget: number; maxText: number } }
    expect(envelope.op).toBe("read")
    expect(envelope.args).toEqual({ budget: 25, maxText: 400 })
    const go = hooks.tool.dock_go.execute({ command: "back" }, context)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const goEnvelope = sent[1] as { id: string; op: string; args: { command: string } }
    expect(goEnvelope.op).toBe("go")
    expect(goEnvelope.args.command).toBe("back")
    deliver({ type: "dock.rpc.result", id: envelope.id, ok: true, value: "done" })
    deliver({ type: "dock.rpc.result", id: goEnvelope.id, ok: true, value: "gone" })
    await expect(promise).resolves.toBe('"done"')
    await expect(go).resolves.toBe('"gone"')
})

test("AppDockPlugin routes coordinate clicks and scoped closes without destructive defaults", async () => {
    const { port, sent, deliver } = fakePort()
    const hooks = createAppDockHooks(port) as Required<Hooks>

    const click = hooks.tool.dock_click.execute({ x: 12, y: 34 }, context)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const clickEnvelope = sent[0] as { id: string; op: string; args: Record<string, unknown> }
    expect(clickEnvelope).toMatchObject({ op: "clickAt", args: { x: 12, y: 34 } })
    deliver({ type: "dock.rpc.result", id: clickEnvelope.id, ok: true, value: { ok: true } })
    await expect(click).resolves.toBe("{\n  \"ok\": true\n}")

    const close = hooks.tool.dock_close.execute({ tabID: "tab-1" }, context)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const closeEnvelope = sent[1] as { id: string; op: string; args: Record<string, unknown> }
    expect(closeEnvelope).toMatchObject({ op: "close", args: { tabID: "tab-1" } })
    deliver({ type: "dock.rpc.result", id: closeEnvelope.id, ok: true, value: [] })
    await expect(close).resolves.toBe("[]")
})

test("workspace pending is nonterminal and leaves full target for first admission", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const controller = new AbortController()
  const work = hooks.tool.dock_read.execute({}, { ...context, abort: controller.signal })
  await turn()
  const id = (f.sent[0] as Envelope).id
  f.deliver({ type: "dock.rpc.native-pending", id, backend: "linux-atspi", scopeKind: "workspace", ok: true, value: "wrong", target: { wrong: true } })
  controller.abort()
  f.deliver(admission(id))
  f.deliver({ type: "dock.rpc.native-pending", id, backend: "linux-atspi", scopeKind: "workspace", target: { wrong: true } })
  f.deliver({ type: "dock.rpc.result", id, ok: false, error: { code: "cancelled", message: "Cancelled", outcome: "unknown" } })
  expect(JSON.parse(String(await work))).toEqual({ backend: "linux-atspi", code: "cancelled", message: "Cancelled", outcome: "unknown", target: admission(id).target })
  expect(f.sent.slice(1)).toEqual([{ type: "dock.rpc.cancel", id }, { type: "dock.rpc.cancel", id }])
})

test("workspace pending makes timeout native unknown and cancels original UUID without inventing a target", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port, { timeoutMs: 25 }) as Required<Hooks>
  const work = hooks.tool.dock_read.execute({}, context)
  await turn()
  const id = (f.sent[0] as Envelope).id
  f.deliver({ type: "dock.rpc.native-pending", id, backend: "linux-atspi", scopeKind: "workspace" })
  expect(JSON.parse(String(await work))).toEqual({ backend: "linux-atspi", code: "transport-timeout", message: "App Dock read request timed out", outcome: "unknown" })
  expect(f.sent[1]).toEqual({ type: "dock.rpc.cancel", id })
})

test.each([
  { code: "unbind-failed", expected: "unbind-failed" },
  { code: "x".repeat(256), expected: "x".repeat(256) },
  { code: "x".repeat(257), expected: "native-cleanup-failed" },
  { code: "/private/cleanup", expected: "native-cleanup-failed" },
  { code: null, expected: "native-cleanup-failed" },
])("P1 cleanup: plugin preserves primary receipt and bounds separate evidence (%#)", async (cleanup) => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const work = hooks.tool.dock_action.execute({ ref: "n:button", actionID: "action" }, context)
  await turn()
  const id = (f.sent[0] as Envelope).id
  const primary = { backend: "linux-atspi", code: "wrong-scope", message: "Scope changed", outcome: "unknown",
    result: { dispatch: "acknowledged", receipt: "café 🧪", postcondition: "unverified" } }
  f.deliver({ type: "dock.rpc.result", id, ok: false, error: { ...primary,
    cleanup: { code: cleanup.code, outcome: "not-dispatched", message: "Do not publish /private/cleanup" } } })
  expect(JSON.parse(String(await work))).toEqual({ ...primary, cleanup: { code: cleanup.expected, outcome: "unknown" } })
})

test("actual tool schemas take numeric refs on browser tools and native refs, selectors and input modes on ui_* tools", () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const click = tool.schema.object(hooks.tool.dock_click.args).strict()
  const browserType = tool.schema.object(hooks.tool.dock_type.args).strict()
  const read = tool.schema.object(hooks.tool.ui_read.args)
  const type = tool.schema.object(hooks.tool.ui_type.args)
  const action = tool.schema.object(hooks.tool.ui_act.args)
  expect(click.safeParse({ ref: 7 }).success).toBe(true)
  expect(click.safeParse({ ref: 1.5 }).success).toBe(true)
  for (const ref of [0, "7", "n:button"]) expect(click.safeParse({ ref }).success).toBe(false)
  expect(browserType.safeParse({ ref: 7, text: "café 🧪" }).success).toBe(true)
  // The browser rejects empty text, and native refs and input modes do not exist there.
  for (const args of [{ ref: 7, text: "" }, { ref: "n:input", text: "x" }, { ref: 7, text: "x", mode: "keyboard" }])
    expect(browserType.safeParse(args).success).toBe(false)
  expect(read.safeParse({ rootRef: "n:root", cursor: "opaque", textOffset: 0 }).success).toBe(true)
  expect(read.safeParse({ rootRef: 7 }).success).toBe(false)
  expect(read.safeParse({ textOffset: 0.5 }).success).toBe(false)
  expect(read.safeParse({ cursor: "" }).success).toBe(false)
  expect(type.safeParse({ ref: "n:opaque:punctuation!?", text: "café 🧪 漢字 é", mode: "editable" }).success).toBe(true)
  expect(type.safeParse({ ref: `n:${"x".repeat(254)}`, text: "", mode: "keyboard" }).success).toBe(true)
  expect(type.safeParse({ ref: "n:input", text: "", mode: "fallback" }).success).toBe(false)
  for (const ref of [7, "7", "n:", `n:${"x".repeat(255)}`]) expect(type.safeParse({ ref, text: "" }).success).toBe(false)
  expect(action.safeParse({ ref: "n:button", actionID: "opaque-action" }).success).toBe(true)
  expect(action.safeParse({ ref: 7, actionID: "opaque-action" }).success).toBe(false)
  expect(action.safeParse({ ref: "n:button", actionID: "" }).success).toBe(false)
})

test("browser envelopes omit additive native fields and preserve coordinate precedence/error text", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const read = hooks.tool.dock_read.execute({}, context)
  const type = hooks.tool.dock_type.execute({ ref: 7, text: "" }, context)
  const click = hooks.tool.dock_click.execute({ ref: "n:ignored", x: 12, y: 34 }, context)
  await turn()
  expect((f.sent[0] as Envelope).args).toEqual({ budget: undefined, maxText: undefined })
  expect(Object.keys((f.sent[0] as Envelope).args)).toEqual(["budget", "maxText"])
  expect((f.sent[1] as Envelope).args).toEqual({ ref: 7, text: "" })
  expect(Object.keys((f.sent[1] as Envelope).args)).toEqual(["ref", "text"])
  expect(f.sent[2]).toMatchObject({ op: "clickAt", args: { x: 12, y: 34 } })
  await expect(hooks.tool.dock_click.execute({ ref: 7, x: 12 }, context)).resolves.toBe("dock_click requires both x and y")
  await expect(hooks.tool.dock_click.execute({}, context)).resolves.toBe("dock_click requires ref or both x and y")
  expect(f.sent.length).toBe(3)
  f.sent.forEach((sent) => f.deliver({ type: "dock.rpc.result", id: (sent as Envelope).id, ok: true, value: "ok" }))
  await Promise.all([read, type, click])
})

test("browser dock_read forwards tree-shape args exactly and keeps browser error and timeout semantics", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const read = tool.schema.object(hooks.tool.dock_read.args)
  expect(read.safeParse({ mode: "skeleton", format: "csv", actionable: true, visible: false }).success).toBe(true)
  expect(read.safeParse({ mode: "observed" }).success).toBe(false)
  expect(read.safeParse({ format: "xml" }).success).toBe(false)
  const shaped = hooks.tool.dock_read.execute({ budget: 50, mode: "a11y", format: "tree", actionable: true, visible: false }, context)
  const rejected = hooks.tool.dock_read.execute({ format: "csv" }, context)
  await turn()
  const args = (f.sent[0] as Envelope).args
  expect(args).toEqual({ budget: 50, maxText: undefined, mode: "a11y", format: "tree", actionable: true, visible: false })
  expect(Object.keys(args)).toEqual(["budget", "maxText", "mode", "format", "actionable", "visible"])
  f.deliver({ type: "dock.rpc.result", id: (f.sent[0] as Envelope).id, ok: false, error: { message: "Browser read failed" } })
  await expect(shaped).resolves.toBe("Browser read failed")
  // A native binding rejects shape args; the rejection stays visible instead of being ignored.
  const id = (f.sent[1] as Envelope).id
  f.deliver({ type: "dock.rpc.native-pending", id, backend: "linux-atspi", scopeKind: "workspace" })
  f.deliver({ type: "dock.rpc.result", id, ok: false,
    error: { backend: "linux-atspi", code: "unsupported-operation", message: "format is browser-only", outcome: "not-dispatched" } })
  expect(JSON.parse(String(await rejected))).toEqual({ backend: "linux-atspi", code: "unsupported-operation", message: "format is browser-only", outcome: "not-dispatched" })
  // The browser shape `mode` is not native input policy: a browser read timeout stays plain text and posts no cancel.
  const slow = fakePort()
  const timed = (createAppDockHooks(slow.port, { timeoutMs: 25 }) as Required<Hooks>).tool.dock_read.execute({ mode: "skeleton" }, context)
  await expect(timed).resolves.toBe("App Dock read request timed out")
  await turn()
  expect(slow.sent.map((sent) => (sent as Envelope).type)).toEqual(["dock.rpc"])
})

test("native read selectors/action/default click/input mode are wired without implicit action or keyboard fallback", async () => {
  const f = fakePort()
  const permissions: unknown[] = []
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const ctx = { ...context, ask: async (permission: unknown) => { permissions.push(permission) } }
  const work = [hooks.tool.dock_read.execute({ rootRef: "n:root", cursor: "cursor", textOffset: 0 }, ctx),
    hooks.tool.dock_click.execute({ ref: "n:button" }, ctx),
    hooks.tool.dock_action.execute({ ref: "n:button", actionID: "opaque-action" }, ctx),
    hooks.tool.dock_type.execute({ ref: "n:input", text: "café 🧪 漢字 é" }, ctx),
    hooks.tool.dock_type.execute({ ref: "n:input", text: "", mode: "keyboard" }, ctx)]
  await turn()
  expect(f.sent.map((sent) => ({ op: (sent as Envelope).op, args: (sent as Envelope).args }))).toEqual([
    { op: "read", args: { budget: undefined, maxText: undefined, rootRef: "n:root", cursor: "cursor", textOffset: 0 } },
    { op: "click", args: { ref: "n:button" } }, { op: "action", args: { ref: "n:button", actionID: "opaque-action" } },
    { op: "type", args: { ref: "n:input", text: "café 🧪 漢字 é" } }, { op: "type", args: { ref: "n:input", text: "", mode: "keyboard" } },
  ])
  expect(permissions[2]).toEqual({ permission: "dock", patterns: ["action"], always: ["action"], metadata: { operation: "action" } })
  f.sent.forEach((sent) => f.deliver({ type: "dock.rpc.result", id: (sent as Envelope).id, ok: true, value: { backend: "linux-atspi" } }))
  await Promise.all(work)
})

test("permission denial retains existing behavior and posts no request", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  await expect(hooks.tool.dock_type.execute({ ref: 7, text: "text" }, { ...context, ask: async () => { throw new Error("Permission denied") } })).resolves.toBe("Permission denied")
  expect(f.sent).toEqual([])
})

test("routing checks exact message type and does not confuse native notifications with results", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const work = hooks.tool.dock_list.execute({}, context)
  await turn()
  const id = (f.sent[0] as Envelope).id
  f.deliver({ type: "other.result", id, ok: true, value: "wrong" })
  f.deliver({ id, ok: true, value: "wrong" })
  f.deliver({ type: "dock.rpc.native-admitted", id, target: "invalid", ok: true, value: "wrong" })
  f.deliver({ type: "dock.rpc.result", id, ok: "true", value: "wrong" })
  f.deliver({ type: "dock.rpc.result", id: "foreign", ok: true, value: "wrong" })
  await turn()
  f.deliver({ type: "dock.rpc.result", id, ok: false, error: { message: "Browser error unchanged" } })
  await expect(work).resolves.toBe("Browser error unchanged")
})

test("native intent and admission preserve backend/code/outcome/result in model-visible JSON", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const native = hooks.tool.dock_click.execute({ ref: "n:button" }, context)
  const admitted = hooks.tool.dock_screenshot.execute({}, context)
  await turn()
  const first = (f.sent[0] as Envelope).id
  const second = (f.sent[1] as Envelope).id
  const error = { backend: "linux-atspi", code: "provider-rejected", message: "Provider declined", outcome: "unknown",
    result: { method: "action", dispatch: "rejected", postcondition: "unverified" } }
  f.deliver({ type: "dock.rpc.result", id: first, ok: false, error })
  f.deliver(admission(second))
  f.deliver({ type: "dock.rpc.result", id: second, ok: false, error: { code: "unsupported-operation", message: "Native screenshot unsupported", outcome: "not-dispatched", result: null } })
  expect(JSON.parse(await native as string)).toEqual(error)
  expect(JSON.parse(await admitted as string)).toEqual({ backend: "linux-atspi", code: "unsupported-operation", message: "Native screenshot unsupported", outcome: "not-dispatched", result: null, target: admission(second).target })
})

test("admission captures first target evidence and later marker cannot switch UUID to another tab", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const work = hooks.tool.dock_read.execute({}, context)
  await turn()
  const id = (f.sent[0] as Envelope).id
  const marker = admission(id)
  f.deliver(marker)
  marker.target.tabID = "mutated"
  f.deliver({ ...admission(id), target: { ...admission(id).target, tabID: "foreign" } })
  f.deliver({ type: "dock.rpc.result", id, ok: false, error: { code: "cancelled", message: "Cancelled", outcome: "unknown" } })
  expect(JSON.parse(await work as string).target).toEqual(admission(id).target)
})

test("abort before admission is retained and cancellation repeats with original UUID after target capture", async () => {
  const f = fakePort()
  const controller = new AbortController()
  const add = spyOn(controller.signal, "addEventListener")
  const remove = spyOn(controller.signal, "removeEventListener")
  const hooks = createAppDockHooks(f.port, { timeoutMs: 1000 }) as Required<Hooks>
  const work = hooks.tool.dock_read.execute({}, { ...context, abort: controller.signal })
  await turn()
  const id = (f.sent[0] as Envelope).id
  controller.abort()
  await turn()
  expect(f.sent[1]).toEqual({ type: "dock.rpc.cancel", id })
  f.deliver(admission(id))
  await turn()
  expect(f.sent[2]).toEqual({ type: "dock.rpc.cancel", id })
  f.deliver({ type: "dock.rpc.result", id, ok: false, error: { code: "cancelled", message: "No automatic retry", outcome: "unknown" } })
  expect(JSON.parse(await work as string)).toEqual({ backend: "linux-atspi", code: "cancelled", message: "No automatic retry", outcome: "unknown", target: admission(id).target })
  expect(add.mock.calls.length).toBe(1)
  expect(remove.mock.calls.length).toBe(1)
  add.mockRestore()
  remove.mockRestore()
})

test("already-aborted context still correlates cancellation before and on native admission", async () => {
  const f = fakePort()
  const controller = new AbortController()
  controller.abort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const work = hooks.tool.dock_type.execute({ ref: "n:input", text: "" }, { ...context, abort: controller.signal })
  await turn()
  const id = (f.sent[0] as Envelope).id
  expect(f.sent[1]).toEqual({ type: "dock.rpc.cancel", id })
  f.deliver(admission(id))
  await turn()
  expect(f.sent[2]).toEqual({ type: "dock.rpc.cancel", id })
  f.deliver({ type: "dock.rpc.result", id, ok: false, error: { code: "cancelled", message: "Cancelled", outcome: "not-dispatched" } })
  expect(JSON.parse(await work as string).outcome).toBe("not-dispatched")
})

test("abort after native admission sends captured request cancellation and keeps unknown result", async () => {
  const f = fakePort()
  const controller = new AbortController()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const work = hooks.tool.dock_click.execute({ ref: "n:button" }, { ...context, abort: controller.signal })
  await turn()
  const id = (f.sent[0] as Envelope).id
  f.deliver(admission(id))
  controller.abort()
  await turn()
  expect(f.sent[1]).toEqual({ type: "dock.rpc.cancel", id })
  f.deliver({ type: "dock.rpc.result", id, ok: false, error: { code: "cancelled", message: "Cancelled", outcome: "unknown", result: { dispatch: "unknown", postcondition: "unverified" } } })
  expect(JSON.parse(await work as string)).toMatchObject({ code: "cancelled", outcome: "unknown", result: { dispatch: "unknown", postcondition: "unverified" }, target: admission(id).target })
})

test("settlement removes abort listeners and timeout, one router listener serves shared port", async () => {
  const f = fakePort()
  const on = spyOn(f.port, "on")
  const controller = new AbortController()
  const remove = spyOn(controller.signal, "removeEventListener")
  const hooks = createAppDockHooks(f.port, { timeoutMs: 25 }) as Required<Hooks>
  const secondHooks = createAppDockHooks(f.port, { timeoutMs: 25 }) as Required<Hooks>
  const first = hooks.tool.dock_read.execute({}, { ...context, abort: controller.signal })
  const second = secondHooks.tool.dock_click.execute({ ref: "n:button" }, { ...context, abort: controller.signal })
  await turn()
  f.sent.forEach((sent) => f.deliver({ type: "dock.rpc.result", id: (sent as Envelope).id, ok: true, value: "done" }))
  await Promise.all([first, second])
  controller.abort()
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(f.sent.length).toBe(2)
  expect(remove.mock.calls.length).toBe(2)
  expect(on.mock.calls.length).toBe(1)
  remove.mockRestore()
  on.mockRestore()
})

test("native outer timeout is conservative unknown plus original-ID cancellation; browser text remains exact", async () => {
  const f = fakePort()
  const controller = new AbortController()
  const remove = spyOn(controller.signal, "removeEventListener")
  const hooks = createAppDockHooks(f.port, { timeoutMs: 25 }) as Required<Hooks>
  const admitted = hooks.tool.dock_wait.execute({}, { ...context, abort: controller.signal })
  const intent = hooks.tool.dock_click.execute({ ref: "n:button" }, context)
  const browser = hooks.tool.dock_click.execute({ ref: 7 }, context)
  await turn()
  const ids = f.sent.map((sent) => (sent as Envelope).id)
  f.deliver(admission(ids[0]))
  expect(JSON.parse(await admitted as string)).toEqual({ backend: "linux-atspi", code: "transport-timeout", message: "App Dock wait request timed out", outcome: "unknown", target: admission(ids[0]).target })
  expect(JSON.parse(await intent as string)).toEqual({ backend: "linux-atspi", code: "transport-timeout", message: "App Dock click request timed out", outcome: "unknown" })
  await expect(browser).resolves.toBe("App Dock click request timed out")
  await turn()
  expect(f.sent.slice(3)).toEqual([{ type: "dock.rpc.cancel", id: ids[0] }, { type: "dock.rpc.cancel", id: ids[1] }])
  expect(remove.mock.calls.length).toBe(1)
  remove.mockRestore()
  expect(() => createAppDockHooks(f.port, { timeoutMs: 0 })).toThrow("Invalid App Dock timeout")
})

test("pending requests are bounded per port and settlement recovers admission capacity", async () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const work = Array.from({ length: 32 }, () => hooks.tool.dock_list.execute({}, context))
  await turn()
  await expect(hooks.tool.dock_list.execute({}, context)).resolves.toBe("App Dock request capacity exhausted")
  expect(f.sent.length).toBe(32)
  f.sent.forEach((sent) => f.deliver({ type: "dock.rpc.result", id: (sent as Envelope).id, ok: true, value: "done" }))
  await Promise.all(work)
  const next = hooks.tool.dock_list.execute({}, context)
  await turn()
  f.deliver({ type: "dock.rpc.result", id: (f.sent[32] as Envelope).id, ok: true, value: "next" })
  await expect(next).resolves.toBe('"next"')
})

test("post failures release pending capacity/timers/listeners and preserve native transport failure", async () => {
  const f = fakePort()
  const controller = new AbortController()
  const remove = spyOn(controller.signal, "removeEventListener")
  f.port.postMessage = (message) => { f.sent.push(message); throw new Error("Port gone") }
  const hooks = createAppDockHooks(f.port, { timeoutMs: 25 }) as Required<Hooks>
  for (const _ of Array.from({ length: 33 }))
    await expect(hooks.tool.dock_list.execute({}, { ...context, abort: controller.signal })).resolves.toBe("Port gone")
  expect(JSON.parse(await hooks.tool.dock_click.execute({ ref: "n:button" }, { ...context, abort: controller.signal }) as string)).toEqual({ backend: "linux-atspi", code: "transport-error", message: "Port gone", outcome: "unknown" })
  expect(remove.mock.calls.length).toBe(34)
  controller.abort()
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(f.sent.length).toBe(34)
  remove.mockRestore()
})

test("cancel post failure settles native request and removes abort listener/timer", async () => {
  const f = fakePort()
  const controller = new AbortController()
  const remove = spyOn(controller.signal, "removeEventListener")
  const hooks = createAppDockHooks(f.port, { timeoutMs: 25 }) as Required<Hooks>
  const work = hooks.tool.dock_read.execute({}, { ...context, abort: controller.signal })
  await turn()
  const id = (f.sent[0] as Envelope).id
  f.deliver(admission(id))
  f.port.postMessage = (message) => { f.sent.push(message); throw new Error("Cancel port gone") }
  controller.abort()
  expect(JSON.parse(await work as string)).toEqual({ backend: "linux-atspi", code: "transport-error", message: "Cancel port gone", outcome: "unknown", target: admission(id).target })
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(f.sent).toHaveLength(2)
  expect(remove.mock.calls.length).toBe(1)
  remove.mockRestore()
})
