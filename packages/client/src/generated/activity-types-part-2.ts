export type ActivitySnapshotOutput = {
  readonly instanceID: string
  readonly readAt: number
  readonly cpu?: {
    readonly source: "node.os.cpus"
    readonly percent: number
    readonly windowMs: number
    readonly sampledAt: number
  }
  readonly source: "orchestra.omni.ledger"
  readonly coverage: "server-pipe-spawns"
  readonly retired: number
  readonly records: ReadonlyArray<{
    readonly recordID: string
    readonly supervisorID?: string
    readonly pid: number
    readonly executable: string
    readonly owner: string
    readonly sessionID?: string
    readonly agentID?: string
    readonly tool?: string
    readonly callID?: string
    readonly startedAt: number
    readonly state: "alive" | "gone" | "unknown"
    readonly inspectionFailed: boolean
    readonly source?: "omni.processes"
    readonly sampledAt?: number
    readonly members?: ReadonlyArray<{
      readonly pid: number
      readonly parentPid: number | null
      readonly name: string | null
    }>
    readonly footprint?: {
      readonly source: "omni.darwin.phys-footprint"
      readonly bytes: number
      readonly sampledAt: number
      readonly hypothesis: "insufficient" | "compatible-with-logical-leak"
    }
  }>
}

export type ActivityInspectInput = { readonly recordID: { readonly recordID: string }["recordID"] }

export type ActivityInspectOutput = {
  readonly instanceID: string
  readonly readAt: number
  readonly cpu?: {
    readonly source: "node.os.cpus"
    readonly percent: number
    readonly windowMs: number
    readonly sampledAt: number
  }
  readonly source: "orchestra.omni.ledger"
  readonly coverage: "server-pipe-spawns"
  readonly retired: number
  readonly records: ReadonlyArray<{
    readonly recordID: string
    readonly supervisorID?: string
    readonly pid: number
    readonly executable: string
    readonly owner: string
    readonly sessionID?: string
    readonly agentID?: string
    readonly tool?: string
    readonly callID?: string
    readonly startedAt: number
    readonly state: "alive" | "gone" | "unknown"
    readonly inspectionFailed: boolean
    readonly source?: "omni.processes"
    readonly sampledAt?: number
    readonly members?: ReadonlyArray<{
      readonly pid: number
      readonly parentPid: number | null
      readonly name: string | null
    }>
    readonly footprint?: {
      readonly source: "omni.darwin.phys-footprint"
      readonly bytes: number
      readonly sampledAt: number
      readonly hypothesis: "insufficient" | "compatible-with-logical-leak"
    }
  }>
}
