// App-shell type contract: stable names for the wire. `Mutable<typeof Schema.Encoded>` keeps
// the schema's encoded side but drops its readonly-ness; the adapted aliases below keep
// the app's own field shapes, which are authoritative for those names.

import type { AgentFile } from "@orchestra/schema/agent-file"
import type { Command } from "@orchestra/schema/command"
import type { FileDiff } from "@orchestra/schema/file-diff"
import type { Lsp } from "@orchestra/schema"
import type { Permission } from "@orchestra/schema/permission"
import type { Question } from "@orchestra/schema/question"
import type { Reference } from "@orchestra/schema/reference"
import type { Revert } from "@orchestra/schema/revert"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"
import type { Session } from "@orchestra/schema/session"
import type { SessionMessage } from "@orchestra/schema/session-message"
import type { SessionStatusEvent } from "@orchestra/schema/session-status-event"
import type { SessionTodo } from "@orchestra/schema/session-todo"
import type { Vcs } from "@orchestra/schema/vcs"

export type {
  AgentPartInput,
  AssistantMessage,
  FilePart,
  FilePartInput,
  FilePartSource,
  Message,
  Part,
  Session,
  TextPart,
  TextPartInput,
  ToolPart,
  ToolStateCompleted,
  UserMessage,
} from "@orchestra/session-ui/transcript-model"

export type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T

export type ReferenceInfo = Mutable<typeof Reference.Info.Encoded>
export type LspStatus = Mutable<typeof Lsp.Status.Encoded>
export type SessionV2Info = Mutable<typeof Session.Info.Encoded>
export type CommandV2Info = Mutable<typeof Command.Info.Encoded>
export type PermissionRequest = {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: { [key: string]: unknown }
  always: string[]
  tool?: { messageID: string; callID: string }
}
export type QuestionRequest = Mutable<typeof Question.Request.Encoded>
export type SessionStatus = Mutable<typeof SessionStatusEvent.Info.Encoded>
export type Todo = Mutable<typeof SessionTodo.Info.Encoded>
export type VcsInfo = Mutable<typeof Vcs.Info.Encoded>
export type McpResource = {
  name: string
  uri: string
  description?: string
  mimeType?: string
  client: string
}
export type PermissionV2Request = Mutable<typeof Permission.Request.Encoded>
export type FileDiff = Mutable<typeof Revert.FileDiff.Encoded>
export type SessionMessageAssistant = Mutable<typeof SessionMessage.Assistant.Encoded>
export type SessionMessageUser = Mutable<typeof SessionMessage.User.Encoded>
export type SnapshotFileDiff = Mutable<typeof FileDiff.Info.Encoded>
export type VcsFileDiff = Mutable<typeof Vcs.FileDiff.Encoded>
export type ScheduledTaskInfo = Mutable<typeof ScheduledTask.Info.Encoded>
export type AgentFileAction = Mutable<typeof AgentFile.Action.Encoded>
export type AgentFileInfo = Mutable<typeof AgentFile.Info.Encoded>
export type AgentFileInput = Mutable<typeof AgentFile.Input.Encoded>
export type AgentFilePermission = Mutable<typeof AgentFile.Permission.Encoded>

// --- Adapted aliases: the app's field shapes are authoritative ---

type MoneyUSD = number

type TokenUsageInfo = {
  input: number
  output: number
  reasoning: number
  cache: {
    read: number
    write: number
  }
}

type ModelRef = {
  id: string
  providerID: string
  variant?: string
}

type JsonValue = null | boolean | number | string | Array<JsonValue> | {
  [key: string]: JsonValue
}

type PromptBase64 = string

type PromptMention = {
  start: number
  end: number
  text: string
}

type PromptFileSource =
  | {
      type: "inline"
    }
  | {
      type: "uri"
      uri: string
    }

type PromptFileAttachment = {
  data: PromptBase64
  mime: string
  source: PromptFileSource
  name?: string
  description?: string
  mention?: PromptMention
}

type PromptAgentAttachment = {
  name: string
  mention?: PromptMention
}

type SessionMessageProviderState = {
  [x: string]: JsonValue
}

type SessionMessageAssistantText = {
  type: "text"
  text: string
}

type SessionMessageAssistantReasoning = {
  type: "reasoning"
  text: string
  state?: SessionMessageProviderState
  time?: {
    created: number
    completed?: number
  }
}

type SessionMessageToolStateStreaming = {
  status: "streaming"
  input: string
}

type SessionMessageToolStateRunning = {
  status: "running"
  input: {
    [x: string]: JsonValue
  }
  metadata: {
    [x: string]: JsonValue
  }
}

type SessionMessageToolStateError = {
  status: "error"
  input: {
    [x: string]: JsonValue
  }
  error: SessionStructuredError
  content?: [LLMToolContent, ...Array<LLMToolContent>]
  metadata?: {
    [x: string]: JsonValue
  }
}

type ToolTextContent = {
  type: "text"
  text: string
}

type ToolFileContent = {
  type: "file"
  uri: string
  mime: string
  name?: string
}

type LLMToolContent = ToolTextContent | ToolFileContent

type SessionStructuredError = {
  type: string
  message: string
}

type SessionMessageAssistantRetry = {
  attempt: number
  at: number
  error: SessionStructuredError
}

type SessionMessageAssistantTool = {
  type: "tool"
  id: string
  name: string
  executed?: boolean
  providerState?: SessionMessageProviderState
  providerResultState?: SessionMessageProviderState
  state: SessionMessageToolStateStreaming | SessionMessageToolStateRunning | SessionMessageToolStateCompleted | SessionMessageToolStateError
  time: {
    created: number
    ran?: number
    completed?: number
  }
}

