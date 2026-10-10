import type { SessionEventEncoded } from "../wire"

import type { OrchestraEventEncoded } from "@orchestra/protocol/groups/event"

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }

export type UnauthorizedError = { readonly _tag: "UnauthorizedError"; readonly message: string }
export const isUnauthorizedError = (value: unknown): value is UnauthorizedError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "UnauthorizedError"

export type InvalidRequestError = {
  readonly _tag: "InvalidRequestError"
  readonly message: string
  readonly kind?: string | undefined
  readonly field?: string | undefined
}
export const isInvalidRequestError = (value: unknown): value is InvalidRequestError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "InvalidRequestError"

export type UnknownError = {
  readonly _tag: "UnknownError"
  readonly message: string
  readonly ref?: string | undefined
}
export const isUnknownError = (value: unknown): value is UnknownError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "UnknownError"

export type ConflictError = {
  readonly _tag: "ConflictError"
  readonly message: string
  readonly resource?: string | undefined
}
export const isConflictError = (value: unknown): value is ConflictError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ConflictError"

export type InvalidCursorError = { readonly _tag: "InvalidCursorError"; readonly message: string }
export const isInvalidCursorError = (value: unknown): value is InvalidCursorError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "InvalidCursorError"

export type SessionNotFoundError = {
  readonly _tag: "SessionNotFoundError"
  readonly sessionID: string
  readonly message: string
}
export const isSessionNotFoundError = (value: unknown): value is SessionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "SessionNotFoundError"

export type ServiceUnavailableError = {
  readonly _tag: "ServiceUnavailableError"
  readonly message: string
  readonly service?: string | undefined
}
export const isServiceUnavailableError = (value: unknown): value is ServiceUnavailableError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ServiceUnavailableError"

export type MessageNotFoundError = {
  readonly _tag: "MessageNotFoundError"
  readonly sessionID: string
  readonly messageID: string
  readonly message: string
}
export const isMessageNotFoundError = (value: unknown): value is MessageNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "MessageNotFoundError"

export type ProviderNotFoundError = {
  readonly _tag: "ProviderNotFoundError"
  readonly providerID: string
  readonly message: string
}
export const isProviderNotFoundError = (value: unknown): value is ProviderNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ProviderNotFoundError"

export type PermissionNotFoundError = {
  readonly _tag: "PermissionNotFoundError"
  readonly requestID: string
  readonly message: string
}
export const isPermissionNotFoundError = (value: unknown): value is PermissionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PermissionNotFoundError"

export type PtyNotFoundError = { readonly _tag: "PtyNotFoundError"; readonly ptyID: string; readonly message: string }
export const isPtyNotFoundError = (value: unknown): value is PtyNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "PtyNotFoundError"

export type QuestionNotFoundError = {
  readonly _tag: "QuestionNotFoundError"
  readonly requestID: string
  readonly message: string
}
export const isQuestionNotFoundError = (value: unknown): value is QuestionNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "QuestionNotFoundError"

export type ProjectCopyError = {
  readonly name: "ProjectCopyError"
  readonly data: { readonly message: string; readonly forceRequired?: boolean | undefined }
}
export const isProjectCopyError = (value: unknown): value is ProjectCopyError =>
  typeof value === "object" && value !== null && "name" in value && value["name"] === "ProjectCopyError"

export type RelayInvalidError = { readonly _tag: "RelayInvalidError"; readonly code: string; readonly message: string }
export const isRelayInvalidError = (value: unknown): value is RelayInvalidError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayInvalidError"

export type RelayNotFoundError = {
  readonly _tag: "RelayNotFoundError"
  readonly code: string
  readonly message: string
}
export const isRelayNotFoundError = (value: unknown): value is RelayNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayNotFoundError"

export type RelayConflictError = {
  readonly _tag: "RelayConflictError"
  readonly code: string
  readonly message: string
}
export const isRelayConflictError = (value: unknown): value is RelayConflictError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayConflictError"

export type RelayUnavailableError = {
  readonly _tag: "RelayUnavailableError"
  readonly code: string
  readonly message: string
}
export const isRelayUnavailableError = (value: unknown): value is RelayUnavailableError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "RelayUnavailableError"

export type PullRequestError = {
  readonly name: "PullRequestError"
  readonly data: {
    readonly kind: "not_installed" | "not_authenticated" | "no_remote" | "branch_not_pushed" | "cli_failed"
    readonly message: string
    readonly host?: "github" | "gitlab"
    readonly branch?: string
    readonly remote?: string
  }
}
export const isPullRequestError = (value: unknown): value is PullRequestError =>
  typeof value === "object" && value !== null && "name" in value && value["name"] === "PullRequestError"

export type ScheduleNotFoundError = {
  readonly _tag: "ScheduleNotFoundError"
  readonly scheduleID: string
  readonly message: string
}
export const isScheduleNotFoundError = (value: unknown): value is ScheduleNotFoundError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ScheduleNotFoundError"

export type ScheduleRunError = { readonly _tag: "ScheduleRunError"; readonly message: string }
export const isScheduleRunError = (value: unknown): value is ScheduleRunError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ScheduleRunError"

export type ForbiddenError = { readonly _tag: "ForbiddenError"; readonly message: string }
export const isForbiddenError = (value: unknown): value is ForbiddenError =>
  typeof value === "object" && value !== null && "_tag" in value && value["_tag"] === "ForbiddenError"

export type HealthGetOutput = { readonly healthy: true }

export type LocationGetInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type LocationGetOutput = {
  readonly directory: string
  readonly workspaceID?: string
  readonly project: { readonly id: string; readonly directory: string }
}

export type AgentsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AgentsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly request: {
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
    }
    readonly system?: string
    readonly description?: string
    readonly mode: "subagent" | "primary" | "all"
    readonly hidden: boolean
    readonly color?: string | "primary" | "secondary" | "accent" | "success" | "warning" | "error" | "info"
    readonly steps?: number
    readonly permissions: ReadonlyArray<{
      readonly action: string
      readonly resource: string
      readonly effect: "allow" | "deny" | "ask"
    }>
  }>
}

export type AgentsGetFileInput = {
  readonly agentID: { readonly agentID: string }["agentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AgentsGetFileOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly path: string
    readonly exists: boolean
    readonly revision: string
    readonly invalid?: boolean
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
  }
}

export type AgentsUpdateFileInput = {
  readonly agentID: { readonly agentID: string }["agentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly description?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["description"]
  readonly mode?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["mode"]
  readonly model?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["model"]
  readonly steps?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["steps"]
  readonly system?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["system"]
  readonly permission?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["permission"]
  readonly disable?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["disable"]
  readonly revision?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["revision"]
}

export type AgentsUpdateFileOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly path: string
    readonly exists: boolean
    readonly revision: string
    readonly invalid?: boolean
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
  }
}

export type SessionsListInput = {
  readonly workspace?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["workspace"]
  readonly limit?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["limit"]
  readonly order?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["order"]
  readonly search?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["search"]
  readonly directory?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["directory"]
  readonly project?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["project"]
  readonly subpath?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["subpath"]
  readonly cursor?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["cursor"]
}

export type SessionsListOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string }
    readonly subpath?: string
    readonly revert?: {
      readonly messageID: string
      readonly partID?: string
      readonly snapshot?: string
      readonly diff?: string
      readonly files?: ReadonlyArray<{
        readonly path: string
        readonly status: "added" | "modified" | "deleted"
        readonly additions: number
        readonly deletions: number
        readonly patch: string
      }>
    }
  }>
  readonly cursor: { readonly previous?: string | null; readonly next?: string | null }
}

export type SessionsCreateInput = {
  readonly id?: {
    readonly id?: string | null
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
    readonly location?: { readonly directory: string; readonly workspaceID?: string } | null
  }["id"]
  readonly agent?: {
    readonly id?: string | null
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
    readonly location?: { readonly directory: string; readonly workspaceID?: string } | null
  }["agent"]
  readonly model?: {
    readonly id?: string | null
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
    readonly location?: { readonly directory: string; readonly workspaceID?: string } | null
  }["model"]
  readonly location?: {
    readonly id?: string | null
    readonly agent?: string | null
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string } | null
    readonly location?: { readonly directory: string; readonly workspaceID?: string } | null
  }["location"]
}

export type SessionsCreateOutput = {
  readonly data: {
    readonly id: string
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string }
    readonly subpath?: string
    readonly revert?: {
      readonly messageID: string
      readonly partID?: string
      readonly snapshot?: string
      readonly diff?: string
      readonly files?: ReadonlyArray<{
        readonly path: string
        readonly status: "added" | "modified" | "deleted"
        readonly additions: number
        readonly deletions: number
        readonly patch: string
      }>
    }
  }
}["data"]

export type SessionsActiveOutput = { readonly data: { readonly [x: string]: { readonly type: "running" } } }["data"]

export type SessionsGetInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsGetOutput = {
  readonly data: {
    readonly id: string
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly cost: number
    readonly tokens: {
      readonly input: number
      readonly output: number
      readonly reasoning: number
      readonly cache: { readonly read: number; readonly write: number }
    }
    readonly time: { readonly created: number; readonly updated: number; readonly archived?: number }
    readonly title: string
    readonly location: { readonly directory: string; readonly workspaceID?: string }
    readonly subpath?: string
    readonly revert?: {
      readonly messageID: string
      readonly partID?: string
      readonly snapshot?: string
      readonly diff?: string
      readonly files?: ReadonlyArray<{
        readonly path: string
        readonly status: "added" | "modified" | "deleted"
        readonly additions: number
        readonly deletions: number
        readonly patch: string
      }>
    }
  }
}["data"]

export type SessionsSwitchAgentInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly agent: { readonly agent: string }["agent"]
}

export type SessionsSwitchAgentOutput = void

export type SessionsSwitchModelInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly model: {
    readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
  }["model"]
}

export type SessionsSwitchModelOutput = void

