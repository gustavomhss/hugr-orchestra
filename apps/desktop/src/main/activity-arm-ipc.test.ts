import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import type { ActivityFreeze } from "@orchestra/schema/activity-freeze"
import type { ActivityStop } from "@orchestra/schema/activity-stop"
import type { ActivityEmpty } from "@orchestra/schema/activity-empty"
import { registerActivityArmIpc } from "./activity-arm-ipc"

test("stop IPC requires the owned frame and a current positive native decision", async () => {
  const handlers = new Map<string, (event: unknown, serverURL: string, payload: unknown) => Promise<unknown>>()
  const url = "http://127.0.0.1:9999"
  const frame = { url: "oc://renderer/index.html" }
  const sender = Object.assign(new EventEmitter(), { id: 42, mainFrame: frame, isDestroyed: () => false })
  const win = { webContents: sender, isDestroyed: () => false }
  const event = { sender, senderFrame: frame }
  const recordID = "11111111-1111-1111-1111-111111111111"
  const preview: ActivityStop.Preview = {
    previewID: "22222222-2222-2222-2222-222222222222",
    action: "stop-tree",
    expiresAt: Date.now() + 60_000,
    treeID: "omni-owned",
    target: { targetID: recordID, generation: "7", label: "Fixture", owner: "Session" },
    members: ["7:10", "8:11"],
  }
  const state = { decision: 0, navigate: false, approvals: 0, prompts: 0 }
  registerActivityArmIpc({
    ipcMain: { handle: (name: string, listener: (event: unknown, url: string, payload: unknown) => Promise<unknown>) => {
      handlers.set(name, listener)
    } },
    BrowserWindow: { fromWebContents: () => win },
    dialog: { showMessageBox: async (_window: unknown, prompt: { defaultId: number; detail: string }) => {
      state.prompts++
      expect(prompt.defaultId).toBe(0)
      for (const value of [preview.treeID, preview.target.generation, ...preview.members]) expect(prompt.detail).toContain(value)
      if (state.navigate) sender.emit("did-start-navigation")
      return { response: state.decision }
    } },
    rendererDevURL: undefined,
    getOwned: () => ({
      url,
      openActivityArm: () => undefined,
      openActivityStop: () => ({
        preview: async () => preview,
        confirm: async (request: ActivityStop.Confirm) => {
          expect(request.previewID).toBe(preview.previewID)
          state.approvals++
          return { previewID: preview.previewID, target: preview.target, treeID: preview.treeID,
            outcomes: preview.members.map((member) => ({ member, state: "exited" })) }
        },
      }),
    }),
  } as unknown as Parameters<typeof registerActivityArmIpc>[0])
  const stop = handlers.get("activity-stop-tree")!
  expect(await stop(event, "http://127.0.0.1:9998", { recordID })).toBeUndefined()
  expect(await stop({ sender, senderFrame: { ...frame } }, url, { recordID })).toBeUndefined()
  expect(state.prompts).toBe(0)
  expect(await stop(event, url, { recordID })).toBeUndefined()
  state.decision = 1
  state.navigate = true
  expect(await stop(event, url, { recordID })).toBeUndefined()
  expect(state.approvals).toBe(0)
  state.navigate = false
  expect(await stop(event, url, { recordID })).toMatchObject({ treeID: preview.treeID })
  expect(state.approvals).toBe(1)
})

test("empty quarantine defaults to Cancel and confirms only the fresh main-process preview", async () => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const url = "http://127.0.0.1:9999"
  const frame = { url: "oc://renderer/index.html" }
  const sender = Object.assign(new EventEmitter(), { id: 43, mainFrame: frame, isDestroyed: () => false })
  const win = { webContents: sender, isDestroyed: () => false }
  const event = { sender, senderFrame: frame }
  const firstID = "22222222-2222-2222-2222-222222222222"
  const secondID = "33333333-3333-3333-3333-333333333333"
  const preview: ActivityEmpty.Preview = {
    previewID: firstID,
    action: "empty-quarantine",
    expiresAt: Date.now() + 60_000,
    targets: [{ targetID: "11111111-1111-1111-1111-111111111111", generation: "7", label: "Fixture", owner: "Session", originalPath: "/quarantine/original" }],
  }
  const state = { decision: 0, previews: 0, confirmations: [] as string[], owner: undefined as object | undefined }
  const owned = {
    url,
    openActivityArm: () => undefined,
    openActivityStop: () => undefined,
    openActivityEmpty: () => ({
      isCurrent: () => true,
      preview: async () => ({ ...preview, previewID: state.previews++ === 0 ? firstID : secondID }),
      confirm: async (request: ActivityEmpty.Confirm) => {
        state.confirmations.push(request.previewID)
        return { previewID: request.previewID, outcome: "Verified", targets: [{ targetID: preview.targets[0]!.targetID, generation: preview.targets[0]!.generation }] }
      },
    }),
  }
  state.owner = owned
  registerActivityArmIpc({
    ipcMain: { handle: (name: string, listener: (...args: unknown[]) => Promise<unknown>) => handlers.set(name, listener) },
    BrowserWindow: { fromWebContents: () => win },
    dialog: { showMessageBox: async (_window: unknown, prompt: { defaultId: number; detail: string }) => {
      expect(prompt.defaultId).toBe(0)
      expect(prompt.detail).toContain("Fixture")
      expect(prompt.detail).toContain("Session")
      expect(prompt.detail).toContain("/quarantine/original")
      expect(prompt.detail).toContain(preview.targets[0]!.targetID)
      expect(prompt.detail).toContain(preview.targets[0]!.generation)
      return { response: state.decision }
    } },
    rendererDevURL: undefined,
    getOwned: () => state.owner as typeof owned | undefined,
  } as unknown as Parameters<typeof registerActivityArmIpc>[0])
  const empty = handlers.get("activity-empty-quarantine")!
  expect(await empty(event, url)).toBeUndefined()
  expect(state.confirmations).toEqual([])
  state.decision = 1
  const receipt = await empty(event, url)
  expect(receipt).toMatchObject({ previewID: secondID, outcome: "Verified" })
  expect(state.confirmations).toEqual([secondID])
})

