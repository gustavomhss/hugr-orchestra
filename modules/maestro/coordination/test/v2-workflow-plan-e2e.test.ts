import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { DateTime, Effect, Layer, Schema, type Scope } from "effect"
import { publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@orchestra/atlas-boundary/materialize"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { Project } from "@orchestra/core/project"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionMessageTable } from "@orchestra/core/session/sql"
import { SkillV2 } from "@orchestra/core/skill"
import { TaskTool } from "@orchestra/core/tool/task"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { nativeProfiles } from "../src/roster"
import { UpstreamResult } from "../src/upstream-result"
import { LogicalTaskV2 } from "../src/v2/governance/logical-task"
import { MaestroSeatsV2 } from "../src/v2/seats"
import { MaestroToolsV2 } from "../src/v2/tools"
import { session, worktree } from "./fixture/v2-governance"

// End to end through the planning tool: a Location whose Atlas Own source is configured and verified, a Maestro that
// dispatched one archie Task whose settled card attributes the proposal, and maestro_record_plan_revision recording the
// upstream-authored revision as v3, grounded in the verified source.

const projectID = Project.ID.global
const units = ["packages/alpha/shared", "packages/beta/shared"]
const sources = ["src/alpha.ts", "src/beta.ts"]

const temporary = (prefix: string) =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), prefix))),
    (directory) => Effect.promise(() => fs.rm(directory, { recursive: true, force: true })),
  )

const layer = (directory: string) =>
  AppNodeBuilder.build(
    LayerNode.group([
      MaestroToolsV2.node,
      ToolRegistry.node,
      Database.node,
      EventV2.node,
      AgentV2.node,
      SessionStore.node,
      GitCli.node,
    ]),
    [
      [Database.node, Database.layerFromPath(":memory:")],
      [Global.node, Layer.unwrap(temporary("maestro-plan-e2e-data-").pipe(Effect.map((data) => Global.layerWith({ data }))))],
      [
        Location.node,
        Layer.succeed(
          Location.Service,
          Location.Service.of({
            directory: AbsolutePath.make(directory),
            project: { id: projectID, directory: AbsolutePath.make(directory) },
          }),
        ),
      ],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      [
        Config.node,
        Layer.mock(Config.Service, {
          entries: () =>
            Effect.succeed([
              new Config.Document({
                type: "document",
                info: new Config.Info({ maestro: { atlas: { projectID, directory: "." } } }),
              }),
            ]),
        }),
      ],
      [SkillV2.node, Layer.mock(SkillV2.Service, { list: () => Effect.succeed([]) })],
    ],
  )

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof layer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(layer(directory)))
      }),
    ),
  )

