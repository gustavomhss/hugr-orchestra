import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { check, object } from "./assertions"
import { commandReceipt, seedCommand } from "./actions-checks"
import { actionPath, decodeLocation, nativeCalls, seedBinding } from "./actions-fixture"
import { root } from "./actions-native-data"
import { http } from "./dsl"
import type { Scenario } from "./types"

export const actionsResourceScenarios: Scenario[] = [
  http.protected.get("/api/actions/resource/{bindingID}", "actions.resource.list.variables")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/resource/{bindingID}", ctx.state.ref, {}, { kind: "variables", scope: "Repository", limit: "4" }), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const page = decodeLocation(Actions.ResourcePage, body, ctx.state)
      check(page.items.length === 2 && page.next === undefined, "bounded resource inventory must include complete variable/secret pages")
      check(page.items.every((item) => item.bindingID === ctx.state.binding.id && item.kind === "variables" && item.scope === "Repository"), "resource inventory must retain selected binding/kind/scope")
      const variable = page.items.find((item) => item.name === "BUILD_MODE")
      const secret = page.items.find((item) => item.name === "SECRET_NAME")
      check(variable !== undefined && secret !== undefined, "resource inventory must include known public and sensitive controls")
      object(variable.data)
      object(secret.data)
      check(variable.sensitive === false && variable.data.value === "debug", "public variable value must survive native projection")
      check(secret.sensitive === true && secret.data.redacted === true && secret.data.value === undefined, "secret inventory must remain metadata-only")
      const calls = yield* nativeCalls(ctx.state)
      check(calls.some((call) => call.endpoint === `${root}/actions/variables?page=1&per_page=2`) &&
        calls.some((call) => call.endpoint === `${root}/actions/secrets?page=1&per_page=2`), "resource reader must execute native scoped endpoints")
    }), "status"),
  http.protected.post("/api/actions/resource/{bindingID}/{resourceKind}/{action}", "actions.resource.command.create-variable").mutating()
    .seeded((ctx) => seedCommand(ctx, "resource.create", { resourceKind: "variables", resourceID: "NEW_MODE", scope: "Repository" }))
    .at((ctx) => ({ path: actionPath("/api/actions/resource/{bindingID}/{resourceKind}/{action}", ctx.state.ref,
      { resourceKind: "variables", action: "create" }), headers: ctx.headers(), body: { id: ctx.state.operation.id,
      input: { provider: "github", name: "NEW_MODE", type: "Variable", scope: "Repository", value: "fixture-only" } } }))
    .jsonEffect(200, (body, ctx) => commandReceipt(body, ctx, ctx.state,
      { method: "POST", endpoint: `${root}/actions/variables` }, { resourceID: "NEW_MODE" }), "status"),
]
