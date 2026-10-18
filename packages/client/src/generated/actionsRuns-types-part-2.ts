export type ActionsRunsJobsInput = {
  readonly bindingID: { readonly bindingID: string; readonly runID: string }["bindingID"]
  readonly runID: { readonly bindingID: string; readonly runID: string }["runID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly attempt?: number | undefined
    readonly cursor?: string | undefined
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly attempt?: number | undefined
    readonly cursor?: string | undefined
  }["revision"]
  readonly attempt?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly attempt?: number | undefined
    readonly cursor?: string | undefined
  }["attempt"]
  readonly cursor?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
    readonly attempt?: number | undefined
    readonly cursor?: string | undefined
  }["cursor"]
}

export type ActionsRunsJobsOutput = {
  readonly location: {
    readonly directory: string
    readonly workspaceID?: string
    readonly project: { readonly id: string; readonly directory: string }
  }
  readonly data: {
    readonly items: ReadonlyArray<{
      readonly id: string
      readonly bindingID: string
      readonly runID: string
      readonly name: string
      readonly status: string | null
      readonly conclusion?: string | null
      readonly definitionID?: string
      readonly runner?: string
      readonly runnerID?: string
      readonly runnerLabels?: ReadonlyArray<string>
      readonly runnerGroupID?: string
      readonly attempt?: number
      readonly startedAt?: string
      readonly finishedAt?: string
      readonly downstreamID?: string
      readonly downstreamProjectID?: string
      readonly kind?: "job" | "bridge"
      readonly stage?: string
      readonly retried?: boolean
      readonly retryOf?: string
      readonly allowFailure?: boolean
      readonly steps: ReadonlyArray<{
        readonly number: number | "Infinity" | "-Infinity" | "NaN"
        readonly name: string
        readonly status: string | null
        readonly conclusion?: string | null
        readonly startedAt?: string
        readonly finishedAt?: string
      }>
    }>
    readonly next?: string
    readonly total?: number | "Infinity" | "-Infinity" | "NaN"
    readonly capturedAt: number | "Infinity" | "-Infinity" | "NaN"
  }
}

export type ActionsRunsRetryInput = {
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
  readonly id: {
    readonly id: string
    readonly input:
      | { readonly provider: "github"; readonly mode: "all" | "failed"; readonly enableDebugLogging?: boolean }
      | { readonly provider: "gitlab"; readonly mode: "failed" }
  }["id"]
  readonly input: {
    readonly id: string
    readonly input:
      | { readonly provider: "github"; readonly mode: "all" | "failed"; readonly enableDebugLogging?: boolean }
      | { readonly provider: "gitlab"; readonly mode: "failed" }
  }["input"]
}

export type ActionsRunsRetryOutput = {
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

export type ActionsRunsCancelInput = {
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
  readonly id: { readonly id: string; readonly input: { readonly provider: "github" | "gitlab" } }["id"]
  readonly input: { readonly id: string; readonly input: { readonly provider: "github" | "gitlab" } }["input"]
}

export type ActionsRunsCancelOutput = {
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

export type ActionsRunsForceCancelInput = {
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
  readonly id: { readonly id: string; readonly input: { readonly provider: "github" } }["id"]
  readonly input: { readonly id: string; readonly input: { readonly provider: "github" } }["input"]
}
