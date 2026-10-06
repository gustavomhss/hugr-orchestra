import { expect, test } from "bun:test"
import { context, host, page, control, field } from "./app-dock.fixture"

const typed = { ok: true as const, value: { method: "keyboard", postcondition: "verified" } }

// Two app windows, each with its own focused field; only the active one receives keys.
const windows = (...items: Record<string, unknown>[]) => page([
  control("n:code", "Settings - Visual Studio Code", { role: 23, roleName: "frame", states: [1, 8], parentRef: null }),
  control("n:pad", "notes.txt - FeatherPad", { role: 23, roleName: "frame", states: [8], parentRef: null }),
  { ...field("n:pad-text", "notes.txt"), parentRef: "n:pad" },
  ...items.map((item) => ({ parentRef: "n:code", ...item }))])

test("ui_type without target or ref types into the field focused in the active window, and lets the helper re-prove focus", async () => {
  const { hooks, calls } = host((op) => op === "type" ? typed
    : windows(control("n:button", "Search"), { ...field("n:other", "Find"), states: [7, 8, 24] }, field("n:focused", "Search settings")))
  expect(JSON.parse(String(await hooks.tool.ui_type.execute({ text: "trim trailing whitespace" }, context)))).toEqual(typed.value)
  expect(calls.filter((call) => call.op === "type")).toEqual([{ op: "type",
    args: { ref: "n:focused", text: "trim trailing whitespace", mode: "keyboard", focused: true, world: "linux" } }])
})

test("ui_type into focus refuses without dispatch when focus is not on a text field", async () => {
  const button = host(() => windows(control("n:button", "Search", { states: [8, 12, 24] })))
  const refused = JSON.parse(String(await button.hooks.tool.ui_type.execute({ text: "x" }, context)))
  expect(refused).toMatchObject({ code: "target-not-found", outcome: "not-dispatched", found: 0, nameMatches: 1 })
  expect(refused.hints).toContain("The focused control does not take typed text; pass target {name, role} for the field")
  const nothing = host(() => windows(control("n:button", "Search")))
  expect(JSON.parse(String(await nothing.hooks.tool.ui_type.execute({ text: "x" }, context))))
    .toMatchObject({ code: "target-not-found", hint: "No control has keyboard focus; pass target {name, role} for the field" })
  const editable = host(() => windows(field("n:focused", "Search settings")))
  await expect(editable.hooks.tool.ui_type.execute({ text: "x", mode: "editable" }, context)).resolves.toContain("uses keyboard mode")
  expect([...button.calls, ...nothing.calls, ...editable.calls].every((call) => call.op === "read")).toBe(true)
  // dock_type still addresses browser tabs and keeps requiring a ref there.
  await expect(editable.hooks.tool.dock_type.execute({ text: "x" }, context)).resolves.toBe("Pass ref")
})

test("ui_pointer hovers or right-clicks a located control and passes refs straight through", async () => {
  const { hooks, calls } = host((op) => op === "pointer" ? { ok: true, value: { method: "pointer", dispatch: "acknowledged" } }
    : page([control("n:row", "Files Trim Trailing Whitespace", { roleName: "tree-item" }), control("n:other", "Editor")]))
  expect(JSON.parse(String(await hooks.tool.ui_pointer.execute({ kind: "contextMenu", target: { name: "trim trailing" } }, context))))
    .toEqual({ method: "pointer", dispatch: "acknowledged" })
  await hooks.tool.ui_pointer.execute({ kind: "hover", ref: "n:row" }, context)
  expect(calls.filter((call) => call.op === "pointer")).toEqual([
    { op: "pointer", args: { ref: "n:row", kind: "contextMenu", world: "linux" } },
    { op: "pointer", args: { ref: "n:row", kind: "hover", world: "linux" } }])
  await expect(hooks.tool.ui_pointer.execute({ kind: "hover" }, context)).resolves.toBe("ui_pointer requires target or ref")
})
