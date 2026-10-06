import { afterEach, describe, expect } from "bun:test"
import { appendFile, chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { createNativeMemory, type RecordRef } from "@opencode-ai/atlas-boundary/native-memory"
import { BackendToolkit } from "@opencode-ai/core/backend-toolkit"
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
import { Git } from "@/git"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { Session } from "@/session/session"
import { MessageID, PartID, type SessionID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// F3 clauses 15-20, rulings F3-D3 and S-3: a backend resume dispatched with `memoryUnit` admits the unit's latest
// admitted checkpoint into the child Session once per logical resume, as one synthetic part carrying the Admission.

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
  ),
)

const UNIT = { kind: "task" as const, id: "T-17" }
const OLDER = {
  taskId: "T-17",
  attempted: ["wrapped repository errors with the operation name"],
  failedWith: ["go vet: unused import in handler.go"],
  stoppedAt: "handler compiles; list endpoint not started",
  lesson: "run go vet before the handler tests",
}
const NEWER = { ...OLDER, stoppedAt: "list endpoint passes its unit tests", lesson: "page with a cursor, not an offset" }

// No network: the toolkit is never asked for a scanner, and the seeding Memory pins a local one.
const offline = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(BackendToolkit.Target, { unsupported: "test-runs-offline" }))

// Writes the entries, in order, to the instance's Atlas store through the real binding, with a scanner that reports
// every record clean.
const remember = Effect.fn("TaskAtlasResumeTest.remember")(function* (...entries: (typeof OLDER)[]) {
  const command = path.join((yield* TestInstance).directory, ".test-bin", "gitleaks")
  yield* Effect.promise(async () => {
    await mkdir(path.dirname(command), { recursive: true })
    await Bun.write(command, "#!/bin/sh\n/bin/cat >/dev/null\nexit 0\n")
    await chmod(command, 0o755)
  })
  const memory = yield* offline(
    AtlasMemory.open({ sessionID: "ses_seed", callID: "call_seed", assistantMessageID: "msg_seed" }),
  )
  if ("unavailable" in memory) throw new Error(memory.unavailable)
  const pinned = createNativeMemory({ ...memory.binding, scanner: { name: "gitleaks", command } })
  const refs = entries.map((entry) => {
    const written = pinned.write(entry)
    if (!written.ok) throw new Error(`${written.refusal}: ${written.reason}`)
    return written.ref
  })
  return { refs, projectID: memory.binding.storage.projectID }
})

const seed = Effect.fn("TaskAtlasResumeTest.seed")(function* () {
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Atlas resume" })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: MessageID.ascending(),
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
  yield* sessions.updateMessage(assistant)
  return { chat, assistant }
})

type Prompted = Parameters<TaskPromptOps["prompt"]>[0]

// The child's prompt is persisted as the real prompt path does, so a later dispatch sees what an earlier one admitted.
function ops(prompts: Prompted[], sessions: Session.Interface): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.gen(function* () {
        prompts.push(input)
        const user = yield* sessions.updateMessage({
          id: input.messageID ?? MessageID.ascending(),
          role: "user",
          sessionID: input.sessionID,
          agent: input.agent ?? "backend",
          model: ref,
          time: { created: Date.now() },
        })
        yield* Effect.forEach(
          input.parts.filter((part): part is Extract<Prompted["parts"][number], { type: "text" }> => part.type === "text"),
          (part) => sessions.updatePart({ ...part, id: PartID.ascending(), messageID: user.id, sessionID: input.sessionID }),
          { discard: true },
        )
        const id = MessageID.ascending()
        return {
          info: {
            id,
            role: "assistant" as const,
            parentID: user.id,
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
          parts: [
            { id: PartID.ascending(), messageID: id, sessionID: input.sessionID, type: "text" as const, text: "done" },
          ],
        }
      }),
  }
}

const dispatch = Effect.fn("TaskAtlasResumeTest.dispatch")(function* (
  seeded: { chat: Session.Info; assistant: SessionV1.Assistant },
  prompts: Prompted[],
  input: { callID: string; subagent?: string; taskID?: string; unit?: typeof UNIT },
) {
  const sessions = yield* Session.Service
  const def = yield* (yield* TaskTool).init()
  const exit = yield* offline(
    def.execute(
      {
        description: "resume repo query",
        prompt: "packet",
        subagent_type: input.subagent ?? "backend",
        ...(input.taskID ? { task_id: input.taskID } : {}),
        ...(input.unit ? { memoryUnit: input.unit } : {}),
      },
      {
        sessionID: seeded.chat.id,
        messageID: seeded.assistant.id,
        callID: input.callID,
        agent: "build",
        agentID: "build",
        abort: new AbortController().signal,
        extra: { promptOps: ops(prompts, sessions) },
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      },
    ),
  ).pipe(Effect.exit)
  if (!Exit.isSuccess(exit)) throw new Error(`expected task success: ${Cause.pretty(exit.cause)}`)
  return { sessionID: exit.value.metadata.sessionId as SessionID, taskID: taskIdOf(exit.value.metadata) }
})