test.skipIf(process.platform !== "linux")("member suspension and resume each require current human confirmation", async () => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const url = "http://127.0.0.1:9999"
  const frame = { url: "oc://renderer/index.html" }
  const sender = Object.assign(new EventEmitter(), { id: 44, mainFrame: frame, isDestroyed: () => false })
  const win = { webContents: sender, isDestroyed: () => false }
  const event = { sender, senderFrame: frame }
  const recordID = crypto.randomUUID()
  const target = { targetID: recordID, label: "Fixture", owner: "Session", generation: "7" }
  const treeID = "owned-tree"
  const member = "42:387"
  const markID = crypto.randomUUID()
  const state = { decision: 0, navigate: false, mismatch: false, prompts: 0 }
  const previews = new Map<string, ActivityFreeze.Preview>()
  const confirmations: string[] = []
  const owned = {
    url,
    openActivityArm: () => undefined,
    openActivityStop: () => undefined,
    openActivityEmpty: () => undefined,
    openActivityFreeze: () => ({
      isCurrent: () => true,
      read: async () => ({ recordID, treeID, member, next: "suspend" }),
      preview: async (request: ActivityFreeze.Request) => {
        const preview = { previewID: crypto.randomUUID(), target, treeID, member, action: request.action, expiresAt: Date.now() + 60_000 }
        previews.set(preview.previewID, preview)
        return preview
      },
      confirm: async (request: ActivityFreeze.Confirm) => {
        const preview = previews.get(request.previewID)!
        confirmations.push(request.previewID)
        return {
          previewID: request.previewID,
          target: { targetID: target.targetID, generation: target.generation },
          treeID,
          member: state.mismatch ? "42:388" : member,
          markID,
          action: preview.action,
          phase: preview.action === "suspend" ? "suspended" : "resumed",
        }
      },
    }),
  }
  registerActivityArmIpc({
    ipcMain: { handle: (name: string, listener: (...args: unknown[]) => Promise<unknown>) => handlers.set(name, listener) },
    BrowserWindow: { fromWebContents: () => win },
    dialog: { showMessageBox: async (_window: unknown, prompt: { defaultId: number; cancelId: number; detail: string }) => {
      state.prompts++
      expect(prompt.defaultId).toBe(0)
      expect(prompt.cancelId).toBe(0)
      for (const identity of [treeID, member, target.owner, target.generation]) expect(prompt.detail).toContain(identity)
      if (state.navigate) sender.emit("did-start-navigation")
      return { response: state.decision }
    } },
    rendererDevURL: undefined,
    getOwned: () => owned,
  } as unknown as Parameters<typeof registerActivityArmIpc>[0])
  const control = handlers.get("activity-freeze-member")!
  const suspend = { recordID, action: "suspend" }
  const resume = { recordID, action: "resume" }
  expect(await control({ sender, senderFrame: { ...frame } }, url, suspend)).toBeUndefined()
  expect(state.prompts).toBe(0)
  expect(await control(event, url, suspend)).toBeUndefined()
  expect(confirmations).toEqual([])
  state.decision = 1
  expect(await control(event, url, suspend)).toMatchObject({ member, markID, phase: "suspended" })
  state.navigate = true
  expect(await control(event, url, resume)).toBeUndefined()
  expect(confirmations).toHaveLength(1)
  state.navigate = false
  state.mismatch = true
  expect(await control(event, url, resume)).toBeUndefined()
  state.mismatch = false
  expect(await control(event, url, resume)).toMatchObject({ member, markID, phase: "resumed" })
  expect(confirmations.map((id) => previews.get(id)?.action)).toEqual(["suspend", "resume", "resume"])
})
