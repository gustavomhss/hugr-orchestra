import { expect } from "bun:test"
import path from "node:path"
import { Effect, Layer } from "effect"
import { Archive } from "@/continuity/archive"
import { SessionContinuity } from "@/continuity/service"
import { BackgroundJob } from "@/background/job"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { Plugin } from "@/plugin"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { SessionSummary } from "@/session/summary"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { awaitWithTimeout, testEffect } from "../lib/effect"
import { httpError, raw, TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { FIRST, PAD, body, jobFor, reviewing, wireMessages } from "./service-fixture"
import PROMPT from "@/continuity/prompt.txt"

// Ruling M3-1 (F3-D4 over F2.8) through the real continuity compaction, manual (`/summarize`) and automatic: once a
// pass evicts the backend seat's admitted resume fold, the next provider request carries the same Admission once, as
// residency "restored", and no later request repeats it.

const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      SessionPrompt.node,
      SessionContinuity.node,
      Session.node,
      SessionProjector.node,
      BackgroundJob.node,
      Database.node,
      EventV2Bridge.node,
      CrossSpawnSpawner.node,
      Archive.node,
      LayerNode.make({ service: TestLLMServer, deps: [], layer: TestLLMServer.layer }),
    ]),
    [
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
      [
        Plugin.node,
        Layer.mock(Plugin.Service, {
          init: () => Effect.void,
          list: () => Effect.succeed([]),
          trigger: (_name, _input, output) => Effect.succeed(output),
        }),
      ],
      [
        SessionSummary.node,
        Layer.mock(SessionSummary.Service, {
          summarize: () => Effect.void,
          diff: () => Effect.succeed([]),
          computeDiff: () => Effect.succeed([]),
        }),
      ],
    ],
  ),
)
type Hit = Parameters<Parameters<TestLLMServer["Service"]["pushMatch"]>[0]>[0]
const PRODUCER = PROMPT.split("\n")[0]
// The isolated transport sends the producer role as system, a replay of the parent request as its last user message.
const maintenance = (hit: Hit) => {
  if (reviewing(hit.body)) return false
  const wire = wireMessages(hit.body)
  return (
    wire.some((message) => message.role === "system" && message.content.includes(PRODUCER)) ||
    /^(CONTEXT CONTINUITY CHECKPOINT|HOST CHECK FAILED)/.test(wire.at(-1)?.role === "user" ? wire.at(-1)!.content : "")
  )
}
const parent = (marker: string) => (hit: Hit) =>
  !reviewing(hit.body) &&
  !maintenance(hit) &&
  wireMessages(hit.body)
    .findLast((message) => message.role === "user")
    ?.content.includes(marker) === true
