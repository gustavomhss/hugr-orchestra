import { expect } from "bun:test"
import path from "node:path"
import { createNativeMemory } from "@orchestra/atlas-boundary/native-memory"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { Effect, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Git } from "@/git"
import { AtlasHeader } from "@/maestro/atlas-header"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { AtlasResume } from "@/maestro/atlas-resume"
import { AtlasResumeRestore } from "@/maestro/atlas-resume-restore"
import { LEGACY_BACKEND_ID } from "@orchestra/maestro/roster"
import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { AtlasMemoryEmitTool, AtlasMemoryRecallTool, Open } from "@/tool/atlas-memory"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Actual installed provider and pinned gitleaks on both CI OSes; no fake Memory or scanner.
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Git.node, Session.node, SessionProjector.node, Database.node, Truncate.node, filesystem,
])))
const execution = { sessionID: "ses_owners", callID: "call_owners", assistantMessageID: "msg_owners" }
const task = {
  taskId: "shared-task",
  attempted: ["read the source contract"],
  failedWith: [],
  stoppedAt: "source contract located",
  lesson: "check the applicable source revision",
}

function context(member?: string, asks: unknown[] = []): Tool.Context {
  return {
    sessionID: SessionID.make(execution.sessionID),
    messageID: MessageID.make(execution.assistantMessageID),
    callID: execution.callID,
    agent: "renamed discovery label",
    agentID: member,
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: (request) => Effect.sync(() => { asks.push(request) }),
  }
}

function receipt(result: Tool.ExecuteResult) {
  const value: AtlasMemory.Receipt | undefined = result.metadata.atlasMemory
  if (!value) throw new Error("missing native Atlas receipt")
  return value
}

it.instance("native identity survives rename; tools isolate owners and reconcile actual admissions", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const jimmy = yield* agents.get("jimmy")
    const archie = yield* agents.get("archie")
    expect(jimmy.name).toBe("discovery-renamed")
    expect(AtlasMemory.owner(jimmy)).toBe("jimmy")
    expect(archie.name).toBe("planning-renamed")
    expect(AtlasMemory.owner(archie)).toBe("archie")
    expect(AtlasMemory.owner(undefined)).toBeUndefined()
    expect(AtlasMemory.owner({ native: true })).toBeUndefined()
    expect(AtlasMemory.owner({ id: LEGACY_BACKEND_ID, native: true })).toBeUndefined()
    expect(AtlasMemory.supports({ ...archie, native: false })).toBe(false)
    expect(AtlasMemory.supports({ ...archie, native: undefined })).toBe(false)
    expect(AtlasMemory.supports({ ...jimmy, native: false })).toBe(false)
    expect(AtlasMemory.supports({ id: "atlas", native: true })).toBe(false)
    const emit = yield* Tool.init(yield* AtlasMemoryEmitTool)
    const recall = yield* Tool.init(yield* AtlasMemoryRecallTool)
    const refs = yield* Effect.forEach(["backend", "jimmy", "archie"] as const, Effect.fnUntraced(function* (member) {
      const asks: unknown[] = []
      const ctx = context(member, asks)
      const entry = { ...task, lesson: `${member} checks the applicable source revision` }
      const first = yield* emit.execute({ entry }, ctx)
      expect(receipt(first)).toMatchObject({ outcome: "admitted", binding: { memoryOwner: member } })
      const retry = yield* emit.execute({ entry }, ctx)
      expect(receipt(retry)).toMatchObject({ outcome: "admitted", reconciled: true, ref: receipt(first).ref })
      const read = yield* recall.execute({ kind: "task", taskId: task.taskId }, ctx)
      expect(JSON.parse(read.output)).toMatchObject({ store: "complete", records: [{ entry, ref: receipt(first).ref }] })
      expect(JSON.parse(read.output).records).toHaveLength(1)
      expect(asks).toEqual([
        { permission: "atlas_memory_emit", patterns: [member], always: [member], metadata: {} },
        { permission: "atlas_memory_emit", patterns: [member], always: [member], metadata: {} },
        { permission: "atlas_memory_recall", patterns: [member], always: [member], metadata: {} },
      ])
      const pr = yield* emit.execute({ entry: { prId: "shared-pr", decisions: [member], reviewOutcomes: [], knowledgeDelta: [] } }, ctx)
      expect(receipt(pr).outcome).toBe("admitted")
      expect(JSON.parse((yield* recall.execute({ kind: "pr", prId: "shared-pr" }, ctx)).output).records).toHaveLength(1)
      return receipt(first).ref
    }))
    expect(new Set(refs.map((ref) => JSON.stringify(ref))).size).toBe(3)
    // Keep all owners' rules fresh together: unrelated task/PR appends also advance Atlas's decay wave.
    yield* Effect.forEach(["backend", "jimmy", "archie"] as const, Effect.fnUntraced(function* (member) {
      const rule = yield* emit.execute({ entry: { rule: `${member} rule only`, scope: "source" } }, context(member))
      expect(receipt(rule).outcome).toBe("admitted")
    }))
    yield* Effect.forEach(["backend", "jimmy", "archie"] as const, Effect.fnUntraced(function* (member) {
      const agent = yield* agents.get(member)
      const header = yield* AtlasHeader.render(agent)
      expect(header).toContain(`member="${member}"`)
      expect(header).toContain(`${member} rule only`)
      ;["backend", "jimmy", "archie"].filter((other) => other !== member).forEach((other) =>
        expect(header).not.toContain(`${other} rule only`),
      )
    }))
    const fs = yield* FileSystem.FileSystem
    const lines = (yield* fs.readFileString(path.join((yield* TestInstance).directory, ".atlas/memory.jsonl"))).trim().split("\n")
    expect(lines).toHaveLength(9)
  }), { git: true, config: { agent: { jimmy: { name: "discovery-renamed" }, archie: { name: "planning-renamed" } } } },
)

