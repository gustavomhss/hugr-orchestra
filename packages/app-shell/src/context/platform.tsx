import { createSimpleContext } from "@orchestra/ui/context"
import type { AsyncStorage, SyncStorage } from "@solid-primitives/storage"
import type { Accessor } from "solid-js"
import type { DesktopMenuAction } from "../desktop-menu"
import { ServerConnection } from "./server"
import type { WslServersPlatform } from "../wsl/types"
import type { UpdaterPlatform } from "../updater"
import type { DraftStore } from "@/utils/draft-store"
import type { NativeTitlebarFrame } from "../native-titlebar"
export type { NativeTitlebarFrame } from "../native-titlebar"

export type LiveSource = "microphone" | "system-audio"
export type LivePermission = "granted" | "needed" | "denied"

export type LiveReadiness = {
  permissions: Record<LiveSource, LivePermission>
  // The default input device name.
  microphone: { label: string } | undefined
  // false below macOS 14.2.
  systemAudio: { available: boolean }
  transcriptionKey: boolean
  answerModel: { id: string; reachable: boolean | "unknown" } | undefined
}

export type LiveRunState =
  | { running: false }
  | { running: true; meetingID: string; title: string; startedAt: number; sources: Record<LiveSource, boolean> }

export type LiveSettings = {
  // provider/model id; undefined is the seat default.
  answerModel: string | undefined
  // A BCP-47 tag such as "pt-BR", or "auto".
  language: string
  suggestions: boolean
  sources: Record<LiveSource, boolean>
}

export type LiveHotkeyAction = "start-stop" | "ask" | "toggle-overlay" | "toggle-captions"
export type LiveHotkey = { action: LiveHotkeyAction; accelerator: string; defaultAccelerator: string }

export type LiveSeatPlatform = {
  // "permission": the microphone is denied. With only system audio denied the meeting starts on the microphone.
  start(title?: string): Promise<
    | { ok: true; meetingID: string }
    | { ok: false; reason: "running" | "no-key" | "server" | "capture" | "permission" }
  >
  stop(): Promise<void>
  running(): Promise<boolean>
  // Write-only: the key is never read back; an empty key clears it.
  hasTranscriptionKey(): Promise<boolean>
  setTranscriptionKey(key: string): Promise<void>
  getContentProtection(): Promise<boolean>
  setContentProtection(enabled: boolean): Promise<void>
  // Re-checked on every call; the renderer calls it on window focus.
  readiness(): Promise<LiveReadiness>
  // Shows the system prompt when "needed"; opens the matching System Settings pane when "denied".
  requestPermission(source: LiveSource): Promise<LivePermission>
  // RMS 0..1 at about 15 Hz while running or while subscribed. Returns unsubscribe.
  onLevels(listener: (levels: Record<LiveSource, number>) => void): () => void
  // Every renderer window gets the same run-state events. Returns unsubscribe.
  runState(): Promise<LiveRunState>
  onRunState(listener: (state: LiveRunState) => void): () => void
  rename(meetingID: string, title: string): Promise<void>
  // A partial write is merged; both return the full object.
  getSettings(): Promise<LiveSettings>
  setSettings(patch: Partial<LiveSettings>): Promise<LiveSettings>
  // "conflict": another app or another of our actions holds the accelerator.
  getHotkeys(): Promise<LiveHotkey[]>
  setHotkey(
    action: LiveHotkeyAction,
    accelerator: string,
  ): Promise<{ ok: true } | { ok: false; reason: "conflict" | "invalid" }>
  resetHotkeys(): Promise<LiveHotkey[]>
}

type PickerPaths = string | string[] | null
type OpenDirectoryPickerOptions = { title?: string; multiple?: boolean }
type OpenAttachmentPickerOptions = {
  title?: string
  multiple?: boolean
  accept?: string[]
  extensions?: string[]
  defaultPath?: string
}
type SaveFilePickerOptions = { title?: string; defaultPath?: string }
type PlatformName = "web" | "desktop"
type DesktopOS = "macos" | "windows" | "linux"

export type FatalRendererErrorLog = {
  error: string
  url: string
  version?: string
  platform: PlatformName
  os?: DesktopOS
}

