import type {
  SessionPendingCompaction,
  SessionPendingUser,
} from "./session-prompt"

export type SessionCommandInput = {
  readonly sessionID: {
    readonly sessionID: string
  }["sessionID"]
  readonly id?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["id"]
  readonly command: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["command"]
  readonly arguments?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["arguments"]
  readonly agent?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["agent"]
  readonly model?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["model"]
  readonly files?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["files"]
  readonly agents?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["agents"]
  readonly delivery?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["delivery"]
  readonly resume?: {
    readonly id?: string | null
    readonly command: string
    readonly arguments?: string | null
    readonly agent?: string | null
    readonly model?: {
      readonly id: string
      readonly providerID: string
      readonly variant?: string
    } | null
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
    readonly delivery?: "steer" | "queue" | null
    readonly resume?: boolean | null
  }["resume"]
}
export type SessionCommandOutput = {
  data: SessionPendingUser
}["data"]
export type SessionCompactInput = {
  readonly sessionID: {
    readonly sessionID: string
  }["sessionID"]
  readonly id?: {
    readonly id?: string | undefined
  }["id"]
}
export type SessionCompactOutput = {
  data: SessionPendingCompaction
}["data"]
export type SessionListInput = {
  readonly workspace?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
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
    readonly parentID?: string | null | undefined
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
    readonly parentID?: string | null | undefined
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
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["search"]
  readonly parentID?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["parentID"]
  readonly directory?: {
    readonly workspace?: string | undefined
    readonly limit?: number | undefined
    readonly order?: "asc" | "desc" | undefined
    readonly search?: string | undefined
    readonly parentID?: string | null | undefined
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
    readonly parentID?: string | null | undefined
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
    readonly parentID?: string | null | undefined
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
    readonly parentID?: string | null | undefined
    readonly directory?: string | undefined
    readonly project?: string | undefined
    readonly subpath?: string | undefined
    readonly cursor?: string | undefined
  }["cursor"]
}
export type SessionShellInput = {
  readonly sessionID: {
    readonly sessionID: string
  }["sessionID"]
  readonly id?: {
    readonly id?: string | undefined
    readonly command: string
  }["id"]
  readonly command: {
    readonly id?: string | undefined
    readonly command: string
  }["command"]
}
export type SessionShellOutput = void
