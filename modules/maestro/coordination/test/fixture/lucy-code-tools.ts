import { expect } from "bun:test"
import { createHash, randomUUID } from "node:crypto"
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
import { CodeIndexBuild } from "@orchestra/core/research-toolkit/code-index/build"
import { CodeIndexShard } from "@orchestra/core/research-toolkit/code-index/shard"
import { CodeIndexStore } from "@orchestra/core/research-toolkit/code-index/store"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { ReviewTools } from "@orchestra/core/review/tools"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionTable } from "@orchestra/core/session/sql"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { nativeProfiles } from "../../src/roster"
import { MaestroSeatsV2 } from "../../src/v2/seats"
import { MaestroSeats } from "../../src/v2/seats-service"
import { MaestroToolsV2 } from "../../src/v2/tools"
import { ReviewBindingV2 } from "../../src/v2/tools/review-binding"

export const sourceText = "export function capturedValue() { return 7 }\n"
export const sourcePath = "src/a.ts"
export const hash = (text: string) => createHash("sha256").update(text).digest("hex")
const rules = (id: string) => [...MaestroSeatsV2.floor(nativeProfiles[id]), ...MaestroSeatsV2.visibility(id)]
const allow = [{ action: "*", resource: "*", effect: "allow" as const }]
const temporary = Effect.acquireRelease(
  Effect.promise(async () => fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "lucy-code-public-")))),
  (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
)

type Services = ToolRegistry.Service | Database.Service | AgentV2.Service | Location.Service | GitCli.Service | AppProcess.Service

function host(directory: string, data: string) {
  return AppNodeBuilder.build(LayerNode.group([
    MaestroToolsV2.node, ToolRegistry.node, Database.node, EventV2.node, AgentV2.node, Location.node, GitCli.node, AppProcess.node,
  ]), [
    [Database.node, Database.layerFromPath(":memory:")],
    [Global.node, Global.layerWith({ data })],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of({
      directory: AbsolutePath.make(directory), project: { id: Project.ID.global, directory: AbsolutePath.make(directory) },
    }))],
    // This host exercises review tools. Research's live prewarm is not part of its source or cache fixture.
    [MaestroSeats.node, Layer.succeed(MaestroSeats.Service, MaestroSeats.make(["lucy"]))],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ]) as Layer.Layer<Services>
}

export const seed = Effect.gen(function* () {
  const location = yield* Location.Service
  const directory = location.directory
  const cli = yield* GitCli.Service
  const git = (args: string[]) => cli.run(args, { cwd: directory }).pipe(
    Effect.flatMap((result) => result.exitCode === 0 ? Effect.succeed(result.text().trim()) : Effect.die(result.text())),
  )
  yield* Effect.promise(async () => {
    await fs.mkdir(path.join(directory, "src"))
    await fs.writeFile(path.join(directory, sourcePath), sourceText)
    await fs.writeFile(path.join(directory, "tsconfig.json"), '{"compilerOptions":{"strict":true}}\n')
  })
  for (const args of [
    ["init", "-q", "-b", "main"], ["config", "user.email", "code@example.com"], ["config", "user.name", "Code"],
    ["config", "commit.gpgsign", "false"], ["config", "core.autocrlf", "false"], ["add", "-A"], ["commit", "-q", "-m", "captured"],
  ]) yield* git(args)
  const commit = yield* git(["rev-parse", "HEAD"])
  const sessionID = SessionSchema.ID.make(`ses_code_${randomUUID().replaceAll("-", "")}`)
  const database = yield* Database.Service
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree: directory, sandboxes: [] })
    .onConflictDoNothing().run().pipe(Effect.orDie)
  yield* database.db.insert(SessionTable).values({
    id: sessionID, project_id: Project.ID.global, slug: sessionID, directory, title: "code", version: "test", agent: "lucy",
  }).run().pipe(Effect.orDie)
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) => ["lucy", "maestro", "general"].forEach((id) =>
    draft.update(AgentV2.ID.make(id), (agent) => { agent.permissions = rules(id) })))
  const parentScope = yield* Scope.Scope
  const processes = yield* AppProcess.Service
  const copies = yield* Effect.cached(Effect.all({
    head: ReviewScratch.create({ worktree: directory, revision: commit }),
    base: ReviewScratch.create({ worktree: directory, revision: commit }),
  }, { concurrency: 1 }).pipe(Effect.provideService(AppProcess.Service, processes), Effect.provideService(Scope.Scope, parentScope)))
  const cache = `lucy-code-${randomUUID()}`
  yield* Effect.acquireRelease(Effect.void, () => Effect.promise(() => fs.rm(ReviewBindingV2.analysisStore(cache), { recursive: true, force: true })))
  const binding = yield* ReviewBindingV2.reviewBinding({
    worktree: directory, diff: "", cache, lenses: [], ledger: ReviewProbe.ledger(), copies, headCommit: commit,
  })({ sessionID, role: "lead", retained: "review:test/code.json", cap: 0 })
  const registry = yield* ToolRegistry.Service
  const call = (name: string, input: unknown, agent = "lucy") => registry.materialize(allow).pipe(
    Effect.flatMap((tools) => tools.settle({
      sessionID, agent: AgentV2.ID.make(agent), assistantMessageID: SessionMessage.ID.make("msg_code"),
      call: { type: "tool-call", id: `call_${randomUUID()}`, name, input },
    })),
    Effect.map((settled) => settled.result),
  )
  return { directory, commit, sessionID, copies, binding, call, git, cache }
})

