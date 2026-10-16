import { expect } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { Buffer } from "node:buffer"
import { publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@orchestra/atlas-boundary/materialize"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionProjector } from "@orchestra/core/session/projector"
import { MessageTable, PartTable, SessionMessageTable } from "@orchestra/core/session/sql"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { AtlasDiscovery } from "@/maestro/atlas-discovery"
import { Anchor } from "@orchestra/schema/atlas-knowledge"
import { SessionMessage } from "@orchestra/schema/session-message"
import { ProjectID } from "@orchestra/schema/project-id"
import { eq } from "drizzle-orm"
import { Effect, FileSystem } from "effect"
import { Git } from "@/git"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { Skill } from "@/skill"
import { AtlasContextTool } from "@/tool/atlas-context"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { requireInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  AtlasKnowledge.node, Truncate.node, SessionProjector.node, filesystem, Agent.node, Config.node,
  Git.node, Session.node, Skill.node, Database.node,
])))

const seed = Effect.fn("AtlasKnowledgeTest.seed")(function* (options?: {
  count?: number; body?: string; maxBytes?: number; partial?: boolean
}) {
  const fs = yield* FileSystem.FileSystem
  const git = yield* Git.Service
  const directory = (yield* TestInstance).directory
  yield* fs.makeDirectory(path.join(directory, "src"), { recursive: true })
  yield* fs.writeFileString(path.join(directory, "src/unit.ts"), "export const value = 1\n")
  yield* git.run(["add", "src"], { cwd: directory })
  const committed = yield* git.run(["commit", "-m", "Atlas anchor source"], { cwd: directory })
  expect(committed.exitCode).toBe(0)
  const revision = yield* git.run(["rev-parse", "HEAD"], { cwd: directory })
  const blob = yield* git.run(["hash-object", "--no-filters", "--", "src/unit.ts"], { cwd: directory })
  expect(revision.exitCode).toBe(0)
  expect(blob.exitCode).toBe(0)
  const snapshot = parseOwnSnapshot(JSON.stringify({
    schemaVersion: 1, snapshot: "anchor-fixture", sourceRevision: revision.text().trim(),
    units: Array.from({ length: options?.count ?? 2 }, (_, index) => ({
      unit: { level: "module", id: `packages/unit-${index}`, grounding: null },
      sourceBlobs: { "src/unit.ts": blob.text().trim() },
      pack: {
        unit: options?.body ?? `Unit ${index}: exact source bytes, café 🪨.`,
        invariants: [{ nodeId: `value-${index}`, tier: "T1", claim: "Value remains one.", freshness: "FRESH" }],
        shape: { contents: ["src/unit.ts"], owner: "atlas", tier: "T1" },
        edges: { dependents: [], dependencies: [] }, gotchas: [], memory: null,
        drill: { finer: [], refresh: { pull: `poke:${index}` }, complement: { pull: `relate:${index}` } },
        grounding: { source: "tree" }, tokenEstimate: 20,
        manifest: { pointers: [], truncated: options?.partial ?? false }, pullReachable: [], advisory: [], advisoryDropped: 0,
      },
    })),
  }))
  if (!snapshot) throw new Error("anchor Own fixture refused")
  const materialized = materializeStaticOwnSnapshot(snapshot)
  const instance = yield* requireInstance
  yield* fs.writeFileString(path.join(directory, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
  yield* fs.writeFileString(path.join(directory, "TERRITORY-CATALOG.json"), JSON.stringify(
    publishTerritoryCatalog(instance.project.id, [{ name: "source", owner: "backend", tier: "T1", globs: ["src/**"] }]),
  ))
  yield* Effect.forEach([...materialized.skills, materialized.coverage], Effect.fnUntraced(function* (file) {
    yield* fs.makeDirectory(path.dirname(path.join(directory, file.path)), { recursive: true })
    yield* fs.writeFileString(path.join(directory, file.path), file.content)
  }))
  yield* fs.writeFileString(path.join(directory, "orchestra.json"), JSON.stringify({
    maestro: { atlas: { projectID: instance.project.id, directory: "." } },
    skills: { paths: [path.join(directory, ".orchestra", "skills")] },
    agent: { archie: { name: "Renamed planner" } },
    ...(options?.maxBytes === undefined ? {} : { tool_output: { max_bytes: options.maxBytes } }),
  }))
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ agent: "archie" })
  const message = yield* sessions.updateMessage({
    id: MessageID.ascending(), parentID: MessageID.ascending(), sessionID: session.id,
    role: "assistant", agent: "archie", mode: "archie", cost: 0,
    modelID: ModelV2.ID.make("test"), providerID: ProviderV2.ID.make("test"),
    path: { cwd: directory, root: directory }, time: { created: Date.now() },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  })
  const input = { action: "anchor" as const, target: { kind: "work-package" as const, id: "wp-current" },
    units: ["packages/unit-1", "packages/unit-0"] }
  const part = yield* sessions.updatePart({
    id: PartID.ascending(), sessionID: session.id, messageID: message.id, type: "tool", tool: "atlas_context",
    callID: "call_anchor", state: { status: "running", input, time: { start: Date.now() } },
  })
  const ctx: Tool.Context = {
    sessionID: session.id, messageID: message.id, callID: part.callID, agentID: "archie", agent: "Renamed planner",
    abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void, ask: () => Effect.void,
  }
  const tool = yield* Tool.init(yield* AtlasContextTool)
  const write = Effect.fnUntraced(function* (anchor: Anchor) {
    return yield* sessions.updatePart({ ...part, state: {
      status: "completed", input, output: JSON.stringify(anchor), title: "Atlas anchor",
      time: { start: Date.now(), end: Date.now() }, metadata: { atlasContext: { anchor } },
    } })
  })
  return { directory, session, message, part, ctx, input, tool, write, snapshot, materialized }
})

