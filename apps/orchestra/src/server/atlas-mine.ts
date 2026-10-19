import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { LLMEvent } from "@orchestra/llm"
import { Effect, Stream } from "effect"
import type { Agent } from "@/agent/agent"
import { AtlasSurface } from "@/server/atlas-surface"
import type { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"

// Genesis mining from the screen (DECISIONS.md D40). The boundary lists the sites the advisory pass visits with the
// exact prompt `atlas mine` would send; the host asks the chosen model once per site, four at a time, as plain text;
// the boundary runs the pass again answering each site from those replies, through Atlas's own answer gate and
// admission, and stages the candidates. A site whose call fails is left out and abstains. Nothing is promoted.

export type Input = { readonly providerID: string; readonly modelID: string; readonly ceiling: number }

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
  // An empty prompt would fall back to the model's general coding prompt.
  prompt:
    "You read one unit of a codebase and follow the message's instructions exactly. A program reads your reply, so reply only in the format the message asks for.",
}

export const mine = Effect.fn("AtlasMine.mine")(function* (services: Services, input: Input) {
  const ceiling = Math.min(200, Math.max(1, Math.floor(input.ceiling)))
  const listed = yield* services.atlas.mineSites(ceiling)
  if (listed.state === "empty") return listed
  const model = yield* services.provider
    .getModel(ProviderV2.ID.make(input.providerID), ModelV2.ID.make(input.modelID))
    .pipe(Effect.mapError((error) => new AtlasSurface.Unavailable({ message: firstLine(error) })))
  const replies = yield* Effect.forEach(
    listed.sites,
    (site) =>
      ask(services.llm, model, site.prompt).pipe(
        Effect.map((text) => [[site.key, text] as const]),
        Effect.catch(() => Effect.succeed([])),
      ),
    { concurrency: 4 },
  )
  return yield* services.atlas.mineWith({
    ceiling,
    answers: Object.fromEntries(replies.flat()),
    model: `${input.providerID}/${input.modelID}`,
  })
})

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

function firstLine(error: unknown) {
  const text = error instanceof Error && error.message ? error.message : String(error)
  return text.split("\n")[0]!.slice(0, 300)
}

export * as AtlasMine from "./atlas-mine"