it.instance("only backend reads legacy owners; foreign refs and ambiguous checkpoints refuse", () =>
  Effect.gen(function* () {
    const backend = yield* AtlasMemory.open(execution, { id: "backend", native: true })
    const jimmy = yield* AtlasMemory.open(execution, { id: "jimmy", native: true })
    const archie = yield* AtlasMemory.open(execution, { id: "archie", native: true })
    if ("unavailable" in backend || "unavailable" in jimmy || "unavailable" in archie) throw new Error("native binding unavailable")
    expect(backend.binding.legacyOwners).toEqual([LEGACY_BACKEND_ID])
    expect(jimmy.binding.legacyOwners).toEqual([])
    expect(archie.binding.legacyOwners).toEqual([])
    const legacy = createNativeMemory({ ...backend.binding, memoryOwner: LEGACY_BACKEND_ID, legacyOwners: [] })
    const written = legacy.write(task)
    if (!written.ok) throw new Error(JSON.stringify(written))
    expect(backend.recall({ kind: "task", taskId: task.taskId }).refs).toEqual([written.ref])
    expect(jimmy.recall({ kind: "task", taskId: task.taskId })).toMatchObject({ store: "complete", records: [] })
    expect(jimmy.resolveFold({ kind: "task", id: task.taskId }, written.ref)).toMatchObject({ ok: false, refusal: "foreign-owner" })
    expect(archie.recall({ kind: "task", taskId: task.taskId })).toMatchObject({ store: "complete", records: [] })
    expect(archie.resolveFold({ kind: "task", id: task.taskId }, written.ref)).toMatchObject({ ok: false, refusal: "foreign-owner" })
    const own = jimmy.write(task)
    if (!own.ok) throw new Error(JSON.stringify(own))
    expect(archie.resolveFold({ kind: "task", id: task.taskId }, own.ref)).toMatchObject({ ok: false, refusal: "foreign-owner" })
    const planned = archie.write(task)
    if (!planned.ok) throw new Error(JSON.stringify(planned))
    expect(jimmy.resolveFold({ kind: "task", id: task.taskId }, planned.ref)).toMatchObject({ ok: false, refusal: "foreign-owner" })
    expect(backend.resolveFold({ kind: "task", id: task.taskId }, planned.ref)).toMatchObject({ ok: false, refusal: "foreign-owner" })
    const newer = jimmy.write({ ...task, lesson: "newer own checkpoint" })
    if (!newer.ok) throw new Error(JSON.stringify(newer))
    expect(jimmy.resolveFold({ kind: "task", id: task.taskId })).toMatchObject({ ok: false, refusal: "ambiguous" })
    expect(jimmy.resolveFold({ kind: "task", id: task.taskId }, newer.ref)).toMatchObject({ ok: true, ref: newer.ref })
    expect(jimmy.resolveFold({ kind: "pr", id: task.taskId }, newer.ref)).toMatchObject({ ok: false, refusal: "unit-mismatch" })
  }), { git: true },
)

