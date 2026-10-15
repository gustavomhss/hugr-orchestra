import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import path from "node:path"
import { check, object, stable } from "./assertions"
import { actionsError, commandFailure, seedCommand } from "./actions-checks"
import { actionPath, actionsGit, actionsRequest, decodeLocation, nativeCalls, seedBinding, setNativeReply } from "./actions-fixture"
import { bindingInput, jobID, root, runID, workflowPath, workflowText } from "./actions-native-data"
import { dispatchTarget } from "./actions-operation"
import { http } from "./dsl"
import type { Scenario } from "./types"

export const actionsFailureScenarios: Scenario[] = [
  http.protected.patch("/api/actions/binding/{bindingID}", "actions.binding.update.revision-conflict")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/binding/{bindingID}", ctx.state.ref), headers: ctx.headers(),
      body: { ...bindingInput, expectedRevision: 2 } }))
    .jsonEffect(400, (body, ctx) => Effect.gen(function* () {
      actionsError(body, "binding_stale", "Binding update revision differs from the selected revision")
      const stored = yield* actionsRequest(ctx, "GET", actionPath("/api/actions/binding/{bindingID}", ctx.state.ref))
      check(stored.status === 200 && stable(decodeLocation(Actions.Binding, stored.body, ctx.state)) === stable(ctx.state.binding), "conflicting update must preserve binding/revision")
      check((yield* nativeCalls(ctx.state)).length === 2, "conflicting revisions must fail before provider resolution")
    }), "status"),
  http.protected.get("/api/actions/binding/{bindingID}", "actions.binding.get.foreign-location")
    .seeded((ctx) => Effect.gen(function* () {
      const native = yield* seedBinding(ctx)
      const foreign = path.join(native.directory, "other-location")
      yield* actionsGit(native.directory, ["clone", "--no-hardlinks", native.directory, foreign])
      return { ...native, foreign }
    }))
    .at((ctx) => ({ path: actionPath("/api/actions/binding/{bindingID}", ctx.state.ref, {}, { "location[directory]": ctx.state.foreign }), headers: ctx.headers() }))
    .jsonEffect(400, (body, ctx) => Effect.gen(function* () {
      actionsError(body, "binding_missing", "Actions binding does not exist at this Location.")
      const owned = yield* actionsRequest(ctx, "GET", actionPath("/api/actions/binding/{bindingID}", ctx.state.ref))
      check(owned.status === 200 && decodeLocation(Actions.Binding, owned.body, ctx.state).id === ctx.state.binding.id, "foreign query override must not delete or leak owning binding")
      const foreign = yield* actionsRequest(ctx, "GET", `/api/actions/binding?${new URLSearchParams({ "location[directory]": ctx.state.foreign })}`)
      check(foreign.status === 200 && decodeLocation(Schema.Array(Actions.Binding), foreign.body,
        { directory: ctx.state.foreign, projectID: ctx.state.projectID }).length === 0, "query Location must override headers and isolate binding storage")
      check((yield* nativeCalls(ctx.state)).length === 2, "foreign binding lookup must fail before provider calls")
    }), "status"),
  http.protected.get("/api/actions/run/{bindingID}", "actions.run.list.invalid-query")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/run/{bindingID}", ctx.state.ref, {}, { limit: "not-a-number" }), headers: ctx.headers() }))
    .jsonEffect(400, (body, ctx) => Effect.gen(function* () {
      object(body)
      check(body._tag === "InvalidRequestError" && body.kind === "Query", "query decoder must return middleware validation error, not provider error")
      check((yield* nativeCalls(ctx.state)).length === 2, "invalid query must not reach provider reader")
    }), "status"),
  ...([401, 403] as const).map((status) => http.protected.get("/api/actions/workflow/{bindingID}", `actions.workflow.list.provider-${status}`)
    .seeded((ctx) => Effect.gen(function* () {
      const native = yield* seedBinding(ctx)
      yield* setNativeReply(native, `GET ${root}/actions/workflows?page=1&per_page=7`, { status, data: { message: "Fixture denied" } })
      return native
    }))
    .at((ctx) => ({ path: actionPath("/api/actions/workflow/{bindingID}", ctx.state.ref, {}, { limit: "7" }), headers: ctx.headers() }))
    .jsonEffect(400, (body, ctx) => Effect.gen(function* () {
      const error = actionsError(body, status === 401 ? "not_authenticated" : "permission_denied")
      check(error.provider === "github" && error.bindingID === ctx.state.binding.id && error.disposition === "definitely_rejected", "native auth/permission failure must remain distinct from Orchestra 401")
      check((yield* nativeCalls(ctx.state)).at(-1)?.endpoint === `${root}/actions/workflows?page=1&per_page=7`, "provider refusal must come from actual transport call")
    }), "status")),
  http.protected.post("/api/actions/workflow/{bindingID}/{workflowID}/dispatch", "actions.workflow.dispatch.endpoint-mismatch").mutating()
    .seeded((ctx) => seedCommand(ctx, "workflow.dispatch", dispatchTarget))
    .at((ctx) => ({ path: actionPath("/api/actions/workflow/{bindingID}/{workflowID}/dispatch", ctx.state.ref, { workflowID: "43" }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github", ref: "main" } } }))
    .jsonEffect(400, (body, ctx) => commandFailure(body, ctx, ctx.state, "intent_conflict", "Command endpoint differs from the admitted native target"), "status"),
  http.protected.post("/api/actions/run/{bindingID}/{runID}/cancel", "actions.run.cancel.unobserved-state").mutating()
    .seeded((ctx) => seedCommand(ctx, "run.cancel", { runID }, "unknown"))
    .at((ctx) => ({ path: actionPath("/api/actions/run/{bindingID}/{runID}/cancel", ctx.state.ref, { runID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github" } } }))
    .jsonEffect(400, (body, ctx) => commandFailure(body, ctx, ctx.state, "capability_unavailable", "Native run is not in a cancelable execution state"), "status"),
  http.protected.post("/api/actions/source/{bindingID}/validate-draft", "actions.source.validateDraft.moved-base")
    .seeded((ctx) => Effect.gen(function* () {
      const native = yield* seedBinding(ctx)
      const result = yield* actionsRequest(ctx, "GET", actionPath("/api/actions/source/{bindingID}/base", native.ref))
      check(result.status === 200, `ActionsFixtureError:base-for-move:${result.text}`)
      const base = decodeLocation(Actions.SourceBase, result.body, native)
      yield* actionsGit(native.directory, ["-c", "user.name=Actions Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "Fixture branch moved"])
      const moved = yield* actionsGit(native.directory, ["rev-parse", "HEAD"])
      check(moved !== base.commit, "ActionsFixtureError:branch-did-not-move")
      yield* setNativeReply(native, `GET ${root}/git/ref/heads/main`, { status: 200, data: { ref: "refs/heads/main", object: { type: "commit", sha: moved } } })
      return { ...native, base }
    }))
    .at((ctx) => ({ path: actionPath("/api/actions/source/{bindingID}/validate-draft", ctx.state.ref), headers: ctx.headers(),
      body: { base: ctx.state.base, path: workflowPath, draft: workflowText } }))
    .jsonEffect(400, (body, ctx) => Effect.gen(function* () {
      actionsError(body, "source_conflict", "Source branch moved after base admission")
      check((yield* nativeCalls(ctx.state)).every((call) => call.method === "GET"), "stale source base must not publish provider writes")
    }), "status"),
  http.protected.get("/api/actions/transfer/{bindingID}", "actions.transfer.read.foreign-attempt")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/transfer/{bindingID}", ctx.state.ref, {}, { kind: "jobLog", id: jobID, runID, attempt: "5" }), headers: ctx.headers() }))
    .jsonEffect(400, (body, ctx) => Effect.gen(function* () {
      actionsError(body, "binding_stale", "GitHub log job differs from the selected job, run or attempt")
      check((yield* nativeCalls(ctx.state)).every((call) => call.metadata), "wrong output attempt must fail before raw transfer opens")
    }), "status"),
]
