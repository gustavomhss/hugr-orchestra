import type { SessionEventEncoded } from "../wire"

import type { OrchestraEventEncoded } from "@orchestra/protocol/groups/event"

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | ReadonlyArray<JsonValue>
  | { readonly [key: string]: JsonValue }

export type HealthGetOutput = { readonly healthy: true; readonly pid?: number | undefined; readonly version: string }

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

export type LocationPathsOutput = { readonly home: string }

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
    readonly name?: string
    readonly engine?: "orchestra" | "claude-code"
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
    readonly avatar?: string
    readonly steps?: number
    readonly skills?: ReadonlyArray<{
      readonly name: string
      readonly description?: string
      readonly references?: ReadonlyArray<{ readonly kind?: string; readonly family?: string; readonly title: string }>
    }>
    readonly toolkit?: "backend" | "research"
    readonly permissions: ReadonlyArray<{
      readonly action: string
      readonly resource: string
      readonly effect: "allow" | "deny" | "ask"
    }>
  }>
}

export type AgentsDetailInput = {
  readonly agentID: { readonly agentID: string }["agentID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AgentsDetailOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly tools: ReadonlyArray<{ readonly name: string; readonly description: string }>
    readonly skills: ReadonlyArray<{
      readonly name: string
      readonly description?: string | null
      readonly location: string
    }>
    readonly engines: ReadonlyArray<{
      readonly id: string
      readonly version: string
      readonly license: string
      readonly upstream: string
      readonly role: "generator" | "check" | "indexer" | "oracle"
      readonly input: string
      readonly status: "absent" | "fetching" | "ready" | "failed" | "unsupported"
    }>
  }
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
    readonly avatar?: string
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
    readonly avatar?: string
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
    readonly avatar?: string
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
    readonly avatar?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["model"]
  readonly avatar?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly avatar?: string
    readonly steps?: number
    readonly system?: string
    readonly permission?: {
      readonly [x: string]: ("allow" | "ask" | "deny") | { readonly [x: string]: "allow" | "ask" | "deny" }
    }
    readonly disable?: boolean
    readonly revision?: string
  }["avatar"]
  readonly steps?: {
    readonly description?: string
    readonly mode?: "subagent" | "primary" | "all"
    readonly model?: string
    readonly avatar?: string
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
    readonly avatar?: string
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
    readonly avatar?: string
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
    readonly avatar?: string
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
    readonly avatar?: string
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
    readonly avatar?: string
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
    readonly includeArchived?: boolean | undefined
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
    readonly includeArchived?: boolean | undefined
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
    readonly includeArchived?: boolean | undefined
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
    readonly includeArchived?: boolean | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["search"]
  readonly includeArchived?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly includeArchived?: boolean | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["includeArchived"]
  readonly directory?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly includeArchived?: boolean | undefined
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
    readonly includeArchived?: boolean | undefined
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
    readonly includeArchived?: boolean | undefined
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
    readonly includeArchived?: boolean | undefined
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
    readonly subagentModels?:
      | { readonly mode: "inherit" }
      | {
          readonly mode: "allowlist"
          readonly models: ReadonlyArray<{
            readonly id: string
            readonly providerID: string
            readonly variant?: string
          }>
        }
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
    readonly subagentModels?:
      | { readonly mode: "inherit" }
      | {
          readonly mode: "allowlist"
          readonly models: ReadonlyArray<{
            readonly id: string
            readonly providerID: string
            readonly variant?: string
          }>
        }
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
    readonly subagentModels?:
      | { readonly mode: "inherit" }
      | {
          readonly mode: "allowlist"
          readonly models: ReadonlyArray<{
            readonly id: string
            readonly providerID: string
            readonly variant?: string
          }>
        }
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

export type SessionsArchiveInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly archived: { readonly archived: boolean }["archived"]
}

export type SessionsArchiveOutput = void

export type SessionsRenameInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly title: { readonly title: string }["title"]
}

export type SessionsRenameOutput = void

export type SessionsRemoveInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsRemoveOutput = void

export type SessionsGetSubagentModelsInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsGetSubagentModelsOutput = {
  readonly data:
    | { readonly mode: "inherit" }
    | {
        readonly mode: "allowlist"
        readonly models: ReadonlyArray<{ readonly id: string; readonly providerID: string; readonly variant?: string }>
      }
}["data"]

export type SessionsSetSubagentModelsInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly policy: {
    readonly policy:
      | { readonly mode: "inherit" }
      | {
          readonly mode: "allowlist"
          readonly models: ReadonlyArray<{
            readonly id: string
            readonly providerID: string
            readonly variant?: string
          }>
        }
  }["policy"]
}

export type SessionsSetSubagentModelsOutput = {
  readonly data:
    | { readonly mode: "inherit" }
    | {
        readonly mode: "allowlist"
        readonly models: ReadonlyArray<{ readonly id: string; readonly providerID: string; readonly variant?: string }>
      }
}["data"]

export type SessionsGetPermissionInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsGetPermissionOutput = {
  readonly data: ReadonlyArray<{
    readonly permission: string
    readonly pattern: string
    readonly action: "allow" | "deny" | "ask"
  }>
}["data"]

export type SessionsSetPermissionInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly permission: {
    readonly permission: ReadonlyArray<{
      readonly permission: string
      readonly pattern: string
      readonly action: "allow" | "deny" | "ask"
    }>
  }["permission"]
}

export type SessionsSetPermissionOutput = {
  readonly data: ReadonlyArray<{
    readonly permission: string
    readonly pattern: string
    readonly action: "allow" | "deny" | "ask"
  }>
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
    readonly promptContext?: { readonly reminders: ReadonlyArray<string> }
    readonly delivery: "steer" | "queue"
    readonly timeCreated: number
    readonly promotedSeq?: number
  }
}["data"]

export type SessionsCommandInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["id"]
  readonly command: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["command"]
  readonly arguments?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["arguments"]
  readonly files?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["files"]
  readonly agents?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["agents"]
  readonly delivery?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["delivery"]
  readonly resume?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["resume"]
}

export type SessionsCommandOutput = {
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
    readonly promptContext?: { readonly reminders: ReadonlyArray<string> }
    readonly delivery: "steer" | "queue"
    readonly timeCreated: number
    readonly promotedSeq?: number
  }
}["data"]

export type SessionsCompactInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsCompactOutput = { readonly data: { readonly compacted: boolean } }["data"]

export type SessionsForkInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly messageID?: { readonly messageID?: string | undefined }["messageID"]
}

export type SessionsForkOutput = {
  readonly data: {
    readonly id: string
    readonly parentID?: string
    readonly projectID: string
    readonly agent?: string
    readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
    readonly subagentModels?:
      | { readonly mode: "inherit" }
      | {
          readonly mode: "allowlist"
          readonly models: ReadonlyArray<{
            readonly id: string
            readonly providerID: string
            readonly variant?: string
          }>
        }
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

export type SessionsMoveInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly location: {
    readonly location: { readonly directory: string; readonly workspaceID?: string }
    readonly moveChanges?: boolean | null
  }["location"]
  readonly moveChanges?: {
    readonly location: { readonly directory: string; readonly workspaceID?: string }
    readonly moveChanges?: boolean | null
  }["moveChanges"]
}

export type SessionsMoveOutput = void

export type SessionsShellInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly id?: { readonly id?: string | undefined; readonly command: string }["id"]
  readonly command: { readonly id?: string | undefined; readonly command: string }["command"]
}

export type SessionsShellOutput = void

export type SessionsSkillInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly skill: { readonly skill: string; readonly resume?: boolean | undefined }["skill"]
  readonly resume?: { readonly skill: string; readonly resume?: boolean | undefined }["resume"]
}

export type SessionsSkillOutput = void

export type SessionsSyntheticInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly id?: { readonly id?: string | undefined; readonly text: string; readonly resume?: boolean | undefined }["id"]
  readonly text: {
    readonly id?: string | undefined
    readonly text: string
    readonly resume?: boolean | undefined
  }["text"]
  readonly resume?: {
    readonly id?: string | undefined
    readonly text: string
    readonly resume?: boolean | undefined
  }["resume"]
}

export type SessionsSyntheticOutput = { readonly data: { readonly id: string } }["data"]

export type SessionsGenerateInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly prompt: { readonly prompt: string }["prompt"]
}

export type SessionsGenerateOutput = { readonly data: { readonly text: string } }["data"]

export type SessionsTodoInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsTodoOutput = {
  readonly data: ReadonlyArray<{ readonly content: string; readonly status: string; readonly priority: string }>
}["data"]

export type SessionsWaitInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsWaitOutput = void

export type SessionsDiffInput = {
  readonly sessionID: { readonly sessionID: string; readonly messageID: string }["sessionID"]
  readonly messageID: { readonly sessionID: string; readonly messageID: string }["messageID"]
  readonly context?: { readonly context?: number | undefined }["context"]
}

export type SessionsDiffOutput = {
  readonly data: ReadonlyArray<{
    readonly path: string
    readonly status: "added" | "modified" | "deleted"
    readonly additions: number
    readonly deletions: number
    readonly patch: string
  }>
}["data"]

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
        readonly promptContext?: { readonly reminders: ReadonlyArray<string> }
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
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
                    readonly metadata?: { readonly [x: string]: JsonValue }
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
                    readonly metadata?: { readonly [x: string]: JsonValue }
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

export type SessionsBackgroundInput = { readonly sessionID: { readonly sessionID: string }["sessionID"] }

export type SessionsBackgroundOutput = { readonly data: number }["data"]

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
        readonly type: "session.next.created"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly projectID: string
          readonly parentID?: string
          readonly location: { readonly directory: string; readonly workspaceID?: string }
          readonly subdirectory?: string
          readonly title: string
          readonly agent?: string
          readonly model?: { readonly id: string; readonly providerID: string; readonly variant?: string }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.renamed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: { readonly timestamp: number; readonly sessionID: string; readonly title: string }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.deleted"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: { readonly timestamp: number; readonly sessionID: string }
      }
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
        readonly type: "session.next.subagent.models.changed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly policy:
            | { readonly mode: "inherit" }
            | {
                readonly mode: "allowlist"
                readonly models: ReadonlyArray<{
                  readonly id: string
                  readonly providerID: string
                  readonly variant?: string
                }>
              }
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.permission.changed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: {
          readonly timestamp: number
          readonly sessionID: string
          readonly permission: ReadonlyArray<{
            readonly permission: string
            readonly pattern: string
            readonly action: "allow" | "deny" | "ask"
          }>
        }
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly type: "session.next.archive.changed"
        readonly durable?: { readonly aggregateID: string; readonly seq: number; readonly version: number }
        readonly location?: { readonly directory: string; readonly workspaceID?: string }
        readonly data: { readonly timestamp: number; readonly sessionID: string; readonly archived: number | null }
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
          readonly promptContext?: { readonly reminders: ReadonlyArray<string> }
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
          readonly promptContext?: { readonly reminders: ReadonlyArray<string> }
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
          readonly files?: ReadonlyArray<{
            readonly uri: string
            readonly mime: string
            readonly name?: string
            readonly description?: string
            readonly source?: { readonly start: number; readonly end: number; readonly text: string }
          }>
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
          readonly metadata?: { readonly [x: string]: JsonValue }
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
          readonly metadata?: { readonly [x: string]: JsonValue }
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
        readonly promptContext?: { readonly reminders: ReadonlyArray<string> }
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
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
                    readonly metadata?: { readonly [x: string]: JsonValue }
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
                    readonly metadata?: { readonly [x: string]: JsonValue }
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

export type SessionsProcessesInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
  readonly tail?: { readonly tail?: number | undefined }["tail"]
}

export type SessionsProcessesOutput = {
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly pid: number
    readonly title: string
    readonly started: number
    readonly processes: ReadonlyArray<{
      readonly pid: number
      readonly parentPid?: number | undefined
      readonly name?: string | undefined
    }>
    readonly output: string
    readonly written: number
  }>
}["data"]

export type SessionsProcessStopInput = {
  readonly sessionID: { readonly sessionID: string; readonly processID: string }["sessionID"]
  readonly processID: { readonly sessionID: string; readonly processID: string }["processID"]
}

export type SessionsProcessStopOutput = { readonly data: boolean }["data"]

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
        readonly promptContext?: { readonly reminders: ReadonlyArray<string> }
        readonly type: "user"
      }
    | {
        readonly id: string
        readonly metadata?: { readonly [x: string]: JsonValue }
        readonly time: { readonly created: number }
        readonly sessionID: string
        readonly text: string
        readonly files?: ReadonlyArray<{
          readonly uri: string
          readonly mime: string
          readonly name?: string
          readonly description?: string
          readonly source?: { readonly start: number; readonly end: number; readonly text: string }
        }>
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
                    readonly metadata?: { readonly [x: string]: JsonValue }
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
                    readonly metadata?: { readonly [x: string]: JsonValue }
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

export type ModelsDefaultInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ModelsDefaultOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
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
  } | null
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

export type ProvidersClaudeCodeAccountOutput = {
  readonly signedIn: boolean
  readonly email?: string | undefined
  readonly subscription?: string | undefined
}

export type ProvidersClaudeCodeLoginOutput = { readonly url: string }

export type ProvidersClaudeCodeLoginCodeInput = { readonly code: { readonly code: string }["code"] }

export type ProvidersClaudeCodeLoginCodeOutput = boolean

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
      | {
          readonly type: "key"
          readonly label?: string
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
      | {
          readonly type: "key"
          readonly label?: string
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
      | { readonly type: "env"; readonly names: ReadonlyArray<string> }
    >
    readonly connections: ReadonlyArray<
      | { readonly type: "credential"; readonly id: string; readonly label: string }
      | { readonly type: "env"; readonly name: string }
    >
  } | null
}

export type IntegrationsDisconnectInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsDisconnectOutput = void