it.instance("original backend rule retention survives the original Jimmy task and PR interleaving", () =>
  Effect.gen(function* () {
    const emit = yield* Tool.init(yield* AtlasMemoryEmitTool)
    yield* Effect.forEach(["backend", "jimmy"] as const, Effect.fnUntraced(function* (member) {
      const ctx = context(member)
      expect(receipt(yield* emit.execute({ entry: { ...task, lesson: `${member} observed source` } }, ctx)).outcome).toBe("admitted")
      expect(receipt(yield* emit.execute({ entry: { prId: "interleaved-pr", decisions: [member], reviewOutcomes: [], knowledgeDelta: [] } }, ctx)).outcome).toBe("admitted")
      expect(receipt(yield* emit.execute({ entry: { rule: `${member} interleaved rule`, scope: "source" } }, ctx)).outcome).toBe("admitted")
    }))
    const agents = yield* Agent.Service
    const backend = yield* agents.get("backend")
    const jimmy = yield* agents.get("jimmy")
    const backendHeader = yield* AtlasHeader.render(backend)
    const jimmyHeader = yield* AtlasHeader.render(jimmy)
    expect(backendHeader).toContain("backend interleaved rule")
    expect(backendHeader).not.toContain("jimmy interleaved rule")
    expect(jimmyHeader).toContain("jimmy interleaved rule")
    expect(jimmyHeader).not.toContain("backend interleaved rule")
  }), { git: true },
)

it.instance("a third interleaved owner ages backend's rule out of the shared ledger", () =>
  Effect.gen(function* () {
    const emit = yield* Tool.init(yield* AtlasMemoryEmitTool)
    const agents = yield* Agent.Service
    const append = Effect.fnUntraced(function* (member: "backend" | "jimmy" | "archie") {
      const ctx = context(member)
      expect(receipt(yield* emit.execute({ entry: { ...task, lesson: `${member} observed source` } }, ctx)).outcome).toBe("admitted")
      expect(receipt(yield* emit.execute({ entry: { prId: "interleaved-pr", decisions: [member], reviewOutcomes: [], knowledgeDelta: [] } }, ctx)).outcome).toBe("admitted")
      expect(receipt(yield* emit.execute({ entry: { rule: `${member} interleaved rule`, scope: "source" } }, ctx)).outcome).toBe("admitted")
    })
    const header = Effect.fnUntraced(function* (member: "backend" | "jimmy" | "archie") {
      const rendered = yield* AtlasHeader.render(yield* agents.get(member))
      expect(rendered).toContain(`member="${member}"`)
      expect(rendered).not.toContain("degraded=")
      return rendered
    })
    yield* append("backend")
    yield* append("jimmy")
    expect(yield* header("backend")).toContain("backend interleaved rule")
    yield* append("archie")
    // Atlas decays every rule by the whole log's waves (A26): Archie's three appends take backend's rule from age 3
    // (0.125) to age 6 (~0.016), below the near-zero floor, while the later owners' rules stay injected.
    expect(yield* header("backend")).not.toContain("backend interleaved rule")
    expect(yield* header("jimmy")).toContain("jimmy interleaved rule")
    const archie = yield* header("archie")
    expect(archie).toContain("archie interleaved rule")
    expect(archie).not.toContain("jimmy interleaved rule")
  }), { git: true },
)

