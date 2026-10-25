import { expect, test } from "bun:test"
import { DateTime, Deferred, Effect, Layer, Ref } from "effect"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionSchema, SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { TaskTool } from "@orchestra/core/tool/task"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { AgentV2 } from "@orchestra/core/agent"
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
          // Delivery ignores the admitted record, so the capture ends the call once it has seen the input.
          prompt: (input) =>
            Ref.update(prompts, (count) => count + 1).pipe(
              Effect.andThen(Deferred.succeed(delivered, input)),
              Effect.andThen(Effect.die("captured")),
            ),
          revert: { stage: unused, clear: unused, commit: unused },
        })
        yield* Effect.gen(function* () {
          const parentID = yield* session({ directory, agent: "maestro" })
          expect(yield* admit({ directory, caller: "maestro", target: "general", parentID, extra: { background: true } }))
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
          yield* admit({ directory, caller: "maestro", target: "general", parentID, extra: { background: true } })
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
