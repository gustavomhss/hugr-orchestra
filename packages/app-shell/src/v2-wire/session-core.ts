import type {
  LocationRef,
} from "./misc"

import type {
  ModelRef,
} from "./provider"

import type {
  RevertState,
} from "./relay"

export type SessionActive = {
  type: "running"
}
export type SessionActiveOutput = {
  data: {
    [x: string]: SessionActive
  }
}["data"]
export type SessionErrorUnknown = {
  type: "unknown"
  message: string
}
export type SessionNextRetryError = {
  message: string
  statusCode?: number
  isRetryable: boolean
  responseHeaders?: {
    [key: string]: string
  }
  responseBody?: string
  metadata?: {
    [key: string]: string
  }
}
export type SessionNotFoundError = {
  readonly _tag: "SessionNotFoundError"
  readonly sessionID: string
  readonly message: string
}
export type SessionProcess = {
  id: string
  pid: number
  title: string
  started: number
  processes: Array<SessionProcessNode>
  output: string
  written: number
}
export type SessionProcessNode = {
  pid: number
  parentPid?: number
  name?: string
}
export type SessionStatus =
  | {
      type: "idle"
    }
  | {
      type: "retry"
      attempt: number
      message: string
      action?: {
        reason: string
        provider: string
        title: string
        message: string
        label: string
        link?: string
      }
      next: number
    }
  | {
      type: "busy"
    }
export type SessionStepTokens = {
  input: number
  output: number
  reasoning: number
  cache: {
    read: number
    write: number
  }
}
export type SessionStructuredError = {
  type: string
  message: string
}
export type SessionSubagentModelsPolicy =
  | {
      mode: "inherit"
    }
  | {
      mode: "allowlist"
      models: Array<ModelRef>
    }
export type SessionV2Info = {
  id: string
  parentID?: string
  projectID: string
  agent?: string
  model?: ModelRef
  subagentModels?: SessionSubagentModelsPolicy
  cost: number
  tokens: {
    input: number
    output: number
    reasoning: number
    cache: {
      read: number
      write: number
    }
  }
  time: {
    created: number
    updated: number
    archived?: number
  }
  title: string
  location: LocationRef
  subpath?: string
  revert?: RevertState
}
export type SessionsResponse = {
  data: Array<SessionV2Info>
  cursor: {
    previous?: string
    next?: string
  }
}