export type SessionsPromptInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["id"]
  readonly prompt: {
    readonly id?: string | null
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["prompt"]
  readonly delivery?: {
    readonly id?: string | null
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["delivery"]
  readonly resume?: {
    readonly id?: string | null
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["resume"]
}

export type SessionsPromptOutput = {
  readonly data: {
    readonly admittedSeq: number
    readonly id: string
    readonly sessionID: string
    readonly prompt: {
      readonly text: string
      readonly files?: ReadonlyArray<{
        readonly uri: string
        readonly mime: string
        readonly name?: string
        readonly description?: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
      readonly agents?: ReadonlyArray<{
        readonly name: string
        readonly source?: { readonly start: number; readonly end: number; readonly text: string }
      }>
    }
    readonly delivery: "steer" | "queue"
    readonly timeCreated: number
    readonly promotedSeq?: number
  }
}["data"]

export type SessionsCompactInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsCompactOutput = void

export type SessionsWaitInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsWaitOutput = void

export type SessionsStageInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly messageID: { readonly messageID: string; readonly files?: boolean | undefined }["messageID"]
  readonly files?: { readonly messageID: string; readonly files?: boolean | undefined }["files"]
}

export type SessionsStageOutput = {
  readonly data: {
    readonly messageID: string
    readonly partID?: string
    readonly snapshot?: string
    readonly diff?: string
    readonly files?: ReadonlyArray<{
      readonly path: string
      readonly status: "added" | "modified" | "deleted"
      readonly additions: number
      readonly deletions: number
      readonly patch: string
    }>
  }
}["data"]

export type SessionsClearInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsClearOutput = void

export type SessionsCommitInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsCommitOutput = void

export type SessionsContextInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsContextOutput = {
  readonly data: ReadonlyArray<
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "agent-switched"
        readonly agent: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "model-switched"
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly agents?: ReadonlyArray<{
          readonly name: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly type: "synthetic"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "system"
        readonly text: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "shell"
        readonly callID: string
        readonly command: string
        readonly output: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "assistant"
        readonly agent: string
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        readonly content: ReadonlyArray<
          | { readonly type: "text"; readonly id: string; readonly text: string }
          | {
              readonly type: "reasoning"
              readonly id: string
              readonly text: string
              readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              readonly time?: { readonly created: number; readonly completed?: number }
            }
          | {
              readonly type: "tool"
              readonly id: string
              readonly name: string
              readonly provider?: {
                readonly executed: boolean
                readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
                readonly resultMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              }
              readonly state:
                | { readonly status: "pending"; readonly input: string }
                | {
                    readonly status: "running"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                  }
                | {
                    readonly status: "completed"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly attachments?: ReadonlyArray<{
                      readonly uri: string
                      readonly mime: string
                      readonly name?: string
                      readonly description?: string
                      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
                    }>
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly outputPaths?: ReadonlyArray<string>
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly result?: JsonValue
                  }
                | {
                    readonly status: "error"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly error: { readonly type: "unknown"; readonly message: string }
                    readonly result?: JsonValue
                  }
              readonly time: {
                readonly created: number
                readonly ran?: number
                readonly completed?: number
                readonly pruned?: number
              }
            }
        >
        readonly snapshot?: { readonly start?: string; readonly end?: string; readonly files?: ReadonlyArray<string> }
        readonly finish?: string
        readonly cost?: number
        readonly tokens?: {
          readonly input: number
          readonly output: number
          readonly reasoning: number
          readonly cache: { readonly read: number; readonly write: number }
        }
        readonly error?: { readonly type: "unknown"; readonly message: string }
      }
    | {
        readonly type: "compaction"
        readonly reason: "auto" | "manual"
        readonly summary: string
        readonly recent: string
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
      }
  >
}["data"]

export type SessionsHistoryInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly limit?: { readonly limit?: number | undefined; readonly after?: number | undefined }["limit"]
  readonly after?: { readonly limit?: number | undefined; readonly after?: number | undefined }["after"]
}

export type SessionsHistoryOutput = {
  readonly data: ReadonlyArray<
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.agent.switched"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly agent: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.model.switched"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.moved"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly location: { readonly directory: string; readonly workspaceID?: string }
          readonly subdirectory?: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.prompted"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly prompt: {
            readonly text: string
            readonly files?: ReadonlyArray<{
              readonly uri: string
              readonly mime: string
              readonly name?: string
              readonly description?: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
            readonly agents?: ReadonlyArray<{
              readonly name: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
          }
          readonly delivery: "steer" | "queue"
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.prompt.admitted"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly prompt: {
            readonly text: string
            readonly files?: ReadonlyArray<{
              readonly uri: string
              readonly mime: string
              readonly name?: string
              readonly description?: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
            readonly agents?: ReadonlyArray<{
              readonly name: string
              readonly source?: { readonly start: number; readonly end: number; readonly text: string }
            }>
          }
          readonly delivery: "steer" | "queue"
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.context.updated"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly text: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.synthetic"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly text: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.shell.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly callID: string
          readonly command: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.shell.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly callID: string
          readonly output: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.step.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly agent: string
          readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
          readonly snapshot?: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.step.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly finish: string
          readonly cost: number
          readonly usageKnown?: boolean
          readonly tokens: {
            readonly input: number
            readonly output: number
            readonly reasoning: number
            readonly cache: { readonly read: number; readonly write: number }
          }
          readonly snapshot?: string
          readonly files?: ReadonlyArray<string>
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.step.failed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly error: { readonly type: "unknown"; readonly message: string }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.text.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly textID: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.text.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly textID: string
          readonly text: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.input.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly name: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.input.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly text: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.called"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly tool: string
          readonly input: { readonly [x: string]: JsonValue }
          readonly provider: {
            readonly executed: boolean
            readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.progress"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly structured: { readonly [x: string]: JsonValue }
          readonly content: ReadonlyArray<
            | { readonly type: "text"; readonly text: string }
            | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
          >
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.success"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly structured: { readonly [x: string]: JsonValue }
          readonly content: ReadonlyArray<
            | { readonly type: "text"; readonly text: string }
            | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
          >
          readonly outputPaths?: ReadonlyArray<string>
          readonly result?: JsonValue
          readonly provider: {
            readonly executed: boolean
            readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.tool.failed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly callID: string
          readonly error: { readonly type: "unknown"; readonly message: string }
          readonly result?: JsonValue
          readonly provider: {
            readonly executed: boolean
            readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.reasoning.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly reasoningID: string
          readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.reasoning.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly assistantMessageID: string
          readonly reasoningID: string
          readonly text: string
          readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.retried"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly attempt: number
          readonly error: {
            readonly message: string
            readonly statusCode?: number
            readonly isRetryable: boolean
            readonly responseHeaders?: { readonly [x: string]: string }
            readonly responseBody?: string
            readonly metadata?: { readonly [x: string]: string }
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.compaction.started"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly reason: "auto" | "manual"
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.compaction.ended"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly messageID: string
          readonly reason: "auto" | "manual"
          readonly text: string
          readonly recent: string
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.revert.staged"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly revert: {
            readonly messageID: string
            readonly partID?: string
            readonly snapshot?: string
            readonly diff?: string
            readonly files?: ReadonlyArray<{
              readonly path: string
              readonly status: "added" | "modified" | "deleted"
              readonly additions: number
              readonly deletions: number
              readonly patch: string
            }>
          }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.revert.cleared"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: { readonly timestamp: number; readonly sessionID: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.revert.committed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: { readonly timestamp: number; readonly sessionID: string; readonly messageID: string }
      }
  >
  readonly hasMore: boolean
}

export type SessionsEventsInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly after?: { readonly after?: number | undefined }["after"]
}

export type SessionsEventsOutput = SessionEventEncoded

export type SessionsInterruptInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsInterruptOutput = void

export type SessionsMessageInput = {
  readonly sessionID: { readonly sessionID: string; readonly messageID: string }["sessionID"]
  readonly messageID: { readonly sessionID: string; readonly messageID: string }["messageID"]
}

export type SessionsMessageOutput = {
  readonly data:
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "agent-switched"
        readonly agent: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "model-switched"
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly agents?: ReadonlyArray<{
          readonly name: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly type: "synthetic"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "system"
        readonly text: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "shell"
        readonly callID: string
        readonly command: string
        readonly output: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "assistant"
        readonly agent: string
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        readonly content: ReadonlyArray<
          | { readonly type: "text"; readonly id: string; readonly text: string }
          | {
              readonly type: "reasoning"
              readonly id: string
              readonly text: string
              readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              readonly time?: { readonly created: number; readonly completed?: number }
            }
          | {
              readonly type: "tool"
              readonly id: string
              readonly name: string
              readonly provider?: {
                readonly executed: boolean
                readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
                readonly resultMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              }
              readonly state:
                | { readonly status: "pending"; readonly input: string }
                | {
                    readonly status: "running"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                  }
                | {
                    readonly status: "completed"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly attachments?: ReadonlyArray<{
                      readonly uri: string
                      readonly mime: string
                      readonly name?: string
                      readonly description?: string
                      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
                    }>
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly outputPaths?: ReadonlyArray<string>
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly result?: JsonValue
                  }
                | {
                    readonly status: "error"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly error: { readonly type: "unknown"; readonly message: string }
                    readonly result?: JsonValue
                  }
              readonly time: {
                readonly created: number
                readonly ran?: number
                readonly completed?: number
                readonly pruned?: number
              }
            }
        >
        readonly snapshot?: { readonly start?: string; readonly end?: string; readonly files?: ReadonlyArray<string> }
        readonly finish?: string
        readonly cost?: number
        readonly tokens?: {
          readonly input: number
          readonly output: number
          readonly reasoning: number
          readonly cache: { readonly read: number; readonly write: number }
        }
        readonly error?: { readonly type: "unknown"; readonly message: string }
      }
    | {
        readonly type: "compaction"
        readonly reason: "auto" | "manual"
        readonly summary: string
        readonly recent: string
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
      }
}["data"]

export type MessagesListInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly limit?: {
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly cursor?: string | undefined
  }["limit"]
  readonly order?: {
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly cursor?: string | undefined
  }["order"]
  readonly cursor?: {
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly cursor?: string | undefined
  }["cursor"]
}

export type MessagesListOutput = {
  readonly data: ReadonlyArray<
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "agent-switched"
        readonly agent: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "model-switched"
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly agents?: ReadonlyArray<{
          readonly name: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly type: "synthetic"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly type: "system"
        readonly text: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "shell"
        readonly callID: string
        readonly command: string
        readonly output: string
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number; readonly completed?: number }
        readonly type: "assistant"
        readonly agent: string
        readonly model: { readonly id: string; readonly providerID: string; readonly variant?: string }
        readonly content: ReadonlyArray<
          | { readonly type: "text"; readonly id: string; readonly text: string }
          | {
              readonly type: "reasoning"
              readonly id: string
              readonly text: string
              readonly providerMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              readonly time?: { readonly created: number; readonly completed?: number }
            }
          | {
              readonly type: "tool"
              readonly id: string
              readonly name: string
              readonly provider?: {
                readonly executed: boolean
                readonly metadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
                readonly resultMetadata?: { readonly [x: string]: { readonly [x: string]: JsonValue } }
              }
              readonly state:
                | { readonly status: "pending"; readonly input: string }
                | {
                    readonly status: "running"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                  }
                | {
                    readonly status: "completed"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly attachments?: ReadonlyArray<{
                      readonly uri: string
                      readonly mime: string
                      readonly name?: string
                      readonly description?: string
                      readonly source?: { readonly start: number; readonly end: number; readonly text: string }
                    }>
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly outputPaths?: ReadonlyArray<string>
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly result?: JsonValue
                  }
                | {
                    readonly status: "error"
                    readonly input: { readonly [x: string]: JsonValue }
                    readonly content: ReadonlyArray<
                      | { readonly type: "text"; readonly text: string }
                      | { readonly type: "file"; readonly uri: string; readonly mime: string; readonly name?: string }
                    >
                    readonly structured: { readonly [x: string]: JsonValue }
                    readonly error: { readonly type: "unknown"; readonly message: string }
                    readonly result?: JsonValue
                  }
              readonly time: {
                readonly created: number
                readonly ran?: number
                readonly completed?: number
                readonly pruned?: number
              }
            }
        >
        readonly snapshot?: { readonly start?: string; readonly end?: string; readonly files?: ReadonlyArray<string> }
        readonly finish?: string
        readonly cost?: number
        readonly tokens?: {
          readonly input: number
          readonly output: number
          readonly reasoning: number
          readonly cache: { readonly read: number; readonly write: number }
        }
        readonly error?: { readonly type: "unknown"; readonly message: string }
      }
    | {
        readonly type: "compaction"
        readonly reason: "auto" | "manual"
        readonly summary: string
        readonly recent: string
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
      }
  >
  readonly cursor: { readonly previous?: string | null; readonly next?: string | null }
}

export type ModelsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ModelsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly providerID: string
    readonly family?: string
    readonly name: string
    readonly api:
      | {
          readonly id: string
          readonly type: "aisdk"
          readonly package: string
          readonly url?: string
          readonly settings?: { readonly [x: string]: JsonValue }
        }
      | {
          readonly id: string
          readonly type: "native"
          readonly url?: string
          readonly settings: { readonly [x: string]: JsonValue }
        }
    readonly capabilities: {
      readonly tools: boolean
      readonly input: ReadonlyArray<string>
      readonly output: ReadonlyArray<string>
    }
    readonly request: {
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
      readonly variant?: string
    }
    readonly variants: ReadonlyArray<{
      readonly id: string
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
    }>
    readonly time: { readonly released: number }
    readonly cost: ReadonlyArray<{
      readonly tier?: { readonly type: "context"; readonly size: number }
      readonly input: number
      readonly output: number
      readonly cache: { readonly read: number; readonly write: number }
    }>
    readonly status: "alpha" | "beta" | "deprecated" | "active"
    readonly enabled: boolean
    readonly limit: { readonly context: number; readonly input?: number; readonly output: number }
  }>
}

