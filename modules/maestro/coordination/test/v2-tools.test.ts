import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { and, eq, like } from "drizzle-orm"
import { DateTime, Deferred, Effect, Fiber, Layer, Schema, Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { AppProcess } from "@orchestra/core/process"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { ReviewLocalTools } from "@orchestra/core/review-toolkit/local-tools"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { ReviewSeatTools } from "@orchestra/core/review/seat-tools"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { renderPresentation } from "../src/approval"
import { nativeProfiles } from "../src/roster"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroToolsV2 } from "../src/v2/tools"

// The Maestro tools V2 registers: the governance tools, the Arsenal, the cold reviewer's receipt, and the seats' Atlas Memory.
const governance = [
  "maestro_record_admission",
  "maestro_present_approval",
  "maestro_record_approval",
  "maestro_grant_authorization",
  "maestro_record_context",
  "maestro_catalog_context",
  "maestro_record_plan_revision",
  "maestro_record_result_decision",
  "maestro_request_review",
  "maestro_record_validation",
  "maestro_prepare_review_checks",
  "maestro_workflows",
]
const arsenal = Object.values(MaestroArsenal.names)
const memory = ["atlas_memory_recall", "atlas_memory_emit"]
const drafting = ["archie_draft_workflow"]
const research = [
  "research_capture",
  "research_view",
  "research_record",
  "inquiry",
  "code_search",
  "code_query",
  "code_locate",
  "probe_run",
]

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )

const host = AppNodeBuilder.build(
  LayerNode.group([MaestroToolsV2.node, ToolRegistry.node, Database.node, EventV2.node, AgentV2.node, Location.node, PermissionV2.node, PermissionSaved.node]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [
      Global.node,
      Layer.unwrap(temporary("maestro-tools-data-").pipe(Effect.map((data) => Global.layerWith({ data })))),
    ],
    [
      Location.node,
      Layer.unwrap(
        temporary("maestro-tools-location-").pipe(
          Effect.map((directory) => {
            const root = AbsolutePath.make(directory)
            return Layer.succeed(
              Location.Service,
              Location.Service.of({ directory: root, project: { id: Project.ID.global, directory: root } }),
            )
          }),
        ),
      ),
    ],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ],
)

const run = <A, E>(
  body: Effect.Effect<
    A,
    E,
    ToolRegistry.Service | Database.Service | EventV2.Service | AppProcess.Service | AgentV2.Service | PermissionV2.Service | PermissionSaved.Service | Location.Service | Scope.Scope
  >,
) =>
  Effect.runPromise(
    body.pipe(
      Effect.provide(
        host as Layer.Layer<
          ToolRegistry.Service | Database.Service | EventV2.Service | AppProcess.Service | AgentV2.Service | PermissionV2.Service | PermissionSaved.Service | Location.Service
        >,
      ),
      Effect.scoped,
    ),
  )

const sessionID = SessionSchema.ID.make("ses_maestro_tools")
const model = { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
const encode = Schema.encodeSync(SessionMessage.Message)
const allow = [{ action: "*", resource: "*", effect: "allow" as const }]
// The rules `v2/seats.ts` gives each agent: its seat floor, then the Maestro tool visibility.
const rulesOf = (id: string) => [
  ...allow,
  ...MaestroSeatsV2.floor(nativeProfiles[id]),
  ...MaestroSeatsV2.visibility(id),
]

const setup = Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const agents = yield* AgentV2.Service
  yield* database.db
    .insert(ProjectTable)
    .values({ id: location.project.id, worktree: location.directory, sandboxes: [] })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  yield* database.db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: location.project.id,
      slug: "maestro-tools",
      directory: location.directory,
      title: "maestro tools",
      version: "test",
      agent: AgentV2.defaultID,
    })
    .run()
    .pipe(Effect.orDie)
  yield* agents.transform((draft) =>
    ["maestro", "lucy", "archie", "general"].forEach((id) => draft.update(AgentV2.ID.make(id), () => {})),
  )
  return database.db
})

const insert = (db: Database.Interface["db"], messages: readonly SessionMessage.Message[]) =>
  db
    .insert(SessionMessageTable)
    .values(
      messages.map((message, index) => {
        const { id, type, ...data } = encode(message)
        return {
          id: SessionMessage.ID.make(id),
          session_id: sessionID,
          type,
          seq: index + 1,
          time_created: DateTime.toEpochMillis(message.time.created),
          data,
        }
      }),
    )
    .run()
    .pipe(Effect.orDie)

const time = { created: DateTime.makeUnsafe(1_700_000_000_000) }
const user = (id: string, text: string) =>
  SessionMessage.User.make({ id: SessionMessage.ID.make(id), type: "user", text, time })
const assistant = (id: string, content: SessionMessage.Assistant["content"] = []) =>
  SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(id),
    type: "assistant",
    agent: "maestro",
    model,
    content,
    time,
  })

