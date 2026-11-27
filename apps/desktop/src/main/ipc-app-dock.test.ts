import { afterAll, expect, test } from "bun:test"
import { EventEmitter } from "node:events"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { mockElectron } from "./electron-mock.fixture"
import { AppDockProfileRegistry } from "./app-dock-profile-registry"

const directory = mkdtempSync(join(tmpdir(), "dock-reserved-profile-"))
afterAll(() => rmSync(directory, { recursive: true, force: true }))
const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
const sender = Object.assign(new EventEmitter(), { id: 1, mainFrame: {} })
const window = { isDestroyed: () => false, webContents: sender }
const cleared: string[] = []
mockElectron({
  app: { getPath: () => directory, isPackaged: false },
  BrowserWindow: { fromWebContents: () => window },
  ipcMain: { handle: (channel: string, handler: (event: unknown, ...args: unknown[]) => unknown) => handlers.set(channel, handler) },
  session: { fromPartition: (partition: string) => ({
    clearStorageData: async () => { cleared.push(partition) }, clearCache: async () => {},
  }) },
})
const { registerAppDockIpcHandlers } = await import("./ipc-app-dock")
const event = { sender, senderFrame: sender.mainFrame }

test("reserved default profile deletion is refused before durable mutation, while other profiles stay deletable", async () => {
  registerAppDockIpcHandlers()
  const filename = join(directory, "app-dock-profile-registry.json")
  const before = readFileSync(filename, "utf8")
  const remove = handlers.get("app-dock-delete-profile")!
  await expect(remove(event, { profileID: "default" })).rejects.toThrow("APP_DOCK_DEFAULT_PROFILE_RESERVED")
  expect(readFileSync(filename, "utf8")).toBe(before)
  expect(cleared).toEqual([])
  expect(() => registerAppDockIpcHandlers()).not.toThrow()
  const registry = AppDockProfileRegistry.load(directory)
  const storage = registry.ensureActive("removable")
  registerAppDockIpcHandlers()
  await handlers.get("app-dock-delete-profile")!(event, { profileID: "removable" })
  expect(cleared).toEqual([`persist:app-dock-${storage.storageKey}`])
  expect(() => AppDockProfileRegistry.load(directory).ensureActive("removable")).toThrow("MCP Dock profile is not active")
  expect(() => registerAppDockIpcHandlers()).not.toThrow()
})