export type ProvidersListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ProvidersListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly integrationID?: string
    readonly name: string
    readonly disabled?: boolean
    readonly api:
      | {
          readonly type: "aisdk"
          readonly package: string
          readonly url?: string
          readonly settings?: { readonly [x: string]: JsonValue }
        }
      | { readonly type: "native"; readonly url?: string; readonly settings: { readonly [x: string]: JsonValue } }
    readonly request: {
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
    }
  }>
}

export type ProvidersGetInput = {
  readonly providerID: { readonly providerID: string }["providerID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ProvidersGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly integrationID?: string
    readonly name: string
    readonly disabled?: boolean
    readonly api:
      | {
          readonly type: "aisdk"
          readonly package: string
          readonly url?: string
          readonly settings?: { readonly [x: string]: JsonValue }
        }
      | { readonly type: "native"; readonly url?: string; readonly settings: { readonly [x: string]: JsonValue } }
    readonly request: {
      readonly headers: { readonly [x: string]: string }
      readonly body: { readonly [x: string]: JsonValue }
    }
  }
}

export type IntegrationsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly methods: ReadonlyArray<
      | {
          readonly id: string
          readonly type: "oauth"
          readonly label: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | { readonly type: "key"; readonly label?: string }
      | { readonly type: "env"; readonly names: ReadonlyArray<string> }
    >
    readonly connections: ReadonlyArray<
      | { readonly type: "credential"; readonly id: string; readonly label: string }
      | { readonly type: "env"; readonly name: string }
    >
  }>
}

export type IntegrationsGetInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly methods: ReadonlyArray<
      | {
          readonly id: string
          readonly type: "oauth"
          readonly label: string
          readonly prompts?: ReadonlyArray<
            | {
                readonly type: "text"
                readonly key: string
                readonly message: string
                readonly placeholder?: string
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
            | {
                readonly type: "select"
                readonly key: string
                readonly message: string
                readonly options: ReadonlyArray<{
                  readonly label: string
                  readonly value: string
                  readonly hint?: string
                }>
                readonly when?: { readonly key: string; readonly op: "eq" | "neq"; readonly value: string }
              }
          >
        }
      | { readonly type: "key"; readonly label?: string }
      | { readonly type: "env"; readonly names: ReadonlyArray<string> }
    >
    readonly connections: ReadonlyArray<
      | { readonly type: "credential"; readonly id: string; readonly label: string }
      | { readonly type: "env"; readonly name: string }
    >
  } | null
}

export type IntegrationsConnectKeyInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly key: { readonly key: string; readonly label?: string | undefined }["key"]
  readonly label?: { readonly key: string; readonly label?: string | undefined }["label"]
}

export type IntegrationsConnectKeyOutput = void

export type IntegrationsConnectOauthInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly methodID: {
    readonly methodID: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string | undefined
  }["methodID"]
  readonly inputs: {
    readonly methodID: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string | undefined
  }["inputs"]
  readonly label?: {
    readonly methodID: string
    readonly inputs: { readonly [x: string]: string }
    readonly label?: string | undefined
  }["label"]
}

export type IntegrationsConnectOauthOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly attemptID: string
    readonly url: string
    readonly instructions: string
    readonly mode: "auto" | "code"
    readonly time: {
      readonly created: number | "Infinity" | "-Infinity" | "NaN"
      readonly expires: number | "Infinity" | "-Infinity" | "NaN"
    }
  }
}

export type IntegrationsAttemptStatusInput = {
  readonly attemptID: { readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsAttemptStatusOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | {
        readonly status: "pending"
        readonly time: {
          readonly created: number | "Infinity" | "-Infinity" | "NaN"
          readonly expires: number | "Infinity" | "-Infinity" | "NaN"
        }
      }
    | {
        readonly status: "complete"
        readonly time: {
          readonly created: number | "Infinity" | "-Infinity" | "NaN"
          readonly expires: number | "Infinity" | "-Infinity" | "NaN"
        }
      }
    | {
        readonly status: "failed"
        readonly message: string
        readonly time: {
          readonly created: number | "Infinity" | "-Infinity" | "NaN"
          readonly expires: number | "Infinity" | "-Infinity" | "NaN"
        }
      }
    | {
        readonly status: "expired"
        readonly time: {
          readonly created: number | "Infinity" | "-Infinity" | "NaN"
          readonly expires: number | "Infinity" | "-Infinity" | "NaN"
        }
      }
}

export type IntegrationsAttemptCompleteInput = {
  readonly attemptID: { readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly code?: { readonly code?: string | undefined }["code"]
}

export type IntegrationsAttemptCompleteOutput = void

export type IntegrationsAttemptCancelInput = {
  readonly attemptID: { readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsAttemptCancelOutput = void

export type CredentialsUpdateInput = {
  readonly credentialID: { readonly credentialID: string }["credentialID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly label: { readonly label: string }["label"]
}

export type CredentialsUpdateOutput = void

export type CredentialsRemoveInput = {
  readonly credentialID: { readonly credentialID: string }["credentialID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type CredentialsRemoveOutput = void

export type PermissionsListRequestsInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PermissionsListRequestsOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly sessionID: string
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
  }>
}

export type PermissionsListSavedInput = {
  readonly projectID?: { readonly projectID?: string | undefined }["projectID"]
}

export type PermissionsListSavedOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly projectID: string
    readonly action: string
    readonly resource: string
  }>
}["data"]

export type PermissionsRemoveSavedInput = { readonly id: { readonly id: string }["id"] }

export type PermissionsRemoveSavedOutput = void

export type PermissionsCreateInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["id"]
  readonly action: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["action"]
  readonly resources: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["resources"]
  readonly save?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["save"]
  readonly metadata?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["metadata"]
  readonly source?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["source"]
  readonly agent?: {
    readonly id?: string | null
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
    readonly agent?: string | null
  }["agent"]
}

export type PermissionsCreateOutput = {
  readonly data: { readonly id: string; readonly effect: "allow" | "deny" | "ask" }
}["data"]

export type PermissionsListInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type PermissionsListOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly sessionID: string
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
  }>
}["data"]

export type PermissionsGetInput = {
  readonly sessionID: { readonly sessionID: string; readonly requestID: string }["sessionID"]
  readonly requestID: { readonly sessionID: string; readonly requestID: string }["requestID"]
}

export type PermissionsGetOutput = {
  readonly data: {
    readonly id: string
    readonly sessionID: string
    readonly action: string
    readonly resources: ReadonlyArray<string>
    readonly save?: ReadonlyArray<string>
    readonly metadata?: { readonly [x: string]: JsonValue }
    readonly source?: { readonly type: "tool"; readonly messageID: string; readonly callID: string }
  }
}["data"]

