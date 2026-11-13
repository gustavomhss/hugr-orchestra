import { describe, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { runInNewContext } from "node:vm"
import { confirmUpdaterQuit, createUpdaterController, prepareNativeUpdate, type UpdaterBackend, type UpdaterReadyRecord } from "./updater-controller"
import { rethrow } from "./rejection.fixture"

function setup(input?: {
  currentVersion?: string
  ready?: UpdaterReadyRecord
  releasePage?: (version: string) => string
  progress?: number[]
}) {
  const calls: string[] = []
  const backend: UpdaterBackend = {
    async checkForUpdates() {
      calls.push("check")
      return { isUpdateAvailable: true, updateInfo: { version: "2.0.0" } }
    },
    async downloadUpdate(onProgress) {
      calls.push("download")
      input?.progress?.forEach(onProgress)
    },
    async quitAndInstall() {
      calls.push("install")
      return false
    },
  }
  let ready = input?.ready
  const controller = createUpdaterController({
    enabled: true,
    releasePage: input?.releasePage,
    currentVersion: input?.currentVersion ?? "1.0.0",
    backend,
    persistence: {
      get: () => ready,
      set: (value) => {
        ready = value
      },
      clear: () => {
        ready = undefined
      },
    },

  })
  return { controller, calls, getReady: () => ready }
}

describe("updater controller", () => {
  test("checks, downloads, persists, and publishes one authoritative ready state", async () => {
    const app = setup()
    const states: ReturnType<typeof app.controller.getState>[] = []
    app.controller.subscribe((state) => states.push(state))

    await app.controller.start()

    expect(app.calls).toEqual(["check", "download"])
    expect(app.getReady()).toEqual({ version: "2.0.0" })
    expect(states.map((state) => state.status)).toEqual(["idle", "checking", "downloading", "ready"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("reports whole-percent download progress once per step", async () => {
    const app = setup({ progress: [10.2, 10.8, 55.5, 100] })
    const states: ReturnType<typeof app.controller.getState>[] = []
    app.controller.subscribe((state) => states.push(state))

    await app.controller.start()

    expect(states.filter((state) => state.status === "downloading")).toEqual([
      { status: "downloading", version: "2.0.0" },
      { status: "downloading", version: "2.0.0", percent: 10 },
      { status: "downloading", version: "2.0.0", percent: 55 },
      { status: "downloading", version: "2.0.0", percent: 100 },
    ])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("announces an update with its release page when the build cannot install it", async () => {
    const app = setup({ releasePage: (version) => `https://example.test/desktop-v${version}` })

    await app.controller.start()

    expect(app.calls).toEqual(["check"])
    expect(app.getReady()).toBeUndefined()
    expect(app.controller.getState()).toEqual({
      status: "available",
      version: "2.0.0",
      url: "https://example.test/desktop-v2.0.0",
    })
    expect(await rethrow(app.controller.install())).toThrow("Update is not ready to install")

    const states: ReturnType<typeof app.controller.getState>[] = []
    app.controller.subscribe((state) => states.push(state))
    await app.controller.check()
    expect(states.map((state) => state.status)).toEqual(["available", "available"])
  })

  test("revalidates a persisted target through the updater cache on launch", async () => {
    const app = setup({ ready: { version: "2.0.0" } })

    await app.controller.start()

    expect(app.calls).toEqual(["check", "download"])
    expect(app.controller.getState()).toEqual({ status: "ready", version: "2.0.0" })
  })

  test("clears a target already installed before checking", async () => {
    const app = setup({ currentVersion: "2.0.0", ready: { version: "2.0.0" } })

    await app.controller.start()

    expect(app.getReady()).toBeUndefined()
    expect(app.calls).toEqual(["check"])
  })

  test("coalesces concurrent checks", async () => {
    const app = setup()

    await Promise.all([app.controller.check(), app.controller.check(), app.controller.check()])

    expect(app.calls).toEqual(["check", "download"])
  })

  for (const mode of ["throw", "no-exit", "confirmed-quit"] as const) {
    test(`install preserves services until actual quit: ${mode}`, async () => {
      const calls: string[] = []
      let operational = true
      const controller = createUpdaterController({
        enabled: true, currentVersion: "1.0.0",
        backend: {
          checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version: "2.0.0" } }),
          downloadUpdate: async () => {},
          quitAndInstall: async () => {
            calls.push("install")
            if (mode === "throw") throw new Error("installer failed")
            if (mode === "confirmed-quit") operational = false
            return mode === "confirmed-quit"
          },
        },
        persistence: { get: () => undefined, set() {}, clear() {} },
      })
      await controller.start()
      if (mode === "throw") expect(await rethrow(controller.install())).toThrow("installer failed")
      else await controller.install()
      expect(controller.getState()).toEqual({ status: mode === "confirmed-quit" ? "installing" : "ready", version: "2.0.0" })
      expect(operational).toBe(mode !== "confirmed-quit")
      expect(calls).toEqual(["install"])
    })
  }
})

for (const mode of ["async-quit", "no-exit", "throw"] as const) {
  test(`quit confirmation cleans its listener and deadline: ${mode}`, async () => {
    const listeners = new Set<() => void>()
    let subscribed = false
    const confirmation = confirmUpdaterQuit({
      subscribe: (onQuit) => {
        listeners.add(onQuit)
        subscribed = true
        return () => { listeners.delete(onQuit) }
      },
      install: () => {
        expect(subscribed).toBe(true)
        if (mode === "throw") throw new Error("install failed")
        if (mode === "async-quit") setTimeout(() => listeners.forEach((onQuit) => onQuit()), 0)
      },
      timeout: 20,
    })
    if (mode === "throw") expect(await rethrow(confirmation)).toThrow("install failed")
    else expect(await confirmation).toBe(mode === "async-quit")
    expect(listeners.size).toBe(0)
    // An already confirmed quit cannot be reclassified as a timeout.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(listeners.size).toBe(0)
  })
}


test("quit grace does not interrupt an accepted shutdown with partial teardown failure", async () => {
  const events = new EventEmitter()
  let stopped = false
  const confirmation = confirmUpdaterQuit({
    subscribe: (onQuit, onQuitting) => {
      events.on("before-quit", onQuitting)
      events.on("will-quit", onQuit)
      return () => { events.off("before-quit", onQuitting); events.off("will-quit", onQuit) }
    },
    install: () => {
      events.emit("before-quit")
      // The existing index before-quit handler logs individual cleanup failures, then completes quit.
      void Promise.resolve().then(() => { stopped = true; throw new Error("partial stop") })
        .catch(() => {}).then(() => setTimeout(() => events.emit("will-quit"), 40))
    },
    timeout: 10,
  })
  expect(await confirmation).toBe(true)
  expect(stopped).toBe(true)
  expect(events.eventNames()).toEqual([])
})

test("pinned MacUpdater 6.8.9 native preparation can exceed the quit grace without stopping services", async () => {
  const native = Object.assign(new EventEmitter(), { checkForUpdates() {}, quitAndInstall() {}, setFeedURL() {} })
  const events = new EventEmitter()
  const calls: string[] = []
  let operational = true
  Object.assign(native, {
    setFeedURL() { calls.push("feed") },
    checkForUpdates() { calls.push("native-download") },
    quitAndInstall() {
      calls.push("native-install")
      events.emit("before-quit")
      operational = false
      setTimeout(() => events.emit("will-quit"), 0)
    },
  })
  const exported: { MacUpdater?: new () => { autoInstallOnAppQuit: boolean; quitAndInstall(): void; updateDownloaded(file: { url: URL; info: { size: number } }, event: { downloadedFile: string }): Promise<unknown> } } = {}
  const source = await Bun.file(Bun.resolveSync("electron-updater/out/MacUpdater.js", import.meta.dir)).text()
  expect((await Bun.file(Bun.resolveSync("electron-updater/package.json", import.meta.dir)).json()).version).toBe("6.8.9")
  runInNewContext(source, {
    exports: exported,
    Buffer,
    require: (name: string) => name === "electron" ? { autoUpdater: native }
      : name === "./AppUpdater" ? { AppUpdater: class extends EventEmitter {
        autoRunAppAfterInstall = true
        _logger = { warn() {}, debug() {}, info() {} }
        dispatchUpdateDownloaded() { calls.push("cached-ready") }
      } } : name === "http" ? { createServer: () => Object.assign(new EventEmitter(), {
        address: () => ({ port: 12345 }),
        listen: (_port: number, _host: string, onListen: () => void) => onListen(),
        close: (onClose: () => void) => onClose(),
      }) } : name === "crypto" ? { randomBytes: (size: number) => Buffer.alloc(size, 3) } : {},
  })
  if (!exported.MacUpdater) throw new Error("Pinned MacUpdater constructor missing")
  const updater = new exported.MacUpdater()
  updater.autoInstallOnAppQuit = false
  // Execute the actual doDownloadUpdate completion path, including the proxy/feed and autoInstallOnAppQuit gate.
  await updater.updateDownloaded({ url: new URL("https://example.test/update.zip"), info: { size: 1 } }, { downloadedFile: "staged.zip" })
  expect(calls).toEqual(["feed", "cached-ready"])
  const preparation = prepareNativeUpdate({
    subscribe: (onReady, onError) => {
      native.on("update-downloaded", onReady); native.on("error", onError)
      return () => { native.off("update-downloaded", onReady); native.off("error", onError) }
    },
    prepare: () => { calls.push("prepare"); native.emit("checking-for-update"); native.checkForUpdates() },
    timeout: 200,
  })
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(operational).toBe(true)
  expect(calls).toEqual(["feed", "cached-ready", "prepare", "native-download"])
  native.emit("update-downloaded")
  await preparation
  const confirmation = confirmUpdaterQuit({
    subscribe: (onQuit, onQuitting) => {
      events.on("will-quit", onQuit); events.on("before-quit", onQuitting)
      return () => { events.off("will-quit", onQuit); events.off("before-quit", onQuitting) }
    },
    install: () => updater.quitAndInstall(),
    timeout: 10,
  })
  expect(await confirmation).toBe(true)
  expect(calls).toEqual(["feed", "cached-ready", "prepare", "native-download", "native-install"])
  expect(operational).toBe(false)
  expect(events.eventNames()).toEqual([])
})

for (const mode of ["error", "throw", "timeout"] as const) {
  test(`native preparation cleans resources without scheduling an install: ${mode}`, async () => {
    const events = new EventEmitter()
    let installed = false
    const preparation = prepareNativeUpdate({
      subscribe: (onReady, onError) => {
        events.on("ready", onReady); events.on("failure", onError)
        return () => { events.off("ready", onReady); events.off("failure", onError) }
      },
      prepare: () => {
        if (mode === "throw") throw new Error("native check failed")
        if (mode === "error") setTimeout(() => events.emit("failure", new Error("native download failed")), 0)
      },
      timeout: 10,
    }).then(() => { installed = true })
    expect(await rethrow(preparation)).toThrow(mode === "timeout" ? "timed out" : "failed")
    events.emit("ready")
    expect(installed).toBe(false)
    expect(events.eventNames()).toEqual([])
  })
}
