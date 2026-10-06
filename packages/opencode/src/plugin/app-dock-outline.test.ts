import { expect, test } from "bun:test"
import { AppDockOutline } from "./app-dock-outline"

// Shaped like VS Code's Welcome page in the workspace: deep unnamed wrappers, shortcuts inside names,
// numeric AT-SPI roles the helper cannot name, and an inactive view that is not showing.
const SHOWN = [8, 24, 25, 30]
const press = [{ id: "a", name: "press" }]
function vscode(extra: AppDockOutline.Item[] = []): AppDockOutline.Item[] {
  return [
    { ref: "f", parentRef: null, role: 23, roleName: "frame", name: "Welcome - Visual Studio Code", states: [1, ...SHOWN] },
    { ref: "s1", parentRef: "f", role: 85, roleName: "atspi-role-85", name: "", states: SHOWN },
    { ref: "s2", parentRef: "s1", role: 85, roleName: "atspi-role-85", name: "", states: SHOWN },
    { ref: "mb", parentRef: "s2", role: 34, roleName: "menu-bar", name: "", states: SHOWN },
    { ref: "mf", parentRef: "mb", role: 35, roleName: "menu-item", name: "File", states: SHOWN, actions: press },
    { ref: "tabs", parentRef: "s2", role: 38, roleName: "atspi-role-38", name: "Active View Switcher", states: SHOWN },
    { ref: "t1", parentRef: "tabs", role: 37, roleName: "atspi-role-37", name: "Explorer (Ctrl+Shift+E)", states: SHOWN, actions: press },
    { ref: "t2", parentRef: "tabs", role: 37, roleName: "atspi-role-37", name: "Search (Ctrl+Shift+F)", states: SHOWN, actions: press },
    { ref: "manage", parentRef: "s2", role: 63, roleName: "atspi-role-63", name: "Manage", states: SHOWN },
    { ref: "gear", parentRef: "manage", role: 43, roleName: "push-button", name: "Manage", states: SHOWN, actions: press },
    { ref: "s3", parentRef: "s2", role: 85, roleName: "atspi-role-85", name: "", states: SHOWN },
    { ref: "h", parentRef: "s3", role: 83, roleName: "atspi-role-83", name: "Start", states: SHOWN },
    { ref: "open", parentRef: "s3", role: 43, roleName: "push-button", name: "Open Folder...", states: SHOWN, actions: press },
    { ref: "label", parentRef: "s3", role: 116, roleName: "atspi-role-116", name: "", states: SHOWN },
    { ref: "search", parentRef: "s3", role: 79, roleName: "entry", name: "Search settings", states: [...SHOWN, 7, 12] },
    { ref: "hidden", parentRef: "s2", role: 85, roleName: "atspi-role-85", name: "Outline view", states: [8, 24] },
    { ref: "ghost", parentRef: "hidden", role: 43, roleName: "push-button", name: "Collapse All", states: [8, 24], actions: press },
    ...extra,
  ]
}

test("look gives a screen-reader map: windows, focus with its place, numbered regions, then controls", () => {
  const result = AppDockOutline.look(AppDockOutline.tree(vscode()))
  expect(result.text).toBe([
    'windows: frame "Welcome - Visual Studio Code" [active]',
    'focus: entry "Search settings" [focused] in frame "Welcome - Visual Studio Code" [active]',
    'scope: frame "Welcome - Visual Studio Code" [active]',
    "regions (ui_enter with the number):",
    "  #1 menu bar — 1 controls: File",
    '  #2 page tab list "Active View Switcher" — 2 controls: Explorer (Ctrl+Shift+E), Search (Ctrl+Shift+F)',
    '  #3 tool bar "Manage" — 1 controls: Manage',
    "controls here:",
    '  heading "Start"',
    '  push button "Open Folder..."',
    '  entry "Search settings" [focused]',
  ].join("\n"))
  expect(result.regions.map((region) => region.map((step) => `${step.role}:${step.name}`).join("/"))).toEqual([
    "frame:Welcome - Visual Studio Code/menu bar:", "frame:Welcome - Visual Studio Code/page tab list:Active View Switcher",
    "frame:Welcome - Visual Studio Code/tool bar:Manage"])
})

test("entering a region keeps it addressable across rescans, and a vanished region is reported missing", () => {
  const first = AppDockOutline.tree(vscode())
  const handle = AppDockOutline.look(first).regions[1]!
  const again = AppDockOutline.tree(vscode())
  const tabs = AppDockOutline.locate(again, handle)!
  expect(AppDockOutline.look(again, tabs).text).toContain('page tab "Explorer" keys=Ctrl+Shift+E')
  expect(AppDockOutline.list(tabs, "tabs")).toBe([
    '2 tabs in page tab list "Active View Switcher":',
    '  page tab "Explorer" keys=Ctrl+Shift+E',
    '  page tab "Search" keys=Ctrl+Shift+F',
  ].join("\n"))
  expect(AppDockOutline.locate(AppDockOutline.tree(vscode().filter((item) => !["tabs", "t1", "t2"].includes(item.ref))), handle)).toBeUndefined()
})

test("an open dialog becomes the scope because it holds the input", () => {
  const roots = AppDockOutline.tree(vscode([
    { ref: "d", parentRef: null, role: 16, roleName: "dialog", name: "Do you trust the authors?", states: [1, 16, ...SHOWN] },
    { ref: "yes", parentRef: "d", role: 43, roleName: "push-button", name: "Yes, I trust the authors", states: SHOWN, actions: press },
  ]))
  const text = AppDockOutline.look(roots).text
  expect(text).toContain('modal: dialog "Do you trust the authors?" [active] — it holds the input until it is closed')
  expect(text).toContain('scope: dialog "Do you trust the authors?" [active]')
  expect(text).toContain('push button "Yes, I trust the authors"')
  expect(text).not.toContain("Open Folder")
})