export type PermissionsReplyInput = {
  readonly sessionID: { readonly sessionID: string; readonly requestID: string }["sessionID"]
  readonly requestID: { readonly sessionID: string; readonly requestID: string }["requestID"]
  readonly reply: { readonly reply: "once" | "always" | "reject"; readonly message?: string | undefined }["reply"]
  readonly message?: { readonly reply: "once" | "always" | "reject"; readonly message?: string | undefined }["message"]
}

export type PermissionsReplyOutput = void

export type FilesListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly path?: string | undefined
  }["location"]
  readonly path?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly path?: string | undefined
  }["path"]
}

export type FilesListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{ readonly path: string; readonly type: "file" | "directory" }>
}

export type FilesFindInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query: string
    readonly type?: "file" | "directory" | undefined
    readonly limit?: number | undefined
  }["location"]
  readonly query: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query: string
    readonly type?: "file" | "directory" | undefined
    readonly limit?: number | undefined
  }["query"]
  readonly type?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query: string
    readonly type?: "file" | "directory" | undefined
    readonly limit?: number | undefined
  }["type"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query: string
    readonly type?: "file" | "directory" | undefined
    readonly limit?: number | undefined
  }["limit"]
}

export type FilesFindOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{ readonly path: string; readonly type: "file" | "directory" }>
}

export type CommandsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type CommandsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly name: string
    readonly template: string
    readonly description?: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly subtask?: boolean
  }>
}

export type SkillsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type SkillsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly name: string
    readonly description?: string
    readonly slash?: boolean
    readonly location: string
    readonly content: string
    readonly mtime?: number
  }>
}

export type SkillsSaveInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly name: {
    readonly name: string
    readonly description: string
    readonly content: string
    readonly path?: string
    readonly mtime?: number
  }["name"]
  readonly description: {
    readonly name: string
    readonly description: string
    readonly content: string
    readonly path?: string
    readonly mtime?: number
  }["description"]
  readonly content: {
    readonly name: string
    readonly description: string
    readonly content: string
    readonly path?: string
    readonly mtime?: number
  }["content"]
  readonly path?: {
    readonly name: string
    readonly description: string
    readonly content: string
    readonly path?: string
    readonly mtime?: number
  }["path"]
  readonly mtime?: {
    readonly name: string
    readonly description: string
    readonly content: string
    readonly path?: string
    readonly mtime?: number
  }["mtime"]
}

export type SkillsSaveOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly name: string
    readonly description?: string
    readonly slash?: boolean
    readonly location: string
    readonly content: string
    readonly mtime?: number
  }
}

export type SkillsRemoveInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly path: string
  }["location"]
  readonly path: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly path: string
  }["path"]
}

export type SkillsRemoveOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: boolean
}

export type BehaviorsSetInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly behaviors: {
    readonly behaviors: ReadonlyArray<{ readonly id: string; readonly name: string; readonly instructions: string }>
  }["behaviors"]
}

export type BehaviorsSetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{ readonly id: string; readonly name: string; readonly instructions: string }>
}

export type EventsSubscribeOutput = OrchestraEventEncoded

export type PtysListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PtysListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly title: string
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly status: "running" | "exited"
    readonly pid: number
    readonly exitCode?: number
  }>
}

export type PtysCreateInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly command?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["command"]
  readonly args?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["args"]
  readonly cwd?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["cwd"]
  readonly title?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["title"]
  readonly env?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
  }["env"]
}

export type PtysCreateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly title: string
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly status: "running" | "exited"
    readonly pid: number
    readonly exitCode?: number
  }
}

export type PtysGetInput = {
  readonly ptyID: { readonly ptyID: string }["ptyID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PtysGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly title: string
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly status: "running" | "exited"
    readonly pid: number
    readonly exitCode?: number
  }
}

export type PtysUpdateInput = {
  readonly ptyID: { readonly ptyID: string }["ptyID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly title?: {
    readonly title?: string
    readonly size?: { readonly rows: number; readonly cols: number }
  }["title"]
  readonly size?: { readonly title?: string; readonly size?: { readonly rows: number; readonly cols: number } }["size"]
}

export type PtysUpdateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly title: string
    readonly command: string
    readonly args: ReadonlyArray<string>
    readonly cwd: string
    readonly status: "running" | "exited"
    readonly pid: number
    readonly exitCode?: number
  }
}

export type PtysRemoveInput = {
  readonly ptyID: { readonly ptyID: string }["ptyID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PtysRemoveOutput = void

export type QuestionsListRequestsInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type QuestionsListRequestsOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly sessionID: string
    readonly questions: ReadonlyArray<{
      readonly question: string
      readonly header: string
      readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>
      readonly multiple?: boolean
      readonly custom?: boolean
    }>
    readonly tool?: { readonly messageID: string; readonly callID: string }
  }>
}

export type QuestionsListInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type QuestionsListOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly sessionID: string
    readonly questions: ReadonlyArray<{
      readonly question: string
      readonly header: string
      readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>
      readonly multiple?: boolean
      readonly custom?: boolean
    }>
    readonly tool?: { readonly messageID: string; readonly callID: string }
  }>
}["data"]

export type QuestionsReplyInput = {
  readonly sessionID: { readonly sessionID: string; readonly requestID: string }["sessionID"]
  readonly requestID: { readonly sessionID: string; readonly requestID: string }["requestID"]
  readonly answers: { readonly answers: ReadonlyArray<ReadonlyArray<string>> }["answers"]
}

export type QuestionsReplyOutput = void

export type QuestionsRejectInput = {
  readonly sessionID: { readonly sessionID: string; readonly requestID: string }["sessionID"]
  readonly requestID: { readonly sessionID: string; readonly requestID: string }["requestID"]
}

export type QuestionsRejectOutput = void

export type ReferencesListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ReferencesListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly name: string
    readonly path: string
    readonly description?: string
    readonly hidden?: boolean
    readonly source:
      | { readonly type: "local"; readonly path: string; readonly description?: string; readonly hidden?: boolean }
      | {
          readonly type: "git"
          readonly repository: string
          readonly branch?: string
          readonly description?: string
          readonly hidden?: boolean
        }
  }>
}

export type ProjectCopiesCreateInput = {
  readonly projectID: { readonly projectID: string }["projectID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly strategy: { readonly strategy: string; readonly directory: string; readonly name?: string }["strategy"]
  readonly directory: { readonly strategy: string; readonly directory: string; readonly name?: string }["directory"]
  readonly name?: { readonly strategy: string; readonly directory: string; readonly name?: string }["name"]
}

export type ProjectCopiesCreateOutput = { readonly directory: string }

export type ProjectCopiesRemoveInput = {
  readonly projectID: { readonly projectID: string }["projectID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly directory: { readonly directory: string; readonly force: boolean }["directory"]
  readonly force: { readonly directory: string; readonly force: boolean }["force"]
}

export type ProjectCopiesRemoveOutput = void

export type ProjectCopiesRefreshInput = {
  readonly projectID: { readonly projectID: string }["projectID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ProjectCopiesRefreshOutput = void

export type RelayDocumentsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly connections: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description: string
      readonly createdAt: string
      readonly updatedAt: string
    }>
    readonly isArchived: boolean
    readonly active: boolean
    readonly activeVersionId: string | null
    readonly meta: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly createdAt: string
    readonly updatedAt: string
    readonly versionId: string
    readonly versionCounter: number
    readonly checksum: string
    readonly activeVersion: {
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodes: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly type: string
        readonly position: readonly [number, number]
        readonly parameters: { readonly [x: string]: JsonValue }
        readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
      }>
      readonly connections: {
        readonly [x: string]: {
          readonly main: ReadonlyArray<
            ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>
          >
        }
      }
      readonly nodeGroups?: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly description?: string
        readonly nodeIds: ReadonlyArray<string>
      }>
      readonly tags: ReadonlyArray<string | { readonly id: string }>
      readonly isArchived: boolean
      readonly active: boolean
      readonly activeVersionId: string | null
      readonly meta: {
        readonly relay?: {
          readonly schema?: 1
          readonly kind?: "workflow" | "hook"
          readonly sprint?: {
            readonly brief?: string
            readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
            readonly retry_budget?: number
            readonly macros?: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly instructions?: string
            }>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly checklist?: ReadonlyArray<{
                readonly id: string
                readonly assert?: string | null
                readonly cmd?: string | null
                readonly judge?: string | null
                readonly blocking?: boolean
                readonly diff?: boolean
                readonly context?: string | ReadonlyArray<string>
                readonly paths?: ReadonlyArray<string>
                readonly origin?: string
                readonly policy?: string
                readonly host_check?: string
              }> | null
              readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
              readonly file?: string
              readonly text?: string
            }>
          }
          readonly names?: { readonly [x: string]: string }
          readonly diagnostics?: ReadonlyArray<string>
          readonly profile?: string
        }
      }
      readonly createdAt: string
      readonly updatedAt: string
      readonly versionId: string
      readonly versionCounter: number
      readonly workflowId: string
    } | null
    readonly runnable: boolean
    readonly publishedBy?: string
    readonly unpublishedBy?: string
  }>
}

export type RelayDocumentsCreateInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly name?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
  }["name"]
  readonly description?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
  }["description"]
  readonly nodes?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
  }["nodes"]
  readonly connections?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
  }["connections"]
  readonly nodeGroups?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
  }["nodeGroups"]
  readonly tags?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
  }["tags"]
  readonly meta?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
  }["meta"]
  readonly isArchived?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
  }["isArchived"]
}

