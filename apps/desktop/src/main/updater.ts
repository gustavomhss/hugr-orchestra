import { app, dialog } from "electron"
import pkg from "electron-updater"
import { MAC_SIGNED, UPDATER_ENABLED } from "./constants"
import { createUpdaterController, type UpdaterReadyRecord } from "./updater-controller"
import { getLogger } from "./logging"
import { getStore } from "./store"
import { openExternalURL, setAppQuitting } from "./windows"
import { nativeT } from "./native-translations"

const { autoUpdater } = pkg
const key = "ready"
// electron-updater replaces only a signed macOS app, an NSIS install and an AppImage ($APPIMAGE is set inside one).
// A deb, an rpm or an unsigned macOS build announces the update with its release page instead.
const notify = (process.platform === "darwin" && !MAC_SIGNED) || (process.platform === "linux" && !process.env.APPIMAGE)

export function setupAutoUpdater(stop: () => Promise<void>) {
  const logger = getLogger()
  autoUpdater.logger = logger
  autoUpdater.channel = "latest"
  autoUpdater.allowPrerelease = false
  // Only a newer release is offered: a build ahead of the feed (or a feed moved back) never offers an older one.
  autoUpdater.allowDowngrade = false
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  logger.log("auto updater configured", {
    channel: autoUpdater.channel,
    notify,
    allowPrerelease: autoUpdater.allowPrerelease,
    allowDowngrade: autoUpdater.allowDowngrade,
    currentVersion: app.getVersion(),
  })

  const store = getStore("orchestra.updater")
  return createUpdaterController({
    enabled: UPDATER_ENABLED,
    // Each release keeps its installers in desktop-v<version> (.github/workflows/release-desktop.yml).
    releasePage: notify
      ? (version) =>
          `https://github.com/gustavomhss/hugr-orchestra/releases/tag/desktop-v${encodeURIComponent(version)}`
      : undefined,
    currentVersion: app.getVersion(),
    backend: {
      checkForUpdates: () => autoUpdater.checkForUpdates(),
      downloadUpdate: (onProgress) => {
        const listener = (progress: { percent: number }) => onProgress(progress.percent)
        autoUpdater.on("download-progress", listener)
        return autoUpdater.downloadUpdate().finally(() => autoUpdater.off("download-progress", listener))
      },
      quitAndInstall: () => {
        // quitAndInstall closes all windows before emitting before-quit, so
        // flag the quit first to keep window ids persisted for restore.
        setAppQuitting()
        try {
          autoUpdater.quitAndInstall()
        } catch (error) {
          // The install failed and the app keeps running; clear the flag so
          // deliberate window closes prune ids again.
          setAppQuitting(false)
          throw error
        }
      },
    },
    persistence: {
      get() {
        const value = store.get(key)
        if (!value || typeof value !== "object" || !("version" in value) || typeof value.version !== "string") return
        return { version: value.version } satisfies UpdaterReadyRecord
      },
      set: (value) => store.set(key, value),
      clear: () => store.delete(key),
    },
    stop,
    log: (message, data) => logger.log(message, data),
  })
}

export async function showUpdaterDialog(controller: ReturnType<typeof setupAutoUpdater>, alertOnFail: boolean) {
  const state = await controller.check()
  if (state.status === "error") {
    if (!alertOnFail) return
    await dialog.showMessageBox({
      type: "error",
      message: nativeT("desktop.updater.dialog.checkFailed.message"),
      title: nativeT("desktop.updater.dialog.checkFailed.title"),
    })
    return
  }
  if (state.status === "up-to-date") {
    if (!alertOnFail) return
    await dialog.showMessageBox({
      type: "info",
      message: nativeT("desktop.updater.dialog.upToDate.message"),
      title: nativeT("desktop.updater.dialog.upToDate.title"),
    })
    return
  }
  // No native copy exists for an announced update; the release page is the answer to "Check for Updates".
  if (state.status === "available") return openExternalURL(state.url)
  if (state.status !== "ready") return

  const response = await dialog.showMessageBox({
    type: "info",
    message: nativeT("desktop.updater.dialog.ready.message", { version: state.version }),
    title: nativeT("desktop.updater.dialog.ready.title"),
    buttons: [nativeT("desktop.updater.dialog.restart"), nativeT("desktop.updater.dialog.later")],
    defaultId: 0,
    cancelId: 1,
  })
  if (response.response === 0) await controller.install()
}
