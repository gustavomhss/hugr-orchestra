import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { DateTime, Deferred, Effect, Exit, Layer, Ref, Schedule, Scope } from "effect"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionSchema, SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { TaskTool } from "@orchestra/core/tool/task"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { EventV2 } from "@orchestra/core/event"
import { GovernanceBackgroundV2 } from "../src/v2/governance/background"
import { admit, governanceLayer, session, worktree } from "./fixture/v2-governance"

const unused = () => Effect.die("not used by background delivery")
const created = DateTime.makeUnsafe(0)

// The fixture's `admit` context; core Task derives the child and its prompt from it.
const context = (parentID: SessionSchema.ID) => ({
  sessionID: parentID,
  agent: AgentV2.ID.make("maestro"),
  assistantMessageID: SessionMessage.ID.make("msg_governance_fixture"),
  toolCallID: "call_governance_fixture",
})

test("a background Task returns at once and delivers the child's reply to its parent exactly once", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        const delivered = yield* Deferred.make<Parameters<SessionV2.Interface["prompt"]>[0]>()
        const prompts = yield* Ref.make(0)
        const reply = yield* Ref.make<ReadonlyArray<SessionMessage.Message>>([])
        const sessions = Layer.mock(SessionV2.Service, {
          wait: () => Effect.void,
          messages: () => Ref.get(reply).pipe(Effect.map((messages) => [...messages])),
          // Delivery ignores the admitted record, so the capture parks the call once it has seen the input; a failed
          // call would be retried and counted again.
          prompt: (input) =>
            Ref.update(prompts, (count) => count + 1).pipe(
              Effect.andThen(Deferred.succeed(delivered, input)),
              Effect.andThen(Effect.never),
            ),
          revert: { stage: unused, clear: unused, commit: unused },
        })
        yield* Effect.gen(function* () {
          const parentID = yield* session({ directory, agent: "maestro" })
          expect(yield* admit({ directory, caller: "custom", target: "general", parentID, extra: { background: true } }))
            .toEqual({ background: true })
          const childID = TaskTool.taskChildID(context(parentID))
          const promptID = TaskTool.taskPromptID(context(parentID), childID)
          yield* Ref.set(reply, [
            SessionMessage.User.make({ id: promptID, type: "user", text: "p", time: { created } }),
            SessionMessage.Assistant.make({
              id: SessionMessage.ID.make("msg_background_reply"),
              type: "assistant",
              agent: "general",
              model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
              content: [SessionMessage.AssistantText.make({ type: "text", id: "text", text: "child result" })],
              finish: "stop",
              time: { created, completed: created },
            }),
          ])
          const store = yield* SessionStore.Service
          const child = yield* store.get(yield* session({ directory, agent: "general", parentID, id: childID }))
          if (!child) return yield* Effect.die("fixture child missing")
          const governance = yield* TaskGovernance.Service
          // Every turn of the child passes the gate; only the first starts the watcher.
          yield* governance.beforeTurn(child)
          yield* governance.beforeTurn(child)
          const input = yield* Deferred.await(delivered)
          yield* governance.beforeTurn(child)
          yield* Effect.yieldNow
          expect(yield* Ref.get(prompts)).toBe(1)
          expect(input.sessionID).toBe(parentID)
          expect(input.id).toBe(
            GovernanceBackgroundV2.returnID(GovernanceBackgroundV2.watch({ parentID, childID, description: "d", context: context(parentID) })),
          )
          expect(input.prompt.text).toBe(
            [`Background task completed: d`, `task_id: ${childID}`, "", "<task_result>", "child result", "</task_result>"].join("\n"),
          )
        }).pipe(Effect.provide(governanceLayer(directory, sessions)))
      }),
    ),
  ))

test("a background child that ends without a completed reply returns a failure the parent can resume from", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        const delivered = yield* Deferred.make<string>()
        const sessions = Layer.mock(SessionV2.Service, {
          wait: () => Effect.void,
          messages: () => Effect.succeed([]),
          prompt: (input) => Deferred.succeed(delivered, input.prompt.text).pipe(Effect.andThen(Effect.die("captured"))),
          revert: { stage: unused, clear: unused, commit: unused },
        })
        yield* Effect.gen(function* () {
          const parentID = yield* session({ directory, agent: "maestro" })
          yield* admit({ directory, caller: "custom", target: "general", parentID, extra: { background: true } })
          const childID = TaskTool.taskChildID(context(parentID))
          const store = yield* SessionStore.Service
          const child = yield* store.get(yield* session({ directory, agent: "general", parentID, id: childID }))
          if (!child) return yield* Effect.die("fixture child missing")
          const governance = yield* TaskGovernance.Service
          yield* governance.beforeTurn(child)
          expect(yield* Deferred.await(delivered)).toStartWith(`Background task failed: d\ntask_id: ${childID}\n`)
        }).pipe(Effect.provide(governanceLayer(directory, sessions)))
      }),
    ),
  ))

