import { expect, spyOn, test } from "bun:test"
import type { Hooks, PluginInput, ToolContext } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"
import { AppDockPlugin, createAppDockHooks, scopeLinuxWorkspace } from "./app-dock"
import { Permission } from "@/permission"
import { context, input, fakePort, host, page, control, field, nativeError, type Reply } from "./app-dock.fixture"

type PermissionConfig = Parameters<typeof Permission.fromConfig>[0]

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

test("target acts with a ref from the winner's own page because each native page retires earlier refs", async () => {
  const state = { latest: 0 }
  const dock = host((op, args) => {
    // The real host keeps only the latest page's observation; refs carry the page they were read on.
    if (op === "action") return String(args.ref).endsWith(`@${state.latest}`) ? { ok: true, value: { dispatch: "acknowledged" } }
      : nativeError("stale-ref")
    state.latest = args.cursor === undefined ? 1 : 2
    return state.latest === 1 ? page([control("n:open@1", "Open")], "c") : page([control("n:x@2", "Explorer")])
  })
  expect(JSON.parse(String(await dock.hooks.tool.dock_action.execute({ target: { name: "open" } }, context))))
    .toEqual({ dispatch: "acknowledged" })
  expect(dock.calls.map((call) => call.args.cursor === undefined ? `${call.op}:fresh` : `${call.op}:page`))
    .toEqual(["read:fresh", "read:page", "read:fresh", "read:page", "read:fresh", "action:fresh"])
})

test("dock_find lists a role without a name and dock_action takes an actionID passed as action", async () => {
  const dock = host((op) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } }
    : page([control("n:a", "Open"), field("n:search", "Search settings"), field("n:filter", "Filter")]))
  expect(JSON.parse(String(await dock.hooks.tool.dock_find.execute({ role: "Entry" }, context))))
    .toMatchObject({ found: 2, items: [{ ref: "n:search" }, { ref: "n:filter" }] })
  expect(await dock.hooks.tool.dock_find.execute({}, context)).toBe("dock_find needs name, role or both")
  expect(JSON.parse(String(await dock.hooks.tool.dock_action.execute({ ref: "n:a", action: "a:n:a" }, context))))
    .toEqual({ dispatch: "acknowledged" })
  expect(dock.calls.at(-1)).toEqual({ op: "action", args: { ref: "n:a", actionID: "a:n:a" } })
})

test("dock_keyboard sends native key combinations to a ref, a target or the one active window", async () => {
  const frame = (ref: string, name: string, active: boolean) => control(ref, name, { roleName: "frame", role: 23,
    states: active ? [1, 8, 24] : [8, 24], actions: [] })
  const dock = host((op) => op === "keyboard" ? { ok: true, value: { method: "keys", dispatch: "acknowledged" } }
    : page([frame("n:code", "Welcome - Visual Studio Code", true), frame("n:term", "xterm", false), control("n:a", "Open")]))
  const sent = () => dock.calls.filter((call) => call.op === "keyboard").map((call) => call.args)
  expect(JSON.parse(String(await dock.hooks.tool.dock_keyboard.execute({ keys: "ctrl+comma" }, context))))
    .toMatchObject({ dispatch: "acknowledged" })
  expect(JSON.parse(String(await dock.hooks.tool.dock_keyboard.execute({ keys: "Escape", ref: "n:a" }, context))))
    .toMatchObject({ dispatch: "acknowledged" })
  await dock.hooks.tool.dock_keyboard.execute({ keys: "F1", target: { name: "xterm", role: "frame" } }, context)
  expect(sent()).toEqual([{ ref: "n:code", keys: "ctrl+comma" }, { ref: "n:a", keys: "Escape" }, { ref: "n:term", keys: "F1" }])
  await dock.hooks.tool.dock_keyboard.execute({ type: "keyDown", key: "Enter" }, context)
  expect(sent().at(-1)).toEqual({ type: "keyDown", key: "Enter" })
  expect(await dock.hooks.tool.dock_keyboard.execute({ key: "Enter" }, context)).toContain("needs type and key")
  const idle = host(() => page([frame("n:term", "xterm", false)]))
  expect(JSON.parse(String(await idle.hooks.tool.dock_keyboard.execute({ keys: "ctrl+comma" }, context))))
    .toMatchObject({ code: "target-not-found", outcome: "not-dispatched" })
  expect(idle.calls.every((call) => call.op === "read")).toBe(true)
})

