import { describe, expect, test } from "bun:test"
import { registerJanitorIpcHandlers } from "./janitor-ipc"

type Handler = (event: unknown, ...args: unknown[]) => unknown

function harness(values = new Map<string, unknown>()) {
  const handlers = new Map<string, Handler>()
  const quitHandlers: Array<() => void> = []
  const sent: unknown[][] = []
  const mainFrame = {}
  const sender = {
    mainFrame,
    isDestroyed: () => false,
    send: (...args: unknown[]) => sent.push(args),
  }
  const window = { isDestroyed: () => false, webContents: sender }
  const deps = {
    ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
    app: { once: (_event: string, handler: () => void) => quitHandlers.push(handler) },
    BrowserWindow: {
      fromWebContents: (candidate: unknown) => (candidate === sender ? window : null),
      getAllWindows: () => [window],
    },
    getStore: () => ({
      get: (key: string) => values.get(key),
      set: (key: string, value: unknown) => values.set(key, value),
      delete: (key: string) => values.delete(key),
    }),
  } as unknown as Parameters<typeof registerJanitorIpcHandlers>[0]
  registerJanitorIpcHandlers(deps)
  return { handlers, mainFrame, sender, sent, quitHandlers }
}

const report = JSON.stringify({
  createdAt: "2026-09-09T00:00:00.000Z",
  findings: [{ kind: "disk", severity: "attention", summary: "full", evidence: "e", suggestion: "s" }],
})

describe("janitor IPC", () => {
  test("validates sender, persists source, and blocks dismissed replay", async () => {
    const values = new Map<string, unknown>()
    const first = harness(values)
    const event = { sender: first.sender, senderFrame: first.mainFrame }
    const publish = first.handlers.get("janitor-publish")!
    const get = first.handlers.get("janitor-get-report")!
    const dismiss = first.handlers.get("janitor-dismiss")!

    expect(await publish(event, report, true, "local")).toBe(true)
    expect(first.sent).toHaveLength(1)
    expect(await get(event)).toEqual({ report, source: "local" })

    const second = harness(values)
    const secondEvent = { sender: second.sender, senderFrame: second.mainFrame }
    expect(await second.handlers.get("janitor-get-report")!(secondEvent)).toEqual({ report, source: "local" })
    second.sent.length = 0
    expect(await second.handlers.get("janitor-dismiss")!(secondEvent, "local")).toBe(true)
    second.sent.length = 0
    expect(await second.handlers.get("janitor-publish")!(secondEvent, report, true, "local")).toBe(true)
    expect(second.sent).toHaveLength(0)

    const foreign = { sender: {}, senderFrame: null }
    expect(() => publish(foreign, report, true, "local")).toThrow("Invalid Janitor sender")
  })
})