export type IntegrationsConnectKeyInput = {
  readonly integrationID: { readonly integrationID: string }["integrationID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly key: {
    readonly key: string
    readonly label?: string | undefined
    readonly metadata?: { readonly [x: string]: unknown } | undefined
  }["key"]
  readonly label?: {
    readonly key: string
    readonly label?: string | undefined
    readonly metadata?: { readonly [x: string]: unknown } | undefined
  }["label"]
  readonly metadata?: {
    readonly key: string
    readonly label?: string | undefined
    readonly metadata?: { readonly [x: string]: unknown } | undefined
  }["metadata"]
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

export type IntegrationsOauthStatusInput = {
  readonly integrationID: { readonly integrationID: string; readonly attemptID: string }["integrationID"]
  readonly attemptID: { readonly integrationID: string; readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsOauthStatusOutput = {
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

export type IntegrationsOauthCompleteInput = {
  readonly integrationID: { readonly integrationID: string; readonly attemptID: string }["integrationID"]
  readonly attemptID: { readonly integrationID: string; readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly code?: { readonly code?: string | undefined }["code"]
}

export type IntegrationsOauthCompleteOutput = void

export type IntegrationsOauthCancelInput = {
  readonly integrationID: { readonly integrationID: string; readonly attemptID: string }["integrationID"]
  readonly attemptID: { readonly integrationID: string; readonly attemptID: string }["attemptID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type IntegrationsOauthCancelOutput = void

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

export type FilesReadInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly path: string
  }["location"]
  readonly path: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly path: string
  }["path"]
}

export type FilesReadOutput = globalThis.Uint8Array

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

export type VcsGetInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type VcsGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: { readonly branch?: string | null; readonly default_branch?: string | null }
}

export type VcsStatusInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type VcsStatusOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly file: string
    readonly additions: number
    readonly deletions: number
    readonly status: "added" | "deleted" | "modified"
  }>
}

export type VcsDiffInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly mode: "working" | "branch"
    readonly context?: number | undefined
  }["location"]
  readonly mode: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly mode: "working" | "branch"
    readonly context?: number | undefined
  }["mode"]
  readonly context?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly mode: "working" | "branch"
    readonly context?: number | undefined
  }["context"]
}

export type VcsDiffOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly file: string
    readonly patch?: string | null
    readonly additions: number
    readonly deletions: number
    readonly status?: "added" | "deleted" | "modified" | null
  }>
}

export type VcsActivityInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly since: number
    readonly until: number
  }["location"]
  readonly since: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly since: number
    readonly until: number
  }["since"]
  readonly until: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly since: number
    readonly until: number
  }["until"]
}

export type VcsActivityOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly repository: boolean
    readonly since: number
    readonly until: number
    readonly totals: {
      readonly commits: number
      readonly merges: number
      readonly authors: number
      readonly additions: number
      readonly deletions: number
      readonly filesChanged: number
    }
    readonly days: ReadonlyArray<{
      readonly day: string
      readonly commits: number
      readonly merges: number
      readonly additions: number
      readonly deletions: number
    }>
    readonly topPaths: ReadonlyArray<{ readonly path: string; readonly changes: number }>
    readonly recent: ReadonlyArray<{ readonly hash: string; readonly subject: string; readonly time: number }>
    readonly ahead: number | null
    readonly behind: number | null
    readonly truncated: boolean
    readonly partial: { readonly commits: boolean; readonly lines: boolean }
  }
}

export type VcsSessionActivityInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly period: "7d" | "30d" | "90d" | "all"
  }["location"]
  readonly period: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly period: "7d" | "30d" | "90d" | "all"
  }["period"]
}

export type VcsSessionActivityOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly period: "7d" | "30d" | "90d" | "all"
    readonly edges: ReadonlyArray<number>
    readonly days: ReadonlyArray<string>
    readonly previous: boolean
    readonly activeMs: ReadonlyArray<number>
    readonly sessions: ReadonlyArray<{
      readonly id: string
      readonly title: string
      readonly parentID: string | null
      readonly created: number
      readonly updated: number
      readonly additions: number | null
      readonly deletions: number | null
      readonly files: number | null
    }>
    readonly facts: ReadonlyArray<{
      readonly bucket: number
      readonly sessionID: string
      readonly providerID: string | null
      readonly modelID: string | null
      readonly user: number
      readonly assistant: number
      readonly failed: number
      readonly tokens: number
    }>
    readonly truncated: boolean
  }
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

export type McpListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly name: string
    readonly status:
      | { readonly status: "connected" }
      | { readonly status: "disabled" }
      | { readonly status: "failed"; readonly error: string }
      | { readonly status: "needs_auth" }
      | { readonly status: "needs_client_registration"; readonly error: string }
  }>
}

export type McpResourcesInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpResourcesOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly resources: ReadonlyArray<{
      readonly server: string
      readonly name: string
      readonly uri: string
      readonly description?: string | null
      readonly mimeType?: string | null
    }>
    readonly templates: ReadonlyArray<{
      readonly server: string
      readonly name: string
      readonly uriTemplate: string
      readonly description?: string | null
      readonly mimeType?: string | null
    }>
  }
}

export type McpConfigInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpConfigOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly [x: string]: {
      readonly type?: "local" | "remote"
      readonly command?: ReadonlyArray<string>
      readonly url?: string
    }
  }
}

export type McpEntriesInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpEntriesOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly [x: string]: {
      readonly type?: "local" | "remote"
      readonly command?: ReadonlyArray<string>
      readonly url?: string
    }
  }
}

export type McpToolsInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpToolsOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: { readonly [x: string]: ReadonlyArray<string> }
}

export type McpAddInput = {
  readonly server: { readonly server: string }["server"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly config: {
    readonly config:
      | {
          readonly type: "local"
          readonly command: ReadonlyArray<string>
          readonly cwd?: string | undefined
          readonly environment?: { readonly [x: string]: string } | undefined
          readonly disabled?: boolean | undefined
          readonly timeout?:
            | { readonly startup?: number | undefined; readonly request?: number | undefined }
            | undefined
        }
      | {
          readonly type: "remote"
          readonly url: string
          readonly headers?: { readonly [x: string]: string } | undefined
          readonly oauth?:
            | {
                readonly client_id?: string | undefined
                readonly client_secret?: string | undefined
                readonly scope?: string | undefined
                readonly callback_port?: number | undefined
                readonly redirect_uri?: string | undefined
              }
            | false
            | undefined
          readonly disabled?: boolean | undefined
          readonly timeout?:
            | { readonly startup?: number | undefined; readonly request?: number | undefined }
            | undefined
        }
  }["config"]
}

export type McpAddOutput = void

export type McpRemoveInput = {
  readonly server: { readonly server: string }["server"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpRemoveOutput = void

export type McpConnectInput = {
  readonly server: { readonly server: string }["server"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpConnectOutput = void

export type McpDisconnectInput = {
  readonly server: { readonly server: string }["server"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpDisconnectOutput = void

export type McpDebugInput = {
  readonly server: { readonly server: string }["server"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpDebugOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly name: string
    readonly url: string
    readonly oauth: boolean
    readonly tokens?: {
      readonly access: string
      readonly expiresAt?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly refreshToken: boolean
    } | null
    readonly client?: {
      readonly id: string
      readonly secretExpiresAt?: number | "Infinity" | "-Infinity" | "NaN" | null
    } | null
    readonly http?: {
      readonly status: number | "Infinity" | "-Infinity" | "NaN"
      readonly statusText: string
      readonly wwwAuthenticate?: string | null
      readonly serverInfo?: string | null
      readonly body?: string | null
    } | null
    readonly flow?: {
      readonly result: "authenticated" | "unauthorized" | "error"
      readonly message?: string | null
      readonly clientRegistered?: boolean | null
    } | null
    readonly error?: string | null
  }
}

export type McpAuthStartInput = {
  readonly server: { readonly server: string }["server"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpAuthStartOutput = { readonly authorizationUrl: string; readonly oauthState: string }

export type McpAuthCallbackInput = {
  readonly server: { readonly server: string }["server"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly code: { readonly code: string }["code"]
}

export type McpAuthCallbackOutput =
  | { readonly status: "connected" }
  | { readonly status: "disabled" }
  | { readonly status: "failed"; readonly error: string }
  | { readonly status: "needs_auth" }
  | { readonly status: "needs_client_registration"; readonly error: string }

export type McpAuthRemoveInput = {
  readonly server: { readonly server: string }["server"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type McpAuthRemoveOutput = void

export type ServerLspStatusInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ServerLspStatusOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly root: string
    readonly status: "connected" | "error"
  }>
}

export type ServerFormatterStatusInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ServerFormatterStatusOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly name: string
    readonly extensions: ReadonlyArray<string>
    readonly enabled: boolean
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
    readonly cols?: number
    readonly rows?: number
  }["command"]
  readonly args?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
    readonly cols?: number
    readonly rows?: number
  }["args"]
  readonly cwd?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
    readonly cols?: number
    readonly rows?: number
  }["cwd"]
  readonly title?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
    readonly cols?: number
    readonly rows?: number
  }["title"]
  readonly env?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
    readonly cols?: number
    readonly rows?: number
  }["env"]
  readonly cols?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
    readonly cols?: number
    readonly rows?: number
  }["cols"]
  readonly rows?: {
    readonly command?: string
    readonly args?: ReadonlyArray<string>
    readonly cwd?: string
    readonly title?: string
    readonly env?: { readonly [x: string]: string }
    readonly cols?: number
    readonly rows?: number
  }["rows"]
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

export type ProjectCopiesGenerateNameInput = {
  readonly projectID: { readonly projectID: string }["projectID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly context?: { readonly context?: string | undefined }["context"]
}

export type ProjectCopiesGenerateNameOutput = { readonly name: string }

export type ProjectsListOutput = ReadonlyArray<{
  readonly id: string
  readonly worktree: string
  readonly vcs?: "git"
  readonly name?: string
  readonly icon?: { readonly url?: string; readonly override?: string; readonly color?: string }
  readonly commands?: { readonly start?: string }
  readonly time: { readonly created: number; readonly updated: number; readonly initialized?: number }
  readonly sandboxes: ReadonlyArray<string>
}>

export type ProjectsDirectoriesInput = { readonly projectID: { readonly projectID: string }["projectID"] }

export type ProjectsDirectoriesOutput = ReadonlyArray<{
  readonly directory: string
  readonly strategy?: string | undefined
}>

export type ProjectsUpdateInput = {
  readonly projectID: { readonly projectID: string }["projectID"]
  readonly name?: {
    readonly name?: string | null
    readonly icon?: { readonly color?: string | null; readonly override?: string | null } | null
    readonly commands?: { readonly start?: string } | null
  }["name"]
  readonly icon?: {
    readonly name?: string | null
    readonly icon?: { readonly color?: string | null; readonly override?: string | null } | null
    readonly commands?: { readonly start?: string } | null
  }["icon"]
  readonly commands?: {
    readonly name?: string | null
    readonly icon?: { readonly color?: string | null; readonly override?: string | null } | null
    readonly commands?: { readonly start?: string } | null
  }["commands"]
}

export type ProjectsUpdateOutput = {
  readonly id: string
  readonly worktree: string
  readonly vcs?: "git"
  readonly name?: string
  readonly icon?: { readonly url?: string; readonly override?: string; readonly color?: string }
  readonly commands?: { readonly start?: string }
  readonly time: { readonly created: number; readonly updated: number; readonly initialized?: number }
  readonly sandboxes: ReadonlyArray<string>
}

export type ProjectsInitGitInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ProjectsInitGitOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly worktree: string
    readonly vcs?: "git"
    readonly name?: string
    readonly icon?: { readonly url?: string; readonly override?: string; readonly color?: string }
    readonly commands?: { readonly start?: string }
    readonly time: { readonly created: number; readonly updated: number; readonly initialized?: number }
    readonly sandboxes: ReadonlyArray<string>
  } | null
}

export type LeanGetInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type LeanGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly scope: { readonly profileID: string; readonly projectID: string; readonly directory: string }
    readonly engine: string
    readonly enabled: boolean
    readonly coverage: "saved-profile-history"
    readonly complete: boolean
    readonly savings: {
      readonly bytesSaved: number | null
      readonly tokensSaved: number | null
      readonly calls: number
      readonly tokenCalls: number
    }
    readonly items: ReadonlyArray<{
      readonly id:
        | "cargo"
        | "go"
        | "pytest"
        | "jest"
        | "vitest"
        | "git"
        | "rg"
        | "tsc"
        | "node"
        | "pnpm"
        | "eslint"
        | "biome"
        | "ruff"
        | "pyright"
        | "pylint"
        | "bun"
        | "esbuild"
        | "golangci"
        | "markdownlint"
        | "mypy"
        | "next"
        | "npm"
        | "pip"
        | "playwright"
        | "prettier"
        | "rollup"
        | "shellcheck"
        | "stylelint"
        | "uv"
        | "vite"
        | "webpack"
        | "yarn"
        | "shell"
        | "read"
        | "webfetch"
        | "glob"
        | "grep"
      readonly enabled: boolean
      readonly savings: {
        readonly bytesSaved: number | null
        readonly tokensSaved: number | null
        readonly calls: number
        readonly tokenCalls: number
      }
    }>
  }
}

export type LeanUpdateInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly itemID?: {
    readonly itemID?:
      | "cargo"
      | "go"
      | "pytest"
      | "jest"
      | "vitest"
      | "git"
      | "rg"
      | "tsc"
      | "node"
      | "pnpm"
      | "eslint"
      | "biome"
      | "ruff"
      | "pyright"
      | "pylint"
      | "bun"
      | "esbuild"
      | "golangci"
      | "markdownlint"
      | "mypy"
      | "next"
      | "npm"
      | "pip"
      | "playwright"
      | "prettier"
      | "rollup"
      | "shellcheck"
      | "stylelint"
      | "uv"
      | "vite"
      | "webpack"
      | "yarn"
      | "shell"
      | "read"
      | "webfetch"
      | "glob"
      | "grep"
      | undefined
    readonly enabled: boolean
  }["itemID"]
  readonly enabled: {
    readonly itemID?:
      | "cargo"
      | "go"
      | "pytest"
      | "jest"
      | "vitest"
      | "git"
      | "rg"
      | "tsc"
      | "node"
      | "pnpm"
      | "eslint"
      | "biome"
      | "ruff"
      | "pyright"
      | "pylint"
      | "bun"
      | "esbuild"
      | "golangci"
      | "markdownlint"
      | "mypy"
      | "next"
      | "npm"
      | "pip"
      | "playwright"
      | "prettier"
      | "rollup"
      | "shellcheck"
      | "stylelint"
      | "uv"
      | "vite"
      | "webpack"
      | "yarn"
      | "shell"
      | "read"
      | "webfetch"
      | "glob"
      | "grep"
      | undefined
    readonly enabled: boolean
  }["enabled"]
}

