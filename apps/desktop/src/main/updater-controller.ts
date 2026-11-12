import type { UpdaterState } from "@orchestra/app/updater"

export type { UpdaterState } from "@orchestra/app/updater"

export type UpdaterReadyRecord = { version: string }

export type UpdaterBackend = {
  checkForUpdates(): Promise<{ isUpdateAvailable?: boolean; updateInfo?: { version?: string } } | null | undefined>
  downloadUpdate(onProgress: (percent: number) => void): Promise<unknown>
  // True only once the application has committed to quitting; false after a bounded grace period.
  quitAndInstall(): Promise<boolean>
}

type UpdaterPersistence = {
  get(): UpdaterReadyRecord | undefined | Promise<UpdaterReadyRecord | undefined>
  set(value: UpdaterReadyRecord): void | Promise<void>
  clear(): void | Promise<void>
}

export function createUpdaterController(input: {
  enabled: boolean
  // Set for a build that cannot replace itself: a found update is announced with this page, never downloaded.
  releasePage?: (version: string) => string
  currentVersion: string
  backend: UpdaterBackend
  persistence: UpdaterPersistence
  log?: (message: string, data?: object) => void
}) {
  let state: UpdaterState = input.enabled ? { status: "idle" } : { status: "disabled" }
  let pending: Promise<UpdaterState> | undefined
  const listeners = new Set<(state: UpdaterState) => void>()

  const transition = (next: UpdaterState) => {
    // Download progress repeats "downloading"; log only status changes.
    if (next.status !== state.status) input.log?.("updater state changed", { from: state.status, to: next.status })
    state = next
    listeners.forEach((listener) => listener(state))
    return state
  }

  const check = () => {
    if (!input.enabled) return Promise.resolve(state)
    if (state.status === "ready" || state.status === "installing") return Promise.resolve(state)
    if (pending) return pending

    pending = (async () => {
      // An announced update stays on screen while the periodic check runs, so the titlebar link does not blink.
      if (state.status !== "available") transition({ status: "checking" })
      const result = await input.backend.checkForUpdates()
      const version = result?.updateInfo?.version
      if (!result?.isUpdateAvailable || !version || version === input.currentVersion) {
        await input.persistence.clear()
        return transition({ status: "up-to-date" })
      }
      if (input.releasePage) return transition({ status: "available", version, url: input.releasePage(version) })

      transition({ status: "downloading", version })
      await input.backend.downloadUpdate((value) => {
        const percent = Math.floor(value)
        if (state.status !== "downloading" || state.percent === percent) return
        transition({ status: "downloading", version, percent })
      })
      await input.persistence.set({ version })
      return transition({ status: "ready", version })
    })()
      .catch((error) =>
        transition({ status: "error", message: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => {
        pending = undefined
      })
    return pending
  }

  return {
    getState: () => state,
    subscribe(listener: (state: UpdaterState) => void) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    },
    async start() {
      const ready = await input.persistence.get()
      if (ready?.version === input.currentVersion) await input.persistence.clear()
      return check()
    },
    check,
    async install() {
      if (state.status !== "ready") throw new Error("Update is not ready to install")
      const version = state.version
      transition({ status: "installing", version })
      // Services stay operational until the app's existing before-quit handler owns teardown.
      await input.backend.quitAndInstall().then((exiting) => {
        if (!exiting) transition({ status: "ready", version })
      }).catch((error: unknown) => {
        transition({ status: "ready", version })
        throw error
      })
    },
  }
}

export type UpdaterController = ReturnType<typeof createUpdaterController>

/** Observe the quit itself; an accepted before-quit hands ownership to main's shutdown handler. */
export function confirmUpdaterQuit(input: {
  subscribe: (onQuit: () => void, onQuitting: () => void) => () => void
  install: () => void
  timeout?: number
}) {
  return new Promise<boolean>((resolve, reject) => {
    const state = { quitting: false }
    const cleanup = () => { clearTimeout(timer); unsubscribe() }
    const unsubscribe = input.subscribe(
      () => { cleanup(); resolve(true) },
      () => { state.quitting = true; clearTimeout(timer) },
    )
    const timer = setTimeout(() => { cleanup(); resolve(false) }, input.timeout ?? 15_000)
    try { input.install() } catch (error) {
      if (state.quitting) return
      cleanup()
      reject(error)
    }
  })
}

/** Squirrel downloads from MacUpdater's staged proxy only after its native check begins. */
export function prepareNativeUpdate(input: {
  subscribe: (onReady: () => void, onError: (error: Error) => void) => () => void
  prepare: () => void
  timeout?: number
}) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); unsubscribe() }
    const unsubscribe = input.subscribe(
      () => { cleanup(); resolve() },
      (error) => { cleanup(); reject(error) },
    )
    // This deadline never exits the app or arms a later automatic quit: services remain operational.
    const timer = setTimeout(() => { cleanup(); reject(new Error("Native updater preparation timed out")) }, input.timeout ?? 600_000)
    try { input.prepare() } catch (error) { cleanup(); reject(error) }
  })
}
