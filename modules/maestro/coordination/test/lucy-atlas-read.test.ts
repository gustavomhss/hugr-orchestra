import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { inspectOwnSnapshot, publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot, verifyStaticOwnSnapshot } from "@orchestra/atlas-boundary/materialize"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { GitCli } from "@orchestra/core/git-cli"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { ReviewSeatTools } from "@orchestra/core/review/seat-tools"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionScope } from "@orchestra/core/session/scope"
import { SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { DateTime, Effect, Layer } from "effect"
import { nativeProfiles } from "../src/roster"
import { Seats } from "../src/seats"
import { define } from "../src/seats/seat"
import lucy from "../src/seats/lucy"
import { MaestroAtlasSourceV2 } from "../src/v2/atlas-source"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroSeats } from "../src/v2/seats-service"
import { MaestroAtlasToolV2 } from "../src/v2/tools/atlas"

// K11 / WP 3.5. The native review seat may catalog and unit. Memory owners stay the closed four. A profile alias is
// not a seat. A hold is not-run with the boundary's reason. Lead/lens Session scope is a later grant, not this gate.

const projectID = Project.ID.make("prj_lucy_atlas_read")
const sessionID = SessionV2.ID.make("ses_lucy_atlas_read")
const unit = "packages/alpha/shared"
const owners = ["backend", "jimmy", "archie", "live"] as const

const state = {
  configured: true,
  seats: ["backend", "archie", "lucy"] as string[],
  directory: "",
  assertions: [] as PermissionV2.AssertInput[],
}

async function fixture() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "lucy-atlas-read-")))
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
  await Bun.write(path.join(directory, "src/alpha.ts"), "export const alpha = 1\n")
  const [revision, blob] = await Effect.runPromise(
    Effect.gen(function* () {
      yield* git(["init", "-q"])
      yield* git(["add", "src"])
      yield* git(["commit", "-q", "-m", "source fixture"])
      return [yield* git(["rev-parse", "HEAD"]), yield* git(["hash-object", "--no-filters", "--", "src/alpha.ts"])] as const
    }).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>)),
  )
  const snapshot = parseOwnSnapshot(
    JSON.stringify({
      schemaVersion: 1,
      snapshot: "lucy-read-fixture",
      sourceRevision: revision,
      units: [
        {
          unit: { level: "module", id: unit, grounding: null },
          sourceBlobs: { "src/alpha.ts": blob },
          pack: {
            unit: `${unit} owns bounded behavior.`,
            invariants: [
              { nodeId: `${unit}:contract`, tier: "T1", claim: `${unit} stays deterministic.`, freshness: "FRESH" },
            ],
            shape: { contents: ["src/alpha.ts"], owner: "atlas", tier: "T1" },
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
        },
      ],
    }),
  )
  if (!snapshot) throw new Error("canonical fixture refused")
  await Bun.write(
    path.join(directory, "TERRITORY-CATALOG.json"),
    JSON.stringify(publishTerritoryCatalog(projectID, [{ name: "backend", owner: "backend", tier: "T1", globs: ["src/**"] }])),
  )
  await Bun.write(path.join(directory, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
  const output = materializeStaticOwnSnapshot(snapshot)
  await Promise.all(
    [...output.skills, output.coverage].map(async (file) => {
      await fs.mkdir(path.dirname(path.join(directory, file.path)), { recursive: true })
      await Bun.write(path.join(directory, file.path), file.content)
    }),
  )
  return directory
}

const directory = await fixture()
state.directory = directory

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
          assert: (input) => Effect.sync(() => state.assertions.push(input)),
          ask: () => Effect.die("unused"),
          reply: () => Effect.die("unused"),
          cancelSession: () => Effect.void,
          get: () => Effect.die("unused"),
          forSession: () => Effect.die("unused"),
          list: () => Effect.die("unused"),
        }),
      ),
    ],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    [
      MaestroSeats.node,
      Layer.succeed(
        MaestroSeats.Service,
        MaestroSeats.Service.of({
          get ids() {
            return state.seats
          },
          has: (id) => state.seats.includes(id),
        }),
      ),
    ],
    [
      AgentV2.node,
      Layer.mock(AgentV2.Service, {
        get: (id) =>
          Effect.succeed(
            ["maestro", "backend", "archie", "lucy", "upstream", "review", "general"].includes(id)
              ? AgentV2.Info.empty(id)
              : undefined,
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
                  title: "lucy atlas",
                  cost: 0,
                  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                  time: { created: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(0) },
                  location: { directory: AbsolutePath.make(state.directory) },
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

function call(agent: string, input: Record<string, unknown>) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const materialized = yield* registry.materialize()
      const settled = yield* materialized.settle({
        sessionID,
        agent: AgentV2.ID.make(agent),
        assistantMessageID: SessionMessage.ID.make("msg_lucy_atlas_read"),
        call: { type: "tool-call", id: `call_${agent}_${String(input.action)}`, name: "atlas_context", input },
      })
      const text = settled.result.type === "text" ? String(settled.result.value) : undefined
      return {
        body: text === undefined ? undefined : JSON.parse(text),
        receipt: (settled.output?.structured as { atlasContext?: Record<string, unknown> } | undefined)?.atlasContext,
      }
    }).pipe(Effect.scoped, Effect.provide(layer)),
  )
}

