import { Atlas } from "@orchestra/core/atlas"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { LLMEvent } from "@orchestra/llm"
import { Effect, Stream } from "effect"
import type { Agent } from "@/agent/agent"
import type { AtlasSurface } from "@/server/atlas-surface"
import type { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"

// Genesis mining (DECISIONS.md D40) on the legacy routes: the shared `Atlas.mine` with one plain-text `LLM.stream`
// call per site.

export type Input = Atlas.MineInput

export type Services = {
  readonly atlas: Pick<AtlasSurface.Interface, "mineSites" | "mineWith">
  readonly llm: LLM.Interface
  readonly provider: Provider.Interface
}

const MINE_AGENT: Agent.Info = {
  name: "atlas-genesis-mine",
  mode: "primary",
  permission: [],
  options: {},
  native: true,
  prompt: Atlas.MINE_SYSTEM,
}

export const mine = (services: Services, input: Input) =>
  Atlas.mine(
    {
      atlas: services.atlas,
      model: services.provider
        .getModel(ProviderV2.ID.make(input.providerID), ModelV2.ID.make(input.modelID))
        .pipe(Effect.map((model) => (prompt: string) => ask(services.llm, model, prompt))),
    },
    input,
  )

const ask = (llm: LLM.Interface, model: Provider.Model, prompt: string) => {
  const sessionID = SessionID.descending()
  return llm
    .stream({
      agent: MINE_AGENT,
      user: {
        id: MessageID.ascending(),
        sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: MINE_AGENT.name,
        model: { providerID: model.providerID, modelID: model.id },
      },
      system: [],
      tools: {},
      model,
      sessionID,
      retries: 2,
      messages: [{ role: "user", content: prompt }],
    })
    .pipe(
      Stream.filter(LLMEvent.is.textDelta),
      Stream.map((event) => event.text),
      Stream.mkString,
    )
}

export * as AtlasMine from "./atlas-mine"