export type RelayDocumentsCreateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly connections: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description: string
      readonly createdAt: string
      readonly updatedAt: string
    }>
    readonly isArchived: boolean
    readonly active: boolean
    readonly activeVersionId: string | null
    readonly meta: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly createdAt: string
    readonly updatedAt: string
    readonly versionId: string
    readonly versionCounter: number
    readonly checksum: string
    readonly activeVersion: {
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodes: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly type: string
        readonly position: readonly [number, number]
        readonly parameters: { readonly [x: string]: JsonValue }
        readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
      }>
      readonly connections: {
        readonly [x: string]: {
          readonly main: ReadonlyArray<
            ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>
          >
        }
      }
      readonly nodeGroups?: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly description?: string
        readonly nodeIds: ReadonlyArray<string>
      }>
      readonly tags: ReadonlyArray<string | { readonly id: string }>
      readonly isArchived: boolean
      readonly active: boolean
      readonly activeVersionId: string | null
      readonly meta: {
        readonly relay?: {
          readonly schema?: 1
          readonly kind?: "workflow" | "hook"
          readonly sprint?: {
            readonly brief?: string
            readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
            readonly retry_budget?: number
            readonly macros?: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly instructions?: string
            }>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly checklist?: ReadonlyArray<{
                readonly id: string
                readonly assert?: string | null
                readonly cmd?: string | null
                readonly judge?: string | null
                readonly blocking?: boolean
                readonly diff?: boolean
                readonly context?: string | ReadonlyArray<string>
                readonly paths?: ReadonlyArray<string>
                readonly origin?: string
                readonly policy?: string
                readonly host_check?: string
              }> | null
              readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
              readonly file?: string
              readonly text?: string
            }>
          }
          readonly names?: { readonly [x: string]: string }
          readonly diagnostics?: ReadonlyArray<string>
          readonly profile?: string
        }
      }
      readonly createdAt: string
      readonly updatedAt: string
      readonly versionId: string
      readonly versionCounter: number
      readonly workflowId: string
    } | null
    readonly runnable: boolean
    readonly publishedBy?: string
    readonly unpublishedBy?: string
  }
}

export type RelayDocumentsGetInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly connections: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description: string
      readonly createdAt: string
      readonly updatedAt: string
    }>
    readonly isArchived: boolean
    readonly active: boolean
    readonly activeVersionId: string | null
    readonly meta: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly createdAt: string
    readonly updatedAt: string
    readonly versionId: string
    readonly versionCounter: number
    readonly checksum: string
    readonly activeVersion: {
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodes: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly type: string
        readonly position: readonly [number, number]
        readonly parameters: { readonly [x: string]: JsonValue }
        readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
      }>
      readonly connections: {
        readonly [x: string]: {
          readonly main: ReadonlyArray<
            ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>
          >
        }
      }
      readonly nodeGroups?: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly description?: string
        readonly nodeIds: ReadonlyArray<string>
      }>
      readonly tags: ReadonlyArray<string | { readonly id: string }>
      readonly isArchived: boolean
      readonly active: boolean
      readonly activeVersionId: string | null
      readonly meta: {
        readonly relay?: {
          readonly schema?: 1
          readonly kind?: "workflow" | "hook"
          readonly sprint?: {
            readonly brief?: string
            readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
            readonly retry_budget?: number
            readonly macros?: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly instructions?: string
            }>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly checklist?: ReadonlyArray<{
                readonly id: string
                readonly assert?: string | null
                readonly cmd?: string | null
                readonly judge?: string | null
                readonly blocking?: boolean
                readonly diff?: boolean
                readonly context?: string | ReadonlyArray<string>
                readonly paths?: ReadonlyArray<string>
                readonly origin?: string
                readonly policy?: string
                readonly host_check?: string
              }> | null
              readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
              readonly file?: string
              readonly text?: string
            }>
          }
          readonly names?: { readonly [x: string]: string }
          readonly diagnostics?: ReadonlyArray<string>
          readonly profile?: string
        }
      }
      readonly createdAt: string
      readonly updatedAt: string
      readonly versionId: string
      readonly versionCounter: number
      readonly workflowId: string
    } | null
    readonly runnable: boolean
    readonly publishedBy?: string
    readonly unpublishedBy?: string
  }
}

export type RelayDocumentsUpdateInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly name?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["name"]
  readonly description?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["description"]
  readonly nodes?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["nodes"]
  readonly connections?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["connections"]
  readonly nodeGroups?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["nodeGroups"]
  readonly tags?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["tags"]
  readonly meta?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["meta"]
  readonly isArchived?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["isArchived"]
  readonly versionId?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["versionId"]
  readonly expectedChecksum?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["expectedChecksum"]
  readonly force?: {
    readonly name?: string
    readonly description?: string
    readonly nodes?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: unknown }
      readonly typeVersion?: number
    }>
    readonly connections?: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags?: ReadonlyArray<string | { readonly id: string }>
    readonly meta?: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly isArchived?: boolean
    readonly versionId?: string
    readonly expectedChecksum?: string
    readonly force?: boolean
  }["force"]
}

export type RelayDocumentsUpdateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly connections: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description: string
      readonly createdAt: string
      readonly updatedAt: string
    }>
    readonly isArchived: boolean
    readonly active: boolean
    readonly activeVersionId: string | null
    readonly meta: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly createdAt: string
    readonly updatedAt: string
    readonly versionId: string
    readonly versionCounter: number
    readonly checksum: string
    readonly activeVersion: {
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodes: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly type: string
        readonly position: readonly [number, number]
        readonly parameters: { readonly [x: string]: JsonValue }
        readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
      }>
      readonly connections: {
        readonly [x: string]: {
          readonly main: ReadonlyArray<
            ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>
          >
        }
      }
      readonly nodeGroups?: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly description?: string
        readonly nodeIds: ReadonlyArray<string>
      }>
      readonly tags: ReadonlyArray<string | { readonly id: string }>
      readonly isArchived: boolean
      readonly active: boolean
      readonly activeVersionId: string | null
      readonly meta: {
        readonly relay?: {
          readonly schema?: 1
          readonly kind?: "workflow" | "hook"
          readonly sprint?: {
            readonly brief?: string
            readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
            readonly retry_budget?: number
            readonly macros?: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly instructions?: string
            }>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly checklist?: ReadonlyArray<{
                readonly id: string
                readonly assert?: string | null
                readonly cmd?: string | null
                readonly judge?: string | null
                readonly blocking?: boolean
                readonly diff?: boolean
                readonly context?: string | ReadonlyArray<string>
                readonly paths?: ReadonlyArray<string>
                readonly origin?: string
                readonly policy?: string
                readonly host_check?: string
              }> | null
              readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
              readonly file?: string
              readonly text?: string
            }>
          }
          readonly names?: { readonly [x: string]: string }
          readonly diagnostics?: ReadonlyArray<string>
          readonly profile?: string
        }
      }
      readonly createdAt: string
      readonly updatedAt: string
      readonly versionId: string
      readonly versionCounter: number
      readonly workflowId: string
    } | null
    readonly runnable: boolean
    readonly publishedBy?: string
    readonly unpublishedBy?: string
  }
}

export type RelayDocumentsRemoveInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsRemoveOutput = void

export type RelayDocumentsVersionsInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsVersionsOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly connections: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags: ReadonlyArray<string | { readonly id: string }>
    readonly isArchived: boolean
    readonly active: boolean
    readonly activeVersionId: string | null
    readonly meta: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly createdAt: string
    readonly updatedAt: string
    readonly versionId: string
    readonly versionCounter: number
    readonly workflowId: string
  }>
}

export type RelayDocumentsVersionInput = {
  readonly documentID: { readonly documentID: string; readonly versionID: string }["documentID"]
  readonly versionID: { readonly documentID: string; readonly versionID: string }["versionID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsVersionOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly connections: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags: ReadonlyArray<string | { readonly id: string }>
    readonly isArchived: boolean
    readonly active: boolean
    readonly activeVersionId: string | null
    readonly meta: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly createdAt: string
    readonly updatedAt: string
    readonly versionId: string
    readonly versionCounter: number
    readonly workflowId: string
  }
}

export type RelayDocumentsSprintInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsSprintOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly sprint: {
      readonly brief?: string
      readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
      readonly retry_budget?: number
      readonly macros?: ReadonlyArray<{ readonly id: string; readonly title?: string; readonly instructions?: string }>
      readonly work_packages: ReadonlyArray<{
        readonly id: string
        readonly title?: string
        readonly macro?: string | null
        readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
        readonly instructions?: string
        readonly self_check?: ReadonlyArray<string>
        readonly checklist?: ReadonlyArray<{
          readonly id: string
          readonly assert?: string | null
          readonly cmd?: string | null
          readonly judge?: string | null
          readonly blocking?: boolean
          readonly diff?: boolean
          readonly context?: string | ReadonlyArray<string>
          readonly paths?: ReadonlyArray<string>
          readonly origin?: string
          readonly policy?: string
          readonly host_check?: string
        }> | null
        readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
        readonly file?: string
        readonly text?: string
      }>
    }
    readonly skillBindings: ReadonlyArray<{
      readonly wp: string
      readonly skill: string
      readonly sha256: string
      readonly mode: "combine" | "replace"
    }>
  }
}

export type RelayDocumentsDefinitionInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsDefinitionOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | {
        readonly kind: "hook"
        readonly definition: {
          readonly schema: "relay.hook.v1"
          readonly name: string
          readonly nodes: ReadonlyArray<
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookEventTrigger"
                readonly position: readonly [number, number]
                readonly parameters:
                  | {
                      readonly operation: "read" | "edit" | "write" | "command" | "tool"
                      readonly timing: "before" | "after"
                    }
                  | { readonly operation: "session-start"; readonly timing: "after" }
                  | { readonly operation: "prompt"; readonly timing: "before" }
                  | { readonly operation: "session-idle"; readonly timing: "after" }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookCondition"
                readonly position: readonly [number, number]
                readonly parameters: { readonly field: "path" | "tool" | "command" | "event"; readonly pattern: string }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookRemind"
                readonly position: readonly [number, number]
                readonly parameters: { readonly message: string }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookBlock"
                readonly position: readonly [number, number]
                readonly parameters: { readonly message: string }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookApprove"
                readonly position: readonly [number, number]
                readonly parameters: { readonly message: string }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookVerify"
                readonly position: readonly [number, number]
                readonly parameters: { readonly message: string; readonly check: string }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookRepair"
                readonly position: readonly [number, number]
                readonly parameters: { readonly message: string }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookRecord"
                readonly position: readonly [number, number]
                readonly parameters: { readonly message: string }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
            | {
                readonly id: string
                readonly name: string
                readonly type: "relay.hookAllow"
                readonly position: readonly [number, number]
                readonly parameters: { readonly message: string }
                readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
              }
          >
          readonly connections: ReadonlyArray<{ readonly from: string; readonly port: number; readonly to: string }>
          readonly binding: "host-required"
          readonly installed: false
        }
      }
    | {
        readonly kind: "workflow"
        readonly definition: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
      }
}

