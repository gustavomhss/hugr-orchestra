export * as ActionsDeploymentReview from "./config-deployment-review"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsContract } from "../contract"
import { ActionsConfigCommon } from "./config-common"
import { ActionsEnvironmentSchema } from "./config-environment-schema"

const C = ActionsConfigCommon
const S = ActionsEnvironmentSchema
const Pending = Schema.Struct({ environment: Schema.Struct({ id: C.ID, name: C.Text }), wait_timer: Schema.Int,
  wait_timer_started_at: Schema.NullOr(Schema.String), current_user_can_approve: Schema.Boolean,
  reviewers: Schema.Array(Schema.Struct({ type: Schema.Literals(["User", "Team"]), reviewer: Schema.Struct({ id: C.ID,
    login: Schema.optionalKey(C.Text), slug: Schema.optionalKey(C.Text) }) })) })
const Deployment = Schema.Struct({ id: C.ID, status: C.Text, sha: C.Text, ref: C.Text,
  environment: Schema.Struct({ id: C.ID, name: C.Text }),
  deployable: Schema.NullOr(Schema.Struct({ id: C.ID, pipeline: Schema.Struct({ id: C.ID }) })),
  pending_approval_count: Schema.optionalKey(Schema.Int),
  approval_summary: Schema.optionalKey(Schema.Struct({ rules: Schema.Array(Schema.Struct({
    user_id: Schema.optionalKey(Schema.NullOr(C.ID)), group_id: Schema.optionalKey(Schema.NullOr(C.ID)),
    access_level: Schema.optionalKey(Schema.NullOr(Schema.Int)), required_approvals: Schema.Int,
  })) })),
})

export const list = Effect.fn("ActionsEnvironments.pendingReview")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, runID: string, name?: string) {
  const run = yield* checkedRun(services, binding, runID)
  const root = C.root(binding)
  if (binding.provider.kind === "github") {
    const response = yield* C.get(services, binding, { method: "GET", path: `${root}/actions/runs/${runID}/pending_deployments` })
    const pending = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Pending), response.data, true))
    return { items: pending.filter((item) => name === undefined || item.environment.name === name).map((item): Actions.Resource => ({
      id: item.environment.name, name: item.environment.name, bindingID: binding.id, kind: "environments", scope: "Repository", status: "waiting",
      data: { ...item, runID, commit: run.commit, ...(run.attempt === undefined ? {} : { attempt: run.attempt }),
        nativeIdentity: C.identity(binding, item.environment.name, "Repository", String(item.environment.id)), resourceVersion: JSON.stringify(item) },
    })), capturedAt: Date.now() }
  }
  const response = yield* C.get(services, binding, { method: "GET", path: `${root}/deployments`, query: {
    status: "blocked", ...(name === undefined ? {} : { environment: name }), per_page: 100, page: 1 } })
  const deployments = yield* C.guard(binding, () => C.decode(binding, Schema.Array(Deployment), response.data, true))
  if (deployments.length === 100 || response.headers["x-next-page"] || response.headers.link?.includes("next"))
    return yield* C.fail(binding, "metadata_truncated", "Pending deployment read exceeds its bounded native page")
  return { items: deployments.filter((item) => String(item.deployable?.pipeline.id) === runID && (name === undefined || item.environment.name === name))
    .map((item): Actions.Resource => ({ id: item.environment.name, name: item.environment.name, bindingID: binding.id,
      kind: "environments", scope: "Project", status: item.status, data: { ...item, runID,
        nativeIdentity: C.identity(binding, item.environment.name, "Project", String(item.environment.id)),
        deploymentID: String(item.id), resourceVersion: JSON.stringify(item) } })), capturedAt: Date.now() }
})