function taskIdOf(metadata: object) {
  if (!("workResult" in metadata) || typeof metadata.workResult !== "object" || metadata.workResult === null)
    return undefined
  return "taskId" in metadata.workResult && typeof metadata.workResult.taskId === "string"
    ? metadata.workResult.taskId
    : undefined
}

// Durable emit receipts in the child's own tool evidence, as the bound emit tool leaves them.
const emitted = Effect.fn("TaskAtlasResumeTest.emitted")(function* (
  sessionID: SessionID,
  projectID: string,
  receipts: ReadonlyArray<{ entry: typeof OLDER } & Pick<AtlasMemory.Receipt, "outcome" | "ref" | "reconciled" | "refusal">>,
) {
  const sessions = yield* Session.Service
  const root = (yield* TestInstance).directory
  const message = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "assistant",
    parentID: MessageID.ascending(),
    sessionID,
    mode: "backend",
    agent: "backend",
    cost: 0,
    path: { cwd: root, root },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
    finish: "tool-calls",
  })
  yield* Effect.forEach(
    receipts,
    (item, index) => {
      const receipt: AtlasMemory.Receipt = {
        schema: "atlas-memory-receipt-v1",
        op: "emit",
        outcome: item.outcome,
        binding: {
          projectID,
          root,
          memoryOwner: "backend",
          sessionID,
          callID: `call_emit_${index}`,
          assistantMessageID: message.id,
        },
        ...(item.ref && { ref: item.ref }),
        ...(item.reconciled && { reconciled: item.reconciled }),
        ...(item.refusal && { refusal: item.refusal }),
      }
      return sessions.updatePart({
        id: PartID.ascending(),
        messageID: message.id,
        sessionID,
        type: "tool",
        callID: `call_emit_${index}`,
        tool: "atlas_memory_emit",
        state: {
          status: "completed",
          input: { entry: item.entry },
          output: "{}",
          title: `memory ${item.outcome}`,
          metadata: { [AtlasMemory.RECEIPT_KEY]: receipt },
          time: { start: Date.now(), end: Date.now() },
        },
      })
    },
    { discard: true },
  )
})

// Every admission part is synthetic and its Admission's text is the part text, byte for byte.
function admissionsOf(parts: ReadonlyArray<{ type: string; text?: string; synthetic?: boolean; metadata?: Record<string, unknown> }>) {
  return parts.flatMap((part) => {
    const admission = part.metadata?.[AtlasMemory.ADMISSION_KEY] as AtlasMemory.Admission | undefined
    if (!admission) return []
    expect(part.type).toBe("text")
    expect(part.synthetic).toBe(true)
    expect(admission.text).toBe(part.text!)
    return [admission]
  })
}

const childAdmissions = Effect.fn("TaskAtlasResumeTest.childAdmissions")(function* (sessionID: SessionID) {
  const history = yield* (yield* Session.Service).messages({ sessionID })
  return admissionsOf(history.flatMap((msg) => msg.parts))
})

const key = (projectID: string, chat: Session.Info, callID: string) => ({
  projectID,
  memoryOwner: "backend",
  logicalResumeID: `${chat.id}/${callID}`,
  kind: "task",
  id: "T-17",
})

// The fake scanner is a POSIX shell script, and Atlas runs its scanner through execFileSync with no shell, which cannot
// launch a script on Windows. These cases write Memory through that scanner, so they run on Linux and macOS only.
const posix = process.platform === "win32" ? it.instance.skip : it.instance