export type LeanUpdateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly scope: { readonly profileID: string; readonly projectID: string; readonly directory: string }
    readonly engine: string
    readonly enabled: boolean
    readonly coverage: "saved-profile-history"
    readonly complete: boolean
    readonly savings: {
      readonly bytesSaved: number | null
      readonly tokensSaved: number | null
      readonly calls: number
      readonly tokenCalls: number
    }
    readonly items: ReadonlyArray<{
      readonly id:
        | "cargo"
        | "go"
        | "pytest"
        | "jest"
        | "vitest"
        | "git"
        | "rg"
        | "tsc"
        | "node"
        | "pnpm"
        | "eslint"
        | "biome"
        | "ruff"
        | "pyright"
        | "pylint"
        | "bun"
        | "esbuild"
        | "golangci"
        | "markdownlint"
        | "mypy"
        | "next"
        | "npm"
        | "pip"
        | "playwright"
        | "prettier"
        | "rollup"
        | "shellcheck"
        | "stylelint"
        | "uv"
        | "vite"
        | "webpack"
        | "yarn"
        | "shell"
        | "read"
        | "webfetch"
        | "glob"
        | "grep"
      readonly enabled: boolean
      readonly savings: {
        readonly bytesSaved: number | null
        readonly tokensSaved: number | null
        readonly calls: number
        readonly tokenCalls: number
      }
    }>
  }
}

export type LeanHistoryInput = {
  readonly itemID: {
    readonly itemID:
      | "cargo"
      | "go"
      | "pytest"
      | "jest"
      | "vitest"
      | "git"
      | "rg"
      | "tsc"
      | "node"
      | "pnpm"
      | "eslint"
      | "biome"
      | "ruff"
      | "pyright"
      | "pylint"
      | "bun"
      | "esbuild"
      | "golangci"
      | "markdownlint"
      | "mypy"
      | "next"
      | "npm"
      | "pip"
      | "playwright"
      | "prettier"
      | "rollup"
      | "shellcheck"
      | "stylelint"
      | "uv"
      | "vite"
      | "webpack"
      | "yarn"
      | "shell"
      | "read"
      | "webfetch"
      | "glob"
      | "grep"
  }["itemID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type LeanHistoryOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly scope: { readonly profileID: string; readonly projectID: string; readonly directory: string }
    readonly itemID:
      | "cargo"
      | "go"
      | "pytest"
      | "jest"
      | "vitest"
      | "git"
      | "rg"
      | "tsc"
      | "node"
      | "pnpm"
      | "eslint"
      | "biome"
      | "ruff"
      | "pyright"
      | "pylint"
      | "bun"
      | "esbuild"
      | "golangci"
      | "markdownlint"
      | "mypy"
      | "next"
      | "npm"
      | "pip"
      | "playwright"
      | "prettier"
      | "rollup"
      | "shellcheck"
      | "stylelint"
      | "uv"
      | "vite"
      | "webpack"
      | "yarn"
      | "shell"
      | "read"
      | "webfetch"
      | "glob"
      | "grep"
    readonly complete: boolean
    readonly executions: ReadonlyArray<{
      readonly sessionID: string
      readonly messageID: string
      readonly partID: string
      readonly callID: string
      readonly itemID:
        | "cargo"
        | "go"
        | "pytest"
        | "jest"
        | "vitest"
        | "git"
        | "rg"
        | "tsc"
        | "node"
        | "pnpm"
        | "eslint"
        | "biome"
        | "ruff"
        | "pyright"
        | "pylint"
        | "bun"
        | "esbuild"
        | "golangci"
        | "markdownlint"
        | "mypy"
        | "next"
        | "npm"
        | "pip"
        | "playwright"
        | "prettier"
        | "rollup"
        | "shellcheck"
        | "stylelint"
        | "uv"
        | "vite"
        | "webpack"
        | "yarn"
        | "shell"
        | "read"
        | "webfetch"
        | "glob"
        | "grep"
      readonly command: string
      readonly commandTruncated: boolean
      readonly status: "completed" | "error"
      readonly exit: number | null
      readonly time: number
      readonly bytesSaved: number | null
      readonly tokensSaved: number | null
    }>
  }
}

export type AtlasSnapshotInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AtlasSnapshotOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly project: string
        readonly head: string
        readonly builtAt: string
        readonly gen: number
        readonly stagingGen: number
        readonly identity: string | null
        readonly casObjects: number
        readonly policy: { readonly [x: string]: ReadonlyArray<string> }
        readonly t0Keywords: ReadonlyArray<string>
        readonly scip: boolean
        readonly tracked: {
          readonly projection: boolean
          readonly cas: number
          readonly staging: boolean
          readonly policy: boolean
          readonly memory: boolean
        }
        readonly sealed: number
        readonly casAudit: {
          readonly objects: number
          readonly referenced: number
          readonly missing: number
          readonly orphan: number
        }
        readonly generations: ReadonlyArray<string>
        readonly abstained: number
        readonly langs: { readonly [x: string]: number }
        readonly facts: ReadonlyArray<{
          readonly key: string
          readonly hash: string
          readonly claim: string
          readonly file: string
          readonly family: string
          readonly tier: string
          readonly scope: string
          readonly derivedAt: string
          readonly subtree: string
          readonly obvious: string | null
          readonly promoted: boolean
          readonly why: string | null
          readonly kind: string | null
          readonly authoring: string | null
          readonly storedFreshness: string | null
          readonly obviousBy: string | null
          readonly anchor: { readonly kind: string; readonly qualifiedPath: string } | null
          readonly slot: string | null
          readonly seal: string | null
          readonly supersededBy: string | null
          readonly sameAs: ReadonlyArray<string> | null
          readonly provenance: {
            readonly [x: string]: { readonly source: string; readonly trusted: boolean; readonly sha?: string | null }
          } | null
          readonly drift?: {
            readonly hunks: ReadonlyArray<{ readonly at: string; readonly lines: ReadonlyArray<string> }>
            readonly stat: string
            readonly commits: ReadonlyArray<readonly [string, string]>
          } | null
        }>
        readonly candidates: ReadonlyArray<{
          readonly key: string
          readonly hash: string
          readonly claim: string
          readonly file: string
          readonly family: string
          readonly tier: string
          readonly scope: string
          readonly derivedAt: string
          readonly subtree: string
          readonly obvious: string | null
          readonly promoted: boolean
          readonly why: string | null
          readonly kind: string | null
          readonly authoring: string | null
          readonly storedFreshness: string | null
          readonly obviousBy: string | null
          readonly anchor: { readonly kind: string; readonly qualifiedPath: string } | null
          readonly slot: string | null
          readonly seal: string | null
          readonly supersededBy: string | null
          readonly sameAs: ReadonlyArray<string> | null
          readonly provenance: {
            readonly [x: string]: { readonly source: string; readonly trusted: boolean; readonly sha?: string | null }
          } | null
          readonly drift?: {
            readonly hunks: ReadonlyArray<{ readonly at: string; readonly lines: ReadonlyArray<string> }>
            readonly stat: string
            readonly commits: ReadonlyArray<readonly [string, string]>
          } | null
        }>
        readonly dependents: { readonly [x: string]: ReadonlyArray<string> }
        readonly dependentCount: { readonly [x: string]: number }
        readonly children: { readonly [x: string]: ReadonlyArray<string> }
        readonly own: {
          readonly status: "READY" | "HOLD"
          readonly reason: string | null
          readonly snapshot: string | null
          readonly sourceRevision: string | null
          readonly sourcePaths: ReadonlyArray<string>
          readonly units: ReadonlyArray<JsonValue>
          readonly coverage: {
            readonly snapshot: string
            readonly sourceRevision: string
            readonly units: ReadonlyArray<string>
          } | null
          readonly skills: ReadonlyArray<{ readonly path: string; readonly size: number; readonly head: string }>
        } | null
        readonly memory: {
          readonly [x: string]: ReadonlyArray<{
            readonly eventId: string
            readonly seq: number
            readonly member: string
            readonly kind: string
            readonly text: string
            readonly scope: string | null
            readonly at: string | null
            readonly refs: ReadonlyArray<string>
            readonly entry: JsonValue
          }>
        }
        readonly orientation: ReadonlyArray<{
          readonly eventId: string
          readonly seq: number
          readonly channel: string
          readonly label: string
          readonly supersedes: ReadonlyArray<string>
        }>
        readonly territories: ReadonlyArray<{
          readonly name: string
          readonly owner: string
          readonly tier: string
          readonly globs: ReadonlyArray<string>
        }>
      }
}

export type AtlasReasoningInput = {
  readonly id: { readonly id: string }["id"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AtlasReasoningOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | { readonly state: "ok"; readonly id: string; readonly text: string }
    | { readonly state: "missing"; readonly id: string }
}

export type AtlasOwnInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly scope: string
  }["location"]
  readonly scope: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly scope: string
  }["scope"]
}

export type AtlasOwnOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly scope: string
        readonly tool: string
        readonly pack: JsonValue
        readonly readRefusal: string | null
      }
}

export type AtlasHealthInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AtlasHealthOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly actor: string
        readonly provenance: "trusted" | "tracked-staging" | "tracked-provable"
        readonly readRefusal: string | null
        readonly readAdvisory: string | null
        readonly cas: {
          readonly objects: number
          readonly corrupt: ReadonlyArray<string>
          readonly unreadable: ReadonlyArray<string>
          readonly missing: ReadonlyArray<string>
          readonly orphan: number
          readonly referenced: number
          readonly sound: boolean
        }
        readonly proofs: {
          readonly sealedProven: number
          readonly reProven: number
          readonly broken: number
          readonly unverifiable: number
          readonly dangling: number
        }
        readonly index: {
          readonly scipRel: string
          readonly scip:
            | { readonly kind: "absent" }
            | { readonly kind: "unreadable"; readonly reason: string }
            | { readonly kind: "present"; readonly documents: number }
          readonly configured: ReadonlyArray<{
            readonly plan: {
              readonly lang: string
              readonly tool: string
              readonly args: ReadonlyArray<string>
              readonly version?: string | null
            }
            readonly files: number
          }>
          readonly holes: ReadonlyArray<{
            readonly plan: {
              readonly lang: string
              readonly tool: string
              readonly args: ReadonlyArray<string>
              readonly version?: string | null
            }
            readonly files: number
          }>
        }
        readonly hotSet: number
      }
}

export type AtlasPromoteInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly token?: {
    readonly token?: string | undefined
    readonly nodeKeys?: ReadonlyArray<string> | undefined
  }["token"]
  readonly nodeKeys?: {
    readonly token?: string | undefined
    readonly nodeKeys?: ReadonlyArray<string> | undefined
  }["nodeKeys"]
}

export type AtlasPromoteOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly read: boolean
        readonly refusal?: "contended" | "unreadable" | "untrusted" | null
        readonly candidates: number
        readonly promoted: number
        readonly refused: number
        readonly rows: ReadonlyArray<{
          readonly nodeKey: string
          readonly settled: boolean
          readonly id?: string | null
          readonly rejected?: string | null
        }>
        readonly held?: ReadonlyArray<string> | null
        readonly unknown?: ReadonlyArray<string> | null
      }
}

export type AtlasDraftInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly anchor: {
    readonly anchor: string
    readonly slot: string
    readonly claim: string
    readonly supersede?: boolean | undefined
    readonly token?: string | undefined
  }["anchor"]
  readonly slot: {
    readonly anchor: string
    readonly slot: string
    readonly claim: string
    readonly supersede?: boolean | undefined
    readonly token?: string | undefined
  }["slot"]
  readonly claim: {
    readonly anchor: string
    readonly slot: string
    readonly claim: string
    readonly supersede?: boolean | undefined
    readonly token?: string | undefined
  }["claim"]
  readonly supersede?: {
    readonly anchor: string
    readonly slot: string
    readonly claim: string
    readonly supersede?: boolean | undefined
    readonly token?: string | undefined
  }["supersede"]
  readonly token?: {
    readonly anchor: string
    readonly slot: string
    readonly claim: string
    readonly supersede?: boolean | undefined
    readonly token?: string | undefined
  }["token"]
}

export type AtlasDraftOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: {
          readonly draft: {
            readonly fact: JsonValue
            readonly rev: string
            readonly operation: "CREATE" | "UPDATE"
            readonly route: "auto-accept" | "full-ratify"
            readonly requires?: string | null
          }
          readonly check: {
            readonly wouldEmit: boolean
            readonly gates: ReadonlyArray<{
              readonly gate: "shape" | "truth" | "authz" | "ratify"
              readonly pass: boolean
              readonly reason?: string | null
              readonly remedy?: string | null
            }>
          } | null
        } | null
      }
}