type SessionMessageToolStateCompleted = {
  status: "completed"
  input: {
    [x: string]: JsonValue
  }
  content: [LLMToolContent, ...Array<LLMToolContent>]
  metadata?: {
    [x: string]: JsonValue
  }
}

type WireSessionMessageShell = {
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
    completed?: number
  }
  type: "shell"
  shellID: string
  command: string
  status: "running" | "exited" | "timeout" | "killed"
  exit?: number | "Infinity" | "-Infinity" | "NaN"
  output?: {
    output: string
    cursor: number
    size: number
    truncated: boolean
  }
}

type WireSessionMessageAssistant = {
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
    completed?: number
  }
  type: "assistant"
  agent: string
  model: ModelRef
  content: Array<SessionMessageAssistantText | SessionMessageAssistantReasoning | SessionMessageAssistantTool>
  snapshot?: {
    start?: string
    end?: string
    files?: Array<string>
  }
  finish?: "stop" | "length" | "tool-calls" | "content-filter" | "error" | "unknown"
  cost?: MoneyUSD
  tokens?: TokenUsageInfo
  error?: SessionStructuredError
  retry?: SessionMessageAssistantRetry
}

type WireSessionMessageUser = {
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
  }
  text: string
  files?: Array<PromptFileAttachment>
  agents?: Array<PromptAgentAttachment>
  type: "user"
}

type WireSessionMessageSystem = {
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
  }
  type: "system"
  text: string
}

type WireSessionMessageSynthetic = {
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
  }
  text: string
  description?: string
  type: "synthetic"
}

type WireSessionMessageAgentSelected = {
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
  }
  type: "agent-switched"
  agent: string
}

type WireSessionMessageModelSelected = {
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
  }
  type: "model-switched"
  model: ModelRef
  previous?: ModelRef
}

type WireSessionMessageCompactionRunning = {
  type: "compaction"
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
  }
  status: "running"
  reason: "auto" | "manual"
  summary: string
  recent: string
}

type WireSessionMessageCompactionCompleted = {
  type: "compaction"
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
  }
  status: "completed"
  reason: "auto" | "manual"
  summary: string
  recent: string
}

type WireSessionMessageCompactionFailed = {
  type: "compaction"
  id: string
  metadata?: {
    [x: string]: JsonValue
  }
  time: {
    created: number
  }
  status: "failed"
  reason: "auto" | "manual"
  error: SessionStructuredError
}

type WireSessionMessageCompaction = WireSessionMessageCompactionRunning | WireSessionMessageCompactionCompleted | WireSessionMessageCompactionFailed

type IntegrationWhen = {
  key: string
  op: "eq" | "neq"
  value: string
}

type IntegrationTextPrompt = {
  type: "text"
  key: string
  message: string
  placeholder?: string
  when?: IntegrationWhen
}

type IntegrationSelectPrompt = {
  type: "select"
  key: string
  message: string
  options: Array<{
    label: string
    value: string
    hint?: string
  }>
  when?: IntegrationWhen
}

type McpStatusConnected = {
  status: "connected"
}

type McpStatusDisabled = {
  status: "disabled"
}

type McpStatusFailed = {
  status: "failed"
  error: string
}

type McpStatusNeedsAuth = {
  status: "needs_auth"
}

type McpStatusNeedsClientRegistration = {
  status: "needs_client_registration"
  error: string
}

type SessionRevert = {
  messageID: string
  partID?: string
  snapshot?: string
  files?: Array<{
    file: string
    patch: string
    additions: number
    deletions: number
    status: "added" | "deleted" | "modified"
  }>
}

export type Project = {
  id: string
  worktree: string
  vcs?: "git"
  name?: string
  icon?: {
    url?: string
    override?: string
    color?: string
  }
  commands?: {
    start?: string
  }
  time: {
    created: number
    updated: number
    initialized?: number
  }
  sandboxes: Array<string>
}

export type ProjectListOutput = Array<Project>

export type SessionInfo = {
  id: string
  parentID?: string
  fork?: {
    sessionID: string
    messageID?: string
  }
  projectID: string
  agent?: string
  model?: ModelRef
  cost: MoneyUSD
  tokens: TokenUsageInfo
  time: {
    created: number
    updated: number
    archived?: number
  }
  title: string
  location: {
    directory: string
    workspaceID?: string
  }
  subpath?: string
  revert?: SessionRevert
}

export type IntegrationMethod = IntegrationOAuthMethod | IntegrationKeyMethod | IntegrationEnvMethod

type IntegrationOAuthMethod = {
  id: string
  type: "oauth"
  label: string
  prompts?: Array<IntegrationTextPrompt | IntegrationSelectPrompt>
}

type IntegrationKeyMethod = {
  type: "key"
  label?: string
}

type IntegrationEnvMethod = {
  type: "env"
  names: Array<string>
}

export type McpServer = {
  name: string
  status: McpStatusConnected | McpStatusDisabled | McpStatusFailed | McpStatusNeedsAuth | McpStatusNeedsClientRegistration
}

export type WireSessionMessageInfo =
  | WireSessionMessageAgentSelected
  | WireSessionMessageModelSelected
  | WireSessionMessageUser
  | WireSessionMessageSynthetic
  | WireSessionMessageSystem
  | WireSessionMessageShell
  | WireSessionMessageAssistant
  | WireSessionMessageCompaction