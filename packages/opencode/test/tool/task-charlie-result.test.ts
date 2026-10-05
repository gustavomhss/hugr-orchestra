import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect, Exit } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { MessageID, PartID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Git } from "@/git"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// F4 cl.5-6 and F4-CH: the Task path decodes Charlie's `charlie-result` card into `metadata.workResult`.

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

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
  ),
)

const card = {
  outcome: "done",
  changes: [{ path: "/repo/internal/reservation/repo.go", change: "modified" }],
  checks: [
    {
      checkId: "unit",
      command: "go test ./internal/reservation/...",
      cwd: "/repo",
      status: "pass",
      exitCode: 0,
    },
  ],
  blockers: [],
  risks: ["Lock timeout fixed at 5s as specified; no test covers contention."],
  nextActions: [],
}

const blocked = {
  ...card,
  outcome: "blocked",
  changes: [],
  checks: [],
  blockers: [{ kind: "packet", reason: "No write paths in the packet; the orchestrator must name them." }],
}

const fenced = (value: unknown) => "```charlie-result\n" + JSON.stringify(value, null, 2) + "\n```"
const final = (value: unknown) => `Done. Changed the repository query and ran the unit check.\n\n${fenced(value)}`

const seed = Effect.fn("TaskCharlieResultTest.seed")(function* () {
  const session = yield* Session.Service
  const chat = yield* session.create({ title: "Charlie result" })
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* session.updateMessage(assistant)
  return { chat, assistant }
})

function ops(text: string, childMessageIDs: string[], error?: NonNullable<SessionV1.Assistant["error"]>): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        const id = MessageID.ascending()
        childMessageIDs.push(id)
        return {
          info: {
            id,
            role: "assistant" as const,
            parentID: input.messageID ?? MessageID.ascending(),
            sessionID: input.sessionID,
            mode: input.agent ?? "charlie",
            agent: input.agent ?? "charlie",
            cost: 0,
            path: { cwd: "/tmp", root: "/tmp" },
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: ref.modelID,
            providerID: ref.providerID,
            time: { created: Date.now() },
            finish: "stop",
            error,
          },
          parts: [{ id: PartID.ascending(), messageID: id, sessionID: input.sessionID, type: "text" as const, text }],
        }
      }),
  }
}

const dispatch = Effect.fn("TaskCharlieResultTest.dispatch")(function* (
  text: string,
  options?: { subagent?: string; error?: NonNullable<SessionV1.Assistant["error"]> },
) {
  const { chat, assistant } = yield* seed()
  const def = yield* (yield* TaskTool).init()
  const streamed: Record<string, unknown>[] = []
  const childMessageIDs: string[] = []
  const exit = yield* def
    .execute(
      { description: "implement repo query", prompt: "packet", subagent_type: options?.subagent ?? "charlie" },
      {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: "build",
        agentID: "build",
        abort: new AbortController().signal,
        extra: { promptOps: ops(text, childMessageIDs, options?.error) },
        messages: [],
        metadata: (input) =>
          Effect.sync(() => {
            if (input.metadata) streamed.push(input.metadata)
          }),
        ask: () => Effect.void,
      },
    )
    .pipe(Effect.exit)
  return { exit, streamed, childMessageID: childMessageIDs[0] }
})

const workResult = (metadata: object) => ("workResult" in metadata ? metadata.workResult : undefined)

const empty = { changes: [], checks: [], blockers: [], risks: [], nextActions: [] }

describe("tool.task charlie-result", () => {
  it.instance("decodes a valid card into the work result", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card))
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toEqual({
        schema: "charlie-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        checks: card.checks,
        blockers: [],
        risks: card.risks,
        nextActions: [],
        terminal: { reason: "ended" },
      })
    }),
  )

  it.instance("maps outcome blocked to terminal blocked", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(blocked))
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toMatchObject({
        card: { parsed: true },
        outcome: "blocked",
        blockers: blocked.blockers,
        terminal: { reason: "blocked" },
      })
    }),
  )

  for (const [name, text] of [
    ["two blocks", `${final(card)}\n\n${fenced(card)}`],
    ["an extra top-level key", final({ ...card, verified: true })],
    ["an extra nested key", final({ ...card, changes: [{ ...card.changes[0], callIDs: ["call-1"] }] })],
    ["no block", "Done. Changed the repository query and ran the unit check."],
    ["invalid JSON", "Done.\n\n```charlie-result\n{ outcome: done }\n```"],
    ["an unknown blocker kind", final({ ...blocked, blockers: [{ kind: "design", reason: "x" }] })],
    ["an unknown outcome", final({ ...card, outcome: "partial" })],
    ["an unknown change kind", final({ ...card, changes: [{ ...card.changes[0], change: "renamed" }] })],
    ["an unknown check status", final({ ...card, checks: [{ ...card.checks[0], status: "passed" }] })],
  ] as const) {
    it.instance(`leaves worker fields empty for ${name}`, () =>
      Effect.gen(function* () {
        const result = yield* dispatch(text)
        if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
        expect(workResult(result.exit.value.metadata)).toEqual({
          schema: "charlie-work-result-v1",
          card: { parsed: false, messageID: result.childMessageID },
          ...empty,
          terminal: { reason: "ended" },
        })
      }),
    )
  }

  it.instance("streams the work result before a failed child fails the Task", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toMatchObject({
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        terminal: { reason: "failed" },
      })
    }),
  )

  it.instance("a failed child that declared blocked stays failed", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(blocked), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toMatchObject({ outcome: "blocked", terminal: { reason: "failed" } })
    }),
  )

  it.instance("other subagents get no work result", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { subagent: "general" })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toBeUndefined()
      expect(result.streamed.some((item) => "workResult" in item)).toBe(false)
    }),
  )
})