export type AtlasEmitInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly fact: { readonly fact: unknown; readonly at: string; readonly token?: string | undefined }["fact"]
  readonly at: { readonly fact: unknown; readonly at: string; readonly token?: string | undefined }["at"]
  readonly token?: { readonly fact: unknown; readonly at: string; readonly token?: string | undefined }["token"]
}

export type AtlasEmitOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: {
          readonly emitted: boolean
          readonly id?: string | null
          readonly nodeKey?: string | null
          readonly rejected?: string | null
        } | null
      }
}

export type AtlasLinkInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly a: {
    readonly a: string
    readonly b: string
    readonly retract?: boolean | undefined
    readonly token?: string | undefined
  }["a"]
  readonly b: {
    readonly a: string
    readonly b: string
    readonly retract?: boolean | undefined
    readonly token?: string | undefined
  }["b"]
  readonly retract?: {
    readonly a: string
    readonly b: string
    readonly retract?: boolean | undefined
    readonly token?: string | undefined
  }["retract"]
  readonly token?: {
    readonly a: string
    readonly b: string
    readonly retract?: boolean | undefined
    readonly token?: string | undefined
  }["token"]
}

export type AtlasLinkOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: {
          readonly linked: boolean
          readonly rejected?: string | null
          readonly a?: string | null
          readonly b?: string | null
          readonly retracted?: boolean | null
        } | null
      }
}

export type AtlasVerifyInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly kind: {
    readonly kind: string
    readonly target: string
    readonly scope: string
    readonly world?: string | undefined
    readonly min?: number | undefined
    readonly exact?: boolean | undefined
  }["kind"]
  readonly target: {
    readonly kind: string
    readonly target: string
    readonly scope: string
    readonly world?: string | undefined
    readonly min?: number | undefined
    readonly exact?: boolean | undefined
  }["target"]
  readonly scope: {
    readonly kind: string
    readonly target: string
    readonly scope: string
    readonly world?: string | undefined
    readonly min?: number | undefined
    readonly exact?: boolean | undefined
  }["scope"]
  readonly world?: {
    readonly kind: string
    readonly target: string
    readonly scope: string
    readonly world?: string | undefined
    readonly min?: number | undefined
    readonly exact?: boolean | undefined
  }["world"]
  readonly min?: {
    readonly kind: string
    readonly target: string
    readonly scope: string
    readonly world?: string | undefined
    readonly min?: number | undefined
    readonly exact?: boolean | undefined
  }["min"]
  readonly exact?: {
    readonly kind: string
    readonly target: string
    readonly scope: string
    readonly world?: string | undefined
    readonly min?: number | undefined
    readonly exact?: boolean | undefined
  }["exact"]
}

export type AtlasVerifyOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: {
          readonly kind: "dependency" | "count" | "definition" | "negation"
          readonly verdict: "proven" | "refuted" | "abstain"
          readonly reason?: string | null
          readonly oracle: string
          readonly target: string
          readonly scope: string
        } | null
      }
}

export type AtlasReviewInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AtlasReviewOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly unreadable: boolean
        readonly held: ReadonlyArray<string>
        readonly proposals: ReadonlyArray<{
          readonly id: string
          readonly nodeKey: string
          readonly toTier: "T1" | "T0"
          readonly reason: string
          readonly by: string
          readonly at: string
        }>
        readonly memoryProposals: ReadonlyArray<{
          readonly id: string
          readonly member: string
          readonly rule: string
          readonly scope: string
          readonly by: string
          readonly at: string
        }>
        readonly interview: {
          readonly batch: ReadonlyArray<{
            readonly id: string
            readonly kind: "owner" | "tier" | "contested" | "intent"
            readonly subject: string
            readonly ask: string
            readonly rank: number
            readonly site: string
            readonly options: ReadonlyArray<string> | null
            readonly nodeKey: string | null
            readonly draft: {
              readonly answer: string
              readonly model: string
              readonly why: string
              readonly by: string
              readonly at: string
            } | null
          }>
          readonly deferred: number
        }
      }
}

export type AtlasHoldInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly nodeKey: { readonly nodeKey: string }["nodeKey"]
}

export type AtlasHoldOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: { readonly id: string } | null
      }
}

export type AtlasReleaseInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly nodeKey: { readonly nodeKey: string }["nodeKey"]
}

export type AtlasReleaseOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: { readonly id: string } | null
      }
}

export type AtlasProposeInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly nodeKey: { readonly nodeKey: string; readonly toTier: "T1" | "T0"; readonly reason: string }["nodeKey"]
  readonly toTier: { readonly nodeKey: string; readonly toTier: "T1" | "T0"; readonly reason: string }["toTier"]
  readonly reason: { readonly nodeKey: string; readonly toTier: "T1" | "T0"; readonly reason: string }["reason"]
}

export type AtlasProposeOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: { readonly id: string } | null
      }
}

export type AtlasDecideInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly proposalId: {
    readonly proposalId: string
    readonly verdict: "ratified" | "rejected"
    readonly reason: string
    readonly token?: string | undefined
  }["proposalId"]
  readonly verdict: {
    readonly proposalId: string
    readonly verdict: "ratified" | "rejected"
    readonly reason: string
    readonly token?: string | undefined
  }["verdict"]
  readonly reason: {
    readonly proposalId: string
    readonly verdict: "ratified" | "rejected"
    readonly reason: string
    readonly token?: string | undefined
  }["reason"]
  readonly token?: {
    readonly proposalId: string
    readonly verdict: "ratified" | "rejected"
    readonly reason: string
    readonly token?: string | undefined
  }["token"]
}

export type AtlasDecideOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: { readonly id: string } | null
      }
}

export type AtlasAnswerInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly questionId: {
    readonly questionId: string
    readonly answer: string
    readonly drafted?: { readonly model: string; readonly why: string } | undefined
  }["questionId"]
  readonly answer: {
    readonly questionId: string
    readonly answer: string
    readonly drafted?: { readonly model: string; readonly why: string } | undefined
  }["answer"]
  readonly drafted?: {
    readonly questionId: string
    readonly answer: string
    readonly drafted?: { readonly model: string; readonly why: string } | undefined
  }["drafted"]
}

export type AtlasAnswerOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: { readonly id: string } | null
      }
}

export type AtlasMemoryDecideInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly proposalId: {
    readonly proposalId: string
    readonly verdict: "indexed" | "discarded"
    readonly rule?: string | undefined
    readonly scope?: string | undefined
  }["proposalId"]
  readonly verdict: {
    readonly proposalId: string
    readonly verdict: "indexed" | "discarded"
    readonly rule?: string | undefined
    readonly scope?: string | undefined
  }["verdict"]
  readonly rule?: {
    readonly proposalId: string
    readonly verdict: "indexed" | "discarded"
    readonly rule?: string | undefined
    readonly scope?: string | undefined
  }["rule"]
  readonly scope?: {
    readonly proposalId: string
    readonly verdict: "indexed" | "discarded"
    readonly rule?: string | undefined
    readonly scope?: string | undefined
  }["scope"]
}

export type AtlasMemoryDecideOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: { readonly id: string } | null
      }
}

export type AtlasTerritoryInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly name: {
    readonly name: string
    readonly owner: string
    readonly tier: "T0" | "T1" | "T2"
    readonly globs: ReadonlyArray<string>
    readonly token?: string | undefined
  }["name"]
  readonly owner: {
    readonly name: string
    readonly owner: string
    readonly tier: "T0" | "T1" | "T2"
    readonly globs: ReadonlyArray<string>
    readonly token?: string | undefined
  }["owner"]
  readonly tier: {
    readonly name: string
    readonly owner: string
    readonly tier: "T0" | "T1" | "T2"
    readonly globs: ReadonlyArray<string>
    readonly token?: string | undefined
  }["tier"]
  readonly globs: {
    readonly name: string
    readonly owner: string
    readonly tier: "T0" | "T1" | "T2"
    readonly globs: ReadonlyArray<string>
    readonly token?: string | undefined
  }["globs"]
  readonly token?: {
    readonly name: string
    readonly owner: string
    readonly tier: "T0" | "T1" | "T2"
    readonly globs: ReadonlyArray<string>
    readonly token?: string | undefined
  }["token"]
}

export type AtlasTerritoryOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ok: boolean
        readonly rejected?: string | null
        readonly guidance: { readonly next: string; readonly invariant: string }
        readonly data?: { readonly id: string } | null
      }
}

export type AtlasDelegateInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly questionIds: {
    readonly questionIds: ReadonlyArray<string>
    readonly providerID: string
    readonly modelID: string
  }["questionIds"]
  readonly providerID: {
    readonly questionIds: ReadonlyArray<string>
    readonly providerID: string
    readonly modelID: string
  }["providerID"]
  readonly modelID: {
    readonly questionIds: ReadonlyArray<string>
    readonly providerID: string
    readonly modelID: string
  }["modelID"]
}

export type AtlasDelegateOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly drafted: ReadonlyArray<{
          readonly questionId: string
          readonly ok: boolean
          readonly rejected: string | null
        }>
      }
}

export type AtlasInstallInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AtlasInstallOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly state: "ok"
    readonly installed: boolean
    readonly refusal: "already-installed" | "no-git" | "no-actor" | null
    readonly actor: string
    readonly scopes: ReadonlyArray<string>
    readonly gitignore: "installed" | "already-present" | "partial-repaired" | "failed" | null
    readonly index: {
      readonly scipRel: string
      readonly scip:
        | { readonly kind: "absent" }
        | { readonly kind: "unreadable"; readonly reason: string }
        | { readonly kind: "present"; readonly documents: number }
      readonly configured: ReadonlyArray<{
        readonly plan: {
          readonly lang: string
          readonly tool: string
          readonly args: ReadonlyArray<string>
          readonly version?: string | null
        }
        readonly files: number
      }>
      readonly holes: ReadonlyArray<{
        readonly plan: {
          readonly lang: string
          readonly tool: string
          readonly args: ReadonlyArray<string>
          readonly version?: string | null
        }
        readonly files: number
      }>
    } | null
  }
}

export type AtlasIndexInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type AtlasIndexOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly ran: boolean
        readonly tool: string | null
        readonly exitCode: number | null
        readonly documents: number | null
        readonly message: string | null
      }
}

export type AtlasMineInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly providerID: { readonly providerID: string; readonly modelID: string; readonly ceiling: number }["providerID"]
  readonly modelID: { readonly providerID: string; readonly modelID: string; readonly ceiling: number }["modelID"]
  readonly ceiling: { readonly providerID: string; readonly modelID: string; readonly ceiling: number }["ceiling"]
}

export type AtlasMineOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data:
    | { readonly state: "empty" }
    | {
        readonly state: "ok"
        readonly sites: number
        readonly facts: number
        readonly complete: boolean
        readonly why: string | null
        readonly refusal: "contended" | "unreadable" | "untrusted" | null
      }
}

export type ConfigGetOutput = {
  readonly model?: string | undefined
  readonly shell?: string | undefined
  readonly agents: { readonly [x: string]: { readonly engine: "orchestra" | "claude-code" } }
  readonly disabledProviders: ReadonlyArray<string>
  readonly permissions: ReadonlyArray<{
    readonly action: string
    readonly resource: string
    readonly effect: "allow" | "deny" | "ask"
  }>
}

