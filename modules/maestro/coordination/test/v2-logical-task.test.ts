import { createHash } from "node:crypto"
import { expect, test } from "bun:test"
import { ToolFailure } from "@orchestra/llm"
import { Effect, type Layer, type Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Project } from "@orchestra/core/project"
import { SessionStore } from "@orchestra/core/session"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { LogicalTaskV2 } from "../src/v2/governance/logical-task"
import { event, governanceLayer, session, worktree } from "./fixture/v2-governance"

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(governanceLayer(directory)))
      }),
    ),
  )

const refusal = <R>(effect: Effect.Effect<unknown, ToolFailure, R>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.message))

const services = Effect.gen(function* () {
  const database = yield* Database.Service
  return {
    db: database.db,
    events: yield* EventV2.Service,
    store: yield* SessionStore.Service,
    canonical: (id: string) => id,
  }
})

const projectID = Project.ID.global

/** A root Maestro Session with one backend child, the shape a Task delegation leaves. */
const tree = (directory: string) =>
  Effect.gen(function* () {
    const rootID = yield* session({ directory, agent: "maestro" })
    return { root: rootID, child: yield* session({ directory, agent: "backend", parentID: rootID }) }
  })

test("a lenient resume sees only direct children of the caller for the selected agent", () =>
  run((directory) =>
    Effect.gen(function* () {
      const logical = yield* services
      const ids = yield* tree(directory)
      const rootID = ids.root
      const childID = ids.child
      const resume = (taskID: string | undefined, memberID = "backend", parentSessionID: string = rootID) =>
        LogicalTaskV2.resolveResume(logical, { taskID, strict: false, parentSessionID, projectID, memberID })
      expect(yield* resume(undefined)).toBeUndefined()
      // A malformed or foreign id starts a fresh child instead of resuming one.
      expect(yield* resume("tsk_unknown")).toBeUndefined()
      expect(yield* resume(childID, "backend", yield* session({ directory, agent: "maestro" }))).toBeUndefined()
      expect((yield* resume(childID))?.id).toBe(childID)
      expect(yield* refusal(resume(childID, "general"))).toBe("Task resume denied: task is not direct child for selected agent")
    }),
  ))

test("a strict resume names retained work by tsk_ id or Session ID and refuses anything else", () =>
  run((directory) =>
    Effect.gen(function* () {
      const logical = yield* services
      const ids = yield* tree(directory)
      const rootID = ids.root
      const childID = ids.child
      const resume = (taskID: string, parentSessionID: string = rootID) =>
        LogicalTaskV2.resolveResume(logical, { taskID, strict: true, parentSessionID, projectID, memberID: "backend" })
      expect(yield* refusal(resume("tsk_unknown"))).toBe("Task resume denied: unknown-task")
      const binding = yield* LogicalTaskV2.ensure(logical, {
        executionSessionID: childID, authoritySessionID: rootID, projectID, memberID: "backend", source: "host",
      })
      expect((yield* resume(binding.taskId))?.id).toBe(childID)
      expect((yield* resume(childID))?.id).toBe(childID)
      // Retained work of another parent is never adopted by a strict caller.
      expect(yield* refusal(resume(binding.taskId, yield* session({ directory, agent: "maestro" }))))
        .toBe("Task resume denied: task is not direct child for selected agent")
    }),
  ))

test("ensure binds an execution Session once and refuses a different binding", () =>
  run((directory) =>
    Effect.gen(function* () {
      const logical = yield* services
      const ids = yield* tree(directory)
      const rootID = ids.root
      const childID = ids.child
      const input = { executionSessionID: childID, authoritySessionID: rootID, projectID, memberID: "backend", source: "host" as const }
      const binding = yield* LogicalTaskV2.ensure(logical, input)
      expect(binding).toEqual({ ...input, taskId: binding.taskId })
      expect(binding.taskId).toStartWith("tsk_")
      // A retry of the same binding returns the stored one.
      expect(yield* LogicalTaskV2.ensure(logical, input)).toEqual(binding)
      expect(yield* LogicalTaskV2.ensure(logical, { ...input, taskId: binding.taskId })).toEqual(binding)
      expect(yield* refusal(LogicalTaskV2.ensure(logical, { ...input, source: "dispatch" })))
        .toBe("Task binding denied: task-binding-mismatch")
      expect(yield* refusal(LogicalTaskV2.ensure(logical, { ...input, taskId: "tsk_other" })))
        .toBe("Task binding denied: task-binding-mismatch")
      const fresh = yield* session({ directory, agent: "backend", parentID: rootID })
      expect(yield* refusal(LogicalTaskV2.ensure(logical, { ...input, executionSessionID: fresh, authoritySessionID: fresh })))
        .toBe("Task binding denied: task-authority-mismatch")
      expect(yield* refusal(LogicalTaskV2.ensure(logical, { ...input, executionSessionID: fresh, source: "user", taskId: "ses_named" })))
        .toBe("Task binding denied: task-id-invalid")
    }),
  ))

test("a binding V1 recorded under the immediate parent reads with the root as its authority", () =>
  run((directory) =>
    Effect.gen(function* () {
      const logical = yield* services
      const ids = yield* tree(directory)
      const rootID = ids.root
      const childID = ids.child
      const grandchildID = yield* session({ directory, agent: "backend", parentID: childID })
      const v1 = {
        taskId: "tsk_v1_recorded", projectID, memberID: "backend", executionSessionID: grandchildID,
        authoritySessionID: childID, source: "host",
      }
      yield* event(
        `evt_maestro_task_bound_${createHash("sha256").update(grandchildID, "utf8").digest("hex")}`,
        grandchildID,
        EventV2.versionedType(MaestroEvent.Task.Bound.type, 1),
        v1,
      )
      expect(yield* LogicalTaskV2.read(logical, grandchildID)).toEqual({ ...v1, authoritySessionID: rootID })
      const resumed = yield* LogicalTaskV2.resolveResume(logical, {
        taskID: "tsk_v1_recorded", strict: true, parentSessionID: childID, projectID, memberID: "backend",
      })
      expect(resumed?.id).toBe(grandchildID)
    }),
  ))

test("a reserved child's logical task reuses its reservation hash", () => {
  expect(LogicalTaskV2.origin(undefined, false)).toEqual({ source: "host" })
  expect(LogicalTaskV2.origin("ses_maestro_dispatch_abc", false)).toEqual({ source: "dispatch", taskId: "tsk_abc" })
  expect(LogicalTaskV2.origin("ses_maestro_approval_def", true)).toEqual({ source: "governed", taskId: "tsk_def" })
})