// A committed source tree and the verified Own catalog, snapshot and materialized skills Atlas reads beside it.
const atlas = (directory: string) =>
  Effect.gen(function* () {
    const cli = yield* GitCli.Service
    const git = (args: string[]) =>
      cli
        .run(["-c", "user.email=atlas@example.com", "-c", "user.name=Atlas", "-c", "commit.gpgsign=false", ...args], {
          cwd: directory,
        })
        .pipe(Effect.map((result) => result.text().trim()))
    yield* Effect.promise(async () => {
      await fs.mkdir(path.join(directory, "src"), { recursive: true })
      await fs.writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 1\n")
      await fs.writeFile(path.join(directory, "src/beta.ts"), "export const beta = 2\n")
    })
    yield* git(["init", "-q"])
    yield* git(["add", "src"])
    yield* git(["commit", "-q", "-m", "source fixture"])
    const revision = yield* git(["rev-parse", "HEAD"])
    const blobs = (yield* git(["hash-object", "--no-filters", "--", ...sources])).split(/\r?\n/)
    const snapshot = parseOwnSnapshot(
      JSON.stringify({
        schemaVersion: 1,
        snapshot: "genesis-fixture",
        sourceRevision: revision,
        units: units.map((unit, index) => ({
          unit: { level: "module", id: unit, grounding: null },
          sourceBlobs: { [sources[index]]: blobs[index] },
          pack: {
            unit: `${unit} owns bounded behavior.`,
            invariants: [{ nodeId: `${unit}:contract`, tier: "T1", claim: `${unit} stays deterministic.`, freshness: "FRESH" }],
            shape: { contents: [sources[index]], owner: "atlas", tier: "T1" },
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
    if (!snapshot) return yield* Effect.die("canonical fixture refused")
    const output = materializeStaticOwnSnapshot(snapshot)
    yield* Effect.promise(() =>
      Promise.all(
        [
          {
            path: "TERRITORY-CATALOG.json",
            content: JSON.stringify(
              publishTerritoryCatalog(projectID, [{ name: "backend", owner: "backend", tier: "T1", globs: ["src/**"] }]),
            ),
          },
          { path: "OWN-SNAPSHOT.json", content: JSON.stringify(snapshot) },
          ...output.skills,
          output.coverage,
        ].map(async (file) => {
          await fs.mkdir(path.dirname(path.join(directory, file.path)), { recursive: true })
          await fs.writeFile(path.join(directory, file.path), file.content)
        }),
      ),
    )
  })

const model = { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
const time = { created: DateTime.makeUnsafe(1_700_000_000_000), completed: DateTime.makeUnsafe(1_700_000_000_001) }
const terminal = [
  "Proposal ready.",
  "",
  "```upstream-result",
  JSON.stringify({ outcome: "done", artifacts: [{ kind: "plan", path: "docs/plan.md" }], blockers: [], risks: [], nextActions: [] }),
  "```",
  "",
].join("\n")

/**
 * The owner's request in a Maestro Session, the Maestro's completed native Task call to archie, the archie reply that
 * call's prompt received, the child's retained logical Task, and the Maestro assistant that records the plan.
 */
const dispatched = (directory: string) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const agents = yield* AgentV2.Service
    yield* agents.transform((draft) =>
      ["maestro", "archie"].forEach((id) => draft.update(AgentV2.ID.make(id), () => {})),
    )
    const parent = yield* session({ directory, agent: "maestro" })
    const child = yield* session({ directory, agent: "archie", parentID: parent })
    const binding = yield* LogicalTaskV2.ensure(
      { db: database.db, events: yield* EventV2.Service, store: yield* SessionStore.Service, canonical: (id) => id },
      { executionSessionID: child, authoritySessionID: parent, projectID, memberID: "archie", source: "host" },
    )
    const dispatch = SessionMessage.ID.make("msg_dispatch")
    const tool = {
      type: "tool" as const,
      id: "call_task",
      name: TaskTool.name,
      time,
      state: {
        status: "completed" as const,
        input: { subagent_type: "archie", description: "plan", prompt: "plan it" },
        content: [],
        structured: Schema.encodeSync(TaskTool.Output)({
          sessionID: child,
          agent: AgentV2.ID.make("archie"),
          text: terminal,
          sessionId: child,
          parentSessionId: parent,
          agentId: AgentV2.ID.make("archie"),
          structured: { upstreamResult: UpstreamResult.parse(terminal) },
        }),
      },
    }
    const rows: [SessionSchema.ID, SessionMessage.Message][] = [
      [parent, SessionMessage.User.make({ id: SessionMessage.ID.make("msg_owner"), type: "user", text: "Add CSV export", time })],
      [
        parent,
        SessionMessage.Assistant.make({ id: dispatch, type: "assistant", agent: "maestro", model, finish: "tool-calls", time, content: [tool] }),
      ],
      [
        child,
        SessionMessage.User.make({
          id: TaskTool.taskPromptID(
            { sessionID: parent, agent: AgentV2.defaultID, assistantMessageID: dispatch, toolCallID: "call_task" },
            child,
          ),
          type: "user",
          text: "plan it",
          time,
        }),
      ],
      [
        child,
        SessionMessage.Assistant.make({
          id: SessionMessage.ID.make("msg_author"),
          type: "assistant",
          agent: "archie",
          model,
          finish: "stop",
          time,
          content: [{ type: "text", id: "txt_author", text: terminal }],
        }),
      ],
      [
        parent,
        SessionMessage.Assistant.make({ id: SessionMessage.ID.make("msg_calling"), type: "assistant", agent: "maestro", model, time, content: [] }),
      ],
    ]
    yield* database.db
      .insert(SessionMessageTable)
      .values(
        rows.map((row, index) => ({
          id: row[1].id,
          session_id: row[0],
          type: row[1].type,
          seq: index + 1,
          time_created: DateTime.toEpochMillis(row[1].time.created),
          data: Schema.encodeSync(SessionMessage.Message)(row[1]),
        })),
      )
      .run()
      .pipe(Effect.orDie)
    return {
      parent,
      upstream: {
        parentMessageID: dispatch,
        parentCallID: "call_task",
        authorSessionID: child,
        authorMessageID: "msg_author",
        logicalTaskID: binding.taskId,
      },
    }
  })

const call = (sessionID: SessionSchema.ID, name: string, input: unknown) =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    const materialized = yield* registry.materialize([
      { action: "*", resource: "*", effect: "allow" as const },
      ...MaestroSeatsV2.floor(nativeProfiles.maestro),
      ...MaestroSeatsV2.visibility("maestro"),
    ])
    return yield* materialized.settle({
      sessionID,
      agent: AgentV2.defaultID,
      assistantMessageID: SessionMessage.ID.make("msg_calling"),
      call: { type: "tool-call", id: `call_${name}`, name, input },
    })
  })

const field = (value: string) => ({ value, source: "upstream" })
const plan = {
  admissionMessageID: "msg_owner",
  methodVersion: "plan-v1",
  goal: field("CSV export"),
  acceptance: [field("A CSV downloads")],
  scope: [field("backend")],
  units: [units[0]],
  constraints: [],
  reviewRequirement: field("cold review"),
  assumptions: [],
  risks: [],
}

test("an archie-authored plan records a grounded v3 revision through planning, and a workflow plan then reaches its publication", () =>
  run((directory) =>
    Effect.gen(function* () {
      yield* atlas(directory)
      const seeded = yield* dispatched(directory)
      const admitted = yield* call(seeded.parent, "maestro_record_admission", {
        methodVersion: "admit-request-v1",
        assessment: {
          kind: "work",
          goal: "Ship the export button",
          known: [{ text: "The owner wants CSV export", source: "stakeholder" }],
          proposals: [],
          unknowns: [],
          uncertainty: "low",
          activeWorkEffect: "none",
          reason: "Goal and scope are clear",
        },
      })
      expect(admitted.result).toEqual({ type: "text", value: "READY_TO_DRAFT: admission message msg_owner" })
      // Upstream fields without the archie Task that authored them hold before anything is read.
      expect(String((yield* call(seeded.parent, "maestro_record_plan_revision", plan)).result.value)).toStartWith(
        "Tool safety HOLD: UPSTREAM_ATTRIBUTION_MISSING",
      )
      const recorded = yield* call(seeded.parent, "maestro_record_plan_revision", { ...plan, upstream: seeded.upstream })
      expect(recorded.result.type).toBe("text")
      expect(String(recorded.result.value)).toStartWith("PROPOSED: evt_maestro_plan_revision_")

      const database = yield* Database.Service
      const rows = yield* database.db
        .select()
        .from(EventTable)
        .where(eq(EventTable.type, EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3)))
        .all()
        .pipe(Effect.orDie)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.aggregate_id).toBe(seeded.parent)
      expect(rows[0]?.data).toMatchObject({
        revision: "v3",
        sessionID: seeded.parent,
        status: "PROPOSED",
        upstreamAttribution: {
          schema: "maestro-upstream-attribution-v1",
          memberID: "archie",
          parentSessionID: seeded.parent,
          parentMessageID: "msg_dispatch",
          authorSessionID: seeded.upstream.authorSessionID,
          authorMessageID: "msg_author",
          logicalTaskID: seeded.upstream.logicalTaskID,
        },
        grounding: { snapshot: "genesis-fixture", units: [units[0]] },
      })
      expect((rows[0]?.data as { grounding: { sourceIdentityHash: string } }).grounding.sourceIdentityHash).toMatch(
        /^[a-f0-9]{64}$/,
      )
      expect(rows[0]?.data).not.toHaveProperty("workflowBinding")
      // An exact retry replays the recorded revision.
      expect((yield* call(seeded.parent, "maestro_record_plan_revision", { ...plan, upstream: seeded.upstream })).result).toEqual(
        recorded.result,
      )

      // With its author attributed, a workflow plan reaches the Location's publication, which has nothing published.
      const workflow = yield* call(seeded.parent, "maestro_record_plan_revision", {
        ...plan,
        upstream: seeded.upstream,
        workflow: { documentID: "wf_unpublished", parameters: {}, writePaths: ["src"] },
      })
      expect(workflow.result.type).toBe("error")
      expect(String(workflow.result.value)).toStartWith("Tool safety HOLD: WORKFLOW_")
      expect(
        yield* database.db
          .select()
          .from(EventTable)
          .where(eq(EventTable.type, EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3)))
          .all()
          .pipe(Effect.orDie),
      ).toHaveLength(1)
    }),
  ))