const call = (agent: string, name: string, input: unknown, assistantMessageID = "msg_calling") =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    const materialized = yield* registry.materialize(rulesOf(agent))
    return yield* materialized.settle({
      sessionID,
      agent: AgentV2.ID.make(agent),
      assistantMessageID: SessionMessage.ID.make(assistantMessageID),
      call: { type: "tool-call", id: `call_${name}`, name, input },
    })
  })

const temporaryCheckRoots = (base: string) => ({
  tools: path.join(base, "review-local-tools"),
  runtime: path.join(base, "sandbox-runtime"),
})

const exists = (target: string) => Effect.promise(() => fs.access(target).then(() => true, () => false))

const withCheckRoots = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  roots: ReturnType<typeof temporaryCheckRoots>,
  dependencies?: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const source = yield* ToolSafetySandboxRuntime.Source
    return yield* effect.pipe(
      Effect.provideService(ReviewLocalTools.Root, roots.tools),
      Effect.provideService(ToolSafetySandboxRuntime.Source, source && {
        ...source,
        directory: roots.runtime,
        ...(dependencies === undefined ? {} : { dependencies }),
      }),
    )
  })

const prepareRequest = (
  roots: ReturnType<typeof temporaryCheckRoots>,
  tools: ReadonlyArray<"shfmt" | "cargo-machete"> = ["shfmt", "cargo-machete"],
) =>
  Effect.gen(function* () {
    const service = yield* PermissionV2.Service
    const events = yield* EventV2.Service
    const asked = yield* Deferred.make<PermissionV2.Request>()
    const unsubscribe = yield* events.listen((event) => {
      if (event.type !== PermissionV2.Event.Asked.type) return Effect.void
      const request = Schema.decodeUnknownSync(PermissionV2.Request)(event.data)
      if (request.action !== "review_checks_prepare") return Effect.void
      return Deferred.succeed(asked, request).pipe(Effect.asVoid)
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    const running = yield* withCheckRoots(
      call("maestro", "maestro_prepare_review_checks", { tools }),
      roots,
    ).pipe(Effect.forkChild)
    const request = yield* Effect.raceFirst(
      Deferred.await(asked),
      Fiber.join(running).pipe(Effect.flatMap(() => Effect.fail(new Error("preparation completed without requesting explicit permission")))),
    )
    return { service, running, request }
  })

const reviewInput = {
  validationRecordID: "evt_v",
  workCard: "card",
  reviewMethodVersion: "v1",
  verdict: "APPROVE",
  findings: [],
  artifact: { baseSHA: "a", headSHA: "b", worktree: "/w", changedPaths: [], sha256: "c" },
  checks: [{ id: "tests", status: "PASS", detail: "green" }],
}

const ready = {
  kind: "work",
  goal: "Ship the export button",
  known: [{ text: "The owner wants CSV export", source: "stakeholder" }],
  proposals: [],
  unknowns: [],
  uncertainty: "low",
  activeWorkEffect: "none",
  reason: "Goal and scope are clear",
}

test("Maestro sees its tools and the Arsenal, each seat only its own, every other agent none", () =>
  run(
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const visible = (id: string) =>
        registry.materialize(rulesOf(id)).pipe(Effect.map((item) => item.definitions.map((tool) => tool.name).sort()))
      expect(yield* visible("maestro")).toEqual([...governance, ...arsenal].sort())
      expect(yield* visible("lucy")).toEqual([...ReviewSeatTools.REVIEW, ...ReviewSeatTools.CODE, "maestro_record_review"].sort())
      expect(yield* visible("archie")).toEqual([...arsenal, ...memory, ...drafting].sort())
      expect(yield* visible("backend")).toEqual([...memory].sort())
      expect(yield* visible("jimmy")).toEqual([...memory, ...research].sort())
      for (const id of ["general", "explore", "custom"]) expect(yield* visible(id)).toEqual([])
      // Everything is registered: unfiltered materialization lists every tool.
      expect((yield* registry.materialize()).definitions.map((tool) => tool.name).sort()).toEqual(
        [...governance, ...arsenal, "maestro_record_review", ...ReviewSeatTools.REVIEW, ...memory, ...research, ...drafting].sort(),
      )
    }),
  ))

test("review-check preparation is owner-visible only and rejects non-Maestro callers", () =>
  run(
    Effect.gen(function* () {
      yield* setup
      const registry = yield* ToolRegistry.Service
      expect((yield* registry.materialize(rulesOf("maestro"))).definitions.map((tool) => tool.name)).toContain("maestro_prepare_review_checks")
      expect((yield* registry.materialize(rulesOf("lucy"))).definitions.map((tool) => tool.name)).not.toContain("maestro_prepare_review_checks")
      const unrestricted = yield* registry.materialize()
      const refusal = yield* unrestricted.settle({
        sessionID,
        agent: AgentV2.ID.make("general"),
        assistantMessageID: SessionMessage.ID.make("msg_calling"),
        call: { type: "tool-call", id: "call_unrestricted_prepare", name: "maestro_prepare_review_checks", input: { tools: ["shfmt"] } },
      })
      expect(refusal.result.type).toBe("error")
    }),
  ))

