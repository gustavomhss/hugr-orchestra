import { randomUUID } from "node:crypto"
import { mkdirSync, rmSync } from "node:fs"
import * as http from "node:http"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { getCACertificates, setDefaultCACertificates } from "node:tls"
import type { Event } from "electron"
import { app, BrowserWindow } from "electron"

import { Deferred, Effect, Fiber } from "effect"
import contextMenu from "electron-context-menu"

import type { ServerReadyData } from "../preload/types"
import { checkAppExists, resolveAppPath } from "./apps"
import { CHANNEL } from "./constants"
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand } from "./ipc"
import { handleDockRPC } from "./app-dock-rpc"
import { LinuxWorkspaceRPC } from "./linux-workspace-rpc"
import { forwardInitializationFailure } from "./initialization"
import { exportDebugLogs, initCrashReporter, initLogging, startNetLog, write as writeLog } from "./logging"
import { createMenu } from "./menu"
import {
  finishFirstLaunchOnboarding,
  initializeOldLayoutEligibility,
  isFirstLaunchOnboardingPending,
  isOldLayoutEligible,
} from "./onboarding"
import {
  getDefaultServerUrl,
  preferAppEnv,
  setDefaultServerUrl,
  sidecarLaunchEnv,
} from "./server"
import { setupAutoUpdater, showUpdaterDialog } from "./updater"
import { revealWindow, safeWebContentsURL } from "./window-state"
import {
  flushWindows,
  getLastFocusedWindow,
  isMainWindow,
  registerRendererProtocol,
  setRelaunchHandler,
  setAppQuitting,
  setBackgroundColor,
  setDockIcon,
  restoreMainWindows,
} from "./windows"
import { createWslServersController } from "./wsl/servers"
import { registerWslIpcHandlers } from "./wsl/ipc"
import { spawnWslSidecar } from "./wsl/sidecar"
import { migrate } from "./migrate"
import { cleanupStoreFiles } from "./store-cleanup"
import { resolveCliBinary, startBackgroundCli } from "./background-cli"
import { sidecarMode, startOwnedServe } from "./owned-serve"
import { startDockChannel } from "./dock-channel"
import { readWslExpectedVersion } from "./cli-version"
import { nativeT, setNativeTranslations } from "./native-translations"
import { OmniBoot } from "./omni-boot"
import { OmniSmoke } from "./omni-smoke"
import { createDeepLinkDelivery } from "./deep-links"
import { registerLiveLoop } from "./live-loop"
import { registerLiveTray } from "./live-tray"
import { registerLiveOverlay } from "./live-overlay"

// These process names keep their inherited values: Electron names the macOS Keychain item that encrypts saved browser
// data "<name> Safe Storage", so renaming them would sign the App Dock out of every site. Menus, window titles and
// dialogs name "HuGR Orchestra" through the desktop.menu.* translations instead.
const APP_NAMES: Record<string, string> = {
  dev: "HuGR Orchestra Dev",
  beta: "HuGR Orchestra Beta",
  prod: "HuGR Orchestra",
}
const APP_IDS: Record<string, string> = {
  dev: "ai.hugr.orchestra.dev",
  beta: "ai.hugr.orchestra.beta",
  prod: "ai.hugr.orchestra",
}
const TEST_ONBOARDING = process.env.ORCHESTRA_TEST_ONBOARDING === "1"
// Default: a desktop-owned `orchestra serve` V2 child; "1" uses the shared background daemon. See apps/desktop/README.md.
const SIDECAR_MODE = sidecarMode(process.env.ORCHESTRA_SIDECAR)
const jsCallStackFeature = "DocumentPolicyIncludeJSCallStacksInCrashReports"

let logger: ReturnType<typeof initLogging>
let server: { stop: () => Promise<void> } | null = null
const startup = { windowsRestored: false }

const deepLinks = createDeepLinkDelivery(process.argv, (target, urls) => {
  const win = BrowserWindow.getAllWindows().find((window) => window.webContents.id === target)
  if (win && !win.isDestroyed()) sendDeepLinks(win, urls)
})

function useEnvProxy() {
  try {
    // Electron 41.2 runs Node 24.14.1; latest @types/node@24 is 24.12.2.
    ;(http as any).setGlobalProxyFromEnv()
  } catch (error) {
    logger.warn("failed to load proxy environment", error)
  }
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return
  const win = getLastFocusedWindow()
  deepLinks.enqueue(urls, win?.webContents.id)
}

async function killSidecar() {
  if (!server) return
  const current = server
  server = null
  await current.stop()
}

