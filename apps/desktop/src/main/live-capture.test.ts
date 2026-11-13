import { expect, test } from "bun:test"
import { mockElectron } from "./electron-mock.fixture"

test.each(["load", "configure", "media", "restart"])("aborting capture during %s destroys its window", async (stage) => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const restart = Promise.withResolvers<void>()
  const state = { destroyed: false, started: 0, delivered: 0, restarts: 0 }
  const listeners = new Map<string, (...args: unknown[]) => unknown>()
  const hold = async () => {
    entered.resolve()
    await release.promise
  }
  class CaptureWindow {
    webContents = {
      setWindowOpenHandler: () => undefined,
      on: () => undefined,
      ipc: { on: (name: string, listener: (...args: unknown[]) => unknown) => listeners.set(name, listener) },
      executeJavaScript: async (script: string) => {
        if (script === "start(true)") {
          state.restarts++
          return restart.promise
        }
        if (script === "start()") {
          state.started++
          if (stage === "media" || stage === "restart") await hold()
          return
        }
        if (stage === "configure") await hold()
      },
    }
    async loadURL() {
      if (stage === "load") await hold()
    }
    isDestroyed() { return state.destroyed }
    destroy() { state.destroyed = true }
  }
  mockElectron({
    BrowserWindow: CaptureWindow,
    session: {
      fromPartition: () => ({
        protocol: { isProtocolHandled: () => true },
        setPermissionRequestHandler: () => undefined,
        setPermissionCheckHandler: () => undefined,
        setDisplayMediaRequestHandler: () => undefined,
      }),
    },
  })
  const { startCapture } = await import("./live-capture")
  const attempt = new AbortController()
  const capture = startCapture({
    audio: () => void state.delivered++,
    status: () => void state.delivered++,
    state: () => void state.delivered++,
  }, { microphone: true, systemAudio: false }, attempt.signal)
  try {
    await entered.promise
    const restarting = stage === "restart" ? listeners.get("live-capture:restart")?.() : undefined
    attempt.abort()
    if (stage === "restart") {
      restart.reject(new Error("Window closed during restart"))
      await restarting
      listeners.get("live-capture:restart")?.()
      expect(state.restarts).toBe(1)
    }
    expect(state.destroyed).toBe(true)
    listeners.get("live-capture:audio")?.({}, new Float32Array(), new Float32Array())
    listeners.get("live-capture:status")?.({}, "microphone", "granted", "")
    listeners.get("live-capture:state")?.({}, "started", "")
    expect(state.delivered).toBe(0)
    release.resolve()
    await expect(capture).rejects.toMatchObject({ name: "AbortError" })
    expect(state.started).toBe(stage === "media" || stage === "restart" ? 1 : 0)
  } finally {
    release.resolve()
    await capture.catch(() => undefined)
  }
})
