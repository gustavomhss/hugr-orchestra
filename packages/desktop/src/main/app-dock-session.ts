import { session, shell } from "electron"
import type { Session } from "electron"
import { randomUUID } from "node:crypto"
import type { AppDockDownload } from "./app-dock"
import { identity, type AppDockContext, type AppDockRecord } from "./app-dock-context"

const MAX_PROGRESSING_DOWNLOADS_PER_PROFILE = 8
const MAX_TERMINAL_DOWNLOADS_PER_SENDER = 20

const storagePartition = (storageKey: string) => {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(storageKey)) throw new Error("Invalid App Dock storage key")
  return `persist:app-dock-${storageKey}`
}

// Per-profile Electron sessions: permission denial, download tracking, and storage retirement.
export function createAppDockSessions(ctx: AppDockContext) {
  const browserSessions = new Map<string, Session>()
  const configuredPartitions = new Set<string>()
  const retiredStorageKeys = new Set<string>()
  const downloads = new Map<
    string,
    { senderID: number; storageKey: string; item: Electron.DownloadItem; state: AppDockDownload }
  >()
  const terminalDownloads = new Map<string, number>()

  const sourceRecord = (webContents: Electron.WebContents) => {
    const source = ctx.tabByContents.get(webContents.id)
    const record = source && ctx.tabs.get(source.senderID)?.get(source.tabID)
    if (!source || !record || record.generation !== source.generation) return undefined
    return { source, record }
  }
  const denyPermission = (webContents: Electron.WebContents, permission: string) => {
    const found = sourceRecord(webContents)
    if (!found) return
    found.record.notify(
      Object.freeze({
        type: "permission",
        payload: Object.freeze({
          identity: identity(found.source.tabID, found.source.generation),
          permission,
          state: "denied",
        }),
      }),
    )
  }
  const trackDownload = (
    item: Electron.DownloadItem,
    source: { senderID: number; tabID: string; generation: number },
    record: AppDockRecord,
  ) => {
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
      if (rejected || !ctx.isCurrent(source.senderID, source.tabID, source.generation)) return
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
  }

  return {
    open(storageKey: string) {
      if (retiredStorageKeys.has(storageKey)) throw new Error("App Dock storage key is retired")
      const partition = storagePartition(storageKey)
      const browserSession = browserSessions.get(partition) ?? session.fromPartition(partition)
      browserSessions.set(partition, browserSession)
      if (configuredPartitions.has(partition)) return browserSession
      browserSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === "fullscreen") return callback(true)
        if (webContents) denyPermission(webContents, permission)
        callback(false)
      })
      browserSession.setPermissionCheckHandler((webContents, permission) => {
        if (permission === "fullscreen") return true
        if (webContents) denyPermission(webContents, permission)
        return false
      })
      browserSession.on("will-download", (_event, item, webContents) => {
        const found = sourceRecord(webContents)
        if (!found) return item.cancel()
        trackDownload(item, found.source, found.record)
      })
      configuredPartitions.add(partition)
      return browserSession
    },
    retire(storageKey: string) {
      storagePartition(storageKey)
      if (retiredStorageKeys.has(storageKey)) throw new Error("App Dock storage key is retired")
      retiredStorageKeys.add(storageKey)
    },
    async clear(storageKey: string) {
      for (const [downloadID, download] of downloads) {
        if (download.storageKey === storageKey) {
          download.item.cancel()
          downloads.delete(downloadID)
          terminalDownloads.delete(downloadID)
        }
      }
      const partition = storagePartition(storageKey)
      const browserSession = browserSessions.get(partition) ?? session.fromPartition(partition)
      await browserSession.clearStorageData()
      await browserSession.clearCache()
      browserSessions.delete(partition)
    },
    cancelTab(senderID: number, tabID: string, generation: number) {
      for (const [downloadID, download] of downloads) {
        if (
          download.senderID === senderID &&
          download.state.tabID === tabID &&
          download.state.generation === generation
        ) {
          download.item.cancel()
          downloads.delete(downloadID)
          terminalDownloads.delete(downloadID)
        }
      }
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
  }
}