export type ConfigUpdateInput = {
  readonly model?: {
    readonly model?: string | undefined
    readonly shell?: string | undefined
    readonly agents?:
      | { readonly [x: string]: { readonly engine?: "orchestra" | "claude-code" | undefined } }
      | undefined
    readonly disabledProviders?: ReadonlyArray<string> | undefined
    readonly providers?:
      | {
          readonly [x: string]: {
            readonly name?: string | undefined
            readonly env?: ReadonlyArray<string> | undefined
            readonly api: { readonly type: "aisdk"; readonly package: string; readonly url?: string | undefined }
            readonly request?: { readonly headers?: { readonly [x: string]: string } | undefined } | undefined
            readonly models?: { readonly [x: string]: { readonly name?: string | undefined } } | undefined
          }
        }
      | undefined
    readonly permissions?:
      | ReadonlyArray<{ readonly action: string; readonly resource: string; readonly effect: "allow" | "deny" | "ask" }>
      | undefined
  }["model"]
  readonly shell?: {
    readonly model?: string | undefined
    readonly shell?: string | undefined
    readonly agents?:
      | { readonly [x: string]: { readonly engine?: "orchestra" | "claude-code" | undefined } }
      | undefined
    readonly disabledProviders?: ReadonlyArray<string> | undefined
    readonly providers?:
      | {
          readonly [x: string]: {
            readonly name?: string | undefined
            readonly env?: ReadonlyArray<string> | undefined
            readonly api: { readonly type: "aisdk"; readonly package: string; readonly url?: string | undefined }
            readonly request?: { readonly headers?: { readonly [x: string]: string } | undefined } | undefined
            readonly models?: { readonly [x: string]: { readonly name?: string | undefined } } | undefined
          }
        }
      | undefined
    readonly permissions?:
      | ReadonlyArray<{ readonly action: string; readonly resource: string; readonly effect: "allow" | "deny" | "ask" }>
      | undefined
  }["shell"]
  readonly agents?: {
    readonly model?: string | undefined
    readonly shell?: string | undefined
    readonly agents?:
      | { readonly [x: string]: { readonly engine?: "orchestra" | "claude-code" | undefined } }
      | undefined
    readonly disabledProviders?: ReadonlyArray<string> | undefined
    readonly providers?:
      | {
          readonly [x: string]: {
            readonly name?: string | undefined
            readonly env?: ReadonlyArray<string> | undefined
            readonly api: { readonly type: "aisdk"; readonly package: string; readonly url?: string | undefined }
            readonly request?: { readonly headers?: { readonly [x: string]: string } | undefined } | undefined
            readonly models?: { readonly [x: string]: { readonly name?: string | undefined } } | undefined
          }
        }
      | undefined
    readonly permissions?:
      | ReadonlyArray<{ readonly action: string; readonly resource: string; readonly effect: "allow" | "deny" | "ask" }>
      | undefined
  }["agents"]
  readonly disabledProviders?: {
    readonly model?: string | undefined
    readonly shell?: string | undefined
    readonly agents?:
      | { readonly [x: string]: { readonly engine?: "orchestra" | "claude-code" | undefined } }
      | undefined
    readonly disabledProviders?: ReadonlyArray<string> | undefined
    readonly providers?:
      | {
          readonly [x: string]: {
            readonly name?: string | undefined
            readonly env?: ReadonlyArray<string> | undefined
            readonly api: { readonly type: "aisdk"; readonly package: string; readonly url?: string | undefined }
            readonly request?: { readonly headers?: { readonly [x: string]: string } | undefined } | undefined
            readonly models?: { readonly [x: string]: { readonly name?: string | undefined } } | undefined
          }
        }
      | undefined
    readonly permissions?:
      | ReadonlyArray<{ readonly action: string; readonly resource: string; readonly effect: "allow" | "deny" | "ask" }>
      | undefined
  }["disabledProviders"]
  readonly providers?: {
    readonly model?: string | undefined
    readonly shell?: string | undefined
    readonly agents?:
      | { readonly [x: string]: { readonly engine?: "orchestra" | "claude-code" | undefined } }
      | undefined
    readonly disabledProviders?: ReadonlyArray<string> | undefined
    readonly providers?:
      | {
          readonly [x: string]: {
            readonly name?: string | undefined
            readonly env?: ReadonlyArray<string> | undefined
            readonly api: { readonly type: "aisdk"; readonly package: string; readonly url?: string | undefined }
            readonly request?: { readonly headers?: { readonly [x: string]: string } | undefined } | undefined
            readonly models?: { readonly [x: string]: { readonly name?: string | undefined } } | undefined
          }
        }
      | undefined
    readonly permissions?:
      | ReadonlyArray<{ readonly action: string; readonly resource: string; readonly effect: "allow" | "deny" | "ask" }>
      | undefined
  }["providers"]
  readonly permissions?: {
    readonly model?: string | undefined
    readonly shell?: string | undefined
    readonly agents?:
      | { readonly [x: string]: { readonly engine?: "orchestra" | "claude-code" | undefined } }
      | undefined
    readonly disabledProviders?: ReadonlyArray<string> | undefined
    readonly providers?:
      | {
          readonly [x: string]: {
            readonly name?: string | undefined
            readonly env?: ReadonlyArray<string> | undefined
            readonly api: { readonly type: "aisdk"; readonly package: string; readonly url?: string | undefined }
            readonly request?: { readonly headers?: { readonly [x: string]: string } | undefined } | undefined
            readonly models?: { readonly [x: string]: { readonly name?: string | undefined } } | undefined
          }
        }
      | undefined
    readonly permissions?:
      | ReadonlyArray<{ readonly action: string; readonly resource: string; readonly effect: "allow" | "deny" | "ask" }>
      | undefined
  }["permissions"]
}

export type ConfigUpdateOutput = void

export type ConfigShellsOutput = ReadonlyArray<{
  readonly path: string
  readonly name: string
  readonly acceptable: boolean
}>

export type ServerTrustListOutput = ReadonlyArray<string>

export type ServerTrustApproveInput = { readonly directory: { readonly directory: string }["directory"] }

export type ServerTrustApproveOutput = void

export type ServerTrustRevokeInput = { readonly directory: { readonly directory: string }["directory"] }

export type ServerTrustRevokeOutput = void

export type ServerBoardListInput = { readonly archived?: { readonly archived?: boolean | undefined }["archived"] }

export type ServerBoardListOutput = ReadonlyArray<{
  readonly project: {
    readonly id: string
    readonly key: string
    readonly name: string
    readonly goal: string
    readonly targetDate: number | null
    readonly budgetUsd: number | null
    readonly repoProjectID: string | null
    readonly githubRepo: string | null
    readonly status: "active" | "paused" | "shipped" | "archived"
    readonly pausedReason: string | null
    readonly autoAcceptIntake: boolean
    readonly githubState: "off" | "ok" | "signed_out" | "rate_limited" | "error"
    readonly githubError: string | null
    readonly githubSyncedAt: number | null
  }
  readonly stages: { readonly [x: string]: number }
  readonly openQuestions: number
  readonly health: "on_track" | "at_risk" | "waiting_on_owner" | "paused"
  readonly forecast: {
    readonly shipped: number
    readonly remaining: number
    readonly targetDate: number | null
    readonly forecast:
      | { readonly kind: "done" }
      | { readonly kind: "waits"; readonly on: string }
      | { readonly kind: "insufficient"; readonly shipped: number; readonly needed: number }
      | {
          readonly kind: "dates"
          readonly p50: number
          readonly p85: number
          readonly vsTarget: { readonly p50: number; readonly p85: number } | null
        }
  }
}>

export type ServerBoardGetInput = { readonly key: { readonly key: string }["key"] }

export type ServerBoardGetOutput = {
  readonly project: {
    readonly id: string
    readonly key: string
    readonly name: string
    readonly goal: string
    readonly targetDate: number | null
    readonly budgetUsd: number | null
    readonly repoProjectID: string | null
    readonly githubRepo: string | null
    readonly status: "active" | "paused" | "shipped" | "archived"
    readonly pausedReason: string | null
    readonly autoAcceptIntake: boolean
    readonly githubState: "off" | "ok" | "signed_out" | "rate_limited" | "error"
    readonly githubError: string | null
    readonly githubSyncedAt: number | null
  }
  readonly epics: ReadonlyArray<{
    readonly id: string
    readonly number: number
    readonly ref: string
    readonly title: string
    readonly goal: string
    readonly position: number
    readonly status: "open" | "shipped" | "cut"
    readonly githubMilestone: number | null
  }>
  readonly issues: ReadonlyArray<{
    readonly id: string
    readonly number: number
    readonly ref: string
    readonly epic: number | null
    readonly title: string
    readonly body: string
    readonly type: "feature" | "bug" | "chore"
    readonly stage: "intake" | "backlog" | "ready" | "building" | "review" | "shipped" | "cut"
    readonly position: number
    readonly estimate: ("s" | "m" | "l") | null
    readonly seat: string | null
    readonly sessionID: string | null
    readonly branch: string | null
    readonly prNumber: number | null
    readonly holdBeforeMerge: boolean
    readonly paused: boolean
    readonly stageEnteredAt: number
    readonly githubNumber: number | null
    readonly steps: ReadonlyArray<{
      readonly title: string
      readonly status: "pending" | "active" | "done" | "skipped"
      readonly now: string | null
    }>
    readonly dependsOn: ReadonlyArray<string>
  }>
  readonly questions: ReadonlyArray<{
    readonly id: string
    readonly issue: number | null
    readonly epic: number | null
    readonly text: string
    readonly options: ReadonlyArray<{ readonly id: string; readonly label: string; readonly consequence: string }>
    readonly recommended: string
    readonly costOfWaiting: string | null
    readonly blocking: boolean
    readonly status: "open" | "answered" | "withdrawn"
    readonly answerOption: string | null
    readonly answerText: string | null
    readonly answeredAt: number | null
    readonly timeCreated: number
  }>
  readonly cursor: string | null
  readonly forecast: {
    readonly shipped: number
    readonly remaining: number
    readonly targetDate: number | null
    readonly forecast:
      | { readonly kind: "done" }
      | { readonly kind: "waits"; readonly on: string }
      | { readonly kind: "insufficient"; readonly shipped: number; readonly needed: number }
      | {
          readonly kind: "dates"
          readonly p50: number
          readonly p85: number
          readonly vsTarget: { readonly p50: number; readonly p85: number } | null
        }
  }
  readonly epicForecasts: ReadonlyArray<{
    readonly epic: number
    readonly ref: string
    readonly shipped: number
    readonly remaining: number
    readonly forecast:
      | { readonly kind: "done" }
      | { readonly kind: "waits"; readonly on: string }
      | { readonly kind: "insufficient"; readonly shipped: number; readonly needed: number }
      | {
          readonly kind: "dates"
          readonly p50: number
          readonly p85: number
          readonly vsTarget: { readonly p50: number; readonly p85: number } | null
        }
    readonly setsDate: boolean
  }>
  readonly scope: ReadonlyArray<{
    readonly at: number
    readonly scope: number
    readonly shipped: number
    readonly reason: string | null
  }>
}

export type ServerBoardIssueInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
}

export type ServerBoardIssueOutput = {
  readonly issue: {
    readonly id: string
    readonly number: number
    readonly ref: string
    readonly epic: number | null
    readonly title: string
    readonly body: string
    readonly type: "feature" | "bug" | "chore"
    readonly stage: "intake" | "backlog" | "ready" | "building" | "review" | "shipped" | "cut"
    readonly position: number
    readonly estimate: ("s" | "m" | "l") | null
    readonly seat: string | null
    readonly sessionID: string | null
    readonly branch: string | null
    readonly prNumber: number | null
    readonly holdBeforeMerge: boolean
    readonly paused: boolean
    readonly stageEnteredAt: number
    readonly githubNumber: number | null
    readonly steps: ReadonlyArray<{
      readonly title: string
      readonly status: "pending" | "active" | "done" | "skipped"
      readonly now: string | null
    }>
    readonly dependsOn: ReadonlyArray<string>
  }
  readonly questions: ReadonlyArray<{
    readonly id: string
    readonly issue: number | null
    readonly epic: number | null
    readonly text: string
    readonly options: ReadonlyArray<{ readonly id: string; readonly label: string; readonly consequence: string }>
    readonly recommended: string
    readonly costOfWaiting: string | null
    readonly blocking: boolean
    readonly status: "open" | "answered" | "withdrawn"
    readonly answerOption: string | null
    readonly answerText: string | null
    readonly answeredAt: number | null
    readonly timeCreated: number
  }>
  readonly notes: ReadonlyArray<{
    readonly id: string
    readonly issue: number
    readonly author: string
    readonly body: string
    readonly timeCreated: number
  }>
  readonly attachments: ReadonlyArray<{
    readonly id: string
    readonly issue: number
    readonly kind: "file" | "image" | "video" | "doc" | "secret"
    readonly name: string
    readonly mime: string | null
    readonly size: number | null
    readonly timeCreated: number
  }>
  readonly activity: ReadonlyArray<{
    readonly id: string
    readonly issue: number | null
    readonly actor: "maestro" | "owner" | "github"
    readonly action:
      | "project.upsert"
      | "epic.upsert"
      | "issue.create"
      | "issue.update"
      | "issue.move"
      | "steps.set"
      | "question.ask"
      | "question.withdraw"
      | "question.answer"
      | "note.add"
      | "note.edit"
      | "note.delete"
      | "attachment.add"
      | "attachment.remove"
      | "intake.accept"
      | "intake.decline"
      | "hold.set"
      | "pause.set"
      | "archive.set"
      | "github.overwrite"
      | "github.state"
      | "undo"
    readonly reason: string | null
    readonly before: { readonly [x: string]: JsonValue } | null
    readonly after: { readonly [x: string]: JsonValue } | null
    readonly undoes: string | null
    readonly undoneBy: string | null
    readonly timeCreated: number
  }>
  readonly dependencies: { readonly dependsOn: ReadonlyArray<string>; readonly blocks: ReadonlyArray<string> }
  readonly trail:
    | { readonly state: "none"; readonly branch: string | null }
    | { readonly state: "signed_out"; readonly message: string }
    | { readonly state: "error"; readonly message: string }
    | {
        readonly state: "ok"
        readonly branch: string
        readonly pr: {
          readonly number: number
          readonly title: string
          readonly url: string
          readonly state: string
          readonly merged: boolean
          readonly branch: string
          readonly reviewDecision: string | null
          readonly mergeCommit: string | null
          readonly commits: ReadonlyArray<{ readonly hash: string; readonly message: string }>
          readonly checks: ReadonlyArray<{
            readonly name: string
            readonly status: string
            readonly conclusion: string | null
          }>
        }
        readonly verifiedAt?: number
        readonly commits: ReadonlyArray<{
          readonly hash: string
          readonly message: string
          readonly seat: string | null
        }>
      }
}

export type ServerBoardActivityInput = {
  readonly key: { readonly key: string }["key"]
  readonly since?: { readonly since?: string | undefined }["since"]
}

export type ServerBoardActivityOutput = ReadonlyArray<{
  readonly id: string
  readonly issue: number | null
  readonly actor: "maestro" | "owner" | "github"
  readonly action:
    | "project.upsert"
    | "epic.upsert"
    | "issue.create"
    | "issue.update"
    | "issue.move"
    | "steps.set"
    | "question.ask"
    | "question.withdraw"
    | "question.answer"
    | "note.add"
    | "note.edit"
    | "note.delete"
    | "attachment.add"
    | "attachment.remove"
    | "intake.accept"
    | "intake.decline"
    | "hold.set"
    | "pause.set"
    | "archive.set"
    | "github.overwrite"
    | "github.state"
    | "undo"
  readonly reason: string | null
  readonly before: { readonly [x: string]: unknown } | null
  readonly after: { readonly [x: string]: unknown } | null
  readonly undoes: string | null
  readonly undoneBy: string | null
  readonly timeCreated: number
}>

export type ServerBoardAnswerInput = {
  readonly key: { readonly key: string; readonly id: string }["key"]
  readonly id: { readonly key: string; readonly id: string }["id"]
  readonly option: { readonly option: string; readonly text?: string }["option"]
  readonly text?: { readonly option: string; readonly text?: string }["text"]
}

export type ServerBoardAnswerOutput = { readonly activity: string }

export type ServerBoardNoteInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
  readonly body: { readonly body: string }["body"]
}

export type ServerBoardNoteOutput = { readonly activity: string }

