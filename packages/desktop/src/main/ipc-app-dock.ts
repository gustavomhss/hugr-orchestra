import { join, resolve } from "node:path"
import { app, BrowserWindow, dialog, ipcMain, webContents } from "electron"
import type { IpcMainInvokeEvent } from "electron"
import type {
  LinuxInstallResult,
  LinuxLaunchResult,
  LinuxOpenResult,
  LinuxState,
  LinuxWindowsResult,
  LinuxFocusResult,
} from "@opencode-ai/app/app-dock-linux"

import { nativeT } from "./native-translations"
import {
  createAppDock,
  panelBoundsToContent,
  type AppDockEvent as NativeAppDockEvent,
  type AppDockFindResult,
  type AppDockTab,
} from "./app-dock"
import { AppDockLinux } from "./app-dock-linux"
import { AppDockRuntime, RuntimeError } from "./app-dock-runtime"
import { LinuxWorkspaceRPC } from "./linux-workspace-rpc"
import { AppDockProfileRegistry } from "./app-dock-profile-registry"
import { registerAppDockBridge, registerAppDockProfileResolver, registerAppDockWorkspacePreparation } from "./app-dock-rpc"
import { AppDockNativeWorkspace } from "./app-dock-native-workspace"
import { appDockBounds, appDockID, appDockProfileID, appDockTab, toCloneableAppDockEvent } from "./ipc-app-dock-validate"

const linuxRuntimes = new Map<string, ReturnType<typeof AppDockRuntime.create>>()
const linuxErrorCode = (error: unknown) => (error instanceof RuntimeError ? error.code : "failed")

