export type ActivityWorktreesOutput = {
  readonly instanceID: string
  readonly snapshotRevision: string
  readonly readAt: number
  readonly inventoryAt?: number
  readonly source: "node.fs.lstat"
  readonly coverage: "registered-git-worktrees"
  readonly records: ReadonlyArray<{
    readonly recordID: string
    readonly projectID: string
    readonly registrationID: string
    readonly directory: string
    readonly owner: string
    readonly attempt?: {
      readonly startedAt: number
      readonly sampledAt: number
      readonly state: "complete" | "partial"
      readonly observedBytes: number
      readonly entries: number
      readonly issueCount: number
      readonly issues: ReadonlyArray<{
        readonly path: string
        readonly reason: "unavailable" | "symlink" | "unsupported" | "changed" | "limit" | "overflow"
      }>
    }
    readonly logical?: { readonly bytes: number; readonly sampledAt: number }
  }>
}

export type ActivityReadWorktreeInput = { readonly recordID: { readonly recordID: string }["recordID"] }

export type ActivityReadWorktreeOutput = {
  readonly instanceID: string
  readonly snapshotRevision: string
  readonly readAt: number
  readonly inventoryAt?: number
  readonly source: "node.fs.lstat"
  readonly coverage: "registered-git-worktrees"
  readonly records: ReadonlyArray<{
    readonly recordID: string
    readonly projectID: string
    readonly registrationID: string
    readonly directory: string
    readonly owner: string
    readonly attempt?: {
      readonly startedAt: number
      readonly sampledAt: number
      readonly state: "complete" | "partial"
      readonly observedBytes: number
      readonly entries: number
      readonly issueCount: number
      readonly issues: ReadonlyArray<{
        readonly path: string
        readonly reason: "unavailable" | "symlink" | "unsupported" | "changed" | "limit" | "overflow"
      }>
    }
    readonly logical?: { readonly bytes: number; readonly sampledAt: number }
  }>
}

export type ActivityProveWorktreeUseInput = { readonly recordID: { readonly recordID: string }["recordID"] }

export type ActivityProveWorktreeUseOutput = {
  readonly recordID: string
  readonly sampledAt: number
  readonly state: "held" | "idle"
  readonly checks: ReadonlyArray<{
    readonly method: "cwd" | "git-c" | "open-file" | "live-lock"
    readonly outcome: "clear" | "holder" | "failed" | "partial" | "unavailable"
  }>
}

export type ActivityDockerOutput =
  | {
      readonly instanceID: string
      readonly readAt: number
      readonly source: "docker container ls --all --no-trunc --size --format json"
      readonly coverage: "containers"
      readonly snapshotRevision: string
      readonly inventory: {
        readonly sampledAt: number
        readonly containers: ReadonlyArray<{
          readonly containerID: string
          readonly name?: string
          readonly sizeText?: string
          readonly owner: ""
          readonly logical: null
          readonly unique: "não colapsei"
          readonly useProof: "unproved"
        }>
      }
      readonly attempt: {
        readonly startedAt: number
        readonly sampledAt: number
        readonly state: "complete"
        readonly gaps: readonly []
      }
    }
  | {
      readonly instanceID: string
      readonly readAt: number
      readonly source: "docker container ls --all --no-trunc --size --format json"
      readonly coverage: "containers"
      readonly snapshotRevision: string
      readonly inventory?: {
        readonly sampledAt: number
        readonly containers: ReadonlyArray<{
          readonly containerID: string
          readonly name?: string
          readonly sizeText?: string
          readonly owner: ""
          readonly logical: null
          readonly unique: "não colapsei"
          readonly useProof: "unproved"
        }>
      }
      readonly attempt: {
        readonly startedAt: number
        readonly sampledAt: number
        readonly state: "partial" | "failed" | "unavailable"
        readonly gaps: ReadonlyArray<
          | "executable-missing"
          | "process-unavailable"
          | "timeout"
          | "nonzero-exit"
          | "execution-failed"
          | "stdout-truncated"
          | "stderr-truncated"
          | "output-truncated"
          | "row-limit"
          | "invalid-record"
          | "missing-id"
          | "duplicate-id"
        >
      }
    }
  | {
      readonly instanceID: string
      readonly readAt: number
      readonly source: "docker container ls --all --no-trunc --size --format json"
      readonly coverage: "containers"
      readonly snapshotRevision: "0"
      readonly inventory?: never
      readonly attempt?: never
    }

