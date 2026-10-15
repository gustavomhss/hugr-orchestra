import { expect } from "bun:test"
import { Buffer } from "node:buffer"
import path from "node:path"
import { publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@orchestra/atlas-boundary/materialize"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Effect, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { AtlasDiscovery } from "@/maestro/atlas-discovery"
import { AtlasContextHeld } from "@/maestro/atlas-source"
import { Session } from "@/session/session"
import { MessageID } from "@/session/schema"
import { Skill } from "@/skill"
import { AtlasContextTool } from "@/tool/atlas-context"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { reloadInstance, requireInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Config.node, Git.node, Session.node, SessionProjector.node, Database.node,
  Skill.node, Truncate.node, filesystem,
])))

const fixture = Effect.fn("AtlasDiscoveryTest.fixture")(function* (count = 2, agentID = "jimmy") {
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
    agent: { jimmy: { name: "discovery-renamed" } },
  }))
  expect((yield* config.get()).maestro?.atlas?.projectID).toBe(instance.project.id)
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ agent: agentID })
  const asks: unknown[] = []
  const ctx: Tool.Context = {
    sessionID: session.id, messageID: MessageID.ascending(), callID: "call_context",
    agent: agentID === "jimmy" ? "discovery-renamed" : "archie", agentID, abort: AbortSignal.any([]), messages: [],
    metadata: () => Effect.void,
    ask: (request) => Effect.sync(() => { asks.push(request) }),
  }
  return { directory, session, ctx, asks, snapshot, output, command }
})

it.instance("ordinary native discovery loads exact verified bytes and host receipt, no synthetic authorization", () =>
  Effect.gen(function* () {
    const data = yield* fixture()
    const tool = yield* Tool.init(yield* AtlasContextTool)
    const catalog = yield* tool.execute({ action: "catalog" }, data.ctx)
    const listed = JSON.parse(catalog.output)
    if (!listed.units) throw new Error(catalog.output)
    expect(listed.units.map((unit: { unit: string }) => unit.unit)).toEqual(["packages/unit-0", "packages/unit-1"])
    expect(listed).not.toHaveProperty("content")
    expect(catalog.metadata.atlasContext.coverage).toMatchObject({ state: "complete", bodiesLoaded: false })
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
      permission: "atlas_context", patterns: ["jimmy"], always: ["jimmy"], metadata: {},
    })))
    const missing = yield* tool.execute({ action: "unit", unit: "unit-0" }, data.ctx)
    expect(JSON.parse(missing.output)).toMatchObject({ status: "held", reason: "unit-missing-or-ambiguous" })
  }), { git: true },
)

it.instance("native upstream reads the same verified context without memory or execution authority", () =>
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
    ;[
      { action: "catalog", owner: "backend" }, { action: "catalog", root: data.directory },
      { action: "catalog", unit: "packages/unit-0" }, { action: "unit", unit: "" },
      { action: "unit", unit: "x".repeat(257) }, { action: "unit", unit: "packages/unit-0", projectID: data.session.projectID },
      { action: "approve" },
    ].map((input) => expect(decode(input)._tag).toBe("None"))
    yield* Effect.forEach([undefined, "backend", "maestro", "unknown"], Effect.fnUntraced(function* (agentID) {
      const result = yield* tool.execute({ action: "catalog" }, { ...data.ctx, agentID, agent: "jimmy" })
      expect(JSON.parse(result.output).status).toBe("unavailable")
      expect(result.metadata.atlasContext.sourceIdentity).toBeNull()
    }))
    expect(data.asks).toEqual([])
  }), { git: true },
)

it.instance("catalog bounds expose omissions; dirty source and changed artifact cannot look current", () =>
  Effect.gen(function* () {
    const data = yield* fixture(60)
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
)

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
