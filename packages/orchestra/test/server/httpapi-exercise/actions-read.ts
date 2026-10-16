import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { check, stable } from "./assertions"
import { actionPath, decodeLocation, nativeCalls, seedBinding } from "./actions-fixture"
import { jobID, root, runID, workflowPath, workflowText } from "./actions-native-data"
import { http } from "./dsl"
import type { Scenario } from "./types"

export const actionsReadScenarios: Scenario[] = [
  http.protected.get("/api/actions/workflow/{bindingID}", "actions.workflow.list")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/workflow/{bindingID}", ctx.state.ref, {}, { limit: "7" }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const page = decodeLocation(Actions.WorkflowPage, body, ctx.state)
      check(page.items.length === 1 && page.items[0].id === "42" && page.items[0].bindingID === ctx.state.binding.id, "workflow list must retain immutable native IDs")
      check(page.items[0].name === null && page.items[0].dispatchState === "unknown" && page.items[0].dispatchable === false, "nullable metadata and unproved dispatch eligibility must survive HTTP")
      check((yield* nativeCalls(ctx.state)).at(-1)?.endpoint === `${root}/actions/workflows?page=1&per_page=7`, "decoded numeric limit must reach native reader")
    }), "status"),
  http.protected.get("/api/actions/workflow/{bindingID}/source", "actions.workflow.source")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/workflow/{bindingID}/source", ctx.state.ref, {}, { path: workflowPath, ref: "main" }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const source = decodeLocation(Actions.Source, body, ctx.state)
      check(source.bindingID === ctx.state.binding.id && source.commit === ctx.state.commit && source.version === ctx.state.blob, "source must keep native commit/blob scopes")
      check(source.path === workflowPath && source.ref === "main" && source.text === workflowText && source.editable === false, "HTTP source must retain exact bounded bytes and immutable observation")
      check((yield* nativeCalls(ctx.state)).at(-1)?.endpoint === `${root}/contents/${workflowPath}?ref=${ctx.state.commit}`, "source request must pin contents to SHA")
    }), "status"),
  http.protected.get("/api/actions/workflow/{bindingID}/graph", "actions.workflow.graph")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/workflow/{bindingID}/graph", ctx.state.ref, {}, { path: workflowPath, ref: "main" }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const graph = decodeLocation(Actions.Graph, body, ctx.state)
      check(graph.source.commit === ctx.state.commit && graph.source.version === ctx.state.blob && graph.source.text === workflowText, "graph must use pinned native source")
      check(stable(graph.jobs.map((job) => ({ id: job.id, needs: job.needs }))) === stable([{ id: "build", needs: [] }, { id: "test", needs: ["build"] }]), "graph must project actual YAML needs")
      yield* nativeCalls(ctx.state)
    }), "status"),
  http.protected.get("/api/actions/run/{bindingID}", "actions.run.list")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/run/{bindingID}", ctx.state.ref, {}, { limit: "9", ref: "main", commit: ctx.state.commit }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const page = decodeLocation(Actions.RunPage, body, ctx.state)
      check(page.items.length === 1 && page.items[0].id === runID && page.items[0].repositoryID === "1234", "run list must preserve native IDs beyond IEEE-754 precision")
      check(page.items[0].commit === ctx.state.commit && page.items[0].name === null, "run list must retain SHA and native null name")
      check((yield* nativeCalls(ctx.state)).at(-1)?.endpoint === `${root}/actions/runs?branch=main&head_sha=${ctx.state.commit}&page=1&per_page=9`, "HTTP filters must map to native branch/head_sha/page query")
    }), "status"),
  http.protected.get("/api/actions/run/{bindingID}/{runID}", "actions.run.get")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/run/{bindingID}/{runID}", ctx.state.ref, { runID }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const run = decodeLocation(Actions.Run, body, ctx.state)
      check(run.id === runID && run.bindingID === ctx.state.binding.id && run.commit === ctx.state.commit && run.attempt === 4, "run GET must prove selected binding/run/SHA/attempt")
      check((yield* nativeCalls(ctx.state)).at(-1)?.endpoint === `${root}/actions/runs/${runID}`, "run GET must reach immutable repository route")
    }), "status"),
  http.protected.get("/api/actions/run/{bindingID}/{runID}/jobs", "actions.run.jobs")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/run/{bindingID}/{runID}/jobs", ctx.state.ref, { runID }, { attempt: "4" }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const page = decodeLocation(Actions.JobPage, body, ctx.state)
      check(page.items.length === 1 && page.items[0].id === jobID && page.items[0].runID === runID && page.items[0].attempt === 4, "jobs must retain selected native run/attempt")
      check(page.items[0].runnerID === "0" && page.items[0].steps?.[0].status === null, "native unassigned runner and null step state must survive serialization")
      check((yield* nativeCalls(ctx.state)).at(-1)?.endpoint === `${root}/actions/runs/${runID}/attempts/4/jobs?page=1&per_page=50`, "job reader must use pinned attempt endpoint")
    }), "status"),
]
