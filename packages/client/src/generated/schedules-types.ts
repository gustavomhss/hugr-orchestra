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
