import { expect, test } from "bun:test"
import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Layer, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { AppProcess } from "@orchestra/core/process"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ReviewTools } from "@orchestra/core/review/tools"
import { CodeIndexBuild } from "@orchestra/core/research-toolkit/code-index/build"
import { CodeIndexExtract } from "@orchestra/core/research-toolkit/code-index/extract"
import { CodeIndexShard } from "@orchestra/core/research-toolkit/code-index/shard"
import { CodeIndexStore } from "@orchestra/core/research-toolkit/code-index/store"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { nativeProfiles } from "../src/roster"

if (nativeProfiles.lucy.atlas_context !== "allow") throw new Error("roster profiles did not initialize")
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroToolsV2 } from "../src/v2/tools"

const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
const rulesOf = (id: string) => [...MaestroSeatsV2.floor(nativeProfiles[id]), ...MaestroSeatsV2.visibility(id)]
const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )
const host = AppNodeBuilder.build(
  LayerNode.group([MaestroToolsV2.node, ToolRegistry.node, Database.node, EventV2.node, AgentV2.node, Location.node, GitCli.node, AppProcess.node]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [Global.node, Layer.unwrap(temporary("lucy-code-data-").pipe(Effect.map((data) => Global.layerWith({ data }))))],
    [Location.node, Layer.unwrap(temporary("lucy-code-location-").pipe(Effect.map((directory) => {
      const root = AbsolutePath.make(directory)
      return Layer.succeed(Location.Service, Location.Service.of({ directory: root, project: { id: Project.ID.global, directory: root } }))
    })))],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ],
)
type Services = ToolRegistry.Service | Database.Service | EventV2.Service | AgentV2.Service | Location.Service | GitCli.Service | AppProcess.Service
const run = <A, E>(body: Effect.Effect<A, E, Services | Scope.Scope>) =>
  Effect.runPromise(body.pipe(Effect.provide(host as Layer.Layer<Services>), Effect.scoped))
const setup = (id: string) => Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const agents = yield* AgentV2.Service
  yield* database.db.insert(ProjectTable).values({ id: location.project.id, worktree: location.directory, sandboxes: [] }).onConflictDoNothing().run().pipe(Effect.orDie)
  yield* database.db.insert(SessionTable).values({
    id, project_id: location.project.id, slug: id, directory: location.directory, title: "lucy code", version: "test", agent: "lucy",
  }).onConflictDoNothing().run().pipe(Effect.orDie)
  yield* agents.transform((draft) => ["maestro", "lucy", "jimmy", "general"].forEach((seat) =>
    draft.update(AgentV2.ID.make(seat), (agent) => { agent.permissions = rulesOf(seat) })))
  return location.directory
})
const call = (id: string, name: string, input: unknown) => Effect.gen(function* () {
  const registry = yield* ToolRegistry.Service
  return yield* (yield* registry.materialize(configured)).settle({
    sessionID: SessionSchema.ID.make(id), agent: AgentV2.ID.make("lucy"),
    assistantMessageID: SessionMessage.ID.make("msg_calling"),
    call: { type: "tool-call", id: `call_${name}_lucy`, name, input },
  })
})
const blob = (settled: { result: { type: string; value?: unknown }; output?: unknown }) =>
  JSON.stringify({ result: settled.result, output: settled.output ?? null })
const marker = (settled: { result: { type: string; value?: unknown }; output?: unknown }, needle: string) => {
  expect(settled.result.type === "error" || blob(settled).includes(needle)).toBe(true)
  expect(blob(settled)).toContain(needle)
}
const gitOk = (git: GitCli.Interface, cwd: string, args: string[]) =>
  git.run(args, { cwd }).pipe(Effect.tap((result) => expect(result.exitCode).toBe(0)))
const seal = (dir: string) => Effect.promise(async () => {
  const names = await fs.readdir(dir).catch(() => [])
  const parts = await Promise.all(names.sort().map(async (name) => `${name}:${createHash("sha256").update(await fs.readFile(path.join(dir, name))).digest("hex")}`))
  return parts.join("\n")
})