test("preparation input rejects unknown tools, empty requests and more than two entries", () =>
  run(Effect.gen(function* () {
    yield* setup
    for (const tools of [[], ["unknown-tool"], ["shfmt", "shfmt", "shfmt"]])
      expect((yield* call("maestro", "maestro_prepare_review_checks", { tools })).result.type).toBe("error")
    const permission = yield* PermissionV2.Service
    expect(yield* permission.list()).toEqual([])
  })))

test("unsupported preparation host refuses before permission or cache writes", () =>
  run(
    Effect.gen(function* () {
      if (process.platform !== "win32" && !(process.platform === "linux" && process.arch !== "x64")) return
      yield* setup
      const temp = yield* temporary("maestro-review-check-unsupported-")
      const roots = temporaryCheckRoots(temp)
      const result = yield* withCheckRoots(
        call("maestro", "maestro_prepare_review_checks", { tools: ["shfmt"] }),
        roots,
      )
      expect(JSON.parse(String(result.result.value))).toMatchObject({ status: "not-run", reason: "read-sandbox-unsupported-host" })
      const permission = yield* PermissionV2.Service
      expect(yield* permission.list()).toEqual([])
      expect(yield* exists(roots.tools)).toBe(false)
      expect(yield* exists(roots.runtime)).toBe(false)
    }),
  ))

test("approved preparation reports a supported-host sandbox dependency refusal without acquiring tools", () =>
  run(
    Effect.gen(function* () {
      if (process.platform !== "linux" || process.arch !== "x64") return
      yield* setup
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) => draft.update(AgentV2.ID.make("maestro"), (agent) => {
        agent.permissions = [{ action: "review_checks_prepare", resource: "*", effect: "allow" }]
      }))
      const temp = yield* temporary("maestro-review-check-runtime-refusal-")
      const roots = temporaryCheckRoots(temp)
      const missing = `orchestra-test-missing-${Date.now()}`
      const prompt = yield* Effect.gen(function* () {
        const service = yield* PermissionV2.Service
        const events = yield* EventV2.Service
        const asked = yield* Deferred.make<PermissionV2.Request>()
        const unsubscribe = yield* events.listen((event) => {
          if (event.type !== PermissionV2.Event.Asked.type) return Effect.void
          const request = Schema.decodeUnknownSync(PermissionV2.Request)(event.data)
          if (request.action !== "review_checks_prepare") return Effect.void
          return Deferred.succeed(asked, request).pipe(Effect.asVoid)
        })
        yield* Effect.addFinalizer(() => unsubscribe)
        const running = yield* withCheckRoots(
          call("maestro", "maestro_prepare_review_checks", { tools: ["shfmt"] }),
          roots,
          [missing],
        ).pipe(Effect.forkChild)
        const request = yield* Effect.raceFirst(
          Deferred.await(asked),
          Fiber.join(running).pipe(Effect.flatMap(() => Effect.fail(new Error("preparation completed without requesting explicit permission")))),
        )
        return { service, running, request }
      })
      yield* prompt.service.reply({ requestID: prompt.request.id, reply: "once" })
      const result = yield* Fiber.join(prompt.running)
      expect(JSON.parse(String(result.result.value))).toMatchObject({
        status: "not-run",
        reason: expect.stringContaining("sandbox-dependency-missing"),
        tools: [],
      })
      expect(yield* exists(roots.runtime)).toBe(false)
      expect(yield* exists(roots.tools)).toBe(false)
    }),
  ))

test("explicit preparation permission carries canonical tool context and writes no cache before once", () =>
  run(
    Effect.gen(function* () {
      if (process.platform !== "linux" || process.arch !== "x64") return
      yield* setup
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) => draft.update(AgentV2.ID.make("maestro"), (agent) => {
        agent.permissions = [{ action: "review_checks_prepare", resource: "*", effect: "allow" }]
      }))
      const saved = yield* PermissionSaved.Service
      yield* saved.add({ projectID: Project.ID.global, action: "review_checks_prepare", resources: ["*"] })
      const temp = yield* temporary("maestro-review-check-pending-")
      const roots = temporaryCheckRoots(temp)
      const prompt = yield* prepareRequest(roots)
      expect(prompt.request).toMatchObject({
        sessionID,
        action: "review_checks_prepare",
        resources: ["review-check:read-sandbox", "review-check:shfmt", "review-check:cargo-machete"],
        source: { type: "tool", messageID: "msg_calling", callID: "call_maestro_prepare_review_checks" },
      })
      expect(prompt.request.save).toBeUndefined()
      expect(yield* exists(roots.tools)).toBe(false)
      expect(yield* exists(roots.runtime)).toBe(false)
      yield* prompt.service.reply({ requestID: prompt.request.id, reply: "reject" })
      expect((yield* Fiber.join(prompt.running)).result.type).toBe("error")
      expect(yield* prompt.service.list()).toEqual([])
      expect(yield* exists(roots.tools)).toBe(false)
      expect(yield* exists(roots.runtime)).toBe(false)
    }),
  ))