export type ActivityReadDockerOutput =
  | {
      readonly instanceID: string
      readonly readAt: number
      readonly source: "docker container ls --all --no-trunc --size --format json"
      readonly coverage: "containers"
      readonly snapshotRevision: string
      readonly inventory: {
        readonly sampledAt: number
        readonly containers: ReadonlyArray<{
          readonly containerID: string
          readonly name?: string
          readonly sizeText?: string
          readonly owner: ""
          readonly logical: null
          readonly unique: "não colapsei"
          readonly useProof: "unproved"
        }>
      }
      readonly attempt: {
        readonly startedAt: number
        readonly sampledAt: number
        readonly state: "complete"
        readonly gaps: readonly []
      }
    }
  | {
      readonly instanceID: string
      readonly readAt: number
      readonly source: "docker container ls --all --no-trunc --size --format json"
      readonly coverage: "containers"
      readonly snapshotRevision: string
      readonly inventory?: {
        readonly sampledAt: number
        readonly containers: ReadonlyArray<{
          readonly containerID: string
          readonly name?: string
          readonly sizeText?: string
          readonly owner: ""
          readonly logical: null
          readonly unique: "não colapsei"
          readonly useProof: "unproved"
        }>
      }
      readonly attempt: {
        readonly startedAt: number
        readonly sampledAt: number
        readonly state: "partial" | "failed" | "unavailable"
        readonly gaps: ReadonlyArray<
          | "executable-missing"
          | "process-unavailable"
          | "timeout"
          | "nonzero-exit"
          | "execution-failed"
          | "stdout-truncated"
          | "stderr-truncated"
          | "output-truncated"
          | "row-limit"
          | "invalid-record"
          | "missing-id"
          | "duplicate-id"
        >
      }
    }
  | {
      readonly instanceID: string
      readonly readAt: number
      readonly source: "docker container ls --all --no-trunc --size --format json"
      readonly coverage: "containers"
      readonly snapshotRevision: "0"
      readonly inventory?: never
      readonly attempt?: never
    }

export type ActivityExternalCachesOutput = {
  readonly instanceID: string
  readonly snapshotRevision: string
  readonly readAt: number
  readonly source: "node.fs.lstat"
  readonly coverage: "operator-declared-external-caches"
  readonly status: "unavailable" | "ready"
  readonly records: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly owner: ""
    readonly useProof: "unproved"
    readonly unique: "not-collapsed"
    readonly attempt?: {
      readonly state: "complete" | "partial"
      readonly startedAt: number
      readonly sampledAt: number
      readonly issueCount: number
    }
    readonly logical?: { readonly bytes: number; readonly sampledAt: number }
  }>
}

export type ActivityReadExternalCacheInput = { readonly id: { readonly id: string }["id"] }

export type ActivityReadExternalCacheOutput = {
  readonly instanceID: string
  readonly snapshotRevision: string
  readonly readAt: number
  readonly source: "node.fs.lstat"
  readonly coverage: "operator-declared-external-caches"
  readonly status: "unavailable" | "ready"
  readonly records: ReadonlyArray<{
    readonly id: string
    readonly name: string
    readonly owner: ""
    readonly useProof: "unproved"
    readonly unique: "not-collapsed"
    readonly attempt?: {
      readonly state: "complete" | "partial"
      readonly startedAt: number
      readonly sampledAt: number
      readonly issueCount: number
    }
    readonly logical?: { readonly bytes: number; readonly sampledAt: number }
  }>
}

export type ActivityDiskOutput = {
  readonly instanceID: string
  readonly readAt: number
  readonly source: "node.fs.lstat"
  readonly roots: ReadonlyArray<{
    readonly id: "cache" | "logs" | "temporary"
    readonly path: string
    readonly attempt?: {
      readonly startedAt: number
      readonly sampledAt: number
      readonly state: "complete" | "partial"
      readonly observedBytes: number
      readonly entries: number
      readonly issueCount: number
      readonly issues: ReadonlyArray<{
        readonly path: string
        readonly reason: "unavailable" | "symlink" | "unsupported" | "changed" | "limit" | "overflow"
      }>
    }
    readonly logical?: { readonly bytes: number; readonly sampledAt: number }
  }>
}

export type ActivityReadDiskInput = { readonly rootID: { readonly rootID: "cache" | "logs" | "temporary" }["rootID"] }

export type ActivityReadDiskOutput = {
  readonly instanceID: string
  readonly readAt: number
  readonly source: "node.fs.lstat"
  readonly roots: ReadonlyArray<{
    readonly id: "cache" | "logs" | "temporary"
    readonly path: string
    readonly attempt?: {
      readonly startedAt: number
      readonly sampledAt: number
      readonly state: "complete" | "partial"
      readonly observedBytes: number
      readonly entries: number
      readonly issueCount: number
      readonly issues: ReadonlyArray<{
        readonly path: string
        readonly reason: "unavailable" | "symlink" | "unsupported" | "changed" | "limit" | "overflow"
      }>
    }
    readonly logical?: { readonly bytes: number; readonly sampledAt: number }
  }>
}

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
  }>
}