test("readable roles and shortcuts split from names", () => {
  expect(AppDockOutline.role({ role: 116, roleName: "atspi-role-116" })).toBe("static")
  expect(AppDockOutline.role({ roleName: "push-button" })).toBe("push button")
  expect(AppDockOutline.keys("Settings Ctrl+,")).toEqual({ name: "Settings", keys: "Ctrl+," })
  expect(AppDockOutline.keys("Explorer (Ctrl+Shift+E)")).toEqual({ name: "Explorer", keys: "Ctrl+Shift+E" })
  expect(AppDockOutline.keys("Shift+ is a key")).toEqual({ name: "Shift+ is a key" })
})

test("same-named regions in different panes stay distinct", () => {
  const panes = (): AppDockOutline.Item[] => vscode([
    { ref: "left", parentRef: "f", role: 39, roleName: "panel", name: "Left editor", states: SHOWN },
    { ref: "lt", parentRef: "left", role: 63, roleName: "tool bar", name: "Editor actions", states: SHOWN },
    { ref: "lb", parentRef: "lt", role: 43, roleName: "push-button", name: "Split Left", states: SHOWN, actions: press },
    { ref: "right", parentRef: "f", role: 39, roleName: "panel", name: "Right editor", states: SHOWN },
    { ref: "rt", parentRef: "right", role: 63, roleName: "tool bar", name: "Editor actions", states: SHOWN },
    { ref: "rb", parentRef: "rt", role: 43, roleName: "push-button", name: "Split Right", states: SHOWN, actions: press },
  ])
  const roots = AppDockOutline.tree(panes())
  const right = AppDockOutline.locate(roots, AppDockOutline.look(roots, AppDockOutline.locate(roots, [
    { role: "frame", name: "Welcome - Visual Studio Code", occurrence: 0 }, { role: "panel", name: "Right editor", occurrence: 0 }])!).regions[0]!)!
  const again = AppDockOutline.locate(AppDockOutline.tree(panes()), AppDockOutline.handle(roots, right))
  expect(again && AppDockOutline.list(again, "buttons")).toContain("Split Right")
})

// VS Code's Settings list wraps each row's toolbar in its own unnamed section: counted per parent, every toolbar got
// the same handle and ui_enter refused every number ui_look had just printed.
test("same-shaped regions in sibling wrappers each stay enterable across rescans", () => {
  const rows = (): AppDockOutline.Item[] => vscode([
    { ref: "tree", parentRef: "f", role: 65, roleName: "tree", name: "Settings", states: SHOWN },
    ...[1, 2].flatMap((row): AppDockOutline.Item[] => [
      { ref: `row${row}`, parentRef: "tree", role: 91, roleName: "tree-item", name: `Row ${row}`, states: SHOWN },
      { ref: `wrap${row}`, parentRef: `row${row}`, role: 85, roleName: "atspi-role-85", name: "", states: SHOWN },
      { ref: `bar${row}`, parentRef: `wrap${row}`, role: 63, roleName: "atspi-role-63", name: "Setting actions", states: SHOWN },
      { ref: `more${row}`, parentRef: `bar${row}`, role: 43, roleName: "push-button", name: `More ${row}`, states: SHOWN, actions: press },
    ]),
  ])
  const roots = AppDockOutline.tree(rows())
  const tree = AppDockOutline.locate(roots, AppDockOutline.look(roots).regions.find((region) => region.at(-1)!.name === "Settings")!)!
  const bars = AppDockOutline.look(roots, tree)
  expect(bars.text).toContain('#2 tool bar "Setting actions" — 1 controls: More 2')
  const again = AppDockOutline.tree(rows())
  expect(bars.regions.map((region) => AppDockOutline.locate(again, region)?.children[0]?.name)).toEqual(["More 1", "More 2"])
})

test("an app's top-level file chooser or alert is a window, and look says when no window holds the input", () => {
  const items: AppDockOutline.Item[] = [
    { ref: "f", parentRef: null, role: 23, roleName: "frame", name: "notes.txt - Mousepad", states: [12, ...SHOWN] },
    { ref: "d", parentRef: null, role: 19, roleName: "file-chooser", name: "Open File", states: [1, 16, ...SHOWN] },
    { ref: "loc", parentRef: "d", role: 61, roleName: "text", name: "", states: [7, 12, ...SHOWN] },
    { ref: "a", parentRef: null, role: 2, roleName: "alert", name: "Save changes?", states: SHOWN },
  ]
  const chooser = AppDockOutline.tree(items)
  expect(AppDockOutline.windows(chooser).map((node) => node.role)).toEqual(["frame", "file chooser", "alert"])
  // Keys reach only the active window: the chooser's focused field, not the frame's own focus.
  expect(AppDockOutline.focused(items.map((item) => ({ item }))).map((match) => match.item.ref)).toEqual(["loc"])
  expect(AppDockOutline.look(chooser).text).not.toContain("input: none")
  const inactive = AppDockOutline.look(AppDockOutline.tree(vscode().map((item) => item.ref === "f" ? { ...item, states: SHOWN } : item)))
  expect(inactive.text.split("\n")[1]).toBe("input: none of these windows is active; a window that shows no controls here (such as a native file dialog) or nothing holds the keyboard")
})
