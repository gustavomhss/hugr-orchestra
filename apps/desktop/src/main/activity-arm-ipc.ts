import { Option } from "effect"
import { ActivityArm } from "@orchestra/schema/activity-arm"
import { ActivityEmpty } from "@orchestra/schema/activity-empty"
import { ActivityStop } from "@orchestra/schema/activity-stop"
import { ActivityFreeze } from "@orchestra/schema/activity-freeze"
import type { IpcMainInvokeEvent } from "electron"
import { isRendererOrigin } from "./renderer-origin"
import { nativeLocale } from "./native-translations"

export type ActivityArmClient = {
  isCurrent(): boolean
  inspect(signal?: AbortSignal): Promise<ActivityArm.PlanSnapshot | undefined>
  preview(request: ActivityArm.Request, signal?: AbortSignal): Promise<ActivityArm.Preview | undefined>
  confirm(request: ActivityArm.Confirm, signal?: AbortSignal): Promise<ActivityArm.Receipt | undefined>
}

export type ActivityStopClient = {
  preview(request: ActivityStop.Request, signal?: AbortSignal): Promise<ActivityStop.Preview | undefined>
  confirm(request: ActivityStop.Confirm, signal?: AbortSignal): Promise<ActivityStop.Receipt | undefined>
}

export type ActivityEmptyClient = {
  isCurrent(): boolean
  read(request: ActivityEmpty.Request, signal?: AbortSignal): Promise<ActivityEmpty.Snapshot | undefined>
  preview(request: ActivityEmpty.Request, signal?: AbortSignal): Promise<ActivityEmpty.Preview | undefined>
  confirm(request: ActivityEmpty.Confirm, signal?: AbortSignal): Promise<ActivityEmpty.Receipt | undefined>
}

