import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@orchestra/atlas-boundary/materialize"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SkillV2 } from "@orchestra/core/skill"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { AtlasKnowledge } from "@orchestra/schema/atlas-knowledge"
import { DateTime, Effect, Layer, Schema } from "effect"
import { MaestroSeats } from "../src/v2/seats-service"
import { MaestroAtlasToolV2 } from "../src/v2/tools/atlas"

// V2 atlas_context against a real verified Own fixture: Maestro reads catalog and unit but never anchors, Archie anchors
// exact verified units, the Atlas Memory seats keep their reads, every other agent is refused by name, and every failure
// is an explicit hold.

const projectID = Project.ID.make("prj_atlas_v2")
const sessionID = SessionV2.ID.make("ses_atlas_v2")
const units = ["packages/alpha/shared", "packages/beta/shared"]

const state = {
  configured: true,
  deny: false,
  skills: [] as SkillV2.Info[],
  assertions: [] as PermissionV2.AssertInput[],
}

async function fixture() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "maestro-atlas-v2-")))
  const git = (args: string[]) =>
    Effect.gen(function* () {
      const cli = yield* GitCli.Service
      const result = yield* cli.run(
        ["-c", "user.email=atlas@example.com", "-c", "user.name=Atlas", "-c", "commit.gpgsign=false", ...args],
        { cwd: directory },
      )
      if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`)
      return result.text().trim()
    })
  await fs.mkdir(path.join(directory, "src"), { recursive: true })
  await fs.writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 1\n")
  await fs.writeFile(path.join(directory, "src/beta.ts"), "export const beta = 2\n")
  const [revision, blobs] = await Effect.runPromise(
    Effect.gen(function* () {
      yield* git(["init", "-q"])
      yield* git(["add", "src"])
      yield* git(["commit", "-q", "-m", "source fixture"])
      return [
        yield* git(["rev-parse", "HEAD"]),
        (yield* git(["hash-object", "--no-filters", "--", "src/alpha.ts", "src/beta.ts"])).split(/\r?\n/),
      ] as const
    }).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>)),
  )
  const snapshot = parseOwnSnapshot(
    JSON.stringify({
      schemaVersion: 1,
      snapshot: "genesis-fixture",
      sourceRevision: revision,
      units: units.map((unit, index) => ({
        unit: { level: "module", id: unit, grounding: null },
        sourceBlobs: { [["src/alpha.ts", "src/beta.ts"][index]]: blobs[index] },
        pack: {
          unit: `${unit} owns bounded behavior.`,
          invariants: [
            { nodeId: `${unit}:contract`, tier: "T1", claim: `${unit} stays deterministic.`, freshness: "FRESH" },
          ],
          shape: { contents: [["src/alpha.ts", "src/beta.ts"][index]], owner: "atlas", tier: "T1" },
          edges: { dependents: [], dependencies: [] },
          gotchas: [],
          memory: null,
          drill: { finer: [], refresh: { pull: `poke:${unit}` }, complement: { pull: `relate:${unit}` } },
          grounding: { source: "tree" },
          tokenEstimate: 20,
          manifest: { pointers: [], truncated: false },
          pullReachable: [],
          advisory: [],
          advisoryDropped: 0,
        },
      })),
    }),
  )
  if (!snapshot) throw new Error("canonical fixture refused")
  await fs.writeFile(
    path.join(directory, "TERRITORY-CATALOG.json"),
    JSON.stringify(
      publishTerritoryCatalog(projectID, [{ name: "backend", owner: "backend", tier: "T1", globs: ["src/**"] }]),
    ),
  )
  await fs.writeFile(path.join(directory, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
  const output = materializeStaticOwnSnapshot(snapshot)
  await Promise.all(
    [...output.skills, output.coverage].map(async (file) => {
      await fs.mkdir(path.dirname(path.join(directory, file.path)), { recursive: true })
      await fs.writeFile(path.join(directory, file.path), file.content)
    }),
  )
  return directory
}

const directory = await fixture()

const layer = AppNodeBuilder.build(
  LayerNode.group([ToolRegistry.node, ToolRegistry.toolsNode, MaestroAtlasToolV2.node]),
  [
    [
      PermissionV2.node,
      Layer.succeed(
        PermissionV2.Service,
        PermissionV2.Service.of({
          evaluate: () => Effect.die("unused"),
          authorize: () => Effect.die("unused"),
          askExplicit: () => Effect.die("unused"),
          assert: (input) =>
            Effect.sync(() => state.assertions.push(input)).pipe(
              Effect.andThen(state.deny ? Effect.fail(new PermissionV2.BlockedError({ rules: [] })) : Effect.void),
            ),
          ask: () => Effect.die("unused"),
          reply: () => Effect.die("unused"),
          get: () => Effect.die("unused"),
          forSession: () => Effect.die("unused"),
          list: () => Effect.die("unused"),
        }),
      ),
    ],
    [
      SkillV2.node,
      Layer.mock(SkillV2.Service, { list: () => Effect.sync(() => state.skills) }),
    ],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    [MaestroSeats.node, Layer.succeed(MaestroSeats.Service, MaestroSeats.make(["backend", "archie", "lucy"]))],
    [
      AgentV2.node,
      Layer.mock(AgentV2.Service, {
        get: (id) =>
          Effect.succeed(
            ["maestro", "backend", "archie", "lucy", "general"].includes(id) ? AgentV2.Info.empty(id) : undefined,
          ),
      }),
    ],
    [
      SessionStore.node,
      Layer.mock(SessionStore.Service, {
        get: (id) =>
          Effect.succeed(
            id === sessionID
              ? SessionV2.Info.make({
                  id: sessionID,
                  projectID,
                  title: "atlas",
                  cost: 0,
                  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                  time: { created: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(0) },
                  location: { directory: AbsolutePath.make(directory) },
                })
              : undefined,
          ),
      }),
    ],
    [
      Config.node,
      Layer.mock(Config.Service, {
        entries: () =>
          Effect.sync(() =>
            state.configured
              ? [
                  new Config.Document({
                    type: "document",
                    info: new Config.Info({ maestro: { atlas: { projectID, directory: "." } } }),
                  }),
                ]
              : [],
          ),
      }),
    ],
  ],
) as Layer.Layer<ToolRegistry.Service>

function call(agent: string, input: Record<string, unknown>, session = sessionID) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const materialized = yield* registry.materialize()
      const settled = yield* materialized.settle({
        sessionID: session,
        agent: AgentV2.ID.make(agent),
        assistantMessageID: SessionMessage.ID.make("msg_atlas_v2"),
        call: { type: "tool-call", id: `call_${agent}_${String(input.action)}`, name: "atlas_context", input },
      })
      const text = settled.result.type === "text" ? String(settled.result.value) : undefined
      return {
        result: settled.result,
        body: text === undefined ? undefined : JSON.parse(text),
        receipt: (settled.output?.structured as { atlasContext?: Record<string, unknown> } | undefined)?.atlasContext,
      }
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )
}

function reset() {
  state.configured = true
  state.deny = false
  state.skills = []
  state.assertions = []
}

describe("V2 atlas_context", () => {
  test("Maestro reads the verified catalog and an exact unit, asserting its own member", async () => {
    reset()
    const catalog = await call("maestro", { action: "catalog" })
    expect(catalog.body).toMatchObject({
      projectID,
      units: units.map((unit) => ({ unit, complete: true })),
      territories: [{ name: "backend" }],
      coverage: { state: "complete", scope: "verified-own-catalog", bodiesLoaded: false },
    })
    expect(catalog.receipt).toMatchObject({ projectID, coverage: { state: "complete" } })
    const unit = await call("maestro", { action: "unit", unit: units[0] })
    expect(unit.body).toMatchObject({ unit: units[0], coverage: { state: "complete", freshness: "FRESH" } })
    expect(unit.body.content).toContain(`${units[0]} owns bounded behavior.`)
    expect(unit.receipt).toMatchObject({ unit: units[0], contentHash: unit.body.contentHash })
    expect(state.assertions).toMatchObject([
      { action: "atlas_context", resources: ["maestro"], save: ["maestro"], sessionID },
      { action: "atlas_context", resources: ["maestro"], save: ["maestro"], sessionID },
    ])
  })

  test("only Archie anchors, binding exact verified bodies to its actual call", async () => {
    reset()
    const anchor = { action: "anchor", target: { kind: "assignment", id: "work" }, units }
    expect((await call("maestro", anchor)).body).toEqual({ status: "unavailable", reason: "native-archie-required" })
    expect((await call("backend", anchor)).body).toEqual({ status: "unavailable", reason: "native-archie-required" })
    expect(state.assertions).toEqual([])
    const archie = await call("archie", anchor)
    expect(state.assertions).toMatchObject([{ action: "atlas_context", resources: ["archie"], sessionID }])
    const bound = archie.receipt?.anchor as AtlasKnowledge.Anchor
    expect(bound).toMatchObject({
      projectID,
      authorSessionID: sessionID,
      assistantMessageID: "msg_atlas_v2",
      callID: "call_archie_anchor",
      memberID: "archie",
      target: { kind: "assignment", id: "work" },
      units: units.map((unit) => ({ unit })),
    })
    expect(Schema.is(AtlasKnowledge.Anchor)(bound)).toBe(true)
    expect(bound.reference).toBe(createHash("sha256").update(AtlasKnowledge.canonical(bound), "utf8").digest("hex"))
    bound.units.forEach((unit) => {
      expect(unit.content).toContain(`${unit.unit} owns bounded behavior.`)
      expect(unit.bodyHash).toBe(createHash("sha256").update(unit.content, "utf8").digest("hex"))
    })
    // The model gets the binding, never the bodies.
    expect(archie.body).toEqual({
      reference: bound.reference,
      target: { kind: "assignment", id: "work" },
      units: bound.units.map((unit) => ({
        unit: unit.unit,
        name: unit.name,
        sourceIdentity: unit.sourceIdentity,
        sourceRevision: unit.sourceRevision,
        contentHash: unit.contentHash,
        receiptHash: unit.receiptHash,
        bodyHash: unit.bodyHash,
      })),
    })
    expect(archie.receipt).toMatchObject({
      projectID,
      sourceIdentity: bound.units[0].sourceIdentity,
      coverage: { state: "complete", scope: "verified-own-unit", freshness: "FRESH", truncated: false },
    })
    expect(await call("archie", { ...anchor, units: ["packages/missing"] })).toMatchObject({
      body: { status: "held" },
      receipt: { coverage: { state: "held" } },
    })
  })

  test("the Atlas Memory seats keep their reads", async () => {
    reset()
    for (const id of ["backend", "archie"]) {
      expect((await call(id, { action: "catalog" })).body.coverage.state).toBe("complete")
      expect(state.assertions.at(-1)).toMatchObject({ resources: [id] })
    }
  })

  test("foreign agents, seats without Atlas Memory and unknown agents are refused", async () => {
    reset()
    for (const id of ["general", "lucy", "stranger"])
      expect((await call(id, { action: "catalog" })).body).toEqual({
        status: "unavailable",
        reason: "native-atlas-owner-required",
      })
    expect(state.assertions).toEqual([])
  })

  test("a missing Session placement, a denied permission and closed input fail explicitly", async () => {
    reset()
    expect((await call("maestro", { action: "catalog" }, SessionV2.ID.make("ses_missing"))).body).toEqual({
      status: "unavailable",
      reason: "session-placement-unavailable",
    })
    state.deny = true
    expect((await call("maestro", { action: "catalog" })).result.type).toBe("error")
    state.deny = false
    expect((await call("maestro", { action: "catalog", owner: "backend" })).result.type).toBe("error")
  })

  test("degraded sources are holds, never absence claims", async () => {
    reset()
    const missing = await call("maestro", { action: "unit", unit: "packages/missing" })
    expect(missing.body).toMatchObject({ status: "held", reason: "unit-missing-or-ambiguous" })
    expect(missing.receipt).toMatchObject({ unit: "packages/missing", coverage: { state: "held" } })
    state.configured = false
    expect((await call("maestro", { action: "catalog" })).body).toMatchObject({
      status: "held",
      reason: "provider-unconfigured",
    })
    state.configured = true
    const skillName = (await call("maestro", { action: "catalog" })).body.units[0].skillName
    state.skills = [
      {
        name: skillName,
        description: "shadow",
        location: AbsolutePath.make(path.join(directory, "src/alpha.ts")),
        content: "shadow",
      },
    ]
    expect((await call("maestro", { action: "unit", unit: units[0] })).body).toMatchObject({
      status: "held",
      reason: "skill-location-mismatch",
    })
  })
})

describe("V2 atlas_context output bound", () => {
  const complete = {
    title: "Atlas Own: unit",
    output: "x".repeat(100),
    atlasContext: {
      projectID: "prj",
      sourceIdentity: "id",
      unit: "unit",
      coverage: {
        state: "complete" as const,
        scope: "verified-own-unit" as const,
        graphCoverage: "COMPLETE" as const,
        freshness: "FRESH" as const,
        currentBlobsChecked: true,
        truncated: false,
        note: "",
      },
    },
  }

  test("an output inside the limits is unchanged", () => {
    expect(MaestroAtlasToolV2.bound(complete, { maxBytes: 1000, maxLines: 10 })).toBe(complete)
  })

  test("an oversized body becomes an explicit budget hold, an unavailable result stays unavailable", () => {
    expect(MaestroAtlasToolV2.bound(complete, { maxBytes: 80, maxLines: 10 })).toEqual({
      title: "Atlas context held: output budget",
      output: JSON.stringify({ status: "held", reason: "context-output-budget-exceeded" }),
      atlasContext: {
        projectID: "prj",
        sourceIdentity: null,
        unit: "unit",
        coverage: { state: "held", reason: "context-output-budget-exceeded" },
      },
    })
    const unavailable = {
      title: "Atlas context unavailable",
      output: `${JSON.stringify({ status: "unavailable", reason: "r" })}\n\n`,
      atlasContext: { projectID: null, sourceIdentity: null, coverage: { state: "unavailable" as const, reason: "r" } },
    }
    expect(MaestroAtlasToolV2.bound(unavailable, { maxBytes: 1000, maxLines: 1 }).output).toBe(
      JSON.stringify({ status: "unavailable", reason: "r" }),
    )
  })
})