const complete = Effect.fn("AtlasKnowledgeTest.complete")(function* () {
  const data = yield* seed()
  const result = yield* data.tool.execute(data.input, data.ctx)
  const anchor = result.metadata.atlasContext.anchor
  if (!anchor) throw new Error(result.output)
  expect(JSON.parse(result.output)).toEqual({ reference: anchor.reference, target: anchor.target,
    units: anchor.units.map((unit) => ({ unit: unit.unit, name: unit.name, sourceIdentity: unit.sourceIdentity,
      sourceRevision: unit.sourceRevision, contentHash: unit.contentHash, receiptHash: unit.receiptHash, bodyHash: unit.bodyHash })) })
  anchor.units.forEach((unit) => expect(result.output).not.toContain(JSON.stringify(unit.content).slice(1, -1)))
  yield* data.write(anchor)
  return { ...data, anchor, result, resolve: {
    projectID: data.session.projectID, authorSessionID: data.session.id, reference: anchor.reference,
  } }
})

it.instance("renamed native Archie anchors exact selected bytes and resolves only completed host tool metadata", () => Effect.gen(function* () {
  const data = yield* seed()
  const knowledge = yield* AtlasKnowledge.Service
  const result = yield* data.tool.execute(data.input, data.ctx)
  const anchor = result.metadata.atlasContext.anchor
  if (!anchor) throw new Error(result.output)
  expect(anchor).toMatchObject({ projectID: data.session.projectID, authorSessionID: data.session.id,
    assistantMessageID: data.message.id, callID: data.part.callID, memberID: "archie", target: data.input.target })
  expect(anchor.units.map((unit) => unit.unit)).toEqual(data.input.units)
  expect(anchor.reference).toBe(createHash("sha256").update(JSON.stringify(anchor,
    (key, value) => key === "reference" ? undefined : value), "utf8").digest("hex"))
  yield* Effect.forEach(anchor.units, Effect.fnUntraced(function* (unit) {
    const selected = yield* AtlasDiscovery.unit(data.session, unit.unit)
    const skills = yield* Skill.Service
    expect(unit.content).toBe((yield* skills.require(selected.name)).content)
    expect(unit).toMatchObject({ name: selected.name, sourceIdentity: selected.sourceIdentity,
      sourceRevision: selected.receipt.sourceRevision, contentHash: selected.receipt.contentHash,
      receiptHash: selected.receiptHash, bodyHash: createHash("sha256").update(selected.content, "utf8").digest("hex") })
    expect(unit.bodyHash).not.toBe(unit.contentHash)
  }))
  const input = { projectID: data.session.projectID, authorSessionID: data.session.id, reference: anchor.reference }
  expect((yield* knowledge.resolve(input).pipe(Effect.flip)).reason).toBe("anchor-not-found")
  yield* data.write(anchor)
  expect(yield* knowledge.resolve(input)).toEqual(anchor)
  expect(yield* knowledge.resolve(input)).toEqual(anchor)
  expect(result.metadata).not.toHaveProperty("researchSource")
}), { git: true })