export type ServerBoardNoteEditInput = {
  readonly key: { readonly key: string; readonly number: string; readonly id: string }["key"]
  readonly number: { readonly key: string; readonly number: string; readonly id: string }["number"]
  readonly id: { readonly key: string; readonly number: string; readonly id: string }["id"]
  readonly body: { readonly body: string }["body"]
}

export type ServerBoardNoteEditOutput = { readonly activity: string }

export type ServerBoardNoteDeleteInput = {
  readonly key: { readonly key: string; readonly number: string; readonly id: string }["key"]
  readonly number: { readonly key: string; readonly number: string; readonly id: string }["number"]
  readonly id: { readonly key: string; readonly number: string; readonly id: string }["id"]
}

export type ServerBoardNoteDeleteOutput = { readonly activity: string }

export type ServerBoardAttachInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
  readonly kind: {
    readonly kind: "file" | "image" | "video" | "doc" | "secret"
    readonly name: string
    readonly mime?: string
    readonly data?: string
    readonly value?: string
  }["kind"]
  readonly name: {
    readonly kind: "file" | "image" | "video" | "doc" | "secret"
    readonly name: string
    readonly mime?: string
    readonly data?: string
    readonly value?: string
  }["name"]
  readonly mime?: {
    readonly kind: "file" | "image" | "video" | "doc" | "secret"
    readonly name: string
    readonly mime?: string
    readonly data?: string
    readonly value?: string
  }["mime"]
  readonly data?: {
    readonly kind: "file" | "image" | "video" | "doc" | "secret"
    readonly name: string
    readonly mime?: string
    readonly data?: string
    readonly value?: string
  }["data"]
  readonly value?: {
    readonly kind: "file" | "image" | "video" | "doc" | "secret"
    readonly name: string
    readonly mime?: string
    readonly data?: string
    readonly value?: string
  }["value"]
}

export type ServerBoardAttachOutput = { readonly activity: string }

export type ServerBoardAttachmentRemoveInput = {
  readonly key: { readonly key: string; readonly number: string; readonly id: string }["key"]
  readonly number: { readonly key: string; readonly number: string; readonly id: string }["number"]
  readonly id: { readonly key: string; readonly number: string; readonly id: string }["id"]
}

export type ServerBoardAttachmentRemoveOutput = { readonly activity: string }

export type ServerBoardUndoInput = {
  readonly key: { readonly key: string; readonly id: string }["key"]
  readonly id: { readonly key: string; readonly id: string }["id"]
}

export type ServerBoardUndoOutput = { readonly activity: string }

export type ServerBoardSpendInput = { readonly key: { readonly key: string }["key"] }

export type ServerBoardSpendOutput = {
  readonly project: {
    readonly models:
      | { readonly kind: "usd"; readonly usd: number }
      | { readonly kind: "not-metered"; readonly source: string }
    readonly infra:
      | { readonly kind: "usd"; readonly usd: number }
      | { readonly kind: "not-metered"; readonly source: string }
    readonly byModel: ReadonlyArray<{ readonly model: string; readonly usd: number }>
    readonly usd: number
    readonly partial: boolean
  }
  readonly budget: {
    readonly budgetUsd: number | null
    readonly spentUsd: number
    readonly percent: number | null
    readonly state: "none" | "ok" | "warn" | "paused"
    readonly forecastUsd: number | null
    readonly forecastPercent: number | null
  }
  readonly cards: ReadonlyArray<{
    readonly models:
      | { readonly kind: "usd"; readonly usd: number }
      | { readonly kind: "not-metered"; readonly source: string }
    readonly infra:
      | { readonly kind: "usd"; readonly usd: number }
      | { readonly kind: "not-metered"; readonly source: string }
    readonly byModel: ReadonlyArray<{ readonly model: string; readonly usd: number }>
    readonly usd: number
    readonly partial: boolean
    readonly issue: number
    readonly ref: string
    readonly epic: number | null
    readonly seat: string | null
    readonly flagged: boolean
    readonly epicMedianUsd: number | null
  }>
  readonly epics: ReadonlyArray<{
    readonly models:
      | { readonly kind: "usd"; readonly usd: number }
      | { readonly kind: "not-metered"; readonly source: string }
    readonly infra:
      | { readonly kind: "usd"; readonly usd: number }
      | { readonly kind: "not-metered"; readonly source: string }
    readonly byModel: ReadonlyArray<{ readonly model: string; readonly usd: number }>
    readonly usd: number
    readonly partial: boolean
    readonly epic: number
    readonly ref: string
  }>
  readonly seats: ReadonlyArray<{
    readonly models:
      | { readonly kind: "usd"; readonly usd: number }
      | { readonly kind: "not-metered"; readonly source: string }
    readonly infra:
      | { readonly kind: "usd"; readonly usd: number }
      | { readonly kind: "not-metered"; readonly source: string }
    readonly byModel: ReadonlyArray<{ readonly model: string; readonly usd: number }>
    readonly usd: number
    readonly partial: boolean
    readonly seat: string
  }>
  readonly infraSyncedAt: number | null
}

export type ServerBoardDecisionsInput = { readonly key: { readonly key: string }["key"] }

export type ServerBoardDecisionsOutput = ReadonlyArray<{
  readonly id: string
  readonly issue: number | null
  readonly epic: number | null
  readonly date: number
  readonly question: string
  readonly options: ReadonlyArray<{ readonly id: string; readonly label: string; readonly consequence: string }>
  readonly recommended: string
  readonly chosen: string
  readonly chosenLabel: string
  readonly text: string | null
  readonly answeredBy: "maestro" | "owner" | "github"
  readonly outcome: string
  readonly outcomeAt: number | null
  readonly supersedes: string | null
  readonly overturnedBy: string | null
}>

export type ServerBoardDecisionChangeInput = {
  readonly key: { readonly key: string; readonly id: string }["key"]
  readonly id: { readonly key: string; readonly id: string }["id"]
  readonly option: { readonly option: string; readonly text?: string }["option"]
  readonly text?: { readonly option: string; readonly text?: string }["text"]
}

export type ServerBoardDecisionChangeOutput = { readonly activity: string }

export type ServerBoardProofInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
}

export type ServerBoardProofOutput = {
  readonly issue: number
  readonly ref: string
  readonly banner: string | null
  readonly pr: {
    readonly number: number
    readonly state: string
    readonly merged: boolean
    readonly commits: number
    readonly lastSha: string | null
  } | null
  readonly ci: {
    readonly checks: ReadonlyArray<{
      readonly name: string
      readonly status: string
      readonly conclusion: string | null
    }>
    readonly failing: string | null
  } | null
  readonly attempts: { readonly n: number; readonly of: number }
  readonly guardrail: { readonly rule: string; readonly summary: string | null } | null
  readonly crashReason: string | null
  readonly verifiedAt: number | null
  readonly decidedBy: {
    readonly id: string
    readonly issue: number | null
    readonly epic: number | null
    readonly date: number
    readonly question: string
    readonly options: ReadonlyArray<{ readonly id: string; readonly label: string; readonly consequence: string }>
    readonly recommended: string
    readonly chosen: string
    readonly chosenLabel: string
    readonly text: string | null
    readonly answeredBy: "maestro" | "owner" | "github"
    readonly outcome: string
    readonly outcomeAt: number | null
    readonly supersedes: string | null
    readonly overturnedBy: string | null
  } | null
}

export type ServerBoardSettingsInput = {
  readonly key: { readonly key: string }["key"]
  readonly target_date?: {
    readonly target_date?: number | null
    readonly budget_usd?: number | null
    readonly reason?: string
  }["target_date"]
  readonly budget_usd?: {
    readonly target_date?: number | null
    readonly budget_usd?: number | null
    readonly reason?: string
  }["budget_usd"]
  readonly reason?: {
    readonly target_date?: number | null
    readonly budget_usd?: number | null
    readonly reason?: string
  }["reason"]
}

export type ServerBoardSettingsOutput = { readonly activity: string }

export type ServerBoardPauseInput = {
  readonly key: { readonly key: string }["key"]
  readonly reason?: { readonly reason?: string }["reason"]
}

export type ServerBoardPauseOutput = { readonly activity: string }

export type ServerBoardResumeInput = { readonly key: { readonly key: string }["key"] }

export type ServerBoardResumeOutput = { readonly activity: string }

export type ServerBoardArchiveInput = { readonly key: { readonly key: string }["key"] }

export type ServerBoardArchiveOutput = { readonly activity: string }

export type ServerBoardUnarchiveInput = { readonly key: { readonly key: string }["key"] }

export type ServerBoardUnarchiveOutput = { readonly activity: string }

export type ServerBoardGithubSyncInput = { readonly key: { readonly key: string }["key"] }

export type ServerBoardGithubSyncOutput = {
  readonly state: "off" | "ok" | "signed_out" | "rate_limited" | "error"
  readonly error: string | null
}

export type ServerBoardPauseIssueInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
}

export type ServerBoardPauseIssueOutput = { readonly activity: string }

export type ServerBoardResumeIssueInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
}

export type ServerBoardResumeIssueOutput = { readonly activity: string }

export type ServerBoardHoldInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
  readonly hold: { readonly hold: boolean }["hold"]
}

export type ServerBoardHoldOutput = { readonly activity: string }

export type ServerBoardAcceptInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
}

export type ServerBoardAcceptOutput = { readonly activity: string }

export type ServerBoardDeclineInput = {
  readonly key: { readonly key: string; readonly number: string }["key"]
  readonly number: { readonly key: string; readonly number: string }["number"]
}

export type ServerBoardDeclineOutput = { readonly activity: string }

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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
            readonly knowledge?: ReadonlyArray<string>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
            readonly knowledge?: ReadonlyArray<string>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly knowledge?: ReadonlyArray<string>
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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
            readonly knowledge?: ReadonlyArray<string>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly parameters: { readonly [x: string]: JsonValue }
      readonly typeVersion?: number | "Infinity" | "-Infinity" | "NaN"
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
          readonly gen?: number | "Infinity" | "-Infinity" | "NaN"
          readonly retry_budget?: number
          readonly macros?: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly instructions?: string
          }>
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
            readonly knowledge?: ReadonlyArray<string>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly knowledge?: ReadonlyArray<string>
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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
      readonly knowledge?: ReadonlyArray<string>
      readonly work_packages: ReadonlyArray<{
        readonly id: string
        readonly title?: string
        readonly macro?: string | null
        readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
        readonly instructions?: string
        readonly self_check?: ReadonlyArray<string>
        readonly knowledge?: ReadonlyArray<string>
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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
            readonly knowledge?: ReadonlyArray<string>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly knowledge?: ReadonlyArray<string>
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
          readonly knowledge?: ReadonlyArray<string>
          readonly work_packages: ReadonlyArray<{
            readonly id: string
            readonly title?: string
            readonly macro?: string | null
            readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
            readonly instructions?: string
            readonly self_check?: ReadonlyArray<string>
            readonly knowledge?: ReadonlyArray<string>
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
            readonly knowledge?: ReadonlyArray<string>
            readonly work_packages: ReadonlyArray<{
              readonly id: string
              readonly title?: string
              readonly macro?: string | null
              readonly kind?: "execute" | "gate" | "review" | "inject" | "human"
              readonly instructions?: string
              readonly self_check?: ReadonlyArray<string>
              readonly knowledge?: ReadonlyArray<string>
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
      readonly unpublished?: true
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
    readonly unpublished?: true
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
    readonly unpublished?: true
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
    readonly unpublished?: true
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
    readonly unpublished?: true
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
      readonly unpublished?: true
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
      readonly unpublished?: true
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

export type RelayRunsListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly document?: string | undefined
  }["location"]
  readonly document?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly document?: string | undefined
  }["document"]
}

export type RelayRunsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{
    readonly runID: string
    readonly documentID: string
    readonly version?: string | null
    readonly status: "running" | "parked" | "completed" | "failed"
    readonly position?: string | null
    readonly failing: ReadonlyArray<string>
    readonly reason?: string | null
    readonly label: string
    readonly agent: "langgraph"
    readonly startedAt: number | "Infinity" | "-Infinity" | "NaN"
    readonly endedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
    readonly steps: ReadonlyArray<{
      readonly wp: string
      readonly status: "running" | "passed" | "failed" | "escalated"
      readonly attempts: number | "Infinity" | "-Infinity" | "NaN"
      readonly startedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly endedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly checks: ReadonlyArray<{
        readonly id: string
        readonly verdict: "pass" | "fail" | "advisory"
        readonly output: string
      }>
      readonly note?: string | null
    }>
  }>
}

export type RelayRunsGetInput = {
  readonly runID: { readonly runID: string }["runID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayRunsGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly runID: string
    readonly documentID: string
    readonly version?: string | null
    readonly status: "running" | "parked" | "completed" | "failed"
    readonly position?: string | null
    readonly failing: ReadonlyArray<string>
    readonly reason?: string | null
    readonly label: string
    readonly agent: "langgraph"
    readonly startedAt: number | "Infinity" | "-Infinity" | "NaN"
    readonly endedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
    readonly steps: ReadonlyArray<{
      readonly wp: string
      readonly status: "running" | "passed" | "failed" | "escalated"
      readonly attempts: number | "Infinity" | "-Infinity" | "NaN"
      readonly startedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly endedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly checks: ReadonlyArray<{
        readonly id: string
        readonly verdict: "pass" | "fail" | "advisory"
        readonly output: string
      }>
      readonly note?: string | null
    }>
  }
}

export type RelayRunsAuditInput = {
  readonly runID: { readonly runID: string }["runID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type RelayRunsAuditOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly status: "pass" | "fail" | "pending"
    readonly code: string
    readonly rows: ReadonlyArray<{ readonly label: string; readonly value: string }>
  }
}

export type RelayRunsLedgerInput = {
  readonly runID: { readonly runID: string }["runID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: number | undefined
  }["location"]
  readonly after?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly after?: number | undefined
  }["after"]
}