function ensureLoopbackNoProxy() {
  const loopback = ["127.0.0.1", "localhost", "::1"]
  const upsert = (key: string) => {
    const items = (process.env[key] ?? "")
      .split(",")
      .map((value: string) => value.trim())
      .filter((value: string) => Boolean(value))

    for (const host of loopback) {
      if (items.some((value: string) => value.toLowerCase() === host)) continue
      items.push(host)
    }

    process.env[key] = items.join(",")
  }

  upsert("NO_PROXY")
  upsert("no_proxy")
}

const main = Effect.gen(function* () {
  contextMenu({ showSaveImageAs: true, showLookUpSelection: false, showSearchWithGoogle: false })

  // on macOS apps run in `/` which can cause issues with ripgrep
  try {
    process.chdir(homedir())
  } catch {}

  process.env.ORCHESTRA_DISABLE_EMBEDDED_WEB_UI = "true"

  const appId = app.isPackaged ? APP_IDS[CHANNEL] : "ai.hugr.orchestra.dev"
  const onboardingTestRoot = ((): string | undefined => {
    if (!TEST_ONBOARDING) return

    const root = join(tmpdir(), `orchestra-onboarding-${randomUUID()}`)
    rmSync(root, { recursive: true, force: true })
    ;["data", "config", "cache", "state", "desktop", "session"].forEach((dir) =>
      mkdirSync(join(root, dir), { recursive: true }),
    )
    process.env.ORCHESTRA_DB = ":memory:"
    process.env.ORCHESTRA_INHERIT_CREDENTIALS = "0"
    process.env.XDG_DATA_HOME = join(root, "data")
    process.env.XDG_CONFIG_HOME = join(root, "config")
    process.env.XDG_CACHE_HOME = join(root, "cache")
    process.env.XDG_STATE_HOME = join(root, "state")
    return root
  })()
  app.setName(app.isPackaged ? APP_NAMES[CHANNEL] : "HuGR Orchestra Dev")
  app.setAppUserModelId(appId)
  app.setPath(
    "userData",
    onboardingTestRoot ? join(onboardingTestRoot, "desktop") : join(app.getPath("appData"), appId),
  )
  if (onboardingTestRoot) app.setPath("sessionData", join(onboardingTestRoot, "session"))
  initializeOldLayoutEligibility(app.getPath("userData"))
  logger = initLogging()
  initCrashReporter()
  OmniBoot.setup()

  const wslVersion = yield* Effect.promise(() =>
    readWslExpectedVersion(
      process.platform,
      app.isPackaged ? join(process.resourcesPath, "cli") : join(import.meta.dirname, "../../resources/cli"),
      app.getVersion(),
    ),
  )
  const wslServers = createWslServersController(
    wslVersion,
    async (distro) => {
      logger.log("spawning wsl sidecar", { distro })
      return spawnWslSidecar(distro, {
        onLine: (line) => logger.log("wsl sidecar", { distro, stream: line.stream, text: line.text }),
      })
    },
    {
      logger: {
        log: (message, meta) => logger.log(message, meta),
        error: (message, meta) => logger.error(message, meta),
      },
    },
  )
  const stopSidecars = async () => {
    await killSidecar()
    wslServers.stopAll()
  }
  const shutdown = {
    runtimeStop: undefined as (() => Promise<void>) | undefined,
    promise: undefined as Promise<void> | undefined,
    done: false,
  }
  // Every quit path lets the windows save unsaved work (at most 3 s) before the sidecars stop.
  const relaunch = () => {
    setAppQuitting()
    void flushWindows().then(stopSidecars).finally(() => {
      app.relaunch()
      app.quit()
    })
  }

  try {
    setDefaultCACertificates([...new Set([...getCACertificates("default"), ...getCACertificates("system")])])
  } catch (error) {
    logger.warn("failed to load system certificates", error)
  }

  logger.log("app starting", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    onboardingTest: Boolean(onboardingTestRoot),
  })

  ensureLoopbackNoProxy()
  useEnvProxy()
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>")
  const features = app.commandLine.getSwitchValue("enable-features")
  app.commandLine.appendSwitch("enable-features", features ? `${jsCallStackFeature},${features}` : jsCallStackFeature)
  if (!app.isPackaged && !app.commandLine.hasSwitch("remote-debugging-port"))
    app.commandLine.appendSwitch("remote-debugging-port", "9222")

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  const shellEnv = preferAppEnv(app.getPath("userData"))

  app.on("second-instance", (_event: Event, argv: string[]) => {
    const urls = argv.filter((arg: string) => arg.startsWith("orchestra://"))
    if (urls.length) {
      logger.log("deep link received via second-instance", { urls })
      emitDeepLinks(urls)
    }
    const win = getLastFocusedWindow() ?? BrowserWindow.getAllWindows().find(isMainWindow)
    if (win) return revealWindow(win)
    // macOS keeps running with no window; reopen one so the launch (and any
    // queued deep link) lands somewhere. Before startup restores its windows,
    // startup will open them itself.
    if (startup.windowsRestored) restoreMainWindows()
  })

  app.on("open-url", (event: Event, url: string) => {
    event.preventDefault()
    logger.log("deep link received via open-url", { url })
    emitDeepLinks([url])
  })
  app.on("browser-window-created", (_event, win) => {
    const id = win.webContents.id
    win.webContents.on("did-start-navigation", (_event, _url, _inPlace, mainFrame) => {
      if (mainFrame) deepLinks.pause(id)
    })
    win.on("closed", () => deepLinks.pause(id))
  })

  app.on("before-quit", (event) => {
    setAppQuitting()
    if (shutdown.done) return
    event.preventDefault()
    shutdown.promise ??= flushWindows()
      .then(() =>
        Promise.all([
          stopSidecars().catch((error: unknown) => logger.error("failed to stop sidecars", error)),
          Promise.resolve()
            .then(() => shutdown.runtimeStop?.())
            .catch((error: unknown) => logger.error("failed to stop Linux runtime", error)),
        ]),
      )
      .then(() => {
        shutdown.done = true
        app.quit()
      })
  })

  app.on("will-quit", () => {
    setAppQuitting()
    void stopSidecars()
  })

  app.on("child-process-gone", (_event, details) => {
    writeLog("utility", "child process gone", { details }, "error")
  })

  app.on("render-process-gone", (_event, webContents, details) => {
    writeLog("window", "app render process gone", { url: safeWebContentsURL(webContents), details }, "error")
  })

  setRelaunchHandler(() => {
    relaunch()
  })

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      setAppQuitting()
      void stopSidecars().finally(() => app.quit())
    })
  }

  const serverReady = Deferred.makeUnsafe<ServerReadyData, unknown>()

  yield* Effect.promise(() => app.whenReady())

  if (!TEST_ONBOARDING) migrate()
  yield* Effect.promise(() => cleanupStoreFiles(app.getPath("userData"))).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        if (result.deleted.length === 0) return
        logger.log("cleaned scoped store files", { count: result.deleted.length, scanned: result.scanned })
      }),
    ),
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to clean scoped store files", error)
      }),
    ),
  )
  app.setAsDefaultProtocolClient("orchestra")
  registerRendererProtocol()
  const liveOverlay = registerLiveOverlay()
  app.once("will-quit", liveOverlay.destroy)
  setDockIcon()
  // The About panel would show the inherited process name (APP_NAMES); it names the product instead. Its icon is
  // still the bundle's, until HuGR desktop icons exist.
  app.setAboutPanelOptions({ applicationName: nativeT("desktop.menu.app"), applicationVersion: app.getVersion() })
  const updater = setupAutoUpdater(() => flushWindows().then(stopSidecars))
  const menuDeps = {
    trigger: (id: string) => {
      const win = getLastFocusedWindow()
      if (win) sendMenuCommand(win, id)
    },
    checkForUpdates: () => void showUpdaterDialog(updater, true),
    relaunch,
  }
  const liveLoop = registerLiveLoop({
    overlay: liveOverlay,
    server: () =>
      Effect.runPromise(Deferred.await(serverReady)).then((ready) => ({
        url: ready.url,
        username: ready.username ?? undefined,
        password: ready.password ?? undefined,
      })),
    logDirectory: join(app.getPath("userData"), "logs", "live"),
    openSettings: () => menuDeps.trigger("settings.open"),
  })
  app.once("will-quit", liveLoop.destroy)
  registerLiveTray({ loop: liveLoop })
  shutdown.runtimeStop = registerIpcHandlers({
    liveLoop,
    killSidecar: () => killSidecar(),
    relaunch,
    awaitInitialization: Effect.fnUntraced(
      function* () {
        logger.log("awaiting server ready")
        const res = yield* Deferred.await(serverReady)
        logger.log("server ready", { url: res.url })
        return res
      },
      (e) => Effect.runPromise(e),
    ),
    consumeInitialDeepLinks: (target) => deepLinks.consume(target),
    getDefaultServerUrl: () => getDefaultServerUrl(),
    setDefaultServerUrl: (url) => setDefaultServerUrl(url),
    isFirstLaunchOnboardingPending,
    finishFirstLaunchOnboarding,
    isOldLayoutEligible,
    getDisplayBackend: async () => null,
    setDisplayBackend: async () => { throw new Error("Unsupported display backend setting") },
    checkAppExists: (appName) => checkAppExists(appName),
    resolveAppPath: async (appName) => resolveAppPath(appName),
    updater,
    showUpdater: () => showUpdaterDialog(updater, true),
    setBackgroundColor: (color) => setBackgroundColor(color),
    exportDebugLogs: () => exportDebugLogs(),
    recordFatalRendererError: (error) => writeLog("renderer", "fatal renderer error", { ...error }, "error"),
    setNativeTranslations: (bundle) => {
      if (setNativeTranslations(bundle)) createMenu(menuDeps)
    },
  }).stopLinuxRuntime
  registerWslIpcHandlers(wslServers)
  void updater.start()
  const updateTimer = setInterval(() => void updater.check(), 10 * 60 * 1000)
  updateTimer.unref()
  app.once("will-quit", () => clearInterval(updateTimer))
  yield* Effect.promise(() => startNetLog()).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to start net log", error)
      }),
    ),
  )

  const loadingTask = yield* Effect.gen(function* () {
    logger.log("sidecar connection started", { mode: SIDECAR_MODE })

    ensureLoopbackNoProxy()
    useEnvProxy()

    if (SIDECAR_MODE === "shared") {
      logger.log("starting shared background sidecar")
      const sidecar = yield* Effect.promise(() => startBackgroundCli(logger, shellEnv?.XDG_STATE_HOME))
      yield* Deferred.succeed(serverReady, {
        url: sidecar.url,
        username: sidecar.username,
        password: sidecar.password,
      })

      if (process.platform === "win32") {
        void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
      }

      logger.log("loading task finished")
      return
    }

    // The child reaches main's Dock handlers through this channel.
    const dock = yield* Effect.promise(() =>
      startDockChannel({
        onMessage: (message, reply) => {
          if (!LinuxWorkspaceRPC.handle(message, reply)) handleDockRPC(message, reply)
        },
        onClose: () =>
          void LinuxWorkspaceRPC.close().catch(() => writeLog("utility", "linux access cleanup failed", {}, "warn")),
      }),
    )
    const owned = yield* Effect.promise(() =>
      Promise.all([resolveCliBinary(logger), sidecarLaunchEnv(app.getPath("userData"))]).then(
        ([binary, env]) =>
          startOwnedServe({
            logger,
            command: [binary],
            env: { ...env, ...dock.env },
            write: (stream, message) =>
              writeLog("server", stream, { message }, stream === "stderr" ? "warn" : "info"),
            onSpawn: (pid) => OmniSmoke.utilityStarted(pid),
            onEvent: (name, data) => OmniSmoke.event(name, data),
          }),
      ),
    )
    server = { stop: () => owned.listener.stop().finally(() => dock.close()) }

    if (process.platform === "win32") {
      void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
    }

    yield* Effect.tryPromise(() => owned.health.wait).pipe(
      Effect.catch((e) => Effect.sync(() => logger.error("owned serve health check failed", String(e)))),
      Effect.ensuring(
        Deferred.succeed(serverReady, { url: owned.url, username: owned.username, password: owned.password }),
      ),
    )
    yield* Effect.promise(() => OmniBoot.report({ url: owned.url, username: owned.username, password: owned.password }, logger))
    logger.log("loading task finished")
  }).pipe(forwardInitializationFailure(serverReady), Effect.forkChild)

  app.on("window-all-closed", () => {
    if (process.platform === "darwin") return
    app.quit()
  })
  app.on("activate", () => {
    const open = BrowserWindow.getAllWindows().filter(isMainWindow)
    if (open.length === 0) return void restoreMainWindows()
    // Electron tells AppKit not to reopen when no window is visible, so a dock
    // click with every window minimized would otherwise do nothing.
    if (open.every((win) => win.isMinimized())) revealWindow(getLastFocusedWindow() ?? open[0])
  })

  // The renderer shows its splash and waits for the sidecar through awaitInitialization.
  const windows = restoreMainWindows()
  startup.windowsRestored = true
  if (windows.length) createMenu(menuDeps)

  // Returning would interrupt the sidecar boot, which is a child fiber of this one.
  yield* Fiber.await(loadingTask)
})

Effect.runFork(main)
