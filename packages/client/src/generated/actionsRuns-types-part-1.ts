export type ActionsRunsListInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["revision"]
  readonly workflowID?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["workflowID"]
  readonly cursor?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["cursor"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["limit"]
  readonly ref?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["ref"]
  readonly event?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["event"]
  readonly status?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["status"]
  readonly commit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["commit"]
  readonly actor?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["actor"]
  readonly created?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["created"]
  readonly createdAfter?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["createdAfter"]
  readonly createdBefore?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["createdBefore"]
  readonly updatedAfter?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["updatedAfter"]
  readonly updatedBefore?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly workflowID?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
    readonly ref?: string | undefined
    readonly event?: string | undefined
    readonly status?: string | undefined
    readonly commit?: string | undefined
    readonly actor?: string | undefined
    readonly created?: string | undefined
    readonly createdAfter?: string | undefined
    readonly createdBefore?: string | undefined
    readonly updatedAfter?: string | undefined
    readonly updatedBefore?: string | undefined
  }["updatedBefore"]
}

export type ActionsRunsListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly items: ReadonlyArray<{
      readonly id: string
      readonly bindingID: string
      readonly workflowID: string
      readonly name: string | null
      readonly title?: string
      readonly number?: number
      readonly ref: string | null
      readonly commit: string
      readonly event: string
      readonly actor?: string
      readonly status: string | null
      readonly conclusion?: string | null
      readonly attempt?: number
      readonly createdAt?: string
      readonly startedAt?: string
      readonly finishedAt?: string
      readonly updatedAt?: string
      readonly triggeringActor?: string
      readonly repositoryID?: string
      readonly duration?: number | "Infinity" | "-Infinity" | "NaN"
      readonly parentID?: string
      readonly url?: string
    }>
    readonly next?: string
    readonly total?: number | "Infinity" | "-Infinity" | "NaN"
    readonly capturedAt: number | "Infinity" | "-Infinity" | "NaN"
  }
}

export type ActionsRunsGetInput = {
  readonly bindingID: { readonly bindingID: string; readonly runID: string }["bindingID"]
  readonly runID: { readonly bindingID: string; readonly runID: string }["runID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
}

export type ActionsRunsGetOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly id: string
    readonly bindingID: string
    readonly workflowID: string
    readonly name: string | null
    readonly title?: string
    readonly number?: number
    readonly ref: string | null
    readonly commit: string
    readonly event: string
    readonly actor?: string
    readonly status: string | null
    readonly conclusion?: string | null
    readonly attempt?: number
    readonly createdAt?: string
    readonly startedAt?: string
    readonly finishedAt?: string
    readonly updatedAt?: string
    readonly triggeringActor?: string
    readonly repositoryID?: string
    readonly duration?: number | "Infinity" | "-Infinity" | "NaN"
    readonly parentID?: string
    readonly url?: string
  }
}
