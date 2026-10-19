import { expect } from "bun:test"
import { Buffer } from "node:buffer"
import path from "node:path"
import { publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@orchestra/atlas-boundary/materialize"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Effect, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { AtlasDiscovery } from "@/maestro/atlas-discovery"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { AtlasContextHeld } from "@/maestro/atlas-source"
import { LEGACY_BACKEND_ID } from "@orchestra/maestro/roster"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { ResearchSourceCapture } from "@/research/source-capture"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { Skill } from "@/skill"
import { AtlasContextTool } from "@/tool/atlas-context"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { reloadInstance, requireInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Config.node, Git.node, Session.node, SessionProjector.node, Database.node,
  Skill.node, Truncate.node, filesystem,
  AtlasKnowledge.node,
  EventV2Bridge.node, ResearchExecution.node, ResearchRecords.node,
  ToolRegistry.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]]))

const fixture = Effect.fn("AtlasDiscoveryTest.fixture")(function* (count = 2, member: AtlasMemory.Owner = "jimmy", maxBytes?: number) {
  const fs = yield* FileSystem.FileSystem
  const git = yield* Git.Service
  const config = yield* Config.Service
  const instance = yield* requireInstance
  const directory = (yield* TestInstance).directory
  yield* fs.makeDirectory(path.join(directory, "src"), { recursive: true })
  yield* fs.writeFileString(path.join(directory, "src/unit.ts"), "export const current = 1\n")
  const command = Effect.fnUntraced(function* (args: string[]) {
    const result = yield* git.run(args, { cwd: directory })
    expect(result.exitCode).toBe(0)
    expect(result.truncated).toBe(false)
    return result.text().trim()
  })
  yield* command(["add", "src"])
  yield* command(["commit", "-m", "Own source fixture"])
  const revision = yield* command(["rev-parse", "HEAD"])
  const blob = yield* command(["hash-object", "--no-filters", "--", "src/unit.ts"])
  const snapshot = parseOwnSnapshot(JSON.stringify({
    schemaVersion: 1,
    snapshot: "discovery-fixture",
    sourceRevision: revision,
    units: Array.from({ length: count }, (_, index) => ({
      unit: { level: "module", id: `packages/unit-${index}`, grounding: null },
      sourceBlobs: { "src/unit.ts": blob },
      pack: {
        unit: `Unit ${index} owns source behavior.`,
        invariants: [{ nodeId: `contract-${index}`, tier: "T1", claim: "Current source value is one.", freshness: "FRESH" }],
        shape: { contents: ["src/unit.ts"], owner: "atlas", tier: "T1" },
        edges: { dependents: [], dependencies: [] }, gotchas: [], memory: null,
        drill: { finer: [], refresh: { pull: `poke:unit-${index}` }, complement: { pull: `relate:unit-${index}` } },
        grounding: { source: "tree" }, tokenEstimate: 20,
        manifest: { pointers: [], truncated: false }, pullReachable: [], advisory: [], advisoryDropped: 0,
      },
    })),
  }))
  if (!snapshot) throw new Error("canonical Own fixture refused")
  const output = materializeStaticOwnSnapshot(snapshot)
  yield* fs.writeFileString(path.join(directory, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
  yield* fs.writeFileString(path.join(directory, "TERRITORY-CATALOG.json"), JSON.stringify(
    publishTerritoryCatalog(instance.project.id, [{ name: "source", owner: "backend", tier: "T1", globs: ["src/**"] }]),
  ))
  yield* Effect.forEach([...output.skills, output.coverage], Effect.fnUntraced(function* (file) {
    yield* fs.makeDirectory(path.dirname(path.join(directory, file.path)), { recursive: true })
    yield* fs.writeFileString(path.join(directory, file.path), file.content)
  }))
  yield* fs.writeFileString(path.join(directory, "orchestra.json"), JSON.stringify({
    maestro: { atlas: { projectID: instance.project.id, directory: "." } },
    skills: { paths: [path.join(directory, ".orchestra", "skills")] },
    ...(maxBytes === undefined ? {} : { tool_output: { max_bytes: maxBytes } }),
    agent: { [member]: { name: "context-renamed" }, impostor: { name: "archie", permission: { "*": "allow" } } },
  }))
  expect((yield* config.get()).maestro?.atlas?.projectID).toBe(instance.project.id)
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ agent: member })
  const asks: unknown[] = []
  const ctx: Tool.Context = {
    sessionID: session.id, messageID: MessageID.ascending(), callID: "call_context",
    agent: "context-renamed", agentID: member, abort: AbortSignal.any([]), messages: [],
    metadata: () => Effect.void,
    ask: (request) => Effect.sync(() => { asks.push(request) }),
  }
  return { directory, session, ctx, asks, snapshot, output, command }
})

