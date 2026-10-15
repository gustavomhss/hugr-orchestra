import { createHash } from "node:crypto"
import { realpath, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import type { BrowserWindow } from "electron"
import type { AppDockAPI } from "../src/main/app-dock-api"
import { NativeDockProtocol } from "../src/main/app-dock-native-protocol"

export type Options = { container: string; output: string; diagnosticCase?: string }
type RecordEntry = { kind: string; at: string; monotonicMs: number; value: unknown }
export type CaseResult = { id: string; description: string; status: "pass" | "fail"; evidence?: unknown; error?: string }
export type FileEvidence = { path: string; exists: boolean; bytes: number; sha256: string; base64: string; text: string }
type Launch = NativeDockProtocol.ProcessIdentity & {
  appID: string; launchEpoch: string; file: string; executable: string; argv: string[]
  processIdentities: Array<NativeDockProtocol.ProcessIdentity & { executable: string }>
}
export type Manifests = { environment: Record<string, string>; apps: { v: number; sessionID: string; apps: Record<string, Launch> } }
export type Item = {
  ref: NativeDockProtocol.NativeRef; role: number; roleName: string; name: string; states: number[]
  interfaces: string[]; actions: Array<{ id: string; name: string }>
  capabilities: Record<string, { supported: boolean; reason: string }>
  text?: string; textOffset?: number; textLength?: number; textTruncated?: boolean
}
type Snapshot = {
  backend: string; observation: string; items: Item[]; text: string; hasMore: boolean; cursor?: string
  coverage: { complete: boolean; reasons: string[] }; consistency: string
}
export type Receipt = {
  version: number; status: "pass" | "fail"; started: string; finished?: string
  container: string; output: string; control: string; required: string[]; cases: CaseResult[]
  scope: { hostTransport: string; rootConfirmation: string; permissions: string; packaged: boolean; xpra: boolean; N12: boolean }
  provenance: Record<string, unknown>; trace: RecordEntry[]; failures: string[]
}

export const checkout = resolve(import.meta.dir, "../../..")
export const appIDs = ["mousepad", "featherpad", "vscode"]
const maxTraceBytes = 24 * 1024 * 1024
export const senderID = 811
export const digest = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex")
export const message = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error)

export function check(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail)
}

// Every omitted, empty, duplicate or unimplemented requirement fails before GUI work.
export function requirements(value: unknown) {
  check(NativeDockProtocol.object(value) && value.version === 1 && Array.isArray(value.required), "scenarios-invalid-or-required-missing")
  check(value.required.length > 0, "scenarios-required-empty")
  const rows = value.required.map((row) => {
    check(NativeDockProtocol.object(row) && typeof row.id === "string" && /^E\d{2}$/.test(row.id)
      && typeof row.description === "string" && row.description.length > 0, "scenarios-invalid-required-case")
    return { id: row.id, description: row.description }
  })
  check(new Set(rows.map((row) => row.id)).size === rows.length, "scenarios-required-duplicate")
  return rows
}

export async function outputPath(output: string) {
  check(isAbsolute(output), "output-must-be-absolute-outside-checkout")
  const parent = await realpath(dirname(output))
  check((await stat(parent)).isDirectory(), "output-parent-not-directory")
  const path = join(parent, output.split(/[\\/]/).at(-1) ?? "")
  const actual = await realpath(path).catch((error: unknown) => {
    if (NativeDockProtocol.object(error) && error.code === "ENOENT") return path
    throw error
  })
  const repo = await realpath(checkout)
  check(relative(repo, actual).startsWith(`..${process.platform === "win32" ? "\\" : "/"}`), "output-inside-checkout")
  for (let ancestor = parent; ; ancestor = dirname(ancestor)) {
    const git = await stat(join(ancestor, ".git")).then(() => true, (error: unknown) => {
      if (NativeDockProtocol.object(error) && error.code === "ENOENT") return false
      throw error
    })
    check(!git, "output-inside-git-checkout")
    if (dirname(ancestor) === ancestor) break
  }
  check(actual !== repo && actual !== parent, "output-not-a-file")
  return actual
}

export function recorder(trace: RecordEntry[]) {
  const state = { bytes: 0, overflow: false }
  const record = (kind: string, value: unknown) => {
    if (state.overflow) return
    const entry = { kind, at: new Date().toISOString(), monotonicMs: performance.now(), value }
    state.bytes += Buffer.byteLength(JSON.stringify(entry))
    if (state.bytes > maxTraceBytes || trace.length >= 8192) { state.overflow = true; return }
    trace.push(entry)
  }
  return Object.assign(record, { failure: () => state.overflow ? "receipt-trace-bound-exceeded" : undefined })
}

export type Recorder = ReturnType<typeof recorder>