test("configured deny refuses preparation without creating runtime or toolkit cache", () =>
  run(
    Effect.gen(function* () {
      if (process.platform !== "linux" || process.arch !== "x64") return
      yield* setup
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) => draft.update(AgentV2.ID.make("maestro"), (agent) => {
        agent.permissions = [{ action: "review_checks_prepare", resource: "*", effect: "deny" }]
      }))
      const temp = yield* temporary("maestro-review-check-denied-")
      const roots = temporaryCheckRoots(temp)
      const result = yield* withCheckRoots(
        call("maestro", "maestro_prepare_review_checks", { tools: ["shfmt"] }),
        roots,
      )
      expect(result.result.type).toBe("error")
      const permission = yield* PermissionV2.Service
      expect(yield* permission.list()).toEqual([])
      expect(yield* exists(roots.tools)).toBe(false)
      expect(yield* exists(roots.runtime)).toBe(false)
    }),
  ))

test("one explicit once prepares both pinned checks and locate sees the same-process identities", () =>
  run(
    Effect.gen(function* () {
      if (process.platform !== "linux" || process.arch !== "x64") return
      yield* setup
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) => draft.update(AgentV2.ID.make("maestro"), (agent) => {
        agent.permissions = [{ action: "review_checks_prepare", resource: "*", effect: "allow" }]
      }))
      const temp = yield* temporary("maestro-review-check-ready-")
      const roots = temporaryCheckRoots(temp)
      expectSpawn(import.meta.path)
      const prompt = yield* prepareRequest(roots, ["cargo-machete", "shfmt"])
      yield* prompt.service.reply({ requestID: prompt.request.id, reply: "once" })
      const settled = yield* Fiber.join(prompt.running)
      const runtime = yield* withCheckRoots(ToolSafetySandboxRuntime.resolve(false), roots)
      expect(runtime).toMatchObject({ directory: roots.runtime })
      expect(yield* exists(roots.runtime)).toBe(true)
      const result = JSON.parse(String(settled.result.value)) as {
        status: string
        tools: ReadonlyArray<{ tool: string; ok: boolean; identity?: ReviewLocalTools.Identity }>
      }
      expect(result.status).toBe("ready")
      expect(result.tools.map((item) => item.tool)).toEqual(["cargo-machete", "shfmt"])
      for (const tool of ["shfmt", "cargo-machete"] as const) {
        const located = yield* ReviewLocalTools.locate(tool).pipe(Effect.provideService(ReviewLocalTools.Root, roots.tools))
        expect(located.ok).toBe(true)
        if (located.ok) {
          const item = result.tools.find((candidate) => candidate.tool === tool)
          expect(item?.identity).toEqual(located.identity)
          expect(located.identity.target).toBe("linux-x64")
          expect(located.identity.proof).toBe("version-probe")
        }
      }
      const duplicatePrompt = yield* prepareRequest(roots, ["shfmt", "shfmt"])
      expect(duplicatePrompt.request.resources).toEqual(["review-check:read-sandbox", "review-check:shfmt"])
      yield* duplicatePrompt.service.reply({ requestID: duplicatePrompt.request.id, reply: "once" })
      const duplicateSettled = yield* Fiber.join(duplicatePrompt.running)
      const duplicateResult = JSON.parse(String(duplicateSettled.result.value)) as { status: string; tools: ReadonlyArray<{ tool: string; ok: boolean }> }
      expect(duplicateResult.status).toBe("ready")
      expect(duplicateResult.tools).toEqual([expect.objectContaining({ tool: "shfmt", ok: true })])
      const cargo = result.tools.find((item) => item.tool === "cargo-machete")
      if (!cargo?.identity) throw new Error("cargo-machete preparation omitted its pinned identity")
      const cargoDirectory = path.dirname(cargo.identity.executable)
      expect(cargoDirectory.startsWith(roots.tools)).toBe(true)
      const mode = (yield* Effect.promise(() => fs.stat(cargoDirectory))).mode & 0o777
      yield* Effect.acquireRelease(
        Effect.promise(() => fs.chmod(cargoDirectory, 0)),
        () => Effect.promise(() => fs.chmod(cargoDirectory, mode)),
      )
      const partialPrompt = yield* prepareRequest(roots)
      yield* partialPrompt.service.reply({ requestID: partialPrompt.request.id, reply: "once" })
      const partialSettled = yield* Fiber.join(partialPrompt.running)
      const partial = JSON.parse(String(partialSettled.result.value)) as {
        status: string
        tools: ReadonlyArray<{ tool: string; ok: boolean; reason?: string }>
      }
      expect(partial.status).toBe("not-run")
      const refused = yield* ReviewLocalTools.prepare("cargo-machete").pipe(Effect.provideService(ReviewLocalTools.Root, roots.tools))
      expect(refused.ok).toBe(false)
      expect(partial.tools[0]).toMatchObject({ tool: "shfmt", ok: true })
      expect(partial.tools[1]).toEqual({ tool: "cargo-machete", ...refused })
    }),
  ))

