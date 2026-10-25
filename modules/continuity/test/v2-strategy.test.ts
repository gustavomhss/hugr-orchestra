import { describe, expect, test } from "bun:test"
import path from "node:path"
import { LLM, Message, ToolCallPart, ToolResultPart } from "@orchestra/llm"
import { Effect, Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { SessionStore, SessionSubagentModels, SessionV2 } from "@orchestra/core/session"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ContinuityArchive } from "../src/v2/archive"
import { ContinuityMaskingV2 } from "../src/v2/masking"
import { ContinuityStrategy } from "../src/v2/strategy"
import { archiveDirectory, config, llm, model, recallTools, run, sessionID, step } from "./fixture"

const it = run(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, EventV2.node, SessionProjector.node, SessionSubagentModels.node, SessionStore.node]),
  ),
)

const strategy = (entries: ReturnType<typeof config>) =>
  Effect.gen(function* () {
    return ContinuityStrategy.make({
      events: yield* EventV2.Service,
      llm: llm(() => "## Objective\n- continue"),
      subagentModels: yield* SessionSubagentModels.Service,
      store: yield* SessionStore.Service,
      config: entries,
      state: ContinuityStrategy.state(ContinuityStrategy.settings(entries)),
      scope: yield* Scope.Scope,
    })
  })

// Eight steps of ~1000-token outputs against a 10k window (hard limit 7000): masking the steps older than the last
// five brings the request under the limit; the oldest is a protected planning tool.
const history = () => [
  Message.user("start"),
  ...step(0, "todowrite", `TODO ${"t".repeat(4_000)}`),
  ...Array.from({ length: 7 }, (_, index) => step(index + 1, "bash", `OUT${index + 1} ${"x".repeat(4_000)}`)).flat(),
]

const results = (messages: readonly Message[]) =>
  new Map(
    messages.flatMap((message) =>
      message.content.flatMap((part) => (part.type === "tool-result" ? [[part.id, part] as const] : [])),
    ),
  )

describe("ContinuityStrategy settings", () => {
  test("trigger, enabled and hard limit follow V1 rules", () => {
    expect(ContinuityStrategy.settings([])).toEqual({ enabled: true, trigger: 0.4 })
    expect(ContinuityStrategy.settings(config({ continuity: { trigger: 0.5 } }))).toEqual({ enabled: true, trigger: 0.5 })
    expect(ContinuityStrategy.settings(config({ continuity: { trigger: 0.9 } })).trigger).toBe(0.4)
    expect(ContinuityStrategy.settings(config({ continuity: { enabled: false } })).enabled).toBe(false)
    expect(ContinuityStrategy.hardLimit(model(10_000))).toBe(7_000)
    expect(ContinuityStrategy.hardLimit(model(10_000, 5_000))).toBe(5_000)
    expect(
      ContinuityStrategy.tokenCount({ input: 10, output: 5, reasoning: 1, cache: { read: 100, write: Number.NaN } }),
    ).toBe(116)
  })
})

