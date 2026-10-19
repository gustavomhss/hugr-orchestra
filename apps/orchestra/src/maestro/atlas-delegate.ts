import type { AtlasInterviewQuestion } from "@orchestra/atlas-boundary/surface"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { LLMEvent } from "@orchestra/llm"
import type { JSONSchema7 } from "ai"
import { Effect, Option, Schema, Stream } from "effect"
import type { Agent } from "@/agent/agent"
import type { AtlasSurface } from "@/maestro/atlas-surface"
import type { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { MessageID, SessionID } from "@/session/schema"

// R11 delegation (DECISIONS.md D33). A model drafts an answer to each chosen open interview question: one one-shot
// `LLM.stream` call per question (the handlers/project-copy.ts pattern) with a `{ answer, why }` response schema, whose
// JSON reply arrives as text deltas. Each draft is written through the surface as an `answer` carrying `drafted`. A
// draft never ratifies and keeps its question open (D29): a person accepts it by answering with the same text. One
// question's failure (unknown model, provider error, unreadable reply, a refused write) is that question's row; only an
// unavailable store fails the whole call.

export type Input = { readonly questionIds: readonly string[]; readonly providerID: string; readonly modelID: string }
export type Drafted = { readonly questionId: string; readonly ok: boolean; readonly rejected: string | null }
export type Result = { readonly state: "empty" } | { readonly state: "ok"; readonly drafted: readonly Drafted[] }

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
  // An empty prompt would fall back to the model's general coding prompt.
  prompt:
    "You draft an answer to one open question about a codebase's recorded knowledge. A person reviews every draft before it counts. Answer only from what the question gives you. When the question lists options, the answer must be exactly one of those option strings, copied character for character, with nothing added: for a tier question the answer reads like T1 or T0. The why is one or two plain sentences on what the answer rests on, and says so when the question does not give enough to decide.",
}

const RESPONSE_SCHEMA: JSONSchema7 = {
  type: "object",
  properties: { answer: { type: "string" }, why: { type: "string" } },
  required: ["answer", "why"],
  additionalProperties: false,
}

const Reply = Schema.Struct({ answer: Schema.String, why: Schema.String })

export const delegate = Effect.fn("AtlasDelegate.delegate")(function* (services: Services, input: Input) {
  const review = yield* services.atlas.review()
  if (review.state === "empty") return { state: "empty" as const }
  const drafted = yield* Effect.forEach(input.questionIds, (questionId) => {
    const question = review.interview.batch.find((item) => item.id === questionId)
    if (!question) return Effect.succeed(refused(questionId, "not an open question in the current interview batch"))
    return draftOne(services, input, question).pipe(
      Effect.catch((error) => Effect.succeed(refused(questionId, firstLine(error)))),
    )
  })
  return { state: "ok" as const, drafted }
})

const draftOne = Effect.fn("AtlasDelegate.draftOne")(function* (
  services: Services,
  input: Input,
  question: AtlasInterviewQuestion,
) {
  const model = yield* services.provider.getModel(ProviderV2.ID.make(input.providerID), ModelV2.ID.make(input.modelID))
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
      responseSchema: RESPONSE_SCHEMA,
      messages: [{ role: "user", content: prompt(question) }],
    })
    .pipe(
      Stream.filter(LLMEvent.is.textDelta),
      Stream.map((event) => event.text),
      Stream.mkString,
    )
  const reply = Schema.decodeUnknownOption(Schema.fromJsonString(Reply))(text.trim())
  if (Option.isNone(reply) || !reply.value.answer.trim())
    return refused(question.id, "the model did not reply with a non-empty answer and why")
  const written = yield* services.atlas.answer({
    questionId: question.id,
    answer: reply.value.answer.trim(),
    drafted: { model: `${input.providerID}/${input.modelID}`, why: reply.value.why.trim() },
  })
  if (written.state === "empty") return refused(question.id, "the Atlas store is gone")
  if (!written.ok) return refused(question.id, written.rejected ?? "the surface refused the draft")
  return { questionId: question.id, ok: true, rejected: null }
})

function prompt(question: AtlasInterviewQuestion) {
  return [
    `Question (${question.kind}): ${question.ask}`,
    `Subject: ${question.subject}`,
    `Site: ${question.site}`,
    ...(question.options
      ? [`Options: ${question.options.join(", ")}`, "The answer must be exactly one of these option strings, and nothing else."]
      : []),
    "Reply with a JSON object with two string fields: answer and why.",
  ].join("\n")
}

function refused(questionId: string, rejected: string): Drafted {
  return { questionId, ok: false, rejected }
}

function firstLine(error: unknown) {
  const text = error instanceof Error && error.message ? error.message : String(error)
  return text.split("\n")[0]!.slice(0, 300)
}

export * as AtlasDelegate from "./atlas-delegate"
