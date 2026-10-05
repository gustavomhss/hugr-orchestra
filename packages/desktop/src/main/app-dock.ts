import { app, WebContentsView } from "electron"
import type { BrowserWindow } from "electron"
import { randomUUID } from "node:crypto"
import type { EventEmitter } from "node:events"
import {
  appDockAttached,
  appDockShown,
  appDockURL,
  panelBoundsToContent,
  type DockBounds,
} from "./app-dock-utils"
export type { DockBounds } from "./app-dock-utils"
import type { AppDockAPI } from "./app-dock-api"
import { identity, type AppDockContext, type AppDockRecord, type AppDockRefTarget } from "./app-dock-context"
import { createAppDockFullscreen } from "./app-dock-fullscreen"
import { createAppDockInput } from "./app-dock-input"
import { createAppDockNavigation } from "./app-dock-navigation"
import { createAppDockPage } from "./app-dock-page"
import { createAppDockSessions } from "./app-dock-session"

export type AppDockIdentity = Readonly<{ tabID: string; generation: number }>
export type AppDockTab = AppDockIdentity & { url: string }
export type ProfileStorage = Readonly<{ storageKey: string }>

export type AppDockState = AppDockIdentity & {
  url: string
  title: string
  favicon?: string
  loading: boolean
  audible: boolean
  canGoBack: boolean
  canGoForward: boolean
}
export type AppDockFindResult = AppDockIdentity & {
  requestID: number
  activeMatchOrdinal: number
  matches: number
  finalUpdate: boolean
}
export type AppDockDownload = AppDockIdentity & {
  id: string
  filename: string
  receivedBytes: number
  totalBytes: number
  state: "progressing" | "paused" | "completed" | "cancelled" | "interrupted"
}
export type AppDockEvent =
  | Readonly<{ type: "state"; payload: AppDockState }>
  | Readonly<{ type: "tab-opened" | "tab-opened-background"; payload: AppDockTab }>
  | Readonly<{ type: "tab-selected"; payload: AppDockIdentity }>
  | Readonly<{
      type: "tab-crashed"
      payload: { identity: AppDockIdentity; reason: "crashed" | "killed" | "oom" }
    }>
  | Readonly<{ type: "tab-recovered"; payload: AppDockTab }>
  | Readonly<{ type: "download"; payload: AppDockDownload }>
  | Readonly<{
      type: "permission"
      payload: { identity: AppDockIdentity; permission: string; state: "denied" }
    }>
  | Readonly<{ type: "fullscreen"; payload: { identity: AppDockIdentity; enabled: boolean } }>
  | Readonly<{
      type: "navigation-error"
      payload: { identity: AppDockIdentity; code: "blocked" | "failed"; url: string }
    }>

export { panelBoundsToContent }

export type AppDock = AppDockAPI