test("lucy code_query consumes only an exact prepared cache for the captured commit", async () => {
  expectSpawn(import.meta.path)
  const symbol = `sym_${randomBytes(4).toString("hex")}`
  const dirty = `dirty_${randomBytes(4).toString("hex")}`
  const secret = `sec_${randomBytes(4).toString("hex")}`
  const id = `ses_q_${symbol.slice(4)}`
  await run(Effect.gen(function* () {
    const original = yield* setup(id)
    const storeRoot = yield* temporary("lucy-code-store-")
    const snapshot = yield* temporary("lucy-code-snap-")
    const outside = yield* temporary("lucy-code-out-")
    const git = yield* GitCli.Service
    const cwd = original
    for (const args of [["init", "-q", "--initial-branch=base"], ["config", "user.email", "code-source@example.com"], ["config", "user.name", "code-source"], ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"]])
      yield* gitOk(git, cwd, args)
    yield* Effect.promise(() => Promise.all([
      fs.writeFile(path.join(cwd, "tsconfig.json"), "{\"compilerOptions\":{\"strict\":true}}\n"),
      fs.writeFile(path.join(cwd, "a.ts"), `export function ${symbol}() { return 1 }\n`),
      fs.writeFile(path.join(outside, "secret.ts"), secret),
    ]))
    yield* gitOk(git, cwd, ["add", "tsconfig.json", "a.ts"])
    yield* gitOk(git, cwd, ["commit", "-m", "indexed"])
    const commit = (yield* git.run(["rev-parse", "HEAD"], { cwd })).stdout.toString("utf8").trim()
    expect(commit).toMatch(/^[0-9a-f]{40,64}$/)
    yield* Effect.promise(() => fs.copyFile(path.join(cwd, "a.ts"), path.join(snapshot, "a.ts")))
    const bind = (session: string, pinned?: string) => ReviewTools.bind(session, {
      repository: original, codeSource: Effect.succeed({ directory: snapshot, worktree: original, ...(pinned ? { commit: pinned } : {}) }),
    })
    const query = (session: string, name: string, extra?: { path: string }) =>
      call(session, "code_query", { op: "symbols", name, ...extra }).pipe(Effect.provideService(ResearchToolkit.Root, storeRoot))
    if (process.platform === "win32") {
      yield* bind(id, commit)
      marker(yield* query(id, symbol), "index_unavailable")
      return
    }
    const indexers = yield* CodeIndexExtract.indexers().pipe(Effect.provideService(ResearchToolkit.Root, storeRoot))
    const ts = indexers.ts
    if (!ts) return yield* Effect.die("shipped typescript indexer identity missing")
    const view = yield* CodeIndexShard.captured(cwd, commit)
    const plan = yield* CodeIndexBuild.plan({ root: cwd, git: view, storeRoot, indexers })
    const planned = plan.shards[0]
    if (!planned || plan.commit !== commit) return yield* Effect.die("plan did not pin the captured commit")
    expect(planned.indexer).toEqual(ts)
    yield* CodeIndexStore.write(plan.dir, { shardKey: planned.key, commit: plan.commit, indexer: ts.id, version: ts.version }, {
      documents: [{ path: "a.ts", language: "ts", sha256: "seed", lines: 1, bytes: symbol.length, layer: 2 }],
      symbols: [{ id: 1, name: symbol, kind: "function", path: "a.ts", startLine: 1, endLine: 1, nameLine: 1, exported: true }],
      occurrences: [], relations: [], imports: [], skipped: [],
    })
    yield* CodeIndexStore.retain(plan.dir, { commit, at: 1, shards: [{ id: planned.shard.id, key: planned.key }] }, {
      commits: ResearchToolkit.Limits.indexCommits, bytes: ResearchToolkit.Limits.indexBytes,
    })
    const before = yield* seal(plan.dir)
    const snapBefore = yield* seal(snapshot)
    yield* bind(id, commit)
    const exact = (text: string) => {
      expect(text).toContain(symbol)
      expect(text).toContain(`commit ${commit.slice(0, 12)}`)
      expect(text).toContain("fresh")
      expect(text.includes("+dirty") || text.includes("stale")).toBe(false)
    }
    exact(blob(yield* query(id, symbol)))
    yield* Effect.promise(() => fs.writeFile(path.join(cwd, "a.ts"), `${dirty}\n`))
    const overlaid = blob(yield* query(id, symbol))
    exact(overlaid)
    expect(overlaid).not.toContain(dirty)
    expect(yield* seal(plan.dir)).toBe(before)
    expect(yield* seal(snapshot)).toBe(snapBefore)
    const emptyStore = yield* temporary("lucy-code-empty-")
    const missing = `${id}_miss`
    yield* setup(missing)
    yield* bind(missing, commit)
    marker(yield* call(missing, "code_query", { op: "symbols", name: symbol }).pipe(Effect.provideService(ResearchToolkit.Root, emptyStore)), "index_unavailable")
    marker(yield* query(id, secret, { path: path.join("..", "secret.ts") }), "reference_invalid")
    yield* Effect.promise(() => fs.writeFile(path.join(cwd, "b.ts"), "export function next() { return 2 }\n"))
    yield* gitOk(git, cwd, ["add", "b.ts"])
    yield* gitOk(git, cwd, ["commit", "-m", "moved"])
    const head = (yield* git.run(["rev-parse", "HEAD"], { cwd })).stdout.toString("utf8").trim()
    expect(head).not.toBe(commit)
    for (const [session, pinned] of [[`${id}_stale`, head], [`${id}_old`, commit]] as const) {
      yield* setup(session)
      yield* bind(session, pinned)
      const text = blob(yield* query(session, symbol))
      expect(text).toContain("index_unavailable")
      expect(text.includes(symbol) || text.includes("stale") || text.includes("fresh")).toBe(false)
    }
  }))
})
