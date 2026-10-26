export * as SessionTitle from "./title"

import { LLM, LLMEvent, Message, SystemPart, type LLMError, type LLMRequest } from "@orchestra/llm"
import { Effect, Stream } from "effect"
import { AgentV2 } from "../../agent"
import type { Database } from "../../database/database"
import type { EventV2 } from "../../event"
import { SessionLifecycle } from "../lifecycle"
import type { SessionSchema } from "../schema"
import type { SessionStore } from "../store"
import type { SessionSubagentModels } from "../subagent-models"
import { SessionRunnerModel } from "./model"
import { toLLMMessages } from "./to-llm-message"

const TITLE_OUTPUT_TOKENS = 64
const TITLE_MAX_CHARS = 100

type Dependencies = {
  readonly db: Database.Interface["db"]
  readonly events: EventV2.Interface
  readonly store: SessionStore.Interface
  readonly agents: AgentV2.Interface
  readonly models: SessionRunnerModel.Interface
  readonly subagentModels: SessionSubagentModels.Interface
  readonly llm: { readonly stream: (request: LLMRequest) => Stream.Stream<LLMEvent, LLMError> }
}

/**
 * Names a root Session after its first prompt with the `title` agent, as V1 did. The new title is published as
 * `session.updated`. A Session that already has a title of its own, a child Session, or a second prompt is left alone.
 */
export const make = (dependencies: Dependencies) =>
  Effect.fn("SessionTitle.name")(function* (sessionID: SessionSchema.ID) {
    const session = yield* dependencies.store.get(sessionID)
    if (!session || session.parentID || !SessionLifecycle.isDefaultTitle(session.title)) return
    const users = (yield* dependencies.store.context(sessionID)).filter((message) => message.type === "user")
    if (users.length !== 1) return
    const agent = yield* dependencies.agents.get(AgentV2.ID.make("title"))
    if (!agent?.system) return
    const model = yield* dependencies.models.resolve(agent.model ? { ...session, model: agent.model } : session)
    yield* dependencies.subagentModels.assert(session.id, SessionRunnerModel.reference(model))
    const chunks: string[] = []
    yield* dependencies.llm
      .stream(
        LLM.request({
          model,
          http: { headers: { "x-session-affinity": session.id, "X-Session-Id": session.id } },
          system: [SystemPart.make(agent.system)],
          messages: [Message.user("Generate a title for this conversation:\n"), ...toLLMMessages(users, model)],
          generation: { maxTokens: TITLE_OUTPUT_TOKENS },
        }),
      )
      .pipe(
        Stream.runForEach((event) => {
          if (LLMEvent.is.textDelta(event)) chunks.push(event.text)
          return Effect.void
        }),
      )
    const line = chunks
      .join("")
      .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.length > 0)
    if (!line) return
    // The person may have renamed the Session while the title was generated.
    const current = yield* dependencies.store.get(sessionID)
    if (!current || !SessionLifecycle.isDefaultTitle(current.title)) return
    yield* SessionLifecycle.rename(dependencies.db, dependencies.events, {
      sessionID,
      title: line.length > TITLE_MAX_CHARS ? `${line.slice(0, TITLE_MAX_CHARS - 3)}...` : line,
    })
  })