const chunks = (text: string, input = 100) => [
  { id: "chatcmpl-fold", object: "chat.completion.chunk", choices: [{ delta: { role: "assistant" } }] },
  { id: "chatcmpl-fold", object: "chat.completion.chunk", choices: [{ delta: { content: text } }] },
  {
    id: "chatcmpl-fold",
    object: "chat.completion.chunk",
    choices: [{ delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: input, completion_tokens: 0 },
  },
]
const answer = (text: string, input = 100) => raw({ tail: chunks(text, input) })

const FOLD = "FOLD_RECORD_9D2A"
const ADMISSION: AtlasMemory.Admission = {
  schema: "atlas-resume-admission-v1",
  key: {
    projectID: "project",
    memoryOwner: "backend",
    logicalResumeID: "ses_parent/call_resume",
    kind: "task",
    id: "T-17",
  },
  residency: "admitted",
  verdict: { ok: true, ref: { contentHash: "content-hash", eventId: FOLD } },
  text: `Atlas Memory resume of your task "T-17": your latest admitted checkpoint, record ${FOLD}.\n{"stoppedAt":"x"}`,
}
const fold = [
  {
    type: "text" as const,
    synthetic: true,
    text: ADMISSION.text,
    metadata: { [AtlasMemory.ADMISSION_KEY]: ADMISSION },
  },
]

// Six turns, a compaction pass (forced, or triggered by the last turn's usage), then two more turns. `admitted` says
// which user turn carries the resume fold: the first, so the pass evicts it, or the one right after the pass.
const scenario = Effect.fn("AtlasRestoreHttpTest.scenario")(function* (input: {
  agent: string
  trigger: "manual" | "automatic"
  admitted: "first" | "after"
}) {
  const llm = yield* TestLLMServer
  const instance = yield* TestInstance
  const prompt = yield* SessionPrompt.Service
  const sessions = yield* Session.Service
  const continuity = yield* SessionContinuity.Service
  const jobs = yield* BackgroundJob.Service
  const config = testProviderConfig(llm.url)
  yield* Effect.promise(() =>
    Bun.write(
      path.join(instance.directory, "orchestra.json"),
      JSON.stringify({
        ...config,
        model: "test/test-model",
        small_model: "test/test-model",
        enabled_providers: ["test"],
        plugin: [],
        mcp: {},
        compaction: { auto: false },
        continuity: { trigger: 0.5 },
      }),
    ),
  )
  const chat = yield* sessions.create({ title: "Atlas fold across continuity compaction", agent: input.agent })
  const seed = Array.from({ length: 6 }, (_, index) => `FOLD_SEED_${index}`)
  const hits: Record<string, Hit> = {}
  const record = (name: string) => (hit: Hit) => {
    if (!parent(name)(hit)) return false
    hits[name] = hit
    return true
  }
  for (const text of seed)
    yield* llm.pushMatch(
      record(text),
      answer(`REPLY_${text} ${PAD}`, input.trigger === "automatic" && text === seed[5] ? 50_000 : 100),
    )
  // The producer's reply is built from its own packet, so it is filled in when that request arrives.
  const produced: unknown[] = []
  yield* llm.pushMatch(
    (hit) => {
      if (!maintenance(hit)) return false
      produced.push(...chunks(JSON.stringify(body(hit.body, FIRST))))
      return true
    },
    raw({ tail: produced }),
  )
  yield* llm.pushMatch(record("FOLD_NEXT"), answer("NEXT_DONE"))
  yield* llm.pushMatch(record("FOLD_AFTER"), answer("AFTER_DONE"))
  yield* llm.pushMatch(() => true, httpError(400, { error: { message: "Unexpected request" } }))
  const send = (text: string, extra: typeof fold = []) =>
    awaitWithTimeout(
      prompt.prompt({ sessionID: chat.id, agent: input.agent, model, parts: [{ type: "text", text }, ...extra] }),
      `Turn stalled: ${text}`,
      "30 seconds",
    )
  for (const text of seed) yield* send(text, input.admitted === "first" && text === seed[0] ? fold : [])
  if (input.trigger === "manual") expect(yield* continuity.compact({ sessionID: chat.id, force: true })).toBe("applied")
  if (input.trigger === "automatic") {
    const job = yield* jobFor(chat.id, (yield* sessions.messages({ sessionID: chat.id })).at(-1)!.info.id)
    expect((yield* jobs.wait({ id: job.id, timeout: 15_000 })).info?.output).toBe("applied")
  }
  const next = yield* send("FOLD_NEXT", input.admitted === "after" ? fold : [])
  const after = yield* send("FOLD_AFTER")
  expect(next.parts.some((part) => part.type === "text" && part.text === "NEXT_DONE")).toBe(true)
  expect(after.parts.some((part) => part.type === "text" && part.text === "AFTER_DONE")).toBe(true)
  // What the model reads besides the working memory, which is model-written and system-side.
  const conversation = (name: string) =>
    wireMessages(hits[name].body)
      .filter((message) => message.role !== "system")
      .map((message) => message.content)
      .join("\n")
  // The pass did evict the first turn: no seed reaches the provider after it.
  for (const name of ["FOLD_NEXT", "FOLD_AFTER"])
    for (const text of seed) expect(conversation(name)).not.toContain(text)
  return {
    sent: (name: string) => conversation(name).split(FOLD).length - 1,
    stored: (yield* sessions.messages({ sessionID: chat.id })).flatMap((message) =>
      message.parts.flatMap((part) => {
        if (part.type !== "text" || !part.metadata?.[AtlasMemory.ADMISSION_KEY]) return []
        const admission = part.metadata[AtlasMemory.ADMISSION_KEY] as AtlasMemory.Admission
        expect(part.text).toBe(admission.text)
        expect(part.synthetic).toBe(true)
        const user = message.parts.find((item) => item.type === "text" && !item.synthetic)
        return [{ on: user?.type === "text" ? user.text : undefined, admission }]
      }),
    ),
  }
})

for (const trigger of ["manual", "automatic"] as const)
  it.instance(
    `${trigger} compaction: the evicted fold is restored once on the next request and never repeated`,
    () =>
      Effect.gen(function* () {
        const result = yield* scenario({ agent: "backend", trigger, admitted: "first" })
        expect(result.stored).toEqual([
          { on: "FOLD_SEED_0", admission: ADMISSION },
          { on: "FOLD_NEXT", admission: { ...ADMISSION, residency: "restored" } },
        ])
        expect(result.sent("FOLD_NEXT")).toBe(1)
        expect(result.sent("FOLD_AFTER")).toBe(1)
      }),
    120_000,
  )

it.instance(
  "a fold the request itself carries is not restored",
  () =>
    Effect.gen(function* () {
      const result = yield* scenario({ agent: "backend", trigger: "manual", admitted: "after" })
      expect(result.stored).toEqual([{ on: "FOLD_NEXT", admission: ADMISSION }])
      expect(result.sent("FOLD_NEXT")).toBe(1)
      expect(result.sent("FOLD_AFTER")).toBe(1)
    }),
  120_000,
)

it.instance(
  "an agent without the Atlas capability gets nothing back",
  () =>
    Effect.gen(function* () {
      const result = yield* scenario({ agent: "general", trigger: "manual", admitted: "first" })
      expect(result.stored).toEqual([{ on: "FOLD_SEED_0", admission: ADMISSION }])
      expect(result.sent("FOLD_NEXT")).toBe(0)
    }),
  120_000,
)