;(["backend", "jimmy", "archie"] as const).map((member) => it.instance(`native ${member} loads exact verified bytes and host receipt under rename`, () =>
  Effect.gen(function* () {
    const data = yield* fixture(2, member)
    const agents = yield* Agent.Service
    expect(yield* agents.get(member)).toMatchObject({ id: member, name: "context-renamed", native: true })
    const tool = yield* Tool.init(yield* AtlasContextTool)
    const catalog = yield* tool.execute({ action: "catalog" }, data.ctx)
    expect(catalog.metadata.atlasContext.coverage).toMatchObject({ state: "complete", bodiesLoaded: false })
    const listed = JSON.parse(catalog.output)
    if (!listed.units) throw new Error(catalog.output)
    expect(listed.units.map((unit: { unit: string }) => unit.unit)).toEqual(["packages/unit-0", "packages/unit-1"])
    expect(listed).not.toHaveProperty("content")
    const result = yield* tool.execute({ action: "unit", unit: "packages/unit-0" }, data.ctx)
    const loaded = JSON.parse(result.output)
    const skills = yield* Skill.Service
    expect(loaded.content).toBe((yield* skills.require(loaded.name)).content)
    expect(loaded.content).toContain("Current source value is one.")
    expect(loaded.receipt).toMatchObject({ unit: "packages/unit-0", sourceRevision: data.snapshot.sourceRevision })
    expect(result.metadata.atlasContext).toMatchObject({
      projectID: data.session.projectID, sourceIdentity: listed.sourceIdentity, unit: "packages/unit-0",
      contentHash: loaded.receipt.contentHash, receiptHash: loaded.receiptHash,
      coverage: { state: "complete", freshness: "FRESH", currentBlobsChecked: true, truncated: false },
    })
    expect(data.asks).toEqual(Array.from({ length: 2 }, () => ({
      permission: "atlas_context", patterns: [member], always: [member], metadata: {},
    })))
    const missing = yield* tool.execute({ action: "unit", unit: "unit-0" }, data.ctx)
    expect(JSON.parse(missing.output)).toMatchObject({ status: "held", reason: "unit-missing-or-ambiguous" })
  }), { git: true },
))

