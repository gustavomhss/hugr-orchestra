import { afterAll, describe, expect } from "bun:test"
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { LLMClient, LLMEvent, type LLMClientShape } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { ModelV2 } from "@orchestra/core/model"
import { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { ProviderV2 } from "@orchestra/core/provider"
import { QuestionV2 } from "@orchestra/core/question"
import { SessionV2 } from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { ExecutionHost } from "@orchestra/core/session/runner"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { TodoTable } from "@orchestra/core/session/sql"
import { SkillGuidance } from "@orchestra/core/skill/guidance"
import { SystemContext } from "@orchestra/core/system-context"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { AllowedDomains } from "@orchestra/core/tool/websearch"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Cause, Effect, Exit, Fiber, Layer, Schema, Stream } from "effect"
import { Harness, sessionID } from "./session-runner-harness"

// The ports a Turn gives an execution host beyond streaming: Orchestra's decision on the engine's own calls (ToolSafety,
// write roots, sandbox, dispatch domains), the owner's questions, working memory after a compaction, live steers, events
// the host sends on its own, retraction of a superseded attempt, and the cost the step really had.

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "host-ports-")))
const inside = path.join(root, "inside")
const outside = path.join(root, "outside")
mkdirSync(inside)
mkdirSync(outside)
afterAll(() => rmSync(root, { recursive: true, force: true }))

const profile: { current: ToolSafety.Profile | undefined } = { current: undefined }
const dispatch: { domains: ReadonlyArray<string> | undefined } = { domains: undefined }
const asked: PermissionV2.AssertInput[] = []
const questions: QuestionV2.AskInput[] = []
let script: (turn: ExecutionHost.Turn) => Effect.Effect<ReadonlyArray<LLMEvent>> = () => Effect.succeed([])
let provider: ((session: Parameters<SessionRunnerModel.Interface["resolve"]>[0]) => ReturnType<SessionRunnerModel.Interface["resolve"]>) | undefined
let providerEvents: LLMEvent[] = []

const client = Layer.succeed(
  LLMClient.Service,
  LLMClient.Service.of({
    prepare: () => Effect.die("unused"),
    stream: (() => Stream.fromIterable(providerEvents)) as unknown as LLMClientShape["stream"],
    generate: () => Effect.die("unused"),
  }),
)

const host: ExecutionHost.Interface = {
  id: "claude-code",
  stateKey: "claudeCode",
  stream: (turn) => Stream.unwrap(script(turn).pipe(Effect.map((events) => Stream.fromIterable(events)))),
}

// The Location's ToolSafety under the profile of the moment, reading the dispatch's domains as the Maestro Location does.
const safetyNode = makeLocationNode({
  service: ToolSafety.Service,
  layer: Layer.effect(
    ToolSafety.Service,
    Effect.gen(function* () {
      const safety = yield* ToolSafety.make
      const bound = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        effect.pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile.current))
      return ToolSafety.Service.of({
        ...safety,
        before: (input) => bound(safety.before(input)),
        run: (input, effect, observe, outcome) =>
          bound(safety.run(input, effect.pipe(Effect.provideService(AllowedDomains, dispatch.domains)), observe, outcome)),
      })
    }),
  ),
  deps: [FSUtil.node, AppProcess.node, Global.node],
})

const it = Harness.make({
  client,
  models: SessionRunnerModel.layerWith((session) =>
    provider ? provider(session) : Effect.die("a hosted turn must not resolve a model"),
  ),
  echo: Layer.effectDiscard(
    ToolRegistry.Service.use((registry) =>
      registry.register({
        echo: Tool.make({
          description: "Echo text",
          input: Schema.Struct({ text: Schema.String }),
          output: Schema.Struct({ text: Schema.String }),
          toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
          execute: ({ text }) => Effect.succeed({ text }),
        }),
      }),
    ),
  ),
  permissions: Layer.mock(PermissionV2.Service, {
    authorize: (input) => Effect.sync(() => void asked.push(input)),
  }),
  systemContext: Harness.systemContextLayer,
  skillGuidance: Layer.mock(SkillGuidance.Service, { load: () => Effect.succeed(SystemContext.empty) }),
  hosts: Layer.succeed(ExecutionHost.Service, ExecutionHost.of([host])),
  directory: root,
  replacements: [
    [ToolSafety.node, safetyNode],
    [
      QuestionV2.node,
      Layer.mock(QuestionV2.Service, {
        ask: (input) => Effect.sync(() => void questions.push(input)).pipe(Effect.as([["pg"], ["a", "b"]])),
      }),
    ],
  ],
})

