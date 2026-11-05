import { expect, test } from "bun:test"
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
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ReviewSeatTools } from "@orchestra/core/review/seat-tools"
import { ReviewTools } from "@orchestra/core/review/tools"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { Seats } from "@orchestra/maestro/seats"
import { nativeProfiles } from "../src/roster"

// Import evaluates roster.ts, which builds native profiles immediately. A throw there fails this file before any test.
if (nativeProfiles.lucy.atlas_context !== "allow") throw new Error("roster profiles did not initialize")
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroToolsV2 } from "../src/v2/tools"

// Lucy build plan WP 1.7 (K7, E1, D15). Both engines read one tool set: the native runner materializes the seat's
// registered tools under its rules, and the Claude host serves exactly that materialization over MCP (host.ts `served`)
// beside the Claude Code built-ins named for the seat's loop ids. Every check also runs on a mutated input.

const configured = [{ action: "*", resource: "*", effect: "allow" as const }]
const rulesOf = (id: string) => [...MaestroSeatsV2.floor(nativeProfiles[id]), ...MaestroSeatsV2.visibility(id)]
const effect = (id: string, action: string, resource = "*") =>
  PermissionV2.evaluate(action, resource, configured, rulesOf(id)).effect

test("the seat declaration and its stage sets derive from one list", () => {
  expect(ReviewSeatTools.SEAT).toBe("lucy")
  expect(ReviewSeatTools.READ).toEqual(["read", "grep", "glob", "skill", "code_locate", "code_query", "code_search", "review_history"])
  expect(ReviewSeatTools.OWN).toEqual([...ReviewSeatTools.REVIEW, ...ReviewSeatTools.CODE, "atlas_context"])
  expect(ReviewSeatTools.lead).toEqual([...ReviewSeatTools.READ, "atlas_context"])
  expect(ReviewSeatTools.lens).toEqual([...ReviewSeatTools.lead, "review_analyze"])
  // Spreading lead into the verifier would inherit atlas_context. The frozen verifier does not.
  expect([...ReviewSeatTools.lead, "review_probe"]).toContain("atlas_context")
  expect(ReviewSeatTools.verifier).toEqual([...ReviewSeatTools.READ, "review_probe"])
  expect(ReviewSeatTools.verifier).not.toContain("atlas_context")
  expect(ReviewSeatTools.final).toEqual([...ReviewSeatTools.lead, "maestro_record_review"])
  const stages = new Set([...ReviewSeatTools.lens, ...ReviewSeatTools.verifier, ...ReviewSeatTools.final])
  const declared = [...ReviewSeatTools.OWN, ...ReviewSeatTools.LOOP, ReviewSeatTools.RECORD].toSorted()
  expect(([...stages] as string[]).toSorted()).toEqual(declared)
  expect(([...stages, "probe_run"] as string[]).toSorted()).not.toEqual(declared)
  // Each Claude Code built-in the seat gets is the engine's name for one of its loop ids, and no other.
  expect(ReviewSeatTools.CLAUDE.map((name) => name.toLowerCase())).toEqual([...ReviewSeatTools.LOOP])
})

test("the seat's floor grants exactly its own tools over its review base", () => {
  for (const id of [...ReviewSeatTools.OWN, ReviewSeatTools.RECORD, "grep", "glob"]) expect(effect("lucy", id)).toBe("allow")
  expect(effect("lucy", "read", "src/a.ts")).toBe("allow")
  expect(effect("lucy", "read", "app/.env")).toBe("deny")
  expect(effect("lucy", "skill", "lucy-review")).toBe("allow")
  expect(effect("lucy", "skill", "lucy-lens-correctness")).toBe("allow")
  expect(effect("lucy", "skill", "team-stack")).toBe("allow")
  expect(effect("lucy", "skill", "backend-implement")).toBe("deny")
  expect(effect("lucy", "atlas_context")).toBe("allow")
  for (const id of ["bash", "edit", "write", "webfetch", "websearch", "probe_run", "research_capture", "inquiry", "atlas_memory_recall", "atlas_memory_emit", "task"])
    expect(effect("lucy", id)).toBe("deny")
})

test("review_* stay with the review seat and code intelligence with the research and review seats", () => {
  for (const tool of ReviewSeatTools.REVIEW) {
    expect(effect("lucy", tool)).toBe("allow")
    for (const id of ["maestro", "jimmy", "backend", "billy", "general"]) expect(effect(id, tool)).toBe("deny")
  }
  for (const tool of ReviewSeatTools.CODE) {
    expect(effect("lucy", tool)).toBe("allow")
    expect(effect("jimmy", tool)).toBe("allow")
    for (const id of ["maestro", "backend", "billy", "general"]) expect(effect(id, tool)).toBe("deny")
  }
})

test("the seat has no MCP server (D15)", () => {
  expect(Seats.all.lucy.mcp).toEqual([])
  expect(Object.keys(nativeProfiles.lucy).filter((action) => action.endsWith("_*"))).toEqual([])
  expect(effect("lucy", "hugr-composer_fastapi_meta_compose")).toBe("deny")
  expect(Object.keys({ ...nativeProfiles.lucy, "hugr-composer_*": "allow" }).filter((action) => action.endsWith("_*"))).not.toEqual([])
})

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )

