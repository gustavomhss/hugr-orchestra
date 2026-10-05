import { describe, expect } from "bun:test"
import path from "node:path"
import { publishTerritoryCatalog } from "@opencode-ai/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@opencode-ai/atlas-boundary/materialize"
import type { OwnSnapshot } from "@opencode-ai/atlas-boundary/materialize"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Project } from "@opencode-ai/schema/project"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Git } from "../../src/git"
import { AtlasContextHeld, loadAtlasSkill, loadAtlasSkills, readAtlasSource } from "../../src/maestro/atlas-source"
import type { AtlasSource } from "../../src/maestro/atlas-source"
import { compileContextToolPlan } from "../../src/maestro/context-tool-plan"
import { SessionID } from "../../src/session/schema"
import { Skill } from "../../src/skill"
import { requireInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const projectID = Schema.decodeUnknownSync(Project.ID)("prj_atlas")
const sessionID = Schema.decodeUnknownSync(SessionID)("ses_atlas")
const units = ["packages/alpha/shared", "packages/beta/shared"]
const configLayer = Layer.mock(Config.Service, {
  get: Effect.fn("AtlasTest.config")(function* () {
    const instance = yield* requireInstance
    return {
      maestro: { atlas: { projectID, directory: "." } },
      skills: { paths: [path.join(instance.directory, ".opencode", "skills")] },
    }
  }),
  directories: () => Effect.succeed([]),
})
const it = testEffect(
  Layer.mergeAll(
    configLayer,
    LayerNode.compile(Skill.node, [
      [Config.node, configLayer],
      [RuntimeFlags.node, RuntimeFlags.layer({ disableExternalSkills: true })],
    ]),
    LayerNode.compile(Git.node),
    LayerNode.compile(filesystem),
    LayerNode.compile(CrossSpawnSpawner.node),
  ),
)

const command = Effect.fn("AtlasTest.git")(function* (directory: string, args: string[]) {
  const git = yield* Git.Service
  const result = yield* git.run(args, { cwd: directory })
  expect(result.exitCode).toBe(0)
  expect(result.truncated).toBe(false)
  return result.text().trim()
})

const persist = Effect.fn("AtlasTest.persist")(function* (directory: string, snapshot: OwnSnapshot) {
  const fs = yield* FileSystem.FileSystem
  const output = materializeStaticOwnSnapshot(snapshot)
  yield* fs.writeFileString(path.join(directory, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
  yield* Effect.forEach(
    [...output.skills, output.coverage],
    Effect.fnUntraced(function* (file) {
      yield* fs.makeDirectory(path.dirname(path.join(directory, file.path)), { recursive: true })
      yield* fs.writeFileString(path.join(directory, file.path), file.content)
    }),
  )
  return output
})

const fixture = Effect.fn("AtlasTest.fixture")(function* (
  provider = ".",
  sourcePaths = ["src/alpha.ts", "src/beta.ts"],
) {
  const test = yield* TestInstance
  const fs = yield* FileSystem.FileSystem
  yield* fs.makeDirectory(path.join(test.directory, "src"), { recursive: true })
  yield* fs.writeFileString(path.join(test.directory, "src/alpha.ts"), "export const alpha = 1\n")
  yield* fs.writeFileString(path.join(test.directory, "src/beta.ts"), "export const beta = 2\n")
  yield* command(test.directory, ["add", "src"])
  yield* command(test.directory, ["commit", "-m", "source fixture"])
  const revision = yield* command(test.directory, ["rev-parse", "HEAD"])
  const blobs = yield* Effect.forEach(["src/alpha.ts", "src/beta.ts"], (file) =>
    command(test.directory, ["hash-object", "--no-filters", "--", file]),
  )
  const snapshot = parseOwnSnapshot(
    JSON.stringify({
      schemaVersion: 1,
      snapshot: "genesis-fixture",
      sourceRevision: revision,
      units: units.map((unit, index) => ({
        unit: { level: "module", id: unit, grounding: null },
        sourceBlobs: { [sourcePaths[index]]: blobs[index] },
        pack: {
          unit: `${unit} owns bounded behavior.`,
          invariants: [
            { nodeId: `${unit}:contract`, tier: "T1", claim: `${unit} stays deterministic.`, freshness: "FRESH" },
          ],
          shape: { contents: [sourcePaths[index]], owner: "atlas", tier: "T1" },
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
  if (!snapshot) return yield* Effect.die(new Error("canonical fixture refused"))
  const directory = path.join(test.directory, provider)
  yield* fs.makeDirectory(directory, { recursive: true })
  yield* fs.writeFileString(
    path.join(directory, "TERRITORY-CATALOG.json"),
    JSON.stringify(
      publishTerritoryCatalog(projectID, [{ name: "backend", owner: "backend", tier: "T1", globs: ["src/**"] }]),
    ),
  )
  const output = yield* persist(directory, snapshot)
  return { session: { id: sessionID, projectID, directory: test.directory }, directory, snapshot, output }
})

function planFor(source: AtlasSource, session = { id: sessionID, projectID }) {
  const compiled = compileContextToolPlan({
    actor: { memberId: "backend", projectId: session.projectID, sessionId: session.id },
    revision: { id: "plan_atlas", hash: "a".repeat(64), projectId: session.projectID, sessionId: session.id },
    territories: ["backend"],
    units: [...units].reverse(),
    context: source.context,
  })
  if (compiled.status !== "READY") throw new Error(JSON.stringify(compiled))
  return compiled.plan
}

const expectHeld = Effect.fn("AtlasTest.expectHeld")(function* <A, R>(
  effect: Effect.Effect<A, AtlasContextHeld, R>,
  reason?: string,
) {
  const result = yield* effect.pipe(Effect.result)
  expect(result._tag).toBe("Failure")
  if (result._tag !== "Failure") return yield* Effect.die(new Error("expected AtlasContextHeld"))
  expect(result.failure).toBeInstanceOf(AtlasContextHeld)
  if (reason) expect(result.failure.reason).toBe(reason)
  expect(result.failure.evidence.length).toBeGreaterThan(0)
})

describe("Atlas static source", () => {
  it.instance(
    "reads READY and actually loads exact static skills in plan order",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const skill = yield* Skill.Service
        const source = yield* readAtlasSource(data.session)
        expect(source.directory).toBe(data.directory)
        expect(source.identityHash).toMatch(/^[a-f0-9]{64}$/)
        expect(source.context.units.map((unit) => unit.unit)).toEqual(units)
        expect((yield* readAtlasSource(data.session)).identityHash).toBe(source.identityHash)
        const plan = planFor(source)
        const rows = yield* loadAtlasSkills(data.session, source, plan)
        expect(rows.map((row) => row.unit)).toEqual([...units].reverse())
        yield* Effect.forEach(
          rows,
          Effect.fnUntraced(function* (row, index) {
            const loaded = yield* skill.require(row.name)
            expect(row.content).toBe(loaded.content)
            expect(loaded.location).toBe(path.join(data.directory, plan.actions[index].path))
            expect(row.contentHash).toBe(plan.actions[index].contentHash)
            expect(row.receiptHash).toBe(plan.actions[index].receiptHash)
          }),
        )
      }),
    { git: true },
  )

  it.instance(
    "rejects absent configuration and mismatched configured project",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        yield* expectHeld(
          readAtlasSource(data.session).pipe(
            Effect.provide(
              Layer.mock(Config.Service, {
                get: () => Effect.succeed({}),
              }),
            ),
          ),
          "provider-unconfigured",
        )
        yield* expectHeld(
          readAtlasSource(data.session).pipe(
            Effect.provide(
              Layer.mock(Config.Service, {
                get: () => Effect.succeed({ maestro: { atlas: { projectID: "prj_other", directory: "." } } }),
              }),
            ),
          ),
          "provider-project-mismatch",
        )
        yield* expectHeld(
          readAtlasSource({ ...data.session, projectID: Schema.decodeUnknownSync(Project.ID)("prj_other") }),
        )
      }),
    { git: true },
  )

  it.instance(
    "checks actor/session and exact plan before touching Skill.require",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const source = yield* readAtlasSource(data.session)
        const plan = planFor(source)
        const untouched = Layer.mock(Skill.Service, { require: () => Effect.die(new Error("unexpected skill load")) })
        yield* expectHeld(
          loadAtlasSkills({ ...data.session, id: Schema.decodeUnknownSync(SessionID)("ses_other") }, source, plan).pipe(
            Effect.provide(untouched),
          ),
          "plan-session-binding-mismatch",
        )
        yield* expectHeld(
          loadAtlasSkills(data.session, source, { ...plan, actor: { ...plan.actor, projectId: "prj_other" } }).pipe(
            Effect.provide(untouched),
          ),
          "plan-session-binding-mismatch",
        )
        yield* expectHeld(
          loadAtlasSkills(data.session, source, { ...plan, actions: [...plan.actions].reverse() }).pipe(
            Effect.provide(untouched),
          ),
          "context-tool-plan-changed",
        )
        yield* expectHeld(
          loadAtlasSkills(data.session, source, {
            ...plan,
            actions: plan.actions.map((action) => ({ ...action, receiptHash: "f".repeat(64) })),
          }).pipe(Effect.provide(untouched)),
          "context-tool-plan-changed",
        )
      }),
    { git: true },
  )
  ;["TERRITORY-CATALOG.json", "OWN-SNAPSHOT.json", ".opencode/skills/own/OWN-COVERAGE.json", "skill"].map((missing) =>
    it.instance(
      `HOLD when ${missing} missing or not a file`,
      () =>
        Effect.gen(function* () {
          const data = yield* fixture()
          const fs = yield* FileSystem.FileSystem
          const file = path.join(data.directory, missing === "skill" ? data.output.skills[0].path : missing)
          yield* fs.remove(file)
          yield* expectHeld(readAtlasSource(data.session))
          yield* fs.makeDirectory(file)
          yield* expectHeld(readAtlasSource(data.session), "path-type-invalid")
        }),
      { git: true },
    ),
  )
  ;["TERRITORY-CATALOG.json", "OWN-SNAPSHOT.json", ".opencode/skills/own/OWN-COVERAGE.json", "skill"].map((malformed) =>
    it.instance(
      `HOLD on malformed ${malformed}`,
      () =>
        Effect.gen(function* () {
          const data = yield* fixture()
          const fs = yield* FileSystem.FileSystem
          yield* fs.writeFileString(
            path.join(data.directory, malformed === "skill" ? data.output.skills[0].path : malformed),
            "{broken",
          )
          yield* expectHeld(readAtlasSource(data.session))
        }),
      { git: true },
    ),
  )

  it.instance(
    "Git freshness rejects dirty source bytes",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const source = yield* readAtlasSource(data.session)
        yield* fs.writeFileString(path.join(data.directory, "src/beta.ts"), "export const beta = 99\n")
        yield* expectHeld(readAtlasSource(data.session))
        yield* expectHeld(loadAtlasSkill(data.session, source, units[0]))
      }),
    { git: true },
  )

  it.instance(
    "HOLD when snapshot changes between actual filesystem reads",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const file = path.join(data.directory, "OWN-SNAPSHOT.json")
        const state = { changed: false }
        yield* expectHeld(
          readAtlasSource(data.session).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: Effect.fn("AtlasTest.racingRead")(function* (filename: string) {
                const bytes = yield* fs.readFile(filename)
                if (filename === file && !state.changed) {
                  state.changed = true
                  yield* fs.writeFileString(file, `${JSON.stringify(data.snapshot)}\n`)
                }
                return bytes
              }),
            }),
          ),
          "static-data-changed-during-read",
        )
        expect(state.changed).toBe(true)
      }),
    { git: true },
  )

  it.instance(
    "HOLD when source changes between actual Git blob reads",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const git = yield* Git.Service
        const file = path.join(data.directory, "src/alpha.ts")
        const state = { changed: false }
        yield* expectHeld(
          readAtlasSource(data.session).pipe(
            Effect.provideService(Git.Service, {
              ...git,
              run: Effect.fn("AtlasTest.racingGit")(function* (args: string[], options: Git.Options) {
                const result = yield* git.run(args, options)
                if (args[0] === "hash-object" && args.includes(file) && !state.changed) {
                  state.changed = true
                  yield* fs.writeFileString(file, "export const alpha = 99\n").pipe(Effect.orDie)
                }
                return result
              }),
            }),
          ),
          "source-changed-during-read",
        )
        expect(state.changed).toBe(true)
      }),
    { git: true },
  )

  it.instance(
    "HOLD on missing repository and real truncated Git output",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const git = yield* Git.Service
        yield* expectHeld(
          readAtlasSource(data.session).pipe(
            Effect.provideService(Git.Service, {
              ...git,
              run: (args, options) => git.run(args, { ...options, maxOutputBytes: 1 }),
            }),
          ),
          "repository-unavailable",
        )
        yield* fs.remove(path.join(data.directory, ".git"), { recursive: true })
        yield* expectHeld(readAtlasSource(data.session), "repository-unavailable")
      }),
    { git: true },
  )

  it.instance(
    "rejects existing nonancestor and missing source revisions",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const tree = yield* command(data.directory, ["rev-parse", "HEAD^{tree}"])
        const orphan = yield* command(data.directory, ["commit-tree", tree, "-m", "unrelated fixture"])
        yield* persist(data.directory, { ...data.snapshot, sourceRevision: orphan })
        yield* expectHeld(readAtlasSource(data.session), "source-revision-not-ancestor")
        yield* fs.writeFileString(
          path.join(data.directory, "OWN-SNAPSHOT.json"),
          JSON.stringify({ ...data.snapshot, sourceRevision: "f".repeat(40) }),
        )
        yield* expectHeld(readAtlasSource(data.session), "source-revision-not-ancestor")
      }),
    { git: true },
  )

  it.instance(
    "rejects missing and duplicate coverage, malformed receipts",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const file = path.join(data.directory, data.output.coverage.path)
        const coverage = Schema.decodeUnknownSync(
          Schema.StructWithRest(Schema.Struct({ units: Schema.Array(Schema.String) }), [
            Schema.Record(Schema.String, Schema.Unknown),
          ]),
        )(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(data.output.coverage.content))
        yield* fs.writeFileString(file, JSON.stringify({ ...coverage, units: [] }))
        yield* expectHeld(readAtlasSource(data.session))
        yield* fs.writeFileString(file, JSON.stringify({ ...coverage, units: [coverage.units[0], coverage.units[0]] }))
        yield* expectHeld(readAtlasSource(data.session))
        yield* persist(data.directory, data.snapshot)
        yield* fs.writeFileString(
          path.join(data.directory, data.output.skills[0].path),
          data.output.skills[0].content.replace(/contentHash[^\n]*/, "contentHash: broken"),
        )
        yield* expectHeld(readAtlasSource(data.session))
        yield* persist(data.directory, data.snapshot)
        yield* fs.writeFileString(
          path.join(data.directory, "OWN-SNAPSHOT.json"),
          JSON.stringify({ ...data.snapshot, units: [data.snapshot.units[0], data.snapshot.units[0]] }),
        )
        yield* expectHeld(readAtlasSource(data.session))
      }),
    { git: true },
  )

  it.instance(
    "rejects under-approximate coverage receipt",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const file = data.output.skills[0]
        expect(file.content).toContain('"graphCoverage":"COMPLETE"')
        yield* fs.writeFileString(
          path.join(data.directory, file.path),
          file.content.replace('"graphCoverage":"COMPLETE"', '"graphCoverage":"UNDER_APPROX"'),
        )
        yield* expectHeld(readAtlasSource(data.session))
      }),
    { git: true },
  )

  it.instance(
    "rejects physical provider and source escape",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const outside = yield* fs.makeTempDirectoryScoped()
        yield* fs.symlink(outside, path.join(data.directory, "outside-provider"))
        yield* expectHeld(
          readAtlasSource(data.session).pipe(
            Effect.provide(
              Layer.mock(Config.Service, {
                get: () => Effect.succeed({ maestro: { atlas: { projectID, directory: "outside-provider" } } }),
              }),
            ),
          ),
          "path-escape-or-alias",
        )
        const source = path.join(data.directory, "src/alpha.ts")
        yield* fs.copyFile(source, path.join(outside, "alpha.ts"))
        yield* fs.remove(source)
        yield* fs.symlink(path.join(outside, "alpha.ts"), source)
        yield* expectHeld(readAtlasSource(data.session), "path-escape-or-alias")
      }),
    { git: true },
  )

  it.instance(
    "snapshot and source identity drift invalidate previous load evidence",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const source = yield* readAtlasSource(data.session)
        yield* fs.writeFileString(path.join(data.directory, "OWN-SNAPSHOT.json"), `${JSON.stringify(data.snapshot)}\n`)
        const changed = yield* readAtlasSource(data.session)
        expect(changed.identityHash).not.toBe(source.identityHash)
        yield* expectHeld(loadAtlasSkill(data.session, source, units[0]), "source-identity-changed")
        yield* expectHeld(loadAtlasSkills(data.session, source, planFor(source)), "source-identity-changed")
        yield* persist(data.directory, { ...data.snapshot, snapshot: "new-snapshot" })
        yield* expectHeld(
          loadAtlasSkills(data.session, yield* readAtlasSource(data.session), planFor(source)),
          "context-tool-plan-changed",
        )
      }),
    { git: true },
  )
  ;["../escape", "/absolute", "C:/drive", "provider\\root", "provider/../root", "./provider"].map((directory) =>
    it.instance(
      `rejects provider spelling ${directory}`,
      () =>
        Effect.gen(function* () {
          const data = yield* fixture()
          yield* expectHeld(
            readAtlasSource(data.session).pipe(
              Effect.provide(
                Layer.mock(Config.Service, {
                  get: () => Effect.succeed({ maestro: { atlas: { projectID, directory } } }),
                }),
              ),
            ),
            "provider-path-invalid",
          )
        }),
      { git: true },
    ),
  )

  it.instance(
    "nested provider retains repository-relative source anchors",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture("provider")
        const source = yield* readAtlasSource(data.session).pipe(
          Effect.provide(
            Layer.mock(Config.Service, {
              get: () => Effect.succeed({ maestro: { atlas: { projectID, directory: "provider" } } }),
            }),
          ),
        )
        expect(source.directory).toBe(data.directory)
        expect(source.context.units).toHaveLength(2)
      }),
    { git: true },
  )
  ;["provider", "artifact", "source"].map((target) =>
    it.instance(
      `rejects ${target} symlink alias`,
      () =>
        Effect.gen(function* () {
          const data = yield* fixture()
          const fs = yield* FileSystem.FileSystem
          if (target === "provider") {
            yield* fs.symlink(data.directory, path.join(data.directory, "alias"))
            yield* expectHeld(
              readAtlasSource(data.session).pipe(
                Effect.provide(
                  Layer.mock(Config.Service, {
                    get: () => Effect.succeed({ maestro: { atlas: { projectID, directory: "alias" } } }),
                  }),
                ),
              ),
              "path-escape-or-alias",
            )
            return
          }
          const relative = target === "source" ? "src/alpha.ts" : data.output.skills[0].path
          const file = path.join(data.directory, relative)
          yield* fs.rename(file, `${file}.actual`)
          yield* fs.symlink(`${file}.actual`, file)
          yield* expectHeld(readAtlasSource(data.session), "path-escape-or-alias")
        }),
      { git: true },
    ),
  )
  ;["C:/alpha.ts", "src\\alpha.ts", "src/../alpha.ts", "/absolute.ts"].map((sourcePath) =>
    it.instance(
      `rejects source spelling ${sourcePath}`,
      () =>
        Effect.gen(function* () {
          const data = yield* fixture()
          const fs = yield* FileSystem.FileSystem
          const snapshot = {
            ...data.snapshot,
            units: data.snapshot.units.map((unit, index) =>
              index ? unit : { ...unit, sourceBlobs: { [sourcePath]: Object.values(unit.sourceBlobs)[0] } },
            ),
          }
          yield* fs.writeFileString(path.join(data.directory, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
          yield* expectHeld(readAtlasSource(data.session))
        }),
      { git: true },
    ),
  )

  it.instance(
    "actual cached Skill location cannot shadow canonical provider",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const fs = yield* FileSystem.FileSystem
        const source = yield* readAtlasSource(data.session)
        const shadow = path.join(data.directory, "global-shadow", "SKILL.md")
        yield* fs.makeDirectory(path.dirname(shadow))
        yield* fs.writeFileString(shadow, source.context.units[0].content)
        const shadowConfig = Layer.mock(Config.Service, {
          get: () => Effect.succeed({ skills: { paths: [path.dirname(shadow)] } }),
          directories: () => Effect.succeed([]),
        })
        yield* expectHeld(
          loadAtlasSkill(data.session, source, units[0]).pipe(
            Effect.provide(
              Layer.fresh(
                LayerNode.compile(Skill.node, [
                  [Config.node, shadowConfig],
                  [RuntimeFlags.node, RuntimeFlags.layer({ disableExternalSkills: true })],
                ]),
              ),
            ),
          ),
          "skill-location-mismatch",
        )
      }),
    { git: true },
  )

  it.instance(
    "actual cached Skill body cannot differ from canonical parsed bytes",
    () =>
      Effect.gen(function* () {
        const data = yield* fixture()
        const skill = yield* Skill.Service
        const before = yield* readAtlasSource(data.session)
        const loaded = yield* skill.require(before.context.units[0].skillName)
        yield* persist(data.directory, {
          ...data.snapshot,
          units: data.snapshot.units.map((unit, index) =>
            index
              ? unit
              : {
                  ...unit,
                  pack: { ...unit.pack, unit: "New canonical briefing body." },
                },
          ),
        })
        const source = yield* readAtlasSource(data.session)
        expect(source.context.units[0].content).not.toBe(before.context.units[0].content)
        expect((yield* skill.require(loaded.name)).content).toBe(loaded.content)
        yield* expectHeld(loadAtlasSkill(data.session, source, units[0]), "skill-cache-content-mismatch")
      }),
    { git: true },
  )
  ;["cap", "truncated", "tail", "advisory", "missing"].map((kind) =>
    it.instance(
      `rejects incomplete ${kind} unit`,
      () =>
        Effect.gen(function* () {
          const data = yield* fixture()
          if (kind === "missing") {
            yield* expectHeld(
              loadAtlasSkill(data.session, yield* readAtlasSource(data.session), "unknown/unit"),
              "unit-missing-or-ambiguous",
            )
            return
          }
          const snapshot = parseOwnSnapshot(
            JSON.stringify({
              ...data.snapshot,
              units: data.snapshot.units.map((unit, index) =>
                index
                  ? unit
                  : {
                      ...unit,
                      pack: {
                        ...unit.pack,
                        ...(kind === "cap" ? { tokenEstimate: 1501 } : {}),
                        ...(kind === "truncated" ? { manifest: { pointers: [], truncated: true } } : {}),
                        ...(kind === "tail" ? { pullReachable: ["unloaded-tail"] } : {}),
                        ...(kind === "advisory" ? { advisoryDropped: 1 } : {}),
                      },
                    },
              ),
            }),
          )
          if (!snapshot) return yield* Effect.die(new Error("tail fixture refused"))
          yield* persist(data.directory, snapshot)
          if (kind === "cap") {
            yield* expectHeld(readAtlasSource(data.session), "boundary-invalid")
            return
          }
          const source = yield* readAtlasSource(data.session)
          yield* expectHeld(loadAtlasSkill(data.session, source, units[0]), "unit-context-incomplete")
        }),
      { git: true },
    ),
  )
})
