// Live seat types shared by the app and the desktop main process. A leaf module: importing the package root from
// the desktop would pull the app's global Window declarations into the desktop program.

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

// Recovery snapshots intentionally omit targets, credentials, paths and transcript content.
export type LiveRecoveryActionReason = "active" | "closed" | "cancelled" | "storage" | "quota" | "target" | "offline" | "deadline" | "authentication" | "missing" | "ended" | "conflict"
export type LiveRecoveryAction = { readonly ok: true } | { readonly ok: false; readonly reason: LiveRecoveryActionReason }
export type LiveRecoveryItem = {
  readonly id: string
  readonly title: string
  readonly sessionID: string
  readonly meetingID: string
  readonly timeStarted: number
  readonly pendingCount: number
  readonly pendingBytes: number
  readonly closeRequested: boolean
  readonly sealed: boolean
  readonly activeProducer: boolean
  readonly status: "sending" | "paused" | "blocked" | "interrupted" | "storage-error"
  readonly reason?: "offline" | "deadline" | "authentication" | "target" | "missing" | "ended" | "conflict" | "storage" | "quota" | "shutdown"
  readonly unsaved: "none" | "retained" | "unavailable"
}
export type LiveRecoverySnapshot = {
  readonly state: "ready" | "storage-error" | "closed"
  readonly canStart: boolean
  readonly items: ReadonlyArray<LiveRecoveryItem>
  readonly unconfirmedStarts: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly sessionID: string
    readonly reason: LiveRecoveryActionReason
  }>
}
export type LiveRecoveryPort = {
  snapshot(): Promise<LiveRecoverySnapshot>
  retry(id: string): Promise<LiveRecoveryAction>
  /** Persists close intent; success does not confirm remote delivery. */
  finish(id: string): Promise<LiveRecoveryAction>
  discard(id: string): Promise<LiveRecoveryAction>
  /** Main chooses the destination; renderers pass only the opaque record ID. */
  export(id: string): Promise<LiveRecoveryAction>
}
