import { expect } from "bun:test"
import { chmod, mkdir } from "node:fs/promises"
import path from "node:path"
import { createNativeMemory } from "@opencode-ai/atlas-boundary/native-memory"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { Effect, Exit, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { Archive } from "@/continuity/archive"
import { Git } from "@/git"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { Session } from "@/session/session"
import { MessageID, SessionID } from "@/session/schema"
import { AtlasMemoryEmitTool, AtlasMemoryRecallTool, Open } from "@/tool/atlas-memory"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)
const layer = LayerNode.compile(LayerNode.group([Agent.node, Truncate.node, Git.node]))
const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

const TASK = {
  taskId: "T-17",
  attempted: ["wrapped repository errors with the operation name"],
  failedWith: ["go vet: unused import in handler.go"],
  stoppedAt: "handler compiles; list endpoint not started",
  lesson: "run go vet before the handler tests",
}
const LOGBOOK = {
  prId: "PR-9",
  at: "2026-10-06",
  territories: ["api"],
  shipped: "list endpoint",
  decisions: "cursor pagination",
  tradeoffs: "no offset paging",
  risks: "none observed",
  openThreads: "none",
  links: ["PR-9"],
}

type Receipt = AtlasMemory.Receipt

// Bun resolves a child-process command against the PATH it started with, so a host scanner on that PATH cannot be
// hidden from inside the test. A test that writes therefore pins the scanner binary on the binding the real open()
// produced: `clean` reports every record clean, `broken` answers --version but never completes a scan.
const SCANNERS = {
  clean: "#!/bin/sh\n/bin/cat >/dev/null\nexit 0\n",
  broken: '#!/bin/sh\n[ "$1" = "--version" ] && exit 0\n/bin/cat >/dev/null\nexit 2\n',
}

const tools = (scanner?: keyof typeof SCANNERS) =>
  Effect.gen(function* () {
    const asks: unknown[] = []
    const ctx: Tool.Context = {
      sessionID: SessionID.make("ses_atlas_tool"),
      messageID: MessageID.make("msg_atlas_tool"),
      callID: "call_atlas_tool",
      agent: "backend",
      agentID: "backend",
      abort: AbortSignal.any([]),
      messages: [],
      metadata: () => Effect.void,
      ask: (request) =>
        Effect.sync(() => {
          asks.push(request)
        }),
    }
    const command = path.join((yield* TestInstance).directory, ".test-bin", "gitleaks")
    if (scanner)
      yield* Effect.promise(async () => {
        await mkdir(path.dirname(command), { recursive: true })
        await Bun.write(command, SCANNERS[scanner])
        await chmod(command, 0o755)
      })
    const open = (execution: AtlasMemory.Execution) =>
      AtlasMemory.open(execution).pipe(
        Effect.map((memory) =>
          "unavailable" in memory || !scanner
            ? memory
            : createNativeMemory({ ...memory.binding, scanner: { name: "gitleaks", command } }),
        ),
      )
    const recall = yield* Tool.init(yield* AtlasMemoryRecallTool)
    const emit = yield* Tool.init(yield* AtlasMemoryEmitTool)
    return {
      asks,
      recall: (input: unknown) =>
        recall
          .execute(input as Tool.InferParameters<typeof AtlasMemoryRecallTool>, ctx)
          .pipe(Effect.provideService(Open, open)),
      emit: (entry: unknown) =>
        emit
          .execute({ entry } as Tool.InferParameters<typeof AtlasMemoryEmitTool>, ctx)
          .pipe(Effect.provideService(Open, open)),
      raw: (input: unknown) =>
        emit
          .execute(input as Tool.InferParameters<typeof AtlasMemoryEmitTool>, ctx)
          .pipe(Effect.provideService(Open, open)),
    }
  })

const lines = Effect.gen(function* () {
  const file = Bun.file(path.join((yield* TestInstance).directory, ".atlas/memory.jsonl"))
  if (!(yield* Effect.promise(() => file.exists()))) return 0
  return (yield* Effect.promise(() => file.text())).split("\n").filter(Boolean).length
})

const receiptOf = (result: Tool.ExecuteResult) => result.metadata[AtlasMemory.RECEIPT_KEY] as Receipt

