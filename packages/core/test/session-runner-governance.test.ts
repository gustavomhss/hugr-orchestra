import { describe, expect } from "bun:test"
import { LLMClient, Message, Model, ToolFailure, type LLMRequest } from "@orchestra/llm"
import * as OpenAIChat from "@orchestra/llm/protocols/openai-chat"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { LayerNodePlatform } from "@orchestra/core/effect/app-node-platform"
import { EventV2 } from "@orchestra/core/event"
import { SessionV2 } from "@orchestra/core/session"
import { SessionCompaction } from "@orchestra/core/session/compaction"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Effect, Exit, Layer, Stream } from "effect"
import { eq } from "drizzle-orm"
import { Harness, fragmentFixture, sessionID } from "./session-runner-harness"

const requests: LLMRequest[] = []
const steps: Array<{ readonly sessionID: SessionV2.ID; readonly output: number }> = []
// The test governance refuses every provider turn while this holds a message.
let refusal: string | undefined
const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    generate: () => Effect.die("unused"),
    stream: (request) =>
      Stream.unwrap(
        Effect.sync(() => {
          requests.push(request)
          return Stream.fromIterable(fragmentFixture("text", "answer", ["done"]).completeEvents)
        }),
      ),
  }),
)
const model = Model.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route })
const shared = {
  client,
  models: SessionRunnerModel.layerWith(() => Effect.succeed(model)),
  echo: Layer.effectDiscard(ToolRegistry.Service.use((registry) => registry.register({}))),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
}

const governance = Layer.succeed(TaskGovernance.Service, {
  ...TaskGovernance.allowAll,
  beforeTurn: () => (refusal === undefined ? Effect.void : Effect.fail(new ToolFailure({ message: refusal }))),
})
// Keeps the real summarizing hooks and replaces only what one provider turn sees and the post-step hook.
const compaction = makeLocationNode({
  service: SessionCompaction.Service,
  layer: Layer.effect(
    SessionCompaction.Service,
    Effect.gen(function* () {
      const events = yield* EventV2.Service
      const llm = yield* LLMClient.Service
      const subagentModels = yield* SessionSubagentModels.Service
      return SessionCompaction.Service.of({
        ...SessionCompaction.make({ events, llm, subagentModels, config: [] }),
        transform: (input) => Effect.succeed([...input.messages, Message.user("added by transform")]),
        afterStep: (input) => Effect.sync(() => steps.push({ sessionID: input.sessionID, output: input.tokens.output })),
      })
    }),
  ),
  deps: [EventV2.node, LayerNodePlatform.llmClient, SessionSubagentModels.node],
})

const governed = Harness.make({
  ...shared,
  replacements: [
    [TaskGovernance.node, governance],
    [SessionCompaction.node, compaction],
  ],
})
const plain = Harness.make(shared)

const userTexts = (request: LLMRequest | undefined) =>
  (request?.messages ?? []).flatMap((message) =>
    message.role === "user" ? message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])) : [],
  )

const setup = Effect.gen(function* () {
  requests.length = 0
  steps.length = 0
  refusal = undefined
  yield* Harness.setup
  return yield* SessionV2.Service
})

describe("SessionRunner with Location governance and compaction", () => {
  governed.effect("a refused turn stops before any input is promoted or any provider call", () =>
    Effect.gen(function* () {
      const session = yield* setup
      refusal = "turn refused by governance"
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "held prompt" }), resume: false })
      const exit = yield* session.resume(sessionID).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(requests).toHaveLength(0)
      const messages = yield* session.messages({ sessionID, order: "asc" })
      expect(messages.filter((message) => message.type === "user")).toHaveLength(0)
      const { db } = yield* Database.Service
      const inputs = yield* db
        .select()
        .from(SessionInputTable)
        .where(eq(SessionInputTable.session_id, sessionID))
        .all()
        .pipe(Effect.orDie)
      expect(inputs).toHaveLength(1)
      expect(inputs[0].promoted_seq).toBeNull()

      // Once the governance allows turns again, the same pending input runs.
      refusal = undefined
      yield* session.resume(sessionID)
      expect(userTexts(requests[0])).toContain("held prompt")
    }),
  )

  governed.effect("a replacement transform shapes the request and afterStep sees the settled step", () =>
    Effect.gen(function* () {
      const session = yield* setup
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "hello" }), resume: false })
      yield* session.resume(sessionID)
      expect(requests).toHaveLength(1)
      expect(userTexts(requests[0])).toEqual(["hello", "added by transform"])
      expect(steps).toEqual([{ sessionID, output: expect.any(Number) }])
    }),
  )

  plain.effect("the default transform sends the history unchanged", () =>
    Effect.gen(function* () {
      const session = yield* setup
      yield* session.prompt({ sessionID, prompt: Prompt.make({ text: "hello" }), resume: false })
      yield* session.resume(sessionID)
      expect(requests).toHaveLength(1)
      expect(userTexts(requests[0])).toEqual(["hello"])
    }),
  )
})
