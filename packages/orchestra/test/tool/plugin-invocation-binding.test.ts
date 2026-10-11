import { expect } from "bun:test"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { Database } from "@orchestra/core/database/database"
import { FSUtil } from "@orchestra/core/fs-util"
import { SessionTable } from "@orchestra/core/session/sql"
import { InstanceRef } from "@/effect/instance-ref"
import { InvocationBindingHost } from "@/maestro/invocation-binding"
import { LogicalTask } from "@/maestro/logical-task"
import { SessionPrompt } from "@/session/prompt"
import { SessionID } from "@/session/schema"
import { provideInstance, TestInstance, tmpdirScoped } from "../fixture/fixture"
import { awaitWithTimeout } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { fixture, it, model, options } from "./plugin-binding.fixture"

it.instance(
  "binds renamed executing member to stored root authority and immutable public refs",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const spoofed = { ...f.context, binding: { memberId: "spoof" } }
      const result = yield* f.tool.execute({ ...f.args, binding: { authoritySessionId: "spoof" } }, spoofed)
      expect(result.metadata).toMatchObject({
        agent: "Copper",
        agentID: "backend",
        callID: f.context.callID,
        frozen: true,
        contextFrozen: true,
        mutation: false,
        replacement: false,
        directory: f.child.directory,
        worktree: f.instance.worktree,
        binding: {
          projectId: f.child.projectID,
          directory: f.child.directory,
          worktree: f.instance.worktree,
          memberId: "backend",
          executionSessionId: f.child.id,
          authoritySessionId: f.root.id,
          assistantMessageID: f.context.messageID,
          callID: f.context.callID,
        },
      })
      expect(result.metadata.binding.taskId).toBeUndefined()
      expect(result.metadata.binding.resumeRef).toBeUndefined()
      expect(f.asks).toHaveLength(1)
      const task = yield* LogicalTask.ensure({
        executionSessionID: f.child.id,
        authoritySessionID: f.root.id,
        projectID: f.child.projectID,
        memberID: "backend",
        source: "host",
      })
      const resumed = yield* f.tool.execute(f.args, f.context)
      expect(resumed.metadata.binding.taskId).toBe(task.taskId)
      expect(resumed.metadata.binding.resumeRef).toBeUndefined()
    }),
  options,
)

it.instance(
  "direct invocation has equal authority and execution Session; non-git worktree stays literal",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const result = yield* f.tool
        .execute(f.args, { ...f.context, sessionID: f.root.id })
        .pipe(Effect.provideService(InstanceRef, { ...f.instance, worktree: "/" }))
      expect(result.metadata.binding).toMatchObject({
        authoritySessionId: f.root.id,
        executionSessionId: f.root.id,
        directory: f.root.directory,
        worktree: "/",
      })
    }),
  options,
)

const refusals = [
  ["wrong-project", "session-project-mismatch"],
  ["foreign-parent", "session-project-mismatch"],
  ["cycle", "session-parent-cycle"],
  ["missing-session", "session-missing"],
  ["missing-parent", "session-missing"],
  ["missing-call", "invocation-identity-missing"],
  ["missing-assistant", "invocation-identity-missing"],
  ["missing-agent", "invocation-identity-missing"],
]
refusals.forEach(([scenario, reason]) =>
  it.instance(
    `native plugin refuses ${scenario} before plugin callback`,
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        // Positive control: this exact loaded plugin reaches its bridged ask before the invalid call.
        yield* f.tool.execute(f.args, f.context)
        expect(f.asks).toHaveLength(1)
        f.asks.splice(0)
        const database = yield* Database.Service
        const foreignDir = yield* tmpdirScoped({ git: true })
        const foreign = yield* f.sessions.create({}).pipe(provideInstance(foreignDir))
        if (scenario === "cycle" || scenario === "foreign-parent" || scenario === "missing-parent")
          yield* database.db
            .update(SessionTable)
            .set({
              parent_id:
                scenario === "cycle"
                  ? f.child.id
                  : scenario === "foreign-parent"
                    ? foreign.id
                    : SessionID.make("ses_missing_parent"),
            })
            .where(eq(SessionTable.id, f.root.id))
            .run()
            .pipe(Effect.orDie)
        const context = {
          ...f.context,
          sessionID:
            scenario === "wrong-project"
              ? foreign.id
              : scenario === "missing-session"
                ? SessionID.make("ses_missing")
                : f.child.id,
          callID: scenario === "missing-call" ? undefined : f.context.callID,
          agentID: scenario === "missing-agent" ? undefined : f.context.agentID,
        }
        if (scenario === "missing-assistant") Reflect.deleteProperty(context, "messageID")
        const exit = yield* f.tool.execute(f.args, context).pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        if (!Exit.isFailure(exit)) throw new Error("invalid native binding executed")
        const error = Cause.squash(exit.cause)
        expect(error).toBeInstanceOf(InvocationBindingHost.Denied)
        if (!(error instanceof InvocationBindingHost.Denied)) throw error
        expect(error.reason).toBe(reason)
        expect(f.asks).toEqual([])
      }),
    options,
  ),
)

