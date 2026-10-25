import { check, isRecord, object } from "./assertions"
import { http } from "./dsl"
import { type Scenario } from "./types"

// Guard routes (V2 /api/guardrail). The exercise project is an empty directory, so it has no `script/guards/run.ts`
// and both routes answer their typed refusal; the engine itself is covered by script/guards/guards.test.ts and
// packages/core/test/guardrail.test.ts.
function noEngine(body: unknown) {
  object(body)
  check(body.name === "GuardrailError", `expected GuardrailError, got ${String(body.name)}`)
  check(isRecord(body.data) && body.data.kind === "no-engine", "a project without the guard engine should answer no-engine")
}

export const guardrailScenarios: Scenario[] = [
  http.protected.get("/api/guardrail/rules", "v2.guardrail.rules").json(400, noEngine, "status"),
  http.protected
    .post("/api/guardrail/run", "v2.guardrail.run")
    .at((ctx) => ({ path: "/api/guardrail/run", headers: ctx.headers(), body: {} }))
    .json(400, noEngine, "status"),
]