it.instance(
  "only the native backend seat sees the Atlas Memory tools",
  () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const agents = yield* Agent.Service
      const backend = yield* agents.get("backend")
      const build = yield* agents.get("build")
      if (!backend || !build) throw new Error("native agents missing")
      expect(backend.native).toBe(true)
      const visible = (agent: Agent.Info) =>
        registry
          .tools({ ...ref, agent })
          .pipe(Effect.map((tools) => tools.map((tool) => tool.id).filter((id) => id.startsWith("atlas_memory_"))))
      expect((yield* visible(backend)).toSorted()).toEqual(["atlas_memory_emit", "atlas_memory_recall"])
      // A configured agent that reuses the id, even with every tool allowed, is not the bound seat.
      expect(yield* visible({ ...backend, native: false, permission: [] })).toEqual([])
      expect(yield* visible({ ...backend, native: undefined })).toEqual([])
      expect(yield* visible(build)).toEqual([])
      const schemas = (yield* registry.tools({ ...ref, agent: backend })).filter((tool) =>
        tool.id.startsWith("atlas_memory_"),
      )
      for (const tool of schemas) expect(JSON.stringify(tool.jsonSchema)).not.toContain('"owner"')
    }).pipe(
      Effect.provide(
        TestAppNodeBuilder.build(
          LayerNode.group([
            ToolRegistry.node,
            Session.node,
            SessionProjector.node,
            Agent.node,
            Truncate.node,
            Database.node,
            Archive.node,
          ]),
        ),
      ),
    ),
  { git: true },
)

it.instance(
  "recall rejects owner, project and logbook selectors and emit rejects a top-level owner before any read",
  () =>
    Effect.gen(function* () {
      const t = yield* tools()
      for (const input of [
        { kind: "task", taskId: "T-17", owner: "maestro" },
        { kind: "pr", prId: "PR-9", owner: "backend" },
        { kind: "project" },
        { kind: "project", rule: "x" },
        { kind: "logbook", prId: "PR-9" },
        { owner: "maestro", kind: "task" },
        { kind: "task", taskId: "" },
      ])
        expect(Exit.isFailure(yield* t.recall(input).pipe(Effect.exit))).toBe(true)
      expect(Exit.isFailure(yield* t.raw({ entry: TASK, owner: "maestro" }).pipe(Effect.exit))).toBe(true)
      expect(Exit.isFailure(yield* t.raw({ entry: "not an object" }).pipe(Effect.exit))).toBe(true)
      expect(t.asks).toEqual([])
      expect(yield* lines).toBe(0)
    }).pipe(Effect.provide(layer)),
  { git: true },
)

it.instance(
  "an unreadable store is reported unavailable, never as an empty result",
  () =>
    Effect.gen(function* () {
      const directory = (yield* TestInstance).directory
      yield* Effect.promise(() => mkdir(path.join(directory, ".atlas/memory.jsonl"), { recursive: true }))
      const t = yield* tools("clean")
      const result = yield* t.recall({ kind: "task", taskId: "T-17" })
      const output = JSON.parse(result.output)
      expect(output.store).toBe("unavailable")
      expect(output).not.toHaveProperty("records")
      expect(receiptOf(result)).toMatchObject({
        schema: "atlas-memory-receipt-v1",
        op: "recall",
        outcome: "read",
        store: "unavailable",
        refs: [],
        binding: { memoryOwner: "backend", callID: "call_atlas_tool", sessionID: "ses_atlas_tool" },
      })
      const emitted = yield* t.emit(TASK)
      expect(receiptOf(emitted)).toMatchObject({ op: "emit", outcome: "unavailable", store: "unavailable" })
      expect(JSON.parse(emitted.output).note).toBe("Not confirmed as remembered.")
    }).pipe(Effect.provide(layer)),
  { git: true },
)

it.instance("a worktree without a HEAD revision yields an unavailable receipt, not an empty recall", () =>
  Effect.gen(function* () {
    const t = yield* tools()
    const result = yield* t.recall({ kind: "pr", prId: "PR-9" })
    expect(JSON.parse(result.output)).toMatchObject({ store: "unavailable" })
    expect(JSON.parse(result.output)).not.toHaveProperty("records")
    expect(receiptOf(result)).toMatchObject({ op: "recall", outcome: "unavailable", binding: { memoryOwner: "backend" } })
  }).pipe(Effect.provide(layer)),
)