const host = AppNodeBuilder.build(
  LayerNode.group([MaestroToolsV2.node, ToolRegistry.node, Database.node, EventV2.node, AgentV2.node, Location.node]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [Global.node, Layer.unwrap(temporary("lucy-tools-data-").pipe(Effect.map((data) => Global.layerWith({ data }))))],
    [
      Location.node,
      Layer.unwrap(
        temporary("lucy-tools-location-").pipe(
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

const sessionID = SessionSchema.ID.make("ses_lucy_tools")

// A Session the seats call from, and each seat's agent carrying the rules production gives it.
const setup = Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const agents = yield* AgentV2.Service
  yield* database.db.insert(ProjectTable)
    .values({ id: location.project.id, worktree: location.directory, sandboxes: [] })
    .onConflictDoNothing().run().pipe(Effect.orDie)
  yield* database.db.insert(SessionTable).values({
    id: sessionID, project_id: location.project.id, slug: "lucy-tools", directory: location.directory, title: "lucy tools",
    version: "test", agent: "lucy",
  }).run().pipe(Effect.orDie)
  yield* agents.transform((draft) =>
    ["maestro", "lucy", "jimmy", "general"].forEach((id) =>
      draft.update(AgentV2.ID.make(id), (agent) => { agent.permissions = rulesOf(id) })),
  )
  return location.directory
})

const settle = (agent: string, name: string, input: unknown) =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    return (yield* (yield* registry.materialize(configured)).settle({
      sessionID,
      agent: AgentV2.ID.make(agent),
      assistantMessageID: SessionMessage.ID.make("msg_calling"),
      call: { type: "tool-call", id: `call_${name}`, name, input },
    })).result
  })

const probe = { candidate: "c1", option: "probe:test", target: { test: { file: "a.test.ts" } } }

test("both engines expose the same set to the seat: its own registered tools and nothing else", () =>
  run(
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const visible = (id: string) =>
        registry.materialize(rulesOf(id)).pipe(Effect.map((item) => item.definitions.map((tool) => tool.name).toSorted()))
      // This host registers the review tools, not the Atlas node. The floor still grants atlas_context; the scope
      // test settles the registered tool.
      expect(yield* visible("lucy")).toEqual(
        [...ReviewSeatTools.OWN, ReviewSeatTools.RECORD].filter((id) => id !== "atlas_context").toSorted(),
      )
      expect(yield* visible("lucy")).not.toContain("probe_run")
      for (const id of ["maestro", "jimmy", "backend", "general"])
        expect((yield* visible(id)).filter((name) => name.startsWith("review_"))).toEqual([])
    }),
  ))

test("review_* refuse any caller that is not the review seat, even where rules allow it", () =>
  run(
    Effect.gen(function* () {
      yield* setup
      for (const agent of ["maestro", "jimmy", "general"]) {
        expect(yield* settle(agent, "review_history", { op: "log" })).toEqual({ type: "error", value: "review_history runs only as the review seat" })
        expect(yield* settle(agent, "review_probe", probe)).toEqual({ type: "error", value: "review_probe runs only as the review seat" })
        expect(yield* settle(agent, "review_analyze", { op: "page" })).toEqual({ type: "error", value: "review_analyze runs only as the review seat" })
      }
      // The seat itself runs them only inside a review the fan-out bound.
      expect(yield* settle("lucy", "review_history", { op: "log" })).toEqual({ type: "error", value: "review_history runs only inside a review" })
      expect(yield* settle("lucy", "review_probe", probe)).toEqual({ type: "error", value: "review_probe runs only inside a review" })
    }),
  ))

test("a bound review Session pages only its own lens, never runs the analyzer, and probes only as a verifier", () =>
  run(
    Effect.gen(function* () {
      const directory = yield* setup
      yield* ReviewTools.bind(sessionID, {
        repository: directory,
        analyze: { lens: "correctness", page: (input) => Effect.succeed({ items: [], ...(input.cursor ? { cursor: input.cursor } : {}) }) },
      })
      expect(yield* settle("lucy", "review_analyze", { op: "run" })).toEqual({ type: "error", value: "review_analyze run is host-only" })
      expect(yield* settle("lucy", "review_analyze", { op: "page", lens: "security" })).toEqual({
        type: "error",
        value: "review_analyze pages only your lens: correctness",
      })
      expect(yield* settle("lucy", "review_analyze", { op: "page", lens: "correctness" })).toEqual({ type: "text", value: JSON.stringify({ items: [] }) })
      expect(yield* settle("lucy", "review_analyze", { op: "page", cursor: "c2" })).toEqual({
        type: "text",
        value: JSON.stringify({ items: [], cursor: "c2" }),
      })
      expect(yield* settle("lucy", "review_probe", probe)).toEqual({ type: "error", value: "review_probe runs only in a verifier Session" })
      expect(yield* settle("jimmy", "review_analyze", { op: "page", lens: "correctness" })).toEqual({
        type: "error",
        value: "review_analyze runs only as the review seat",
      })
    }),
  ))
