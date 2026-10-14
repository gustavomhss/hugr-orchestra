import { randomUUID } from "node:crypto"
import { open, rename, rm } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { BrowserWindow, IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron"
import {
  RESPONSE_DOWNLOAD_CHUNK_BYTES,
  type ResponseDownloadFailure,
  type ResponseDownloadResult,
} from "../preload/response-download"

type DownloadFile = {
  write(bytes: Uint8Array, offset: number, length: number): Promise<{ bytesWritten: number }>
  close(): Promise<void>
}
type Save = {
  handle: string
  sender: WebContents
  frame: WebFrameMain
  win: BrowserWindow
  sequence: number
  ended: boolean
  commit: boolean
  path?: string
  temporary?: string
  file?: DownloadFile
  opening?: Promise<void>
  writing?: Promise<void>
  clearing?: Promise<void>
  ready?: Promise<ResponseDownloadResult>
  prepare(): Promise<ResponseDownloadResult>
  detach(): void
}
type Deps = {
  ipcMain: typeof import("electron").ipcMain
  app: typeof import("electron").app
  BrowserWindow: typeof import("electron").BrowserWindow
  choose(win: BrowserWindow, filename: string): Promise<{ canceled: boolean; filePath?: string }>
  open?: (path: string) => Promise<DownloadFile>
}

/** Chooser grants one opaque capability, never a renderer-supplied path. */
export function registerResponseDownloadIpc(deps: Deps) {
  const saves = new Map<string, Save>()
  const choosers = new WeakSet<WebContents>()
  let quitting = false
  const clear = (save: Save, commit = false) => {
    if (!commit) save.commit = false
    if (save.clearing) return save.clearing
    save.ended = true
    save.commit = commit
    save.clearing = (async () => {
      try {
        // A chooser can stay open after cancellation. Only an already-started open/write is awaited.
        await save.opening?.catch(() => undefined)
        await save.writing?.catch(() => undefined)
        await save.file?.close()
        if (save.commit && save.temporary && save.path) await rename(save.temporary, save.path)
      } finally {
        try {
          // Exclusive open can collide: never unlink a path unless this save acquired its handle.
          if (save.file && save.temporary) await rm(save.temporary, { force: true })
        } finally {
          save.detach()
          saves.delete(save.handle)
        }
      }
    })()
    return save.clearing
  }
  const cleanup = () => {
    quitting = true
    return Promise.allSettled(Array.from(saves.values(), (save) => clear(save)))
  }
  deps.app.once("will-quit", (event) => {
    if (!saves.size) return
    event.preventDefault()
    void cleanup().then(() => deps.app.quit())
  })
  const owner = (event: IpcMainInvokeEvent) => {
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    if (
      !win || win.isDestroyed() || event.sender.isDestroyed() || win.webContents !== event.sender
      || !event.senderFrame || event.senderFrame !== event.sender.mainFrame
    ) return
    return { win, frame: event.senderFrame }
  }
  const selection = (event: IpcMainInvokeEvent, handle: unknown) => {
    if (typeof handle !== "string" || handle.length > 64) return
    const save = saves.get(handle)
    if (!save || !owner(event) || save.sender !== event.sender || save.frame !== event.senderFrame) return
    return save
  }
  const fail = async (save: Save, error: unknown) => {
    await clear(save).catch(() => undefined)
    return downloadFailure(error)
  }

  deps.ipcMain.handle("response-download-start", (event, filename: unknown) => {
    const source = owner(event)
    if (!source) return downloadFailure({ code: "EACCES" })
    // Bound both pending choosers and file handles. No queue of retained chunks or saves.
    if (quitting || choosers.has(event.sender) || Array.from(saves.values()).some((save) => save.sender === event.sender))
      return downloadFailure(undefined)
    if (typeof filename !== "string" || !filename || filename.length > 1024 || /[\x00-\x1f]/.test(filename))
      return downloadFailure(undefined)
    const handle = randomUUID()
    const save: Save = {
      handle,
      sender: event.sender,
      frame: source.frame,
      win: source.win,
      sequence: 0,
      ended: false,
      commit: false,
      async prepare() {
        if (save.ended) return { status: "cancelled" }
        // Save dialogs have no abort API. Retain their slot until dismissal, even after handle cancellation.
        choosers.add(save.sender)
        const chosen = await Promise.resolve()
          .then(() => save.ended ? { canceled: true, filePath: undefined }
            : deps.choose(source.win, basename(filename.replaceAll("\\", "/"))))
          .finally(() => choosers.delete(save.sender))
        if (save.ended) return { status: "cancelled" }
        if (chosen.canceled || !chosen.filePath) {
          await clear(save)
          return { status: "cancelled" }
        }
        save.path = chosen.filePath
        save.temporary = join(dirname(chosen.filePath), `.orchestra-download-${handle}.tmp`)
        save.opening = (deps.open ?? ((path) => open(path, "wx", 0o600)))(save.temporary).then((file) => { save.file = file })
        await save.opening
        if (save.ended) return { status: "cancelled" }
        return { status: "ok" }
      },
      detach() {
        save.sender.removeListener("destroyed", cancel)
        save.sender.removeListener("render-process-gone", cancel)
        save.sender.removeListener("did-start-navigation", navigate)
        save.win.removeListener("closed", cancel)
      },
    }
    const cancel = () => { void clear(save).catch(() => undefined) }
    const navigate = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
      if (details.isMainFrame && !details.isSameDocument) cancel()
    }
    saves.set(handle, save)
    save.sender.once("destroyed", cancel)
    save.sender.once("render-process-gone", cancel)
    save.sender.on("did-start-navigation", navigate)
    save.win.once("closed", cancel)
    return { status: "ok", handle }
  })
  deps.ipcMain.handle("response-download-ready", (event, handle: unknown) => {
    const save = selection(event, handle)
    if (!save) return downloadFailure({ code: "EACCES" })
    return save.ready ??= save.prepare().catch((error: unknown) => fail(save, error))
  })
  deps.ipcMain.handle("response-download-write", async (event, handle: unknown, sequence: unknown, chunk: unknown) => {
    const save = selection(event, handle)
    if (!save) return downloadFailure({ code: "EACCES" })
    if (
      save.ended || !save.file || save.writing || !Number.isSafeInteger(sequence) || sequence !== save.sequence
      || !(chunk instanceof ArrayBuffer) || chunk.byteLength === 0 || chunk.byteLength > RESPONSE_DOWNLOAD_CHUNK_BYTES
    )
      return fail(save, undefined)
    const file = save.file
    // Reject overlap rather than chaining promises: a hostile renderer cannot grow a write queue.
    save.writing = (async () => {
      const bytes = new Uint8Array(chunk)
      let offset = 0
      while (offset < bytes.byteLength) {
        const result = await file.write(bytes, offset, bytes.byteLength - offset)
        if (result.bytesWritten <= 0 || result.bytesWritten > bytes.byteLength - offset) throw new Error("transfer_failed")
        offset += result.bytesWritten
        if (save.ended) return
      }
    })()
    try {
      await save.writing
      if (save.ended) return { status: "cancelled" }
      save.sequence++
      return { status: "ok" }
    } catch (error) {
      return fail(save, error)
    } finally {
      save.writing = undefined
    }
  })
  deps.ipcMain.handle("response-download-finish", async (event, handle: unknown, sequence: unknown) => {
    const save = selection(event, handle)
    if (!save) return downloadFailure({ code: "EACCES" })
    if (save.ended || !save.file || save.writing || !Number.isSafeInteger(sequence) || sequence !== save.sequence)
      return fail(save, undefined)
    return clear(save, true).then(
      () => ({ status: save.commit ? "ok" : "cancelled" }),
      downloadFailure,
    )
  })
  deps.ipcMain.handle("response-download-cancel", (event, handle: unknown) => {
    const save = selection(event, handle)
    if (!save) return downloadFailure({ code: "EACCES" })
    return clear(save).then(() => ({ status: "cancelled" }), downloadFailure)
  })
  return { clear: cleanup }
}

function downloadFailure(error: unknown): ResponseDownloadFailure {
  return { status: "error", code: typeof error === "object" && error !== null && "code" in error
    && (error.code === "EACCES" || error.code === "EPERM") ? "permission_denied" : "transfer_failed" }
}
