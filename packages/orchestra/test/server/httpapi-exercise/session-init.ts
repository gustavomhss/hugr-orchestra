import { Effect } from "effect"
import { MessageID } from "../../../src/session/schema"
import { check } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// Since #279 (d0c37f2e1d) messageID is the idempotency key of the INIT user turn: a fresh ID is admitted under that
// ID, an exact replay returns the receipt, and an existing message without a receipt is a PromptAdmission conflict.
export const sessionInitScenarios: Scenario[] = [
  http.protected
    .post("/session/{sessionID}/init", "session.init")
    .preserveDatabase()
    .withLlm()
    .seeded((ctx) =>
      Effect.gen(function* () {
        const session = yield* ctx.session({ title: "Init session" })
        yield* ctx.llmText("initialized")
        yield* ctx.llmText("initialized")
        return { session, messageID: MessageID.ascending() }
      }),
    )
    .at((ctx) => ({
      path: route("/session/{sessionID}/init", { sessionID: ctx.state.session.id }),
      headers: ctx.headers(),
      body: { providerID: "test", modelID: "test-model", messageID: ctx.state.messageID },
    }))
    .jsonEffect(200, (body, ctx) =>
      Effect.gen(function* () {
        check(body === true, "init should return true")
        yield* ctx.llmWait(1)
        const admitted = (yield* ctx.messages(ctx.state.session.id)).find(
          (item) => item.info.id === ctx.state.messageID,
        )
        check(admitted?.info.role === "user", "init should admit its user turn under the requested messageID")
      }),
    ),
]