test("the research tools run only as the research seat and only under its dispatch allowance", () =>
  run(
    Effect.gen(function* () {
      yield* setup
      const agents = yield* AgentV2.Service
      // The seat's own rules, as production grants them: with none, the research permission asks the owner and waits.
      yield* agents.transform((draft) => draft.update(AgentV2.ID.make("jimmy"), (agent) => { agent.permissions = rulesOf("jimmy") }))
      const settle = (agent: string, name: string, input: unknown) =>
        Effect.gen(function* () {
          const registry = yield* ToolRegistry.Service
          return (yield* (yield* registry.materialize(allow)).settle({
            sessionID,
            agent: AgentV2.ID.make(agent),
            assistantMessageID: SessionMessage.ID.make("msg_calling"),
            call: { type: "tool-call", id: "call", name, input },
          })).result
        })
      expect(yield* settle("maestro", "research_view", { action: "corpus" })).toEqual({
        type: "error",
        value: "research_view runs only as the research seat",
      })
      // The calling Session is Maestro's own: no research dispatch is bound to it, so nothing is read or retained.
      expect(yield* settle("jimmy", "research_view", { action: "corpus" })).toEqual({
        type: "error",
        value: "Research denied: binding_missing: Research runs only under its dispatch allowance",
      })
      expect(yield* settle("jimmy", "research_capture", { kind: "file", path: "missing.txt" })).toEqual({
        type: "error",
        value: "Research denied: binding_missing: Research runs only under its dispatch allowance",
      })
      expect(yield* settle("maestro", "code_search", { pattern: "settle" })).toEqual({
        type: "error",
        value: "code_search runs only as the research seat",
      })
      // The code tools search and retain only inside the dispatch, as the research records do.
      expect(yield* settle("jimmy", "code_search", { pattern: "settle" })).toEqual({
        type: "error",
        value: "Research denied: binding_missing: Research runs only under its dispatch allowance",
      })
      expect(yield* settle("jimmy", "probe_run", { snapshot: { kind: "worktree" }, runner: { kind: "typecheck", project: "tsconfig.json" } })).toEqual({
        type: "error",
        value: "Research denied: binding_missing: Research runs only under its dispatch allowance",
      })
      expect(yield* settle("jimmy", "code_locate", { terms: ["settle"] })).toEqual({
        type: "error",
        value: "Research denied: binding_missing: Research runs only under its dispatch allowance",
      })
    }),
  ))

test("each tool refuses a caller that is not its owner even where rules would allow it", () =>
  run(
    Effect.gen(function* () {
      yield* setup
      const everything = (agent: string, name: string, input: unknown = {}) =>
        Effect.gen(function* () {
          const registry = yield* ToolRegistry.Service
          return (yield* (yield* registry.materialize(allow)).settle({
            sessionID,
            agent: AgentV2.ID.make(agent),
            assistantMessageID: SessionMessage.ID.make("msg_calling"),
            call: { type: "tool-call", id: "call", name, input },
          })).result
        })
      expect(yield* everything("general", "maestro_record_approval")).toEqual({
        type: "error",
        value: "Approval decision requires Maestro",
      })
      expect(yield* everything("maestro", "maestro_record_review", reviewInput)).toEqual({
        type: "error",
        value: "Review recording requires the cold reviewer (`lucy`)",
      })
      expect(yield* everything("general", "maestro_catalog_context")).toEqual({
        type: "error",
        value: "Atlas context catalog requires Maestro",
      })
      expect(yield* everything("general", MaestroArsenal.names.catalog)).toEqual({
        type: "error",
        value: "Maestro Arsenal requires native Maestro identity.",
      })
    }),
  ))