it.instance("resolver refuses target, body, digest, receipt, identity, and closed-schema forgery", () => Effect.gen(function* () {
  const data = yield* complete()
  const knowledge = yield* AtlasKnowledge.Service
  const first = data.anchor.units[0]
  const variants: { value: unknown; reason: string }[] = [
    { value: { ...data.anchor, target: { kind: "assignment", id: "other" } }, reason: "anchor-invocation-mismatch" },
    { value: { ...data.anchor, projectID: "prj_foreign" }, reason: "anchor-invocation-mismatch" },
    { value: { ...data.anchor, assistantMessageID: MessageID.ascending() }, reason: "anchor-invocation-mismatch" },
    { value: { ...data.anchor, callID: "foreign-call" }, reason: "anchor-invocation-mismatch" },
    { value: { ...data.anchor, units: [first, first] }, reason: "anchor-invocation-mismatch" },
    { value: { ...data.anchor, units: [{ ...first, content: "forged" }, data.anchor.units[1]] }, reason: "anchor-digest-mismatch" },
    { value: { ...data.anchor, memberID: "backend" }, reason: "anchor-invocation-mismatch" },
    { value: { ...data.anchor, authority: true }, reason: "anchor-invocation-mismatch" },
  ]
  const database = yield* Database.Service
  yield* Effect.forEach(variants, Effect.fnUntraced(function* (variant) {
    const corrupted = {
      type: "tool" as const, tool: "atlas_context", callID: data.part.callID,
      state: { status: "completed" as const, input: data.input, output: "untrusted output", title: "Atlas",
        time: { start: 1, end: 2 }, metadata: { atlasContext: { anchor: variant.value } } },
    }
    yield* database.db.update(PartTable).set({ data: corrupted }).where(eq(PartTable.id, data.part.id)).run().pipe(Effect.orDie)
    expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe(variant.reason)
  }))
  yield* data.write(data.anchor)
  expect(yield* knowledge.resolve(data.resolve)).toEqual(data.anchor)
  yield* Effect.forEach(["bodyHash", "contentHash", "receiptHash", "sourceIdentity", "sourceRevision", "name"] as const,
    Effect.fnUntraced(function* (field) {
      const changed = { ...data.anchor, units: [{ ...first, [field]: field === "name" || field === "sourceRevision" ? "changed" : "f".repeat(64) }, data.anchor.units[1]] }
      const forged = { ...changed, reference: AtlasKnowledge.reference(changed) }
      yield* data.write(forged)
      expect((yield* knowledge.resolve({ ...data.resolve, reference: forged.reference }).pipe(Effect.flip)).reason)
        .toBe(field === "bodyHash" ? "anchor-digest-mismatch" : "anchor-source-drift")
    }))
}), { git: true }, 90_000)

it.instance("actual source drift and wrong author/project never resolve retained bytes", () => Effect.gen(function* () {
  const data = yield* complete()
  const knowledge = yield* AtlasKnowledge.Service
  const sessions = yield* Session.Service
  const other = yield* sessions.create({ agent: "archie" })
  expect((yield* knowledge.resolve({ ...data.resolve, authorSessionID: other.id }).pipe(Effect.flip)).reason).toBe("anchor-not-found")
  expect((yield* knowledge.resolve({ ...data.resolve, projectID: ProjectID.make("prj_foreign") }).pipe(Effect.flip)).reason)
    .toBe("author-session-binding-mismatch")
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(path.join(data.directory, "src/unit.ts"), "export const value = 2\n")
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("artifacts-invalid")
  yield* fs.writeFileString(path.join(data.directory, "src/unit.ts"), "export const value = 1\n")
  expect(yield* knowledge.resolve(data.resolve)).toEqual(data.anchor)
}), { git: true })

it.instance("provider-executed and duplicate legacy calls cannot certify an anchor", () => Effect.gen(function* () {
  const data = yield* complete()
  const knowledge = yield* AtlasKnowledge.Service
  const sessions = yield* Session.Service
  const stored = yield* sessions.getPart({ sessionID: data.session.id, messageID: data.message.id, partID: data.part.id })
  if (!stored || stored.type !== "tool") throw new Error("missing tool part")
  yield* sessions.updatePart({ ...stored, metadata: { providerExecuted: true } })
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-invocation-mismatch")
  yield* sessions.updatePart({ ...stored, metadata: { providerExecuted: false } })
  expect(yield* knowledge.resolve(data.resolve)).toEqual(data.anchor)
  yield* sessions.updatePart({ ...stored, id: PartID.ascending() })
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-duplicate")
}), { git: true })