it.instance("missing identity cannot bind backend; real partial and unavailable stores remain distinct", () =>
  Effect.gen(function* () {
    const recall = yield* Tool.init(yield* AtlasMemoryRecallTool)
    const asks: unknown[] = []
    const missing = yield* recall.execute({ kind: "task", taskId: task.taskId }, context(undefined, asks))
    expect(JSON.parse(missing.output).outcome).toBe("unavailable")
    expect(missing.metadata).not.toHaveProperty("atlasMemory")
    expect(asks).toEqual([])
    const foreign = yield* recall.execute({ kind: "task", taskId: task.taskId }, context("maestro", asks))
    expect(JSON.parse(foreign.output).outcome).toBe("unavailable")
    expect(asks).toEqual([])
    const memory = yield* AtlasMemory.open(execution, { id: "jimmy", native: true })
    if ("unavailable" in memory) throw new Error(memory.unavailable)
    const written = memory.write(task)
    expect(written.ok).toBe(true)
    const fs = yield* FileSystem.FileSystem
    const log = path.join((yield* TestInstance).directory, ".atlas/memory.jsonl")
    yield* fs.writeFileString(log, `${yield* fs.readFileString(log)}not-json\n`)
    const partial = yield* recall.execute({ kind: "task", taskId: task.taskId }, context("jimmy"))
    expect(JSON.parse(partial.output)).toMatchObject({ store: "partial" })
    expect(JSON.parse(partial.output).records).toHaveLength(1)
    expect(yield* AtlasHeader.render({ id: "jimmy", native: true })).toContain('degraded="rules-partial"')
    yield* fs.remove(log)
    yield* fs.makeDirectory(log)
    const unavailable = yield* recall.execute({ kind: "task", taskId: task.taskId }, context("jimmy"))
    expect(JSON.parse(unavailable.output)).toMatchObject({ store: "unavailable" })
    expect(JSON.parse(unavailable.output)).not.toHaveProperty("records")
    expect(yield* AtlasHeader.render({ id: "jimmy", native: true })).toContain('member="jimmy" degraded="unavailable"')
    expect(yield* AtlasHeader.render({ id: "backend", native: true })).toContain('member="backend" degraded="unavailable"')
    expect(yield* AtlasHeader.render({ id: "archie", native: true })).toContain('member="archie" degraded="unavailable"')
  }), { git: true },
)

;(["jimmy", "archie"] as const).map((member) => it.instance(`${member} resume admits exact own fold once using durable admission evidence`, () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const agent = yield* agents.get(member)
    const child = yield* sessions.create({ agent: member })
    const memory = yield* AtlasMemory.open(execution, agent)
    if ("unavailable" in memory) throw new Error(memory.unavailable)
    const written = memory.write(task)
    if (!written.ok) throw new Error(JSON.stringify(written))
    const user = yield* sessions.updateMessage({
      id: MessageID.ascending(), role: "user", sessionID: child.id, agent: member,
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") }, time: { created: Date.now() },
    })
    const input = { agent, sessionID: child.id, unit: { kind: "task" as const, id: task.taskId }, ctx: context("maestro") }
    const admitted = yield* AtlasResume.admit(input)
    expect(admitted).toHaveLength(1)
    expect(admitted[0].metadata.atlasResume).toMatchObject({
      key: { memoryOwner: member, kind: "task", id: task.taskId }, verdict: { ok: true, ref: written.ref },
    })
    yield* sessions.updatePart({ ...admitted[0], id: PartID.ascending(), sessionID: child.id, messageID: user.id })
    expect(yield* AtlasResume.admit(input)).toEqual([])
    const history = yield* sessions.messages({ sessionID: child.id })
    expect(AtlasMemory.findAdmission(history, admitted[0].metadata.atlasResume.key)?.verdict).toEqual({ ok: true, ref: written.ref })
    expect(AtlasMemory.findAdmission(history, { ...admitted[0].metadata.atlasResume.key, memoryOwner: "backend" })).toBeUndefined()
    // A later provider admission cannot replace the reference under the already admitted resume key.
    expect(memory.write({ ...task, lesson: "newer checkpoint after initial admission" }).ok).toBe(true)
    const compact = yield* sessions.updateMessage({
      ...user, id: MessageID.ascending(), time: { created: Date.now() + 1 },
    })
    yield* sessions.updatePart({
      id: PartID.ascending(), messageID: compact.id, sessionID: child.id, type: "compaction", auto: false,
    })
    yield* sessions.updateMessage({
      id: MessageID.ascending(), parentID: compact.id, sessionID: child.id, role: "assistant", agent: "compaction",
      mode: "compaction", summary: true, finish: "stop", cost: 0,
      path: { cwd: child.directory, root: child.directory },
      providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test"),
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: Date.now() + 2, completed: Date.now() + 3 },
    })
    const evicted = MessageV2.filterCompacted((yield* sessions.messages({ sessionID: child.id })).toReversed())
    expect(AtlasMemory.findAdmission(evicted, admitted[0].metadata.atlasResume.key)).toBeUndefined()
    yield* AtlasResumeRestore.restore({ session: sessions, sessionID: child.id, messageID: compact.id })
    yield* AtlasResumeRestore.restore({ session: sessions, sessionID: child.id, messageID: compact.id })
    const restored = (yield* sessions.messages({ sessionID: child.id })).flatMap((message) => message.parts)
      .filter((part) => "metadata" in part && part.metadata?.atlasResume?.residency === "restored")
    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({
      text: admitted[0].text,
      metadata: { atlasResume: { ...admitted[0].metadata.atlasResume, residency: "restored" } },
    })
  }), { git: true },
))