// The binding asks the Session read permission before it reads the host's observations, so a denied read proves the
// governance call reached the binding; without one the Arsenal refuses for the missing binding instead.
test("Arsenal governance reaches the host's Session observation binding", () =>
  run(
    Effect.gen(function* () {
      yield* setup
      const agents = yield* AgentV2.Service
      yield* agents.transform((draft) =>
        draft.update(AgentV2.ID.make("maestro"), (agent) => {
          agent.permissions = [...allow, { action: "read", resource: "session:*", effect: "deny" }]
        }),
      )
      const described = yield* call("maestro", MaestroArsenal.names.describe, { name: "governance" })
      expect(described.result).toMatchObject({ type: "text" })
      const executed = yield* call("maestro", MaestroArsenal.names.execute, {
        name: "governance",
        arguments: { operation: "status", observations: { complete: false }, prices: [] },
      })
      expect(executed.result).toEqual({ type: "error", value: "Arsenal governance was not permitted" })
    }),
  ))

test("admission records one outcome against the latest direct owner message before the call", () =>
  run(
    Effect.gen(function* () {
      const db = yield* setup
      yield* insert(db, [
        user("msg_owner_first", "Hi"),
        SessionMessage.Synthetic.make({
          id: SessionMessage.ID.make("msg_task_result"),
          type: "synthetic",
          sessionID,
          text: "Task finished",
          time,
        }),
        user("msg_owner", "Add CSV export to the report page"),
        assistant("msg_calling"),
        user("msg_owner_later", "Also PDF"),
      ])
      const input = { methodVersion: "admit-request-v1", assessment: ready }
      const first = yield* call("maestro", "maestro_record_admission", input)
      expect(first.output?.structured).toEqual({
        messageID: "msg_owner",
        outcome: "READY_TO_DRAFT",
        text: "READY_TO_DRAFT: admission message msg_owner",
      })
      expect(first.result).toEqual({ type: "text", value: "READY_TO_DRAFT: admission message msg_owner" })
      // An exact retry replays the record; another assessment for the same owner message conflicts.
      expect((yield* call("maestro", "maestro_record_admission", input)).output?.structured).toEqual(
        first.output?.structured,
      )
      const conflict = yield* call("maestro", "maestro_record_admission", {
        ...input,
        assessment: { ...ready, unknowns: ["Which columns?"] },
      })
      expect(String(conflict.result.value)).toStartWith("MaestroAdmissionConflict: owner message msg_owner")
      const rows = yield* db
        .select()
        .from(EventTable)
        .where(
          and(
            eq(EventTable.aggregate_id, sessionID),
            eq(EventTable.type, EventV2.versionedType(MaestroEvent.Admission.Decided.type, 1)),
          ),
        )
        .all()
        .pipe(Effect.orDie)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.data).toMatchObject({ messageID: "msg_owner", outcome: "READY_TO_DRAFT", sessionID })
    }),
  ))

test("admission computes CLARIFY itself and needs a direct owner message", () =>
  run(
    Effect.gen(function* () {
      const db = yield* setup
      const empty = yield* call("maestro", "maestro_record_admission", {
        methodVersion: "admit-request-v1",
        assessment: ready,
      })
      expect(empty.result).toEqual({ type: "error", value: "Admission recording requires direct user message" })
      yield* insert(db, [user("msg_owner", "Do something"), assistant("msg_calling")])
      const clarify = yield* call("maestro", "maestro_record_admission", {
        methodVersion: "admit-request-v1",
        assessment: { ...ready, goal: " " },
      })
      expect(clarify.result).toEqual({ type: "text", value: "CLARIFY: missing-usable-goal" })
    }),
  ))

test("the plan step checks admission, then holds on the Atlas source V2 cannot read", () =>
  run(
    Effect.gen(function* () {
      const db = yield* setup
      const location = yield* Location.Service
      yield* insert(db, [user("msg_owner", "Add CSV export"), assistant("msg_calling")])
      const field = (value: string) => ({ value, source: "stakeholder" })
      const plan = {
        admissionMessageID: "msg_owner",
        methodVersion: "plan-v1",
        goal: field("CSV export"),
        acceptance: [field("A CSV downloads")],
        scope: [field("reports")],
        units: ["reports/export"],
        constraints: [],
        reviewRequirement: field("cold review"),
        assumptions: [],
        risks: [],
      }
      const early = yield* call("maestro", "maestro_record_plan_revision", plan)
      expect(String(early.result.value)).toStartWith("MaestroPlanRevisionConflict: admission message msg_owner")
      yield* call("maestro", "maestro_record_admission", { methodVersion: "admit-request-v1", assessment: ready })
      const held = yield* call("maestro", "maestro_record_plan_revision", plan)
      expect(String(held.result.value)).toStartWith(`provider-unconfigured: ${location.project.id}.`)
      expect(String(held.result.value)).toContain("Atlas is not configured")
      // A workflow plan without upstream holds before anything else and says how to author it.
      const unattributed = yield* call("maestro", "maestro_record_plan_revision", {
        ...plan,
        workflow: { documentID: "wf_1", parameters: {}, writePaths: ["src"] },
      })
      expect(String(unattributed.result.value)).toStartWith("Tool safety HOLD: UPSTREAM_ATTRIBUTION_MISSING")
      expect(String(unattributed.result.value)).toContain("A workflow plan is authored upstream")
      const workflow =yield* call("maestro", "maestro_record_plan_revision", {
        ...plan,
        upstream: {
          parentMessageID: "msg_calling",
          parentCallID: "call_task",
          authorSessionID: "ses_author",
          authorMessageID: "msg_author",
          logicalTaskID: "task_1",
        },
        workflow: { documentID: "wf_1", parameters: {}, writePaths: ["src"] },
      })
      // The workflow plan observes its archie Task before it opens the publication port; an unknown author holds first.
      expect(workflow.result.type).toBe("error")
      expect(String(workflow.result.value)).toStartWith("Tool safety HOLD: UPSTREAM_ATTRIBUTION_MISSING")
      // Nothing durable is recorded by a held step.
      const plans = yield* db
        .select()
        .from(EventTable)
        .where(eq(EventTable.type, EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, 1)))
        .all()
        .pipe(Effect.orDie)
      expect(plans).toEqual([])
      expect(String((yield* call("maestro", "maestro_catalog_context", {})).result.value)).toStartWith(
        "provider-unconfigured:",
      )
      expect(
        String((yield* call("maestro", "maestro_record_context", { planRevisionID: "evt_x" })).result.value),
      ).toStartWith("MaestroContextConflict: plan revision evt_x")
    }),
  ))

