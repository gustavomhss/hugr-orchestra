import { EventEmitter } from "node:events"
import { mkdtemp, open, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { registerResponseDownloadIpc } from "./response-download"
import type { ResponseDownloadAPI } from "../preload/response-download"

type Handler = (event: unknown, ...args: unknown[]) => unknown

export async function responseDownloadFixture(options: {
  choose?: Parameters<typeof registerResponseDownloadIpc>[0]["choose"]
  open?: Parameters<typeof registerResponseDownloadIpc>[0]["open"]
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "orchestra-response-download-"))
  const destination = join(root, "download.bin")
  const handlers = new Map<string, Handler>()
  const app = Object.assign(new EventEmitter(), { quit() {} })
  const frame = {}
  const sender = Object.assign(new EventEmitter(), { mainFrame: frame, isDestroyed: () => false })
  const win = Object.assign(new EventEmitter(), { webContents: sender, isDestroyed: () => false })
  const metrics = { closes: 0, writes: 0 }
  const registry = registerResponseDownloadIpc({
    ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
    app,
    BrowserWindow: { fromWebContents: (candidate: unknown) => candidate === sender ? win : null },
    choose: options.choose ?? (async () => ({ canceled: false, filePath: destination })),
    open: options.open ?? (async (path: string) => {
      const file = await open(path, "wx", 0o600)
      return {
        write: (bytes: Uint8Array, offset: number, length: number) => {
          metrics.writes++
          // Force partial writes through the real filesystem.
          return file.write(bytes, offset, Math.min(length, 4093))
        },
        close: () => { metrics.closes++; return file.close() },
      }
    }),
  } as unknown as Parameters<typeof registerResponseDownloadIpc>[0])
  const event = { sender, senderFrame: frame }
  const invoke = (channel: string, source: unknown, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!(source, ...args))
  const api: ResponseDownloadAPI = {
    start: (filename) => invoke("response-download-start", event, filename) as ReturnType<ResponseDownloadAPI["start"]>,
    ready: (handle) => invoke("response-download-ready", event, handle) as ReturnType<ResponseDownloadAPI["ready"]>,
    write: (handle, sequence, chunk) => invoke("response-download-write", event, handle, sequence, chunk) as ReturnType<ResponseDownloadAPI["write"]>,
    finish: (handle, sequence) => invoke("response-download-finish", event, handle, sequence) as ReturnType<ResponseDownloadAPI["finish"]>,
    cancel: (handle) => invoke("response-download-cancel", event, handle) as ReturnType<ResponseDownloadAPI["cancel"]>,
  }
  return {
    root, destination, api, event, sender, win, metrics, invoke,
    async handle() {
      const result = await api.start("download.bin")
      if (result.status !== "ok") throw new Error(result.code)
      return result.handle
    },
    async close() {
      await registry.clear()
      await rm(root, { recursive: true, force: true })
    },
  }
}