it.instance("Archie receives an explicit hold instead of incomplete context under a small output budget", () =>
  Effect.gen(function* () {
    const data = yield* fixture(2, "archie", 128)
    const tool = yield* Tool.init(yield* AtlasContextTool)
    const result = yield* tool.execute({ action: "unit", unit: "packages/unit-0" }, data.ctx)
    expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.output)).toEqual({
      status: "held", reason: "context-output-budget-exceeded",
    })
    expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(128)
    expect(result.metadata.truncated).toBe(false)
    expect(result.metadata).not.toHaveProperty("outputPath")
    expect(result.metadata.atlasContext).toMatchObject({
      sourceIdentity: null, coverage: { state: "held", reason: "context-output-budget-exceeded" },
    })
    expect(result.metadata.atlasContext.coverage).not.toHaveProperty("freshness")
    expect(result.metadata.atlasContext.coverage).not.toHaveProperty("truncated")
    yield* Effect.forEach([
      { input: { action: "catalog" }, reason: "context-output-budget-exceeded" },
      { input: { action: "unit", unit: "x".repeat(256) }, reason: "unit-missing-or-ambiguous" },
      { input: { action: "anchor", target: { kind: "assignment", id: "brief-1" }, units: ["x".repeat(256)] },
        reason: "anchor-not-found" },
    ] as const, Effect.fnUntraced(function* (probe) {
      const held = yield* tool.execute(probe.input, data.ctx)
      expect(JSON.parse(held.output)).toMatchObject({ status: "held", reason: probe.reason })
      expect(Buffer.byteLength(held.output, "utf8")).toBeLessThanOrEqual(128)
      expect(held.metadata.truncated).toBe(false)
      expect(held.metadata).not.toHaveProperty("outputPath")
      expect(held.metadata.atlasContext).not.toHaveProperty("anchor")
      expect(held.metadata.atlasContext.coverage.state).toBe("held")
      expect(held.metadata.atlasContext.coverage).not.toHaveProperty("freshness")
    }))
    const unavailable = yield* tool.execute({ action: "catalog" }, { ...data.ctx, agentID: undefined })
    expect(JSON.parse(unavailable.output)).toEqual({ status: "unavailable", reason: "missing-native-call-identity" })
    expect(Buffer.byteLength(unavailable.output, "utf8")).toBeLessThanOrEqual(128)
    expect(unavailable.metadata.truncated).toBe(false)
  }), { git: true },
)

;(["acquisition", "registry", "footer-bytes", "footer-lines", "tiny"] as const).map((mode) => it.instance(`jimmy retains exact Atlas Own acquisition in its actual research corpus: ${mode}`, () =>
  Effect.gen(function* () {
    const data = yield* fixture()
    const expected = yield* AtlasDiscovery.unit(data.session, "packages/unit-0")
    const content = JSON.stringify(expected)
    const maxBytes = mode === "tiny" ? 128 : mode === "footer-bytes" ? Buffer.byteLength(content, "utf8") : Truncate.MAX_BYTES
    const maxLines = mode === "footer-lines" ? 1 : Truncate.MAX_LINES
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFileString(path.join(data.directory, "orchestra.json"), JSON.stringify({
      ...JSON.parse(yield* fs.readFileString(path.join(data.directory, "orchestra.json"))),
      tool_output: { max_bytes: maxBytes, max_lines: maxLines },
    }))
    yield* reloadInstance({ directory: data.directory })
    const sessions = yield* Session.Service
    const authority = yield* sessions.create({ agent: "maestro" })
    const child = yield* sessions.create({ agent: "jimmy", parentID: authority.id })
    yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
      projectID: child.projectID, memberID: "jimmy", source: "host" })
    const message = yield* sessions.updateMessage({
      id: MessageID.ascending(), parentID: MessageID.ascending(), sessionID: child.id, role: "assistant", agent: "jimmy",
      mode: "jimmy", cost: 0, path: { cwd: child.directory, root: child.directory },
      providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test"),
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() },
    })
    const ctx = { ...data.ctx, sessionID: child.id, messageID: message.id, callID: "call_context_capture" }
    const input = { action: "unit" as const, unit: "packages/unit-0" }
    yield* sessions.updatePart({ id: PartID.ascending(), messageID: message.id, sessionID: child.id, type: "tool",
      tool: "atlas_context", callID: ctx.callID, state: { status: "running", input, time: { start: Date.now() } } })
    const capture = yield* ResearchSourceCapture.make
    const execution = yield* ResearchExecution.Service
    const registry = yield* ToolRegistry.Service
    const agents = yield* Agent.Service
    const offered = yield* registry.tools({ providerID: ProviderV2.ID.opencode, modelID: ModelV2.ID.make("test"),
      agent: yield* agents.get("jimmy") })
    const tool = mode === "acquisition" ? yield* Tool.init(yield* AtlasContextTool)
      : offered.find((tool) => tool.id === "atlas_context")
    if (!tool) throw new Error("native Atlas context tool missing")
    const result = yield* execution.enter(child.id, "atlas-context-dispatch",
      mode === "acquisition" ? capture.withCapture(ctx, "atlas_context", tool.execute(input, ctx), input)
        : tool.execute(input, ctx))
    const source = result.metadata.researchSource
    expect(source).toMatchObject({
      origin: { kind: "atlas-own", uri: "atlas-own:packages/unit-0", revision: expected.contentHash },
      complete: true, atlas: { sourceIdentity: expected.sourceIdentity, unit: expected.unit,
        contentHash: expected.contentHash, receiptHash: expected.receiptHash },
    })
    const records = yield* ResearchRecords.Service
    const binding = yield* ResearchBinding.resolve(child.id, child.projectID)
    if (!source) throw new Error("missing research source receipt")
    const page = yield* records.view(binding, { action: "source", ref: source.ref })
    expect("text" in page && page.text).toBe(content)
    expect("complete" in page && page.complete).toBe(true)
    expect(Buffer.byteLength(result.output, "utf8")).toBeLessThanOrEqual(maxBytes)
    expect(result.output.split("\n").length).toBeLessThanOrEqual(maxLines)
    expect(result.metadata.truncated).toBe(false)
    expect(result.metadata).not.toHaveProperty("outputPath")
    if (mode === "acquisition") expect(result.output).toBe(content)
    if (mode === "registry") {
      expect(result.output).toStartWith(content)
      expect(result.output).toContain(`Retained source evidence: ${JSON.stringify(source.ref)}`)
      expect(result.output).toContain("Locators address retained representation from line 1; original coordinates are recorded separately.")
      expect(result.metadata.atlasContext.coverage.state).toBe("complete")
    }
    if (mode === "footer-bytes" || mode === "footer-lines" || mode === "tiny") {
      expect(JSON.parse(result.output)).toEqual({ status: "held", reason: "context-output-budget-exceeded" })
      expect(result.metadata.atlasContext).toMatchObject({ sourceIdentity: null,
        coverage: { state: "held", reason: "context-output-budget-exceeded" } })
      expect(result.metadata.atlasContext).not.toHaveProperty("anchor")
      expect(result.metadata.atlasContext).not.toHaveProperty("contentHash")
      expect(result.metadata.atlasContext.coverage).not.toHaveProperty("freshness")
    }
  }), { git: true },
))

