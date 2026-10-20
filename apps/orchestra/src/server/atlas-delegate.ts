import { Atlas } from "@orchestra/core/atlas"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { LLMEvent } from "@orchestra/llm"
import type { JSONSchema7 } from "ai"
import { Effect, Stream } from "effect"
import type { Agent } from "@/agent/agent"
import type { AtlasSurface } from "@/server/atlas-surface"
import type { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"

// R11 delegation (DECISIONS.md D33) on the legacy routes: the shared `Atlas.delegate` with one one-shot `LLM.stream`
// call per question (the handlers/project-copy.ts pattern) whose `{ answer, why }` JSON reply arrives as text deltas.

export type Input = Atlas.DelegateInput
export type Drafted = Atlas.Drafted
export type Result = Atlas.DelegateResult

/** What a delegation uses; the handler passes the services it already holds. */
export type Services = {
  readonly atlas: Pick<AtlasSurface.Interface, "review" | "answer">
  readonly llm: LLM.Interface
  readonly provider: Provider.Interface
}

const DELEGATE_AGENT: Agent.Info = {
  name: "atlas-interview-delegate",
  mode: "primary",
  permission: [],
  options: {},
  native: true,
  prompt: Atlas.DELEGATE_SYSTEM,
}

export const delegate = (services: Services, input: Input) =>
  Atlas.delegate(
    {
      atlas: services.atlas,
      draft: (prompt) =>
        Effect.gen(function* () {
          const model = yield* services.provider.getModel(
            ProviderV2.ID.make(input.providerID),
            ModelV2.ID.make(input.modelID),
          )
          const sessionID = SessionID.descending()
          const text = yield* services.llm
            .stream({
              agent: DELEGATE_AGENT,
              user: {
                id: MessageID.ascending(),
                sessionID,
                role: "user",
                time: { created: Date.now() },
                agent: DELEGATE_AGENT.name,
                model: { providerID: model.providerID, modelID: model.id },
              },
              system: [],
              tools: {},
              model,
              sessionID,
              retries: 2,
              responseSchema: Atlas.REPLY_JSON_SCHEMA as JSONSchema7,
              messages: [{ role: "user", content: prompt }],
            })
            .pipe(
              Stream.filter(LLMEvent.is.textDelta),
              Stream.map((event) => event.text),
              Stream.mkString,
            )
          return Atlas.decodeReply(text)
        }),
    },
    input,
  )

export * as AtlasDelegate from "./atlas-delegate"
