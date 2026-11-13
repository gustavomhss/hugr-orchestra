import type {
  JsonValue,
  LLMToolContent,
} from "./misc"

import type {
  PromptAgentAttachment,
  PromptFileAttachment,
} from "./permission"

import type {
  SessionStructuredError,
} from "./session-core"

export type SessionMessageAssistantTool = {
  type: "tool"
  id: string
  name: string
  executed?: boolean
  providerState?: SessionMessageProviderState
  providerResultState?: SessionMessageProviderState
  state:
    | SessionMessageToolStateStreaming
    | SessionMessageToolStateRunning
    | SessionMessageToolStateCompleted
    | SessionMessageToolStateError
  time: {
    created: number
    ran?: number
    completed?: number
  }
}
export type SessionMessageProviderState = {
  [x: string]: JsonValue
}
export type SessionMessageShell = {
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
export type SessionMessageToolStateCompleted = {
  status: "completed"
  input: {
    [x: string]: JsonValue
  }
  content: [LLMToolContent, ...Array<LLMToolContent>]
  metadata?: {
    [x: string]: JsonValue
  }
}
export type SessionMessageToolStateError = {
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
export type SessionMessageToolStateRunning = {
  status: "running"
  input: {
    [x: string]: JsonValue
  }
  metadata: {
    [x: string]: JsonValue
  }
}
export type SessionMessageToolStateStreaming = {
  status: "streaming"
  input: string
}
export type SessionPendingCompaction = {
  admittedSeq: number
  id: string
  sessionID: string
  timeCreated: number
  type: "compaction"
}
export type SessionPendingMessage = SessionPendingUserMessage | SessionPendingSyntheticMessage
export type SessionPendingSyntheticData1 = {
  text: string
  description?: string
  metadata?: {
    [x: string]: any
  }
}
export type SessionPendingSyntheticMessage = {
  type: "synthetic"
  data: SessionPendingSyntheticData1
  delivery: "steer" | "queue"
}
export type SessionPendingUser = {
  admittedSeq: number
  id: string
  sessionID: string
  timeCreated: number
  type: "user"
  data: SessionPendingUserData
  delivery: "steer" | "queue"
}
export type SessionPendingUserData = {
  text: string
  files?: Array<PromptFileAttachment>
  agents?: Array<PromptAgentAttachment>
  metadata?: {
    [x: string]: JsonValue
  }
}
export type SessionPendingUserData1 = {
  text: string
  files?: Array<PromptFileAttachment>
  agents?: Array<PromptAgentAttachment>
  metadata?: {
    [x: string]: any
  }
}
export type SessionPendingUserMessage = {
  type: "user"
  data: SessionPendingUserData1
  delivery: "steer" | "queue"
}
export type SessionPromptInput = {
  readonly sessionID: {
    readonly sessionID: string
  }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["id"]
  readonly text: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["text"]
  readonly files?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["files"]
  readonly agents?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["agents"]
  readonly metadata?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["metadata"]
  readonly delivery?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["delivery"]
  readonly resume?: {
    readonly id?: string | null
    readonly text: string
    readonly files?: ReadonlyArray<{
      readonly uri: string
      readonly name?: string
      readonly description?: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly agents?: ReadonlyArray<{
      readonly name: string
      readonly mention?: {
        readonly start: number
        readonly end: number
        readonly text: string
      }
    }>
    readonly metadata?: {
      readonly [x: string]: JsonValue
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["resume"]
}
export type SessionPromptOutput = {
  data: SessionPendingUser
}["data"]
