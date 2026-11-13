import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Layer, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ReviewTools } from "@orchestra/core/review/tools"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { nativeProfiles } from "../src/roster"

if (nativeProfiles.lucy.atlas_context !== "allow") throw new Error("roster profiles did not initialize")
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroToolsV2 } from "../src/v2/tools"

const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
const rulesOf = (id: string) => [...MaestroSeatsV2.floor(nativeProfiles[id]), ...MaestroSeatsV2.visibility(id)]
const token = () => `tok_${randomBytes(8).toString("hex")}`
const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )

const host = AppNodeBuilder.build(
  LayerNode.group([MaestroToolsV2.node, ToolRegistry.node, Database.node, EventV2.node, AgentV2.node, Location.node]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [Global.node, Layer.unwrap(temporary("lucy-code-data-").pipe(Effect.map((data) => Global.layerWith({ data }))))],
    [
      Location.node,
      Layer.unwrap(
        temporary("lucy-code-location-").pipe(
          Effect.map((directory) => {
            const root = AbsolutePath.make(directory)
            return Layer.succeed(Location.Service, Location.Service.of({ directory: root, project: { id: Project.ID.global, directory: root } }))
          }),
        ),
      ),
    ],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ],
)

type Services = ToolRegistry.Service | Database.Service | EventV2.Service | AgentV2.Service | Location.Service
const run = <A, E>(body: Effect.Effect<A, E, Services | Scope.Scope>) =>
  Effect.runPromise(body.pipe(Effect.provide(host as Layer.Layer<Services>), Effect.scoped))

const setup = (id: string) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const location = yield* Location.Service
    const agents = yield* AgentV2.Service
    yield* database.db.insert(ProjectTable)
      .values({ id: location.project.id, worktree: location.directory, sandboxes: [] })
      .onConflictDoNothing().run().pipe(Effect.orDie)
    yield* database.db.insert(SessionTable).values({
      id, project_id: location.project.id, slug: id, directory: location.directory, title: "lucy code",
      version: "test", agent: "lucy",
    }).onConflictDoNothing().run().pipe(Effect.orDie)
    yield* agents.transform((draft) =>
      ["maestro", "lucy", "jimmy", "general"].forEach((seat) =>
        draft.update(AgentV2.ID.make(seat), (agent) => { agent.permissions = rulesOf(seat) })),
    )
    return location.directory
  })

const call = (id: string, agent: string, name: string, input: unknown) =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    return yield* (yield* registry.materialize(configured)).settle({
      sessionID: SessionSchema.ID.make(id),
      agent: AgentV2.ID.make(agent),
      assistantMessageID: SessionMessage.ID.make("msg_calling"),
      call: { type: "tool-call", id: `call_${name}_${agent}`, name, input },
    })
  })

const blob = (settled: { result: { type: string; value?: unknown }; output?: unknown }) =>
  JSON.stringify({ result: settled.result, output: settled.output ?? null })
const marker = (settled: { result: { type: string; value?: unknown }; output?: unknown }, needle: string) => {
  expect(settled.result.type === "error" || blob(settled).includes(needle)).toBe(true)
  expect(blob(settled)).toContain(needle)
}

test("bound Lucy code_search reads the snapshot, not the live project", async () => {
  expectSpawn(import.meta.path)
  const captured = token()
  const live = token()
  const id = `ses_search_${captured.slice(4)}`
  const retained: Array<{ uri: string; text: string }> = []
  await run(Effect.gen(function* () {
    const original = yield* setup(id)
    const snapshot = yield* temporary("lucy-code-snap-")
    yield* Effect.promise(() => fs.writeFile(path.join(snapshot, "hit.txt"), `captured ${captured}\n`))
    yield* Effect.promise(() => fs.writeFile(path.join(original, "live.txt"), `live ${live}\n`))
    yield* ReviewTools.bind(id, {
      repository: original,
      codeSource: Effect.succeed({ directory: snapshot, worktree: original }),
      retain: (artifact) => Effect.sync(() => { retained.push(artifact) }),
    })
    const found = yield* call(id, "lucy", "code_search", { pattern: captured, mode: "literal" })
    expect(blob(found)).toContain(captured)
    expect(blob(found)).toContain("hit.txt")
    expect(blob(found)).not.toContain(live)
    yield* Effect.promise(() => fs.writeFile(path.join(original, "hit.txt"), `mutated ${live}\n`))
    const again = yield* call(id, "lucy", "code_search", { pattern: captured, mode: "literal" })
    expect(blob(again)).toContain(captured)
    expect(blob(again)).not.toContain(live)
    const foreign = yield* call(`ses_foreign_${captured.slice(4)}`, "lucy", "code_search", { pattern: captured, mode: "literal" })
    marker(foreign, "review-code-binding-missing")
    expect(blob(foreign)).not.toContain(captured)
  }))
})