// The fake scanners are POSIX shell scripts, and Atlas runs its scanner through execFileSync with no shell, which
// cannot launch a script on Windows. Scanner semantics do not depend on the OS, so these run on Linux and macOS only.
const posix = process.platform === "win32" ? it.instance.skip : it.instance

posix(
  "with a scanner an entry is admitted once, recalled by ref, and a logbook entry is refused verbatim",
  () =>
    Effect.gen(function* () {
      const t = yield* tools("clean")
      const first = receiptOf(yield* t.emit(TASK))
      expect(first).toMatchObject({ schema: "atlas-memory-receipt-v1", op: "emit", outcome: "admitted" })
      expect(first.ref?.eventId).toBeString()
      expect(first.reconciled).toBeUndefined()
      expect(first.binding).toMatchObject({
        memoryOwner: "backend",
        root: (yield* TestInstance).directory,
        callID: "call_atlas_tool",
        assistantMessageID: "msg_atlas_tool",
      })
      expect(yield* lines).toBe(1)

      const again = yield* t.emit(TASK)
      expect(receiptOf(again)).toMatchObject({ outcome: "admitted", reconciled: true, ref: first.ref })
      expect(JSON.parse(again.output).note).toBe("Already recorded; nothing new was written.")
      expect(yield* lines).toBe(1)

      const recalled = yield* t.recall({ kind: "task", taskId: "T-17" })
      expect(JSON.parse(recalled.output)).toEqual({
        store: "complete",
        records: [{ ref: first.ref, kind: "task", entry: TASK }],
      })
      expect(receiptOf(recalled)).toMatchObject({ op: "recall", outcome: "read", store: "complete", refs: [first.ref] })
      expect(JSON.parse((yield* t.recall({ kind: "task", taskId: "T-18" })).output)).toEqual({
        store: "complete",
        records: [],
      })

      const logbook = yield* t.emit(LOGBOOK)
      const refused = receiptOf(logbook)
      expect(refused.outcome).toBe("refused")
      expect(refused.refusal).toMatchObject({ ok: false, refusal: "logbook-unauthorized" })
      expect(refused.refusal?.reason).toBeString()
      expect(refused.ref).toBeUndefined()
      expect(JSON.parse(logbook.output).refusal).toEqual(refused.refusal)
      expect(yield* lines).toBe(1)
      expect(t.asks).toHaveLength(5)
    }).pipe(Effect.provide(layer)),
  { git: true },
)

it.instance(
  "a scanner that cannot complete its scan refuses the write scanner-unavailable while the tool call succeeds",
  () =>
    Effect.gen(function* () {
      const t = yield* tools("broken")
      const exit = yield* t.emit(TASK).pipe(Effect.exit)
      if (!Exit.isSuccess(exit)) throw new Error("the emit tool call failed")
      const receipt = receiptOf(exit.value)
      expect(receipt.outcome).toBe("refused")
      expect(receipt.refusal).toMatchObject({ ok: false, refusal: "scanner-unavailable" })
      expect(JSON.parse(exit.value.output).note).toBe("Not remembered.")
      expect(yield* lines).toBe(0)
    }).pipe(Effect.provide(layer)),
  { git: true },
)

posix(
  "empty write roots hold a file write to the Memory log but never the harness-owned emit",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const profile: ToolSafety.Profile = { writeRoots: [] }
      // Positive control: the same profile does hold a file tool aimed at the Memory log.
      const held = yield* ToolSafety.beforeInvocation({
        tool: "write",
        args: { filePath: ".atlas/memory.jsonl", content: "" },
        sessionID: "ses_atlas_tool",
        callID: "call_write",
        directory: instance.directory,
        projectID: "project",
        projectDirectory: instance.directory,
      }).pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile), Effect.flip)
      expect(held.reason).toBe("write-outside-physical-roots")

      const t = yield* tools("clean")
      const result = yield* t.emit(TASK).pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile))
      expect(receiptOf(result)).toMatchObject({ op: "emit", outcome: "admitted" })
      expect(yield* lines).toBe(1)
    }).pipe(Effect.provide(layer)),
  { git: true },
)
