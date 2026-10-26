export * as Transcript from "./transcript-model"

// Transcript view model: the message, part and session shapes the transcript renderer reads.
// The app projects the server's V2 Session messages into these shapes; nothing here is a wire
// contract. Free-form records (`metadata`, tool `input`, JSON schemas) stay `any`-valued because
// renderers read nested fields from them directly.

type OpenRecord = { [key: string]: any }

export type SnapshotFileDiff = {
  file?: string
  patch?: string
  additions: number
  deletions: number
  status?: "added" | "deleted" | "modified"
}

export type Range = {
  start: { line: number; character: number }
  end: { line: number; character: number }
}

export type FilePartSourceText = {
  value: string
  start: number
  end: number
}

export type FileSource = {
  text: FilePartSourceText
  type: "file"
  path: string
}

export type SymbolSource = {
  text: FilePartSourceText
  type: "symbol"
  path: string
  range: Range
  name: string
  kind: number
}

export type ResourceSource = {
  text: FilePartSourceText
  type: "resource"
  clientName: string
  uri: string
}

export type FilePartSource = FileSource | SymbolSource | ResourceSource

export type SnapshotPart = {
  id: string
  sessionID: string
  messageID: string
  type: "snapshot"
  snapshot: string
}

export type PatchPart = {
  id: string
  sessionID: string
  messageID: string
  type: "patch"
  hash: string
  files: string[]
}

export type TextPart = {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
  time?: { start: number; end?: number }
  metadata?: OpenRecord
}

export type ReasoningPart = {
  id: string
  sessionID: string
  messageID: string
  type: "reasoning"
  text: string
  metadata?: OpenRecord
  time: { start: number; end?: number }
}

export type FilePart = {
  id: string
  sessionID: string
  messageID: string
  type: "file"
  mime: string
  filename?: string
  url: string
  source?: FilePartSource
}

export type AgentPart = {
  id: string
  sessionID: string
  messageID: string
  type: "agent"
  name: string
  source?: { value: string; start: number; end: number }
}

export type CompactionPart = {
  id: string
  sessionID: string
  messageID: string
  type: "compaction"
  auto: boolean
  overflow?: boolean
  tail_start_id?: string
}

export type SubtaskPart = {
  id: string
  sessionID: string
  messageID: string
  type: "subtask"
  prompt: string
  description: string
  agent: string
  model?: { providerID: string; modelID: string }
  command?: string
}

export type ApiError = {
  name: "APIError"
  data: {
    message: string
    statusCode?: number
    isRetryable: boolean
    responseHeaders?: { [key: string]: string }
    responseBody?: string
    metadata?: { [key: string]: string }
  }
}

export type RetryPart = {
  id: string
  sessionID: string
  messageID: string
  type: "retry"
  attempt: number
  error: ApiError
  time: { created: number }
}

export type StepTokens = {
  total?: number
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export type StepStartPart = {
  id: string
  sessionID: string
  messageID: string
  type: "step-start"
  snapshot?: string
}

export type StepFinishPart = {
  id: string
  sessionID: string
  messageID: string
  type: "step-finish"
  reason: string
  snapshot?: string
  cost: number
  tokens: StepTokens
}

export type ToolStatePending = {
  status: "pending"
  input: OpenRecord
  raw: string
}

export type ToolStateRunning = {
  status: "running"
  input: OpenRecord
  title?: string
  metadata?: OpenRecord
  time: { start: number }
}

export type ToolStateCompleted = {
  status: "completed"
  input: OpenRecord
  output: string
  title: string
  metadata: OpenRecord
  time: { start: number; end: number; compacted?: number }
  attachments?: FilePart[]
}

export type ToolStateError = {
  status: "error"
  input: OpenRecord
  error: string
  metadata?: OpenRecord
  time: { start: number; end: number }
}

export type ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError

export type ToolPart = {
  id: string
  sessionID: string
  messageID: string
  type: "tool"
  callID: string
  tool: string
  state: ToolState
  metadata?: OpenRecord
}

export type Part =
  | TextPart
  | SubtaskPart
  | ReasoningPart
  | FilePart
  | ToolPart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | RetryPart
  | CompactionPart

export type OutputFormatText = { type: "text" }

export type OutputFormatJsonSchema = {
  type: "json_schema"
  schema: OpenRecord
  retryCount?: number
}

export type OutputFormat = OutputFormatText | OutputFormatJsonSchema

export type UserMessage = {
  id: string
  sessionID: string
  role: "user"
  time: { created: number }
  format?: OutputFormat
  summary?: {
    title?: string
    body?: string
    diffs: SnapshotFileDiff[]
  }
  agent: string
  model: { providerID: string; modelID: string; variant?: string }
  system?: string
  tools?: { [key: string]: boolean }
  promptContext?: { reminders: string[] }
}

export type ProviderAuthError = { name: "ProviderAuthError"; data: { providerID: string; message: string } }
export type UnknownError = { name: "UnknownError"; data: { message: string; ref?: string } }
export type MessageOutputLengthError = { name: "MessageOutputLengthError"; data: {} }
export type MessageAbortedError = { name: "MessageAbortedError"; data: { message: string } }
export type StructuredOutputError = { name: "StructuredOutputError"; data: { message: string; retries: number } }
export type ContextOverflowError = { name: "ContextOverflowError"; data: { message: string; responseBody?: string } }
export type ContentFilterError = { name: "ContentFilterError"; data: { message: string } }

export type AssistantError =
  | ProviderAuthError
  | UnknownError
  | MessageOutputLengthError
  | MessageAbortedError
  | StructuredOutputError
  | ContextOverflowError
  | ContentFilterError
  | ApiError

export type AssistantMessage = {
  id: string
  sessionID: string
  role: "assistant"
  time: { created: number; completed?: number }
  error?: AssistantError
  parentID: string
  modelID: string
  providerID: string
  mode: string
  agent: string
  path: { cwd: string; root: string }
  summary?: boolean
  cost: number
  tokens: StepTokens
  structured?: any
  variant?: string
  finish?: string
}

export type Message = UserMessage | AssistantMessage

export type MessageWithParts = {
  info: Message
  parts: Part[]
}

export type TextPartInput = {
  id?: string
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
  time?: { start: number; end?: number }
  metadata?: OpenRecord
}

export type FilePartInput = {
  id?: string
  type: "file"
  mime: string
  filename?: string
  url: string
  source?: FilePartSource
}

export type AgentPartInput = {
  id?: string
  type: "agent"
  name: string
  source?: { value: string; start: number; end: number }
}

export type SessionRule = {
  permission: string
  pattern: string
  action: "allow" | "deny" | "ask"
}

export type Session = {
  id: string
  slug: string
  projectID: string
  workspaceID?: string
  directory: string
  path?: string
  parentID?: string
  summary?: {
    additions: number
    deletions: number
    files: number
    diffs?: SnapshotFileDiff[]
  }
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache: { read: number; write: number }
  }
  title: string
  agent?: string
  model?: { id: string; providerID: string; variant?: string }
  version: string
  metadata?: OpenRecord
  time: {
    created: number
    updated: number
    compacting?: number
    archived?: number
  }
  permission?: SessionRule[]
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }
}

export type QuestionOption = {
  label: string
  description: string
}

export type QuestionInfo = {
  question: string
  header: string
  options: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export type QuestionAnswer = string[]
