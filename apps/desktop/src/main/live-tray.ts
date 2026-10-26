import { app, Menu, nativeImage, Tray } from "electron"

import { elapsed } from "./live-elapsed"
import type { LiveLoop } from "./live-loop"
import { getLastFocusedWindow } from "./windows"
import { revealWindow } from "./window-state"

// The menu-bar item for meetings: elapsed time while one runs, and the few actions that matter without the window.

export function registerLiveTray(options: { loop: LiveLoop }) {
  if (process.platform !== "darwin") return { destroy: () => {} }
  // The Interface session supplies the icon asset; until then the title text alone marks the item.
  const tray = new Tray(nativeImage.createEmpty())
  const state = {
    timer: undefined as ReturnType<typeof setInterval> | undefined,
    last: undefined as { id: string; title: string } | undefined,
  }

  const open = (path: string) => {
    const win = getLastFocusedWindow()
    if (!win) return
    revealWindow(win)
    // Main has no navigation channel into the renderer; it routes on history changes.
    void win.webContents.executeJavaScript(
      `history.pushState({}, "", ${JSON.stringify(path)}); dispatchEvent(new PopStateEvent("popstate"))`,
    )
  }

  const render = () => {
    const run = options.loop.runState()
    if (run.running) state.last = { id: run.meetingID, title: run.title }
    tray.setTitle(run.running ? `● ${elapsed(Date.now() - run.startedAt)}` : "")
    const last = state.last
    tray.setContextMenu(
      Menu.buildFromTemplate([
        run.running
          ? { label: "Stop meeting", click: () => void options.loop.stop() }
          : { label: "Start meeting", click: () => void options.loop.start() },
        { label: "Open", click: () => open("/orchestra/flight-engineer") },
        ...(last ? [{ label: last.title, click: () => open(`/orchestra/flight-engineer/meetings/${last.id}`) }] : []),
      ]),
    )
  }

  const unsubscribe = options.loop.onRunState((run) => {
    clearInterval(state.timer)
    state.timer = run.running ? setInterval(render, 1000) : undefined
    render()
  })
  render()

  const destroy = () => {
    unsubscribe()
    clearInterval(state.timer)
    tray.destroy()
  }
  app.once("will-quit", destroy)
  return { destroy }
}