export function run<A, E>(body: Effect.Effect<A, E, Services | Scope.Scope>) {
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const directory = yield* temporary
    const data = yield* temporary
    const storeRoot = yield* temporary
    return yield* body.pipe(Effect.provide(host(directory, data)), Effect.provideService(ResearchToolkit.Root, storeRoot))
  })))
}

export const prepared = (made: Effect.Success<typeof seed>, altered: "metadata" | "digest" | "path" | undefined = undefined) =>
  Effect.gen(function* () {
    const manifest = yield* ResearchToolkit.Manifest
    const pack = manifest["scip-typescript"]
    if (!pack) return yield* Effect.die("fixture requires the shipped scip-typescript identity")
    const plan = yield* CodeIndexBuild.plan({
      root: made.directory, git: yield* CodeIndexShard.captured(made.directory, made.commit),
      storeRoot: yield* ResearchToolkit.Root, indexers: { ts: { id: pack.id, version: pack.version } },
    })
    const shard = plan.shards[0]
    if (!shard) return yield* Effect.die("fixture has no TypeScript shard")
    const file = altered === "path" ? "../outside.ts" : sourcePath
    yield* CodeIndexStore.write(plan.dir, {
      shardKey: shard.key, commit: made.commit, indexer: pack.id, version: altered === "metadata" ? "incompatible" : pack.version,
    }, {
      documents: [{ path: file, language: "ts", sha256: hash(altered === "digest" ? "foreign bytes\n" : sourceText), lines: 1, bytes: Buffer.byteLength(sourceText), layer: 1 }],
      symbols: [{ id: 1, name: "capturedValue", kind: "function", path: file, startLine: 1, endLine: 1, nameLine: 1, exported: true }],
      occurrences: [], relations: [], imports: [], skipped: [],
    })
    return plan
  })

export function decoded(result: { type: string; value?: unknown }) {
  expect(result.type).toBe("text")
  return JSON.parse(String(result.value).split("\n")[0] ?? "") as {
    result: { basis: { basis: { commit: string }; freshness: string; coverage: { complete: boolean } }; matches?: { path: string; text: string }[]; hits?: { range: { path: string } }[]; ranges?: { path: string }[] }
    evidence: { uri: string; sha256: string }
  }
}

export const retained = (made: Effect.Success<typeof seed>, evidence: { uri: string; sha256: string }) => Effect.promise(async () => {
  const raw = await Bun.file(ReviewBindingV2.rawArtifactPath(made.cache, evidence.uri)).json() as { uri: string; text: string }
  expect(raw.uri).toBe(evidence.uri)
  expect(hash(raw.text)).toBe(evidence.sha256)
  return raw.text
})
