import type { FileDiff } from "@orchestra/schema/file-diff"
import type { FileSystem } from "@orchestra/schema/filesystem"
import type { Integration } from "@orchestra/schema/integration"
import type { Location } from "@orchestra/schema/location"
import type { Permission } from "@orchestra/schema/permission"
import type { PermissionSaved } from "@orchestra/schema/permission-saved"
import type { Question } from "@orchestra/schema/question"
import type { Reference } from "@orchestra/schema/reference"
import type { SessionMessage } from "@orchestra/schema/session-message"
import type { SessionStatusEvent } from "@orchestra/schema/session-status-event"
import type { SessionTodo } from "@orchestra/schema/session-todo"
import type { Skill } from "@orchestra/schema/skill"
import type { Model } from "@orchestra/schema/model"
import type { Event, SessionInfo, TuiPluginApi } from "@orchestra/plugin/tui"

type Mutable<T> =
  T extends ReadonlyMap<infer K, infer V>
    ? Map<Mutable<K>, Mutable<V>>
    : T extends ReadonlySet<infer V>
      ? Set<Mutable<V>>
      : T extends string | number | boolean | bigint | symbol | Function | null | undefined
        ? T
        : T extends object
          ? { -readonly [K in keyof T]: Mutable<T[K]> }
          : T

export type LocationRef = typeof Location.Ref.Encoded

export type Session = SessionInfo
export type SessionStatus = Mutable<typeof SessionStatusEvent.Info.Encoded>
export type Todo = Mutable<typeof SessionTodo.Info.Encoded>
export type QuestionAnswer = Mutable<typeof Question.Answer.Encoded>

export type SnapshotFileDiff = Mutable<typeof FileDiff.Info.Encoded>
export type VcsFileStatus = {
  file: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
}
export type VcsFileDiff = SnapshotFileDiff & { file: string }

export type FileSystemEntry = Mutable<typeof FileSystem.Entry.Encoded>

type WireRequest = { headers: Record<string, string>; body: Record<string, unknown> }

export type AgentV2Info = Mutable<
  Omit<typeof import("@orchestra/schema/agent").Agent.Info.Encoded, "request"> & { request: WireRequest }
>
export type CommandV2Info = Mutable<typeof import("@orchestra/schema/command").Command.Info.Encoded>
export type IntegrationInfo = Mutable<typeof Integration.Info.Encoded>
export type ModelV2Info = Mutable<
  Omit<typeof Model.Info.Encoded, "request" | "variants"> & {
    request: WireRequest & { variant?: string }
    variants: Array<{ id: string; headers: Record<string, string>; body: Record<string, unknown> }>
  }
>
export type ProviderV2Info = Mutable<
  Omit<typeof import("@orchestra/schema/provider").Provider.Info.Encoded, "request"> & { request: WireRequest }
>
export type PermissionSavedInfo = Mutable<typeof PermissionSaved.Info.Encoded>
export type PermissionV2Request = Mutable<typeof Permission.Request.Encoded>
export type QuestionV2Request = Mutable<typeof Question.Request.Encoded>
export type ReferenceInfo = Mutable<typeof Reference.Info.Encoded>
export type SkillV2Info = Mutable<typeof Skill.Info.Encoded>

export type SessionMessage = Mutable<typeof SessionMessage.Message.Encoded>
export type SessionMessageUser = Mutable<typeof SessionMessage.User.Encoded>
export type SessionMessageSynthetic = Mutable<typeof SessionMessage.Synthetic.Encoded>
export type SessionMessageCompaction = Mutable<typeof SessionMessage.Compaction.Encoded>
export type SessionMessageAssistant = Mutable<typeof SessionMessage.Assistant.Encoded>
export type SessionMessageAssistantReasoning = Mutable<typeof SessionMessage.AssistantReasoning.Encoded>
export type SessionMessageAssistantText = Mutable<typeof SessionMessage.AssistantText.Encoded>
export type SessionMessageAssistantTool = Mutable<typeof SessionMessage.AssistantTool.Encoded>
export type SessionMessageShell = Mutable<typeof SessionMessage.Shell.Encoded>

export type Provider = TuiPluginApi["state"]["provider"][number]
export type ProviderListResponse = { all: Provider[]; default: Record<string, string>; connected: string[] }
export type Config = TuiPluginApi["state"]["config"]

export type Agent = {
  id?: string
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
  color?: string
  model?: { modelID: string; providerID: string }
  variant?: string
}

export type Command = {
  name: string
  description?: string
  agent?: string
  model?: string
  source?: "command" | "mcp" | "skill"
  template: string
  subtask?: boolean
  hints: Array<string>
}

export type LspStatus = {
  id: string
  name: string
  root: string
  status: "connected" | "error"
}

export type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string }

export type McpResource = {
  name: string
  uri: string
  description?: string
  mimeType?: string
  client: string
}

export type FormatterStatus = {
  name: string
  extensions: Array<string>
  enabled: boolean
}

export type VcsInfo = {
  branch?: string
  default_branch?: string
}

export type Path = {
  home: string
  state: string
  config: string
  worktree: string
  directory: string
}

export type ProjectDirectories = Array<{
  directory: string
  strategy?: string
}>

export type ProviderAuthMethod = {
  type: "oauth" | "api"
  label: string
  prompts?: ReadonlyArray<
    | {
        type: "text"
        key: string
        message: string
        placeholder?: string
        when?: { key: string; op: "eq" | "neq"; value: string }
      }
    | {
        type: "select"
        key: string
        message: string
        options: ReadonlyArray<{ label: string; value: string; hint?: string }>
        when?: { key: string; op: "eq" | "neq"; value: string }
      }
  >
}

export type ProviderAuthAuthorization = {
  url: string
  method: "auto" | "code"
  instructions: string
}

export type { Event }

// The TUI wraps each V2 stream event in this envelope before it reaches the store handlers.
export type GlobalEvent = { directory: string; workspace?: string; project?: string; payload: Event }
