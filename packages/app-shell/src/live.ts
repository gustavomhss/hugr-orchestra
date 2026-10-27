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