describe("ContinuityStrategy.transform", () => {
  test("masks old tool output over the hard limit and archives it in the V1 format", () =>
    it(
      Effect.gen(function* () {
        const compaction = yield* strategy([])
        const messages = history()
        const view = yield* compaction.transform({ sessionID, messages, model: model(10_000), tools: recallTools })
        const masked = results(view)
        const original = results(messages)

        // Stored history is never changed.
        expect(original.get("call_1")?.result.value).toStartWith("OUT1 ")
        expect(masked.get("call_0")).toBe(original.get("call_0"))
        for (const call of ["call_3", "call_4", "call_5", "call_6", "call_7"])
          expect(masked.get(call)).toBe(original.get(call))
        const references = ["call_1", "call_2"].map((call) => {
          const value = String(masked.get(call)?.result.value)
          expect(value).toMatch(
            new RegExp(
              `^\\[masked tool result: bash command=cat file${call.slice(-1)} → completed, ~\\d+ tokens; full output: context_recall \\{"reference":"[0-9a-f]{64}"\\}\\]$`,
            ),
          )
          return /"reference":"([0-9a-f]{64})"/.exec(value)?.[1] ?? ""
        })

        const chunk = yield* ContinuityArchive.read(sessionID, references[0])
        expect(chunk?.first).toBe("msg_step_1")
        expect(chunk?.title).toBe("assistant message msg_step_1 (continuation 1/1)")
        expect(chunk?.markdown).toContain(`OUT1 ${"x".repeat(4_000)}`)
        const dir = archiveDirectory(sessionID)
        const index = yield* Effect.promise(() => Bun.file(path.join(dir, "index.json")).json())
        expect(index).toMatchObject({ version: 1, sessionID, references: [{ id: references[0] }, { id: references[1] }] })
        expect(yield* Effect.promise(() => Bun.file(path.join(dir, "memory.json")).json())).toEqual({
          version: 1,
          sessionID,
          entry: null,
          masks: [
            ["call_1", references[0]],
            ["call_2", references[1]],
          ],
        })

        // A fresh Location restores the masks and sends the same request.
        const restored = yield* strategy([])
        expect(
          results(yield* restored.transform({ sessionID, messages, model: model(1_000_000), tools: recallTools })).get("call_1")?.result,
        ).toEqual(masked.get("call_1")?.result)
      }),
    ))

  test("keeps full history when the seat cannot call context_recall", () =>
    it(
      Effect.gen(function* () {
        const compaction = yield* strategy([])
        const messages = history()
        expect(yield* compaction.transform({ sessionID, messages, model: model(10_000), tools: [] })).toBe(messages)
      }),
    ))

  test("relief masks only when the request offers context_recall", () =>
    it(
      Effect.gen(function* () {
        const target = model(10_000)
        const request = (tools: typeof recallTools) => LLM.request({ model: target, messages: history(), tools })
        const input = (tools: typeof recallTools) => ({ sessionID: SessionV2.ID.make("ses_recall_relief"), entries: [], model: target, request: request(tools) })
        const compaction = yield* strategy([])
        expect(yield* compaction.compactIfNeeded(input([]))).toBe(false)
        expect(yield* compaction.compactIfNeeded(input(recallTools))).toBe(true)
      }),
    ))

  test("leaves a request under the limit untouched", () =>
    it(
      Effect.gen(function* () {
        const compaction = yield* strategy([])
        const messages = [Message.user("hello"), ...step(1, "bash", "small")]
        expect(
          yield* compaction.transform({ sessionID: SessionV2.ID.make("ses_small"), messages, model: model(10_000), tools: recallTools }),
        ).toBe(messages)
      }),
    ))

  test("disabled continuity is the core default", () =>
    it(
      Effect.gen(function* () {
        const compaction = yield* strategy(config({ continuity: { enabled: false } }))
        const messages = history()
        expect(yield* compaction.transform({ sessionID, messages, model: model(10_000), tools: recallTools })).toBe(messages)
        yield* compaction.afterStep({
          sessionID,
          tokens: { input: 1_000_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          model: undefined,
        })
      }),
    ))
})

describe("ContinuityMaskingV2", () => {
  const call = ToolCallPart.make({ id: "call_err", name: "bash", input: { command: "make" } })
  test("a failed result keeps its first lines verbatim", () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index}`)
    const result = ToolResultPart.make({ id: "call_err", name: "bash", result: lines.join("\n"), resultType: "error" })
    const stub = ContinuityMaskingV2.stub(call, result, "a".repeat(64))
    expect(stub).toStartWith(lines.slice(0, 20).join("\n"))
    expect(stub).toContain("[masked 10 more lines: bash command=make → failed")
    expect(stub).not.toContain("line 20")
  })

  test("urgent masking spares only the latest message", () => {
    const messages = [...step(1, "bash", "a".repeat(400)), ...step(2, "bash", "b".repeat(400))]
    expect(ContinuityMaskingV2.candidates(messages, new Map())).toEqual([])
    expect(ContinuityMaskingV2.urgent(messages, new Map()).map((item) => item.result.id)).toEqual(["call_1"])
  })
})
