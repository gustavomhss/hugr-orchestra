import { describe, expect, test } from "bun:test"
import { mockElectron } from "./electron-mock.fixture"

type Handler = (event: unknown, ...args: unknown[]) => unknown
type Loop = Parameters<typeof import("./live-ipc").registerLiveIpc>[0]

const handlers = new Map<string, Handler>()
const sent: { channel: string; payload: unknown }[] = []
const window = { isDestroyed: () => false, webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) } }
mockElectron({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
  BrowserWindow: { getAllWindows: () => [window] },
})
const { registerLiveIpc } = await import("./live-ipc")

function fakeLoop() {
  const runListeners: ((state: unknown) => void)[] = []
  const levelListeners: ((levels: unknown) => void)[] = []
  const bound = new Map<string, unknown>()
  const loop = {
    settings: {
      bind: (action: string, handler: unknown) => bound.set(action, handler),
      get: () => ({ answerModel: undefined }),
    },
    running: () => false,
    runState: () => ({ running: false }),
    start: async (title?: string) => ({ ok: true, meetingID: title ?? "untitled" }),
    stop: async () => {},
    toggleCaptions: () => {},
    onRunState: (listener: (state: unknown) => void) => void runListeners.push(listener),
    onLevels: (listener: (levels: unknown) => void) => void levelListeners.push(listener),
  } as unknown as Loop
  return { loop, runListeners, levelListeners, bound }
}

describe("live IPC", () => {
  test("broadcasts run state and levels to every window", () => {
    const { loop, runListeners, levelListeners } = fakeLoop()
    registerLiveIpc(loop)
    sent.length = 0
    runListeners.forEach((listener) => listener({ running: true, meetingID: "m1", startedAt: 1 }))
    levelListeners.forEach((listener) => listener({ microphone: 0.2, "system-audio": 0 }))
    expect(sent).toEqual([
      { channel: "live-run-state-changed", payload: { running: true, meetingID: "m1", startedAt: 1 } },
      { channel: "live-levels", payload: { microphone: 0.2, "system-audio": 0 } },
    ])
  })

  test("holds the captions hotkey only while a meeting runs", () => {
    const { loop, runListeners, bound } = fakeLoop()
    registerLiveIpc(loop)
    runListeners.forEach((listener) => listener({ running: true }))
    expect(bound.get("toggle-captions")).toBe(loop.toggleCaptions)
    runListeners.forEach((listener) => listener({ running: false }))
    expect(bound.get("toggle-captions")).toBeUndefined()
    expect(typeof bound.get("start-stop")).toBe("function")
  })

  test("validates what a renderer sends", async () => {
    registerLiveIpc(fakeLoop().loop)
    expect(() => handlers.get("request-live-permission")!({}, "camera")).toThrow()
    expect(handlers.get("set-live-hotkey")!({}, "nope", "Alt+M")).toEqual({ ok: false, reason: "invalid" })
    expect(() => handlers.get("rename-live-meeting")!({}, 1, "x")).toThrow()
    expect(await handlers.get("start-live-meeting")!({}, 5)).toEqual({ ok: true, meetingID: "untitled" })
  })
})
