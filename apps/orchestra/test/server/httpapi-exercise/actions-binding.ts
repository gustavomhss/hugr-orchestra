import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { check, stable } from "./assertions"
import { rejected } from "./actions-checks"
import { actionPath, actionsRequest, createdProject, decodeLocation, nativeCalls, seedActions, seedBinding } from "./actions-fixture"
import { bindingInput, root } from "./actions-native-data"
import { http } from "./dsl"
import type { Scenario } from "./types"

const bindingPath = "/api/actions/binding/{bindingID}"
const policyPath = bindingPath + "/policy"
const policy = { retentionDays: 7, execution: "manual" }

export const actionsBindingScenarios: Scenario[] = [
  http.protected.get("/api/actions/binding", "actions.binding.list")
    .seeded(seedBinding)
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      check(stable(decodeLocation(Schema.Array(Actions.Binding), body, ctx.state)) === stable([ctx.state.binding]), "binding list must include persisted native identity")
      yield* nativeCalls(ctx.state)
    }), "status"),
  http.protected.post("/api/actions/binding", "actions.binding.create").mutating()
    .seeded(seedActions)
    .at((ctx) => ({ path: "/api/actions/binding", headers: ctx.headers(), body: bindingInput }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const native = { ...ctx.state, projectID: createdProject(body, ctx.state) }
      const binding = decodeLocation(Actions.Binding, body, native)
      check(binding.revision === 1 && binding.projectID === "1234" && binding.account === "fixture-actor", "binding create must resolve native project/account")
      check(binding.directory === ctx.state.directory && binding.remote === "origin", "binding must retain isolated Location and verified remote")
      const list = yield* actionsRequest(ctx, "GET", "/api/actions/binding")
      check(list.status === 200 && stable(decodeLocation(Schema.Array(Actions.Binding), list.body, native)) === stable([binding]), "HTTP create must persist exact binding")
      const calls = yield* nativeCalls(ctx.state)
      check(stable(calls.map((call) => call.endpoint)) === stable(["repos/acme/widgets", "user"]), "create must observe provider project/account through production transport")
    }), "status"),
  http.protected.get(bindingPath, "actions.binding.get")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath(bindingPath, ctx.state.ref), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      check(stable(decodeLocation(Actions.Binding, body, ctx.state)) === stable(ctx.state.binding), "get must return selected binding/revision")
      yield* nativeCalls(ctx.state)
    }), "status"),
  http.protected.patch(bindingPath, "actions.binding.update").mutating()
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath(bindingPath, ctx.state.ref), headers: ctx.headers(), body: { ...bindingInput, expectedRevision: 1 } }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const binding = decodeLocation(Actions.Binding, body, ctx.state)
      check(stable(binding) === stable({ ...ctx.state.binding, revision: 2 }), "binding update must preserve identity and advance revision once")
      const stale = yield* actionsRequest(ctx, "GET", actionPath(bindingPath, ctx.state.ref))
      rejected(stale, "binding_stale")
      const current = yield* actionsRequest(ctx, "GET", actionPath(bindingPath, { id: binding.id, revision: 2 }))
      check(current.status === 200 && stable(decodeLocation(Actions.Binding, current.body, ctx.state)) === stable(binding), "new binding revision must persist")
      yield* nativeCalls(ctx.state)
    }), "status"),
  http.protected.delete(bindingPath, "actions.binding.remove").mutating()
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath(bindingPath, ctx.state.ref), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      decodeLocation(Schema.Null, body, ctx.state)
      const list = yield* actionsRequest(ctx, "GET", "/api/actions/binding")
      check(list.status === 200 && decodeLocation(Schema.Array(Actions.Binding), list.body, ctx.state).length === 0, "remove must persist empty binding list")
      rejected(yield* actionsRequest(ctx, "GET", actionPath(bindingPath, ctx.state.ref)), "binding_missing")
      yield* nativeCalls(ctx.state)
    }), "status"),
  http.protected.get(bindingPath + "/capabilities", "actions.binding.capabilities")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath(bindingPath + "/capabilities", ctx.state.ref), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const capabilities = decodeLocation(Schema.Array(Actions.Capability), body, ctx.state)
      check(capabilities.some((item) => item.operation === "workflows.list" && item.state === "available" && item.scope === "repository:1234"), "capability must come from successful native workflow GET")
      check(capabilities.some((item) => item.operation === "workflow.dispatch" && item.state === "unknown"), "read capability must not invent write eligibility")
      check((yield* nativeCalls(ctx.state)).some((call) => call.endpoint === `${root}/actions/workflows?page=1&per_page=1`), "capability probe must reach native workflow endpoint")
    }), "status"),
  http.protected.get(policyPath, "actions.binding.policy")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath(policyPath, ctx.state.ref), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      check(stable(decodeLocation(Actions.PolicyState, body, ctx.state)) === stable({ binding: ctx.state.ref, policy: {} }), "new binding must have exact default policy")
      yield* nativeCalls(ctx.state)
    }), "status"),
  http.protected.put(policyPath, "actions.binding.updatePolicy").mutating()
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath(policyPath, ctx.state.ref), headers: ctx.headers(), body: policy }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const updated = decodeLocation(Actions.PolicyState, body, ctx.state)
      check(stable(updated) === stable({ binding: { id: ctx.state.binding.id, revision: 2 }, policy }), "policy update must advance binding CAS")
      rejected(yield* actionsRequest(ctx, "GET", actionPath(policyPath, ctx.state.ref)), "binding_stale")
      const stored = yield* actionsRequest(ctx, "GET", actionPath(policyPath, updated.binding))
      check(stored.status === 200 && stable(decodeLocation(Actions.PolicyState, stored.body, ctx.state)) === stable(updated), "policy side effect must persist")
      yield* nativeCalls(ctx.state)
    }), "status"),
]