test("bound code_locate retains snapshot text and refuses escapes", async () => {
  expectSpawn(import.meta.path)
  const captured = token()
  const secret = token()
  const id = `ses_locate_${captured.slice(4)}`
  const retained: Array<{ uri: string; text: string }> = []
  await run(Effect.gen(function* () {
    const original = yield* setup(id)
    const snapshot = yield* temporary("lucy-code-snap-")
    const outside = yield* temporary("lucy-code-out-")
    yield* Effect.promise(async () => {
      await fs.writeFile(path.join(snapshot, "hit.txt"), `alpha\ncaptured ${captured} line\nomega\n`)
      await fs.writeFile(path.join(outside, "secret.txt"), `outside ${secret}\n`)
      await fs.symlink(outside, path.join(snapshot, "escape"), process.platform === "win32" ? "junction" : "dir")
    })
    yield* ReviewTools.bind(id, {
      repository: original,
      codeSource: Effect.succeed({ directory: snapshot, worktree: original }),
      retain: (artifact) => Effect.sync(() => { retained.push(artifact) }),
    })
    const located = yield* call(id, "lucy", "code_locate", { terms: [captured] })
    expect(blob(located)).toContain(captured)
    expect(retained.length).toBeGreaterThan(0)
    const artifact = retained[0]
    expect(artifact?.text).toContain(captured)
    expect(artifact?.uri.toLowerCase()).toContain("sha256")
    expect("capturedAt" in (artifact ?? {}) || "binding" in (artifact ?? {})).toBe(false)
    expect(blob(located)).toContain(artifact?.uri ?? "missing-retain-uri")
    const escaped = yield* call(id, "lucy", "code_locate", { terms: [secret], paths: ["../outside", "escape"] })
    expect(blob(escaped)).not.toContain(secret)
    expect(retained.every((item) => !item.text.includes(secret))).toBe(true)
  }))
})

test("absent, closed, and failed sources refuse code tools", async () => {
  const id = `ses_refuse_${token().slice(4)}`
  await run(Effect.gen(function* () {
    const original = yield* setup(id)
    for (const name of ["code_search", "code_locate", "code_query"]) {
      marker(yield* call(id, "lucy", name, name === "code_query" ? { op: "symbols" } : name === "code_search" ? { pattern: "x", mode: "literal" } : { terms: ["x"] }), "review-code-binding-missing")
    }
    yield* Effect.scoped(ReviewTools.bind(id, { repository: original, codeSource: Effect.succeed({ directory: original, worktree: original }) }))
    marker(yield* call(id, "lucy", "code_search", { pattern: "x", mode: "literal" }), "review-code-binding-missing")
    yield* ReviewTools.bind(`${id}_bad`, {
      repository: original,
      codeSource: Effect.fail(new Tool.Failure({ message: "review-code-source-unavailable" })),
    })
    yield* setup(`${id}_bad`)
    for (const name of ["code_search", "code_locate", "code_query"] as const) {
      marker(yield* call(`${id}_bad`, "lucy", name, name === "code_query" ? { op: "symbols" } : name === "code_search" ? { pattern: "x", mode: "literal" } : { terms: ["x"] }), "review-code-source-unavailable")
    }
  }))
})

test("foreign agents and Lucy research tools stay denied", async () => {
  const captured = token()
  const id = `ses_seats_${captured.slice(4)}`
  await run(Effect.gen(function* () {
    const original = yield* setup(id)
    const snapshot = yield* temporary("lucy-code-snap-")
    yield* Effect.promise(() => fs.writeFile(path.join(snapshot, "hit.txt"), captured))
    yield* ReviewTools.bind(id, { repository: original, codeSource: Effect.succeed({ directory: snapshot, worktree: original }) })
    const foreign = yield* call(id, "maestro", "code_search", { pattern: captured, mode: "literal" })
    expect(foreign.result.type).toBe("error")
    expect(blob(foreign)).not.toContain(captured)
    marker(yield* call(id, "lucy", "research_capture", { kind: "file", path: "hit.txt" }), "research seat")
    marker(yield* call(id, "lucy", "research_view", { action: "corpus" }), "research seat")
  }))
})

test("noncommit code_query is index_unavailable while lexical search works", async () => {
  expectSpawn(import.meta.path)
  const captured = token()
  const id = `ses_query_${captured.slice(4)}`
  await run(Effect.gen(function* () {
    const original = yield* setup(id)
    const snapshot = yield* temporary("lucy-code-snap-")
    yield* Effect.promise(() => fs.writeFile(path.join(snapshot, "hit.txt"), captured))
    yield* ReviewTools.bind(id, { repository: original, codeSource: Effect.succeed({ directory: snapshot, worktree: original }) })
    marker(yield* call(id, "lucy", "code_query", { op: "symbols" }), "index_unavailable")
    const found = yield* call(id, "lucy", "code_search", { pattern: captured, mode: "literal" })
    expect(blob(found)).toContain(captured)
    expect(blob(found)).toContain("hit.txt")
  }))
})