export type RelayDocumentsCheckInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly position?: {
    readonly position?: string
    readonly counter?: number
    readonly baseRef?: string
    readonly params?: { readonly [x: string]: string }
  }["position"]
  readonly counter?: {
    readonly position?: string
    readonly counter?: number
    readonly baseRef?: string
    readonly params?: { readonly [x: string]: string }
  }["counter"]
  readonly baseRef?: {
    readonly position?: string
    readonly counter?: number
    readonly baseRef?: string
    readonly params?: { readonly [x: string]: string }
  }["baseRef"]
  readonly params?: {
    readonly position?: string
    readonly counter?: number
    readonly baseRef?: string
    readonly params?: { readonly [x: string]: string }
  }["params"]
}

export type RelayDocumentsCheckOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | {
        readonly outcome: "check"
        readonly i: number
        readonly wp: string
        readonly failing: ReadonlyArray<string>
        readonly macro?: string
      }
    | { readonly outcome: "complete"; readonly i: number }
    | { readonly outcome: "error"; readonly error: "unknown-position"; readonly position: string }
}

export type RelayDocumentsNodeTypesInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsNodeTypesOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly workflow: ReadonlyArray<{
      readonly type: string
      readonly label: string
      readonly inputs: number
      readonly outputs: ReadonlyArray<string>
      readonly maximum?: number
      readonly parameters: ReadonlyArray<{
        readonly name: string
        readonly label: string
        readonly type: string
        readonly default: JsonValue
        readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>
        readonly minimum?: number | "Infinity" | "-Infinity" | "NaN"
        readonly maximum?: number | "Infinity" | "-Infinity" | "NaN"
        readonly placeholder?: string
      }>
    }>
    readonly hook: ReadonlyArray<{
      readonly type: string
      readonly label: string
      readonly inputs: number
      readonly outputs: ReadonlyArray<string>
      readonly maximum?: number
      readonly parameters: ReadonlyArray<{
        readonly name: string
        readonly label: string
        readonly type: string
        readonly default: JsonValue
        readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>
        readonly minimum?: number | "Infinity" | "-Infinity" | "NaN"
        readonly maximum?: number | "Infinity" | "-Infinity" | "NaN"
        readonly placeholder?: string
      }>
    }>
  }
}

export type RelayDocumentsListScopesInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsListScopesOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly description: string
    readonly createdAt: string
    readonly updatedAt: string
  }>
}

export type RelayDocumentsCreateScopeInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly name: { readonly name: string; readonly description?: string }["name"]
  readonly description?: { readonly name: string; readonly description?: string }["description"]
}

export type RelayDocumentsCreateScopeOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly createdAt: string
    readonly updatedAt: string
  }
}

export type RelayDocumentsUpdateScopeInput = {
  readonly scopeID: { readonly scopeID: string }["scopeID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly name: { readonly name: string; readonly description?: string }["name"]
  readonly description?: { readonly name: string; readonly description?: string }["description"]
}

export type RelayDocumentsUpdateScopeOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly createdAt: string
    readonly updatedAt: string
  }
}

export type RelayDocumentsRemoveScopeInput = {
  readonly scopeID: { readonly scopeID: string }["scopeID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayDocumentsRemoveScopeOutput = void

export type RelayPublishPublishInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly versionId: { readonly versionId: string; readonly expectedChecksum?: string }["versionId"]
  readonly expectedChecksum?: { readonly versionId: string; readonly expectedChecksum?: string }["expectedChecksum"]
}

export type RelayPublishPublishOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly connections: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description: string
      readonly createdAt: string
      readonly updatedAt: string
    }>
    readonly isArchived: boolean
    readonly active: boolean
    readonly activeVersionId: string | null
    readonly meta: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly createdAt: string
    readonly updatedAt: string
    readonly versionId: string
    readonly versionCounter: number
    readonly checksum: string
    readonly activeVersion: {
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodes: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly type: string
        readonly position: readonly [number, number]
        readonly parameters: { readonly [x: string]: JsonValue }
        readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
      }>
      readonly connections: {
        readonly [x: string]: {
          readonly main: ReadonlyArray<
            ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>
          >
        }
      }
      readonly nodeGroups?: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly description?: string
        readonly nodeIds: ReadonlyArray<string>
      }>
      readonly tags: ReadonlyArray<string | { readonly id: string }>
      readonly isArchived: boolean
      readonly active: boolean
      readonly activeVersionId: string | null
      readonly meta: {
        readonly relay?: {
          readonly schema?: 1
          readonly kind?: "workflow" | "hook"
          readonly sprint?: {
            readonly brief?: string
            readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
            readonly retry_budget?: number
            readonly macros?: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly instructions?: string
            }>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly checklist?: ReadonlyArray<{
                readonly id: string
                readonly assert?: string | null
                readonly cmd?: string | null
                readonly judge?: string | null
                readonly blocking?: boolean
                readonly diff?: boolean
                readonly context?: string | ReadonlyArray<string>
                readonly paths?: ReadonlyArray<string>
                readonly origin?: string
                readonly policy?: string
                readonly host_check?: string
              }> | null
              readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
              readonly file?: string
              readonly text?: string
            }>
          }
          readonly names?: { readonly [x: string]: string }
          readonly diagnostics?: ReadonlyArray<string>
          readonly profile?: string
        }
      }
      readonly createdAt: string
      readonly updatedAt: string
      readonly versionId: string
      readonly versionCounter: number
      readonly workflowId: string
    } | null
    readonly runnable: boolean
    readonly publishedBy?: string
    readonly unpublishedBy?: string
  }
}

export type RelayPublishUnpublishInput = {
  readonly documentID: { readonly documentID: string }["documentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly expectedChecksum?: { readonly expectedChecksum?: string }["expectedChecksum"]
}

export type RelayPublishUnpublishOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly description?: string
    readonly nodes: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly type: string
      readonly position: readonly [number, number]
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly connections: {
      readonly [x: string]: {
        readonly main: ReadonlyArray<ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>>
      }
    }
    readonly nodeGroups?: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodeIds: ReadonlyArray<string>
    }>
    readonly tags: ReadonlyArray<{
      readonly id: string
      readonly name: string
      readonly description: string
      readonly createdAt: string
      readonly updatedAt: string
    }>
    readonly isArchived: boolean
    readonly active: boolean
    readonly activeVersionId: string | null
    readonly meta: {
      readonly relay?: {
        readonly schema?: 1
        readonly kind?: "workflow" | "hook"
        readonly sprint?: {
          readonly brief?: string
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly checklist?: ReadonlyArray<{
              readonly id: string
              readonly assert?: string | null
              readonly cmd?: string | null
              readonly judge?: string | null
              readonly blocking?: boolean
              readonly diff?: boolean
              readonly context?: string | ReadonlyArray<string>
              readonly paths?: ReadonlyArray<string>
              readonly origin?: string
              readonly policy?: string
              readonly host_check?: string
            }> | null
            readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
            readonly file?: string
            readonly text?: string
          }>
        }
        readonly names?: { readonly [x: string]: string }
        readonly diagnostics?: ReadonlyArray<string>
        readonly profile?: string
      }
    }
    readonly createdAt: string
    readonly updatedAt: string
    readonly versionId: string
    readonly versionCounter: number
    readonly checksum: string
    readonly activeVersion: {
      readonly id: string
      readonly name: string
      readonly description?: string
      readonly nodes: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly type: string
        readonly position: readonly [number, number]
        readonly parameters: { readonly [x: string]: JsonValue }
        readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
      }>
      readonly connections: {
        readonly [x: string]: {
          readonly main: ReadonlyArray<
            ReadonlyArray<{ readonly node: string; readonly type: "main"; readonly index: 0 }>
          >
        }
      }
      readonly nodeGroups?: ReadonlyArray<{
        readonly id: string
        readonly name: string
        readonly description?: string
        readonly nodeIds: ReadonlyArray<string>
      }>
      readonly tags: ReadonlyArray<string | { readonly id: string }>
      readonly isArchived: boolean
      readonly active: boolean
      readonly activeVersionId: string | null
      readonly meta: {
        readonly relay?: {
          readonly schema?: 1
          readonly kind?: "workflow" | "hook"
          readonly sprint?: {
            readonly brief?: string
            readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
            readonly retry_budget?: number
            readonly macros?: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly instructions?: string
            }>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly checklist?: ReadonlyArray<{
                readonly id: string
                readonly assert?: string | null
                readonly cmd?: string | null
                readonly judge?: string | null
                readonly blocking?: boolean
                readonly diff?: boolean
                readonly context?: string | ReadonlyArray<string>
                readonly paths?: ReadonlyArray<string>
                readonly origin?: string
                readonly policy?: string
                readonly host_check?: string
              }> | null
              readonly dod?: ReadonlyArray<{ readonly id?: string; readonly cmd: string }> | null
              readonly file?: string
              readonly text?: string
            }>
          }
          readonly names?: { readonly [x: string]: string }
          readonly diagnostics?: ReadonlyArray<string>
          readonly profile?: string
        }
      }
      readonly createdAt: string
      readonly updatedAt: string
      readonly versionId: string
      readonly versionCounter: number
      readonly workflowId: string
    } | null
    readonly runnable: boolean
    readonly publishedBy?: string
    readonly unpublishedBy?: string
  }
}

export type RelayHooksListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayHooksListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly installs: ReadonlyArray<{
      readonly installID: string
      readonly document: string
      readonly version: string
      readonly sha256: string
      readonly order: number
      readonly enabled: boolean
      readonly installedBy: string
      readonly installedAt: number
      readonly snapshot: {
        readonly schema: "relay.hook.v1"
        readonly name: string
        readonly nodes: ReadonlyArray<
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookEventTrigger"
              readonly position: readonly [number, number]
              readonly parameters:
                | {
                    readonly operation: "read" | "edit" | "write" | "command" | "tool"
                    readonly timing: "before" | "after"
                  }
                | { readonly operation: "session-start"; readonly timing: "after" }
                | { readonly operation: "prompt"; readonly timing: "before" }
                | { readonly operation: "session-idle"; readonly timing: "after" }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookCondition"
              readonly position: readonly [number, number]
              readonly parameters: { readonly field: "path" | "tool" | "command" | "event"; readonly pattern: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRemind"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookBlock"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookApprove"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookVerify"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string; readonly check: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRepair"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRecord"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookAllow"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
        >
        readonly connections: ReadonlyArray<{ readonly from: string; readonly port: number; readonly to: string }>
        readonly binding: "host-required"
        readonly installed: false
      }
    }>
  }
}

