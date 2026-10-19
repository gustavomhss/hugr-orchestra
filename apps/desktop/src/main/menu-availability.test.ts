import { expect, test } from "bun:test"
import { applyMenuAvailability, menuItemId } from "./menu-availability"

function fixture() {
  const terminal = { id: menuItemId("terminal.toggle", 0), enabled: true }
  const tree = { id: menuItemId("fileTree.toggle", 1), enabled: true }
  const logsA = { id: menuItemId("logs.export", 2), enabled: true }
  const logsB = { id: menuItemId("logs.export", 3), enabled: true }
  const role = { enabled: true }
  const menu = {
    items: [
      { enabled: true, submenu: { items: [terminal, tree, role] } },
      { enabled: true, submenu: { items: [logsA, { enabled: true, submenu: { items: [logsB] } }] } },
    ],
  }
  return { menu, terminal, tree, logsA, logsB, role }
}

test("enables only the menu items whose commands the renderer reports as available", () => {
  const { menu, terminal, tree, logsA, logsB, role } = fixture()

  applyMenuAvailability(menu, ["terminal.toggle", "logs.export"])

  expect([terminal.enabled, tree.enabled, logsA.enabled, logsB.enabled]).toEqual([true, false, true, true])
  expect(role.enabled).toBe(true)
  expect(menu.items.every((item) => item.enabled)).toBe(true)
})

test("re-enables an item when its command becomes available again", () => {
  const { menu, tree } = fixture()

  applyMenuAvailability(menu, [])
  expect(tree.enabled).toBe(false)
  applyMenuAvailability(menu, ["fileTree.toggle"])
  expect(tree.enabled).toBe(true)
})

test("keeps everything enabled until the first report", () => {
  const { menu, terminal, tree } = fixture()

  applyMenuAvailability(menu, null)

  expect([terminal.enabled, tree.enabled]).toEqual([true, true])
  expect(() => applyMenuAvailability(null, [])).not.toThrow()
})