it.instance("stored input, tool name, and assistant identity must match actual native anchor invocation", () => Effect.gen(function* () {
  const data = yield* complete()
  const knowledge = yield* AtlasKnowledge.Service
  const sessions = yield* Session.Service
  const stored = yield* sessions.getPart({ sessionID: data.session.id, messageID: data.message.id, partID: data.part.id })
  if (!stored || stored.type !== "tool" || stored.state.status !== "completed") throw new Error("missing completed anchor")
  const state = stored.state
  yield* Effect.forEach([
    { action: "catalog" }, { ...data.input, units: [...data.input.units].reverse() },
    { ...data.input, units: ["packages/unit-0", "packages/unit-0"] },
    { ...data.input, target: { kind: "assignment", id: "other" } },
    { ...data.input, owner: "archie" },
  ], Effect.fnUntraced(function* (input) {
    yield* sessions.updatePart({ ...stored, state: { ...state, input } })
    expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-invocation-mismatch")
  }))
  yield* sessions.updatePart({ ...stored, tool: "skill" })
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-invocation-mismatch")
  yield* data.write(data.anchor)
  yield* sessions.updateMessage({ ...data.message, agent: "impostor" })
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-invocation-mismatch")
  yield* sessions.updateMessage(data.message)
  expect(yield* knowledge.resolve(data.resolve)).toEqual(data.anchor)
}), { git: true })

it.instance("V2 native host metadata resolves; conflicting projection and provider-owned result never substitute", () => Effect.gen(function* () {
  const data = yield* complete()
  const knowledge = yield* AtlasKnowledge.Service
  const database = yield* Database.Service
  const modern = {
    type: "assistant" as const, id: SessionMessage.ID.make(data.message.id), agent: "archie",
    model: { providerID: ProviderV2.ID.make("test"), id: ModelV2.ID.make("test") },
    time: { created: 1 }, content: [{ type: "tool" as const, id: data.part.callID, name: "atlas_context",
      time: { created: 1, completed: 2 }, state: { status: "completed" as const, input: data.input, content: [],
        structured: { metadata: { atlasContext: { anchor: data.anchor } } } } }],
  }
  yield* database.db.insert(SessionMessageTable).values({
    id: modern.id, session_id: data.session.id, type: "assistant", seq: 1,
    time_created: 1, time_updated: 2, data: modern,
  }).run().pipe(Effect.orDie)
  expect(yield* knowledge.resolve(data.resolve)).toEqual(data.anchor)
  const impostor = { ...modern, agent: "impostor" }
  yield* database.db.update(SessionMessageTable).set({ data: impostor })
    .where(eq(SessionMessageTable.id, modern.id)).run().pipe(Effect.orDie)
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-projection-mismatch")
  const missingCall = { ...modern, content: [] }
  yield* database.db.update(SessionMessageTable).set({ data: missingCall })
    .where(eq(SessionMessageTable.id, modern.id)).run().pipe(Effect.orDie)
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-projection-mismatch")
  const sessions = yield* Session.Service
  const other = yield* sessions.create({ agent: "archie" })
  yield* database.db.update(SessionMessageTable).set({ data: modern, session_id: other.id })
    .where(eq(SessionMessageTable.id, modern.id)).run().pipe(Effect.orDie)
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-projection-mismatch")
  yield* database.db.update(SessionMessageTable).set({ session_id: data.session.id })
    .where(eq(SessionMessageTable.id, modern.id)).run().pipe(Effect.orDie)
  yield* database.db.update(SessionMessageTable).set({ data: modern }).where(eq(SessionMessageTable.id, modern.id)).run().pipe(Effect.orDie)
  yield* database.db.delete(PartTable).where(eq(PartTable.id, data.part.id)).run().pipe(Effect.orDie)
  yield* database.db.delete(MessageTable).where(eq(MessageTable.id, data.message.id)).run().pipe(Effect.orDie)
  expect(yield* knowledge.resolve(data.resolve)).toEqual(data.anchor)
  const part = modern.content[0]
  const providerExecuted = { ...modern, content: [{ ...part, provider: { executed: true } }] }
  yield* database.db.update(SessionMessageTable).set({ data: providerExecuted })
    .where(eq(SessionMessageTable.id, modern.id)).run().pipe(Effect.orDie)
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-invocation-mismatch")
  const providerResult = { ...modern, content: [{ ...part,
    provider: { executed: true }, state: { ...part.state, structured: {}, result: { metadata: { atlasContext: { anchor: data.anchor } } } },
  }] }
  yield* database.db.update(SessionMessageTable).set({ data: providerResult }).where(eq(SessionMessageTable.id, modern.id)).run().pipe(Effect.orDie)
  expect((yield* knowledge.resolve(data.resolve).pipe(Effect.flip)).reason).toBe("anchor-not-found")
}), { git: true })

