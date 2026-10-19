import { commandFailure, seedCommand } from "./actions-checks"
import { actionPath } from "./actions-fixture"
import { jobID, runID } from "./actions-native-data"
import { http } from "./dsl"
import type { Scenario } from "./types"

const refused = "Command does not belong to the GitHub execution dispatcher"
// These prove typed endpoint/admission/provider-domain refusal, not GitLab provider execution.
// Native GitLab token/HTTP qualification remains in Core's gitlab-command-http and Server's focused tests.
export const actionsProviderBoundaryScenarios: Scenario[] = [
  http.protected.put("/api/actions/run/{bindingID}/{runID}/name", "actions.run.rename.provider-boundary").mutating()
    .seeded((ctx) => seedCommand(ctx, "run.rename", { runID }))
    .at((ctx) => ({ path: actionPath("/api/actions/run/{bindingID}/{runID}/name", ctx.state.ref, { runID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "gitlab", name: "Fixture pipeline" } } }))
    .jsonEffect(400, (body, ctx) => commandFailure(body, ctx, ctx.state, "invalid_input", refused), "status"),
  http.protected.post("/api/actions/job/{bindingID}/{jobID}/play", "actions.job.play.provider-boundary").mutating()
    .seeded((ctx) => seedCommand(ctx, "job.play", { jobID }))
    .at((ctx) => ({ path: actionPath("/api/actions/job/{bindingID}/{jobID}/play", ctx.state.ref, { jobID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "gitlab" } } }))
    .jsonEffect(400, (body, ctx) => commandFailure(body, ctx, ctx.state, "invalid_input", refused), "status"),
  http.protected.post("/api/actions/job/{bindingID}/{jobID}/cancel", "actions.job.cancel.provider-boundary").mutating()
    .seeded((ctx) => seedCommand(ctx, "job.cancel", { jobID }))
    .at((ctx) => ({ path: actionPath("/api/actions/job/{bindingID}/{jobID}/cancel", ctx.state.ref, { jobID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "gitlab" } } }))
    .jsonEffect(400, (body, ctx) => commandFailure(body, ctx, ctx.state, "invalid_input", refused), "status"),
  http.protected.post("/api/actions/job/{bindingID}/{jobID}/erase", "actions.job.erase.provider-boundary").mutating()
    .seeded((ctx) => seedCommand(ctx, "job.erase", { jobID }))
    .at((ctx) => ({ path: actionPath("/api/actions/job/{bindingID}/{jobID}/erase", ctx.state.ref, { jobID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "gitlab" } } }))
    .jsonEffect(400, (body, ctx) => commandFailure(body, ctx, ctx.state, "invalid_input", refused), "status"),
  http.protected.post("/api/actions/pipeline/{bindingID}/merge-request/{mergeRequestID}", "actions.pipeline.mergeRequest.provider-boundary").mutating()
    .seeded((ctx) => seedCommand(ctx, "pipeline.mergeRequest", { resourceID: "17" }))
    .at((ctx) => ({ path: actionPath("/api/actions/pipeline/{bindingID}/merge-request/{mergeRequestID}", ctx.state.ref,
      { mergeRequestID: "17" }), headers: ctx.headers(), body: { id: ctx.state.operation.id, input: { provider: "gitlab" } } }))
    .jsonEffect(400, (body, ctx) => commandFailure(body, ctx, ctx.state, "invalid_input", refused), "status"),
  http.protected.post("/api/actions/pipeline/{bindingID}/trigger", "actions.pipeline.trigger.provider-boundary").mutating()
    .seeded((ctx) => seedCommand(ctx, "pipeline.trigger", { ref: "main" }))
    .at((ctx) => ({ path: actionPath("/api/actions/pipeline/{bindingID}/trigger", ctx.state.ref), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "gitlab", ref: "main", token: "fixture-only-never-sent" } } }))
    .jsonEffect(400, (body, ctx) => commandFailure(body, ctx, ctx.state, "invalid_input", refused), "status"),
]
