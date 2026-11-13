import { app, autoUpdater, dialog } from "electron"
import pkg from "electron-updater"
import { MAC_SIGNED, UPDATER_ENABLED } from "./constants"
import { confirmUpdaterQuit, createUpdaterController, prepareNativeUpdate, type UpdaterReadyRecord } from "./updater-controller"
import { getLogger } from "./logging"
import { getStore } from "./store"
import { openExternalURL, setAppQuitting } from "./windows"
import { nativeT } from "./native-translations"

const updater = pkg.autoUpdater
const key = "ready"
// electron-updater replaces only a signed macOS app, an NSIS install and an AppImage ($APPIMAGE is set inside one).
// A deb, an rpm or an unsigned macOS build announces the update with its release page instead.
const notify = (process.platform === "darwin" && !MAC_SIGNED) || (process.platform === "linux" && !process.env.APPIMAGE)

export function setupAutoUpdater() {
  const logger = getLogger()
  const native = process.platform === "darwin" && MAC_SIGNED ? autoUpdater : undefined
  let nativeReady = false
  const onNativeReady = () => { nativeReady = true }
  native?.on("update-downloaded", onNativeReady)
  app.once("will-quit", () => native?.off("update-downloaded", onNativeReady))
  updater.logger = logger
  updater.channel = "latest"
  updater.allowPrerelease = false
  // Only a newer release is offered: a build ahead of the feed (or a feed moved back) never offers an older one.
  updater.allowDowngrade = false
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  logger.log("auto updater configured", {
    channel: updater.channel,
    notify,
    allowPrerelease: updater.allowPrerelease,
    allowDowngrade: updater.allowDowngrade,
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
      checkForUpdates: () => updater.checkForUpdates(),
      downloadUpdate: (onProgress) => {
        nativeReady = false
        const listener = (progress: { percent: number }) => onProgress(progress.percent)
        updater.on("download-progress", listener)
        return updater.downloadUpdate().finally(() => updater.off("download-progress", listener))
      },
      quitAndInstall: async () => {
        // electron-updater 6.8.9 stages the proxy but does not start Squirrel when autoInstallOnAppQuit=false.
        // Prepare natively before invoking MacUpdater.quitAndInstall, which otherwise arms a late automatic quit.
        if (native && !nativeReady) await prepareNativeUpdate({
          subscribe: (onReady, onError) => {
            native.once("update-downloaded", onReady)
            native.once("error", onError)
            return () => { native.off("update-downloaded", onReady); native.off("error", onError) }
          },
          prepare: () => native.checkForUpdates(),
        })
        try {
          const exiting = await confirmUpdaterQuit({
            subscribe: (onQuit, onQuitting) => {
              app.once("will-quit", onQuit)
              app.once("before-quit", onQuitting)
              return () => { app.off("will-quit", onQuit); app.off("before-quit", onQuitting) }
            },
            install: () => {
              setAppQuitting()
              updater.quitAndInstall()
            },
          })
          if (!exiting) setAppQuitting(false)
          return exiting
        } catch (error) {
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
