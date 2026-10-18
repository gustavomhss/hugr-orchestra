import type { BrowserWindow, WebContents } from "electron"
import type { AppDockEvent } from "./app-dock"
import { identity, type AppDockContext, type AppDockRecord } from "./app-dock-context"

const EXIT_FULLSCREEN = "void document.exitFullscreen?.(); true"

const appDockKeyCode = (key: string) => {
  const aliases: Record<string, string> = {
    Escape: "ESC",
    Esc: "ESC",
    Space: "SPACE",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    Backspace: "BACKSPACE",
    Delete: "DELETE",
    Enter: "ENTER",
    Tab: "TAB",
  }
  return aliases[key] ?? (key.length === 1 ? key.toUpperCase() : key)
}

// One sender window has at most one fullscreen owner tab. Every ownership change bumps the
// sender epoch so asynchronous fullscreen probes started earlier abandon their result.
export function createAppDockFullscreen(ctx: AppDockContext) {
  const fullscreenOwner = new Map<number, string>()
  const fullscreenEpoch = new Map<number, number>()
  const fullscreenWindowListeners = new Map<number, () => void>()
  const bump = (senderID: number) => {
    const epoch = (fullscreenEpoch.get(senderID) ?? 0) + 1
    fullscreenEpoch.set(senderID, epoch)
    return epoch
  }
  const exitDocument = (contents: WebContents) => contents.executeJavaScript(EXIT_FULLSCREEN, true).catch(() => undefined)

  return {
    installWindowBridge(senderID: number, win: BrowserWindow) {
      if (fullscreenWindowListeners.has(senderID)) return
      const listener = () => {
        const tabID = fullscreenOwner.get(senderID)
        const record = tabID && ctx.tabs.get(senderID)?.get(tabID)
        if (!record || win.isDestroyed()) return
        const epoch = bump(senderID)
        void record.view.webContents
          .executeJavaScript("Boolean(document.fullscreenElement)", true)
          .then((documentFullscreen) => {
            if (fullscreenEpoch.get(senderID) !== epoch || !ctx.isCurrent(senderID, tabID, record.generation)) return
            if (!documentFullscreen) {
              if (fullscreenOwner.get(senderID) === tabID) {
                fullscreenOwner.delete(senderID)
                bump(senderID)
              }
              record.notify(Object.freeze({ type: "fullscreen", payload: Object.freeze({ identity: identity(tabID, record.generation), enabled: false }) }))
              return
            }
            if (!win.isFullScreen()) win.setFullScreen(true)
            if (fullscreenEpoch.get(senderID) !== epoch) return
            void record.view.webContents.executeJavaScript(EXIT_FULLSCREEN, true)
          })
          .catch(() => undefined)
      }
      win.on("leave-full-screen", listener)
      fullscreenWindowListeners.set(senderID, listener)
    },
    clearSender(senderID: number, win?: BrowserWindow) {
      const listener = fullscreenWindowListeners.get(senderID)
      if (listener && win && !win.isDestroyed()) win.removeListener("leave-full-screen", listener)
      fullscreenWindowListeners.delete(senderID)
      fullscreenEpoch.delete(senderID)
    },
    releaseRemoved(senderID: number, tabID: string, record: AppDockRecord) {
      if (fullscreenOwner.get(senderID) !== tabID) return
      fullscreenOwner.delete(senderID)
      bump(senderID)
      void exitDocument(record.view.webContents)
      if (!record.win.isDestroyed() && record.win.isFullScreen()) record.win.setFullScreen(false)
    },
    // Selecting a tab takes fullscreen away from any other tab of the sender.
    releaseOther(senderID: number, win: BrowserWindow, tabID: string) {
      const fullscreenTabID = fullscreenOwner.get(senderID)
      if (!fullscreenTabID || fullscreenTabID === tabID) return
      const fullscreenRecord = ctx.tabs.get(senderID)?.get(fullscreenTabID)
      fullscreenOwner.delete(senderID)
      bump(senderID)
      if (fullscreenRecord) void exitDocument(fullscreenRecord.view.webContents)
      if (!win.isDestroyed() && win.isFullScreen()) win.setFullScreen(false)
    },
    releaseHidden(senderID: number) {
      const fullscreenTabID = fullscreenOwner.get(senderID)
      const fullscreenRecord = fullscreenTabID ? ctx.tabs.get(senderID)?.get(fullscreenTabID) : undefined
      if (fullscreenRecord) {
        void exitDocument(fullscreenRecord.view.webContents)
        fullscreenRecord.notify(Object.freeze({ type: "fullscreen", payload: Object.freeze({ identity: identity(fullscreenTabID!, fullscreenRecord.generation), enabled: false }) }))
      }
      fullscreenOwner.delete(senderID)
      bump(senderID)
      if (fullscreenRecord && !fullscreenRecord.win.isDestroyed() && fullscreenRecord.win.isFullScreen()) fullscreenRecord.win.setFullScreen(false)
    },
    enterHtml(senderID: number, id: string, tabGeneration: number, contents: WebContents, win: BrowserWindow, notify: (event: AppDockEvent) => void) {
      if (!ctx.isCurrent(senderID, id, tabGeneration)) return
      const epoch = bump(senderID)
      void (async () => {
        const deadline = Date.now() + 3_000
        let fullscreen = false
        while (Date.now() < deadline) {
          fullscreen = await contents.executeJavaScript("Boolean(document.fullscreenElement)", true).catch(() => false)
          if (fullscreen) break
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        if (!fullscreen || fullscreenEpoch.get(senderID) !== epoch || !ctx.isCurrent(senderID, id, tabGeneration) || ctx.active.get(senderID) !== id || win.isDestroyed() || (fullscreenOwner.has(senderID) && fullscreenOwner.get(senderID) !== id)) {
          if (fullscreenEpoch.get(senderID) !== epoch) return
          void exitDocument(contents)
          if (!win.isDestroyed() && win.isFullScreen() && (!fullscreenOwner.has(senderID) || fullscreenOwner.get(senderID) === id)) win.setFullScreen(false)
          return
        }
        fullscreenOwner.set(senderID, id)
        if (!win.isFullScreen()) win.setFullScreen(true)
        notify(
          Object.freeze({
            type: "fullscreen",
            payload: Object.freeze({ identity: identity(id, tabGeneration), enabled: true }),
          }),
        )
      })()
    },
    leaveHtml(senderID: number, id: string, tabGeneration: number, contents: WebContents, win: BrowserWindow, notify: (event: AppDockEvent) => void) {
      if (!ctx.isCurrent(senderID, id, tabGeneration)) return
      const epoch = bump(senderID)
      void (async () => {
        if (fullscreenEpoch.get(senderID) !== epoch) return
        await exitDocument(contents)
        const deadline = Date.now() + 3_000
        let fullscreen = true
        while (Date.now() < deadline) {
          fullscreen = await contents.executeJavaScript("Boolean(document.fullscreenElement)", true).catch(() => true)
          if (!fullscreen) break
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
        if (fullscreen || fullscreenEpoch.get(senderID) !== epoch || !ctx.isCurrent(senderID, id, tabGeneration) || fullscreenOwner.get(senderID) !== id) return
        fullscreenOwner.delete(senderID)
        bump(senderID)
        if (!win.isDestroyed() && win.isFullScreen()) win.setFullScreen(false)
        notify(
          Object.freeze({
            type: "fullscreen",
            payload: Object.freeze({ identity: identity(id, tabGeneration), enabled: false }),
          }),
        )
      })()
    },
    async toggle(senderID: number, win: BrowserWindow, tabID: string, enabled: boolean) {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      const epoch = bump(senderID)
      if (!enabled) {
        if (fullscreenOwner.get(senderID) === tabID) {
          fullscreenOwner.delete(senderID)
          bump(senderID)
          if (!win.isDestroyed()) win.setFullScreen(false)
          record.notify(Object.freeze({ type: "fullscreen", payload: Object.freeze({ identity: identity(tabID, record.generation), enabled: false }) }))
        }
        await exitDocument(record.view.webContents)
      }
      if (enabled) {
        const owner = fullscreenOwner.get(senderID)
        if (ctx.active.get(senderID) !== tabID || (owner && owner !== tabID)) return
        fullscreenOwner.set(senderID, tabID)
        win.setFullScreen(true)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (!ctx.isCurrent(senderID, tabID, record.generation) || fullscreenEpoch.get(senderID) !== epoch) return
      record.notify(
        Object.freeze({
          type: "fullscreen",
          payload: Object.freeze({ identity: identity(tabID, record.generation), enabled: win.isFullScreen() }),
        }),
      )
    },
    async keyboard(senderID: number, tabID: string, type: "keyDown" | "keyUp", key: string): Promise<{ ok: boolean; type: string; key: string; error?: string }> {
      const record = ctx.tabs.get(senderID)?.get(tabID)
      if (!record) throw new Error("Unknown App Dock tab")
      if (!record.win.isFocused()) record.win.focus()
      record.view.webContents.focus()
      const keyCode = appDockKeyCode(key)
      let fullscreenEpochAtStart = fullscreenEpoch.get(senderID) ?? 0
      if (type === "keyDown" && keyCode === "ESC") {
        const owner = fullscreenOwner.get(senderID)
        if (owner && owner !== tabID) return { ok: false, type, key, error: "Fullscreen is owned by another tab" }
        fullscreenEpochAtStart = bump(senderID)
        await record.view.webContents
          .executeJavaScript("(async () => { if (!document.fullscreenElement) return false; await document.exitFullscreen?.(); return true })()", true)
          .catch(() => false)
      }
      record.view.webContents.sendInputEvent({ type, keyCode })
      if (type !== "keyDown" || keyCode !== "ESC") return { ok: true, type, key }
      const exited = () => {
        if (fullscreenEpoch.get(senderID) !== fullscreenEpochAtStart) return
        if (record.win.isFullScreen()) record.win.setFullScreen(false)
        if (fullscreenOwner.get(senderID) === tabID) {
          fullscreenOwner.delete(senderID)
          bump(senderID)
        }
      }
      const deadline = Date.now() + 1_000
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        const fullscreen = await record.view.webContents
          .executeJavaScript("Boolean(document.fullscreenElement)", true)
          .catch(() => false)
        if (!fullscreen) {
          exited()
          return { ok: true, type, key }
        }
      }
      await exitDocument(record.view.webContents)
      const fullscreen = await record.view.webContents
        .executeJavaScript("Boolean(document.fullscreenElement)", true)
        .catch(() => false)
      if (!fullscreen) {
        exited()
        return { ok: true, type, key }
      }
      return { ok: false, type, key, error: "Fullscreen exit was not observed" }
    },
  }
}
