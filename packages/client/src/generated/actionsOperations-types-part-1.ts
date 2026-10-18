export type ActionsOperationsPrepareInput = {
  readonly bindingID: { readonly bindingID: string }["bindingID"]
  readonly location?: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["location"]
  readonly revision: {
    readonly location?: { readonly directory?: string | undefined; readonly workspace?: string | undefined } | undefined
    readonly revision: number
  }["revision"]
  readonly clientID: {
    readonly clientID: string
    readonly binding: { readonly id: string; readonly revision: number }
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
    readonly expected?: {
      readonly sourceVersion?: string
      readonly commit?: string
      readonly attempt?: number
      readonly resourceVersion?: string
    }
  }["clientID"]
  readonly binding: {
    readonly clientID: string
    readonly binding: { readonly id: string; readonly revision: number }
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
    readonly expected?: {
      readonly sourceVersion?: string
      readonly commit?: string
      readonly attempt?: number
      readonly resourceVersion?: string
    }
  }["binding"]
  readonly kind: {
    readonly clientID: string
    readonly binding: { readonly id: string; readonly revision: number }
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
    readonly expected?: {
      readonly sourceVersion?: string
      readonly commit?: string
      readonly attempt?: number
      readonly resourceVersion?: string
    }
  }["kind"]
  readonly target: {
    readonly clientID: string
    readonly binding: { readonly id: string; readonly revision: number }
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
    readonly expected?: {
      readonly sourceVersion?: string
      readonly commit?: string
      readonly attempt?: number
      readonly resourceVersion?: string
    }
  }["target"]
  readonly expected?: {
    readonly clientID: string
    readonly binding: { readonly id: string; readonly revision: number }
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
    readonly expected?: {
      readonly sourceVersion?: string
      readonly commit?: string
      readonly attempt?: number
      readonly resourceVersion?: string
    }
  }["expected"]
}
