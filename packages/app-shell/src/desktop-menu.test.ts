import { describe, expect, test } from "bun:test"
import { DESKTOP_MENU } from "./desktop-menu"
import { DESKTOP_NATIVE_ENGLISH } from "./i18n/desktop-native"

describe("desktop menu", () => {
  test("exports logs through the desktop command registry", () => {
    const items = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter(
      (item) => item.type === "item" && item.labelKey === "desktop.menu.exportLogs",
    )

    expect(items).toHaveLength(2)
    expect(items.every((item) => item.type === "item" && item.command === "logs.export" && !item.action)).toBe(true)
  })

  test("provides translated labels for role-backed entries", () => {
    const windowMenu = DESKTOP_MENU.find((menu) => menu.role === "windowMenu")
    const roleItems = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter(
      (item) => item.type === "item" && item.role && item.labelKey,
    )

    expect(windowMenu?.labelKey).toBe("desktop.menu.window")
    expect(roleItems.length).toBeGreaterThan(0)
  })

  test("the Help menu only exports logs and links nowhere outside the app", () => {
    const help = DESKTOP_MENU.find((menu) => menu.id === "help")

    expect(help?.items).toEqual([{ type: "item", labelKey: "desktop.menu.exportLogs", command: "logs.export" }])
    expect(DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter((item) => "href" in item)).toEqual([])
  })

  test("names HuGR Orchestra on the macOS items Electron would label with the process name", () => {
    const items = DESKTOP_MENU.find((menu) => menu.id === "app")?.items ?? []
    const labels = (["about", "hide", "quit"] as const).map((role) => {
      const item = items.find((entry) => entry.type === "item" && entry.role === role)
      return item?.type === "item" && item.labelKey ? DESKTOP_NATIVE_ENGLISH[item.labelKey] : undefined
    })

    expect(labels).toEqual(["About HuGR Orchestra", "Hide HuGR Orchestra", "Quit HuGR Orchestra"])
  })
})