it.instance("native upstream reads the same verified context without execution authority", () =>
  Effect.gen(function* () {
    const data = yield* fixture(2, "archie")
    const tool = yield* Tool.init(yield* AtlasContextTool)
    const listed = yield* tool.execute({ action: "catalog" }, data.ctx)
    expect(listed.metadata.atlasContext.coverage).toMatchObject({ state: "complete", bodiesLoaded: false })
    const loaded = yield* tool.execute({ action: "unit", unit: "packages/unit-1" }, data.ctx)
    expect(loaded.metadata.atlasContext).toMatchObject({ projectID: data.session.projectID,
      sourceIdentity: listed.metadata.atlasContext.sourceIdentity, unit: "packages/unit-1",
      coverage: { state: "complete", freshness: "FRESH", currentBlobsChecked: true } })
    expect(JSON.parse(loaded.output).content).toContain("Current source value is one.")
    expect(data.asks).toEqual(Array.from({ length: 2 }, () => ({
      permission: "atlas_context", patterns: ["archie"], always: ["archie"], metadata: {},
    })))
    const held = yield* tool.execute({ action: "unit", unit: "unit-1" }, data.ctx)
    expect(JSON.parse(held.output)).toMatchObject({ status: "held", reason: "unit-missing-or-ambiguous" })
  }), { git: true },
)