export function validateProcess(value: unknown): asserts value is NativeDockProtocol.ProcessIdentity {
  check(NativeDockProtocol.object(value) && [value.pid, value.startTicks].every((item) => typeof item === "number"
    && Number.isSafeInteger(item) && item > 0) && [value.bootID, value.pidNamespace, value.mountNamespace]
    .every((item) => typeof item === "string" && item.length > 0 && item.length <= 256), "complete-process-identity-required")
}

export async function restoring<T>(work: () => Promise<T>, restore: () => Promise<void>) {
  const result = await work().then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }))
  const cleanup = await restore().then(() => undefined, message)
  if (!result.ok) throw new Error(`${message(result.error)}${cleanup ? `; app-restore-failed: ${cleanup}` : ""}`)
  check(!cleanup, `app-restore-failed: ${cleanup}`)
  return result.value
}

export function inventory(record: Recorder) {
  const state = { active: "mousepad", generation: 1, fallbackCalls: 0 }
  const forbidden = () => { state.fallbackCalls++; throw new Error("fixture-viewer-fallback-forbidden") }
  const dock: AppDockAPI = {
    list: (sender) => {
      check(sender === senderID, "fixture-foreign-sender")
      return [...appIDs, "browser-fixture"].map((tabID) => ({ tabID, generation: state.generation,
        url: `fixture:${tabID}`, title: tabID, loading: false, audible: false, canGoBack: false, canGoForward: false, active: state.active === tabID }))
    },
    activate: (sender, _window, tabID) => {
      check(sender === senderID && [...appIDs, "browser-fixture"].includes(tabID), "fixture-unknown-tab")
      state.active = tabID; record("fixture.tab-selection", { senderID: sender, tabID, semanticProof: false })
    },
    open: forbidden, resize: forbidden, hide: forbidden, occlude: forbidden, select: forbidden, contents: forbidden, navigate: forbidden, execute: forbidden,
    read: forbidden, click: forbidden, type: forbidden, close: forbidden, closeAll: forbidden, closeTabs: forbidden,
    deleteStorage: forbidden, command: forbidden, find: forbidden, stopFind: forbidden, zoom: forbidden,
    fullscreen: forbidden, cancelDownload: forbidden, openDownload: forbidden, openDevTools: forbidden,
    recover: forbidden, scroll: forbidden, hover: forbidden, drag: forbidden, clickAt: forbidden, scrollTo: forbidden,
    storage: forbidden, evaluate: forbidden, network: forbidden, wait: forbidden, screenshot: forbidden, keyboard: forbidden,
  }
  // Only the BrowserWindow inventory surface used by RPC exists; no Electron GUI is simulated.
  const window = { webContents: { id: senderID }, isDestroyed: () => false, once: () => undefined } as unknown as BrowserWindow
  return { dock, window, state }
}

export function snapshot(value: unknown): Snapshot {
  check(NativeDockProtocol.object(value) && value.backend === "linux-atspi" && typeof value.observation === "string"
    && Array.isArray(value.items) && typeof value.text === "string" && typeof value.hasMore === "boolean"
    && value.consistency === "non-atomic" && NativeDockProtocol.object(value.coverage), "native-snapshot-invalid")
  value.items.forEach((item) => {
    check(NativeDockProtocol.object(item) && NativeDockProtocol.isNativeRef(item.ref) && Number.isInteger(item.role)
      && typeof item.roleName === "string" && typeof item.name === "string" && Array.isArray(item.states)
      && Array.isArray(item.interfaces) && Array.isArray(item.actions) && NativeDockProtocol.object(item.capabilities), "native-item-metadata-missing")
  })
  return value as Snapshot
}

export function success(value: unknown, operation: string) {
  check(NativeDockProtocol.object(value) && typeof value.code !== "string", `${operation}-failed: ${JSON.stringify(value)}`)
  return value
}

export function failure(value: unknown, codes: string[]) {
  check(NativeDockProtocol.object(value) && value.backend === "linux-atspi" && typeof value.code === "string"
    && codes.includes(value.code), `expected-native-failure-${codes.join("|")}: ${JSON.stringify(value)}`)
  return value
}

export function successArray(value: unknown) { check(Array.isArray(value) && value.length > 0, "dock-catalog-result-invalid"); return value }
export function configValue(file: FileEvidence) {
  check(file.exists, "vscode-settings-file-missing")
  const value: unknown = JSON.parse(file.text)
  check(NativeDockProtocol.object(value), "vscode-settings-not-object")
  const setting = value["files.trimTrailingWhitespace"]
  check(setting === undefined || typeof setting === "boolean", "vscode-setting-not-boolean")
  return { present: setting !== undefined, value: setting === true }
}
export function wireRequests(trace: RecordEntry[]) {
  return trace.filter((entry) => entry.kind === "wire.request").map((entry) => {
    check(NativeDockProtocol.object(entry.value) && typeof entry.value.raw === "string", "wire-receipt-invalid")
    return JSON.parse(entry.value.raw) as Record<string, unknown>
  })
}