export type ActivityFreezeClient = {
  isCurrent(): boolean
  read(request: ActivityFreeze.Read, signal?: AbortSignal): Promise<ActivityFreeze.State | undefined>
  preview(request: ActivityFreeze.Request, signal?: AbortSignal): Promise<ActivityFreeze.Preview | undefined>
  confirm(request: ActivityFreeze.Confirm, signal?: AbortSignal): Promise<ActivityFreeze.Receipt | undefined>
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
    openActivityEmpty: () => ActivityEmptyClient | undefined
    openActivityFreeze: () => ActivityFreezeClient | undefined
  } | undefined
}) {
  const pending = new Set<number>()
  deps.ipcMain.handle("activity-inspect-arm", async (event: IpcMainInvokeEvent, serverURL: unknown) => {
    const owned = deps.getOwned()
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const frame = event.senderFrame
    if (process.platform !== "linux" || !owned || typeof serverURL !== "string" || serverURL !== owned.url || !win || win.isDestroyed() ||
      win.webContents !== event.sender || !frame || frame !== event.sender.mainFrame ||
      !isRendererOrigin(frame.url, deps.rendererDevURL) || pending.has(event.sender.id)) return undefined
    const client = owned.openActivityArm()
    if (!client) return undefined
    pending.add(event.sender.id)
    const controller = new AbortController()
    const invalidate = () => controller.abort()
    const frameURL = frame.url
    event.sender.on("did-start-navigation", invalidate)
    event.sender.on("destroyed", invalidate)
    const current = () => !controller.signal.aborted && client.isCurrent() && !win.isDestroyed() && !event.sender.isDestroyed() &&
      deps.BrowserWindow.fromWebContents(event.sender) === win && win.webContents === event.sender &&
      event.sender.mainFrame === frame && frame.url === frameURL && isRendererOrigin(frame.url, deps.rendererDevURL) &&
      deps.getOwned() === owned
    try {
      const snapshot = await client.inspect(controller.signal)
      return current() ? snapshot : undefined
    } catch {
      return undefined
    } finally {
      event.sender.removeListener("did-start-navigation", invalidate)
      event.sender.removeListener("destroyed", invalidate)
      pending.delete(event.sender.id)
    }
  })
  deps.ipcMain.handle("activity-arm-quarantine", async (event: IpcMainInvokeEvent, serverURL: unknown, request: unknown) => {
    const owned = deps.getOwned()
    const decoded = ActivityArm.decodeRequest(request)
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const frame = event.senderFrame
    if (process.platform !== "linux" || !owned || typeof serverURL !== "string" || serverURL !== owned.url || Option.isNone(decoded) ||
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
    const current = () => !controller.signal.aborted && client.isCurrent() && !win.isDestroyed() && !event.sender.isDestroyed() &&
      deps.BrowserWindow.fromWebContents(event.sender) === win && win.webContents === event.sender &&
      event.sender.mainFrame === frame && frame.url === frameURL && isRendererOrigin(frame.url, deps.rendererDevURL) &&
      deps.getOwned() === owned
    try {
      const preview = await client.preview(decoded.value, controller.signal)
      if (!current() || !preview || preview.expiresAt <= Date.now() || preview.targets.length !== decoded.value.targets.length ||
        preview.targets.some((target, index) => target.targetID !== decoded.value.targets[index]?.targetID ||
          target.generation !== decoded.value.targets[index]?.generation)) return undefined
      const copy = nativeLocale() === "br"
        ? { title: "Armar quarentena", message: "Armar quarentena para estes alvos?", cancel: "Cancelar" }
        : { title: "Arm quarantine", message: "Arm quarantine for these targets?", cancel: "Cancel" }
      const result = await deps.dialog.showMessageBox(win, {
        type: "warning",
        title: copy.title,
        message: copy.message,
        detail: preview.targets.map((target) =>
          `${literal(target.label)} — ${literal(target.owner)}\nID: ${literal(target.targetID)}\nGeneration: ${literal(target.generation)}`,
        ).join("\n\n"),
        buttons: [copy.cancel, copy.title],
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
  deps.ipcMain.handle("activity-read-quarantine", async (event: IpcMainInvokeEvent, serverURL: unknown) => {
    const owned = deps.getOwned()
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const frame = event.senderFrame
    if (!owned || typeof serverURL !== "string" || serverURL !== owned.url ||
      !win || win.isDestroyed() || win.webContents !== event.sender || !frame || frame !== event.sender.mainFrame ||
      !isRendererOrigin(frame.url, deps.rendererDevURL) || pending.has(event.sender.id)) return undefined
    const client = owned.openActivityEmpty()
    if (!client) return undefined
    pending.add(event.sender.id)
    const controller = new AbortController()
    const invalidate = () => controller.abort()
    const frameURL = frame.url
    event.sender.on("did-start-navigation", invalidate)
    event.sender.on("destroyed", invalidate)
    const current = () => !controller.signal.aborted && client.isCurrent() && !win.isDestroyed() && !event.sender.isDestroyed() &&
      deps.BrowserWindow.fromWebContents(event.sender) === win && win.webContents === event.sender &&
      event.sender.mainFrame === frame && frame.url === frameURL && isRendererOrigin(frame.url, deps.rendererDevURL) &&
      deps.getOwned() === owned
    try {
      const snapshot = await client.read({}, controller.signal)
      return current() ? snapshot : undefined
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
      if (!current() || !preview || preview.expiresAt <= Date.now() || preview.target.targetID !== decoded.value.recordID ||
        new Set(preview.members).size !== preview.members.length) return undefined
      const result = await deps.dialog.showMessageBox(win, {
        type: "warning",
        title: "Stop activity members",
        message: "Stop the listed processes in this activity tree?",
        detail: `${literal(preview.target.owner)} — ${literal(preview.target.label)}\n` +
          `Target: ${literal(preview.target.targetID)}\nGeneration: ${literal(preview.target.generation)}\n` +
          `Omni tree: ${literal(preview.treeID)}\n\n` +
          `Processes (${preview.members.length}):\n${preview.members.map(literal).join("\n")}`,
        buttons: ["Cancel", "Stop members"],
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
  deps.ipcMain.handle("activity-empty-quarantine", async (event: IpcMainInvokeEvent, serverURL: unknown) => {
    const owned = deps.getOwned()
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const frame = event.senderFrame
    if (!owned || typeof serverURL !== "string" || serverURL !== owned.url ||
      !win || win.isDestroyed() || win.webContents !== event.sender || !frame || frame !== event.sender.mainFrame ||
      !isRendererOrigin(frame.url, deps.rendererDevURL) || pending.has(event.sender.id)) return undefined
    const client = owned.openActivityEmpty()
    if (!client) return undefined
    pending.add(event.sender.id)
    const controller = new AbortController()
    const invalidate = () => controller.abort()
    const frameURL = frame.url
    event.sender.on("did-start-navigation", invalidate)
    event.sender.on("destroyed", invalidate)
    const current = () => !controller.signal.aborted && client.isCurrent() && !win.isDestroyed() && !event.sender.isDestroyed() &&
      deps.BrowserWindow.fromWebContents(event.sender) === win && win.webContents === event.sender &&
      event.sender.mainFrame === frame && frame.url === frameURL && isRendererOrigin(frame.url, deps.rendererDevURL) &&
      deps.getOwned() === owned
    try {
      const preview = await client.preview({}, controller.signal)
      if (!current() || !preview || preview.expiresAt <= Date.now() || preview.action !== "empty-quarantine" ||
        preview.targets.length === 0 || new Set(preview.targets.map((target) => target.targetID)).size !== preview.targets.length ||
        new Set(preview.targets.map((target) => `${target.targetID}\0${target.generation}`)).size !== preview.targets.length) return undefined
      const previewID = preview.previewID
      const bindings = preview.targets.map(({ targetID, generation }) => ({ targetID, generation }))
      const result = await deps.dialog.showMessageBox(win, {
        type: "warning",
        title: "Empty quarantine",
        message: "Permanently empty quarantine for every listed activity?",
        detail: preview.targets.map((target) =>
          `${literal(target.label)} — ${literal(target.owner)}\n` +
          `Original path: ${literal(target.originalPath)}\nID: ${literal(target.targetID)}\nGeneration: ${literal(target.generation)}`,
        ).join("\n\n"),
        buttons: ["Cancel", "Empty quarantine"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (result.response !== 1 || !current() || preview.expiresAt <= Date.now()) return undefined
      const receipt = await client.confirm({ previewID }, controller.signal)
      if (!current() || !receipt || receipt.previewID !== previewID ||
        receipt.targets.length !== bindings.length || receipt.targets.some((target, index) =>
          target.targetID !== bindings[index]?.targetID || target.generation !== bindings[index]?.generation)) return undefined
      return receipt
    } catch {
      return undefined
    } finally {
      event.sender.removeListener("did-start-navigation", invalidate)
      event.sender.removeListener("destroyed", invalidate)
      pending.delete(event.sender.id)
    }
  })
  deps.ipcMain.handle("activity-read-freeze", async (event: IpcMainInvokeEvent, serverURL: unknown, request: unknown) => {
    const owned = deps.getOwned()
    const decoded = ActivityFreeze.decodeRead(request)
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const frame = event.senderFrame
    if (!owned || typeof serverURL !== "string" || serverURL !== owned.url || Option.isNone(decoded) ||
      !win || win.isDestroyed() || win.webContents !== event.sender || !frame || frame !== event.sender.mainFrame ||
      !isRendererOrigin(frame.url, deps.rendererDevURL) || pending.has(event.sender.id)) return undefined
    const client = owned.openActivityFreeze()
    if (!client) return undefined
    pending.add(event.sender.id)
    const controller = new AbortController()
    const invalidate = () => controller.abort()
    const frameURL = frame.url
    event.sender.on("did-start-navigation", invalidate)
    event.sender.on("destroyed", invalidate)
    const current = () => !controller.signal.aborted && client.isCurrent() && !win.isDestroyed() && !event.sender.isDestroyed() &&
      deps.BrowserWindow.fromWebContents(event.sender) === win && win.webContents === event.sender &&
      event.sender.mainFrame === frame && frame.url === frameURL && isRendererOrigin(frame.url, deps.rendererDevURL) &&
      deps.getOwned() === owned
    try {
      const state = await client.read(decoded.value, controller.signal)
      return current() ? state : undefined
    } catch {
      return undefined
    } finally {
      event.sender.removeListener("did-start-navigation", invalidate)
      event.sender.removeListener("destroyed", invalidate)
      pending.delete(event.sender.id)
    }
  })
  deps.ipcMain.handle("activity-freeze-member", async (event: IpcMainInvokeEvent, serverURL: unknown, request: unknown) => {
    const owned = deps.getOwned()
    const decoded = ActivityFreeze.decodeRequest(request)
    const win = deps.BrowserWindow.fromWebContents(event.sender)
    const frame = event.senderFrame
    if (process.platform !== "linux" || !owned || typeof serverURL !== "string" || serverURL !== owned.url || Option.isNone(decoded) ||
      !win || win.isDestroyed() || win.webContents !== event.sender || !frame || frame !== event.sender.mainFrame ||
      !isRendererOrigin(frame.url, deps.rendererDevURL) || pending.has(event.sender.id)) return undefined
    const client = owned.openActivityFreeze()
    if (!client) return undefined
    pending.add(event.sender.id)
    const controller = new AbortController()
    const invalidate = () => controller.abort()
    const frameURL = frame.url
    event.sender.on("did-start-navigation", invalidate)
    event.sender.on("destroyed", invalidate)
    const current = () => !controller.signal.aborted && client.isCurrent() && !win.isDestroyed() && !event.sender.isDestroyed() &&
      deps.BrowserWindow.fromWebContents(event.sender) === win && win.webContents === event.sender &&
      event.sender.mainFrame === frame && frame.url === frameURL && isRendererOrigin(frame.url, deps.rendererDevURL) &&
      deps.getOwned() === owned
    try {
      const preview = await client.preview(decoded.value, controller.signal)
      if (!current() || !preview || preview.expiresAt <= Date.now() || preview.target.targetID !== decoded.value.recordID || preview.action !== decoded.value.action) return undefined
      const result = await deps.dialog.showMessageBox(win, {
        type: "warning",
        title: preview.action === "suspend" ? "Suspend activity member" : "Resume activity member",
        message: preview.action === "suspend" ? "Suspend this owned activity member?" : "Resume this owned activity member?",
        detail: `Tree: ${literal(preview.treeID)}\nMember: ${literal(preview.member)}\nTarget: ${literal(preview.target.targetID)}\nBirth token: ${literal(preview.member.split(":")[1] ?? "") }\nOwner: ${literal(preview.target.owner)}\nTitle: ${literal(preview.target.label)}\nGeneration: ${literal(preview.target.generation)}`,
        buttons: ["Cancel", preview.action === "suspend" ? "Suspend member" : "Resume member"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (result.response !== 1 || !current() || preview.expiresAt <= Date.now()) return undefined
      const receipt = await client.confirm({ previewID: preview.previewID }, controller.signal)
      if (!current() || !receipt || receipt.phase === "unknown" || receipt.phase === "refused" ||
        receipt.previewID !== preview.previewID || receipt.action !== preview.action || receipt.treeID !== preview.treeID ||
        receipt.member !== preview.member || receipt.target.targetID !== preview.target.targetID ||
        receipt.target.generation !== preview.target.generation) return undefined
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