describe("tool.task Atlas resume admission", () => {
  posix(
    "another seat ignores memoryUnit while the backend seat admits the fold",
    () =>
      Effect.gen(function* () {
        const store = yield* remember(OLDER)
        const seeded = yield* seed()
        const prompts: Prompted[] = []
        yield* dispatch(seeded, prompts, { callID: "call_general", subagent: "general", unit: UNIT })
        expect(prompts[0]?.parts).toEqual([{ type: "text", text: "packet" }])
        // Positive control: the same unit dispatched to the backend seat is admitted.
        yield* dispatch(seeded, prompts, { callID: "call_backend", unit: UNIT })
        expect(admissionsOf(prompts[1]?.parts ?? [])).toMatchObject([
          { verdict: { ok: true, ref: store.refs[0] }, key: key(store.projectID, seeded.chat, "call_backend") },
        ])
      }),
    { git: true },
  )

  posix(
    "the latest admitted receipt picks the newer record, not the last one in the log",
    () =>
      Effect.gen(function* () {
        const store = yield* remember(NEWER, OLDER)
        const [newer, older] = store.refs as [RecordRef, RecordRef]
        const seeded = yield* seed()
        const prompts: Prompted[] = []
        const first = yield* dispatch(seeded, prompts, { callID: "call_first" })
        yield* emitted(first.sessionID, store.projectID, [
          { entry: OLDER, outcome: "admitted", ref: older },
          { entry: NEWER, outcome: "admitted", ref: newer },
          // An identical resubmission of the older entry is not a new checkpoint (F3 clause 5).
          { entry: OLDER, outcome: "admitted", ref: older, reconciled: true },
        ])
        yield* dispatch(seeded, prompts, { callID: "call_resume", taskID: first.taskID, unit: UNIT })
        const admissions = admissionsOf(prompts[1]?.parts ?? [])
        expect(admissions).toMatchObject([
          {
            schema: "atlas-resume-admission-v1",
            key: key(store.projectID, seeded.chat, "call_resume"),
            residency: "admitted",
            verdict: { ok: true, ref: newer },
          },
        ])
        expect(admissions[0]!.text).toContain("latest admitted checkpoint")
        expect(admissions[0]!.text).toContain(NEWER.stoppedAt)
        expect(admissions[0]!.text).not.toContain(OLDER.stoppedAt)
        expect(admissions[0]!.text.toLowerCase()).not.toContain("closing")
      }),
    { git: true },
  )

  posix(
    "a refused or uncertain later write never wins over an admitted one",
    () =>
      Effect.gen(function* () {
        const store = yield* remember(OLDER, NEWER)
        const [older] = store.refs as [RecordRef, RecordRef]
        const seeded = yield* seed()
        const prompts: Prompted[] = []
        const first = yield* dispatch(seeded, prompts, { callID: "call_first" })
        yield* emitted(first.sessionID, store.projectID, [
          { entry: OLDER, outcome: "admitted", ref: older },
          {
            entry: NEWER,
            outcome: "refused",
            refusal: { ok: false, refusal: "scanner-blocked", reason: "a secret was found", scanner: "gitleaks" },
          },
          { entry: NEWER, outcome: "uncertain" },
        ])
        yield* dispatch(seeded, prompts, { callID: "call_resume", taskID: first.taskID, unit: UNIT })
        const admissions = admissionsOf(prompts[1]?.parts ?? [])
        expect(admissions).toMatchObject([{ verdict: { ok: true, ref: older } }])
        expect(admissions[0]!.text).toContain(OLDER.stoppedAt)
      }),
    { git: true },
  )

  posix(
    "two own records without a receipt yield one ambiguous notice that asks for a packet blocker",
    () =>
      Effect.gen(function* () {
        const store = yield* remember(OLDER, NEWER)
        const seeded = yield* seed()
        const prompts: Prompted[] = []
        const child = yield* dispatch(seeded, prompts, { callID: "call_resume", unit: UNIT })
        expect(prompts[0]?.parts).toHaveLength(2)
        const admissions = admissionsOf(prompts[0]?.parts ?? [])
        expect(admissions).toMatchObject([
          { key: key(store.projectID, seeded.chat, "call_resume"), verdict: { ok: false, refusal: "ambiguous" } },
        ])
        expect(admissions[0]!.text).toContain("`packet` blocker")
        expect(admissions[0]!.text).toContain("`ambiguous`")
        expect(admissions[0]!.text.toLowerCase()).not.toContain("closing")
        // The persisted part keeps the Admission text byte for byte.
        expect(yield* childAdmissions(child.sessionID)).toEqual(admissions)
      }),
    { git: true },
  )

  posix(
    "replaying the same dispatch call adds no second part, and a new call admits again",
    () =>
      Effect.gen(function* () {
        const store = yield* remember(OLDER)
        const seeded = yield* seed()
        const prompts: Prompted[] = []
        const first = yield* dispatch(seeded, prompts, { callID: "call_one", unit: UNIT })
        expect(admissionsOf(prompts[0]?.parts ?? [])).toHaveLength(1)
        yield* dispatch(seeded, prompts, { callID: "call_one", taskID: first.taskID, unit: UNIT })
        expect(prompts[1]?.parts).toEqual([{ type: "text", text: "packet" }])
        yield* dispatch(seeded, prompts, { callID: "call_two", taskID: first.taskID, unit: UNIT })
        expect(admissionsOf(prompts[2]?.parts ?? [])).toMatchObject([
          { key: key(store.projectID, seeded.chat, "call_two"), verdict: { ok: true, ref: store.refs[0] } },
        ])
        expect((yield* childAdmissions(first.sessionID)).map((admission) => admission.key.logicalResumeID)).toEqual([
          `${seeded.chat.id}/call_one`,
          `${seeded.chat.id}/call_two`,
        ])
      }),
    { git: true },
  )

  posix(
    "a partial store yields a store-partial notice that asks for an atlas blocker",
    () =>
      Effect.gen(function* () {
        yield* remember(OLDER)
        const directory = (yield* TestInstance).directory
        yield* Effect.promise(() => appendFile(path.join(directory, ".atlas/memory.jsonl"), "{not json\n"))
        const seeded = yield* seed()
        const prompts: Prompted[] = []
        yield* dispatch(seeded, prompts, { callID: "call_resume", unit: UNIT })
        const admissions = admissionsOf(prompts[0]?.parts ?? [])
        expect(admissions).toMatchObject([{ verdict: { ok: false, refusal: "store-partial" } }])
        expect(admissions[0]!.text).toContain("`atlas` blocker")
        expect(admissions[0]!.text).toContain("`store-partial`")
      }),
    { git: true },
  )
})