export type RelayHooksInstallInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly document: { readonly document: string; readonly version?: string }["document"]
  readonly version?: { readonly document: string; readonly version?: string }["version"]
}

export type RelayHooksInstallOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly installID: string
    readonly document: string
    readonly version: string
    readonly sha256: string
    readonly order: number
    readonly enabled: boolean
    readonly installedBy: string
    readonly installedAt: number
    readonly snapshot: {
      readonly schema: "relay.hook.v1"
      readonly name: string
      readonly nodes: ReadonlyArray<
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookEventTrigger"
            readonly position: readonly [number, number]
            readonly parameters:
              | {
                  readonly operation: "read" | "edit" | "write" | "command" | "tool"
                  readonly timing: "before" | "after"
                }
              | { readonly operation: "session-start"; readonly timing: "after" }
              | { readonly operation: "prompt"; readonly timing: "before" }
              | { readonly operation: "session-idle"; readonly timing: "after" }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookCondition"
            readonly position: readonly [number, number]
            readonly parameters: { readonly field: "path" | "tool" | "command" | "event"; readonly pattern: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRemind"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookBlock"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookApprove"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookVerify"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string; readonly check: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRepair"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRecord"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookAllow"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
      >
      readonly connections: ReadonlyArray<{ readonly from: string; readonly port: number; readonly to: string }>
      readonly binding: "host-required"
      readonly installed: false
    }
  }
}

export type RelayHooksUpdateInput = {
  readonly installID: { readonly installID: string }["installID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly version?: { readonly version?: string }["version"]
}

export type RelayHooksUpdateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly installID: string
    readonly document: string
    readonly version: string
    readonly sha256: string
    readonly order: number
    readonly enabled: boolean
    readonly installedBy: string
    readonly installedAt: number
    readonly snapshot: {
      readonly schema: "relay.hook.v1"
      readonly name: string
      readonly nodes: ReadonlyArray<
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookEventTrigger"
            readonly position: readonly [number, number]
            readonly parameters:
              | {
                  readonly operation: "read" | "edit" | "write" | "command" | "tool"
                  readonly timing: "before" | "after"
                }
              | { readonly operation: "session-start"; readonly timing: "after" }
              | { readonly operation: "prompt"; readonly timing: "before" }
              | { readonly operation: "session-idle"; readonly timing: "after" }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookCondition"
            readonly position: readonly [number, number]
            readonly parameters: { readonly field: "path" | "tool" | "command" | "event"; readonly pattern: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRemind"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookBlock"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookApprove"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookVerify"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string; readonly check: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRepair"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRecord"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookAllow"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
      >
      readonly connections: ReadonlyArray<{ readonly from: string; readonly port: number; readonly to: string }>
      readonly binding: "host-required"
      readonly installed: false
    }
  }
}

export type RelayHooksEnableInput = {
  readonly installID: { readonly installID: string }["installID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayHooksEnableOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly installID: string
    readonly document: string
    readonly version: string
    readonly sha256: string
    readonly order: number
    readonly enabled: boolean
    readonly installedBy: string
    readonly installedAt: number
    readonly snapshot: {
      readonly schema: "relay.hook.v1"
      readonly name: string
      readonly nodes: ReadonlyArray<
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookEventTrigger"
            readonly position: readonly [number, number]
            readonly parameters:
              | {
                  readonly operation: "read" | "edit" | "write" | "command" | "tool"
                  readonly timing: "before" | "after"
                }
              | { readonly operation: "session-start"; readonly timing: "after" }
              | { readonly operation: "prompt"; readonly timing: "before" }
              | { readonly operation: "session-idle"; readonly timing: "after" }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookCondition"
            readonly position: readonly [number, number]
            readonly parameters: { readonly field: "path" | "tool" | "command" | "event"; readonly pattern: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRemind"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookBlock"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookApprove"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookVerify"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string; readonly check: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRepair"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRecord"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookAllow"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
      >
      readonly connections: ReadonlyArray<{ readonly from: string; readonly port: number; readonly to: string }>
      readonly binding: "host-required"
      readonly installed: false
    }
  }
}

export type RelayHooksDisableInput = {
  readonly installID: { readonly installID: string }["installID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayHooksDisableOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly installID: string
    readonly document: string
    readonly version: string
    readonly sha256: string
    readonly order: number
    readonly enabled: boolean
    readonly installedBy: string
    readonly installedAt: number
    readonly snapshot: {
      readonly schema: "relay.hook.v1"
      readonly name: string
      readonly nodes: ReadonlyArray<
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookEventTrigger"
            readonly position: readonly [number, number]
            readonly parameters:
              | {
                  readonly operation: "read" | "edit" | "write" | "command" | "tool"
                  readonly timing: "before" | "after"
                }
              | { readonly operation: "session-start"; readonly timing: "after" }
              | { readonly operation: "prompt"; readonly timing: "before" }
              | { readonly operation: "session-idle"; readonly timing: "after" }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookCondition"
            readonly position: readonly [number, number]
            readonly parameters: { readonly field: "path" | "tool" | "command" | "event"; readonly pattern: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRemind"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookBlock"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookApprove"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookVerify"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string; readonly check: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRepair"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookRecord"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
        | {
            readonly id: string
            readonly name: string
            readonly type: "relay.hookAllow"
            readonly position: readonly [number, number]
            readonly parameters: { readonly message: string }
            readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
          }
      >
      readonly connections: ReadonlyArray<{ readonly from: string; readonly port: number; readonly to: string }>
      readonly binding: "host-required"
      readonly installed: false
    }
  }
}

export type RelayHooksOrderInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly installIDs: { readonly installIDs: ReadonlyArray<string> }["installIDs"]
}

export type RelayHooksOrderOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly installs: ReadonlyArray<{
      readonly installID: string
      readonly document: string
      readonly version: string
      readonly sha256: string
      readonly order: number
      readonly enabled: boolean
      readonly installedBy: string
      readonly installedAt: number
      readonly snapshot: {
        readonly schema: "relay.hook.v1"
        readonly name: string
        readonly nodes: ReadonlyArray<
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookEventTrigger"
              readonly position: readonly [number, number]
              readonly parameters:
                | {
                    readonly operation: "read" | "edit" | "write" | "command" | "tool"
                    readonly timing: "before" | "after"
                  }
                | { readonly operation: "session-start"; readonly timing: "after" }
                | { readonly operation: "prompt"; readonly timing: "before" }
                | { readonly operation: "session-idle"; readonly timing: "after" }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookCondition"
              readonly position: readonly [number, number]
              readonly parameters: { readonly field: "path" | "tool" | "command" | "event"; readonly pattern: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRemind"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookBlock"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookApprove"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookVerify"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string; readonly check: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRepair"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRecord"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookAllow"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
        >
        readonly connections: ReadonlyArray<{ readonly from: string; readonly port: number; readonly to: string }>
        readonly binding: "host-required"
        readonly installed: false
      }
    }>
  }
}

export type RelayHooksUninstallInput = {
  readonly installID: { readonly installID: string }["installID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayHooksUninstallOutput = void

export type RelayHooksDecisionsInput = {
  readonly installID: { readonly installID: string }["installID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayHooksDecisionsOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly ts: number
    readonly event: "hook-decision"
    readonly decision: string
    readonly install: string
    readonly version: string
    readonly node: string
    readonly action: "remind" | "block" | "approve" | "verify" | "repair" | "record" | "allow"
    readonly trigger: string
    readonly tool: string | null
    readonly session: string
    readonly call: string | null
    readonly subject: string
    readonly outcome:
      | "blocked"
      | "approved"
      | "rejected"
      | "cancelled"
      | "passed"
      | "failed"
      | "unavailable"
      | "repair-required"
      | "reminded"
      | "recorded"
      | "allowed"
    readonly deferred?: true
    readonly seq: number
  }>
}

export type RelayHooksRepairInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly confirm: { readonly confirm: true }["confirm"]
}

export type RelayHooksRepairOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly backup: string
    readonly installs: ReadonlyArray<{
      readonly installID: string
      readonly document: string
      readonly version: string
      readonly sha256: string
      readonly order: number
      readonly enabled: boolean
      readonly installedBy: string
      readonly installedAt: number
      readonly snapshot: {
        readonly schema: "relay.hook.v1"
        readonly name: string
        readonly nodes: ReadonlyArray<
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookEventTrigger"
              readonly position: readonly [number, number]
              readonly parameters:
                | {
                    readonly operation: "read" | "edit" | "write" | "command" | "tool"
                    readonly timing: "before" | "after"
                  }
                | { readonly operation: "session-start"; readonly timing: "after" }
                | { readonly operation: "prompt"; readonly timing: "before" }
                | { readonly operation: "session-idle"; readonly timing: "after" }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookCondition"
              readonly position: readonly [number, number]
              readonly parameters: { readonly field: "path" | "tool" | "command" | "event"; readonly pattern: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRemind"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookBlock"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookApprove"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookVerify"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string; readonly check: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRepair"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookRecord"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
          | {
              readonly id: string
              readonly name: string
              readonly type: "relay.hookAllow"
              readonly position: readonly [number, number]
              readonly parameters: { readonly message: string }
              readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
            }
        >
        readonly connections: ReadonlyArray<{ readonly from: string; readonly port: number; readonly to: string }>
        readonly binding: "host-required"
        readonly installed: false
      }
    }>
  }
}

export type PullRequestsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type PullRequestsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly host: "github" | "gitlab"
    readonly repository: string
    readonly count: number
    readonly truncated: boolean
    readonly items: ReadonlyArray<{
      readonly number: number
      readonly title: string
      readonly url: string
      readonly state: string
      readonly author: string | null
    }>
  }
}