const presented = {
  id: "apr_1",
  sessionID,
  assistantMessageID: "msg_presenting",
  callID: "call_present",
  planRevisionID: "evt_plan",
  validationRecordID: "evt_validation",
  projectID: "global",
  memberID: "maestro",
  revisionHash: "a".repeat(64),
  validationHash: "b".repeat(64),
  contextHash: "c".repeat(64),
  policyHash: "d".repeat(64),
  taskHash: "e".repeat(64),
  intent: { subagentType: "backend", prompt: "Implement CSV export" },
  methodVersion: "approval-v1",
  plan: "CSV export",
  provenance: "admission msg_owner",
  assumptions: [],
  validationLedger: "tests: PASS (green)",
  contextState: "CURRENT" as const,
}

const presentation = (rendered: string) =>
  assistant("msg_presenting", [
    {
      type: "tool",
      id: "call_present",
      name: "maestro_present_approval",
      state: { status: "completed", input: {}, content: [{ type: "text", text: rendered }], structured: {} },
      time,
    },
  ])

const rendered = renderPresentation({
  ...presented,
  actor: { projectId: presented.projectID, sessionId: sessionID, memberId: "maestro" },
})

test("approval records the owner's immediate exact reply to the visible presentation once", () =>
  run(
    Effect.gen(function* () {
      const db = yield* setup
      const events = yield* EventV2.Service
      const location = yield* Location.Service
      const visible = { ...presented, projectID: location.project.id }
      const shown = renderPresentation({
        ...visible,
        actor: { projectId: location.project.id, sessionId: sessionID, memberId: "maestro" },
      })
      yield* events.publish(MaestroEvent.Approval.Presented, visible)
      yield* insert(db, [
        user("msg_owner", "Add CSV export"),
        presentation(shown),
        user("msg_reply", "aprovo"),
        assistant("msg_calling"),
      ])
      const approved = yield* call("maestro", "maestro_record_approval", {})
      expect(approved.output?.structured).toMatchObject({ status: "APPROVED", approvalMessageID: "msg_reply" })
      expect(String(approved.result.value)).toContain(
        'Bindings: {"approvalMessageID":"msg_reply","planRevisionID":"evt_plan"}',
      )
      yield* call("maestro", "maestro_record_approval", {})
      const decided = yield* db
        .select()
        .from(EventTable)
        .where(eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1)))
        .all()
        .pipe(Effect.orDie)
      expect(decided).toHaveLength(1)
      expect(decided[0]?.data).toMatchObject({
        approvalMessageID: "msg_reply",
        outcome: "APPROVED",
        presentationMessageID: "msg_presenting",
      })
    }),
  ))

test("approval holds when the reply is not immediate or the presentation is no longer shown", () =>
  run(
    Effect.gen(function* () {
      const db = yield* setup
      const events = yield* EventV2.Service
      yield* events.publish(MaestroEvent.Approval.Presented, presented)
      // The presentation message shows other text than the rendering the event binds.
      yield* insert(db, [presentation(`${rendered}\nedited`), user("msg_reply", "approve"), assistant("msg_calling")])
      const stale = yield* call("maestro", "maestro_record_approval", {})
      expect(stale.output?.structured).toMatchObject({ status: "HOLD", approvalMessageID: "" })
      expect(String(stale.result.value)).toStartWith("HOLD: presentation-message-mismatch.")
      yield* db.delete(SessionMessageTable).run().pipe(Effect.orDie)
      yield* insert(db, [
        presentation(rendered),
        user("msg_aside", "one more thing"),
        user("msg_reply", "approve"),
        assistant("msg_calling"),
      ])
      expect(String((yield* call("maestro", "maestro_record_approval", {})).result.value)).toStartWith(
        "HOLD: reply-not-immediate.",
      )
      const decided = yield* db
        .select()
        .from(EventTable)
        .where(eq(EventTable.type, EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1)))
        .all()
        .pipe(Effect.orDie)
      expect(decided).toEqual([])
    }),
  ))

