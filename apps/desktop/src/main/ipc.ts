import { stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import type { DesktopMenuAction } from "@orchestra/app/desktop-menu"
import { parseDesktopNativeBundle, type DesktopNativeBundle } from "@orchestra/app/i18n/desktop-native"

import type { FatalRendererError, ServerReadyData, TitlebarTheme } from "../preload/types"
import { runDesktopMenuAction } from "./desktop-menu-actions"
import { applyFocusedMenuAvailability, setMenuAvailability } from "./menu"
import { setForceFocus } from "./debug"
import { assertAttachmentBudget, createPickedFileAuthorizations } from "./attachment-picker"
import { getStore, removeStoreFileIfEmpty } from "./store"
import {
  getPinchZoomEnabled,
  getWindowID,
  openExternalURL,
  openLocalFileURL,
  setPinchZoomEnabled,
  settleUnload,
  setTitlebar,
  setTitlebarFrame,
  updateTitlebar,
} from "./windows"
import type { UpdaterController } from "./updater-controller"
import { isRendererOrigin, rendererDevUrl } from "./renderer-origin"
import { createUpdaterSubscriptions } from "./updater-subscriptions"
import { createDesktopDraftStore } from "./draft-store"
import { registerJanitorIpcHandlers } from "./janitor-ipc"
import { nativeT } from "./native-translations"
import { registerAppDockIpcHandlers } from "./ipc-app-dock"
import { registerResponseDownloadIpc } from "./response-download"
import { setWindowZoom } from "./window-zoom"
import { openDesktopPath } from "./apps"
import { registerLiveIpc } from "./live-ipc"
import type { LiveLoop } from "./live-loop"

const pickerFilters = (ext?: string[]) => {
  if (!ext || ext.length === 0) return undefined
  return [{ name: nativeT("desktop.dialog.files"), extensions: ext }]
}

const pickedFiles = createPickedFileAuthorizations()

type Deps = {
  liveLoop: LiveLoop
  killSidecar: () => Promise<void> | void
  relaunch: () => void
  awaitInitialization: () => Promise<ServerReadyData>
  consumeInitialDeepLinks: (target: number) => Promise<string[]> | string[]
  getDefaultServerUrl: () => Promise<string | null> | string | null
  setDefaultServerUrl: (url: string | null) => Promise<void> | void
  isFirstLaunchOnboardingPending: () => Promise<boolean> | boolean
  finishFirstLaunchOnboarding: (
    createDefaultProject: boolean,
    folderName?: string,
  ) => Promise<string | null> | string | null
  confirmFirstLaunchOnboarding: () => Promise<void> | void
  isOldLayoutEligible: () => Promise<boolean> | boolean
  getDisplayBackend: () => Promise<string | null>
  setDisplayBackend: (backend: string | null) => Promise<void> | void
  checkAppExists: (appName: string) => Promise<boolean> | boolean
  resolveAppPath: (appName: string) => Promise<string | null>
  updater: UpdaterController
  showUpdater: () => Promise<void> | void
  setBackgroundColor: (color: string) => void
  exportDebugLogs: () => Promise<string>
  recordFatalRendererError: (error: FatalRendererError) => Promise<void> | void
  setNativeTranslations: (bundle: DesktopNativeBundle) => void
}

export function registerIpcHandlers(deps: Deps) {
  // Every handler here is privileged, so none runs for a frame that is not the app's own renderer: a page the window
  // navigated to, or a subframe from another origin, never reaches the file system, the store or the sidecar.
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) =>
    isRendererOrigin(event.senderFrame?.url, rendererDevUrl(app.isPackaged, process.env.ELECTRON_RENDERER_URL))
  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]) =>
    ipcMain.handle(channel, (event, ...args) => {
      if (!trusted(event)) throw new Error(`Untrusted IPC sender: ${channel}`)
      return listener(event, ...args)
    })
  const on = (channel: string, listener: Parameters<typeof ipcMain.on>[1]) =>
    ipcMain.on(channel, (event, ...args) => {
      if (trusted(event)) listener(event, ...args)
    })
  const appDockIpc = registerAppDockIpcHandlers()
  registerResponseDownloadIpc({
    ipcMain,
    app,
    BrowserWindow,
    choose: (win, filename) =>
      dialog.showSaveDialog(win, {
        title: nativeT("desktop.dialog.saveFile"),
        defaultPath: filename,
      }),
  })
  const drafts = createDesktopDraftStore(join(app.getPath("userData"), "drafts.sqlite"))
  const updaterSubscriptions = createUpdaterSubscriptions()
  app.once("will-quit", updaterSubscriptions.clear)
  app.on("before-quit", () => drafts.flush())
  app.once("will-quit", () => drafts.close())
  app.on("browser-window-created", (_event, win) => win.on("session-end", () => drafts.flush()))

  handle("kill-sidecar", () => deps.killSidecar())
  handle("await-initialization", () => deps.awaitInitialization())
  handle("consume-initial-deep-links", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !getWindowID(win) || win.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame)
      throw new Error("Invalid deep link receiver")
    return deps.consumeInitialDeepLinks(event.sender.id)
  })
  handle("get-default-server-url", () => deps.getDefaultServerUrl())
  handle("set-default-server-url", (_event: IpcMainInvokeEvent, url: string | null) =>
    deps.setDefaultServerUrl(url),
  )
  handle("is-first-launch-onboarding-pending", () => deps.isFirstLaunchOnboardingPending())
  handle(
    "finish-first-launch-onboarding",
    (_event: IpcMainInvokeEvent, createDefaultProject: boolean, folderName?: string) =>
      deps.finishFirstLaunchOnboarding(createDefaultProject, typeof folderName === "string" ? folderName : undefined),
  )
  handle("confirm-first-launch-onboarding", () => deps.confirmFirstLaunchOnboarding())
  handle("is-old-layout-eligible", () => deps.isOldLayoutEligible())
  handle("get-display-backend", () => deps.getDisplayBackend())
  handle("set-display-backend", (_event: IpcMainInvokeEvent, backend: string | null) =>
    deps.setDisplayBackend(backend),
  )
  handle("check-app-exists", (_event: IpcMainInvokeEvent, appName: string) => deps.checkAppExists(appName))
  handle("resolve-app-path", (_event: IpcMainInvokeEvent, appName: string) => deps.resolveAppPath(appName))
  handle("updater-subscribe", (event) => {
    const id = event.sender.id
    updaterSubscriptions.set(
      id,
      deps.updater.subscribe((state) => {
        if (event.sender.isDestroyed()) return updaterSubscriptions.delete(id)
        event.sender.send("updater-state", state)
      }),
    )
    event.sender.once("destroyed", () => updaterSubscriptions.delete(id))
  })
  handle("updater-unsubscribe", (event) => updaterSubscriptions.delete(event.sender.id))
  handle("updater-check", () => deps.updater.check())
  handle("updater-install", () => deps.updater.install())
  handle("set-background-color", (_event: IpcMainInvokeEvent, color: string) => deps.setBackgroundColor(color))
  handle("export-debug-logs", () => deps.exportDebugLogs())
  handle("set-force-focus", (event: IpcMainInvokeEvent, enabled: boolean) =>
    setForceFocus(event.sender, enabled),
  )
  handle("record-fatal-renderer-error", (_event: IpcMainInvokeEvent, error: FatalRendererError) =>
    deps.recordFatalRendererError(error),
  )
  handle("set-native-translations", (event: IpcMainInvokeEvent, value: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || win.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame) {
      throw new Error("Invalid native translation sender")
    }
    const bundle = parseDesktopNativeBundle(value)
    if (!bundle) throw new Error("Invalid native translation bundle")
    deps.setNativeTranslations(bundle)
  })
  handle("store-get", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    try {
      const store = getStore(name)
      const value = store.get(key)
      if (value === undefined || value === null) return null
      return typeof value === "string" ? value : JSON.stringify(value)
    } catch {
      return null
    }
  })
  handle("store-set", (_event: IpcMainInvokeEvent, name: string, key: string, value: string) => {
    getStore(name).set(key, value)
  })
  handle("store-delete", (_event: IpcMainInvokeEvent, name: string, key: string) => {
    getStore(name).delete(key)
    removeStoreFileIfEmpty(name).catch((error: unknown) => console.error("failed to remove empty store", name, error))
  })
  handle("store-clear", (_event: IpcMainInvokeEvent, name: string) => {
    getStore(name).clear()
    removeStoreFileIfEmpty(name).catch((error: unknown) => console.error("failed to remove empty store", name, error))
  })
  handle("store-keys", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return Object.keys(store.store)
  })
  handle("store-length", (_event: IpcMainInvokeEvent, name: string) => {
    const store = getStore(name)
    return Object.keys(store.store).length
  })
  registerJanitorIpcHandlers({ ipcMain, app, BrowserWindow, getStore })
  handle("draft-get", (_event, key: string) => drafts.get(key))
  handle("draft-set", (_event, key: string, value: string) => drafts.set(key, value))
  handle("draft-delete", (_event, key: string) => drafts.set(key, null))
  handle("draft-blob-put", (_event, data: ArrayBuffer) => drafts.putBlob(new Uint8Array(data)))
  handle("draft-blob-get", (_event, id: string) => {
    const data = drafts.getBlob(id)
    return data ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : null
  })

  handle(
    "open-directory-picker",
    async (_event: IpcMainInvokeEvent, opts?: { multiple?: boolean; title?: string; defaultPath?: string }) => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", ...(opts?.multiple ? ["multiSelections" as const] : []), "createDirectory"],
        title: opts?.title ?? nativeT("desktop.dialog.chooseFolder"),
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return opts?.multiple ? result.filePaths : result.filePaths[0]
    },
  )

  handle(
    "open-file-picker",
    async (
      event: IpcMainInvokeEvent,
      opts?: { multiple?: boolean; title?: string; defaultPath?: string; extensions?: string[] },
    ) => {
      const result = await dialog.showOpenDialog({
        properties: ["openFile", ...(opts?.multiple ? ["multiSelections" as const] : [])],
        title: opts?.title ?? nativeT("desktop.dialog.chooseFile"),
        defaultPath: opts?.defaultPath,
        filters: pickerFilters(opts?.extensions),
      })
      if (result.canceled) return null
      const files = await Promise.all(
        result.filePaths.map(async (filePath) => ({
          path: filePath,
          name: basename(filePath),
          size: (await stat(filePath)).size,
        })),
      )
      assertAttachmentBudget(files)
      const token = pickedFiles.add(event.sender.id, result.filePaths)
      return { token, files }
    },
  )

  handle("read-picked-file", async (event: IpcMainInvokeEvent, token: string, filePath: string) => {
    return pickedFiles.read(event.sender.id, token, filePath)
  })

  handle("release-picked-files", (event: IpcMainInvokeEvent, token: string) => {
    pickedFiles.release(event.sender.id, token)
  })

  handle(
    "save-file-picker",
    async (_event: IpcMainInvokeEvent, opts?: { title?: string; defaultPath?: string }) => {
      const result = await dialog.showSaveDialog({
        title: opts?.title ?? nativeT("desktop.dialog.saveFile"),
        defaultPath: opts?.defaultPath,
      })
      if (result.canceled) return null
      return result.filePath ?? null
    },
  )

  on("open-external", (_event: IpcMainEvent, url: string) => {
    openExternalURL(url)
  })

  on("open-local-file", (_event: IpcMainEvent, url: string) => {
    openLocalFileURL(url)
  })

  handle("open-path", async (_event: IpcMainInvokeEvent, path: string, app?: string) => {
    return openDesktopPath(path, app, (target) => shell.openPath(target))
  })

  handle("reveal-path", async (_event: IpcMainInvokeEvent, path: string) => {
    const exists = await stat(path).then(
      () => true,
      () => false,
    )
    if (!exists) return false
    shell.showItemInFolder(path)
    return true
  })

  handle("read-clipboard-image", () => {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    const buffer = image.toPNG().buffer
    const size = image.getSize()
    return { buffer, width: size.width, height: size.height }
  })

  handle("get-window-id", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) throw new Error("Window not found")
    const id = getWindowID(win)
    if (!id) throw new Error("Window ID not found")
    return id
  })

  handle("get-window-focused", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFocused() ?? false
  })

  handle("get-window-fullscreen", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isFullScreen() ?? false
  })

  handle("set-window-focus", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.focus()
  })

  handle("show-window", (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.show()
  })

  on("relaunch", () => {
    deps.relaunch()
  })

  on("before-unload-done", (_event: IpcMainEvent, id: unknown) => settleUnload(id))

  handle("get-zoom-factor", (event: IpcMainInvokeEvent) => event.sender.getZoomFactor())
  handle("set-zoom-factor", (event: IpcMainInvokeEvent, factor: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.webContents !== event.sender) return
    setWindowZoom(win, factor, () => updateTitlebar(win))
  })
  registerLiveIpc(deps.liveLoop)
  handle("get-pinch-zoom-enabled", () => getPinchZoomEnabled())
  handle("set-pinch-zoom-enabled", (_event: IpcMainInvokeEvent, enabled: boolean) => {
    setPinchZoomEnabled(enabled)
  })
  handle("set-titlebar", (event: IpcMainInvokeEvent, theme: TitlebarTheme) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    setTitlebar(win, theme)
  })
  handle("run-desktop-menu-action", (event: IpcMainInvokeEvent, action: DesktopMenuAction) => {
    runDesktopMenuAction(BrowserWindow.fromWebContents(event.sender), action, {
      checkForUpdates: () => void deps.showUpdater(),
      relaunch: deps.relaunch,
    })
  })
  // The native menu is global, so it follows the focused window's last report.
  app.on("browser-window-focus", applyFocusedMenuAvailability)
  on("set-menu-availability", (event, commands: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || !Array.isArray(commands) || !commands.every((id) => typeof id === "string")) return
    setMenuAvailability(win.id, commands)
  })
  handle("set-titlebar-frame", (event: IpcMainInvokeEvent, frame: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || win.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame)
      throw new Error("Invalid titlebar frame sender")
    setTitlebarFrame(win, frame)
  })
  return appDockIpc
}

export function sendMenuCommand(win: BrowserWindow, id: string) {
  win.webContents.send("menu-command", id)
}

export function sendDeepLinks(win: BrowserWindow, urls: string[]) {
  win.webContents.send("deep-link", urls)
}
