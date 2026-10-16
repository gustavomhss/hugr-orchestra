export * as GitHubWorkflowCommands from "./workflow"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { GitHubNative } from "../native"
import { GitHubCommandCommon } from "./common"

const Workflow = Schema.Struct({ id: GitHubNative.ID, path: Schema.NonEmptyString, state: Schema.NonEmptyString })
const Dispatch = Schema.Struct({ workflow_run_id: GitHubNative.ID, run_url: Schema.NonEmptyString, html_url: Schema.NonEmptyString })

// https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event
export const dispatch = Effect.fn("ActionsGitHubCommands.dispatch")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, input: typeof Actions.GitHubDispatch.Type) {
  if (intent.target.ref === undefined || input.ref !== intent.target.ref)
    return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Dispatch ref does not match the admitted native target")
  const { GitHubDispatchInputs } = yield* Effect.promise(() => import("./inputs"))
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const workflow = yield* read(services, binding, intent, repository.root)
  if (workflow.state !== "active") return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native workflow is not active for dispatch")
  const branch = repository.native.default_branch
  if (!branch) return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native default branch was not observed")
  const admission = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: branch }))
  yield* GitHubCommandCommon.guard(binding, () => {
    GitHubCommandCommon.source(binding, { ...intent, expected: undefined }, admission, workflow.path, branch)
    GitHubDispatchInputs.definitions(binding, admission)
  }, "source_unresolved")
  // Default-branch eligibility and selected-ref execution source are separate proofs.
  const selected = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: input.ref }))
  const definitions = yield* GitHubCommandCommon.guard(binding, () => {
    GitHubCommandCommon.source(binding, intent, selected, workflow.path, input.ref)
    return GitHubDispatchInputs.definitions(binding, selected)
  }, "source_unresolved")
  const inputs = yield* GitHubCommandCommon.guard(binding, () => GitHubDispatchInputs.values(binding, definitions, input.inputs))
  yield* Effect.forEach(Object.entries(definitions).filter(([name, definition]) => definition.type === "environment" && Object.hasOwn(inputs, name)), ([name]) => Effect.gen(function* () {
    const target = yield* GitHubCommandCommon.guard(binding, () => {
      const value = inputs[name]
      if (typeof value !== "string" || !value || value.length > 255 || value !== value.trim() || /[\\%{}:\x00-\x1f\x7f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === ".."))
        throw GitHubCommandCommon.fail(binding, "invalid_input", "Environment input requires an exact native environment name")
      return { value, segment: encodeURIComponent(value) }
    })
    const response = yield* GitHubCommandCommon.get(services, binding, `${repository.root}/environments/${target.segment}`)
    yield* GitHubCommandCommon.guard(binding, () => {
      const environment = GitHubNative.decode(binding, Schema.Struct({ id: GitHubNative.ID, name: Schema.NonEmptyString }), response.data, "environment")
      if (environment.name.toLowerCase() !== target.value.toLowerCase()) throw GitHubCommandCommon.fail(binding, "source_conflict", "Native environment identity changed during preflight")
    })
  }))
  const response = yield* GitHubCommandCommon.send(services, binding, { method: "POST", path: `${repository.root}/actions/workflows/${workflow.id}/dispatches`, body: { ref: input.ref, inputs } }, [200, 204])
  if (response.status === 204) return { acknowledgement: { unattributed: true } }
  const result = Schema.decodeUnknownOption(Dispatch)(response.data)
  if (Option.isNone(result)) return yield* GitHubCommandCommon.fail(binding, "outcome_unknown", "GitHub dispatch did not return a complete native run acknowledgement", "unknown")
  return { acknowledgement: { runID: String(result.value.workflow_run_id) } }
})

// https://docs.github.com/en/rest/actions/workflows#enable-a-workflow
export const state = Effect.fn("ActionsGitHubCommands.workflowState")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, enabled: boolean) {
  const repository = yield* GitHubCommandCommon.authority(services, binding)
  const workflow = yield* read(services, binding, intent, repository.root)
  if (!["active", "disabled_manually", "disabled_inactivity", "disabled_fork"].includes(workflow.state))
    return yield* GitHubCommandCommon.fail(binding, "capability_unavailable", "Native workflow state does not support this transition")
  if (intent.expected?.commit !== undefined || intent.expected?.sourceVersion !== undefined) {
    if (intent.target.ref === undefined) return yield* GitHubCommandCommon.fail(binding, "invalid_input", "Source preconditions require the admitted source ref")
    const selected = yield* GitHubCommandCommon.before(binding, services.reader.source(binding, { path: workflow.path, ref: intent.target.ref }))
    yield* GitHubCommandCommon.guard(binding, () => GitHubCommandCommon.source(binding, intent, selected, workflow.path, intent.target.ref ?? ""))
  }
  yield* GitHubCommandCommon.send(services, binding, { method: "PUT", path: `${repository.root}/actions/workflows/${workflow.id}/${enabled ? "enable" : "disable"}` }, [204])
  return { acknowledgement: {} }
})

const read = Effect.fn("ActionsGitHubCommands.workflowPreflight")(function* (services: GitHubCommandCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent, root: string) {
  const id = yield* GitHubCommandCommon.guard(binding, () => GitHubNative.id(binding, intent.target.workflowID ?? ""))
  const response = yield* GitHubCommandCommon.get(services, binding, `${root}/actions/workflows/${id}`)
  return yield* GitHubCommandCommon.guard(binding, () => {
    const workflow = GitHubNative.decode(binding, Workflow, response.data, "workflow")
    if (String(workflow.id) !== id || (intent.target.path !== undefined && intent.target.path !== workflow.path))
      throw GitHubCommandCommon.fail(binding, "source_conflict", "Native workflow identity or path does not match admission")
    GitHubNative.path(binding, workflow.path)
    GitHubCommandCommon.version(binding, intent.expected, response)
    return { id, path: workflow.path, state: workflow.state }
  })
})