test("chain steps without their evidence refuse with the legacy reasons and record nothing", () =>
  run(
    Effect.gen(function* () {
      yield* setup
      const check = { id: "tests", status: "PASS", detail: "green" }
      const cases: ReadonlyArray<readonly [string, string, unknown, string]> = [
        [
          "maestro",
          "maestro_present_approval",
          {
            planRevisionID: presented.planRevisionID,
            validationRecordID: presented.validationRecordID,
            revisionHash: presented.revisionHash,
            validationHash: presented.validationHash,
            contextHash: presented.contextHash,
            policyHash: presented.policyHash,
            intent: presented.intent,
            methodVersion: presented.methodVersion,
            plan: presented.plan,
            provenance: presented.provenance,
            assumptions: [],
            validationLedger: presented.validationLedger,
            contextState: "CURRENT",
          },
          "Approval presentation evidence not found",
        ],
        [
          "maestro",
          "maestro_grant_authorization",
          { validationRecordID: "evt_v", approvalMessageID: "msg_reply" },
          "MaestroAuthorizationRejected: validation-not-found.",
        ],
        [
          "maestro",
          "maestro_record_validation",
          {
            planRevisionID: "evt_plan",
            contextRecordID: "evt_context",
            contextHash: "c",
            projectID: "global",
            workCardID: "card",
            workCard: "card",
            routedMemberID: "backend",
            validatorVersion: "v1",
            checks: [check],
          },
          "Validation rejected workCard:",
        ],
        [
          "maestro",
          "maestro_request_review",
          { validationRecordID: "evt_v", workCard: "card", reviewMethodVersion: "v1" },
          "Review delegation validation mismatch:",
        ],
        ["lucy", "maestro_record_review", reviewInput, "Review recording requires a lucy child session"],
        [
          "maestro",
          "maestro_record_result_decision",
          { parentSessionID: "ses_parent", messageID: "msg_task", partID: "prt_task", decision: "accepted" },
          "HOLD work-result-unavailable:",
        ],
      ]
      for (const [agent, name, input, expected] of cases) {
        const result = yield* call(agent, name, input)
        expect(result.result.type).toBe("error")
        expect(String(result.result.value)).toStartWith(expected)
      }
      const database = yield* Database.Service
      expect(
        yield* database.db.select().from(EventTable).where(like(EventTable.type, "maestro.%")).all().pipe(Effect.orDie),
      ).toEqual([])
    }),
  ))

test("the workflow catalog reads the calling Location's own Relay publication and lists what can run", () =>
  run(
    Effect.gen(function* () {
      yield* setup
      const location = yield* Location.Service
      const listed = yield* call("maestro", "maestro_workflows", {})
      expect(listed.result).toEqual({ type: "text", value: JSON.stringify({ projectID: location.project.id, workflows: [] }) })
      // A query names what it resolved, so an unknown id is an empty match, not an error.
      const queried = yield* call("maestro", "maestro_workflows", { workflow: "wf_missing" })
      expect(JSON.parse(String(queried.result.value))).toEqual({ projectID: location.project.id, workflows: [], unavailable: [] })
    }),
  ))

test("only the upstream seat drafts a workflow, and never into the global project", () =>
  run(
    Effect.gen(function* () {
      yield* setup
      const sprint = JSON.stringify({ brief: "b", work_packages: [] })
      const registry = yield* ToolRegistry.Service
      // Visibility already hides the tool from Maestro; with every rule allowed, its own gate still refuses.
      const unhidden = yield* (yield* registry.materialize(allow)).settle({
        sessionID,
        agent: AgentV2.ID.make("maestro"),
        assistantMessageID: SessionMessage.ID.make("msg_calling"),
        call: { type: "tool-call", id: "call", name: "archie_draft_workflow", input: { name: "Notes", sprint } },
      })
      expect(unhidden.result).toEqual({
        type: "error",
        value: "Drafting a workflow requires the upstream seat",
      })
      // The test Location sits outside git, so its project is the global one every such folder shares.
      expect((yield* call("archie", "archie_draft_workflow", { name: "Notes", sprint })).result).toEqual({
        type: "error",
        value: "Workflows need a git repository; this folder is not one.",
      })
    }),
  ))
