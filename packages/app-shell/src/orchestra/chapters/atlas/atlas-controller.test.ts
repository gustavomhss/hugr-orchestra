import { describe, expect, test } from "bun:test"
import { AtlasAPIError, isAtlasEmpty, type AtlasTransport } from "./atlas-api"
import { createAtlasController } from "./atlas-controller"
import { atlasFixture } from "./atlas-model.fixture"
import type { AtlasInput, AtlasOutput } from "./atlas-types"

const review = {
  state: "ok",
  unreadable: false,
  held: ["k5"],
  proposals: [],
  memoryProposals: [],
  interview: { batch: [], deferred: 0 },
} as unknown as AtlasOutput<"review">

// A plain transport object that records each call; tests replace single methods.
function fake(overrides: Partial<AtlasTransport> = {}) {
  const calls: string[] = []
  const answer = <T>(name: string, value: T) => {
    calls.push(name)
    return Promise.resolve(value)
  }
  const transport: AtlasTransport = {
    snapshot: () => answer("snapshot", atlasFixture()),
    reasoning: (id) => answer(`reasoning:${id}`, { id } as unknown as AtlasOutput<"reasoning">),
    own: (scope) => answer(`own:${scope}`, { scope } as unknown as AtlasOutput<"own">),
    health: () => answer("health", {} as unknown as AtlasOutput<"health">),
    promote: () => answer("promote", {} as unknown as AtlasOutput<"promote">),
    draft: () => answer("draft", {} as unknown as AtlasOutput<"draft">),
    emit: () => answer("emit", {} as unknown as AtlasOutput<"emit">),
    link: () => answer("link", {} as unknown as AtlasOutput<"link">),
    verify: () => answer("verify", {} as unknown as AtlasOutput<"verify">),
    review: () => answer("review", review),
    hold: () => answer("hold", {} as unknown as AtlasOutput<"hold">),
    release: () => answer("release", {} as unknown as AtlasOutput<"release">),
    propose: () => answer("propose", {} as unknown as AtlasOutput<"propose">),
    decide: () => answer("decide", {} as unknown as AtlasOutput<"decide">),
    answer: () => answer("answer", {} as unknown as AtlasOutput<"answer">),
    memoryDecide: () => answer("memoryDecide", {} as unknown as AtlasOutput<"memoryDecide">),
    territory: () => answer("territory", {} as unknown as AtlasOutput<"territory">),
    delegate: () => answer("delegate", {} as unknown as AtlasOutput<"delegate">),
    ...overrides,
  }
  return { calls, transport }
}
const describeError = (error: unknown) =>
  error instanceof AtlasAPIError
    ? { message: "unavailable", unavailable: error.reason === "unsupported" }
    : { message: error instanceof Error ? error.message : "unknown" }
const owner = (transport: AtlasTransport) => ({ server: "local", directory: "/repo", transport })

describe("atlas controller", () => {
  test("loads the snapshot of the selected owner", async () => {
    const source = fake()
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    expect(controller.state.snapshot?.project).toBe("demo")
    expect([controller.state.empty, controller.state.unavailable, controller.state.loading]).toEqual([false, false, false])
    expect(source.calls).toEqual(["snapshot", "review"])
  })

  test("an absent store reads as empty (D5)", async () => {
    const source = fake({ snapshot: () => Promise.resolve({ state: "empty" } as unknown as AtlasOutput<"snapshot">) })
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    expect(controller.state.empty).toBe(true)
    expect(controller.state.snapshot).toBeUndefined()
  })

  test("a server without the atlas routes is unavailable and is not asked again", async () => {
    const source = fake({
      snapshot: () => Promise.reject(new AtlasAPIError("unsupported")),
      review: () => Promise.reject(new AtlasAPIError("unsupported")),
    })
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    expect(controller.state.unavailable).toBe(true)
    await controller.refresh()
    await controller.health()
    expect(source.calls).toEqual([])
  })

  test("another failure is worded and kept", async () => {
    const source = fake({ snapshot: () => Promise.reject(new Error("boom")) })
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    expect([controller.state.error, controller.state.unavailable, controller.state.loading]).toEqual(["boom", false, false])
  })

  test("a write rereads the snapshot (D6); verify does not", async () => {
    const source = fake()
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    await controller.promote({} as AtlasInput<"promote">)
          expect(source.calls).toEqual(["snapshot", "review", "promote", "snapshot", "review"])
          expect(controller.state.pending).toEqual([])
          await controller.verify({} as AtlasInput<"verify">)
          expect(source.calls).toEqual(["snapshot", "review", "promote", "snapshot", "review", "verify"])
  })

  test("a write rereads the review too (D34)", async () => {
    const source = fake()
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    expect(controller.state.review?.held).toEqual(["k5"])
    await controller.hold({ nodeKey: "k5" })
    await controller.delegate({ questionIds: ["q1"], providerID: "p", modelID: "m" })
    expect(source.calls).toEqual(["snapshot", "review", "hold", "snapshot", "review", "delegate", "snapshot", "review"])
    expect(controller.state.pending).toEqual([])
  })

  test("an empty review log reads as no review", async () => {
    const source = fake({ review: () => Promise.resolve({ state: "empty" } as unknown as AtlasOutput<"review">) })
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    expect(controller.state.snapshot?.project).toBe("demo")
    expect(controller.state.review).toBeUndefined()
  })

  test("reasoning and own briefings are read once and cached", async () => {
    const source = fake()
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    await controller.reasoning("r1")
    await controller.reasoning("r1")
    await controller.own("packages/a")
    await controller.own("packages/a")
    expect(source.calls).toEqual(["snapshot", "review", "reasoning:r1", "own:packages/a"])
    expect(Object.keys(controller.state.reasoning)).toEqual(["r1"])
  })

  test("a disposed controller asks nothing", async () => {
    const source = fake()
    const controller = createAtlasController(describeError)
    await controller.select(owner(source.transport))
    controller.dispose()
    await controller.refresh()
    expect(source.calls).toEqual(["snapshot", "review"])
  })

  test("isAtlasEmpty only matches the empty answer", () => {
    expect(isAtlasEmpty({ state: "empty" })).toBe(true)
    expect([isAtlasEmpty(atlasFixture()), isAtlasEmpty(null), isAtlasEmpty("empty"), isAtlasEmpty({ state: "ready" })]).toEqual([false, false, false, false])
  })
})
