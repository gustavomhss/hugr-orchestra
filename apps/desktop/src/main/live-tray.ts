import { app, Menu, nativeImage, Tray } from "electron"
import { join } from "node:path"

import { sendDeepLinks } from "./ipc"
import { elapsed } from "./live-elapsed"
import type { LiveLoop } from "./live-loop"
import { getLastFocusedWindow, iconsDir } from "./windows"
import { revealWindow } from "./window-state"

// The menu-bar item for meetings: elapsed time while one runs, and the few actions that matter without the window.

export function registerLiveTray(options: { loop: LiveLoop }) {
  if (process.platform !== "darwin") return { destroy: () => {} }
  // The "Template" suffix makes macOS tint the icon for the menu bar; the @2x file beside it is picked up on its own.
  const tray = new Tray(nativeImage.createFromPath(join(iconsDir(), "trayTemplate.png")))
  const state = {
    timer: undefined as ReturnType<typeof setInterval> | undefined,
    last: undefined as { id: string; title: string } | undefined,
  }

  // The renderer routes in memory, so main navigates through the deep-link ingress; the shell owns `orchestra://live`.
  const open = (url: string) => {
    const win = getLastFocusedWindow()
    if (!win) return
    revealWindow(win)
    sendDeepLinks(win, [url])
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
        { label: "Open", click: () => open("orchestra://live") },
        ...(last ? [{ label: last.title, click: () => open(`orchestra://live?meeting=${encodeURIComponent(last.id)}`) }] : []),
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