;(["jimmy", "archie"] as const).map((member) => it.instance(`real scanner blocks sensitive content for ${member}; complete Atlas refusal survives tool settlement`, () =>
  Effect.gen(function* () {
    const emit = yield* Tool.init(yield* AtlasMemoryEmitTool)
    const clean = yield* emit.execute({ entry: task }, context(member))
    expect(receipt(clean).outcome).toBe("admitted")
    // Invalid, synthetic private-key fragment: upstream's measured scanner control, not an allowlisted token.
    const blocked = yield* emit.execute({ entry: {
      ...task,
      lesson: [
        "-----BEGIN RSA PRIVATE KEY-----",
        "MIIEowIBAAKCAQEA3Tz2mr7SZiAMfQyuvBjM9OiJjRazXBZ1BjP5CE/Wm/RrFqiIiaEQ",
        "-----END RSA PRIVATE KEY-----",
      ].join("\n"),
    } }, context(member))
    expect(receipt(blocked)).toMatchObject({ outcome: "refused", refusal: { ok: false, refusal: "scanner-blocked", scanner: "gitleaks" } })
    expect(JSON.parse(blocked.output).refusal).toEqual(receipt(blocked).refusal)
    expect(JSON.parse(blocked.output).note).toBe("Not remembered.")
    const malformed = yield* emit.execute({ entry: { ...task, owner: "backend" } }, context(member))
    expect(receipt(malformed)).toMatchObject({ outcome: "refused", refusal: { ok: false, refusal: "undetermined-kind" } })
    const memory = yield* AtlasMemory.open(execution, { id: member, native: true })
    if ("unavailable" in memory) throw new Error(memory.unavailable)
    expect(memory.recall({ kind: "task", taskId: task.taskId }).records).toHaveLength(1)
  }), { git: true },
))

;(["jimmy", "archie"] as const).map((member) => it.instance(`${member} lost response after actual append stays uncertain; identical retry reconciles without another append`, () =>
  Effect.gen(function* () {
    const emit = yield* Tool.init(yield* AtlasMemoryEmitTool)
    const loseResponse: typeof AtlasMemory.open = (execution, agent) => AtlasMemory.open(execution, agent).pipe(
      Effect.map((memory) => "unavailable" in memory ? memory : {
        ...memory,
        write: (entry) => {
          const written = memory.write(entry)
          if (written.ok) throw new Error("injected response loss after actual durable append")
          return written
        },
      }),
    )
    const uncertain = yield* emit.execute({ entry: task }, context(member)).pipe(Effect.provideService(Open, loseResponse))
    expect(receipt(uncertain).outcome).toBe("uncertain")
    expect(receipt(uncertain).ref).toBeUndefined()
    const fs = yield* FileSystem.FileSystem
    const log = path.join((yield* TestInstance).directory, ".atlas/memory.jsonl")
    const before = yield* fs.readFileString(log)
    expect(before.trim().split("\n")).toHaveLength(1)
    const retry = yield* emit.execute({ entry: task }, context(member))
    expect(receipt(retry)).toMatchObject({ outcome: "admitted", reconciled: true })
    expect(receipt(retry).ref?.eventId).toBeString()
    expect(yield* fs.readFileString(log)).toBe(before)
  }), { git: true },
))

