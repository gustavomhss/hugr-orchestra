import assert from "node:assert/strict"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { registerHooks } from "node:module"
import { tmpdir } from "node:os"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { IpcMainInvokeEvent } from "electron"
import type { LiveRecoveryPort } from "@orchestra/app/live"
import type { LiveIpcOptions } from "./live-ipc-contract.ts"
import type { LiveLoop } from "./live-loop.ts"

export const localID = "11111111-1111-4111-8111-111111111111"
export const legacyChannels = ["start-live-meeting", "stop-live-meeting", "get-live-meeting-running", "has-live-transcription-key", "set-live-transcription-key", "get-live-readiness", "request-live-permission", "get-live-run-state", "rename-live-meeting", "get-live-settings", "set-live-settings", "get-live-hotkeys", "set-live-hotkey", "reset-live-hotkeys"]
export const recoveryChannels = ["get-live-recovery", "retry-live-recovery", "finish-live-recovery", "export-live-recovery", "discard-live-recovery"]

// Narrow native Electron boundary only; application IPC, guard, origin policy and settings modules stay real.
export function loadRecoveryIpc() {
  const root = mkdtempSync(join(tmpdir(), "live-recovery-ipc-"))
  const directory = new URL("./", import.meta.url).href
  const electron = `const unavailable = () => { throw new Error("Live registration bypassed trusted handle or unexpected native operation"); };
export const ipcMain = { handle: unavailable, on() {} };
export const app = { getPath: () => ${JSON.stringify(root)}, getVersion: () => "1.0.0" };
export const BrowserWindow = { getAllWindows: () => [] };
export const shell = { openExternal: unavailable };
export const safeStorage = { isEncryptionAvailable: () => false };
export const systemPreferences = { getMediaAccessStatus: () => "granted" };
export default { ipcMain, app, BrowserWindow, shell, safeStorage, systemPreferences };`
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === "electron") return { url: `data:text/javascript,${encodeURIComponent(electron)}`, shortCircuit: true }
    if (specifier.startsWith(".") && !extname(specifier) && context.parentURL?.startsWith(directory)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true }
    }
    return next(specifier, context)
  } })
  return {
    load: async () => ({ ipc: await import("./live-ipc.ts"), trust: await import("./ipc-trusted-sender.ts"), origins: await import("./renderer-origin.ts") }),
    dispose() { hooks.deregister(); rmSync(root, { recursive: true, force: true }) },
  }
}

type Modules = Awaited<ReturnType<ReturnType<typeof loadRecoveryIpc>["load"]>>
export function routing(modules: Modules, recovery: LiveRecoveryPort, devURL?: string) {
  const handlers = new Map<string, Parameters<LiveIpcOptions["handle"]>[1]>()
  const calls: string[] = []
  // Controlled loop is an IPC argument-routing witness, not capture/delivery evidence.
  const loop: LiveLoop = {
    settings: {
      bind() {},
      get: () => ({ answerModel: undefined, language: "auto", suggestions: false, sources: { microphone: true, "system-audio": false } }),
      set: () => { calls.push("settings"); return loop.settings.get() },
      hotkeys: () => [], resetHotkeys: () => [], setHotkey: () => ({ ok: true }),
    },
    running: () => false, runState: () => ({ running: false }),
    onRunState: () => () => false, onLevels: () => () => false,
    toggleCaptions() {}, rename: async () => { calls.push("rename") },
    start: async () => { calls.push("start"); return { ok: true, meetingID: "mtg_routing" } },
    stop: async () => { calls.push("stop") }, destroy() {},
  }
  const handle: LiveIpcOptions["handle"] = (channel, listener) => {
    assert.equal(handlers.has(channel), false, `Duplicate Live registration: ${channel}`)
    handlers.set(channel, (event, ...args) => {
      modules.trust.requireTrustedSender(event, devURL, channel)
      return listener(event, ...args)
    })
  }
  // A function accepting fewer parameters remains assignable during the inert source stage.
  const register: (loop: LiveLoop, options: LiveIpcOptions) => void = modules.ipc.registerLiveIpc
  register(loop, { handle, recovery })
  return {
    handlers, calls,
    invoke(channel: string, url: string | undefined, ...args: unknown[]) {
      const handler = handlers.get(channel)
      assert.ok(handler, `Missing actual Live handler: ${channel}`)
      const event = { senderFrame: url === undefined ? null : { url } } as IpcMainInvokeEvent
      return Promise.resolve().then(() => handler(event, ...args))
    },
  }
}
