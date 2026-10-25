import type { EventManifest } from "@orchestra/schema/event-manifest"
import type { FileDiff } from "@orchestra/schema/file-diff"
import type { FileSystem } from "@orchestra/schema/filesystem"
import type { Integration } from "@orchestra/schema/integration"
import type { Location } from "@orchestra/schema/location"
import type { Permission } from "@orchestra/schema/permission"
import type { PermissionSaved } from "@orchestra/schema/permission-saved"
import type { PermissionV1 } from "@orchestra/schema/permission-v1"
import type { Question } from "@orchestra/schema/question"
import type { QuestionV1 } from "@orchestra/schema/question-v1"
import type { Reference } from "@orchestra/schema/reference"
import type { Session } from "@orchestra/schema/session"
import type { SessionMessage } from "@orchestra/schema/session-message"
import type { SessionStatusEvent } from "@orchestra/schema/session-status-event"
import type { SessionTodo } from "@orchestra/schema/session-todo"
import type { SessionV1 } from "@orchestra/schema/session-v1"
import type { Skill } from "@orchestra/schema/skill"
import type { Model } from "@orchestra/schema/model"
import type { TuiPluginApi } from "@orchestra/plugin/tui"

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

export type AssistantMessage = Mutable<typeof SessionV1.Assistant.Encoded>
export type UserMessage = Mutable<typeof SessionV1.User.Encoded>
export type Message = Mutable<typeof SessionV1.Info.Encoded>
export type Part = Mutable<typeof SessionV1.Part.Encoded>
export type TextPart = Mutable<typeof SessionV1.TextPart.Encoded>
export type ReasoningPart = Mutable<typeof SessionV1.ReasoningPart.Encoded>
export type ToolPart = Mutable<typeof SessionV1.ToolPart.Encoded>
export type FilePart = Mutable<typeof SessionV1.FilePart.Encoded>
export type AgentPart = Mutable<typeof SessionV1.AgentPart.Encoded>
export type Session = Mutable<typeof SessionV1.SessionInfo.Encoded>
export type SessionStatus = Mutable<typeof SessionStatusEvent.Info.Encoded>
export type Todo = Mutable<typeof SessionTodo.Info.Encoded>
export type PermissionRequest = Mutable<typeof PermissionV1.Request.Encoded>
export type QuestionAnswer = Mutable<typeof QuestionV1.Answer.Encoded>
export type QuestionRequest = Mutable<typeof QuestionV1.Request.Encoded>

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
export type SessionV2Info = Mutable<typeof Session.Info.Encoded>
export type SkillV2Info = Mutable<typeof Skill.Info.Encoded>

export type SessionMessage = Mutable<typeof SessionMessage.Message.Encoded>
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

export type Workspace = {
  id: string
  type: string
  name: string
  branch?: string | null
  directory?: string | null
  extra?: unknown | null
  projectID: string
  timeUsed: number | "NaN" | "Infinity" | "-Infinity"
}

export type ProjectDirectories = Array<{
  directory: string
  strategy?: string
}>

export type ExperimentalWorkspaceAdapterListResponse = Array<{
  type: string
  name: string
  description: string
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

type BusEvent<Bus> = Parameters<Bus extends { on: (...args: never[]) => unknown } ? Bus["on"] : never>[1] extends (
  event: infer Event,
) => void
  ? Event
  : never

type ManifestV2Event<Definition> = Definition extends {
  readonly type: infer Type extends string
  readonly data: infer Data extends { readonly Encoded: unknown }
}
  ? {
      id: string
      metadata?: Record<string, unknown>
      type: Type
      durable?: { aggregateID: string; seq: number; version: number }
      location?: LocationRef
      data: Mutable<Data["Encoded"]>
    }
  : never

type Definition = (typeof EventManifest.Definitions)[number]

export type Event = BusEvent<TuiPluginApi["event"]>
export type V2Event = ManifestV2Event<Definition>

// The TUI wraps each V2 stream event in this envelope before it reaches the store handlers.
export type GlobalEvent = { directory: string; workspace?: string; project?: string; payload: Event }
