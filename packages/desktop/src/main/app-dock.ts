import { app, session, shell, WebContentsView } from "electron"
import type { BrowserWindow, Session } from "electron"
import { randomUUID } from "node:crypto"
import type { EventEmitter } from "node:events"
import { appDockURL, appDockZoom, panelBoundsToContent, type DockBounds } from "./app-dock-utils"
export type { DockBounds } from "./app-dock-utils"

export type AppDockIdentity = Readonly<{ tabID: string; generation: number }>
export type AppDockTab = AppDockIdentity & { url: string }
export type ProfileStorage = Readonly<{ storageKey: string }>
export type AppDockState = AppDockIdentity & {
  url: string
  title: string
  favicon?: string
  loading: boolean
  audible: boolean
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
  | Readonly<{ type: "tab-opened"; payload: AppDockTab }>
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
type AppDockRecord = {
  view: WebContentsView
  win: BrowserWindow
  storageKey: string
  generation: number
  state: () => AppDockState
  notify: (event: AppDockEvent) => void
  cleanups: (() => void)[]
}

const storagePartition = (storageKey: string) => {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(storageKey)) throw new Error("Invalid App Dock storage key")
  return `persist:app-dock-${storageKey}`
}

export { panelBoundsToContent }

const validBounds = (bounds: DockBounds) =>
  [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isSafeInteger) && bounds.width > 0 && bounds.height > 0

const MAX_INACTIVE_TABS = 20
const MAX_PROGRESSING_DOWNLOADS_PER_PROFILE = 8
const MAX_TERMINAL_DOWNLOADS_PER_SENDER = 20

