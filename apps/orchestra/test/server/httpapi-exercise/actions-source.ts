import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { check, stable } from "./assertions"
import { commandReceipt, seedCommand } from "./actions-checks"
import { actionPath, actionsRequest, decodeLocation, nativeCalls, seedBinding } from "./actions-fixture"
import { root, workflowPath, workflowText } from "./actions-native-data"
import { http } from "./dsl"
import type { Scenario } from "./types"

const sourcePath = "/api/actions/source/{bindingID}"
const draft = workflowText.replace("echo build", "echo draft")

export const actionsSourceScenarios: Scenario[] = [
  http.protected.get(sourcePath + "/base", "actions.source.base")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath(sourcePath + "/base", ctx.state.ref, {}, { ref: "main" }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      check(stable(decodeLocation(Actions.SourceBase, body, ctx.state)) === stable({ bindingID: ctx.state.binding.id, ref: "main", commit: ctx.state.commit }), "source base must observe exact branch and immutable commit")
      check((yield* nativeCalls(ctx.state)).at(-1)?.endpoint === `${root}/git/ref/heads/main`, "source base must reach native ref endpoint")
    }), "status"),
  http.protected.post(sourcePath + "/validate-draft", "actions.source.validateDraft")
    .seeded((ctx) => Effect.gen(function* () {
      const native = yield* seedBinding(ctx)
      const result = yield* actionsRequest(ctx, "GET", actionPath(sourcePath + "/base", native.ref))
      check(result.status === 200, `ActionsFixtureError:source-base:${result.text}`)
      return { ...native, base: decodeLocation(Actions.SourceBase, result.body, native) }
    }))
    .at((ctx) => ({ path: actionPath(sourcePath + "/validate-draft", ctx.state.ref), headers: ctx.headers(),
      body: { base: ctx.state.base, path: ".github/workflows/proposed.yml", draft } }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const graph = decodeLocation(Actions.Graph, body, ctx.state)
      check(graph.source.commit === ctx.state.base.commit && graph.source.bindingID === ctx.state.binding.id, "draft validation must retain admitted native base")
      check(graph.source.path === ".github/workflows/proposed.yml" && graph.source.text === draft && graph.source.editable === false, "draft graph must preserve exact bounded text/path")
      check(graph.source.version.startsWith("draft:sha256:") && graph.source.version !== ctx.state.blob, "local draft digest must remain distinct from native blob version")
      check(graph.jobs.length === 2 && stable(graph.jobs[1].needs) === stable(["build"]), "draft validation must project actual YAML")
      check((yield* nativeCalls(ctx.state)).every((call) => call.method === "GET"), "local validation must not publish source")
    }), "status"),
  http.protected.post(sourcePath + "/validate", "actions.source.validate")
    .seeded((ctx) => Effect.gen(function* () {
      const native = yield* seedBinding(ctx)
      const result = yield* actionsRequest(ctx, "GET", actionPath("/api/actions/workflow/{bindingID}/source", native.ref, {}, { path: workflowPath, ref: "main" }))
      check(result.status === 200, `ActionsFixtureError:native-source:${result.text}`)
      return { ...native, source: decodeLocation(Actions.Source, result.body, native) }
    }))
    .at((ctx) => ({ path: actionPath(sourcePath + "/validate", ctx.state.ref), headers: ctx.headers(), body: { source: ctx.state.source, draft } }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const graph = decodeLocation(Actions.Graph, body, ctx.state)
      check(stable(graph.source) === stable({ ...ctx.state.source, text: draft }), "source validation must retain observed source scope and supplied draft")
      check(graph.jobs.length === 2, "source validation must parse supplied YAML")
      check((yield* nativeCalls(ctx.state)).every((call) => call.method === "GET"), "source validation must not publish provider writes")
    }), "status"),
  http.protected.post(sourcePath + "/{action}", "actions.source.command.branch").mutating()
    .seeded((ctx) => seedCommand(ctx, "source.branch", { path: workflowPath, ref: "main", resourceID: "httpapi-proposal" }))
    .at((ctx) => ({ path: actionPath(sourcePath + "/{action}", ctx.state.ref, { action: "branch" }), headers: ctx.headers(),
      body: { id: ctx.state.operation.id, input: { provider: "github", branch: "httpapi-proposal" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "POST", endpoint: `${root}/git/refs` }, { resourceID: "httpapi-proposal" }), "status"),
]
