import type { JsonValue } from "./types"

export type ActionsResourcesCommandInput = {
  readonly bindingID: {
    readonly bindingID: string
    readonly resourceKind:
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
    readonly action: "create" | "update" | "delete" | "play" | "pause" | "keep" | "clear"
  }["bindingID"]
  readonly resourceKind: {
    readonly bindingID: string
    readonly resourceKind:
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
    readonly action: "create" | "update" | "delete" | "play" | "pause" | "keep" | "clear"
  }["resourceKind"]
  readonly action: {
    readonly bindingID: string
    readonly resourceKind:
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
    readonly action: "create" | "update" | "delete" | "play" | "pause" | "keep" | "clear"
  }["action"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
  readonly id: { readonly id: string; readonly input: JsonValue }["id"]
  readonly input: { readonly id: string; readonly input: JsonValue }["input"]
}

export type ActionsResourcesCommandOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly operation: {
      readonly id: string
      readonly bindingID: string
      readonly clientID: string
      readonly kind:
        | "workflow.dispatch"
        | "workflow.enable"
        | "workflow.disable"
        | "run.retry"
        | "run.retryFailed"
        | "run.cancel"
        | "run.forceCancel"
        | "run.delete"
        | "run.approveFork"
        | "run.rename"
        | "job.retry"
        | "job.play"
        | "job.cancel"
        | "job.erase"
        | "logs.delete"
        | "source.branch"
        | "source.write"
        | "source.delete"
        | "source.review"
        | "resource.create"
        | "resource.update"
        | "resource.delete"
        | "artifact.keep"
        | "deployment.review"
        | "environment.stop"
        | "runner.register"
        | "runner.assign"
        | "runner.remove"
        | "cache.clear"
        | "schedule.play"
        | "schedule.takeOwnership"
        | "pipeline.mergeRequest"
        | "pipeline.trigger"
        | "secureFile.upload"
        | "resourceGroup.processMode"
      readonly state: "prepared" | "sending" | "accepted" | "confirmed" | "rejected" | "outcome_unknown" | "expired"
      readonly target: {
        readonly workflowID?: string
        readonly runID?: string
        readonly jobID?: string
        readonly resourceID?: string
        readonly resourceKind?:
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
        readonly scope?: string
        readonly path?: string
        readonly ref?: string
      }
      readonly createdAt: number | "Infinity" | "-Infinity" | "NaN"
      readonly expiresAt: number | "Infinity" | "-Infinity" | "NaN"
      readonly updatedAt: number | "Infinity" | "-Infinity" | "NaN"
      readonly result?: {
        readonly runID?: string
        readonly jobID?: string
        readonly resourceID?: string
        readonly attempt?: number
        readonly unattributed?: boolean
      }
      readonly reason?: string
    }
    readonly output?:
      | {
          readonly kind: "runnerToken"
          readonly token: string
          readonly expiresAt?: string
          readonly runnerID?: string
        }
      | { readonly kind: "runnerJit"; readonly encodedConfiguration: string; readonly runnerID: string }
      | { readonly kind: "triggerToken"; readonly token: string; readonly triggerID: string }
      | { readonly kind: "sourceReview"; readonly id: string; readonly url: string }
  }
}
