import { afterEach, describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { eq } from "drizzle-orm"
import { Cause, Effect, Exit } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LogicalTask } from "@/maestro/logical-task"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// F2.11, F2-D1/D2: one durable logical-task binding per execution Session; strict resume resolves only retained work.

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  TestAppNodeBuilder.build(
    LayerNode.group([
      filesystem,
      Agent.node,
      BackgroundJob.node,
      EventV2Bridge.node,
      Git.node,
      Config.node,
      CrossSpawnSpawner.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      Truncate.node,
      ToolRegistry.node,
      Database.node,
      RuntimeFlags.node,
      Ripgrep.node,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

const child = Effect.fn("LogicalTaskTest.child")(function* () {
  const sessions = yield* Session.Service
  const parent = yield* sessions.create({ title: "authority" })
  const execution = yield* sessions.create({ parentID: parent.id, title: "execution", agent: "backend" })
  const input = {
    executionSessionID: execution.id,
    authoritySessionID: parent.id,
    projectID: parent.projectID,
    memberID: "backend",
    source: "host" as const,
  }
  return { parent, execution, input }
})

const denial = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "succeeded")

describe("LogicalTask", () => {
  it.instance("ensure is idempotent and binds a host task id that is not the Session ID", () =>
    Effect.gen(function* () {
      const { execution, input } = yield* child()
      const first = yield* LogicalTask.ensure(input)
      const again = yield* LogicalTask.ensure(input)
      expect(first.taskId).toMatch(/^tsk_/)
      expect(first.taskId).not.toBe(execution.id)
      expect(again).toEqual(first)
      expect(yield* LogicalTask.read(execution.id)).toEqual(first)
      const database = yield* Database.Service
      const rows = (yield* database.db
        .select({ id: EventTable.id, data: EventTable.data })
        .from(EventTable)
        .where(eq(EventTable.type, EventV2.versionedType(MaestroEvent.Task.Bound.type, 1)))
        .all()
        .pipe(Effect.orDie)).filter((row) => row.data.executionSessionID === execution.id)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).toStartWith("evt_maestro_task_bound_")
    }),
  )

  it.instance("a different binding on the same Session fails task-binding-mismatch", () =>
    Effect.gen(function* () {
      const { execution, input } = yield* child()
      const bound = yield* LogicalTask.ensure(input)
      for (const changed of [
        { ...input, taskId: "tsk_other" },
        { ...input, memberID: "general" },
        { ...input, projectID: "prj_other" },
        { ...input, source: "dispatch" as const },
      ]) {
        expect(denial(yield* Effect.exit(LogicalTask.ensure(changed)))).toContain(
          "Task binding denied: task-binding-mismatch",
        )
      }
      expect(yield* LogicalTask.read(execution.id)).toEqual(bound)
    }),
  )

  it.instance("a user-named task id binds after validation and never as a Session ID", () =>
    Effect.gen(function* () {
      const { input } = yield* child()
      expect(
        denial(yield* Effect.exit(LogicalTask.ensure({ ...input, source: "user", taskId: "ses_spoof" }))),
      ).toContain("Task binding denied: task-id-invalid")
      expect(denial(yield* Effect.exit(LogicalTask.ensure({ ...input, source: "user" })))).toContain("task-id-invalid")
      const named = yield* LogicalTask.ensure({ ...input, source: "user", taskId: "billing-refunds" })
      expect(named).toMatchObject({ taskId: "billing-refunds", source: "user" })
    }),
  )

  it.instance("reserved work derives the same task id on every replay", () =>
    Effect.sync(() => {
      const hash = "f".repeat(64)
      expect(LogicalTask.origin(`ses_maestro_approval_${hash}`, true)).toEqual({
        source: "governed",
        taskId: `tsk_${hash}`,
      })
      expect(LogicalTask.origin(`ses_maestro_dispatch_${hash}`, false)).toEqual({
        source: "dispatch",
        taskId: `tsk_${hash}`,
      })
      expect(LogicalTask.origin(undefined, false)).toEqual({ source: "host" })
    }),
  )

  it.instance("strict resume resolves a bound task and refuses unknown or cross-project input", () =>
    Effect.gen(function* () {
      const { parent, execution, input } = yield* child()
      const bound = yield* LogicalTask.ensure(input)
      const resume = (taskID: string, projectID: string = parent.projectID) =>
        LogicalTask.resolveResume({ taskID, strict: true, parentSessionID: parent.id, projectID, memberID: "backend" })
      expect((yield* resume(bound.taskId))?.id).toBe(execution.id)
      // The Session ID is an execution reference to the same bound task.
      expect((yield* resume(execution.id))?.id).toBe(execution.id)
      for (const unknown of ["tsk_unknown", "ses_unknown", "not-an-id"]) {
        expect(denial(yield* Effect.exit(resume(unknown)))).toContain("Task resume denied: unknown-task")
      }
      expect(denial(yield* Effect.exit(resume(bound.taskId, "prj_other")))).toContain(
        "Task resume denied: task-project-mismatch",
      )
      const memberDenial = yield* Effect.exit(
        LogicalTask.resolveResume({
          taskID: bound.taskId,
          strict: true,
          parentSessionID: parent.id,
          projectID: parent.projectID,
          memberID: "general",
        }),
      )
      expect(denial(memberDenial)).toContain("Task resume denied: task-member-mismatch")
    }),
  )

  it.instance("lenient resume keeps the generic lookup", () =>
    Effect.gen(function* () {
      const { parent } = yield* child()
      const missing = yield* LogicalTask.resolveResume({
        taskID: "ses_missing",
        strict: false,
        parentSessionID: parent.id,
        projectID: parent.projectID,
        memberID: "general",
      })
      expect(missing).toBeUndefined()
    }),
  )
})
