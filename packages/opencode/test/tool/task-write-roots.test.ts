import { afterEach, describe, expect } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Cause, Effect, Exit } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Git } from "@/git"
import { WriteRoots } from "@/maestro/write-roots"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// F2.14: the backend seat's write scope is bound by the host from the Task dispatch, not by the charter.

afterEach(async () => {
  await disposeAllInstances()
})

const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

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

const ops: TaskPromptOps = {
  cancel: () => Effect.void,
  resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
  prompt: (input) =>
    Effect.sync(() => {
      const id = MessageID.ascending()
      return {
        info: {
          id,
          role: "assistant" as const,
          parentID: input.messageID ?? MessageID.ascending(),
          sessionID: input.sessionID,
          mode: input.agent ?? "backend",
          agent: input.agent ?? "backend",
          cost: 0,
          path: { cwd: "/tmp", root: "/tmp" },
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: ref.modelID,
          providerID: ref.providerID,
          time: { created: Date.now() },
          finish: "stop",
        },
        parts: [{ id: PartID.ascending(), messageID: id, sessionID: input.sessionID, type: "text" as const, text: "done" }],
      }
    }),
}

const parent = Effect.fn("TaskWriteRootsTest.parent")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Write roots" })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: MessageID.ascending(),
    sessionID: chat.id,
    mode: "maestro",
    agent: "maestro",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  return { chat, assistant }
})

const dispatch = Effect.fn("TaskWriteRootsTest.dispatch")(function* (
  input: { subagent?: string; writePaths?: string[]; taskID?: string },
  seeded?: { chat: Session.Info; assistant: SessionV1.Assistant },
) {
  const { chat, assistant } = seeded ?? (yield* parent())
  const def = yield* (yield* TaskTool).init()
  const exit = yield* def
    .execute(
      {
        description: "implement",
        prompt: "packet",
        subagent_type: input.subagent ?? "backend",
        ...(input.writePaths ? { writePaths: input.writePaths } : {}),
        ...(input.taskID ? { task_id: input.taskID } : {}),
      },
      {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: "maestro",
        agentID: "maestro",
        abort: new AbortController().signal,
        extra: { promptOps: ops },
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      },
    )
    .pipe(Effect.exit)
  return { exit, chat, assistant }
})

const childOf = Effect.fn("TaskWriteRootsTest.child")(function* (exit: Exit.Exit<{ metadata: { sessionId: SessionID } }>) {
  if (!Exit.isSuccess(exit)) throw new Error(`expected task success: ${Cause.pretty(exit.cause)}`)
  return yield* (yield* Session.Service).get(exit.value.metadata.sessionId)
})

const workResult = (exit: Exit.Exit<{ metadata: object }>) =>
  Exit.isSuccess(exit) && "workResult" in exit.value.metadata ? exit.value.metadata.workResult : undefined

describe("tool.task backend write roots", () => {
  it.instance("binds the backend seat's write paths on the child and reports them as a host fact", () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const directory = yield* Effect.promise(() => fs.realpath(instance.directory))
      yield* Effect.promise(() => fs.mkdir(path.join(directory, "src")))
      const result = yield* dispatch({ writePaths: ["src", "docs/README.md", "new/dir", "src"] })
      const child = yield* childOf(result.exit)
      expect(WriteRoots.read(child.permission)).toEqual([
        path.join(directory, "src"),
        path.join(directory, "docs", "README.md"),
        path.join(directory, "new", "dir"),
      ])
      expect(workResult(result.exit)).toMatchObject({ writeRoots: ["src", "docs/README.md", "new/dir"] })
    }),
  )

  it.instance("absent or empty write paths bind a read-only backend child", () =>
    Effect.gen(function* () {
      for (const writePaths of [undefined, []]) {
        const result = yield* dispatch({ writePaths })
        const child = yield* childOf(result.exit)
        expect(WriteRoots.read(child.permission)).toEqual([])
        expect(workResult(result.exit)).toMatchObject({ writeRoots: [] })
      }
    }),
  )

  it.instance("rejects write paths that escape the worktree and creates no child", () =>
    Effect.gen(function* () {
      const directory = (yield* TestInstance).directory
      const outside = yield* Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "write-roots-outside-")))
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(outside, { recursive: true, force: true })))
      yield* Effect.promise(() => fs.symlink(outside, path.join(directory, "link")))
      const seeded = yield* parent()
      for (const [entry, reason] of [
        [outside, "write-path-absolute"],
        ["../sibling", "write-path-escape"],
        ["src/../../sibling", "write-path-escape"],
        ["", "write-path-empty"],
        ["link", "write-path-symlink-escape"],
        ["link/inner/file.go", "write-path-symlink-escape"],
      ] as const) {
        const result = yield* dispatch({ writePaths: ["src", entry] }, seeded)
        expect(Exit.isFailure(result.exit)).toBe(true)
        if (Exit.isFailure(result.exit)) expect(Cause.pretty(result.exit.cause)).toContain(`Task denied: ${reason}`)
      }
      expect(yield* (yield* Session.Service).children(seeded.chat.id)).toHaveLength(0)
    }),
  )

  it.instance("other members ignore write paths", () =>
    Effect.gen(function* () {
      const result = yield* dispatch({ subagent: "general", writePaths: ["/etc", "../escape"] })
      const child = yield* childOf(result.exit)
      expect(WriteRoots.read(child.permission)).toBeUndefined()
      expect(workResult(result.exit)).toBeUndefined()
    }),
  )

  it.instance("a plain resume binds the write paths of the dispatch that resumes it", () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const directory = yield* Effect.promise(() => fs.realpath(instance.directory))
      const seeded = yield* parent()
      const first = yield* childOf((yield* dispatch({ writePaths: ["src"] }, seeded)).exit)
      const widened = yield* dispatch({ writePaths: ["lib"], taskID: first.id }, seeded)
      expect(WriteRoots.read((yield* childOf(widened.exit)).permission)).toEqual([path.join(directory, "lib")])
      expect(workResult(widened.exit)).toMatchObject({ writeRoots: ["lib"] })
      const readOnly = yield* dispatch({ taskID: first.id }, seeded)
      expect(WriteRoots.read((yield* childOf(readOnly.exit)).permission)).toEqual([])
      expect(yield* (yield* Session.Service).children(seeded.chat.id)).toHaveLength(1)
    }),
  )
})
