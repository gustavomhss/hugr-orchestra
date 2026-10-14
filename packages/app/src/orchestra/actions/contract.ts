import type { Actions } from "@orchestra/schema/actions"
import type { Store } from "solid-js/store"
import type { ActionKey } from "@/i18n/actions"

export type Route = {
  view: "library" | "runs" | "workflow" | "run" | "job" | "source" | "resources" | "settings" | "local"
  workflowID?: string
  runID?: string
  jobID?: string
  attempt?: number
  path?: string
  ref?: string
  resourceKind?: Actions.ResourceKind
  tab?: "graph" | "jobs" | "logs" | "artifacts" | "source"
}

export type ErrorState = { kind: string; message: ActionKey; retryAfter?: number }
export type Data<T> = { status: "idle" | "loading" | "ready" | "error"; value?: T; error?: ErrorState }
export type Filters = { query: string; status: string; ref: string; event: string }
export type Dialog =
  | { kind: "connect" }
  | { kind: "dispatch"; workflowID: string }
  | { kind: "retry"; runID: string }
  | { kind: "cancel"; runID: string }
  | { kind: "remove"; runID: string }
  | { kind: "jobPlay"; jobID: string }
  | { kind: "jobRetry"; jobID: string }
  | { kind: "create-workflow" }
  | { kind: "approval"; runID: string }
  | { kind: "review-source" }
  | { kind: "project-settings" }
  | {
    kind: "create-variable" | "edit-variable" | "delete-variable" | "create-environment" | "edit-environment" |
      "delete-environment" | "create-runner" | "edit-runner" | "delete-runner" | "create-schedule" |
      "edit-schedule" | "delete-schedule" | "delete-artifact" | "delete-cache" | "clear-caches"
    id?: string
    scope?: string
  }

export type State = {
  route: Route
  filters: Filters
  bindings: Data<readonly Actions.Binding[]>
  binding?: Actions.Binding
  capabilities: Data<readonly Actions.Capability[]>
  workflows: Data<Actions.WorkflowPage>
  runs: Data<Actions.RunPage>
  run: Data<Actions.Run>
  jobs: Data<Actions.JobPage>
  source: Data<Actions.Source>
  graph: Data<Actions.Graph>
  artifacts: Data<Actions.ResourcePage>
  resources: Data<Actions.ResourcePage>
  log: Data<string>
  logTruncated: boolean
  operation?: Actions.Operation
  dialog?: Dialog
  submitting: boolean
  commandError?: ErrorState
  commandOutput?: Actions.CommandOutput
  draft: string
  draftBase?: Actions.SourceBase
  diagnostics: readonly string[]
  unsupported: boolean
}

// Views receive typed copy from the chapter's shared i18n adapter.
export type Translate = (key: ActionKey, params?: Record<string, string | number>) => string
export type Model = {
  readonly state: Store<State>
  readonly navigate: (route: Route) => void
  readonly filter: (patch: Partial<Filters>) => void
  readonly selectBinding: (id: Actions.BindingID) => void
  readonly refresh: () => Promise<void>
  readonly more: (kind: "workflows" | "runs" | "jobs" | "artifacts") => Promise<void>
  readonly connect: (input: Actions.BindingInput) => Promise<void>
  readonly removeBinding: () => Promise<void>
  readonly dialog: (dialog?: Dialog) => void
  readonly submit: (payload: unknown) => Promise<void>
  readonly download: (target: Actions.TransferInput) => Promise<void>
  readonly previewLog: (jobID: string) => Promise<void>
  readonly editSource: (text: string) => void
  readonly validateSource: () => Promise<void>
  readonly resourceAction: (action: "play" | "pause" | "keep", resource: Actions.Resource) => Promise<void>
  readonly workflowState: (enabled: boolean, workflowID: string) => Promise<void>
  readonly dispose: () => void
}
export type ViewProps = { model: Model; t: Translate }

export const initial = (): State => ({
  route: { view: "library" }, filters: { query: "", status: "", ref: "", event: "" },
  bindings: { status: "idle" }, capabilities: { status: "idle" }, workflows: { status: "idle" },
  runs: { status: "idle" }, run: { status: "idle" }, jobs: { status: "idle" }, source: { status: "idle" },
  graph: { status: "idle" }, artifacts: { status: "idle" }, resources: { status: "idle" }, log: { status: "idle" },
  logTruncated: false, submitting: false, unsupported: false, draft: "", diagnostics: [],
})