test("a background return that keeps failing is retried, then held as a durable notice in the parent's history", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        const prompts = yield* Ref.make(0)
        const parent = yield* Deferred.make<SessionSchema.Info>()
        const sessions = Layer.mock(SessionV2.Service, {
          wait: () => Effect.void,
          messages: () => Effect.succeed([]),
          prompt: () => Ref.update(prompts, (count) => count + 1).pipe(Effect.andThen(Effect.die("parent inbox unavailable"))),
          get: () => Deferred.await(parent),
          message: () => Effect.succeed(undefined),
          revert: { stage: unused, clear: unused, commit: unused },
        })
        yield* Effect.gen(function* () {
          const parentID = yield* session({ directory, agent: "maestro" })
          yield* admit({ directory, caller: "custom", target: "general", parentID, extra: { background: true } })
          const childID = TaskTool.taskChildID(context(parentID))
          const store = yield* SessionStore.Service
          const parentInfo = yield* store.get(parentID)
          const child = yield* store.get(yield* session({ directory, agent: "general", parentID, id: childID }))
          if (!parentInfo || !child) return yield* Effect.die("fixture session missing")
          yield* Deferred.succeed(parent, parentInfo)
          const governance = yield* TaskGovernance.Service
          yield* governance.beforeTurn(child)
          const database = yield* Database.Service
          const held = yield* database.db.select().from(EventV2.EventTable).where(eq(EventV2.EventTable.aggregate_id, parentID))
            .all().pipe(
              Effect.orDie,
              Effect.map((rows) => rows.filter((row) => row.type.startsWith("session.next.synthetic"))),
              Effect.repeat({ until: (rows) => rows.length > 0, schedule: Schedule.spaced("50 millis") }),
              Effect.timeout("5 seconds"),
            )
          expect(yield* Ref.get(prompts)).toBe(GovernanceBackgroundV2.RETRIES + 1)
          expect(held).toHaveLength(1)
          expect(held[0].data).toMatchObject({
            messageID: GovernanceBackgroundV2.holdID(
              GovernanceBackgroundV2.watch({ parentID, childID, description: "d", context: context(parentID) }),
            ),
            text: expect.stringContaining(`task_id: ${childID}`),
          })
        }).pipe(Effect.provide(governanceLayer(directory, sessions)))
      }),
    ),
  ))

test("audit: each distinct background prompt on a resumed child returns to its parent", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const first = yield* Deferred.make<void>()
    const second = yield* Deferred.make<void>()
    const received: string[] = []
    const sessions = {
      wait: () => Effect.void,
      messages: () => Effect.succeed([]),
      prompt: (input: Parameters<SessionV2.Interface["prompt"]>[0]) => Effect.gen(function* () {
        received.push(String(input.id))
        yield* Deferred.succeed(received.length === 1 ? first : second, undefined)
      }),
    } as unknown as SessionV2.Interface
    // The events port is unused unless delivery fails; no failure is injected here.
    const background = yield* GovernanceBackgroundV2.make({} as EventV2.Interface)
    const parentID = SessionSchema.ID.make("ses_audit_parent")
    const childID = SessionSchema.ID.make("ses_audit_child")
    const initial = GovernanceBackgroundV2.watch({ parentID, childID, description: "first", context: context(parentID) })
    background.register(initial)
    yield* background.start(sessions, childID)
    yield* Deferred.await(first).pipe(Effect.timeout("2 seconds"))
    const resumed = GovernanceBackgroundV2.watch({ parentID, childID, description: "second", context: {
      ...context(parentID), toolCallID: "call_audit_resumed",
    } })
    expect(resumed.promptID).not.toBe(initial.promptID)
    background.register(resumed)
    yield* background.start(sessions, childID)
    yield* Deferred.await(second).pipe(Effect.timeout("2 seconds"))
    expect(received).toEqual([GovernanceBackgroundV2.returnID(initial), GovernanceBackgroundV2.returnID(resumed)])
  }))),
)


test("pending background prompts survive another registration and repeated starts deduplicate each prompt", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const idle = yield* Deferred.make<void>()
    const delivered = yield* Deferred.make<void>()
    const received: string[] = []
    const sessions = {
      wait: () => Deferred.await(idle),
      messages: () => Effect.succeed([]),
      prompt: (input: Parameters<SessionV2.Interface["prompt"]>[0]) => Effect.gen(function* () {
        received.push(String(input.id))
        if (received.length === 2) yield* Deferred.succeed(delivered, undefined)
        // Leave both watchers active so another beforeTurn must deduplicate them.
        yield* Effect.never
      }),
    } as unknown as SessionV2.Interface
    const background = yield* GovernanceBackgroundV2.make({} as EventV2.Interface)
    const parentID = SessionSchema.ID.make("ses_pending_parent")
    const childID = SessionSchema.ID.make("ses_pending_child")
    const first = GovernanceBackgroundV2.watch({ parentID, childID, description: "first", context: context(parentID) })
    const second = GovernanceBackgroundV2.watch({ parentID, childID, description: "second", context: {
      ...context(parentID), toolCallID: "call_pending_resumed",
    } })
    background.register(first)
    background.register(second)
    background.register(first)
    yield* background.start(sessions, childID)
    yield* background.start(sessions, childID)
    background.register(second)
    yield* Deferred.succeed(idle, undefined)
    yield* Deferred.await(delivered).pipe(Effect.timeout("2 seconds"))
    yield* background.start(sessions, childID)
    yield* Effect.yieldNow
    expect(received.toSorted()).toEqual([
      GovernanceBackgroundV2.returnID(first), GovernanceBackgroundV2.returnID(second),
    ].toSorted())
  }))),
)

