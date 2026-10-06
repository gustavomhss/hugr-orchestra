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
import { Cause, Deferred, Effect, Exit } from "effect"
import { Agent } from "../../src/agent/agent"
import { BACKEND_DEFAULT_LABEL } from "../../src/maestro/roster"
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
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Git } from "@/git"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// F4 cl.5-6 and F4-CH: the Task path decodes the backend specialist's `backend-result` card into `metadata.workResult`.

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const layer = (flags: Partial<RuntimeFlags.Info> = {}) =>
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
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(layer())
const background = testEffect(layer({ experimentalBackgroundSubagents: true }))

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

const fenced = (value: unknown) => "```backend-result\n" + JSON.stringify(value, null, 2) + "\n```"
const final = (value: unknown) => `Done. Changed the repository query and ran the unit check.\n\n${fenced(value)}`

const seed = Effect.fn("TaskBackendResultTest.seed")(function* () {
  const session = yield* Session.Service
  const chat = yield* session.create({ title: "Backend result" })
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "maestro",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
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
            mode: input.agent ?? "backend",
            agent: input.agent ?? "backend",
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

const dispatch = Effect.fn("TaskBackendResultTest.dispatch")(function* (
  text: string,
  options?: {
    subagent?: string
    error?: NonNullable<SessionV1.Assistant["error"]>
    caller?: { agent: string; agentID: string }
    background?: boolean
    prompt?: TaskPromptOps["prompt"]
  },
) {
  const { chat, assistant } = yield* seed()
  const def = yield* (yield* TaskTool).init()
  const streamed: Record<string, unknown>[] = []
  const childMessageIDs: string[] = []
  const promptOps = ops(text, childMessageIDs, options?.error)
  const exit = yield* def
    .execute(
      {
        description: "implement repo query",
        prompt: "packet",
        subagent_type: options?.subagent ?? "backend",
        ...(options?.background ? { background: true } : {}),
      },
      {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: options?.caller?.agent ?? "maestro",
        agentID: options?.caller?.agentID ?? "maestro",
        abort: new AbortController().signal,
        extra: { promptOps: options?.prompt ? { ...promptOps, prompt: options.prompt } : promptOps },
        messages: [],
        metadata: (input) =>
          Effect.sync(() => {
            if (input.metadata) streamed.push(input.metadata)
          }),
        ask: () => Effect.void,
      },
    )
    .pipe(Effect.exit)
  return { exit, streamed, childMessageID: childMessageIDs[0], chat }
})

const workResult = (metadata: object) => ("workResult" in metadata ? metadata.workResult : undefined)

// Runs a background backend specialist Task whose child durably writes `text` as its final message, and returns the parent's
// completion notice: the existing background delivery (F4 cl.35) and the only place the final result can still land.
const deliverBackground = Effect.fn("TaskBackendResultTest.deliverBackground")(function* (
  text: string,
  error?: NonNullable<SessionV1.Assistant["error"]>,
) {
  const sessions = yield* Session.Service
  const jobs = yield* BackgroundJob.Service
  const notice = yield* Deferred.make<Parameters<TaskPromptOps["prompt"]>[0]>()
  const written: string[] = []
  const result = yield* dispatch(text, {
    background: true,
    prompt: (input) =>
      input.agent !== "backend"
        ? Deferred.succeed(notice, input).pipe(Effect.andThen(Effect.never))
        : Effect.gen(function* () {
            const info = yield* sessions.updateMessage({
              id: MessageID.ascending(),
              role: "assistant",
              parentID: MessageID.ascending(),
              sessionID: input.sessionID,
              mode: "backend",
              agent: "backend",
              cost: 0,
              path: { cwd: "/tmp", root: "/tmp" },
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: ref.modelID,
              providerID: ref.providerID,
              time: { created: Date.now() },
              finish: "stop",
              ...(error ? { error } : {}),
            })
            written.push(info.id)
            const part = yield* sessions.updatePart({
              id: PartID.ascending(),
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              text,
            })
            return { info, parts: [part] }
          }),
  })
  if (!Exit.isSuccess(result.exit)) throw new Error("expected background start")
  yield* jobs.wait({ id: result.exit.value.metadata.sessionId })
  const delivered = (yield* Deferred.await(notice)).parts[0]
  return {
    started: result.exit.value.metadata,
    childMessageID: written[0],
    workResult: delivered?.type === "text" ? delivered.metadata?.workResult : undefined,
  }
})

const empty = { changes: [], checks: [], blockers: [], risks: [], nextActions: [] }

describe("tool.task backend-result", () => {
  it.instance("decodes a valid card into the work result", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card))
      if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
      expect(workResult(result.exit.value.metadata)).toEqual({
        schema: "backend-work-result-v1",
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
    ["invalid JSON", "Done.\n\n```backend-result\n{ outcome: done }\n```"],
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
          schema: "backend-work-result-v1",
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
  it.instance(
    "a renamed seat still routes by its stable id and never by a label",
    () =>
      Effect.gen(function* () {
        const result = yield* dispatch(final(card))
        if (!Exit.isSuccess(result.exit)) throw new Error("expected task success")
        expect(workResult(result.exit.value.metadata)).toMatchObject({ card: { parsed: true }, outcome: "done" })
        const sessions = yield* Session.Service
        const child = (yield* sessions.children(result.chat.id))[0]
        expect(child?.agent).toBe("backend")
        expect(child?.title).toContain("(@Pikachu subagent)")

        for (const label of ["Pikachu", BACKEND_DEFAULT_LABEL]) {
          const byLabel = yield* dispatch(final(card), { subagent: label })
          expect(Exit.isFailure(byLabel.exit)).toBe(true)
          if (Exit.isFailure(byLabel.exit)) expect(Cause.pretty(byLabel.exit.cause)).toContain("Unknown agent type")
        }

        // The caller resolves by id: the renamed seat keeps its native profile, which denies delegation.
        const caller = yield* dispatch(final(card), { caller: { agent: "Pikachu", agentID: "backend" } })
        expect(Exit.isFailure(caller.exit)).toBe(true)
        if (Exit.isFailure(caller.exit))
          expect(Cause.squash(caller.exit.cause)).toBeInstanceOf(PermissionV1.DeniedError)
      }),
    { config: { agent: { backend: { name: "Pikachu" } } } },
  )

  it.instance("streams an unparsed work result when the child prompt is cancelled", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { prompt: () => Effect.interrupt })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "interrupted", hostDetail: "Task cancelled" },
      })
    }),
  )

  it.instance("streams an unparsed work result when the child dies before a final message", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { prompt: () => Effect.die(new Error("child process died")) })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "failed", hostDetail: "child process died" },
      })
    }),
  )

  it.instance("a dying child keeps only what its last message actually says", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const written: string[] = []
      const result = yield* dispatch(final(card), {
        prompt: (input) =>
          Effect.gen(function* () {
            const message = yield* sessions.updateMessage({
              id: MessageID.ascending(),
              role: "assistant",
              parentID: MessageID.ascending(),
              sessionID: input.sessionID,
              mode: "backend",
              agent: "backend",
              cost: 0,
              path: { cwd: "/tmp", root: "/tmp" },
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: ref.modelID,
              providerID: ref.providerID,
              time: { created: Date.now() },
            })
            written.push(message.id)
            yield* sessions.updatePart({
              id: PartID.ascending(),
              messageID: message.id,
              sessionID: input.sessionID,
              type: "text",
              text: "Done.\n\n```backend-result\n{ \"outcome\": \"do",
            })
            return yield* Effect.die(new Error("child process died"))
          }),
      })
      expect(Exit.isFailure(result.exit)).toBe(true)
      expect(result.streamed.at(-1)?.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: false, messageID: written[0] },
        ...empty,
        terminal: { reason: "failed", hostDetail: "child process died" },
      })
    }),
  )

  it.instance("a failed child's streamed result carries the host reason", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), {
        error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      })
      expect(result.streamed.at(-1)?.workResult).toMatchObject({
        card: { parsed: true },
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") },
      })
    }),
  )

  background.instance("a finished background child delivers its final work result to the parent", () =>
    Effect.gen(function* () {
      const result = yield* deliverBackground(final(card))
      // The Task part completed at start and keeps `running` (F4 amendment); the notice carries the final result.
      expect(workResult(result.started)).toMatchObject({ terminal: { reason: "running" } })
      expect(result.workResult).toEqual({
        schema: "backend-work-result-v1",
        card: { parsed: true, messageID: result.childMessageID },
        ...card,
        terminal: { reason: "ended" },
      })
    }),
  )

  background.instance("a failed background child delivers a failed work result with the host reason", () =>
    Effect.gen(function* () {
      const result = yield* deliverBackground(
        final(card),
        new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
      )
      expect(result.workResult).toMatchObject({
        card: { parsed: true, messageID: result.childMessageID },
        outcome: "done",
        changes: card.changes,
        terminal: { reason: "failed", hostDetail: expect.stringContaining("Network connection lost") },
      })
    }),
  )

  background.instance("background mode returns a running work result with no worker fields", () =>
    Effect.gen(function* () {
      const result = yield* dispatch(final(card), { background: true, prompt: () => Effect.never })
      if (!Exit.isSuccess(result.exit)) throw new Error("expected background start")
      const expected = {
        schema: "backend-work-result-v1",
        card: { parsed: false },
        ...empty,
        terminal: { reason: "running", hostDetail: "Background task started" },
      }
      expect(workResult(result.exit.value.metadata)).toEqual(expected)
      expect(result.streamed.at(-1)?.workResult).toEqual(expected)
    }),
  )
})
