import { expect, spyOn, test } from "bun:test"
import type { Hooks, PluginInput, ToolContext } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { AppDockPlugin, createAppDockHooks } from "./app-dock"

const context = { ask: async () => {}, abort: new AbortController().signal } as unknown as ToolContext
const input = {} as PluginInput

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

type FakePort = {
  postMessage(message: unknown): void
  on(event: string, listener: (event: { data: unknown }) => void): void
}

function fakePort(): { port: FakePort; sent: unknown[]; deliver: (payload: unknown) => void } {
  const sent: unknown[] = []
  const listeners: Array<(event: { data: unknown }) => void> = []
  return {
    sent,
    port: {
      postMessage(message: unknown) {
        sent.push(message)
      },
      on(_event: string, listener: (event: { data: unknown }) => void) {
        listeners.push(listener)
      },
    },
    deliver(payload: unknown) {
      for (const listener of listeners) listener({ data: payload })
    },
  }
}

const toolNames = [
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

const turn = () => new Promise((resolve) => setTimeout(resolve, 0))
type Envelope = { type: string; id: string; op: string; args: Record<string, unknown> }
const admission = (id: string) => ({ type: "dock.rpc.native-admitted", id, backend: "linux-atspi",
  target: { senderID: 1, tabID: "native", generation: 1, profileID: "profile", runtimeID: "runtime",
    runtimeEpoch: "epoch", appID: "app", launchEpoch: "launch", ownershipRevision: 1, accessibilitySessionID: "session" } })

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

test("actual tool schemas accept browser/native refs, native selectors and explicit input modes", () => {
  const f = fakePort()
  const hooks = createAppDockHooks(f.port) as Required<Hooks>
  const click = tool.schema.object(hooks.tool.dock_click.args)
  const read = tool.schema.object(hooks.tool.dock_read.args)
  const type = tool.schema.object(hooks.tool.dock_type.args)
  const action = tool.schema.object(hooks.tool.dock_action.args)
  expect(click.safeParse({ ref: 7 }).success).toBe(true)
  expect(click.safeParse({ ref: 1.5 }).success).toBe(true)
  expect(click.safeParse({ ref: "n:opaque:punctuation!?" }).success).toBe(true)
  expect(click.safeParse({ ref: `n:${"x".repeat(254)}` }).success).toBe(true)
  for (const ref of [0, "7", "n:", `n:${"x".repeat(255)}`]) expect(click.safeParse({ ref }).success).toBe(false)
  expect(read.safeParse({ rootRef: "n:root", cursor: "opaque", textOffset: 0 }).success).toBe(true)
  expect(read.safeParse({ rootRef: 7 }).success).toBe(false)
  expect(read.safeParse({ textOffset: 0.5 }).success).toBe(false)
  expect(read.safeParse({ cursor: "" }).success).toBe(false)
  expect(type.safeParse({ ref: 7, text: "" }).success).toBe(true)
  expect(type.safeParse({ ref: "n:input", text: "café 🧪 漢字 é", mode: "editable" }).success).toBe(true)
  expect(type.safeParse({ ref: "n:input", text: "", mode: "keyboard" }).success).toBe(true)
  expect(type.safeParse({ ref: "n:input", text: "", mode: "fallback" }).success).toBe(false)
  expect(action.safeParse({ ref: "n:button", actionID: "opaque-action" }).success).toBe(true)
  expect(action.safeParse({ ref: 7, actionID: "opaque-action" }).success).toBe(true)
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

type Reply = { ok: true; value: unknown } | { ok: false; error: Record<string, unknown> }

function host(respond: (op: string, args: Record<string, unknown>, index: number) => Reply, config: { findDeadlineMs?: number } = {}) {
  const f = fakePort()
  const calls: { op: string; args: Record<string, unknown> }[] = []
  f.port.postMessage = (message: unknown) => {
    const envelope = message as Envelope
    if (envelope.type !== "dock.rpc") return
    calls.push({ op: envelope.op, args: envelope.args })
    const reply = respond(envelope.op, envelope.args, calls.length - 1)
    queueMicrotask(() => f.deliver({ type: "dock.rpc.result", id: envelope.id, ...reply }))
  }
  return { hooks: createAppDockHooks(f.port, config) as Required<Hooks>, calls }
}

// coverage defaults to what the cursor implies; a final page may still report a partial traversal.
const page = (items: unknown[], cursor?: string, coverage?: { complete: boolean; reasons: string[] }): Reply => ({ ok: true, value: {
  backend: "linux-atspi", scopeKind: "workspace", observation: "obs", items, hasMore: cursor !== undefined,
  ...(cursor === undefined ? {} : { cursor }),
  coverage: coverage ?? { complete: cursor === undefined, reasons: cursor === undefined ? [] : ["page-limit"] } } })
const control = (ref: string, name: string, extra: Record<string, unknown> = {}) => ({
  ref, name, role: 43, roleName: "push-button", states: [8, 11, 24], interfaces: [], actions: [{ id: `a:${ref}`, name: "press" }],
  capabilities: { action: { supported: true, reason: "advertised-native-action" }, observedAction: { supported: true, reason: "x" },
    type: { supported: false, reason: "x" }, keyboardType: { supported: false, reason: "x" } }, ...extra })
const field = (ref: string, name: string) => control(ref, name, { role: 79, roleName: "entry", states: [7, 8, 12, 24], actions: [],
  capabilities: { action: { supported: false, reason: "x" }, observedAction: { supported: false, reason: "x" },
    type: { supported: true, reason: "x" }, keyboardType: { supported: true, reason: "x" } } })
const nativeError = (code: string, outcome = "not-dispatched"): Reply =>
  ({ ok: false, error: { backend: "linux-atspi", code, message: code, outcome } })

test("dock_find pages native continuations itself and returns compact matches from the matching observation", async () => {
  const { hooks, calls } = host((_op, args) => args.cursor === undefined ? page([control("n:a", "Explorer")], "c1")
    : args.cursor === "c1" ? page([control("n:b", "Sign In")], "c2") : page([control("n:c", "Continue without Signing In")], "c3"))
  const result = JSON.parse(String(await hooks.tool.dock_find.execute({ name: "continue WITHOUT" }, context)))
  expect(calls).toEqual([{ op: "read", args: { budget: 500, maxText: 0 } }, { op: "read", args: { cursor: "c1" } }, { op: "read", args: { cursor: "c2" } }])
  expect(result).toEqual({ found: 1, pagesScanned: 3, restarts: 0, searchComplete: false, items: [{ ref: "n:c", role: "push-button",
    name: "Continue without Signing In", states: [], actions: [{ id: "a:n:c", name: "press" }], can: ["action", "observedAction"] }] })
})

test("dock_find restarts read-only scans after stale continuations and surfaces exhaustion", async () => {
  const flaky = host((_op, args, index) => args.cursor !== undefined && index < 4 ? nativeError("cursor-stale")
    : args.cursor === undefined ? page([control("n:x", "Other")], "c") : page([control("n:y", "Search")]))
  expect(JSON.parse(String(await flaky.hooks.tool.dock_find.execute({ name: "search" }, context)))).toMatchObject({ found: 1, restarts: 2 })
  expect(flaky.calls.filter((call) => call.args.cursor === undefined).length).toBe(3)
  const stale = host((_op, args) => args.cursor === undefined ? page([], "c") : nativeError("cursor-stale"))
  expect(JSON.parse(String(await stale.hooks.tool.dock_find.execute({ name: "search" }, context)))).toMatchObject({ code: "cursor-stale" })
  expect(stale.calls.length).toBe(6)
})

test("dock_find reports an exhausted search and refuses browser snapshots", async () => {
  const empty = host(() => page([control("n:a", "Explorer")]))
  expect(JSON.parse(String(await empty.hooks.tool.dock_find.execute({ name: "missing" }, context))))
    .toEqual({ found: 0, pagesScanned: 1, restarts: 0, searchComplete: true, reasons: [], items: [] })
  const browser = host(() => ({ ok: true, value: { url: "https://example.com", items: [] } }))
  expect(JSON.parse(String(await browser.hooks.tool.dock_find.execute({ name: "x" }, context)))).toMatchObject({ code: "unsupported-backend" })
  expect(browser.calls.length).toBe(1)
})

test("dock_action target locates and acts in one call, refusing ambiguity without dispatch", async () => {
  const one = host((op, args) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
    : args.cursor === undefined ? page([control("n:a", "Explorer")], "c") : page([control("n:b", "Continue without Signing In")]))
  expect(JSON.parse(String(await one.hooks.tool.dock_action.execute({ target: { name: "continue without" }, action: "press" }, context))))
    .toEqual({ dispatch: "acknowledged" })
  expect(one.calls.at(-1)).toEqual({ op: "action", args: { ref: "n:b", actionID: "a:n:b" } })
  const two = host(() => page([control("n:a", "Search files"), control("n:b", "Search (Ctrl+Shift+F)")]))
  expect(JSON.parse(String(await two.hooks.tool.dock_action.execute({ target: { name: "search" } }, context))))
    .toMatchObject({ code: "target-ambiguous", outcome: "not-dispatched", found: 2 })
  const actions = host(() => page([control("n:a", "Search", { actions: [{ id: "a1", name: "press" }, { id: "a2", name: "showContextMenu" }] })]))
  expect(JSON.parse(String(await actions.hooks.tool.dock_action.execute({ target: { name: "search" } }, context))))
    .toMatchObject({ code: "action-ambiguous", outcome: "not-dispatched" })
  expect([...two.calls, ...actions.calls].every((call) => call.op === "read")).toBe(true)
  await expect(one.hooks.tool.dock_action.execute({ ref: "n:a" }, context)).resolves.toContain("needs the actionID")
})

test("target mutation retries only a certainly-undispatched stale ref, never an unknown outcome", async () => {
  const stale = host((op, _args, index) => op === "action" ? (index === 2 ? nativeError("stale-ref") : { ok: true, value: { dispatch: "acknowledged" } })
    : page([control("n:a", "Continue without Signing In")]))
  expect(JSON.parse(String(await stale.hooks.tool.dock_action.execute({ target: { name: "continue" } }, context)))).toEqual({ dispatch: "acknowledged" })
  expect(stale.calls.map((call) => call.op)).toEqual(["read", "read", "action", "read", "read", "action"])
  const unknown = host((op) => op === "action" ? nativeError("stale-ref", "unknown") : page([control("n:a", "Continue")]))
  expect(JSON.parse(String(await unknown.hooks.tool.dock_action.execute({ target: { name: "continue" } }, context))))
    .toMatchObject({ code: "stale-ref", outcome: "unknown" })
  expect(unknown.calls.filter((call) => call.op === "action").length).toBe(1)
})

test("dock_type target selects only fields with the requested native input capability", async () => {
  const { hooks, calls } = host((op) => op === "type" ? { ok: true, value: { postcondition: "verified" } }
    : page([control("n:button", "Search"), field("n:field", "Search files by name")]))
  const result = await hooks.tool.dock_type.execute({ target: { name: "search" }, text: "café 漢字 🧪", mode: "keyboard" }, context)
  expect(JSON.parse(String(result))).toEqual({ postcondition: "verified" })
  expect(calls.at(-1)).toEqual({ op: "type", args: { ref: "n:field", text: "café 漢字 🧪", mode: "keyboard" } })
  await expect(hooks.tool.dock_type.execute({ text: "x" }, context)).resolves.toBe("dock_type requires ref or target")
})

test("dock_action target prefers the one control whose whole name equals the query among partial matches", async () => {
  const { hooks, calls } = host((op) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
    : page([control("n:quick", "Open Quick Access"), control("n:open", " Open "), control("n:agents", "Open in Agents Window")]))
  expect(JSON.parse(String(await hooks.tool.dock_action.execute({ target: { name: "open", role: "push-button" } }, context))))
    .toEqual({ dispatch: "acknowledged" })
  expect(calls.filter((call) => call.op === "action")).toEqual([{ op: "action", args: { ref: "n:open", actionID: "a:n:open" } }])
})

test("dock_action target stays ambiguous without dispatch when two controls share the exact name", async () => {
  const { hooks, calls } = host(() => page([control("n:a", "Open"), control("n:quick", "Open Quick Access"), control("n:b", "Open")]))
  expect(JSON.parse(String(await hooks.tool.dock_action.execute({ target: { name: "Open", role: "push-button" } }, context))))
    .toMatchObject({ code: "target-ambiguous", outcome: "not-dispatched", found: 3 })
  expect(calls.every((call) => call.op === "read")).toBe(true)
})

test("dock_type target types into the exact-name field among partial matches", async () => {
  const { hooks, calls } = host((op) => op === "type" ? { ok: true, value: { postcondition: "verified" } }
    : page([field("n:files", "Search files by name"), field("n:search", "Search"), field("n:symbols", "Search symbols")]))
  const result = await hooks.tool.dock_type.execute({ target: { name: "SEARCH" }, text: "x", mode: "keyboard" }, context)
  expect(JSON.parse(String(result))).toEqual({ postcondition: "verified" })
  expect(calls.filter((call) => call.op === "type")).toEqual([{ op: "type", args: { ref: "n:search", text: "x", mode: "keyboard" } }])
})

test("dock_action target decides over the whole tree and acts on a later-page exact name with the rescan's ref", async () => {
  const { hooks, calls } = host((op, args, index) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
    : args.cursor === undefined ? page([control("n:quick", "Open Quick Access")], "c") : page([control(`n:open-${index}`, "Open")]))
  expect(JSON.parse(String(await hooks.tool.dock_action.execute({ target: { name: "Open" } }, context)))).toEqual({ dispatch: "acknowledged" })
  expect(calls.map((call) => call.op)).toEqual(["read", "read", "read", "read", "action"])
  expect(calls.at(-1)).toEqual({ op: "action", args: { ref: "n:open-3", actionID: "a:n:open-3" } })
})

test("dock_action target acts on a lone partial match only when it is the single match in the whole tree", async () => {
  const pages = (last: unknown[]) => host((op, args) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
    : args.cursor === undefined ? page([control("n:quick", "Open Quick Access")], "c1")
    : args.cursor === "c1" ? page([control("n:explorer", "Explorer")], "c2") : page(last))
  const lone = pages([control("n:other", "Terminal")])
  await lone.hooks.tool.dock_action.execute({ target: { name: "open" } }, context)
  expect(lone.calls.filter((call) => call.op === "action")).toEqual([{ op: "action", args: { ref: "n:quick", actionID: "a:n:quick" } }])
  const later = pages([control("n:open", "Open")])
  await later.hooks.tool.dock_action.execute({ target: { name: "open" } }, context)
  expect(later.calls.filter((call) => call.op === "action")).toEqual([{ op: "action", args: { ref: "n:open", actionID: "a:n:open" } }])
})

test("dock_action target refuses to act on a search cut off by the page bound", async () => {
  const { hooks, calls } = host((_op, _args, index) => page([control(`n:${index}`, index === 0 ? "Open" : "Explorer")], `c${index}`))
  expect(JSON.parse(String(await hooks.tool.dock_action.execute({ target: { name: "open" } }, context))))
    .toMatchObject({ code: "target-search-incomplete", outcome: "not-dispatched", found: 1, pagesScanned: 48, searchComplete: false })
  expect(calls.length).toBe(48)
  expect(calls.every((call) => call.op === "read")).toBe(true)
})

test("dock_action target refuses without dispatch when the rescan no longer finds the same control", async () => {
  const run = (second: unknown[]) => {
    const dock = host((op, _args, index) => index === 0 ? page([control("n:quick", "Open Quick Access"), control("n:open", "Open")])
      : op === "action" ? { ok: true, value: { dispatch: "acknowledged" } } : page(second))
    return dock.hooks.tool.dock_action.execute({ target: { name: "open" } }, context)
      .then((result) => ({ result: JSON.parse(String(result)), actions: dock.calls.filter((call) => call.op === "action").length }))
  }
  for (const second of [[control("n:quick", "Open Quick Access")], [control("n:open", "Open"), control("n:open2", "Open")]])
    expect(await run(second)).toMatchObject({ result: { code: "target-changed", outcome: "not-dispatched", item: { name: "Open" } }, actions: 0 })
  expect(await run([control("n:quick", "Open Quick Access"), control("n:fresh", "Open")])).toEqual({ result: { dispatch: "acknowledged" }, actions: 1 })
})

test("dock_action target refuses a unique match when the final page reports a partial traversal", async () => {
  const { hooks, calls } = host((op, args) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
    : args.cursor === undefined ? page([control("n:quick", "Open Quick Access")], "c")
    : page([control("n:other", "Terminal")], undefined, { complete: false, reasons: ["null-child"] }))
  expect(JSON.parse(String(await hooks.tool.dock_action.execute({ target: { name: "open" } }, context))))
    .toMatchObject({ code: "target-search-incomplete", outcome: "not-dispatched", found: 1, searchComplete: false, reasons: ["null-child"] })
  expect(calls.every((call) => call.op === "read")).toBe(true)
})

test("dock_action target refuses without dispatch when the rescanned winner moved in the tree", async () => {
  const run = (first: unknown[], second: unknown[]) => {
    const dock = host((op, _args, index) => index === 0 ? page(first)
      : op === "action" ? { ok: true, value: { dispatch: "acknowledged" } } : page(second))
    return dock.hooks.tool.dock_action.execute({ target: { name: "open" } }, context)
      .then((result) => ({ result: JSON.parse(String(result)), actions: dock.calls.filter((call) => call.op === "action").length }))
  }
  const changed = { result: { code: "target-changed", outcome: "not-dispatched", item: { name: "Open" } }, actions: 0 }
  expect(await run([control("n:open", "Open", { depth: 3, scopeDepth: 2 })], [control("n:open", "Open", { depth: 4, scopeDepth: 2 })]))
    .toMatchObject(changed)
  expect(await run([control("n:open", "Open", { depth: 3, scopeDepth: 2 })], [control("n:open", "Open", { depth: 3, scopeDepth: 1 })]))
    .toMatchObject(changed)
  expect(await run([control("n:x", "Explorer"), control("n:open", "Open")], [control("n:open", "Open"), control("n:x", "Explorer")]))
    .toMatchObject(changed)
  expect(await run([control("n:open", "Open", { depth: 3, scopeDepth: 2 })], [control("n:fresh", "Open", { depth: 3, scopeDepth: 2 })]))
    .toEqual({ result: { dispatch: "acknowledged" }, actions: 1 })
})

test("one tool-call deadline stops native paging and never dispatches after it", async () => {
  const paged = () => host((op, args) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
    : args.cursor === undefined ? page([control("n:x", "Explorer")], "c1")
    : args.cursor === "c1" ? page([control("n:y", "Terminal")], "c2") : page([control("n:open", "Open")]), { findDeadlineMs: 0 })
  const found = paged()
  expect(JSON.parse(String(await found.hooks.tool.dock_find.execute({ name: "open" }, context))))
    .toEqual({ found: 0, pagesScanned: 1, restarts: 0, searchComplete: false, reasons: ["page-limit", "tool-deadline"], items: [] })
  expect(found.calls.length).toBe(1)
  const acted = paged()
  expect(JSON.parse(String(await acted.hooks.tool.dock_action.execute({ target: { name: "open" } }, context))))
    .toMatchObject({ code: "target-search-incomplete", outcome: "not-dispatched", searchComplete: false })
  expect(acted.calls).toHaveLength(1)
  const single = host((op) => op === "type" ? { ok: true, value: { postcondition: "verified" } } : page([field("n:search", "Search")]),
    { findDeadlineMs: 0 })
  expect(JSON.parse(String(await single.hooks.tool.dock_type.execute({ target: { name: "search" }, text: "x" }, context))))
    .toMatchObject({ code: "target-search-incomplete", outcome: "not-dispatched", found: 1, searchComplete: false, reasons: ["tool-deadline"] })
  expect(single.calls.map((call) => call.op)).toEqual(["read", "read"])
  const stale = host(() => nativeError("cursor-stale"), { findDeadlineMs: 0 })
  expect(JSON.parse(String(await stale.hooks.tool.dock_find.execute({ name: "open" }, context)))).toMatchObject({ code: "cursor-stale" })
  expect(stale.calls).toHaveLength(1)
  expect(() => createAppDockHooks(fakePort().port, { findDeadlineMs: 90001 })).toThrow("Invalid App Dock find deadline")
})

test("dock_find marks an early stop with more pages as an incomplete search", async () => {
  const early = host(() => page([control("n:a", "Open")], "c"))
  expect(JSON.parse(String(await early.hooks.tool.dock_find.execute({ name: "open" }, context))))
    .toMatchObject({ found: 1, pagesScanned: 1, searchComplete: false })
  expect(early.calls.length).toBe(1)
  const last = host(() => page([control("n:a", "Open")]))
  const complete = JSON.parse(String(await last.hooks.tool.dock_find.execute({ name: " Open " }, context)))
  expect(complete).toMatchObject({ found: 1 })
  expect(complete).not.toHaveProperty("searchComplete")
  const blank = host(() => page([control("n:a", "Open")]))
  expect(JSON.parse(String(await blank.hooks.tool.dock_find.execute({ name: "  " }, context)))).toMatchObject({ found: 0 })
})

test("dock_action target refuses without dispatch when a homonym surfaces on another page between the scans", async () => {
  const run = (first: (cursor: unknown) => Reply, second: (cursor: unknown) => Reply) => {
    const pagesPerScan = 2
    const dock = host((op, args, index) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
      : index < pagesPerScan ? first(args.cursor) : second(args.cursor))
    return dock.hooks.tool.dock_action.execute({ target: { name: "open" } }, context)
      .then((result) => ({ result: JSON.parse(String(result)), actions: dock.calls.filter((call) => call.op === "action").length }))
  }
  const changed = { result: { code: "target-changed", outcome: "not-dispatched", item: { name: "Open" } }, actions: 0 }
  // Earlier page: the winner's own page is unchanged, so only a whole-tree recheck sees the new homonym.
  expect(await run((cursor) => cursor === undefined ? page([control("n:x", "Explorer")], "c") : page([control("n:open", "Open")]),
    (cursor) => cursor === undefined ? page([control("n:new", "Open")], "c") : page([control("n:open", "Open")]))).toMatchObject(changed)
  // Later page: a scan that stops at the winner's page never reaches it.
  expect(await run((cursor) => cursor === undefined ? page([control("n:open", "Open")], "c") : page([control("n:y", "Terminal")]),
    (cursor) => cursor === undefined ? page([control("n:open", "Open")], "c") : page([control("n:new", "Open")]))).toMatchObject(changed)
  expect(await run((cursor) => cursor === undefined ? page([control("n:open", "Open")], "c") : page([control("n:y", "Terminal")]),
    (cursor) => cursor === undefined ? page([control("n:fresh", "Open")], "c") : page([control("n:y", "Terminal")])))
    .toEqual({ result: { dispatch: "acknowledged" }, actions: 1 })
})

test("time waiting for a permission answer does not count against the tool-call deadline", async () => {
  const asking = { ...context, ask: async (request: { patterns: string[] }) => {
    if (request.patterns[0] === "action") await Bun.sleep(80)
  } } as unknown as ToolContext
  const { hooks, calls } = host((op, _args, index) => op === "action"
    ? (index === 2 ? nativeError("stale-ref") : { ok: true, value: { dispatch: "acknowledged" } })
    : page([control("n:a", "Continue")]), { findDeadlineMs: 40 })
  expect(JSON.parse(String(await hooks.tool.dock_action.execute({ target: { name: "continue" } }, asking))))
    .toEqual({ dispatch: "acknowledged" })
  expect(calls.map((call) => call.op)).toEqual(["read", "read", "action", "read", "read", "action"])
})

test("dock_find reports a partial traversal even when it found matches", async () => {
  const partial = host(() => page([control("n:a", "Open")], undefined, { complete: false, reasons: ["null-child"] }))
  expect(JSON.parse(String(await partial.hooks.tool.dock_find.execute({ name: "open" }, context))))
    .toMatchObject({ found: 1, searchComplete: false, reasons: ["null-child"] })
})

test("dock_action target accepts role spellings models use and reports controls its filters excluded", async () => {
  const box = (ref: string, extra: Record<string, unknown> = {}) => control(ref, "files.trimTrailingWhitespace", {
    roleName: "check-box", actions: [{ id: `a:${ref}`, name: "check" }],
    capabilities: { action: { supported: false, reason: "virtual-ancestry" }, observedAction: { supported: true, reason: "x" },
      type: { supported: false, reason: "x" }, keyboardType: { supported: false, reason: "x" } }, ...extra })
  const run = (args: Record<string, unknown>) => {
    const dock = host((op) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } } : page([box("n:box")]))
    return dock.hooks.tool.dock_action.execute(args as never, context)
      .then((result) => ({ result: JSON.parse(String(result)), actions: dock.calls.filter((call) => call.op === "action").length }))
  }
  // Default mode excludes a control that only supports observed actions; the miss names it and says how to retry.
  expect(await run({ target: { name: "files.trimTrailingWhitespace", role: "check-box" } })).toMatchObject({ result: {
    code: "target-not-found", outcome: "not-dispatched", found: 0, nameMatches: 1,
    hints: ['Controls with this name only support observed actions; retry with mode: "observed"'],
    nearMisses: [{ ref: "n:box", role: "check-box", can: ["observedAction"] }] }, actions: 0 })
  for (const role of ["checkbox", "Check Box", "check_box"])
    expect(await run({ target: { name: "files.trimTrailingWhitespace", role }, mode: "observed" }))
      .toEqual({ result: { dispatch: "acknowledged" }, actions: 1 })
  expect(await run({ target: { name: "files.trimTrailingWhitespace", role: "toggle" }, mode: "observed" })).toMatchObject({ result: {
    code: "target-not-found", hints: ['No control with this name has role "toggle"; roles found: check-box'] }, actions: 0 })
})

test("action-ambiguous names the actions the model can pass", async () => {
  const dock = host(() => page([field("n:search", "Search settings")].map((item) => ({ ...item,
    actions: [{ id: "a1", name: "activate" }, { id: "a2", name: "showContextMenu" }],
    capabilities: { ...item.capabilities, action: { supported: true, reason: "x" } } }))))
  expect(JSON.parse(String(await dock.hooks.tool.dock_action.execute({ target: { name: "search settings" }, action: "press" }, context))))
    .toMatchObject({ code: "action-ambiguous", hint: "Pass action as one of: activate, showContextMenu" })
})

test("native errors that have a known next step carry it as a hint", async () => {
  const unstable = host(() => nativeError("unstable-ref"))
  expect(JSON.parse(String(await unstable.hooks.tool.dock_action.execute({ ref: "n:a", actionID: "a:n:a" }, context))))
    .toMatchObject({ code: "unstable-ref", hint: 'This control sits below virtual ancestry (lists, trees); retry dock_action with mode: "observed"' })
  const plain = host(() => nativeError("capacity"))
  expect(JSON.parse(String(await plain.hooks.tool.dock_action.execute({ ref: "n:a", actionID: "a:n:a" }, context))))
    .not.toHaveProperty("hint")
  const empty = host((): Reply => ({ ok: false, error: { message: "App Dock has no open tabs" } }))
  expect(String(await empty.hooks.tool.dock_list.execute({}, context))).toContain("Apps > Linux workspace")
})

test("parallel native scans run one after another instead of fencing each other's pages", async () => {
  const dock = host((op, args) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
    : args.cursor === undefined ? page([control("n:x", "Explorer")], "c") : page([control("n:y", "Open")]))
  const [first, second] = await Promise.all([
    dock.hooks.tool.dock_find.execute({ name: "open" }, context),
    dock.hooks.tool.dock_action.execute({ target: { name: "open" } }, context),
  ])
  expect(JSON.parse(String(first))).toMatchObject({ found: 1 })
  expect(JSON.parse(String(second))).toEqual({ dispatch: "acknowledged" })
  // A fresh read starts a new observation; it must never land between another call's fresh read and its cursor pages.
  expect(dock.calls.map((call) => call.args.cursor === undefined ? `${call.op}:fresh` : `${call.op}:page`)).toEqual([
    "read:fresh", "read:page", "read:fresh", "read:page", "read:fresh", "read:page", "action:fresh"])
})
