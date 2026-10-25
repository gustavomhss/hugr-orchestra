import { describe, expect, test } from "bun:test"
import { LLM, Message } from "@orchestra/llm"
import { DateTime, Deferred, Effect, Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import {
  SessionEvent,
  SessionHistory,
  SessionMessage,
  SessionStore,
  SessionSubagentModels,
  SessionV2,
} from "@orchestra/core/session"
import { Prompt } from "@orchestra/core/session/prompt"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ContinuityStrategy } from "../src/v2/strategy"
import { config, llm, model, recallTools, run, seed, step } from "./fixture"

const it = run(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, EventV2.node, SessionProjector.node, SessionSubagentModels.node, SessionStore.node]),
  ),
)

const sessionID = SessionV2.ID.make("ses_maintenance")
const SUMMARY = "## Objective\n- Continue the stored work"
// A 20k window: the background summary starts at 8000 tokens (0.4), the hard limit is 14000.
const target = model(20_000)
const entries = config({ compaction: { buffer: 1_000, keep: { tokens: 200 } } })
const tokens = (input: number) => ({ input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } })

const fixture = (summary: () => string | undefined, gate: Effect.Effect<void> = Effect.void) =>
  Effect.gen(function* () {
    yield* seed(sessionID)
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    const client = llm(summary, gate)
    const shared = ContinuityStrategy.state(ContinuityStrategy.settings(entries))
    const compaction = ContinuityStrategy.make({
      events,
      llm: client,
      subagentModels: yield* SessionSubagentModels.Service,
      store: yield* SessionStore.Service,
      config: entries,
      state: shared,
      scope: yield* Scope.Scope,
    })
    let order = 0
    const prompt = (id: string, text: string) =>
      events.publish(SessionEvent.Prompted, {
        sessionID,
        messageID: SessionMessage.ID.make(id),
        timestamp: DateTime.makeUnsafe(++order),
        prompt: Prompt.make({ text }),
        delivery: "steer",
      })
    yield* prompt("msg_one", `ONE ${"work ".repeat(1_500)}`)
    yield* prompt("msg_two", `TWO ${"work ".repeat(1_500)}`)
    const input = (messages: readonly Message[] = [Message.user("next")]) =>
      SessionHistory.entriesForRunner(database.db, sessionID, 0).pipe(
        Effect.map((stored) => ({
          sessionID,
          entries: stored,
          model: target,
          request: LLM.request({ model: target, messages: [...messages], tools: recallTools }),
        })),
      )
    // The provider turn records its model; the turn's compaction check records its request.
    yield* compaction.transform({ sessionID, messages: [], model: target, tools: recallTools })
    expect(yield* compaction.compactIfNeeded(yield* input())).toBe(false)
    const session = shared.session(sessionID)
    // Captures the running summary now: once released it may finish, and clear `running`, before the test resumes.
    const pending = () => {
      const running = session.running
      return running ? Deferred.await(running) : Effect.succeed(false)
    }
    const history = SessionHistory.load(database.db, sessionID)
    return { compaction, client, session, pending, input, prompt, history }
  })

describe("ContinuityStrategy background summary", () => {
  test("starts at the trigger share and lands before the next turn", () =>
    it(
      Effect.gen(function* () {
        const f = yield* fixture(() => SUMMARY)
        yield* f.compaction.afterStep({ sessionID, tokens: tokens(7_000), model: undefined })
        expect(f.session.running).toBeUndefined()
        const before = yield* f.input()
        yield* f.compaction.afterStep({ sessionID, tokens: tokens(8_000), model: undefined })
        // The turn that read its context before the summary landed restarts on the compacted history, once.
        expect(yield* f.compaction.compactIfNeeded(before)).toBe(true)
        expect(f.client.requests).toHaveLength(1)
        expect(yield* f.history).toMatchObject([{ type: "compaction", reason: "auto", summary: SUMMARY }])
        expect(yield* f.compaction.compactIfNeeded(yield* f.input())).toBe(false)
      }),
    ))

  test("runs once per Session at a time", () =>
    it(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()
        const f = yield* fixture(() => SUMMARY, Deferred.await(gate))
        yield* f.compaction.afterStep({ sessionID, tokens: tokens(9_000), model: undefined })
        const done = f.pending()
        yield* f.compaction.afterStep({ sessionID, tokens: tokens(9_000), model: undefined })
        yield* Deferred.succeed(gate, undefined)
        expect(yield* done).toBe(true)
        expect(f.client.requests).toHaveLength(1)
      }),
    ))

  test("drops a summary whose Session changed while it ran", () =>
    it(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>()
        const f = yield* fixture(() => SUMMARY, Deferred.await(gate))
        yield* f.compaction.afterStep({ sessionID, tokens: tokens(9_000), model: undefined })
        const done = f.pending()
        expect(f.session.running).toBeDefined()
        yield* f.prompt("msg_three", "THREE")
        yield* Deferred.succeed(gate, undefined)
        expect(yield* done).toBe(false)
        expect(f.client.requests).toHaveLength(1)
        expect((yield* f.history).map((message) => message.type)).toEqual(["user", "user", "user"])
        expect(f.session.failures).toBe(0)
      }),
    ))

  test("stops after three consecutive failures", () =>
    it(
      Effect.gen(function* () {
        const f = yield* fixture(() => undefined)
        for (const attempt of [1, 2, 3]) {
          yield* f.compaction.afterStep({ sessionID, tokens: tokens(9_000), model: undefined })
          expect(yield* f.pending()).toBe(false)
          expect(f.session.failures).toBe(attempt)
        }
        yield* f.compaction.afterStep({ sessionID, tokens: tokens(9_000), model: undefined })
        expect(f.session.running).toBeUndefined()
        expect(f.client.requests).toHaveLength(3)
      }),
    ))
})

describe("ContinuityStrategy compaction", () => {
  test("a requested compaction summarizes before the next turn", () =>
    it(
      Effect.gen(function* () {
        const f = yield* fixture(() => SUMMARY)
        f.session.requested = true
        expect(yield* f.compaction.compactIfNeeded(yield* f.input())).toBe(true)
        expect(f.session.requested).toBe(false)
        expect(yield* f.history).toMatchObject([{ type: "compaction", reason: "manual", summary: SUMMARY }])
      }),
    ))

  test("a failed summary after an overflow falls back to masking", () =>
    it(
      Effect.gen(function* () {
        const f = yield* fixture(() => undefined)
        const messages = [1, 2, 3].flatMap((index) => step(index, "bash", `OUT${index} ${"x".repeat(800)}`))
        expect(yield* f.compaction.compactAfterOverflow(yield* f.input(messages))).toBe(true)
        expect([...f.session.masks.keys()]).toEqual(["call_1", "call_2"])
        expect((yield* f.history).map((message) => message.type)).toEqual(["user", "user"])
      }),
    ))
})