export function createAppDock(options: {
  developmentMode?: () => boolean
  onVisibility?: (senderID: number, identity: AppDockIdentity, visible: boolean) => void
  onClosed?: (senderID: number, identity: AppDockIdentity) => void
  allowPopup?: (senderID: number, identity: AppDockIdentity, url: string) => boolean
  onPopupOpened?: (senderID: number, parent: AppDockIdentity, tab: AppDockTab) => void
  onExternalURL?: (senderID: number, identity: AppDockIdentity, url: string) => boolean | undefined
} = {}): AppDockAPI {
  const developmentMode = options.developmentMode ?? (() => !app.isPackaged)
  const tabs = new Map<number, Map<string, AppDockRecord>>()
  const removalListeners = new Set<(identity: Readonly<{ senderID: number; tabID: string; generation: number }>) => void>()
  const refTargets = new Map<string, Map<number, AppDockRefTarget>>()
  const blockedNavigationVersions = new Map<string, number>()
  const tabByContents = new Map<number, { senderID: number; tabID: string; generation: number }>()
  const active = new Map<number, string>()
  // Senders whose renderer draws an overlay over the Dock. Their views stay hidden until released,
  // including views shown while it holds, because native views always paint above the renderer.
  const occluded = new Set<number>()
  const layoutBounds = new Map<number, DockBounds>()
  let lastLayoutBounds: DockBounds | undefined
  const inactive = new Map<string, { senderID: number; tabID: string }>()
  const refNamespaces = new Map<string, number>()
  let generation = 0
  let refNamespace = 0
  const MAX_INACTIVE_TABS = 20

  const validBounds = (bounds: DockBounds) =>
    [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) && bounds.width > 0 && bounds.height > 0
  const usableBounds = (bounds: DockBounds) => validBounds(bounds) && bounds.width > 1 && bounds.height > 1
  const isCurrent = (senderID: number, tabID: string, tabGeneration: number) =>
    tabs.get(senderID)?.get(tabID)?.generation === tabGeneration
  const nextRefNamespace = () => ++refNamespace
  const ctx: AppDockContext = { tabs, active, tabByContents, refTargets, refNamespaces, blockedNavigationVersions, isCurrent, nextRefNamespace }
  const fullscreen = createAppDockFullscreen(ctx)
  const sessions = createAppDockSessions(ctx)
  const navigation = createAppDockNavigation(ctx)
  const page = createAppDockPage(ctx)
  const input = createAppDockInput(ctx)
  const markInactive = (senderID: number, tabID: string, record: AppDockRecord) => {
    // Electron can force a hidden widget shown when setting throttling. Enable
    // it before the real hide transition and do not repeat it on hidden views.
    if (!record.view.webContents.getBackgroundThrottling()) record.view.webContents.setBackgroundThrottling(true)
    options.onVisibility?.(senderID, identity(tabID, record.generation), false)
    record.view.setVisible(false)
    inactive.delete(`${senderID}:${tabID}`)
    inactive.set(`${senderID}:${tabID}`, { senderID, tabID })
  }
  const remove = (senderID: number, tabID: string) => {
    const record = tabs.get(senderID)?.get(tabID)
    if (!record) return
    refTargets.delete(`${senderID}:${tabID}`)
    blockedNavigationVersions.delete(`${senderID}:${tabID}`)
    refNamespaces.delete(`${senderID}:${tabID}`)
    fullscreen.releaseRemoved(senderID, tabID, record)
    if (!record.win.isDestroyed()) record.win.contentView.removeChildView(record.view)
    inactive.delete(`${senderID}:${tabID}`)
    tabByContents.delete(record.view.webContents.id)
    record.cleanups.forEach((cleanup) => cleanup())
    sessions.cancelTab(senderID, tabID, record.generation)
    record.view.webContents.close()
    options.onClosed?.(senderID, identity(tabID, record.generation))
    tabs.get(senderID)?.delete(tabID)
    removalListeners.forEach((listener) => listener(Object.freeze({ senderID, tabID, generation: record.generation })))
    generation++
    if (active.get(senderID) === tabID) active.delete(senderID)
  }
  const clearSender = (senderID: number, win?: BrowserWindow) => {
    fullscreen.clearSender(senderID, win)
    active.delete(senderID)
    layoutBounds.delete(senderID)
  }
  const close = (senderID: number, win?: BrowserWindow, tabID?: string) => {
    const senderTabs = tabs.get(senderID)
    if (!senderTabs) return
    let ids: string[]
    if (tabID) ids = [tabID]
    else {
      const activeTabID = active.get(senderID)
      ids = activeTabID ? [activeTabID] : []
    }
    const closingActive = ids.some((id) => active.get(senderID) === id)
    const closedIndex = [...senderTabs.keys()].indexOf(ids[0]!)
    ids.forEach((id) => remove(senderID, id))
    const remaining = tabs.get(senderID)
    if (!remaining || remaining.size === 0) {
      tabs.delete(senderID)
      clearSender(senderID, win)
      return
    }
    if (closingActive && !active.has(senderID)) {
      const remainingIDs = [...remaining.keys()]
      const nextTabID = remainingIDs[Math.max(0, Math.min(closedIndex - 1, remainingIDs.length - 1))]
      const next = nextTabID ? remaining.get(nextTabID) : undefined
      if (nextTabID && next) {
        if (win && !win.isDestroyed()) {
          win.contentView.addChildView(next.view)
          next.view.setBounds(layoutBounds.get(senderID) ?? next.view.getBounds())
          next.view.setVisible(true)
          next.view.webContents.setBackgroundThrottling(false)
        }
        inactive.delete(`${senderID}:${nextTabID}`)
        active.set(senderID, nextTabID)
        options.onVisibility?.(senderID, identity(nextTabID, next.generation), true)
        next.notify(Object.freeze({ type: "tab-selected", payload: identity(nextTabID, next.generation) }))
      }
    }
  }
  const closeAll = (senderID: number, win: BrowserWindow) => {
    const senderTabs = tabs.get(senderID)
    if (!senderTabs) return
    ;[...senderTabs.keys()].forEach((tabID) => remove(senderID, tabID))
    tabs.delete(senderID)
    clearSender(senderID, win)
  }
  const evictOldestInactive = (senderID?: number) => {
    for (const oldest of inactive.values()) {
      if (senderID === undefined || oldest.senderID === senderID) {
        remove(oldest.senderID, oldest.tabID)
        return true
      }
    }
    return false
  }
  const viewCapacity = (senderID: number, selected: boolean) =>
    inactive.size + (selected ? Number(active.has(senderID)) : 1) <= MAX_INACTIVE_TABS
  const ensureViewCapacity = (senderID: number, selected: boolean) => {
    while (!viewCapacity(senderID, selected)) {
      if (!evictOldestInactive()) throw new Error("App Dock tab limit reached")
    }
  }
  const open = async (
    senderID: number,
    win: BrowserWindow,
    address: string,
    bounds: DockBounds,
    notify: (event: AppDockEvent) => void,
    profileStorage: ProfileStorage,
    placement?: Readonly<{ tabID: string; selected: boolean }>,
  ): Promise<AppDockTab> => {
    if (!validBounds(bounds)) throw new Error("Invalid App Dock bounds")
    const id = placement?.tabID ?? randomUUID()
    const tabGeneration = ++generation
    refNamespaces.set(`${senderID}:${id}`, nextRefNamespace())
    let target: string
    try {
      target = appDockURL(address)
    } catch {
      const tabIdentity = identity(id, tabGeneration)
      notify(
        Object.freeze({
          type: "navigation-error",
          payload: Object.freeze({ identity: tabIdentity, code: "blocked", url: address }),
        }),
      )
      throw new Error("App Dock only supports HTTPS URLs")
    }
    const { storageKey } = profileStorage
    const browserSession = sessions.open(storageKey)
    ensureViewCapacity(senderID, placement?.selected ?? true)
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: browserSession,
        backgroundThrottling: true,
      },
    })
    let state: Omit<AppDockState, "tabID" | "generation"> = {
      url: target,
      title: target,
      loading: true,
      audible: false,
      canGoBack: false,
      canGoForward: false,
    }
    const snapshot = (): AppDockState => Object.freeze({ ...identity(id, tabGeneration), ...state })
    const update = (patch: Partial<Omit<AppDockState, "tabID" | "generation">>) => {
      if (!isCurrent(senderID, id, tabGeneration)) return
      state = {
        ...state,
        ...patch,
        canGoBack: view.webContents.navigationHistory.canGoBack(),
        canGoForward: view.webContents.navigationHistory.canGoForward(),
      }
      notify(Object.freeze({ type: "state", payload: snapshot() }))
    }
    const cleanups: (() => void)[] = []
    const contents = view.webContents as unknown as EventEmitter
    const listen = (event: string, listener: (...args: any[]) => void) => {
      contents.on(event, listener)
      cleanups.push(() => contents.removeListener(event, listener))
    }
    listen("page-title-updated", (_event, title) => update({ title }))
    listen("page-favicon-updated", (_event, favicons) => update({ favicon: favicons[0] }))
    listen("did-start-loading", () => update({ loading: true }))
    listen("did-stop-loading", () => update({ loading: false, url: view.webContents.getURL() || target }))
    listen("did-fail-load", (_event, errorCode, _errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return
      update({ loading: false, url: validatedURL || state.url })
      if (!isCurrent(senderID, id, tabGeneration)) return
      notify(
        Object.freeze({
          type: "navigation-error",
          payload: Object.freeze({
            identity: identity(id, tabGeneration),
            code: "failed",
            url: validatedURL || state.url,
          }),
        }),
      )
    })
    listen("did-navigate", (_event, navigatedURL) => {
      const key = `${senderID}:${id}`
      refTargets.delete(key)
      refNamespaces.set(key, nextRefNamespace())
      update({ url: navigatedURL })
    })
    listen("did-navigate-in-page", (_event, navigatedURL) => {
      const key = `${senderID}:${id}`
      refTargets.delete(key)
      refNamespaces.set(key, nextRefNamespace())
      update({ url: navigatedURL })
    })
    let crashed = false
    const reportCrash = (reason: "crashed" | "killed" | "oom") => {
      if (crashed || !isCurrent(senderID, id, tabGeneration)) return
      crashed = true
      notify(
        Object.freeze({
          type: "tab-crashed",
          payload: Object.freeze({ identity: identity(id, tabGeneration), reason }),
        }),
      )
    }
    listen("render-process-gone", (_event, details) =>
      reportCrash(details.reason === "killed" ? "killed" : details.reason === "oom" ? "oom" : "crashed"),
    )
    listen("crashed", (_event, killed) => reportCrash(killed ? "killed" : "crashed"))
    listen("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return
      if (input.key === "F12" || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === "i"))
        event.preventDefault()
    })
    listen("devtools-opened", () => {
      if (!developmentMode()) view.webContents.closeDevTools()
    })
    listen("media-started-playing", () => update({ audible: true }))
    listen("media-paused", () => update({ audible: false }))
    const externalURL = (url: string) => {
      if (!isCurrent(senderID, id, tabGeneration)) return false
      const handled = options.onExternalURL?.(senderID, identity(id, tabGeneration), url)
      if (handled === undefined) return false
      if (!handled) notify(Object.freeze({ type: "navigation-error", payload: Object.freeze({ identity: identity(id, tabGeneration), code: "blocked", url: "slack://callback" }) }))
      return true
    }
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (externalURL(url)) return { action: "deny" }
      try {
        if (!isCurrent(senderID, id, tabGeneration) || options.allowPopup?.(senderID, identity(id, tabGeneration), url) === false) {
          throw new Error("App Dock popup blocked")
        }
        const popupURL = appDockURL(url)
        // Only the tab on screen may attach a view. A popup from a background tab, or from any tab while
        // the Dock is hidden, opens behind it and waits for the user to select it.
        const selected = active.get(senderID) === id && isCurrent(senderID, id, tabGeneration)
        // A page can chain popups without a click, so a popup never evicts the user's tabs to make room:
        // at the view cap it is blocked instead.
        if (!viewCapacity(senderID, selected)) throw new Error("App Dock tab limit reached")
        void open(senderID, win, popupURL, layoutBounds.get(senderID) ?? bounds, notify, profileStorage, {
          tabID: randomUUID(),
          selected,
        })
          .then((tab) => {
            options.onPopupOpened?.(senderID, identity(id, tabGeneration), tab)
            notify(Object.freeze({ type: selected ? "tab-opened" : "tab-opened-background", payload: tab }))
          })
          .catch(() => {
            if (isCurrent(senderID, id, tabGeneration)) notify(Object.freeze({
              type: "navigation-error",
              payload: Object.freeze({ identity: identity(id, tabGeneration), code: "failed", url }),
            }))
          })
      } catch {
        notify(
          Object.freeze({
            type: "navigation-error",
            payload: Object.freeze({ identity: identity(id, tabGeneration), code: "blocked", url }),
          }),
        )
      }
      return { action: "deny" }
    })
    // Desktop sign-in pages can dispatch their URI from a hidden iframe.
    // will-navigate covers only the main frame.
    listen("will-frame-navigate", details => {
      if (externalURL(details.url)) details.preventDefault()
    })
    listen("will-navigate", (event, url) => {
      if (externalURL(url)) { event.preventDefault(); return }
      if (URL.canParse(url) && new URL(url).protocol === "https:") return
      event.preventDefault()
      const key = `${senderID}:${id}`
      blockedNavigationVersions.set(key, (blockedNavigationVersions.get(key) ?? 0) + 1)
      if (!isCurrent(senderID, id, tabGeneration)) return
      notify(
        Object.freeze({
          type: "navigation-error",
          payload: Object.freeze({ identity: identity(id, tabGeneration), code: "blocked", url }),
        }),
      )
    })
    listen("will-redirect", (event, url) => {
      if (externalURL(url)) { event.preventDefault(); return }
      if (URL.canParse(url) && new URL(url).protocol === "https:") return
      event.preventDefault()
      const key = `${senderID}:${id}`
      blockedNavigationVersions.set(key, (blockedNavigationVersions.get(key) ?? 0) + 1)
      if (!isCurrent(senderID, id, tabGeneration)) return
      notify(
        Object.freeze({
          type: "navigation-error",
          payload: Object.freeze({ identity: identity(id, tabGeneration), code: "blocked", url }),
        }),
      )
    })
    listen("enter-html-full-screen", () => fullscreen.enterHtml(senderID, id, tabGeneration, view.webContents, win, notify))
    listen("leave-html-full-screen", () => fullscreen.leaveHtml(senderID, id, tabGeneration, view.webContents, win, notify))
    view.setBounds(bounds)
    const senderTabs = tabs.get(senderID) ?? new Map<string, AppDockRecord>()
    senderTabs.set(id, { view, win, storageKey, generation: tabGeneration, state: snapshot, notify, cleanups })
    tabByContents.set(view.webContents.id, { senderID, tabID: id, generation: tabGeneration })
    tabs.set(senderID, senderTabs)
    fullscreen.installWindowBridge(senderID, win)
    if (placement?.selected ?? true) {
      fullscreen.releaseOther(senderID, win, id)
      win.contentView.addChildView(view)
      view.setVisible(!occluded.has(senderID))
      view.webContents.setBackgroundThrottling(false)
      active.set(senderID, id)
      options.onVisibility?.(senderID, identity(id, tabGeneration), true)
    }
    for (const [tabID, other] of senderTabs) {
      if ((placement?.selected ?? true) && tabID !== id) {
        markInactive(senderID, tabID, other)
        win.contentView.removeChildView(other.view)
      }
    }
    if (!(placement?.selected ?? true)) markInactive(senderID, id, senderTabs.get(id)!)
    void view.webContents.loadURL(target).catch(() => {
      if (!isCurrent(senderID, id, tabGeneration)) return
      notify(
        Object.freeze({
          type: "navigation-error",
          payload: Object.freeze({ identity: identity(id, tabGeneration), code: "failed", url: target }),
        }),
      )
    })
    update({})
    return Object.freeze({ ...identity(id, tabGeneration), url: target })
  }
  return {
    ...page,
    ...input,
    ...navigation,
    open,
    onTabRemoved(listener) {
      removalListeners.add(listener)
      return () => removalListeners.delete(listener)
    },
    resize(senderID: number, tab: AppDockIdentity, bounds: DockBounds) {
      if (!validBounds(bounds)) throw new Error("Invalid App Dock bounds")
      if (!usableBounds(bounds)) return
      const record = appDockAttached(tabs.get(senderID), active.get(senderID), tab)
      if (!record) return
      layoutBounds.set(senderID, bounds)
      lastLayoutBounds = bounds
      record.view.setBounds(bounds)
    },
    hide(senderID: number, _win: BrowserWindow, tab: AppDockIdentity) {
      if (!appDockAttached(tabs.get(senderID), active.get(senderID), tab)) return
      fullscreen.releaseHidden(senderID)
      while (active.has(senderID) && inactive.size >= MAX_INACTIVE_TABS) {
        if (!evictOldestInactive()) throw new Error("App Dock tab limit reached")
      }
      for (const [tabID, record] of tabs.get(senderID) ?? []) {
        markInactive(senderID, tabID, record)
        if (!record.win.isDestroyed()) record.win.contentView.removeChildView(record.view)
      }
      active.delete(senderID)
    },
    // Releasing occlusion shows the sender's active tab at release time, never a remembered one.
    occlude(senderID: number, value: boolean) {
      if (value) occluded.add(senderID)
      else occluded.delete(senderID)
      const tabID = active.get(senderID)
      if (tabID) tabs.get(senderID)?.get(tabID)?.view.setVisible(!value)
    },
    select(senderID: number, win: BrowserWindow, tab: AppDockIdentity, bounds: DockBounds) {
      if (!validBounds(bounds)) throw new Error("Invalid App Dock bounds")
      const record = appDockShown(tabs.get(senderID), tab)
      if (!record) return
      const tabID = tab.tabID
      layoutBounds.set(senderID, bounds)
      lastLayoutBounds = bounds
      fullscreen.releaseOther(senderID, win, tabID)
      for (const [id, other] of tabs.get(senderID) ?? []) {
        if (id === tabID) {
          if (!win.contentView.children.includes(other.view)) win.contentView.addChildView(other.view)
          other.view.setVisible(!occluded.has(senderID))
          other.view.webContents.setBackgroundThrottling(false)
          inactive.delete(`${senderID}:${id}`)
        } else {
          markInactive(senderID, id, other)
          win.contentView.removeChildView(other.view)
        }
      }
      record.view.setBounds(bounds)
      active.set(senderID, tabID)
      options.onVisibility?.(senderID, identity(tabID, record.generation), true)
      record.notify(Object.freeze({ type: "tab-selected", payload: identity(tabID, record.generation) }))
    },
    activate(senderID: number, win: BrowserWindow, tabID: string) {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      const remembered = layoutBounds.get(senderID) ?? lastLayoutBounds
      const rendered = [...(tabs.get(senderID)?.values() ?? [])]
        .map((item) => item.view.getBounds())
        .find((item) => usableBounds(item))
      const windowBounds = win.getContentBounds()
      const fallback = {
        x: 0,
        y: 0,
        width: Math.max(1, Math.floor(windowBounds.width)),
        height: Math.max(1, Math.floor(windowBounds.height)),
      }
      const bounds = (remembered && usableBounds(remembered) ? remembered : undefined) ?? rendered ??
        (usableBounds(fallback) ? fallback : undefined)
      if (!bounds) throw new Error("App Dock host is not ready")
      this.select(senderID, win, identity(tabID, record.generation), bounds)
    },
    contents(senderID: number, tabID: string) {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record || record.view.webContents.isDestroyed()) throw new Error("Unknown App Dock tab")
      return record.view.webContents
    },
    async recover(senderID: number, tabID: string) {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      const url = record.view.webContents.getURL()
      let target: string
      try {
        target = appDockURL(url)
      } catch {
        throw new Error("App Dock only supports HTTPS URLs")
      }
      const bounds = record.view.getBounds()
      const selected = active.get(senderID) === tabID
      remove(senderID, tabID)
      const tab = await open(
        senderID,
        record.win,
        target,
        bounds,
        record.notify,
        { storageKey: record.storageKey },
        {
          tabID,
          selected,
        },
      )
      if (isCurrent(senderID, tabID, tab.generation))
        record.notify(Object.freeze({ type: "tab-recovered", payload: tab }))
      return tab
    },
    fullscreen: fullscreen.toggle,
    keyboard: fullscreen.keyboard,
    cancelDownload: sessions.cancelDownload,
    openDownload: sessions.openDownload,
    openDevTools(senderID: number, tabID: string) {
      if (!developmentMode()) throw new Error("App Dock DevTools are disabled in production")
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      record.view.webContents.openDevTools({ mode: "detach" })
    },
    async deleteStorage(storageKey: string, _win?: BrowserWindow) {
      sessions.retire(storageKey)
      for (const [senderID, senderTabs] of tabs) {
        for (const [tabID, record] of senderTabs) if (record.storageKey === storageKey) remove(senderID, tabID)
      }
      await sessions.clear(storageKey)
    },
    list(senderID: number) {
      return [...(tabs.get(senderID) ?? [])].map(([tabID, record]) =>
        Object.freeze({
          ...record.state(),
          viewBounds: record.view.getBounds(),
          layoutBounds: layoutBounds.get(senderID) ?? lastLayoutBounds ?? null,
          windowBounds: record.win.getContentBounds(),
          url: record.view.webContents.getURL() || record.state().url,
          title: record.view.webContents.getTitle() || record.state().title,
          active: active.get(senderID) === tabID,
        }),
      )
    },
    close,
    closeAll,
    closeTabs(senderID: number, tabID: string, scope: "others" | "right", order?: string[]) {
      const senderTabs = tabs.get(senderID)
      if (!senderTabs) throw new Error("Unknown App Dock tab")
      const targetRecord = senderTabs.get(tabID)
      if (!targetRecord) throw new Error("Unknown App Dock tab")
      const ids = [...senderTabs]
        .filter(([, record]) => record.storageKey === targetRecord.storageKey)
        .map(([id]) => id)
      if (scope === "others" && order !== undefined) throw new Error("Invalid App Dock tab order")
      if (
        order !== undefined &&
        (!Array.isArray(order) ||
          order.length !== ids.length ||
          order.some((id) => typeof id !== "string" || id.length === 0) ||
          new Set(order).size !== order.length ||
          !ids.every((id) => order.includes(id)))
      ) {
        throw new Error("Invalid App Dock tab order")
      }
      const ordered = order ?? ids
      const target = ordered.indexOf(tabID)
      const closing = scope === "others" ? ids.filter((id) => id !== tabID) : ordered.slice(target + 1)
      const currentActive = active.get(senderID)
      closing.forEach((id) => remove(senderID, id))
      if (senderTabs.size === 0) tabs.delete(senderID)
      else if (!currentActive || closing.includes(currentActive)) {
        const bounds = layoutBounds.get(senderID) ?? targetRecord.view.getBounds()
        this.select(senderID, targetRecord.win, identity(tabID, targetRecord.generation), bounds)
      }
    },
  }
}
