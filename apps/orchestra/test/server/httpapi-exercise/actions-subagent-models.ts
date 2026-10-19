import { SessionSubagentModels } from "@orchestra/schema/session-subagent-models"
import { Effect, Schema } from "effect"
import { check, stable } from "./assertions"
import { actionsRequest } from "./actions-fixture"
import { http, route } from "./dsl"
import type { Scenario } from "./types"

const policyPath = "/api/session/{sessionID}/subagent-models"
const response = Schema.Struct({ data: SessionSubagentModels.Policy })

// Baseline routes already ship on dev. Use native Session projection and current { policy } payload.
export const actionsSubagentModelsScenarios: Scenario[] = [
  http.protected.get(policyPath, "v2.session.getSubagentModels")
    .probe({ path: "/api/session/ses_httpapi_missing/subagent-models" })
    .seeded((ctx) => ctx.session({ title: "Subagent model policy baseline" }))
    .at((ctx) => ({ path: route(policyPath, { sessionID: ctx.state.id }), headers: ctx.headers() }))
    .json(200, (body) => {
      check(stable(Schema.decodeUnknownSync(response)(body).data) === stable({ mode: "inherit" }), "new Session must inherit outgoing model policy")
    }),
  http.protected.post(policyPath, "v2.session.setSubagentModels").mutating()
    .probe({ path: "/api/session/ses_httpapi_missing/subagent-models", body: { policy: { mode: "inherit" } } })
    .seeded((ctx) => ctx.session({ title: "Empty outgoing model allowlist" }))
    .at((ctx) => ({ path: route(policyPath, { sessionID: ctx.state.id }), headers: ctx.headers(), body: { policy: { mode: "allowlist", models: [] } } }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const policy = Schema.decodeUnknownSync(response)(body).data
      check(policy.mode === "allowlist" && policy.models.length === 0, "empty allowlist must remain distinct from inheritance")
      const stored = yield* actionsRequest(ctx, "GET", route(policyPath, { sessionID: ctx.state.id }))
      check(stored.status === 200 && stable(Schema.decodeUnknownSync(response)(stored.body).data) === stable(policy), "outgoing model policy must persist before POST replies")
      const cleared = yield* actionsRequest(ctx, "POST", route(policyPath, { sessionID: ctx.state.id }), { policy: { mode: "inherit" } })
      check(cleared.status === 200 && Schema.decodeUnknownSync(response)(cleared.body).data.mode === "inherit", "explicit inherit must clear stored allowlist")
      const inherited = yield* actionsRequest(ctx, "GET", route(policyPath, { sessionID: ctx.state.id }))
      check(inherited.status === 200 && Schema.decodeUnknownSync(response)(inherited.body).data.mode === "inherit", "cleared policy must remain inherited on readback")
    }), "status"),
]