it.instance(
  "legacy contexts keep agent fallback, bridged ask and optional call/binding",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const legacy = (yield* f.registry.all()).findLast((tool) => tool.id === "read")
      if (!legacy) throw new Error("legacy plugin missing")
      const result = yield* legacy.execute(f.args, {
        ...f.context,
        agent: "general",
        agentID: undefined,
        callID: undefined,
      })
      expect(result.output).toBe("ok")
      expect(result.metadata).toMatchObject({ agent: "general", agentID: "general", replacement: false })
      expect(result.metadata.callID).toBeUndefined()
      expect(result.metadata.binding).toBeUndefined()
      expect(f.asks).toHaveLength(1)
    }),
  options,
)

it.instance(
  "awaits async host metadata persistence before real plugin failure",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const pending = yield* f.tool
        .execute(
          { ...f.args, fail: true },
          {
            ...f.context,
            metadata: (input) => Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(release)
              yield* f.sessions.setMetadata({ sessionID: f.child.id, metadata: input.metadata ?? {} })
            }),
          },
        )
        .pipe(Effect.exit, Effect.forkChild)
      yield* awaitWithTimeout(Deferred.await(entered), "metadata persistence never entered")
      expect(pending.pollUnsafe()).toBeUndefined()
      expect((yield* f.sessions.get(f.child.id)).metadata?.receipt).toBeUndefined()
      yield* Deferred.succeed(release, undefined)
      const exit = yield* Fiber.join(pending)
      expect(Exit.isFailure(exit)).toBe(true)
      if (!Exit.isFailure(exit)) throw new Error("plugin failure missing")
      expect(String(Cause.squash(exit.cause))).toContain("plugin probe failed")
      expect((yield* f.sessions.get(f.child.id)).metadata).toMatchObject({ receipt: "before-failure" })
    }),
  options,
)

it.instance(
  "plugin metadata persists in real failed tool part through native V1 prompt",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const prompt = yield* SessionPrompt.Service
      const llm = yield* TestLLMServer
      const fs = yield* FSUtil.Service
      const test = yield* TestInstance
      const filePath = path.join(test.directory, "input.txt")
      yield* fs.writeFileString(filePath, "input")
      yield* llm.tool("read", { filePath, fail: true })
      yield* llm.text("failure recorded")
      yield* prompt.prompt({
        sessionID: f.child.id,
        agent: "backend",
        model,
        parts: [{ type: "text", text: "Run the read probe once." }],
      })
      const messages = yield* f.sessions.messages({ sessionID: f.child.id })
      const failed = messages
        .flatMap((message) => message.parts)
        .find((part) => part.type === "tool" && part.tool === "read" && part.state.status === "error")
      expect(failed).toBeDefined()
      if (!failed || failed.type !== "tool" || failed.state.status !== "error")
        throw new Error("failed read part missing")
      expect(failed.state.error).toContain("plugin probe failed")
      expect(failed.state.metadata).toMatchObject({ receipt: "before-failure", forgedTask: "spoof" })
      expect(failed.state.metadata?.toolSafety).toEqual({
        outcome: "failure", callID: failed.callID, sessionID: f.child.id, projectID: f.child.projectID,
        directory: f.child.directory, tool: "read",
      })
      expect(yield* llm.pending).toBe(0)
    }),
  options,
  60000,
)