type PlatformBase = {
  /** Native caption area in CSS viewport coordinates; omitted geometry restores default placement. */
  setTitlebarFrame?(frame?: NativeTitlebarFrame): Promise<void>
  /** App version */
  version?: string

  /** Open a web or mail URL in the default system application */
  openExternal(url: string): void

  /** Open a local path in a local app (desktop only) */
  openPath?(path: string, app?: string): Promise<void>

  /** Open a local file URL in its default app (desktop only) */
  openLocalFile?(url: string): void

  /** Reveal a local path in the system file manager; false when the path does not exist (desktop only) */
  revealPath?(path: string): Promise<boolean>

  /** Restart the app  */
  restart(): Promise<void>

  /**
   * Run `handler` before this window closes or the app quits, for work the page must save first. The desktop waits
   * for it at most 3 s, then closes anyway (desktop only). Returns a function that unregisters it.
   */
  onBeforeUnload?(handler: () => Promise<void>): () => void

  /** Send a system notification */
  notify(title: string, description?: string, onClick?: () => void): Promise<void>

  /** Open a native attachment picker and read selected files sequentially (desktop only) */
  openAttachmentPickerDialog?(
    opts: OpenAttachmentPickerOptions,
    onFile: (file: File) => Promise<unknown>,
  ): Promise<void>

  /** Resolve the native source path for a desktop File. */
  getPathForFile?(file: File): string

  /** Open a native save file picker dialog (desktop only) */
  saveFilePickerDialog?(opts?: SaveFilePickerOptions): Promise<string | null>

  /** Save raw response bytes with backpressure; cancellation rejects with AbortError. */
  downloadResponse?(response: Response, filename: string): Promise<void>

  /** Storage mechanism, defaults to localStorage */
  storage?: (name?: string) => SyncStorage | AsyncStorage

  /** Prompt drafts, history, and their blobs. */
  draftStore?: DraftStore

  /** Stable platform window identity for window-scoped persistence */
  windowID?: string

  /** Application-global desktop updater */
  updater?: UpdaterPlatform

  /** Fetch override */
  fetch?: typeof fetch

  /** Get the configured default server URL (platform-specific) */
  getDefaultServer?(): Promise<ServerConnection.Key | null>

  /** Set the default server URL to use on app startup (platform-specific) */
  setDefaultServer?(url: ServerConnection.Key | null): Promise<void> | void

  /** Manage WSL sidecar servers (Electron on Windows only) */
  wslServers?: WslServersPlatform

  /** Meetings with the live seat and its settings (desktop only) */
  liveSeat?: LiveSeatPlatform

  /** Get the preferred display backend (desktop only) */
  getDisplayBackend?(): Promise<DisplayBackend | null> | DisplayBackend | null

  /** Set the preferred display backend (desktop only) */
  setDisplayBackend?(backend: DisplayBackend): Promise<void>

  /** Webview zoom level (desktop only) */
  webviewZoom?: Accessor<number>

  /** Whether the native desktop window is fullscreen */
  windowFullscreen?: Accessor<boolean>

  /** Get whether native pinch/Ctrl-scroll zoom gestures are enabled (desktop only) */
  getPinchZoomEnabled?(): Promise<boolean> | boolean

  /** Allow native pinch/Ctrl-scroll zoom gestures (desktop only) */
  setPinchZoomEnabled?(enabled: boolean): Promise<void> | void

  /** Run a desktop-only menu action from the app chrome */
  runDesktopMenuAction?(action: DesktopMenuAction): Promise<void> | void

  /** Check if an editor app exists (desktop only) */
  checkAppExists?(appName: string): Promise<boolean>

  /** Read image from clipboard (desktop only) */
  readClipboardImage?(): Promise<File | null>

  /** Export collected diagnostic logs (desktop only) */
  exportDebugLogs?(): Promise<string>

  /** Force focus styles on interactive elements through desktop devtools (desktop only) */
  setForceFocus?(enabled: boolean): Promise<void>

  /** Record a fatal renderer error in platform logs (desktop only) */
  recordFatalRendererError?(error: FatalRendererErrorLog): Promise<void>
}

export type Platform = PlatformBase &
  (
    | { platform: "web"; os?: never }
    | {
        platform: "desktop"
        os?: DesktopOS
        openDirectoryPickerDialog(opts?: OpenDirectoryPickerOptions): Promise<PickerPaths>
      }
  )

export type DisplayBackend = "auto" | "wayland"

export const { use: usePlatform, provider: PlatformProvider } = createSimpleContext({
  name: "Platform",
  init: (props: { value: Platform }) => {
    return props.value
  },
})
