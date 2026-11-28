import { Option } from "effect"
import { ActivityArm } from "@orchestra/schema/activity-arm"
import { ActivityStop } from "@orchestra/schema/activity-stop"
import type { IpcMainInvokeEvent } from "electron"
import { isRendererOrigin } from "./renderer-origin"

export type ActivityArmClient = {
  preview(request: ActivityArm.Request, signal?: AbortSignal): Promise<ActivityArm.Preview | undefined>
  confirm(request: ActivityArm.Confirm, signal?: AbortSignal): Promise<ActivityArm.Receipt | undefined>
}

export type ActivityStopClient = {
  preview(request: ActivityStop.Request, signal?: AbortSignal): Promise<ActivityStop.Preview | undefined>
  confirm(request: ActivityStop.Confirm, signal?: AbortSignal): Promise<ActivityStop.Receipt | undefined>
}

export function registerActivityArmIpc(deps: {
  ipcMain: typeof import("electron").ipcMain
  BrowserWindow: typeof import("electron").BrowserWindow
  dialog: typeof import("electron").dialog
  rendererDevURL: string | undefined
  getOwned: () => {
    url: string
    openActivityArm: () => ActivityArmClient | undefined
    openActivityStop: () => ActivityStopClient | undefined
  } | undefined
}) {
  const pending = new Set<number>()
  deps.ipcMain.handle("activity-arm-quarantine", async (event: IpcMainInvokeEvent, serverURL: unknown, request: unknown) => {
    const owned = deps.getOwned()
    const decoded = ActivityArm.decodeRequest(request)
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const frame = event.senderFrame
    if (!owned || typeof serverURL !== "string" || serverURL !== owned.url || Option.isNone(decoded) ||
      !win || win.isDestroyed() || win.webContents !== event.sender || !frame || frame !== event.sender.mainFrame ||
      !isRendererOrigin(frame.url, deps.rendererDevURL) || pending.has(event.sender.id)) return undefined
    const client = owned.openActivityArm()
    if (!client) return undefined
    pending.add(event.sender.id)
    const controller = new AbortController()
    const invalidate = () => controller.abort()
    const frameURL = frame.url
    event.sender.on("did-start-navigation", invalidate)
    event.sender.on("destroyed", invalidate)
    const current = () => !controller.signal.aborted && !win.isDestroyed() && !event.sender.isDestroyed() &&
      deps.BrowserWindow.fromWebContents(event.sender) === win && win.webContents === event.sender &&
      event.sender.mainFrame === frame && frame.url === frameURL && isRendererOrigin(frame.url, deps.rendererDevURL) &&
      deps.getOwned()?.url === owned.url
    try {
      const preview = await client.preview(decoded.value, controller.signal)
      if (!current() || !preview || preview.expiresAt <= Date.now() || preview.targets.length !== decoded.value.targets.length ||
        preview.targets.some((target, index) => target.targetID !== decoded.value.targets[index]?.targetID ||
          target.generation !== decoded.value.targets[index]?.generation)) return undefined
      const result = await deps.dialog.showMessageBox(win, {
        type: "warning",
        title: "Arm quarantine",
        message: "Arm quarantine for these targets?",
        detail: preview.targets.map((target) =>
          `${literal(target.label)} — ${literal(target.owner)}\nID: ${literal(target.targetID)}\nGeneration: ${literal(target.generation)}`,
        ).join("\n\n"),
        buttons: ["Cancel", "Arm quarantine"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (result.response !== 1 || !current() || preview.expiresAt <= Date.now()) return undefined
      const receipt = await client.confirm({ previewID: preview.previewID }, controller.signal)
      if (!current() || !receipt || JSON.stringify(receipt.targets) !== JSON.stringify(preview.targets)) return undefined
      return receipt
    } catch {
      return undefined
    } finally {
      event.sender.removeListener("did-start-navigation", invalidate)
      event.sender.removeListener("destroyed", invalidate)
      pending.delete(event.sender.id)
    }
  })
  deps.ipcMain.handle("activity-stop-tree", async (event: IpcMainInvokeEvent, serverURL: unknown, request: unknown) => {
    const owned = deps.getOwned()
    const decoded = ActivityStop.decodeRequest(request)
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const frame = event.senderFrame
    if (!owned || typeof serverURL !== "string" || serverURL !== owned.url || Option.isNone(decoded) ||
      !win || win.isDestroyed() || win.webContents !== event.sender || !frame || frame !== event.sender.mainFrame ||
      !isRendererOrigin(frame.url, deps.rendererDevURL) || pending.has(event.sender.id)) return undefined
    const client = owned.openActivityStop()
    if (!client) return undefined
    pending.add(event.sender.id)
    const controller = new AbortController()
    const invalidate = () => controller.abort()
    const frameURL = frame.url
    event.sender.on("did-start-navigation", invalidate)
    event.sender.on("destroyed", invalidate)
    const current = () => !controller.signal.aborted && !win.isDestroyed() && !event.sender.isDestroyed() &&
      deps.BrowserWindow.fromWebContents(event.sender) === win && win.webContents === event.sender &&
      event.sender.mainFrame === frame && frame.url === frameURL && isRendererOrigin(frame.url, deps.rendererDevURL) &&
      deps.getOwned()?.url === owned.url
    try {
      const preview = await client.preview(decoded.value, controller.signal)
      if (!current() || !preview || preview.expiresAt <= Date.now() || preview.members.length === 0) return undefined
      const result = await deps.dialog.showMessageBox(win, {
        type: "warning",
        title: "Stop activity tree",
        message: "Stop this activity tree and all listed processes?",
        detail: `${literal(preview.target.owner)} — ${literal(preview.target.label)}\n` +
          `Target: ${literal(preview.target.targetID)}\nGeneration: ${literal(preview.target.generation)}\n` +
          `Omni tree: ${literal(preview.treeID)}\n\n` +
          `Processes (${preview.members.length}):\n${preview.members.map(literal).join("\n")}`,
        buttons: ["Cancel", "Stop activity tree"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (result.response !== 1 || !current() || preview.expiresAt <= Date.now()) return undefined
      const receipt = await client.confirm({ previewID: preview.previewID }, controller.signal)
      if (!current() || !receipt || receipt.treeID !== preview.treeID ||
        receipt.target.targetID !== preview.target.targetID ||
        receipt.target.generation !== preview.target.generation ||
        receipt.outcomes.length !== preview.members.length ||
        receipt.outcomes.some((outcome, index) => outcome.member !== preview.members[index])) return undefined
      return receipt
    } catch {
      return undefined
    } finally {
      event.sender.removeListener("did-start-navigation", invalidate)
      event.sender.removeListener("destroyed", invalidate)
      pending.delete(event.sender.id)
    }
  })
}

function literal(value: string) {
  // Format controls can otherwise disguise the order of the label and the immutable binding on screen.
  return JSON.stringify(value).replace(/\p{Cf}/gu, (character) =>
    `\\u{${character.codePointAt(0)?.toString(16)}}`,
  )
}