test("completed watches retire and a later exact retry reconciles one durable parent input", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* worktree
    yield* Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      const childID = yield* session({ directory, agent: "general", parentID })
      const sessions = yield* SessionV2.Service
      const events = yield* EventV2.Service
      const database = yield* Database.Service
      const background = yield* GovernanceBackgroundV2.make(events)
      const input = GovernanceBackgroundV2.watch({ parentID, childID, description: "retry", context: context(parentID) })
      const settled = Effect.sync(() => background.has(childID)).pipe(
        Effect.repeat({ until: (pending) => !pending, schedule: Schedule.spaced("5 millis") }),
        Effect.timeout("2 seconds"),
      )
      background.register(input)
      yield* background.start(sessions, childID)
      yield* settled
      const original = yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      expect(original).toHaveLength(1)
      expect(original[0].id).toBe(GovernanceBackgroundV2.returnID(input))
      // The first return is still pending in the real inbox, without a projected user message.
      expect(yield* sessions.message({ sessionID: parentID, messageID: GovernanceBackgroundV2.returnID(input) }))
        .toBeUndefined()
      background.register(input)
      yield* background.start(sessions, childID)
      yield* settled
      expect(yield* database.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(original)
    }).pipe(Effect.provide(AppNodeBuilder.build(
      LayerNode.group([Database.node, EventV2.node, SessionV2.node]),
      [[Database.node, Database.layerFromPath(":memory:")], [SessionExecution.node, SessionExecution.noopLayer]],
    )))
  }))),
)


test("a removed parent exhausts bounded delivery and retires its failed HOLD watch", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const attempts = yield* Ref.make(0)
    const holds = yield* Ref.make(0)
    const sessions = {
      wait: () => Effect.void,
      messages: () => Effect.succeed([]),
      prompt: () => Ref.update(attempts, (count) => count + 1).pipe(Effect.andThen(Effect.die("parent removed"))),
      get: () => Ref.update(holds, (count) => count + 1).pipe(Effect.andThen(Effect.die("parent removed"))),
    } as unknown as SessionV2.Interface
    const background = yield* GovernanceBackgroundV2.make({} as EventV2.Interface)
    const parentID = SessionSchema.ID.make("ses_removed_parent")
    const childID = SessionSchema.ID.make("ses_removed_child")
    background.register(GovernanceBackgroundV2.watch({ parentID, childID, description: "removed", context: context(parentID) }))
    yield* background.start(sessions, childID)
    yield* Effect.sync(() => background.has(childID)).pipe(
      Effect.repeat({ until: (pending) => !pending, schedule: Schedule.spaced("10 millis") }),
      Effect.timeout("2 seconds"),
    )
    expect(yield* Ref.get(attempts)).toBe(GovernanceBackgroundV2.RETRIES + 1)
    expect(yield* Ref.get(holds)).toBe(1)
  }))),
)

test("closing the scope interrupts active watches and releases unstarted registrations", () =>
  Effect.runPromise(Effect.gen(function* () {
    const scope = yield* Scope.make()
    const entered = yield* Deferred.make<void>()
    const interrupted = yield* Deferred.make<void>()
    const background = yield* GovernanceBackgroundV2.make({} as EventV2.Interface).pipe(Effect.provideService(Scope.Scope, scope))
    const parentID = SessionSchema.ID.make("ses_scope_parent")
    const childID = SessionSchema.ID.make("ses_scope_child")
    const queuedID = SessionSchema.ID.make("ses_scope_queued")
    const sessions = {
      wait: () => Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Deferred.succeed(interrupted, undefined)),
      ),
    } as unknown as SessionV2.Interface
    background.register(GovernanceBackgroundV2.watch({ parentID, childID, description: "active", context: context(parentID) }))
    background.register(GovernanceBackgroundV2.watch({ parentID, childID: queuedID, description: "queued", context: context(parentID) }))
    yield* background.start(sessions, childID)
    yield* Deferred.await(entered).pipe(Effect.timeout("2 seconds"))
    yield* Scope.close(scope, Exit.void)
    expect(yield* Deferred.isDone(interrupted)).toBe(true)
    expect(background.has(childID)).toBe(false)
    expect(background.has(queuedID)).toBe(false)
  })),
)
