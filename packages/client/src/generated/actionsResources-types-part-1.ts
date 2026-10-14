import type { JsonValue } from "./types"

export type ActionsResourcesListInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["revision"]
  readonly kind: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["kind"]
  readonly runID?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["runID"]
  readonly resourceID?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["resourceID"]
  readonly scope?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["scope"]
  readonly ref?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["ref"]
  readonly query?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["query"]
  readonly cursor?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["cursor"]
  readonly limit?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly kind:
      | "artifacts"
      | "environments"
      | "deployments"
      | "variables"
      | "runners"
      | "caches"
      | "schedules"
      | "triggers"
      | "secureFiles"
      | "resourceGroups"
      | "pipelineVariables"
      | "testReports"
      | "policy"
    readonly runID?: string | undefined
    readonly resourceID?: string | undefined
    readonly scope?: string | undefined
    readonly ref?: string | undefined
    readonly query?: string | undefined
    readonly cursor?: string | undefined
    readonly limit?: number | undefined
  }["limit"]
}

export type ActionsResourcesListOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly items: ReadonlyArray<{
      readonly id: string
      readonly bindingID: string
      readonly kind:
        | "artifacts"
        | "environments"
        | "deployments"
        | "variables"
        | "runners"
        | "caches"
        | "schedules"
        | "triggers"
        | "secureFiles"
        | "resourceGroups"
        | "pipelineVariables"
        | "testReports"
        | "policy"
      readonly name: string
      readonly scope?: string
      readonly owner?: string
      readonly status?: string
      readonly sensitive?: boolean
      readonly data: JsonValue
    }>
    readonly next?: string
    readonly total?: number | "Infinity" | "-Infinity" | "NaN"
    readonly capturedAt: number | "Infinity" | "-Infinity" | "NaN"
  }
}
