import { describe, expect, test } from "bun:test"
import { LLMEvent } from "@orchestra/llm"
import { Effect, Stream } from "effect"
import { AtlasMine } from "@/server/atlas-mine"
import type { MineWithInput } from "@/server/atlas-surface"
import { Provider } from "@/provider/provider"
import type { LLM } from "@/session/llm"
import { ProviderTest } from "../fake/provider"

// D40 mining without a real model or store: the surface lists two sites and records what the host hands back, the
// LLM service replays one fixed reply, and the provider is the test fake (`openai/gpt-5.2`).

const SITES = [
  { key: "src/a.ts::f", prompt: "prompt for f" },
  { key: "src/b.ts::g", prompt: "prompt for g" },
]
const MINED = { state: "ok" as const, sites: 2, facts: 1, complete: true, why: null, refusal: null }

async function mine(input: AtlasMine.Input, listed: "ok" | "empty" = "ok") {
  const handed: MineWithInput[] = []
  const prompts: string[] = []
  const ceilings: number[] = []
  const provider = await Effect.runPromise(
    Effect.gen(function* () {
      return yield* Provider.Service
    }).pipe(Effect.provide(ProviderTest.fake().layer)),
  )
  const services: AtlasMine.Services = {
    atlas: {
      mineSites: (ceiling) => {
        ceilings.push(ceiling)
        return Effect.succeed(listed === "ok" ? { state: "ok" as const, sites: SITES, promptDigest: "d" } : { state: "empty" as const })
      },
      mineWith: (input) => {
        handed.push(input)
        return Effect.succeed(MINED)
      },
    },
    llm: {
      stream: (request: LLM.StreamInput) => {
        prompts.push(JSON.stringify(request.messages))
        return Stream.make(LLMEvent.textDelta({ id: "t", text: "NO-FACT" }))
      },
    },
    provider,
  }
  const result = await Effect.runPromise(AtlasMine.mine(services, input))
  return { result, handed, prompts, ceilings }
}

describe("AtlasMine.mine", () => {
  test("asks the model once per site and hands every reply back keyed by site", async () => {
    const run = await mine({ providerID: "openai", modelID: "gpt-5.2", ceiling: 20 })
    expect(run.result).toEqual(MINED)
    expect(run.prompts).toHaveLength(2)
    expect(run.prompts.join(" ")).toContain("prompt for f")
    expect(run.prompts.join(" ")).toContain("prompt for g")
    expect(run.handed).toEqual([
      { ceiling: 20, answers: { "src/a.ts::f": "NO-FACT", "src/b.ts::g": "NO-FACT" }, model: "openai/gpt-5.2" },
    ])
  })

  test("keeps the ceiling between 1 and 200", async () => {
    expect((await mine({ providerID: "openai", modelID: "gpt-5.2", ceiling: 999 })).ceilings).toEqual([200])
    expect((await mine({ providerID: "openai", modelID: "gpt-5.2", ceiling: 0 })).ceilings).toEqual([1])
  })

  test("answers empty without calling the model when the project has no store", async () => {
    const run = await mine({ providerID: "openai", modelID: "gpt-5.2", ceiling: 20 }, "empty")
    expect(run.result).toEqual({ state: "empty" })
    expect(run.prompts).toEqual([])
    expect(run.handed).toEqual([])
  })
})