test("ui_* tools always address the Linux workspace and expose only native arguments", async () => {
  const dock = host((op) => op === "action" ? { ok: true, value: { dispatch: "acknowledged" } } : page([control("n:open", "Open")]))
  const scoped = { ...context, agent: "linux" } as ToolContext
  await dock.hooks.tool.ui_find.execute({ name: "open" }, scoped)
  await dock.hooks.tool.ui_act.execute({ target: { name: "open" } }, scoped)
  await dock.hooks.tool.ui_keys.execute({ keys: "ctrl+comma", ref: "n:open" }, scoped)
  expect(dock.calls.length).toBeGreaterThan(3)
  expect(dock.calls.every((call) => call.args.world === "linux")).toBe(true)
  expect(Object.keys(dock.hooks.tool.ui_read.args).sort()).toEqual(["budget", "cursor", "maxText", "rootRef", "textOffset"])
  expect(Object.keys(dock.hooks.tool.ui_keys.args).sort()).toEqual(["keys", "ref", "target"])
})

test("dock_* called by an agent addresses browser tabs; without an agent the legacy envelope is unchanged", async () => {
  const dock = host(() => ({ ok: true, value: [] }))
  await dock.hooks.tool.dock_list.execute({}, { ...context, agent: "build" } as ToolContext)
  await dock.hooks.tool.dock_list.execute({}, context)
  expect(dock.calls.map((call) => call.args)).toEqual([{ world: "browser" }, {}])
})

test("the Linux workspace is its own scope: host agents lose its tools, the linux agent holds only them", () => {
  const config: { permission?: unknown; agent?: Record<string, Record<string, unknown>> } = {
    permission: { "*": "allow", dock: "ask" }, agent: { linux: { model: "opencode/mimo" } } }
  scopeLinuxWorkspace(config)
  const tools = ["bash", "read", "edit", "webfetch", "task", "todowrite", "linux_exec", "linux_read", "ui_find", "ui_act", "dock_read", "dock_find"]
  const global = Permission.fromConfig(config.permission as PermissionConfig)
  const linux = Permission.merge(global, Permission.fromConfig(config.agent!.linux!.permission as PermissionConfig))
  expect([...Permission.disabled(tools, global)].sort()).toEqual(["linux_exec", "linux_read", "ui_act", "ui_find"])
  expect(tools.filter((tool) => !Permission.disabled(tools, linux).has(tool)).sort())
    .toEqual(["linux_exec", "linux_read", "todowrite", "ui_act", "ui_find"])
  // Execution asks under the plugin permission names; the user's own dock rule still applies inside the scope.
  expect(Permission.evaluate("linux", "exec", linux).action).toBe("allow")
  expect(Permission.evaluate("dock", "action", linux).action).toBe("ask")
  expect(config.agent!.linux).toMatchObject({ mode: "subagent", model: "opencode/mimo" })
  const plain: { permission?: unknown } = { permission: "ask" }
  scopeLinuxWorkspace(plain)
  expect(plain.permission).toEqual({ "*": "ask", "linux_*": "deny", "ui_*": "deny" })
})

test("ui_look maps the workspace, ui_enter zooms into a numbered region and ui_up leaves it, per session", async () => {
  const shown = [8, 24, 25, 30]
  const items = [
    { ref: "n:f", parentRef: null, role: 23, roleName: "frame", name: "Editor", states: [1, ...shown], actions: [] },
    { ref: "n:tb", parentRef: "n:f", role: 63, roleName: "atspi-role-63", name: "Manage", states: shown, actions: [] },
    control("n:gear", "Manage", { parentRef: "n:tb", states: shown }),
    control("n:open", "Open Folder...", { parentRef: "n:f", states: shown }),
  ]
  const dock = host(() => page(items))
  const scoped = { ...context, agent: "linux", sessionID: "ses_a" } as ToolContext
  const look = String(await dock.hooks.tool.ui_look.execute({}, scoped))
  expect(look).toContain('#1 tool bar "Manage" — 1 controls: Manage')
  expect(look).toContain('push button "Open Folder..."')
  const inside = String(await dock.hooks.tool.ui_enter.execute({ region: 1 }, scoped))
  expect(inside).toContain('scope: tool bar "Manage" (ui_up to leave)')
  expect(inside).not.toContain("Open Folder")
  expect(String(await dock.hooks.tool.ui_list.execute({ kind: "buttons" }, scoped))).toBe('1 buttons in tool bar "Manage":\n  push button "Manage"')
  // Another session keeps its own cursor.
  expect(String(await dock.hooks.tool.ui_look.execute({}, { ...scoped, sessionID: "ses_b" } as ToolContext))).toContain("Open Folder")
  expect(String(await dock.hooks.tool.ui_up.execute({}, scoped))).toContain("Open Folder")
  expect(dock.calls.every((call) => call.op === "read" && call.args.world === "linux")).toBe(true)
})