export const perform = Effect.fn("ActionsEnvironments.review")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, intent: Actions.OperationIntent,
  payload: ActionsContract.Json) {
  const frozen = yield* C.guard(binding, () => {
    const capture = C.capture(binding, intent, "environments", true)
    const input = C.decode(binding, S.Review, structuredClone(payload))
    if (input.provider !== binding.provider.kind || !intent.target.runID || !/^[1-9]\d*$/.test(intent.target.runID))
      throw C.fail(binding, "invalid_input", "Deployment review requires its bound provider and native run ID")
    return { ...capture, input, name: C.decode(binding, C.Text, intent.target.resourceID), runID: intent.target.runID }
  })
  const scope = frozen.binding.provider.kind === "github" ? "Repository" : "Project"
  if (frozen.intent.target.scope !== scope) return yield* C.fail(binding, "intent_conflict", "Deployment review scope differs from admission")
  yield* C.project(services, frozen.binding)
  yield* C.actor(services, frozen.binding)
  const run = yield* checkedRun(services, frozen.binding, frozen.runID)
  if ((frozen.intent.expected?.commit !== undefined && frozen.intent.expected.commit !== run.commit) ||
      (frozen.intent.expected?.attempt !== undefined && frozen.intent.expected.attempt !== run.attempt))
    return yield* C.fail(binding, "source_conflict", "Deployment run source or attempt changed after admission")
  const root = C.root(frozen.binding)
  const pending = yield* list(services, frozen.binding, frozen.runID, frozen.name)
  if (pending.items.length !== 1) return yield* C.fail(binding, "source_unresolved", "Native pending deployments did not prove one admitted run and environment")
  const currentRun = yield* checkedRun(services, frozen.binding, frozen.runID)
  if (currentRun.commit !== run.commit || currentRun.attempt !== run.attempt)
    return yield* C.fail(binding, "source_conflict", "Deployment run changed during native approval preflight")
  const resource = pending.items[0]
  const metadata = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ resourceVersion: Schema.String }), resource.data, true))
  if (frozen.intent.expected?.resourceVersion !== undefined && frozen.intent.expected.resourceVersion !== metadata.resourceVersion)
    return yield* C.fail(binding, "source_conflict", "Native deployment review state changed after admission")
  if (frozen.binding.provider.kind === "github") {
    const context = yield* C.guard(binding, () => C.decode(binding, Pending, resource.data, true))
    if (!context.current_user_can_approve) return yield* C.fail(binding, "permission_denied", "GitHub pending deployment metadata denies this reviewer")
    const id = Number(context.environment.id)
    if (!Number.isSafeInteger(id)) return yield* C.fail(binding, "source_unresolved", "GitHub pending environment ID cannot be represented safely")
    yield* C.send(services, frozen.binding, { method: "POST", path: `${root}/actions/runs/${frozen.runID}/pending_deployments`,
      body: { environment_ids: [id], state: frozen.input.decision === "Approve" ? "approved" : "rejected", comment: frozen.input.comment } }, [200])
    return { acknowledgement: { runID: frozen.runID, resourceID: frozen.name } }
  }
  const context = yield* C.guard(binding, () => C.decode(binding, Schema.Struct({ deploymentID: C.Text }), resource.data, true))
  const response = yield* C.get(services, frozen.binding, { method: "GET", path: `${root}/deployments/${context.deploymentID}` })
  const deployment = yield* C.guard(binding, () => C.decode(binding, Deployment, response.data, true))
  if (String(deployment.id) !== context.deploymentID || deployment.environment.name !== frozen.name ||
      String(deployment.deployable?.pipeline.id) !== frozen.runID || deployment.sha !== run.commit || deployment.status !== "blocked")
    return yield* C.fail(binding, "source_conflict", "Native GitLab deployment ownership or approval state changed")
  if (JSON.stringify(deployment) !== metadata.resourceVersion)
    return yield* C.fail(binding, "source_conflict", "Native GitLab deployment approval rules changed during preflight")
  if (!deployment.approval_summary && deployment.pending_approval_count === undefined)
    return yield* C.fail(binding, "capability_unavailable", "GitLab deployment response did not establish native approval capability")
  if (deployment.pending_approval_count !== undefined && deployment.pending_approval_count <= 0)
    return yield* C.fail(binding, "capability_unavailable", "GitLab deployment no longer needs approval; manual execution remains separate")
  yield* C.send(services, frozen.binding, { method: "POST", path: `${root}/deployments/${context.deploymentID}/approval`,
    body: { status: frozen.input.decision === "Approve" ? "approved" : "rejected", comment: frozen.input.comment } }, [200, 201])
  return { acknowledgement: { runID: frozen.runID, resourceID: frozen.name } }
})

const checkedRun = Effect.fn("ActionsEnvironments.reviewRun")(function* (services: ActionsConfigCommon.Services, binding: Actions.Binding, runID: string) {
  if (!/^[1-9]\d*$/.test(runID)) return yield* C.fail(binding, "invalid_input", "Deployment review requires a native decimal run ID")
  const run = yield* services.reader.run(binding, runID).pipe(Effect.mapError((error) => C.fail(binding, error.kind, `Deployment run read failed (${error.kind})`)))
  if (run.id !== runID || run.bindingID !== binding.id || run.repositoryID !== binding.projectID)
    return yield* C.fail(binding, "binding_stale", "Reader did not prove deployment run project ownership")
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(run.commit))
    return yield* C.fail(binding, "source_unresolved", "Reader did not prove a native deployment source commit")
  return run
})
