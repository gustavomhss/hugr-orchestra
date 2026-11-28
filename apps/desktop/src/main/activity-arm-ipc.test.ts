import { expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import type { ActivityStop } from "@orchestra/schema/activity-stop"
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