export function registerAppDockIpcHandlers() {
  const root = join(app.getPath("userData"), "app-dock-linux")
  const runtime =
    linuxRuntimes.get(root) ??
    AppDockRuntime.create({
      root,
      context: app.isPackaged
        ? join(process.resourcesPath, "linux-runtime")
        : resolve(import.meta.dirname, "../../resources/linux-runtime"),
      image: app.isPackaged ? undefined : process.env.APP_DOCK_LINUX_IMAGE,
      nativePayload: app.isPackaged
        ? join(process.resourcesPath, "app-dock-accessibility")
        : resolve(import.meta.dirname, "../../resources/linux/app-dock-accessibility"),
    })
  linuxRuntimes.set(root, runtime)
  LinuxWorkspaceRPC.register(runtime.access)
  // These callbacks run after the coordinator is created, including for views it opens itself.
  const appDock = createAppDock({
    onVisibility: (senderID, identity, visible) => linux.visibility(senderID, identity, visible),
    onClosed: (senderID, identity) => linux.closed(senderID, identity),
    allowPopup: (senderID, identity, url) => linux.allowPopup(senderID, identity, url),
    onPopupOpened: (senderID, parent, tab) => linux.popupOpened(senderID, parent, tab),
    onExternalURL: (senderID, identity, url) => linux.externalURL(senderID, identity, url),
  })
  const linux = AppDockLinux.create({
    dock: appDock,
    runtime,
    notify: (senderID, event) => {
      const sender = webContents.fromId(senderID)
      if (sender && !sender.isDestroyed()) sender.send("app-dock-event", toCloneableAppDockEvent(event))
    },
  })
  const browserDock = linux.browser
  registerAppDockBridge(browserDock)
  registerAppDockWorkspacePreparation(AppDockNativeWorkspace.create(runtime))
  const appDockProfiles = AppDockProfileRegistry.load(app.getPath("userData"))
  const appDockDestroyHooks = new Set<number>()
  appDockProfiles.ensureActive("default")
  registerAppDockProfileResolver(() => {
    const profileID = appDockProfiles.manifest().activeProfileID || "default"
    return { profileID, storageKey: appDockProfiles.ensureActive(profileID).storageKey }
  })
  const appDockSender = (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || win.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame)
      throw new Error("Invalid App Dock sender")
    const senderID = event.sender.id
    if (!appDockDestroyHooks.has(senderID)) {
      appDockDestroyHooks.add(senderID)
      event.sender.once("destroyed", () => {
        appDockDestroyHooks.delete(senderID)
        linux.closeSender(senderID)
        appDock.closeAll(senderID, win)
      })
    }
    return win
  }
  ipcMain.handle(
    "app-dock-linux-open",
    (event: IpcMainInvokeEvent, bounds: unknown, profile: unknown = "default"): Promise<LinuxOpenResult> =>
      Promise.resolve()
        .then(async () => {
          const win = appDockSender(event)
          const contentBounds = panelBoundsToContent(appDockBounds(bounds), event.sender.getZoomFactor())
          const profileStorage = appDockProfiles.ensureActive(appDockProfileID(profile))
          const tab = await linux.open(event.sender.id, win, contentBounds, profileStorage)
          return { status: "opened", tab } as const
        })
        .catch((error: unknown) => ({ status: "failed", code: linuxErrorCode(error) })),
  )
  ipcMain.handle(
    "app-dock-linux-list",
    (event: IpcMainInvokeEvent): Promise<LinuxState> =>
      Promise.resolve()
        .then(() => {
          appDockSender(event)
          return runtime.state()
        })
        .catch((error: unknown) => ({ phase: "error", apps: [], error: linuxErrorCode(error) })),
  )
  ipcMain.handle(
    "app-dock-linux-install",
    (event: IpcMainInvokeEvent): Promise<LinuxInstallResult> =>
      Promise.resolve()
        .then(async () => {
          const win = appDockSender(event)
          const result = await dialog.showOpenDialog(win, {
            title: nativeT("desktop.dialog.chooseFile"),
            properties: ["openFile"],
            filters: [{ name: nativeT("desktop.dialog.files"), extensions: ["deb"] }],
          })
          if (result.canceled) return { status: "cancelled" } as const
          appDockSender(event)
          if (result.filePaths.length !== 1 || !result.filePaths[0]) throw new RuntimeError("invalid-package")
          const apps = await runtime.install(result.filePaths[0])
          return { status: "installed", apps } as const
        })
        .catch((error: unknown) => ({ status: "failed", code: linuxErrorCode(error) })),
  )
  ipcMain.handle(
    "app-dock-linux-launch",
    (event: IpcMainInvokeEvent, appID: unknown): Promise<LinuxLaunchResult> =>
      Promise.resolve()
        .then(async () => {
          appDockSender(event)
          if (
            typeof appID !== "string" ||
            appID.length > 512 ||
            !appID.endsWith(".desktop") ||
            /[\x00-\x1f/\\]/.test(appID)
          ) {
            throw new RuntimeError("failed")
          }
          await linux.launch(event.sender.id, appID)
          return { status: "launched" } as const
        })
        .catch((error: unknown) => ({ status: "failed", code: linuxErrorCode(error) })),
  )
  ipcMain.handle("app-dock-linux-windows", (event: IpcMainInvokeEvent, tabID: unknown, generation: unknown): Promise<LinuxWindowsResult> =>
    Promise.resolve().then(async () => {
      appDockSender(event)
      if (typeof generation !== "number" || !Number.isSafeInteger(generation) || generation <= 0) throw new RuntimeError("failed")
      return { status: "ready", windows: await linux.windows(event.sender.id, { tabID: appDockID(tabID, "tab"), generation }) } as const
    }).catch((error: unknown) => ({ status: "failed", code: linuxErrorCode(error) })),
  )
  ipcMain.handle("app-dock-linux-focus", (event: IpcMainInvokeEvent, tabID: unknown, generation: unknown, windowID: unknown): Promise<LinuxFocusResult> =>
    Promise.resolve().then(async () => {
      appDockSender(event)
      if (typeof generation !== "number" || !Number.isSafeInteger(generation) || generation <= 0 ||
        typeof windowID !== "number" || !Number.isSafeInteger(windowID) || windowID <= 0) throw new RuntimeError("failed")
      await linux.focus(event.sender.id, { tabID: appDockID(tabID, "tab"), generation }, windowID)
      return { status: "focused" } as const
    }).catch((error: unknown) => ({ status: "failed", code: linuxErrorCode(error) })),
  )
  ipcMain.handle(
    "app-dock-open",
    async (event: IpcMainInvokeEvent, address: unknown, bounds: unknown, profile: unknown = "default") => {
      const win = appDockSender(event)
      if (typeof address !== "string") throw new Error("Invalid App Dock address")
      const profileID = appDockProfileID(profile)
      const profileStorage = appDockProfiles.ensureActive(profileID)
      let opened = false
      const pendingEvents: NativeAppDockEvent[] = []
      const notify = (appDockEvent: NativeAppDockEvent) => {
        if (!opened) {
          pendingEvents.push(appDockEvent)
          return
        }
        if (!event.sender.isDestroyed()) event.sender.send("app-dock-event", toCloneableAppDockEvent(appDockEvent))
      }
      let tab: AppDockTab
      try {
        tab = await browserDock.open(
          event.sender.id,
          win,
          address,
          panelBoundsToContent(appDockBounds(bounds), event.sender.getZoomFactor()),
          notify,
          profileStorage,
        )
      } catch (error) {
        if (!event.sender.isDestroyed())
          pendingEvents.forEach((appDockEvent) =>
            event.sender.send("app-dock-event", toCloneableAppDockEvent(appDockEvent)),
          )
        throw error
      }
      opened = true
      if (!event.sender.isDestroyed()) {
        event.sender.send("app-dock-event", toCloneableAppDockEvent({ type: "tab-opened", payload: tab }))
        pendingEvents.forEach((appDockEvent) =>
          event.sender.send("app-dock-event", toCloneableAppDockEvent(appDockEvent)),
        )
      }
      return tab
    },
  )
  ipcMain.handle("app-dock-resize", (event: IpcMainInvokeEvent, tab: unknown, bounds: unknown) => {
    appDockSender(event)
    appDock.resize(
      event.sender.id,
      appDockTab(tab),
      panelBoundsToContent(appDockBounds(bounds), event.sender.getZoomFactor()),
    )
  })
  ipcMain.handle("app-dock-hide", (event: IpcMainInvokeEvent, tab: unknown) => {
    browserDock.hide(event.sender.id, appDockSender(event), appDockTab(tab))
  })
  ipcMain.handle("app-dock-occlude", (event: IpcMainInvokeEvent, occluded: unknown) => {
    appDockSender(event)
    if (typeof occluded !== "boolean") throw new Error("Invalid App Dock occlusion")
    appDock.occlude(event.sender.id, occluded)
  })
  ipcMain.handle("app-dock-close", (event: IpcMainInvokeEvent) => {
    browserDock.closeAll(event.sender.id, appDockSender(event))
  })
  ipcMain.handle("app-dock-list", (event: IpcMainInvokeEvent) => {
    appDockSender(event)
    return browserDock.list(event.sender.id).map((tab) => ({
      tabID: tab.tabID,
      generation: tab.generation,
      url: tab.url,
      active: tab.active,
    }))
  })
  ipcMain.handle("app-dock-close-tab", (event: IpcMainInvokeEvent, tabID: unknown) => {
    browserDock.close(event.sender.id, appDockSender(event), appDockID(tabID, "tab"))
  })
  ipcMain.handle("app-dock-recover-tab", (event: IpcMainInvokeEvent, tabID: unknown) => {
    appDockSender(event)
    return browserDock.recover(event.sender.id, appDockID(tabID, "tab"))
  })
  ipcMain.handle(
    "app-dock-close-tabs",
    (event: IpcMainInvokeEvent, tabID: unknown, scope: unknown, order?: unknown) => {
      appDockSender(event)
      const id = appDockID(tabID, "tab")
      if (scope !== "others" && scope !== "right") throw new Error("Invalid App Dock close scope")
      if (order !== undefined && (!Array.isArray(order) || order.some((item) => typeof item !== "string")))
        throw new Error("Invalid App Dock tab order")
      browserDock.closeTabs(event.sender.id, id, scope, order)
    },
  )
  ipcMain.handle("app-dock-select", (event: IpcMainInvokeEvent, tab: unknown, bounds: unknown) => {
    const win = appDockSender(event)
    browserDock.select(
      event.sender.id,
      win,
      appDockTab(tab),
      panelBoundsToContent(appDockBounds(bounds), event.sender.getZoomFactor()),
    )
  })
  ipcMain.handle("app-dock-navigate", (event: IpcMainInvokeEvent, tabID: unknown, address: unknown) => {
    appDockSender(event)
    if (typeof address !== "string") throw new Error("Invalid App Dock address")
    return browserDock.navigate(event.sender.id, appDockID(tabID, "tab"), address)
  })
  ipcMain.handle("app-dock-command", (event: IpcMainInvokeEvent, tabID: unknown, command: unknown) => {
    appDockSender(event)
    if (command !== "back" && command !== "forward" && command !== "reload") throw new Error("Invalid App Dock command")
    return browserDock.command(event.sender.id, appDockID(tabID, "tab"), command)
  })
  ipcMain.handle("app-dock-find", (event: IpcMainInvokeEvent, tabID: unknown, text: unknown, forward: unknown) => {
    appDockSender(event)
    if (typeof text !== "string") throw new Error("Invalid App Dock find text")
    if (typeof forward !== "boolean") throw new Error("Invalid App Dock find direction")
    return browserDock.find(event.sender.id, appDockID(tabID, "tab"), text, forward, (result: AppDockFindResult) => {
      if (!event.sender.isDestroyed()) event.sender.send("app-dock-find-result", result)
    })
  })
  ipcMain.handle("app-dock-stop-find", (event: IpcMainInvokeEvent, tabID: unknown) => {
    appDockSender(event)
    browserDock.stopFind(event.sender.id, appDockID(tabID, "tab"))
  })
  ipcMain.handle("app-dock-zoom", (event: IpcMainInvokeEvent, tabID: unknown, factor?: unknown) => {
    appDockSender(event)
    if (factor !== undefined && (typeof factor !== "number" || !Number.isFinite(factor) || factor <= 0))
      throw new Error("Invalid App Dock zoom")
    return browserDock.zoom(event.sender.id, appDockID(tabID, "tab"), factor)
  })
  ipcMain.handle("app-dock-cancel-download", (event: IpcMainInvokeEvent, id: unknown) => {
    appDockSender(event)
    appDock.cancelDownload(event.sender.id, appDockID(id, "download"))
  })
  ipcMain.handle("app-dock-open-download", (event: IpcMainInvokeEvent, id: unknown) => {
    appDockSender(event)
    return appDock.openDownload(event.sender.id, appDockID(id, "download")).then(() => undefined)
  })
  ipcMain.handle("app-dock-fullscreen", (event: IpcMainInvokeEvent, tabID: unknown, enabled: unknown) => {
    const win = appDockSender(event)
    if (typeof enabled !== "boolean") throw new Error("Invalid App Dock fullscreen state")
    return appDock.fullscreen(event.sender.id, win, appDockID(tabID, "tab"), enabled)
  })
  ipcMain.handle("app-dock-get-manifest", (event: IpcMainInvokeEvent) => {
    appDockSender(event)
    return appDockProfiles.manifest()
  })
  ipcMain.handle(
    "app-dock-update-manifest",
    (event: IpcMainInvokeEvent, expectedRevision: unknown, manifest: unknown) => {
      appDockSender(event)
      return appDockProfiles.replaceManifest(expectedRevision, manifest)
    },
  )
  ipcMain.handle("app-dock-delete-profile", async (event: IpcMainInvokeEvent, payload: unknown) => {
    const win = appDockSender(event)
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      Object.keys(payload).length !== 1 ||
      !("profileID" in payload)
    ) {
      throw new Error("Invalid App Dock profile deletion")
    }
    const profileID = appDockProfileID((payload as { profileID?: unknown }).profileID)
    const profileStorage = appDockProfiles.markDeleting(profileID)
    await appDock.deleteStorage(profileStorage.storageKey, win)
    appDockProfiles.markDeleted(profileID)
  })
  return {
    stopLinuxRuntime: () => {
      appDockDestroyHooks.forEach((senderID) => linux.invalidate(senderID))
      return runtime.stop()
    },
  }
}