function reset() {
  state.configured = true
  state.seats = ["backend", "archie", "lucy"]
  state.directory = directory
  state.assertions = []
}

const installed = MaestroSeats.make([...owners, "lucy"])

describe("lucy readonly Atlas Own", () => {
  test("the native review seat catalogs and loads one verified unit", async () => {
    reset()
    const catalog = await call("lucy", { action: "catalog" })
    expect(catalog.body.coverage).toMatchObject({ state: "complete", scope: "verified-own-catalog", bodiesLoaded: false })
    expect(catalog.body.units).toEqual([expect.objectContaining({ unit, complete: true })])
    const loaded = await call("lucy", { action: "unit", unit })
    expect(loaded.body).toMatchObject({ unit, coverage: { state: "complete", freshness: "FRESH", truncated: false } })
    expect(loaded.body.content).toContain(`${unit} owns bounded behavior.`)
    expect(state.assertions).toMatchObject([
      { action: "atlas_context", resources: ["lucy"], save: ["lucy"], sessionID },
      { action: "atlas_context", resources: ["lucy"], save: ["lucy"], sessionID },
    ])
  })

  test("a profile alias and an uninstalled id are refused before any permission ask", async () => {
    reset()
    expect(MaestroAtlasSourceV2.reader("upstream", installed)).toBeUndefined()
    expect(MaestroAtlasSourceV2.reader("review", installed)).toBeUndefined()
    expect(MaestroAtlasSourceV2.reader("patty", MaestroSeats.make(["patty", "lucy"]))).toBeUndefined()
    expect(MaestroAtlasSourceV2.reader("billy", MaestroSeats.make(["billy", "lucy"]))).toBeUndefined()
    expect(MaestroAtlasSourceV2.reader("lucy", MaestroSeats.make(["backend"]))).toBeUndefined()
    for (const id of ["upstream", "review"]) {
      expect((await call(id, { action: "catalog" })).body).toEqual({
        status: "unavailable",
        reason: "native-atlas-owner-required",
      })
    }
    state.seats = ["backend", "archie"]
    expect((await call("lucy", { action: "unit", unit })).body).toEqual({
      status: "unavailable",
      reason: "native-atlas-owner-required",
    })
    expect(state.assertions).toEqual([])
  })

  test("the review seat cannot anchor", async () => {
    reset()
    expect(
      (
        await call("lucy", {
          action: "anchor",
          target: { kind: "assignment", id: "work" },
          units: [unit],
        })
      ).body,
    ).toEqual({ status: "unavailable", reason: "native-archie-required" })
    expect(state.assertions).toEqual([])
  })

  test("memory, header and resume stay denied: owner() is unchanged and Atlas Memory stays off", () => {
    expect(Seats.all.lucy.atlasMemory).toBe(false)
    expect(lucy.atlasMemory).toBe(false)
    expect(() => define({ ...lucy, atlasMemory: true })).toThrow(
      "Atlas Memory supports only backend, jimmy, archie and live owners: lucy",
    )
    for (const id of owners) expect(MaestroAtlasSourceV2.owner(id, installed)).toBe(id)
    expect(MaestroAtlasSourceV2.owner("lucy", installed)).toBeUndefined()
    expect(MaestroAtlasSourceV2.reader("lucy", installed)).toBe("lucy")
    const rules = [...MaestroSeatsV2.floor(nativeProfiles.lucy), ...MaestroSeatsV2.visibility("lucy")]
    const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
    expect(PermissionV2.evaluate("atlas_memory_recall", "*", configured, rules).effect).toBe("deny")
    expect(PermissionV2.evaluate("atlas_memory_emit", "*", configured, rules).effect).toBe("deny")
  })

  test("a changed anchored path is not fresh, citing the boundary check own-snapshot-guard runs", async () => {
    reset()
    const stale = await fixture()
    state.directory = stale
    await Bun.write(path.join(stale, "src/alpha.ts"), "export const alpha = 2\n")
    const snapshotContent = await Bun.file(path.join(stale, "OWN-SNAPSHOT.json")).text()
    const inspection = inspectOwnSnapshot(snapshotContent)
    if (inspection.status !== "READY") throw new Error(inspection.reason)
    const snapshot = parseOwnSnapshot(snapshotContent)
    if (!snapshot) throw new Error("snapshot parse hold")
    const files = await Promise.all(
      inspection.artifactPaths.map(async (file) => ({
        path: file,
        content: await Bun.file(path.join(stale, file)).text(),
      })),
    )
    const hashes = Object.fromEntries(
      await Effect.runPromise(
        Effect.gen(function* () {
          const cli = yield* GitCli.Service
          return yield* Effect.forEach(inspection.sourcePaths, (relative) =>
            Effect.gen(function* () {
              const hashed = yield* cli.run(
                ["hash-object", "--no-filters", "--", path.join(stale, relative)],
                { cwd: stale },
              )
              if (hashed.exitCode !== 0 || hashed.truncated) throw new Error(hashed.stderr.toString())
              return [relative, hashed.text().trim()] as const
            }),
          )
        }).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>)),
      ),
    )
    const oracle = verifyStaticOwnSnapshot(snapshot, files, (file) => hashes[file])
    if (oracle.status !== "HOLD") throw new Error("boundary accepted a stale anchor")
    const held = await call("lucy", { action: "catalog" })
    expect(held.body).toEqual({
      status: "held",
      notRun: true,
      reason: "artifacts-invalid",
      evidence: oracle.issues,
    })
    expect(oracle.issues.some((issue) => issue.startsWith("source blob drift:"))).toBe(true)
    expect(held.receipt).toMatchObject({ coverage: { state: "held", reason: "artifacts-invalid" } })
    expect(JSON.stringify(held.body)).not.toContain("FRESH")
    expect(JSON.stringify(held.body)).not.toContain("nothing found")
  })

  test("an unconfigured provider is an explicit not-run hold, not an empty catalog", async () => {
    reset()
    state.configured = false
    const held = await call("lucy", { action: "catalog" })
    expect(held.body).toEqual({
      status: "held",
      notRun: true,
      reason: "provider-unconfigured",
      evidence: [projectID],
    })
    expect(held.receipt).toMatchObject({
      projectID,
      sourceIdentity: null,
      coverage: { state: "held", reason: "provider-unconfigured" },
    })
    expect(held.body.units).toBeUndefined()
  })

  test("scoped lead and lens atlas_context is pending; the reader gate does not prove Session access", () => {
    expect(ReviewSeatTools.lead.includes("atlas_context")).toBe(false)
    expect(ReviewSeatTools.lens.includes("atlas_context")).toBe(false)
    expect(ReviewSeatTools.verifier.includes("atlas_context")).toBe(false)
    const lead = SessionScope.initial({
      skills: { entry: "lucy-review", allow: [] },
      tools: [...ReviewSeatTools.lead],
      budgets: { loads: 1, toolCalls: 1 },
    })
    expect(SessionScope.decide(lead, { type: "tool", name: "atlas_context" })?.kind).toBe("tool-outside-scope")
    const rules = [...MaestroSeatsV2.floor(nativeProfiles.lucy), ...MaestroSeatsV2.visibility("lucy")]
    expect(
      PermissionV2.evaluate("atlas_context", "lucy", [{ action: "*", resource: "*", effect: "allow" }], rules).effect,
    ).toBe("deny")
  })
})
