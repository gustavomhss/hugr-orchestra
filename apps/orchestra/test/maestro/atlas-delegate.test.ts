import { describe, expect, test } from "bun:test"
import type { AtlasAnswerInput, AtlasReviewResult } from "@orchestra/atlas-boundary/surface"
import { LLMEvent } from "@orchestra/llm"
import { Effect, Stream } from "effect"
import { AtlasDelegate } from "@/maestro/atlas-delegate"
import { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { ProviderTest } from "../fake/provider"

// R11 delegation (D33) without a real model: the LLM service replays one fixed reply, the provider is the test fake
// (`openai/gpt-5.2`), and the surface records every answer the delegation writes.

const REVIEW: AtlasReviewResult = {
  state: "ok",
  unreadable: false,
  held: [],
  proposals: [],
  memoryProposals: [],
  interview: {
    batch: [
      {
        id: "q1",
        kind: "tier",
        subject: "k1",
        ask: "Should this invariant bind at T1?",
        rank: 2,
        site: "src/a.ts",
        options: ["T2", "T1", "T0"],
        nodeKey: "k1",
        draft: null,
      },
    ],
    deferred: 0,
  },
}

const INPUT = { questionIds: ["q1", "q9"], providerID: "openai", modelID: "gpt-5.2" }

async function delegate(review: AtlasReviewResult, reply: string) {
  const answers: AtlasAnswerInput[] = []
  const requests: LLM.StreamInput[] = []
  const provider = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* Provider.Service
    }).pipe(Effect.provide(ProviderTest.fake().layer)),
  )
  const services: AtlasDelegate.Services = {
    atlas: {
      review: () => Effect.succeed(review),
      answer: (input) => {
        answers.push(input)
        return Effect.succeed({ state: "ok" as const, ok: true, data: { id: "r1" }, guidance: { next: "", invariant: "" } })
      },
    },
    llm: {
      stream: (request) => {
        requests.push(request)
        return Stream.make(LLMEvent.textDelta({ id: "t", text: reply }))
      },
    },
    provider,
  }
  const result = await Effect.runPromise(AtlasDelegate.delegate(services, INPUT))
  return { result, answers, requests }
}

describe("AtlasDelegate.delegate", () => {
  test("drafts each open question with one model call and writes the draft as a drafted answer", async () => {
    const run = await delegate(REVIEW, JSON.stringify({ answer: "T1", why: "It states a contract callers rely on." }))
    expect(run.result).toEqual({
      state: "ok",
      drafted: [
        { questionId: "q1", ok: true, rejected: null },
        { questionId: "q9", ok: false, rejected: "not an open question in the current interview batch" },
      ],
    })
    expect(run.answers).toEqual([
      {
        questionId: "q1",
        answer: "T1",
        drafted: { model: "openai/gpt-5.2", why: "It states a contract callers rely on." },
      },
    ])
    expect(run.requests).toHaveLength(1)
    expect(run.requests[0]!.responseSchema).toMatchObject({ required: ["answer", "why"] })
    const content = String(run.requests[0]!.messages[0]!.content)
    expect(content).toContain("Options: T2, T1, T0")
    expect(content).toContain("The answer must be exactly one of these option strings, and nothing else.")
    expect(run.requests[0]!.agent.prompt).toContain("exactly one of those option strings")
  })

  test("a reply that is not answer-and-why JSON is refused and writes nothing", async () => {
    const run = await delegate(REVIEW, "T1, because it is a contract")
    expect(run.result).toEqual({
      state: "ok",
      drafted: [
        { questionId: "q1", ok: false, rejected: "the model did not reply with a non-empty answer and why" },
        { questionId: "q9", ok: false, rejected: "not an open question in the current interview batch" },
      ],
    })
    expect(run.answers).toEqual([])
  })

  test("a project with no Atlas store answers empty and calls no model", async () => {
    const run = await delegate({ state: "empty" }, "")
    expect(run.result).toEqual({ state: "empty" })
    expect(run.requests).toEqual([])
    expect(run.answers).toEqual([])
  })
})
