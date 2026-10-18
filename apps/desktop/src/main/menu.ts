import { app, BrowserWindow, Menu } from "electron"
import type { MenuItemConstructorOptions } from "electron"
import {
  DESKTOP_MENU,
  desktopMenuVisible,
  type DesktopMenuEntry,
  type DesktopMenuRole,
} from "@orchestra/app/desktop-menu"

import { UPDATER_ENABLED } from "./constants"
import { runDesktopMenuAction } from "./desktop-menu-actions"
import { nativeT } from "./native-translations"
import { macZoomItem } from "./menu-zoom"
import { applyMenuAvailability, menuItemId } from "./menu-availability"

type Deps = {
  trigger: (id: string) => void
  checkForUpdates: () => void
  relaunch: () => void
}

// Last command availability reported by each window's renderer; the native menu is global, so the focused window wins.
const availability = new Map<number, string[]>()
let commandCount = 0

export function setMenuAvailability(windowID: number, commands: string[]) {
  availability.set(windowID, commands)
  if (BrowserWindow.getFocusedWindow()?.id === windowID) applyFocused()
}

function applyFocused() {
  const id = BrowserWindow.getFocusedWindow()?.id
  applyMenuAvailability(Menu.getApplicationMenu(), (id !== undefined && availability.get(id)) || null)
}

app.on("browser-window-focus", applyFocused)

export function createMenu(deps: Deps) {
  if (process.platform !== "darwin") return
  commandCount = 0

  const template = DESKTOP_MENU.filter((menu) => desktopMenuVisible(menu, "macos")).map((menu) => {
    if (menu.role) return { role: nativeRole(menu.role), label: nativeT(menu.labelKey) }
    return {
      label: nativeT(menu.labelKey),
      submenu: menu.items
        ?.filter((entry) => desktopMenuVisible(entry, "macos"))
        .map((entry) => nativeItem(entry, deps)),
    }
  })

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  applyFocused()
}

function nativeItem(entry: DesktopMenuEntry, deps: Deps): MenuItemConstructorOptions {
  if (entry.type === "separator") return { type: "separator" }
  const zoom = macZoomItem(entry, (action) => runDesktopMenuAction(BrowserWindow.getFocusedWindow(), action))
  if (zoom) return { ...zoom, label: entry.labelKey ? nativeT(entry.labelKey) : undefined }
  if (entry.role) return { role: nativeRole(entry.role), label: entry.labelKey ? nativeT(entry.labelKey) : undefined }

  const item: MenuItemConstructorOptions = {
    id: entry.command ? menuItemId(entry.command, commandCount++) : undefined,
    label: entry.labelKey ? nativeT(entry.labelKey) : undefined,
    accelerator: entry.accelerator?.macos,
    enabled: entry.enabled === "updater" ? UPDATER_ENABLED : undefined,
  }

  if (entry.command) {
    const command = entry.command
    item.click = () => deps.trigger(command)
  }
  if (entry.action) {
    const action = entry.action
    item.click = () =>
      runDesktopMenuAction(BrowserWindow.getFocusedWindow(), action, {
        checkForUpdates: deps.checkForUpdates,
        relaunch: deps.relaunch,
      })
  }

  return item
}

function nativeRole(role: DesktopMenuRole) {
  return role as NonNullable<MenuItemConstructorOptions["role"]>
}