export type RelayRunsLedgerOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: ReadonlyArray<{ readonly [x: string]: JsonValue }>
}

export type InstallationUpgradeInput = { readonly target: { readonly target: string }["target"] }

export type InstallationUpgradeOutput = { readonly success: true; readonly version: string }

export type GuardrailRulesInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type GuardrailRulesOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly rules: ReadonlyArray<{
      readonly id: string
      readonly group: "tests" | "silenced" | "secrets" | "leftovers" | "dependencies" | "workflows" | "hygiene"
      readonly severity: "gate" | "warn"
      readonly kind: "added-lines" | "changed-paths" | "line-balance"
      readonly message: string
      readonly summary: string | null
      readonly positive: ReadonlyArray<string>
      readonly negative: ReadonlyArray<string>
      readonly paths: ReadonlyArray<string>
      readonly clearedBy: "fix" | "ignore" | "approval"
    }>
    readonly errors: ReadonlyArray<{
      readonly kind: "no-repository" | "base-not-found" | "no-rules" | "rules-invalid" | "other"
      readonly message: string
    }>
  }
}

export type GuardrailRunInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly base?: { readonly base?: string | null }["base"]
}

export type GuardrailRunOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly base: string | null
    readonly bootstrap: boolean
    readonly rules: number
    readonly files: number
    readonly findings: ReadonlyArray<{
      readonly rule: string
      readonly severity: "gate" | "warn"
      readonly path: string
      readonly line: number | null
      readonly message: string
      readonly excerpt: string | null
      readonly match: readonly [number, number] | null
    }>
    readonly errors: ReadonlyArray<{
      readonly kind: "no-repository" | "base-not-found" | "no-rules" | "rules-invalid" | "other"
      readonly message: string
    }>
    readonly approved: ReadonlyArray<string>
    readonly touchesGuards: boolean
  }
}

export type MeetingStartInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly sessionID: {
    readonly sessionID: string
    readonly title: string
    readonly retention?: ("kept" | "ephemeral") | undefined
    readonly consent: "announced" | "not-needed" | "unknown"
  }["sessionID"]
  readonly title: {
    readonly sessionID: string
    readonly title: string
    readonly retention?: ("kept" | "ephemeral") | undefined
    readonly consent: "announced" | "not-needed" | "unknown"
  }["title"]
  readonly retention?: {
    readonly sessionID: string
    readonly title: string
    readonly retention?: ("kept" | "ephemeral") | undefined
    readonly consent: "announced" | "not-needed" | "unknown"
  }["retention"]
  readonly consent: {
    readonly sessionID: string
    readonly title: string
    readonly retention?: ("kept" | "ephemeral") | undefined
    readonly consent: "announced" | "not-needed" | "unknown"
  }["consent"]
}

export type MeetingStartOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly sessionID: string
    readonly title: string
    readonly timeStarted: number | "Infinity" | "-Infinity" | "NaN"
    readonly timeEnded: number | "Infinity" | "-Infinity" | "NaN" | null
  }
}

export type MeetingAppendInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly meetingID: {
    readonly meetingID: string
    readonly segments: ReadonlyArray<{
      readonly id: string
      readonly track: "me" | "them"
      readonly text: string
      readonly startMs: number
      readonly endMs: number
    }>
  }["meetingID"]
  readonly segments: {
    readonly meetingID: string
    readonly segments: ReadonlyArray<{
      readonly id: string
      readonly track: "me" | "them"
      readonly text: string
      readonly startMs: number
      readonly endMs: number
    }>
  }["segments"]
}

export type MeetingAppendOutput = void

export type MeetingStopInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly meetingID: { readonly meetingID: string }["meetingID"]
}

export type MeetingStopOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly sessionID: string
    readonly title: string
    readonly timeStarted: number | "Infinity" | "-Infinity" | "NaN"
    readonly timeEnded: number | "Infinity" | "-Infinity" | "NaN" | null
  }
}

export type MeetingReadInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly meetingID: string
  }["location"]
  readonly meetingID: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly meetingID: string
  }["meetingID"]
}

export type MeetingReadOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly meeting: {
      readonly id: string
      readonly sessionID: string
      readonly title: string
      readonly timeStarted: number | "Infinity" | "-Infinity" | "NaN"
      readonly timeEnded: number | "Infinity" | "-Infinity" | "NaN" | null
    }
    readonly segments: ReadonlyArray<{
      readonly id: string
      readonly track: "me" | "them"
      readonly text: string
      readonly startMs: number | "Infinity" | "-Infinity" | "NaN"
      readonly endMs: number | "Infinity" | "-Infinity" | "NaN"
    }>
    readonly summary: {
      readonly id: string
      readonly title: string
      readonly startedAt: number | "Infinity" | "-Infinity" | "NaN"
      readonly endedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly people: ReadonlyArray<{ readonly id: string; readonly name: string }>
      readonly retention: "kept" | "ephemeral"
      readonly consent: "announced" | "not-needed" | "unknown"
      readonly counts: {
        readonly decisions: number | "Infinity" | "-Infinity" | "NaN"
        readonly commitments: number | "Infinity" | "-Infinity" | "NaN"
        readonly openCommitments: number | "Infinity" | "-Infinity" | "NaN"
        readonly answers: number | "Infinity" | "-Infinity" | "NaN"
      }
    }
    readonly card: {
      readonly status: "pending" | "ready" | "failed"
      readonly error?: string | null
      readonly summary: string
      readonly decisions: ReadonlyArray<{
        readonly id: string
        readonly text: string
        readonly asserter:
          | { readonly id: string; readonly name: string }
          | "me"
          | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
        readonly quote: string
        readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
        readonly status: "claimed" | "confirmed" | "disputed"
        readonly sentToMaestro: boolean
      }>
      readonly commitments: ReadonlyArray<{
        readonly id: string
        readonly text: string
        readonly asserter:
          | { readonly id: string; readonly name: string }
          | "me"
          | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
        readonly quote: string
        readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
        readonly status: "claimed" | "confirmed" | "disputed"
        readonly sentToMaestro: boolean
        readonly owner: { readonly id: string; readonly name: string } | "me"
        readonly counterparty?: { readonly id: string; readonly name: string } | "me" | null
        readonly due?: string | null
        readonly state: "proposed" | "accepted" | "done" | "overdue" | "dropped"
      }>
      readonly questions: ReadonlyArray<{
        readonly id: string
        readonly text: string
        readonly asserter:
          | { readonly id: string; readonly name: string }
          | "me"
          | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
        readonly quote: string
        readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
        readonly status: "claimed" | "confirmed" | "disputed"
        readonly sentToMaestro: boolean
      }>
      readonly suggestions: ReadonlyArray<{
        readonly id: string
        readonly text: string
        readonly asserter:
          | { readonly id: string; readonly name: string }
          | "me"
          | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
        readonly quote: string
        readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
        readonly status: "claimed" | "confirmed" | "disputed"
        readonly sentToMaestro: boolean
        readonly for: "owner" | "maestro"
      }>
      readonly newPeople: ReadonlyArray<{
        readonly proposalID: string
        readonly name: string
        readonly mergeWith?: { readonly id: string; readonly name: string } | null
      }>
    }
  }
}

export type MeetingListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query?: string | undefined
    readonly person?: string | undefined
    readonly limit?: number | undefined
    readonly before?: string | undefined
  }["location"]
  readonly query?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query?: string | undefined
    readonly person?: string | undefined
    readonly limit?: number | undefined
    readonly before?: string | undefined
  }["query"]
  readonly person?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query?: string | undefined
    readonly person?: string | undefined
    readonly limit?: number | undefined
    readonly before?: string | undefined
  }["person"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query?: string | undefined
    readonly person?: string | undefined
    readonly limit?: number | undefined
    readonly before?: string | undefined
  }["limit"]
  readonly before?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly query?: string | undefined
    readonly person?: string | undefined
    readonly limit?: number | undefined
    readonly before?: string | undefined
  }["before"]
}

export type MeetingListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly items: ReadonlyArray<{
      readonly id: string
      readonly title: string
      readonly startedAt: number | "Infinity" | "-Infinity" | "NaN"
      readonly endedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly people: ReadonlyArray<{ readonly id: string; readonly name: string }>
      readonly retention: "kept" | "ephemeral"
      readonly consent: "announced" | "not-needed" | "unknown"
      readonly counts: {
        readonly decisions: number | "Infinity" | "-Infinity" | "NaN"
        readonly commitments: number | "Infinity" | "-Infinity" | "NaN"
        readonly openCommitments: number | "Infinity" | "-Infinity" | "NaN"
        readonly answers: number | "Infinity" | "-Infinity" | "NaN"
      }
    }>
    readonly next?: string | null
  }
}

export type MeetingRenameInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly meetingID: { readonly meetingID: string; readonly title: string }["meetingID"]
  readonly title: { readonly meetingID: string; readonly title: string }["title"]
}

export type MeetingRenameOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly title: string
    readonly startedAt: number | "Infinity" | "-Infinity" | "NaN"
    readonly endedAt?: number | "Infinity" | "-Infinity" | "NaN" | null
    readonly people: ReadonlyArray<{ readonly id: string; readonly name: string }>
    readonly retention: "kept" | "ephemeral"
    readonly consent: "announced" | "not-needed" | "unknown"
    readonly counts: {
      readonly decisions: number | "Infinity" | "-Infinity" | "NaN"
      readonly commitments: number | "Infinity" | "-Infinity" | "NaN"
      readonly openCommitments: number | "Infinity" | "-Infinity" | "NaN"
      readonly answers: number | "Infinity" | "-Infinity" | "NaN"
    }
  }
}

export type MeetingDeleteInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly meetingID: string
  }["location"]
  readonly meetingID: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly meetingID: string
  }["meetingID"]
}

export type MeetingDeleteOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly segments: number | "Infinity" | "-Infinity" | "NaN"
    readonly claims: number | "Infinity" | "-Infinity" | "NaN"
    readonly commitments: number | "Infinity" | "-Infinity" | "NaN"
    readonly people: number | "Infinity" | "-Infinity" | "NaN"
  }
}

export type MeetingConfirmInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly meetingID: {
    readonly meetingID: string
    readonly items?:
      | ReadonlyArray<{ readonly id: string; readonly verdict: "confirmed" | "disputed" | "dismissed" }>
      | undefined
    readonly people?:
      | ReadonlyArray<{ readonly proposalID: string; readonly verdict: "new" | "merge" | "dismissed" }>
      | undefined
  }["meetingID"]
  readonly items?: {
    readonly meetingID: string
    readonly items?:
      | ReadonlyArray<{ readonly id: string; readonly verdict: "confirmed" | "disputed" | "dismissed" }>
      | undefined
    readonly people?:
      | ReadonlyArray<{ readonly proposalID: string; readonly verdict: "new" | "merge" | "dismissed" }>
      | undefined
  }["items"]
  readonly people?: {
    readonly meetingID: string
    readonly items?:
      | ReadonlyArray<{ readonly id: string; readonly verdict: "confirmed" | "disputed" | "dismissed" }>
      | undefined
    readonly people?:
      | ReadonlyArray<{ readonly proposalID: string; readonly verdict: "new" | "merge" | "dismissed" }>
      | undefined
  }["people"]
}

export type MeetingConfirmOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly status: "pending" | "ready" | "failed"
    readonly error?: string | null
    readonly summary: string
    readonly decisions: ReadonlyArray<{
      readonly id: string
      readonly text: string
      readonly asserter:
        | { readonly id: string; readonly name: string }
        | "me"
        | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
      readonly quote: string
      readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly status: "claimed" | "confirmed" | "disputed"
      readonly sentToMaestro: boolean
    }>
    readonly commitments: ReadonlyArray<{
      readonly id: string
      readonly text: string
      readonly asserter:
        | { readonly id: string; readonly name: string }
        | "me"
        | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
      readonly quote: string
      readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly status: "claimed" | "confirmed" | "disputed"
      readonly sentToMaestro: boolean
      readonly owner: { readonly id: string; readonly name: string } | "me"
      readonly counterparty?: { readonly id: string; readonly name: string } | "me" | null
      readonly due?: string | null
      readonly state: "proposed" | "accepted" | "done" | "overdue" | "dropped"
    }>
    readonly questions: ReadonlyArray<{
      readonly id: string
      readonly text: string
      readonly asserter:
        | { readonly id: string; readonly name: string }
        | "me"
        | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
      readonly quote: string
      readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly status: "claimed" | "confirmed" | "disputed"
      readonly sentToMaestro: boolean
    }>
    readonly suggestions: ReadonlyArray<{
      readonly id: string
      readonly text: string
      readonly asserter:
        | { readonly id: string; readonly name: string }
        | "me"
        | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
      readonly quote: string
      readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
      readonly status: "claimed" | "confirmed" | "disputed"
      readonly sentToMaestro: boolean
      readonly for: "owner" | "maestro"
    }>
    readonly newPeople: ReadonlyArray<{
      readonly proposalID: string
      readonly name: string
      readonly mergeWith?: { readonly id: string; readonly name: string } | null
    }>
  }
}

export type MeetingCommitmentInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly id: { readonly id: string; readonly state: "accepted" | "done" | "dropped" }["id"]
  readonly state: { readonly id: string; readonly state: "accepted" | "done" | "dropped" }["state"]
}

export type MeetingCommitmentOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly text: string
    readonly asserter:
      | { readonly id: string; readonly name: string }
      | "me"
      | { readonly unknown: number | "Infinity" | "-Infinity" | "NaN" }
    readonly quote: string
    readonly startMs?: number | "Infinity" | "-Infinity" | "NaN" | null
    readonly status: "claimed" | "confirmed" | "disputed"
    readonly sentToMaestro: boolean
    readonly owner: { readonly id: string; readonly name: string } | "me"
    readonly counterparty?: { readonly id: string; readonly name: string } | "me" | null
    readonly due?: string | null
    readonly state: "proposed" | "accepted" | "done" | "overdue" | "dropped"
  }
}