it.instance("closed branches reject authority args; missing/foreign member never acquires context", () =>
  Effect.gen(function* () {
    const data = yield* fixture()
    const tool = yield* Tool.init(yield* AtlasContextTool)
    const decode = Schema.decodeUnknownOption(tool.parameters)
    expect(decode({ action: "catalog" })._tag).toBe("Some")
    expect(decode({ action: "unit", unit: "packages/unit-0" })._tag).toBe("Some")
    const anchor = { action: "anchor", target: { kind: "assignment", id: "brief-1" }, units: ["packages/unit-0"] }
    expect(decode(anchor)._tag).toBe("Some")
    ;[
      { action: "catalog", owner: "backend" }, { action: "catalog", root: data.directory },
      { action: "catalog", unit: "packages/unit-0" }, { action: "unit", unit: "" },
      { action: "unit", unit: "x".repeat(257) }, { action: "unit", unit: "packages/unit-0", projectID: data.session.projectID },
      { action: "approve" },
      { ...anchor, owner: "archie" }, { ...anchor, projectID: data.session.projectID },
      { ...anchor, target: { ...anchor.target, approval: true } },
      { ...anchor, target: { kind: "task", id: "tsk_not-authority" } },
      { ...anchor, units: [] }, { ...anchor, units: [""] }, { ...anchor, units: ["\0"] },
      { ...anchor, units: Array.from({ length: 9 }, (_, index) => `unit-${index}`) },
      { ...anchor, units: ["packages/unit-0", "packages/unit-0"] },
    ].map((input) => expect(decode(input)._tag).toBe("None"))
    yield* Effect.forEach([undefined, "maestro", "unknown", "impostor", "context-renamed", LEGACY_BACKEND_ID], (agentID) =>
      Effect.forEach([{ action: "catalog" }, { action: "unit", unit: "packages/unit-0" },
        { action: "anchor", target: { kind: "assignment", id: "brief-1" }, units: ["packages/unit-0"] }] as const, Effect.fnUntraced(function* (input) {
        const result = yield* tool.execute(input, { ...data.ctx, agentID, agent: "archie" })
        expect(JSON.parse(result.output).status).toBe("unavailable")
        expect(result.metadata.atlasContext.sourceIdentity).toBeNull()
      })),
    )
    yield* Effect.forEach([{ callID: undefined }, { messageID: "" }], Effect.fnUntraced(function* (missing) {
      const result = yield* tool.execute({ action: "catalog" }, Object.assign({}, data.ctx, missing))
      expect(JSON.parse(result.output)).toEqual({ status: "unavailable", reason: "missing-native-call-identity" })
    }))
    expect(data.asks).toEqual([])
  }), { git: true },
)

;(["backend", "jimmy"] as const).map((member) => it.instance(`native ${member} retains reads but cannot anchor as Archie`, () =>
  Effect.gen(function* () {
    const data = yield* fixture(2, member)
    const tool = yield* Tool.init(yield* AtlasContextTool)
    const result = yield* tool.execute({ action: "anchor", target: { kind: "assignment", id: "brief-1" },
      units: ["packages/unit-0"] }, { ...data.ctx, agent: "archie" })
    expect(JSON.parse(result.output)).toEqual({ status: "unavailable", reason: "native-archie-required" })
    expect(data.asks).toEqual([])
  }), { git: true },
))

;(["backend", "jimmy", "archie"] as const).map((member) => it.instance(`native ${member} catalog bounds expose omissions; dirty source and changed artifact cannot look current`, () =>
  Effect.gen(function* () {
    const data = yield* fixture(60, member)
    const catalog = yield* AtlasDiscovery.catalog(data.session)
    expect(catalog.units.length).toBeGreaterThan(0)
    expect(catalog.units.length).toBeLessThanOrEqual(50)
    expect(Buffer.byteLength(JSON.stringify(catalog))).toBeLessThanOrEqual(16 * 1024)
    expect(catalog.coverage).toMatchObject({ state: "partial", units: { total: 60 }, bodiesLoaded: false })
    const fs = yield* FileSystem.FileSystem
    const tool = yield* Tool.init(yield* AtlasContextTool)
    const fresh = yield* tool.execute({ action: "unit", unit: "packages/unit-0" }, data.ctx)
    expect(fresh.metadata.atlasContext.coverage.state).toBe("complete")
    yield* fs.writeFileString(path.join(data.directory, "src/unit.ts"), "export const current = 99\n")
    const dirty = yield* tool.execute({ action: "unit", unit: "packages/unit-0" }, data.ctx)
    expect(JSON.parse(dirty.output)).toMatchObject({ status: "held", reason: "artifacts-invalid" })
    expect(dirty.metadata.atlasContext.sourceIdentity).toBeNull()
    yield* fs.writeFileString(path.join(data.directory, "src/unit.ts"), "export const current = 1\n")
    yield* fs.writeFileString(path.join(data.directory, data.output.skills[0].path), "substitute skill bytes")
    const substituted = yield* tool.execute({ action: "unit", unit: "packages/unit-0" }, data.ctx)
    expect(JSON.parse(substituted.output).status).toBe("held")
    expect(substituted.metadata.atlasContext.coverage.state).toBe("held")
  }), { git: true },
))