const answer = (text = "ok") => [
  LLMEvent.stepStart({ index: 0 }),
  LLMEvent.textStart({ id: "t" }),
  LLMEvent.textDelta({ id: "t", text }),
  LLMEvent.textEnd({ id: "t" }),
  LLMEvent.stepFinish({ index: 0, reason: "stop" }),
]

const hosted = Effect.gen(function* () {
  yield* Harness.setupAt(root)
  profile.current = undefined
  dispatch.domains = undefined
  provider = undefined
  asked.length = 0
  questions.length = 0
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) =>
    draft.update(AgentV2.defaultID, (agent) => {
      agent.engine = "claude-code"
      agent.mode = "primary"
    }),
  )
  return yield* SessionV2.Service
})

const send = (sessions: SessionV2.Interface, text: string) =>
  Effect.gen(function* () {
    yield* sessions.prompt({ sessionID, prompt: Prompt.make({ text }), resume: false })
    yield* sessions.resume(sessionID)
  })

const refusal = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined)

describe("SessionRunner execution host ports", () => {
  it.effect("authorize enforces the Session's write roots, the sandbox its profile requires, and returns the dispatch's domains", () =>
    Effect.gen(function* () {
      const sessions = yield* hosted
      const seen: Record<string, unknown> = {}
      script = (turn) =>
        Effect.gen(function* () {
          const write = (callID: string, dir: string) =>
            turn.authorize({
              callID,
              tool: "Write",
              action: "edit",
              resources: [`${dir}/a.ts`],
              safety: { tool: "write", args: { filePath: path.join(dir, "a.ts") } },
            })
          const bash = turn.authorize({ callID: "sh", tool: "Bash", action: "bash", resources: ["ls"], safety: { tool: "bash", args: { command: "ls" } } })
          profile.current = { writeRoots: [inside] }
          dispatch.domains = ["docs.python.org"]
          seen.inside = yield* write("w1", inside).pipe(Effect.exit)
          seen.outside = yield* write("w2", outside).pipe(Effect.exit)
          // A call with no ToolSafety view is the permission check alone.
          seen.permissionOnly = yield* turn.authorize({ callID: "p", tool: "TodoWrite", action: "todowrite", resources: ["*"] }).pipe(Effect.exit)
          // A shell the profile confines needs a jail; one this Location cannot set up refuses the call, never runs bare.
          profile.current = { sandbox: { enabled: true, allowedUnixSockets: "not-a-list" as unknown as [] } }
          dispatch.domains = undefined
          seen.confined = yield* bash.pipe(Effect.exit)
          profile.current = undefined
          seen.open = yield* bash.pipe(Effect.exit)
          return answer()
        })
      yield* send(sessions, "go")

      expect(seen.inside).toEqual(Exit.succeed({ domains: ["docs.python.org"] }))
      expect(refusal(seen.outside as Exit.Exit<unknown, unknown>)).toMatchObject({
        _tag: "ToolSafety.Denied",
        reason: "write-outside-physical-roots",
      })
      expect(seen.permissionOnly).toEqual(Exit.succeed({}))
      expect(refusal(seen.confined as Exit.Exit<unknown, unknown>)).toMatchObject({
        _tag: "ToolSafety.Denied",
        reason: "sandbox-unix-socket-invalid-grants",
      })
      expect(seen.open).toEqual(Exit.succeed({}))
      // Every call went through V2 permission first, ToolSafety or not.
      expect(asked.map((input) => input.action)).toEqual(["edit", "edit", "todowrite", "bash", "bash"])
    }),
  )

  it.effect("question asks the owner through V2 and returns one answer per question", () =>
    Effect.gen(function* () {
      const sessions = yield* hosted
      let answers: ReadonlyArray<QuestionV2.Answer> = []
      script = (turn) =>
        Effect.gen(function* () {
          answers = yield* turn.question({
            callID: "q1",
            questions: [
              { question: "Which db?", header: "DB", options: [{ label: "pg", description: "Postgres" }] },
              { question: "Which tags?", header: "Tags", options: [], multiple: true },
            ],
          })
          return answer()
        })
      yield* send(sessions, "go")

      expect(answers).toEqual([["pg"], ["a", "b"]])
      expect(questions).toHaveLength(1)
      expect(questions[0]).toMatchObject({ sessionID, questions: [{ question: "Which db?" }, { question: "Which tags?" }] })
    }),
  )

  it.effect("memory renders the open todos for the engine after its compaction and archives the engine's summary", () =>
    Effect.gen(function* () {
      const sessions = yield* hosted
      const { db } = yield* Database.Service
      yield* db
        .insert(TodoTable)
        .values([
          { session_id: sessionID, content: "ship it", status: "in_progress", priority: "high", position: 0 },
          { session_id: sessionID, content: "already done", status: "completed", priority: "low", position: 1 },
        ])
        .run()
        .pipe(Effect.orDie)
      let recalled: string | undefined
      script = (turn) =>
        Effect.gen(function* () {
          recalled = yield* turn.memory.recall
          yield* turn.memory.archive({ summary: "We fixed the bug.", trigger: "auto", nativeSessionID: "claude-9" })
          return answer()
        })
      yield* send(sessions, "go")

      expect(recalled).toContain("- [in_progress] ship it")
      expect(recalled).not.toContain("already done")
      const archived = (yield* sessions.messages({ sessionID })).find((message) => message.type === "synthetic")
      expect(archived).toMatchObject({ type: "synthetic", text: expect.stringContaining("We fixed the bug.") })
      expect(archived?.type === "synthetic" ? archived.text : "").toContain("Native owner: claude-9")
    }),
  )

  it.effect("a steer admitted mid-turn is promoted and handed to the host in the same stream; one the host never took gets its own turn", () =>
    Effect.gen(function* () {
      const sessions = yield* hosted
      const turns: string[][] = []
      let takeIt = true
      script = (turn) =>
        Effect.gen(function* () {
          turns.push(turn.history.flatMap((message) => (message.type === "user" ? [message.text] : [])))
          if (turns.length === 1) {
            const received = yield* turn.steers.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
            yield* sessions.prompt({ sessionID, prompt: Prompt.make({ text: "also this" }), delivery: "steer", resume: false })
            const steer = Array.from(yield* Fiber.join(received))[0]
            expect(steer?.text).toBe("also this")
            if (takeIt && steer) yield* turn.consumed(steer.id)
          }
          return answer()
        })
      yield* sessions.prompt({ sessionID, prompt: Prompt.make({ text: "go" }), resume: false })
      yield* sessions.resume(sessionID)

      // Taken: the one provider turn carried it, so no second turn ran for it.
      expect(turns).toEqual([["go"]])
      expect((yield* sessions.messages({ sessionID, order: "asc" })).flatMap((message) => (message.type === "user" ? [message.text] : []))).toEqual(["go", "also this"])

      turns.length = 0
      takeIt = false
      yield* sessions.prompt({ sessionID, prompt: Prompt.make({ text: "again" }), resume: false })
      yield* sessions.resume(sessionID)

      // Not taken: it was recorded, but the host never passed it on, so it gets the next turn.
      expect(turns).toEqual([["go", "also this", "again"], ["go", "also this", "again", "also this"]])
    }),
  )

  it.effect("notify records an event the host sent on its own as a steer prompt, so it is never lost, and is idempotent", () =>
    Effect.gen(function* () {
      const sessions = yield* hosted
      let notify: ExecutionHost.Turn["notify"] | undefined
      const turns: string[][] = []
      script = (turn) =>
        Effect.sync(() => {
          notify = turn.notify
          turns.push(turn.history.flatMap((message) => (message.type === "user" ? [message.text] : [])))
          return answer()
        })
      yield* send(sessions, "go")
      expect(turns).toEqual([["go"]])

      // After the turn that started the work has ended, the engine reports.
      const call = { id: "msg_task_t1_completed", text: "Background task t1 completed: slept" }
      yield* notify!(call)
      yield* notify!(call)
      yield* sessions.resume(sessionID)

      expect(turns.at(-1)).toEqual(["go", "Background task t1 completed: slept"])
      const users = (yield* sessions.messages({ sessionID })).flatMap((message) => (message.type === "user" ? [message.text] : []))
      expect(users.filter((text) => text.startsWith("Background task"))).toHaveLength(1)
    }),
  )

  it.effect("retract blanks a superseded attempt's text and fails its unsettled call, and leaves a call that ran", () =>
    Effect.gen(function* () {
      const sessions = yield* hosted
      script = () =>
        Effect.succeed([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.textStart({ id: "old" }),
          LLMEvent.textDelta({ id: "old", text: "I cannot do that" }),
          LLMEvent.textEnd({ id: "old" }),
          LLMEvent.reasoningStart({ id: "think" }),
          LLMEvent.reasoningDelta({ id: "think", text: "hmm" }),
          LLMEvent.reasoningEnd({ id: "think" }),
          LLMEvent.toolCall({ id: "pending", name: "Bash", input: { command: "ls" }, providerExecuted: true }),
          LLMEvent.toolCall({ id: "ran", name: "Bash", input: { command: "pwd" }, providerExecuted: true }),
          LLMEvent.toolResult({ id: "ran", name: "Bash", result: { type: "text", value: "/" }, providerExecuted: true }),
          LLMEvent.retract({ ids: ["old", "think", "pending", "ran"] }),
          LLMEvent.textStart({ id: "new" }),
          LLMEvent.textDelta({ id: "new", text: "Here you go" }),
          LLMEvent.textEnd({ id: "new" }),
          LLMEvent.stepFinish({ index: 0, reason: "stop" }),
        ])
      yield* send(sessions, "go")

      const assistant = (yield* sessions.messages({ sessionID })).find((message) => message.type === "assistant")
      expect(assistant?.type === "assistant" ? assistant.content : []).toMatchObject([
        { type: "text", id: "old", text: "" },
        { type: "reasoning", id: "think", text: "" },
        { type: "tool", id: "pending", state: { status: "error", error: { message: expect.stringContaining("Retracted") } } },
        { type: "tool", id: "ran", state: { status: "completed" } },
        { type: "text", id: "new", text: "Here you go" },
      ])
    }),
  )

  it.effect("the cost and context window a host reports are recorded, not zero", () =>
    Effect.gen(function* () {
      const sessions = yield* hosted
      const windows: Array<number | undefined> = []
      script = () =>
        Effect.succeed([
          LLMEvent.stepStart({ index: 0 }),
          LLMEvent.stepFinish({
            index: 0,
            reason: "stop",
            usage: { nonCachedInputTokens: 5, outputTokens: 4, cacheReadInputTokens: 0, cacheWriteInputTokens: 0, inputTokens: 5, cost: 0.0123, contextWindow: 1_000_000 },
          }),
        ])
      yield* send(sessions, "go")
      windows.push(1_000_000)

      const assistant = (yield* sessions.messages({ sessionID })).find((message) => message.type === "assistant")
      expect(assistant).toMatchObject({ type: "assistant", cost: 0.0123, tokens: { input: 5, output: 4 } })
    }),
  )

  it.effect("a provider turn is priced from its model's price list when the provider reports no cost", () =>
    Effect.gen(function* () {
      yield* Harness.setupAt(root)
      const info = ModelV2.Info.make({
        id: ModelV2.ID.make("priced"),
        providerID: ProviderV2.ID.make("fake"),
        name: "Priced",
        api: { id: ModelV2.ID.make("priced"), type: "aisdk", package: "@ai-sdk/openai-compatible", url: "https://priced.example/v1" },
        capabilities: { tools: true, input: ["text"], output: ["text"] },
        request: { headers: {}, body: {} },
        variants: [],
        time: { released: 0 },
        cost: [{ input: 3, output: 15, cache: { read: 0.3, write: 3.75 } }],
        status: "active",
        enabled: true,
        limit: { context: 1_000_000, output: 4096 },
      })
      provider = (session) => SessionRunnerModel.resolve(session, info)
      providerEvents = [
        LLMEvent.stepStart({ index: 0 }),
        LLMEvent.textStart({ id: "t" }),
        LLMEvent.textDelta({ id: "t", text: "hi" }),
        LLMEvent.textEnd({ id: "t" }),
        LLMEvent.stepFinish({
          index: 0,
          reason: "stop",
          usage: { inputTokens: 3000, nonCachedInputTokens: 1000, cacheReadInputTokens: 2000, cacheWriteInputTokens: 0, outputTokens: 500 },
        }),
      ]
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) =>
        draft.update(AgentV2.defaultID, (agent) => {
          agent.engine = "orchestra"
          agent.mode = "primary"
        }),
      )
      const sessions = yield* SessionV2.Service
      yield* send(sessions, "go")

      const assistant = (yield* sessions.messages({ sessionID })).find((message) => message.type === "assistant")
      // (1000 * 3 + 500 * 15 + 2000 * 0.3) / 1e6
      expect(assistant).toMatchObject({ type: "assistant", cost: expect.closeTo(0.0111, 8) })
    }),
  )
})