export type MeetingHandoffInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly meetingID: { readonly meetingID: string; readonly itemIDs: ReadonlyArray<string> }["meetingID"]
  readonly itemIDs: { readonly meetingID: string; readonly itemIDs: ReadonlyArray<string> }["itemIDs"]
}

export type MeetingHandoffOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: { readonly sent: ReadonlyArray<string> }
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
    readonly provider:
      | "slack"
      | "discord"
      | "cloudflare"
      | "supabase"
      | "neon"
      | "linear"
      | "stripe"
      | "openai"
      | "runway"
      | "globalping"
    readonly key: string
    readonly label?: string
  }["provider"]
  readonly key: {
    readonly provider:
      | "slack"
      | "discord"
      | "cloudflare"
      | "supabase"
      | "neon"
      | "linear"
      | "stripe"
      | "openai"
      | "runway"
      | "globalping"
    readonly key: string
    readonly label?: string
  }["key"]
  readonly label?: {
    readonly provider:
      | "slack"
      | "discord"
      | "cloudflare"
      | "supabase"
      | "neon"
      | "linear"
      | "stripe"
      | "openai"
      | "runway"
      | "globalping"
    readonly key: string
    readonly label?: string
  }["label"]
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

export type ArtifactsListInput = {
  readonly sessionID: { readonly sessionID: string }["sessionID"]
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

export type ArtifactsListOutput = {
  readonly items: ReadonlyArray<{
    readonly artifact: { readonly id: string; readonly revision: number }
    readonly mime: string
    readonly kind: string
    readonly hash: string
    readonly bytes: number
    readonly verification: "acknowledged" | "observed" | "verified"
    readonly timeCreated: number
    readonly pinned: boolean
  }>
  readonly after?: string
  readonly coverage: "live"
}

export type ArtifactsGetInput = {
  readonly sessionID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["sessionID"]
  readonly artifactID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["artifactID"]
  readonly revision: { readonly sessionID: string; readonly artifactID: string; readonly revision: string }["revision"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ArtifactsGetOutput = {
  readonly artifact: { readonly id: string; readonly revision: number }
  readonly mime: string
  readonly kind: string
  readonly hash: string
  readonly bytes: number
  readonly verification: "acknowledged" | "observed" | "verified"
  readonly timeCreated: number
  readonly pinned: boolean
}

export type ArtifactsContentTicketInput = {
  readonly sessionID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["sessionID"]
  readonly artifactID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["artifactID"]
  readonly revision: { readonly sessionID: string; readonly artifactID: string; readonly revision: string }["revision"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type ArtifactsContentTicketOutput = { readonly url: string; readonly expiresAt: number }

export type ArtifactsShareInput = {
  readonly sessionID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["sessionID"]
  readonly artifactID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["artifactID"]
  readonly revision: { readonly sessionID: string; readonly artifactID: string; readonly revision: string }["revision"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly targetSessionID: { readonly targetSessionID: string }["targetSessionID"]
}

export type ArtifactsShareOutput = { readonly requestID: string; readonly reused: boolean; readonly data: JsonValue }

export type ArtifactsPinInput = {
  readonly sessionID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["sessionID"]
  readonly artifactID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["artifactID"]
  readonly revision: { readonly sessionID: string; readonly artifactID: string; readonly revision: string }["revision"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
  readonly pinned: { readonly pinned: boolean }["pinned"]
}

export type ArtifactsPinOutput = { readonly requestID: string; readonly reused: boolean; readonly data: JsonValue }

export type ArtifactsRemoveReferenceInput = {
  readonly sessionID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["sessionID"]
  readonly artifactID: {
    readonly sessionID: string
    readonly artifactID: string
    readonly revision: string
  }["artifactID"]
  readonly revision: { readonly sessionID: string; readonly artifactID: string; readonly revision: string }["revision"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
}

export type ArtifactsRemoveReferenceOutput = {
  readonly requestID: string
  readonly reused: boolean
  readonly data: JsonValue
}

export type CapabilitySchedulesListInput = {
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
}

export type CapabilitySchedulesListOutput = {
  readonly items: ReadonlyArray<{
    readonly schedule: {
      readonly id: string
      readonly revision: number
      readonly name: string
      readonly prompt: string
      readonly cadence:
        | { readonly kind: "once"; readonly at: number }
        | { readonly kind: "interval"; readonly minutes: number }
        | { readonly kind: "daily"; readonly time: string }
        | { readonly kind: "weekly"; readonly day: number; readonly time: string }
        | { readonly kind: "cron"; readonly expression: string }
      readonly timezone: string
      readonly catchUp: "latest" | "skip"
      readonly repeat?: number | null
      readonly enabled: boolean
      readonly disabledReason?: "exhausted" | "owner-missing" | null
      readonly next?: number | null
      readonly runs: number
      readonly skipped: number
      readonly last?:
        | (
            | { readonly outcome: "started"; readonly time: number; readonly slot?: number; readonly sessionID: string }
            | { readonly outcome: "failed"; readonly time: number; readonly slot?: number; readonly error: string }
          )
        | null
    }
    readonly sessionID: string
    readonly agentID: string
  }>
  readonly coverage: "live"
}

export type CapabilitySchedulesPauseInput = {
  readonly scheduleID: { readonly scheduleID: string }["scheduleID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
}

export type CapabilitySchedulesPauseOutput = {
  readonly id: string
  readonly revision: number
  readonly name: string
  readonly prompt: string
  readonly cadence:
    | { readonly kind: "once"; readonly at: number }
    | { readonly kind: "interval"; readonly minutes: number }
    | { readonly kind: "daily"; readonly time: string }
    | { readonly kind: "weekly"; readonly day: number; readonly time: string }
    | { readonly kind: "cron"; readonly expression: string }
  readonly timezone: string
  readonly catchUp: "latest" | "skip"
  readonly repeat?: number | null
  readonly enabled: boolean
  readonly disabledReason?: "exhausted" | "owner-missing" | null
  readonly next?: number | null
  readonly runs: number
  readonly skipped: number
  readonly last?:
    | (
        | { readonly outcome: "started"; readonly time: number; readonly slot?: number; readonly sessionID: string }
        | { readonly outcome: "failed"; readonly time: number; readonly slot?: number; readonly error: string }
      )
    | null
}

export type CapabilitySchedulesResumeInput = {
  readonly scheduleID: { readonly scheduleID: string }["scheduleID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
}

export type CapabilitySchedulesResumeOutput = {
  readonly id: string
  readonly revision: number
  readonly name: string
  readonly prompt: string
  readonly cadence:
    | { readonly kind: "once"; readonly at: number }
    | { readonly kind: "interval"; readonly minutes: number }
    | { readonly kind: "daily"; readonly time: string }
    | { readonly kind: "weekly"; readonly day: number; readonly time: string }
    | { readonly kind: "cron"; readonly expression: string }
  readonly timezone: string
  readonly catchUp: "latest" | "skip"
  readonly repeat?: number | null
  readonly enabled: boolean
  readonly disabledReason?: "exhausted" | "owner-missing" | null
  readonly next?: number | null
  readonly runs: number
  readonly skipped: number
  readonly last?:
    | (
        | { readonly outcome: "started"; readonly time: number; readonly slot?: number; readonly sessionID: string }
        | { readonly outcome: "failed"; readonly time: number; readonly slot?: number; readonly error: string }
      )
    | null
}

export type CapabilitySchedulesRunInput = {
  readonly scheduleID: { readonly scheduleID: string }["scheduleID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
}

export type CapabilitySchedulesRunOutput = { readonly id: string; readonly sessionID: string; readonly reused: boolean }

export type CapabilitySchedulesRemoveInput = {
  readonly scheduleID: { readonly scheduleID: string }["scheduleID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
  }["location"]
  readonly "idempotency-key": { readonly "idempotency-key": string }["idempotency-key"]
}

export type CapabilitySchedulesRemoveOutput = { readonly id: string; readonly removed: true }
export {
  type UnauthorizedError,
  isUnauthorizedError,
  type InvalidRequestError,
  isInvalidRequestError,
  type UnknownError,
  isUnknownError,
  type ConflictError,
  isConflictError,
  type InvalidCursorError,
  isInvalidCursorError,
  type SessionNotFoundError,
  isSessionNotFoundError,
  type ServiceUnavailableError,
  isServiceUnavailableError,
  type MessageNotFoundError,
  isMessageNotFoundError,
  type ResearchArtifactNotFoundError,
  isResearchArtifactNotFoundError,
  type ProviderNotFoundError,
  isProviderNotFoundError,
  type PermissionNotFoundError,
  isPermissionNotFoundError,
  type McpServerNotFoundError,
  isMcpServerNotFoundError,
  type PtyNotFoundError,
  isPtyNotFoundError,
  type QuestionNotFoundError,
  isQuestionNotFoundError,
  type ProjectCopyError,
  isProjectCopyError,
  type BoardNotFoundError,
  isBoardNotFoundError,
  type BoardRefusedError,
  isBoardRefusedError,
  type RelayInvalidError,
  isRelayInvalidError,
  type RelayNotFoundError,
  isRelayNotFoundError,
  type RelayConflictError,
  isRelayConflictError,
  type RelayUnavailableError,
  isRelayUnavailableError,
  type RelayForbiddenError,
  isRelayForbiddenError,
  type PullRequestError,
  isPullRequestError,
  type ScheduleNotFoundError,
  isScheduleNotFoundError,
  type ScheduleRunError,
  isScheduleRunError,
  type ActionsError,
  isActionsError,
  type GuardrailError,
  isGuardrailError,
  type MeetingError,
  isMeetingError,
  type ForbiddenError,
  isForbiddenError,
} from "./errors"

export { type ResearchArtifactInput, type ResearchArtifactOutput } from "./research-types"

export {
  type SchedulesListInput,
  type SchedulesListOutput,
  type SchedulesCreateInput,
  type SchedulesCreateOutput,
  type SchedulesUpdateInput,
  type SchedulesUpdateOutput,
  type SchedulesRemoveInput,
  type SchedulesRemoveOutput,
  type SchedulesRunInput,
  type SchedulesRunOutput,
} from "./schedules-types"

export {
  type ActionsBindingsListInput,
  type ActionsBindingsListOutput,
  type ActionsBindingsCreateInput,
  type ActionsBindingsCreateOutput,
  type ActionsBindingsGetInput,
  type ActionsBindingsGetOutput,
  type ActionsBindingsUpdateInput,
  type ActionsBindingsUpdateOutput,
  type ActionsBindingsRemoveInput,
  type ActionsBindingsRemoveOutput,
  type ActionsBindingsCapabilitiesInput,
  type ActionsBindingsCapabilitiesOutput,
  type ActionsBindingsPolicyInput,
  type ActionsBindingsPolicyOutput,
  type ActionsBindingsUpdatePolicyInput,
  type ActionsBindingsUpdatePolicyOutput,
} from "./actionsBindings-types"

export {
  type ActionsOperationsPrepareInput,
  type ActionsOperationsPrepareOutput,
  type ActionsOperationsGetInput,
  type ActionsOperationsGetOutput,
  type ActionsOperationsReconcileInput,
  type ActionsOperationsReconcileOutput,
} from "./actionsOperations-types"

export {
  type ActionsWorkflowsListInput,
  type ActionsWorkflowsListOutput,
  type ActionsWorkflowsSourceInput,
  type ActionsWorkflowsSourceOutput,
  type ActionsWorkflowsGraphInput,
  type ActionsWorkflowsGraphOutput,
  type ActionsWorkflowsDispatchInput,
  type ActionsWorkflowsDispatchOutput,
  type ActionsWorkflowsStateInput,
  type ActionsWorkflowsStateOutput,
} from "./actionsWorkflows-types"

export {
  type ActionsRunsListInput,
  type ActionsRunsListOutput,
  type ActionsRunsGetInput,
  type ActionsRunsGetOutput,
  type ActionsRunsJobsInput,
  type ActionsRunsJobsOutput,
  type ActionsRunsRetryInput,
  type ActionsRunsRetryOutput,
  type ActionsRunsCancelInput,
  type ActionsRunsCancelOutput,
  type ActionsRunsForceCancelInput,
  type ActionsRunsForceCancelOutput,
  type ActionsRunsRemoveInput,
  type ActionsRunsRemoveOutput,
  type ActionsRunsApproveForkInput,
  type ActionsRunsApproveForkOutput,
  type ActionsRunsRenameInput,
  type ActionsRunsRenameOutput,
} from "./actionsRuns-types"

export {
  type ActionsJobsRetryInput,
  type ActionsJobsRetryOutput,
  type ActionsJobsPlayInput,
  type ActionsJobsPlayOutput,
  type ActionsJobsCancelInput,
  type ActionsJobsCancelOutput,
  type ActionsJobsEraseInput,
  type ActionsJobsEraseOutput,
} from "./actionsJobs-types"

export {
  type ActionsPipelinesMergeRequestInput,
  type ActionsPipelinesMergeRequestOutput,
  type ActionsPipelinesTriggerInput,
  type ActionsPipelinesTriggerOutput,
} from "./actionsPipelines-types"

export {
  type ActionsResourcesListInput,
  type ActionsResourcesListOutput,
  type ActionsResourcesCommandInput,
  type ActionsResourcesCommandOutput,
} from "./actionsResources-types"

export {
  type ActionsSourceBaseInput,
  type ActionsSourceBaseOutput,
  type ActionsSourceValidateDraftInput,
  type ActionsSourceValidateDraftOutput,
  type ActionsSourceValidateInput,
  type ActionsSourceValidateOutput,
  type ActionsSourceCommandInput,
  type ActionsSourceCommandOutput,
} from "./actionsSource-types"

export { type ActionsTransfersInfoInput, type ActionsTransfersInfoOutput } from "./actionsTransfers-types"