it.instance("incompatible ancestry, missing artifacts and wrong project remain explicit holds", () =>
  Effect.gen(function* () {
    const data = yield* fixture()
    const fs = yield* FileSystem.FileSystem
    const fresh = yield* AtlasDiscovery.unit(data.session, "packages/unit-0")
    expect(fresh.coverage.state).toBe("complete")
    const tree = yield* data.command(["rev-parse", "HEAD^{tree}"])
    const orphan = yield* data.command(["commit-tree", tree, "-m", "nonancestor"])
    yield* fs.writeFileString(path.join(data.directory, "OWN-SNAPSHOT.json"), JSON.stringify({ ...data.snapshot, sourceRevision: orphan }))
    const nonancestor = yield* AtlasDiscovery.catalog(data.session).pipe(Effect.flip)
    expect(nonancestor).toBeInstanceOf(AtlasContextHeld)
    expect(nonancestor.reason).toBe("source-revision-not-ancestor")
    yield* fs.writeFileString(path.join(data.directory, "OWN-SNAPSHOT.json"), JSON.stringify(data.snapshot))
    yield* fs.remove(path.join(data.directory, data.output.coverage.path))
    expect((yield* AtlasDiscovery.unit(data.session, "packages/unit-0").pipe(Effect.result))._tag).toBe("Failure")
    yield* fs.writeFileString(path.join(data.directory, "orchestra.json"), JSON.stringify({
      maestro: { atlas: { projectID: "prj_foreign", directory: "." } },
    }))
    yield* reloadInstance({ directory: data.directory })
    expect((yield* AtlasDiscovery.catalog(data.session).pipe(Effect.flip)).reason).toBe("provider-project-mismatch")
  }), { git: true },
)

;["cache", "partial"].map((mode) => it.instance(`valid re-materialization holds ${mode} context instead of certifying omitted or cached bytes`, () =>
  Effect.gen(function* () {
    const data = yield* fixture()
    const before = yield* AtlasDiscovery.unit(data.session, "packages/unit-0")
    expect(before.coverage.state).toBe("complete")
    const updated = {
      ...data.snapshot,
      snapshot: "updated-discovery-fixture",
      units: data.snapshot.units.map((unit) => ({
        ...unit,
        pack: {
          ...unit.pack,
          invariants: unit.pack.invariants.map((fact) => ({ ...fact, claim: "Changed verified ownership wording." })),
          manifest: { ...unit.pack.manifest, truncated: mode === "partial" },
        },
      })),
    }
    const output = materializeStaticOwnSnapshot(updated)
    const fs = yield* FileSystem.FileSystem
    yield* fs.writeFileString(path.join(data.directory, "OWN-SNAPSHOT.json"), JSON.stringify(updated))
    yield* Effect.forEach([...output.skills, output.coverage], (file) =>
      fs.writeFileString(path.join(data.directory, file.path), file.content),
    )
    const held = yield* AtlasDiscovery.unit(data.session, "packages/unit-0").pipe(Effect.flip)
    expect(held.reason).toBe(mode === "partial" ? "unit-context-incomplete" : "skill-cache-content-mismatch")
    expect(held.evidence.length).toBeGreaterThan(0)
  }), { git: true },
))
