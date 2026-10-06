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
  expect(refused.hints).toContain("The focused control is not a text field ui_type can confirm; ui_keys with text types into whatever has focus, or pass target {name, role} for the field")
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

const keyed = { ok: true as const, value: { method: "keys", characters: 6, dispatch: "acknowledged", postcondition: "unverified" } }
// VS Code's command palette reports its highlighted list item as focused, not the input box that takes the keys.
const palette = control("n:item", "Accounts: Manage Accounts", { role: 32, roleName: "list-item", states: [8, 12, 23, 24] })

test("ui_keys text types into whatever has focus in the active window, where ui_type finds no text field", async () => {
  const { hooks, calls } = host((op) => op === "keyboard" ? keyed : windows(palette))
  expect(JSON.parse(String(await hooks.tool.ui_keys.execute({ text: "reload" }, context)))).toEqual(keyed.value)
  // FeatherPad's own focused field sits in an inactive window and is never the destination.
  expect(calls.filter((call) => call.op === "keyboard")).toEqual([{ op: "keyboard", args: { ref: "n:item", text: "reload", world: "linux" } }])
  await hooks.tool.ui_keys.execute({ text: "trim", target: { name: "Accounts", role: "list item" } }, context)
  expect(calls.filter((call) => call.op === "keyboard").at(-1)!.args).toEqual({ ref: "n:item", text: "trim", world: "linux" })
})

test("ui_keys text refuses without dispatch when nothing in the active window has focus, or with keys too", async () => {
  const unfocused = host(() => windows(control("n:button", "Search")))
  expect(JSON.parse(String(await unfocused.hooks.tool.ui_keys.execute({ text: "x" }, context)))).toEqual({ code: "target-not-found",
    outcome: "not-dispatched", found: 0, hint: "No control in the active app window has keyboard focus; open the field with its shortcut or pass target {name, role}" })
  const both = host(() => windows(palette))
  expect(await both.hooks.tool.ui_keys.execute({ text: "x", keys: "Return" }, context)).toBe("Pass keys or text, not both: press the combination in its own call")
  expect([...unfocused.calls, ...both.calls].every((call) => call.op === "read")).toBe(true)
})

test("with no active app window, keys and text refuse and say not to close or kill what holds the input", async () => {
  // A native dialog the app opened outside the accessibility tree leaves every exported window inactive.
  const dialog = host(() => page([control("n:code", "Welcome - Visual Studio Code", { role: 23, roleName: "frame", states: [8], parentRef: null }),
    { ...field("n:entry", "Search settings"), parentRef: "n:code" }]))
  for (const args of [{ keys: "Escape" }, { text: "x" }]) {
    const refused = JSON.parse(String(await dialog.hooks.tool.ui_keys.execute(args, context)))
    expect(refused).toMatchObject({ code: "target-not-found", outcome: "not-dispatched" })
  }
  const hint = JSON.parse(String(await dialog.hooks.tool.ui_keys.execute({ keys: "Escape" }, context))).hint
  expect(hint).toContain("Do not close or kill windows or processes to get around it")
  // The linux agent cannot ask anyone; it reports, and the owner acts.
  expect(hint).toContain("stop and report it, since the owner may need to click the app")
  expect(hint).not.toContain("ask the user")
  expect(dialog.calls.every((call) => call.op === "read")).toBe(true)
})