export function createAppDock(options: { developmentMode?: () => boolean } = {}) {
  const developmentMode = options.developmentMode ?? (() => !app.isPackaged)
  const browserSessions = new Map<string, Session>()
  const configuredPartitions = new Set<string>()
  const retiredStorageKeys = new Set<string>()
  const tabs = new Map<number, Map<string, AppDockRecord>>()
  const tabByContents = new Map<number, { senderID: number; tabID: string; generation: number }>()
  const downloads = new Map<
    string,
    { senderID: number; storageKey: string; item: Electron.DownloadItem; state: AppDockDownload }
  >()
  const terminalDownloads = new Map<string, number>()
  const active = new Map<number, string>()
  // Senders whose renderer draws an overlay over the Dock. Their views stay hidden until released,
  // including views shown while it holds, because native views always paint above the renderer.
  const occluded = new Set<number>()
  const inactive = new Map<string, { senderID: number; tabID: string }>()
  let generation = 0
  const identity = (tabID: string, tabGeneration: number): AppDockIdentity =>
    Object.freeze({ tabID, generation: tabGeneration })
  const isCurrent = (senderID: number, tabID: string, tabGeneration: number) =>
    tabs.get(senderID)?.get(tabID)?.generation === tabGeneration
  const markInactive = (senderID: number, tabID: string, record: AppDockRecord) => {
    record.view.webContents.setBackgroundThrottling(true)
    inactive.delete(`${senderID}:${tabID}`)
    inactive.set(`${senderID}:${tabID}`, { senderID, tabID })
  }
  const remove = (senderID: number, tabID: string) => {
    const record = tabs.get(senderID)?.get(tabID)
    if (!record) return
    if (!record.win.isDestroyed()) record.win.contentView.removeChildView(record.view)
    inactive.delete(`${senderID}:${tabID}`)
    tabByContents.delete(record.view.webContents.id)
    record.cleanups.forEach((cleanup) => cleanup())
    for (const [downloadID, download] of downloads) {
      if (
        download.senderID === senderID &&
        download.state.tabID === tabID &&
        download.state.generation === record.generation
      ) {
        download.item.cancel()
        downloads.delete(downloadID)
        terminalDownloads.delete(downloadID)
      }
    }
    record.view.webContents.close()
    tabs.get(senderID)?.delete(tabID)
    generation++
    if (active.get(senderID) === tabID) active.delete(senderID)
  }
  const close = (senderID: number, _win?: BrowserWindow, tabID?: string) => {
    const ids = tabID ? [tabID] : [...(tabs.get(senderID)?.keys() ?? [])]
    ids.forEach((id) => remove(senderID, id))
    if ((tabs.get(senderID)?.size ?? 0) === 0) tabs.delete(senderID)
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
  const ensureViewCapacity = (senderID: number, selected: boolean) => {
    const inactiveNeeded = selected ? Number(active.has(senderID)) : 1
    while (inactive.size + inactiveNeeded > MAX_INACTIVE_TABS) {
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
    replacement?: Readonly<{ tabID: string; selected: boolean }>,
  ): Promise<AppDockTab> => {
    if (!validBounds(bounds)) throw new Error("Invalid App Dock bounds")
    const id = replacement?.tabID ?? randomUUID()
    const tabGeneration = ++generation
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
    if (retiredStorageKeys.has(storageKey)) throw new Error("App Dock storage key is retired")
    const partition = storagePartition(storageKey)
    const browserSession = browserSessions.get(partition) ?? session.fromPartition(partition)
    browserSessions.set(partition, browserSession)
    if (!configuredPartitions.has(partition)) {
      const denyPermission = (webContents: Electron.WebContents, permission: string) => {
        const source = tabByContents.get(webContents.id)
        const record = source && tabs.get(source.senderID)?.get(source.tabID)
        if (!source || !record || record.generation !== source.generation) return
        record.notify(
          Object.freeze({
            type: "permission",
            payload: Object.freeze({
              identity: identity(source.tabID, source.generation),
              permission,
              state: "denied",
            }),
          }),
        )
      }
      browserSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (webContents) denyPermission(webContents, permission)
        callback(false)
      })
      browserSession.setPermissionCheckHandler((webContents, permission) => {
        if (webContents) denyPermission(webContents, permission)
        return false
      })
      browserSession.on("will-download", (_event, item, webContents) => {
        const source = tabByContents.get(webContents.id)
        const record = source && tabs.get(source.senderID)?.get(source.tabID)
        if (!source || !record || record.generation !== source.generation) return item.cancel()
        const id = randomUUID()
        let rejected = false
        const rejectDownload = () => {
          if (rejected) return
          rejected = true
          item.cancel()
          record.notify(
            Object.freeze({
              type: "navigation-error",
              payload: Object.freeze({
                identity: identity(source.tabID, source.generation),
                code: "failed",
                url: record.state().url,
              }),
            }),
          )
        }
        const updateDownload = (state: AppDockDownload["state"]) => {
          if (rejected || !isCurrent(source.senderID, source.tabID, source.generation)) return
          if (
            state === "progressing" &&
            [...downloads.values()].filter(
              (download) => download.storageKey === record.storageKey && download.state.state === "progressing",
            ).length >= MAX_PROGRESSING_DOWNLOADS_PER_PROFILE
          ) {
            rejectDownload()
            return
          }
          const download = Object.freeze({
            ...identity(source.tabID, source.generation),
            id,
            filename: item.getFilename(),
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            state,
          })
          downloads.set(id, { senderID: source.senderID, storageKey: record.storageKey, item, state: download })
          if (state === "completed" || state === "cancelled" || state === "interrupted") {
            terminalDownloads.delete(id)
            terminalDownloads.set(id, source.senderID)
            while (
              [...terminalDownloads.values()].filter((id) => id === source.senderID).length >
              MAX_TERMINAL_DOWNLOADS_PER_SENDER
            ) {
              const oldest = [...terminalDownloads].find(([, owner]) => owner === source.senderID)
              if (!oldest) break
              terminalDownloads.delete(oldest[0])
              downloads.delete(oldest[0])
            }
          } else terminalDownloads.delete(id)
          record.notify(Object.freeze({ type: "download", payload: download }))
        }
        item.on("updated", () => updateDownload(item.isPaused() ? "paused" : "progressing"))
        item.once("done", (_doneEvent, state) =>
          updateDownload(state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "interrupted"),
        )
        updateDownload("progressing")
      })
      configuredPartitions.add(partition)
    }
    ensureViewCapacity(senderID, replacement?.selected ?? true)
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
    }
    const snapshot = (): AppDockState => Object.freeze({ ...identity(id, tabGeneration), ...state })
    const update = (patch: Partial<Omit<AppDockState, "tabID" | "generation">>) => {
      if (!isCurrent(senderID, id, tabGeneration)) return
      state = { ...state, ...patch }
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
    listen("did-navigate", (_event, navigatedURL) => update({ url: navigatedURL }))
    listen("did-navigate-in-page", (_event, navigatedURL) => update({ url: navigatedURL }))
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
    view.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const popupURL = appDockURL(url)
        void open(senderID, win, popupURL, bounds, notify, profileStorage).then((tab) =>
          notify(Object.freeze({ type: "tab-opened", payload: tab })),
        )
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
    listen("will-navigate", (event, url) => {
      if (URL.canParse(url) && new URL(url).protocol === "https:") return
      event.preventDefault()
      notify(
        Object.freeze({
          type: "navigation-error",
          payload: Object.freeze({ identity: identity(id, tabGeneration), code: "blocked", url }),
        }),
      )
    })
    listen("will-redirect", (event, url) => {
      if (URL.canParse(url) && new URL(url).protocol === "https:") return
      event.preventDefault()
      notify(
        Object.freeze({
          type: "navigation-error",
          payload: Object.freeze({ identity: identity(id, tabGeneration), code: "blocked", url }),
        }),
      )
    })
    listen("enter-html-full-screen", () =>
      notify(
        Object.freeze({
          type: "fullscreen",
          payload: Object.freeze({ identity: identity(id, tabGeneration), enabled: true }),
        }),
      ),
    )
    listen("leave-html-full-screen", () =>
      notify(
        Object.freeze({
          type: "fullscreen",
          payload: Object.freeze({ identity: identity(id, tabGeneration), enabled: false }),
        }),
      ),
    )
    view.setBounds(bounds)
    const senderTabs = tabs.get(senderID) ?? new Map<string, AppDockRecord>()
    senderTabs.set(id, { view, win, storageKey, generation: tabGeneration, state: snapshot, notify, cleanups })
    tabByContents.set(view.webContents.id, { senderID, tabID: id, generation: tabGeneration })
    tabs.set(senderID, senderTabs)
    if (replacement?.selected ?? true) {
      win.contentView.addChildView(view)
      view.setVisible(!occluded.has(senderID))
      view.webContents.setBackgroundThrottling(false)
      active.set(senderID, id)
    }
    for (const [tabID, other] of senderTabs) {
      if ((replacement?.selected ?? true) && tabID !== id) {
        win.contentView.removeChildView(other.view)
        markInactive(senderID, tabID, other)
      }
    }
    if (!(replacement?.selected ?? true)) markInactive(senderID, id, senderTabs.get(id)!)
    void view.webContents.loadURL(target).catch(() =>
      notify(
        Object.freeze({
          type: "navigation-error",
          payload: Object.freeze({ identity: identity(id, tabGeneration), code: "failed", url: target }),
        }),
      ),
    )
    update({})
    return Object.freeze({ ...identity(id, tabGeneration), url: target })
  }
  return {
    open,
    resize(senderID: number, bounds: DockBounds) {
      if (!validBounds(bounds)) throw new Error("Invalid App Dock bounds")
      const tabID = active.get(senderID)
      if (tabID) tabs.get(senderID)?.get(tabID)?.view.setBounds(bounds)
    },
    hide(senderID: number, _win: BrowserWindow) {
      while (active.has(senderID) && inactive.size >= MAX_INACTIVE_TABS) {
        if (!evictOldestInactive()) throw new Error("App Dock tab limit reached")
      }
      for (const [tabID, record] of tabs.get(senderID) ?? []) {
        if (!record.win.isDestroyed()) record.win.contentView.removeChildView(record.view)
        markInactive(senderID, tabID, record)
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
    select(senderID: number, win: BrowserWindow, tabID: string, bounds: DockBounds) {
      if (!validBounds(bounds)) throw new Error("Invalid App Dock bounds")
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      for (const [id, other] of tabs.get(senderID) ?? []) {
        if (id === tabID) {
          win.contentView.addChildView(other.view)
          other.view.setVisible(!occluded.has(senderID))
          other.view.webContents.setBackgroundThrottling(false)
          inactive.delete(`${senderID}:${id}`)
        } else {
          win.contentView.removeChildView(other.view)
          markInactive(senderID, id, other)
        }
      }
      record.view.setBounds(bounds)
      active.set(senderID, tabID)
    },
    navigate(senderID: number, tabID: string, address: string) {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      let target: string
      try {
        target = appDockURL(address)
      } catch {
        record.notify(
          Object.freeze({
            type: "navigation-error",
            payload: Object.freeze({ identity: identity(tabID, record.generation), code: "blocked", url: address }),
          }),
        )
        throw new Error("App Dock only supports HTTPS URLs")
      }
      return record.view.webContents.loadURL(target).catch(() => {
        record.notify(
          Object.freeze({
            type: "navigation-error",
            payload: Object.freeze({ identity: identity(tabID, record.generation), code: "failed", url: target }),
          }),
        )
        throw new Error("Navigation failed")
      })
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
    command(senderID: number, tabID: string, command: "back" | "forward" | "reload") {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      if (command === "back" && record.view.webContents.canGoBack()) return record.view.webContents.goBack()
      if (command === "forward" && record.view.webContents.canGoForward()) return record.view.webContents.goForward()
      if (command === "reload") return record.view.webContents.reload()
    },
    find(senderID: number, tabID: string, text: string, forward: boolean, notify: (result: AppDockFindResult) => void) {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      const query = text.trim()
      if (!query) throw new Error("Find text is required")
      let requestID = -1
      const listener = (_event: Electron.Event, result: Electron.FoundInPageResult) => {
        if (result.requestId !== requestID || !isCurrent(senderID, tabID, record.generation)) return
        notify(
          Object.freeze({
            ...identity(tabID, record.generation),
            requestID,
            activeMatchOrdinal: result.activeMatchOrdinal,
            matches: result.matches,
            finalUpdate: result.finalUpdate,
          }),
        )
        if (result.finalUpdate) record.view.webContents.removeListener("found-in-page", listener)
      }
      record.view.webContents.on("found-in-page", listener)
      record.cleanups.push(() => record.view.webContents.removeListener("found-in-page", listener))
      requestID = record.view.webContents.findInPage(query, { forward, findNext: true })
      return requestID
    },
    stopFind(senderID: number, tabID: string) {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      record.view.webContents.stopFindInPage("clearSelection")
    },
    zoom(senderID: number, tabID: string, factor?: number) {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      if (factor !== undefined) record.view.webContents.setZoomFactor(appDockZoom(factor))
      return record.view.webContents.getZoomFactor()
    },
    fullscreen(senderID: number, win: BrowserWindow, tabID: string, enabled: boolean) {
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      win.setFullScreen(enabled)
      record.notify(
        Object.freeze({
          type: "fullscreen",
          payload: Object.freeze({ identity: identity(tabID, record.generation), enabled }),
        }),
      )
    },
    cancelDownload(senderID: number, id: string) {
      const download = downloads.get(id)
      if (!download || download.senderID !== senderID) throw new Error("Unknown App Dock download")
      download.item.cancel()
    },
    openDownload(senderID: number, id: string) {
      const download = downloads.get(id)
      if (!download || download.senderID !== senderID || download.state.state !== "completed")
        throw new Error("Unknown App Dock download")
      return shell.openPath(download.item.getSavePath())
    },
    openDevTools(senderID: number, tabID: string) {
      if (!developmentMode()) throw new Error("App Dock DevTools are disabled in production")
      const record = tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      record.view.webContents.openDevTools({ mode: "detach" })
    },
    async deleteStorage(storageKey: string, _win?: BrowserWindow) {
      const partition = storagePartition(storageKey)
      if (retiredStorageKeys.has(storageKey)) throw new Error("App Dock storage key is retired")
      retiredStorageKeys.add(storageKey)
      for (const [senderID, senderTabs] of tabs) {
        for (const [tabID, record] of senderTabs) if (record.storageKey === storageKey) remove(senderID, tabID)
      }
      for (const [downloadID, download] of downloads) {
        if (download.storageKey === storageKey) {
          download.item.cancel()
          downloads.delete(downloadID)
          terminalDownloads.delete(downloadID)
        }
      }
      const browserSession = browserSessions.get(partition) ?? session.fromPartition(partition)
      await browserSession.clearStorageData()
      await browserSession.clearCache()
      browserSessions.delete(partition)
    },
    close,
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
      closing.forEach((id) => remove(senderID, id))
      if (senderTabs.size === 0) tabs.delete(senderID)
    },
  }
}