it.instance("native receipt selection uses latest jimmy checkpoint; reconciled old and refused writes do not advance it", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const child = yield* sessions.create({ agent: "jimmy" })
    const emit = yield* Tool.init(yield* AtlasMemoryEmitTool)
    const newer = { ...task, lesson: "latest admitted source checkpoint" }
    const results = yield* Effect.forEach([task, newer, task, { ...newer, owner: "backend" }], Effect.fnUntraced(function* (entry, index) {
      const message = yield* sessions.updateMessage({
        id: MessageID.ascending(), parentID: MessageID.ascending(), sessionID: child.id, role: "assistant", agent: "jimmy",
        mode: "jimmy", cost: 0, path: { cwd: child.directory, root: child.directory },
        providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test"),
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: Date.now() + index },
      })
      const ctx = { ...context("jimmy"), sessionID: child.id, messageID: message.id, callID: `call_memory_${index}` }
      const result = yield* emit.execute({ entry }, ctx)
      yield* sessions.updatePart({
        id: PartID.ascending(), messageID: message.id, sessionID: child.id, type: "tool",
        tool: "atlas_memory_emit", callID: ctx.callID,
        state: {
          status: "completed", input: { entry }, title: result.title, output: result.output,
          metadata: result.metadata, time: { start: Date.now(), end: Date.now() },
        },
      })
      return receipt(result)
    }))
    expect(results.map((receipt) => receipt.outcome)).toEqual(["admitted", "admitted", "admitted", "refused"])
    expect(results[2].reconciled).toBe(true)
    if (!results[1].ref) throw new Error("latest admission has no native reference")
    const fold = yield* AtlasResume.admit({
      agent: yield* agents.get("jimmy"), sessionID: child.id, unit: { kind: "task", id: task.taskId }, ctx: context("maestro"),
    })
    expect(fold).toHaveLength(1)
    expect(fold[0].metadata.atlasResume.verdict).toEqual({ ok: true, ref: results[1].ref })
    expect(fold[0].text).toContain(newer.lesson)
  }), { git: true },
)

it.instance("overlapping same-process native tasks preserve owner isolation and identical retry admissions", () =>
  Effect.gen(function* () {
    const sessions = yield* Session.Service
    const emit = yield* Tool.init(yield* AtlasMemoryEmitTool)
    const recall = yield* Tool.init(yield* AtlasMemoryRecallTool)
    const callers = yield* Effect.forEach(["backend", "jimmy", "archie", "backend", "jimmy", "archie"] as const, (member, index) =>
      Effect.gen(function* () {
        const child = yield* sessions.create({ agent: member })
        const ctx = { ...context(member), sessionID: child.id, callID: `overlap-${index}`, messageID: MessageID.ascending() }
        const entry = { ...task, taskId: `overlap-${Math.floor(index / 3)}`, lesson: `${member} retains its own conditional evidence` }
        return { member, ctx, entry }
      }),
    )
    const admitted = yield* Effect.forEach(callers, (caller) => emit.execute({ entry: caller.entry }, caller.ctx), { concurrency: "unbounded" })
    admitted.forEach((result, index) => {
      expect(receipt(result)).toMatchObject({ outcome: "admitted", binding: { memoryOwner: callers[index].member, sessionID: callers[index].ctx.sessionID } })
      expect(receipt(result).ref).toBeDefined()
    })
    const fs = yield* FileSystem.FileSystem
    const log = path.join((yield* TestInstance).directory, ".atlas/memory.jsonl")
    const beforeRetry = yield* fs.readFileString(log)
    expect(beforeRetry.trim().split("\n")).toHaveLength(callers.length)
    const retried = yield* Effect.forEach(callers, (caller) => emit.execute({ entry: caller.entry }, caller.ctx), { concurrency: "unbounded" })
    retried.forEach((result, index) => expect(receipt(result)).toMatchObject({ outcome: "admitted", reconciled: true, ref: receipt(admitted[index]).ref }))
    expect(yield* fs.readFileString(log)).toBe(beforeRetry)
    yield* Effect.forEach(callers, (caller, index) => Effect.gen(function* () {
      const result = yield* recall.execute({ kind: "task", taskId: caller.entry.taskId }, caller.ctx)
      const own = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ store: Schema.Literal("complete"), records: Schema.Array(Schema.Struct({ entry: Schema.Unknown })) })))(result.output)
      expect(own.records.map((record) => record.entry)).toEqual([caller.entry])
      expect(receipt(result)).toMatchObject({ outcome: "read", binding: { memoryOwner: caller.member }, refs: [receipt(admitted[index]).ref] })
    }), { discard: true })
  }), { git: true },
)