it.instance("bounded catalog omissions do not block complete exact selected units", () => Effect.gen(function* () {
  const data = yield* seed({ count: 51 })
  expect((yield* AtlasDiscovery.catalog(data.session)).coverage.state).toBe("partial")
  const result = yield* data.tool.execute(data.input, data.ctx)
  expect(result.metadata.atlasContext.anchor?.units.map((unit) => unit.unit)).toEqual(data.input.units)
  expect(result.metadata.atlasContext.coverage.state).toBe("complete")
}), { git: true }, 90_000)

it.instance("partial Own context cannot mint an anchor", () => Effect.gen(function* () {
  const data = yield* seed({ partial: true })
  const result = yield* data.tool.execute(data.input, data.ctx)
  expect(JSON.parse(result.output)).toMatchObject({ status: "held", reason: "unit-context-incomplete" })
  expect(result.metadata.atlasContext).not.toHaveProperty("anchor")
}), { git: true })

it.instance("aggregate selected plain bodies enforce 128KiB UTF8 budget", () => Effect.gen(function* () {
  const data = yield* seed({ count: 8, body: "é".repeat(9_000) })
  const units = Array.from({ length: 8 }, (_, index) => `packages/unit-${index}`)
  const sessions = yield* Session.Service
  const knowledge = yield* AtlasKnowledge.Service
  yield* sessions.updatePart({ ...data.part, state: {
    status: "running", input: { ...data.input, units }, time: { start: Date.now() },
  } })
  const acquired = yield* AtlasDiscovery.unit(data.session, units[0])
  expect(Buffer.byteLength(acquired.content, "utf8")).toBeGreaterThan(16 * 1024)
  expect((yield* knowledge.anchor({ session: data.session, assistantMessageID: data.message.id,
    callID: data.part.callID, target: data.input.target, units }).pipe(Effect.flip)).reason)
    .toBe("knowledge-body-budget-exceeded")
}), { git: true }, 90_000)

it.instance("an anchor above the default tool output limit but inside 128KiB binds and resolves", () => Effect.gen(function* () {
  const data = yield* seed({ count: 8, body: "é".repeat(5_500) })
  const units = Array.from({ length: 8 }, (_, index) => `packages/unit-${index}`)
  const input = { ...data.input, units }
  const sessions = yield* Session.Service
  const running = yield* sessions.updatePart({ ...data.part, state: { status: "running", input, time: { start: Date.now() } } })
  const result = yield* data.tool.execute(input, data.ctx)
  const anchor = result.metadata.atlasContext.anchor
  if (!anchor) throw new Error(result.output)
  const bytes = anchor.units.reduce((total, unit) => total + Buffer.byteLength(unit.content, "utf8"), 0)
  expect(bytes).toBeGreaterThan(Truncate.MAX_BYTES)
  expect(bytes).toBeLessThanOrEqual(128 * 1024)
  expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(Truncate.MAX_BYTES)
  expect(JSON.parse(result.output).reference).toBe(anchor.reference)
  expect(result.metadata.atlasContext.coverage.state).toBe("complete")
  yield* sessions.updatePart({ ...running, state: {
    status: "completed", input, output: result.output, title: result.title,
    time: { start: Date.now(), end: Date.now() }, metadata: result.metadata,
  } })
  const knowledge = yield* AtlasKnowledge.Service
  expect(yield* knowledge.resolve({ projectID: data.session.projectID, authorSessionID: data.session.id,
    reference: anchor.reference })).toEqual(anchor)
}), { git: true }, 90_000)

it.instance("anchor output budget hold retains no anchor metadata", () => Effect.gen(function* () {
  const data = yield* seed({ maxBytes: 128 })
  const result = yield* data.tool.execute(data.input, data.ctx)
  expect(JSON.parse(result.output)).toEqual({ status: "held", reason: "context-output-budget-exceeded" })
  expect(result.metadata.atlasContext).not.toHaveProperty("anchor")
  expect(result.metadata.truncated).toBe(false)
}), { git: true })
