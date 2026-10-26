import { commandReceipt, seedCommand } from "./actions-checks"
import { actionPath } from "./actions-fixture"
import { jobID, root, runID } from "./actions-native-data"
import { dispatchTarget } from "./actions-operation"
import { http } from "./dsl"
import type { Scenario } from "./types"

const runPath = "/api/actions/run/{bindingID}/{runID}"

// Positive sends run production Core dispatchers and CLI response decoding. Only external CLI replies are fixtures.
export const actionsCommandScenarios: Scenario[] = [
  http.protected.post("/api/actions/workflow/{bindingID}/{workflowID}/dispatch", "actions.workflow.dispatch").mutating()
    .seeded((ctx) => seedCommand(ctx, "workflow.dispatch", dispatchTarget))
    .at((ctx) => ({ path: actionPath("/api/actions/workflow/{bindingID}/{workflowID}/dispatch", ctx.state.ref, { workflowID: "42" }),
      headers: ctx.headers(), body: { id: ctx.state.operation.id, input: { provider: "github", ref: "main" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "POST", endpoint: `${root}/actions/workflows/42/dispatches` }, { runID }), "status"),
  http.protected.put("/api/actions/workflow/{bindingID}/{workflowID}/state", "actions.workflow.state").mutating()
    .seeded((ctx) => seedCommand(ctx, "workflow.disable", dispatchTarget))
    .at((ctx) => ({ path: actionPath("/api/actions/workflow/{bindingID}/{workflowID}/state", ctx.state.ref, { workflowID: "42" }),
      headers: ctx.headers(), body: { id: ctx.state.operation.id, input: { provider: "github", enabled: false } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "PUT", endpoint: `${root}/actions/workflows/42/disable` }, {}), "status"),
  http.protected.post(runPath + "/retry", "actions.run.retry").mutating()
    .seeded((ctx) => seedCommand(ctx, "run.retry", { runID }))
    .at((ctx) => ({ path: actionPath(runPath + "/retry", ctx.state.ref, { runID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github", mode: "all" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "POST", endpoint: `${root}/actions/runs/${runID}/rerun` }, { runID }), "status"),
  http.protected.post(runPath + "/cancel", "actions.run.cancel").mutating()
    .seeded((ctx) => seedCommand(ctx, "run.cancel", { runID }, "in_progress"))
    .at((ctx) => ({ path: actionPath(runPath + "/cancel", ctx.state.ref, { runID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "POST", endpoint: `${root}/actions/runs/${runID}/cancel` }, { runID }), "status"),
  http.protected.post(runPath + "/force-cancel", "actions.run.forceCancel").mutating()
    .seeded((ctx) => seedCommand(ctx, "run.forceCancel", { runID }, "in_progress"))
    .at((ctx) => ({ path: actionPath(runPath + "/force-cancel", ctx.state.ref, { runID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "POST", endpoint: `${root}/actions/runs/${runID}/force-cancel` }, { runID }), "status"),
  http.protected.delete(runPath, "actions.run.remove").mutating()
    .seeded((ctx) => seedCommand(ctx, "run.delete", { runID }))
    .at((ctx) => ({ path: actionPath(runPath, ctx.state.ref, { runID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "DELETE", endpoint: `${root}/actions/runs/${runID}` }, { runID }), "status"),
  http.protected.post(runPath + "/approve-fork", "actions.run.approveFork").mutating()
    .seeded((ctx) => seedCommand(ctx, "run.approveFork", { runID }, "action_required"))
    .at((ctx) => ({ path: actionPath(runPath + "/approve-fork", ctx.state.ref, { runID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "POST", endpoint: `${root}/actions/runs/${runID}/approve` }, { runID }), "status"),
  http.protected.post("/api/actions/job/{bindingID}/{jobID}/retry", "actions.job.retry").mutating()
    .seeded((ctx) => seedCommand(ctx, "job.retry", { jobID, runID }))
    .at((ctx) => ({ path: actionPath("/api/actions/job/{bindingID}/{jobID}/retry", ctx.state.ref, { jobID }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "POST", endpoint: `${root}/actions/jobs/${jobID}/rerun` }, { runID, jobID }), "status"),
]