export type PullRequestsCreateInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly title: {
    readonly title: string
    readonly body: string
    readonly base: string
    readonly head?: string
  }["title"]
  readonly body: {
    readonly title: string
    readonly body: string
    readonly base: string
    readonly head?: string
  }["body"]
  readonly base: {
    readonly title: string
    readonly body: string
    readonly base: string
    readonly head?: string
  }["base"]
  readonly head?: {
    readonly title: string
    readonly body: string
    readonly base: string
    readonly head?: string
  }["head"]
}

export type PullRequestsCreateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly host: "github" | "gitlab"
    readonly repository: string
    readonly number: number
    readonly url: string
  }
}

export type SchedulesListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type SchedulesListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly timezone: string
    readonly minute: number
    readonly next: number
    readonly enabled: boolean
    readonly runs: number
    readonly missed?: number
    readonly last?:
      | { readonly outcome: "started"; readonly time: number; readonly slot?: number; readonly sessionID: string }
      | { readonly outcome: "failed"; readonly time: number; readonly slot?: number; readonly error: string }
  }>
}

export type SchedulesCreateInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly id?: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["id"]
  readonly name: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["name"]
  readonly prompt: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["prompt"]
  readonly cadence: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["cadence"]
  readonly next: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["next"]
  readonly timezone: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["timezone"]
  readonly minute?: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["minute"]
  readonly enabled?: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["enabled"]
  readonly history?: {
    readonly id?: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly next: number
    readonly timezone: string
    readonly minute?: number
    readonly enabled?: boolean
    readonly history?: {
      readonly runs: number
      readonly missed?: number
      readonly last?: { readonly time: number; readonly sessionID: string }
    }
  }["history"]
}

export type SchedulesCreateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly timezone: string
    readonly minute: number
    readonly next: number
    readonly enabled: boolean
    readonly runs: number
    readonly missed?: number
    readonly last?:
      | { readonly outcome: "started"; readonly time: number; readonly slot?: number; readonly sessionID: string }
      | { readonly outcome: "failed"; readonly time: number; readonly slot?: number; readonly error: string }
  }
}

export type SchedulesUpdateInput = {
  readonly scheduleID: { readonly scheduleID: string }["scheduleID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly name?: {
    readonly name?: string
    readonly prompt?: string
    readonly cadence?: "once" | "hourly" | "daily" | "weekly"
    readonly next?: number
    readonly timezone?: string
    readonly enabled?: boolean
  }["name"]
  readonly prompt?: {
    readonly name?: string
    readonly prompt?: string
    readonly cadence?: "once" | "hourly" | "daily" | "weekly"
    readonly next?: number
    readonly timezone?: string
    readonly enabled?: boolean
  }["prompt"]
  readonly cadence?: {
    readonly name?: string
    readonly prompt?: string
    readonly cadence?: "once" | "hourly" | "daily" | "weekly"
    readonly next?: number
    readonly timezone?: string
    readonly enabled?: boolean
  }["cadence"]
  readonly next?: {
    readonly name?: string
    readonly prompt?: string
    readonly cadence?: "once" | "hourly" | "daily" | "weekly"
    readonly next?: number
    readonly timezone?: string
    readonly enabled?: boolean
  }["next"]
  readonly timezone?: {
    readonly name?: string
    readonly prompt?: string
    readonly cadence?: "once" | "hourly" | "daily" | "weekly"
    readonly next?: number
    readonly timezone?: string
    readonly enabled?: boolean
  }["timezone"]
  readonly enabled?: {
    readonly name?: string
    readonly prompt?: string
    readonly cadence?: "once" | "hourly" | "daily" | "weekly"
    readonly next?: number
    readonly timezone?: string
    readonly enabled?: boolean
  }["enabled"]
}

export type SchedulesUpdateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly name: string
    readonly prompt: string
    readonly cadence: "once" | "hourly" | "daily" | "weekly"
    readonly timezone: string
    readonly minute: number
    readonly next: number
    readonly enabled: boolean
    readonly runs: number
    readonly missed?: number
    readonly last?:
      | { readonly outcome: "started"; readonly time: number; readonly slot?: number; readonly sessionID: string }
      | { readonly outcome: "failed"; readonly time: number; readonly slot?: number; readonly error: string }
  }
}

export type SchedulesRemoveInput = {
  readonly scheduleID: { readonly scheduleID: string }["scheduleID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type SchedulesRemoveOutput = void

export type SchedulesRunInput = {
  readonly scheduleID: { readonly scheduleID: string }["scheduleID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type SchedulesRunOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: { readonly sessionID: string }
}

export type OperatorInspectInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type OperatorInspectOutput = {
  readonly requestID: string
  readonly principal: string
  readonly origin: "configured-auth" | "desktop" | "cli" | "sdk"
  readonly scopeHash: string
}

export type ConnectionsConnectInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly provider: {
    readonly provider: "slack" | "discord"
    readonly key: string
    readonly label?: string
  }["provider"]
  readonly key: { readonly provider: "slack" | "discord"; readonly key: string; readonly label?: string }["key"]
  readonly label?: { readonly provider: "slack" | "discord"; readonly key: string; readonly label?: string }["label"]
}

export type ConnectionsConnectOutput = {
  readonly requestID: string
  readonly reused: boolean
  readonly data: JsonValue
}

export type ConnectionsGetTargetInput = {
  readonly targetID: { readonly targetID: string }["targetID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ConnectionsGetTargetOutput = {
  readonly target: {
    readonly id: string
    readonly connectionID: string
    readonly generation: number
    readonly environment: string
  }
}

export type ConnectionsBindingsInput = {
  readonly targetID: { readonly targetID: string }["targetID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["location"]
  readonly after?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["after"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["limit"]
}

export type ConnectionsBindingsOutput = {
  readonly items: ReadonlyArray<{ readonly sessionID: string; readonly actions: ReadonlyArray<string> }>
  readonly after?: string
  readonly coverage: "current-actor"
}

export type ConnectionsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["location"]
  readonly after?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["after"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["limit"]
}

export type ConnectionsListOutput = {
  readonly items: ReadonlyArray<{
    readonly connection: { readonly id: string; readonly provider: string; readonly generation: number }
    readonly label?: string
    readonly state: "active" | "disconnected" | "revoked"
    readonly credential: "present" | "missing"
  }>
  readonly after?: string
  readonly coverage: "live"
}

export type ConnectionsGetInput = {
  readonly connectionID: { readonly connectionID: string }["connectionID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ConnectionsGetOutput = {
  readonly connection: { readonly id: string; readonly provider: string; readonly generation: number }
  readonly label?: string
  readonly state: "active" | "disconnected" | "revoked"
  readonly credential: "present" | "missing"
}

export type ConnectionsTargetsInput = {
  readonly connectionID: { readonly connectionID: string }["connectionID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["location"]
  readonly after?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["after"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: string
    readonly limit?: number
  }["limit"]
}

export type ConnectionsTargetsOutput = {
  readonly items: ReadonlyArray<{
    readonly target: {
      readonly id: string
      readonly connectionID: string
      readonly generation: number
      readonly environment: string
    }
  }>
  readonly after?: string
  readonly coverage: "live"
}

export type ConnectionsDisconnectInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly connection: {
    readonly connection: { readonly id: string; readonly provider: string; readonly generation: number }
  }["connection"]
}

export type ConnectionsDisconnectOutput = {
  readonly requestID: string
  readonly reused: boolean
  readonly data: JsonValue
}

export type ConnectionsCreateTargetInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly connection: {
    readonly connection: { readonly id: string; readonly provider: string; readonly generation: number }
    readonly input: { readonly environment: string; readonly resource: JsonValue }
  }["connection"]
  readonly input: {
    readonly connection: { readonly id: string; readonly provider: string; readonly generation: number }
    readonly input: { readonly environment: string; readonly resource: JsonValue }
  }["input"]
}

export type ConnectionsCreateTargetOutput = {
  readonly requestID: string
  readonly reused: boolean
  readonly data: JsonValue
}

export type ConnectionsRetargetTargetInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly target: {
    readonly target: {
      readonly id: string
      readonly connectionID: string
      readonly generation: number
      readonly environment: string
    }
    readonly input: { readonly environment: string; readonly resource: JsonValue }
  }["target"]
  readonly input: {
    readonly target: {
      readonly id: string
      readonly connectionID: string
      readonly generation: number
      readonly environment: string
    }
    readonly input: { readonly environment: string; readonly resource: JsonValue }
  }["input"]
}

export type ConnectionsRetargetTargetOutput = {
  readonly requestID: string
  readonly reused: boolean
  readonly data: JsonValue
}

export type ConnectionsRemoveTargetInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly target: {
    readonly target: {
      readonly id: string
      readonly connectionID: string
      readonly generation: number
      readonly environment: string
    }
  }["target"]
}

export type ConnectionsRemoveTargetOutput = {
  readonly requestID: string
  readonly reused: boolean
  readonly data: JsonValue
}

export type ConnectionsBindInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly target: {
    readonly target: {
      readonly id: string
      readonly connectionID: string
      readonly generation: number
      readonly environment: string
    }
    readonly input: { readonly sessionID: string; readonly actions: ReadonlyArray<string> }
  }["target"]
  readonly input: {
    readonly target: {
      readonly id: string
      readonly connectionID: string
      readonly generation: number
      readonly environment: string
    }
    readonly input: { readonly sessionID: string; readonly actions: ReadonlyArray<string> }
  }["input"]
}

export type ConnectionsBindOutput = { readonly requestID: string; readonly reused: boolean; readonly data: JsonValue }

export type ConnectionsUnbindInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly target: {
    readonly target: {
      readonly id: string
      readonly connectionID: string
      readonly generation: number
      readonly environment: string
    }
    readonly sessionID: string
  }["target"]
  readonly sessionID: {
    readonly target: {
      readonly id: string
      readonly connectionID: string
      readonly generation: number
      readonly environment: string
    }
    readonly sessionID: string
  }["sessionID"]
}

export type ConnectionsUnbindOutput = { readonly requestID: string; readonly reused: boolean; readonly data: JsonValue }
