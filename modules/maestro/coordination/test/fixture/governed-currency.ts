import { mkdtemp, realpath, mkdir, writeFile, appendFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { DateTime, Deferred, Effect, Layer, Option, Schema } from "effect"
import { publishTerritoryCatalog } from "@orchestra/atlas-boundary"
import { materializeStaticOwnSnapshot, parseOwnSnapshot } from "@orchestra/atlas-boundary/materialize"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { SkillV2 } from "@orchestra/core/skill"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { MaestroGovernanceV2 } from "../../src/v2/governance"
import { GovernanceBackgroundV2 } from "../../src/v2/governance/background"
import { GovernanceEvidenceV2 } from "../../src/v2/governance/evidence"
import { GovernanceRecordsV2 } from "../../src/v2/governance/records"
import { GovernanceReservationV2 } from "../../src/v2/governance/reservation"
import { GovernanceDispatchV2 } from "../../src/v2/governance/dispatch"
import { MaestroSeats } from "../../src/v2/seats-service"
import { MaestroToolsV2 } from "../../src/v2/tools"
import { MaestroApprovalTools } from "../../src/v2/tools/approval"
import { MaestroReviewRecords } from "../../src/v2/tools/review-records"
import { ReviewArtifactsV2 } from "../../src/v2/tools/review-artifacts"

const projectID = Project.ID.make("prj_approval_currency")
const sessionID = SessionSchema.ID.make("ses_approval_currency")
const unit = "packages/alpha/shared"
const prompt = "Implement the CSV export"
const workCard = "## Definition of Done\nA CSV downloads.\n## Invariants\nExisting reports retain their format.\n## Quality Standards\nTyped code.\n## Completeness Criteria\nEvery column exports.\n## Success Criteria\nThe owner downloads a CSV."
const checks = [{ id: "spec", status: "PASS" as const, detail: "docs/export.md committed" }]

const git = Effect.fn("CurrencyFixture.git")(function* (directory: string, args: string[]) {
  const cli = yield* GitCli.Service
  const result = yield* cli.run([
    "-c", "user.email=currency@example.com", "-c", "user.name=Currency", "-c", "commit.gpgsign=false", ...args,
  ], { cwd: directory })
  if (result.exitCode !== 0) return yield* Effect.die(new Error(result.stderr.toString()))
  return result.text().trim()
})

const repository = Effect.fn("CurrencyFixture.repository")(function* (directory: string) {
  yield* Effect.promise(() => mkdir(path.join(directory, "src"), { recursive: true }))
  yield* Effect.promise(() => writeFile(path.join(directory, "src/alpha.ts"), "export const alpha = 1\n"))
  yield* git(directory, ["init", "-q", "-b", "dev"])
  yield* git(directory, ["config", "init.defaultBranch", "dev"])
  yield* git(directory, ["add", "src"])
  yield* git(directory, ["commit", "-q", "-m", "source fixture"])
  const revision = yield* git(directory, ["rev-parse", "HEAD"])
  const blob = yield* git(directory, ["hash-object", "--no-filters", "--", "src/alpha.ts"])
  const snapshot = parseOwnSnapshot(JSON.stringify({
    schemaVersion: 1, snapshot: "currency-fixture", sourceRevision: revision,
    units: [{
      unit: { level: "module", id: unit, grounding: null }, sourceBlobs: { "src/alpha.ts": blob },
      pack: {
        unit: "Alpha owns bounded behavior.",
        invariants: [{ nodeId: `${unit}:contract`, tier: "T1", claim: "Alpha stays deterministic.", freshness: "FRESH" }],
        shape: { contents: ["src/alpha.ts"], owner: "atlas", tier: "T1" }, edges: { dependents: [], dependencies: [] },
        gotchas: [], memory: null,
        drill: { finer: [], refresh: { pull: `poke:${unit}` }, complement: { pull: `relate:${unit}` } },
        grounding: { source: "tree" }, tokenEstimate: 20, manifest: { pointers: [], truncated: false },
        pullReachable: [], advisory: [], advisoryDropped: 0,
      },
    }],
  }))
  if (!snapshot) return yield* Effect.die("verified Own fixture refused")
  const files = materializeStaticOwnSnapshot(snapshot)
  yield* Effect.promise(async () => {
    await writeFile(path.join(directory, "TERRITORY-CATALOG.json"), JSON.stringify(
      publishTerritoryCatalog(projectID, [{ name: "backend", owner: "backend", tier: "T1", globs: ["src/**"] }]),
    ))
    await writeFile(path.join(directory, "OWN-SNAPSHOT.json"), JSON.stringify(snapshot))
    await Promise.all([...files.skills, files.coverage].map(async (file) => {
      await mkdir(path.dirname(path.join(directory, file.path)), { recursive: true })
      await writeFile(path.join(directory, file.path), file.content)
    }))
  })
  yield* git(directory, ["add", "-A"])
  yield* git(directory, ["commit", "-q", "-m", "verified Own artifacts"])
  yield* git(directory, ["checkout", "-q", "-b", "work"])
  yield* Effect.promise(async () => {
    await mkdir(path.join(directory, "docs"))
    await writeFile(path.join(directory, "docs/export.md"), "# Export\n\nThe report downloads as CSV.\n")
  })
  yield* git(directory, ["add", "docs"])
  yield* git(directory, ["commit", "-q", "-m", "spec the export"])
})

const layer = (directory: string, data: string) => AppNodeBuilder.build(
  LayerNode.group([
    MaestroToolsV2.node, MaestroGovernanceV2.node, ToolRegistry.node, Database.node, EventV2.node,
    SessionStore.node, GitCli.node, Config.node, FSUtil.node, SkillV2.node,
  ]),
  [
    [TaskGovernance.node, MaestroGovernanceV2.node],
    [Database.node, Database.layerFromPath(":memory:")],
    [Global.node, Global.layerWith({ data })],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of({
      directory: AbsolutePath.make(directory), project: { id: projectID, directory: AbsolutePath.make(directory) },
    }))],
    [Config.node, Layer.mock(Config.Service, { entries: () => Effect.succeed([
      new Config.Document({ type: "document", info: new Config.Info({ maestro: { atlas: { projectID, directory: "." } } }) }),
    ]) })],
    [SkillV2.node, Layer.mock(SkillV2.Service, { list: () => Effect.succeed([]) })],
    [AgentV2.node, Layer.mock(AgentV2.Service, { get: (id) => Effect.succeed(AgentV2.Info.empty(id)) })],
    [MaestroSeats.node, Layer.succeed(MaestroSeats.Service, MaestroSeats.make(["backend", "lucy"]))],
    [PermissionV2.node, Layer.mock(PermissionV2.Service, { assert: () => Effect.void })],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    [GovernanceBackgroundV2.sessionsNode, Layer.succeed(GovernanceBackgroundV2.Sessions, Option.none())],
  ],
)

const approval = Effect.fn("CurrencyFixture.approval")(function* (directory: string) {
  yield* repository(directory)
  const database = yield* Database.Service
  const registry = yield* ToolRegistry.Service
  const store = yield* SessionStore.Service
  const events = yield* EventV2.Service
  const cli = yield* GitCli.Service
  const config = yield* Config.Service
  const fs = yield* FSUtil.Service
  const skills = yield* SkillV2.Service
  const governance = yield* TaskGovernance.Service
  const services = { db: database.db, store, events, atlas: { config, git: cli, fs, skills }, canonical: (id: string) => id }
  yield* database.db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).run().pipe(Effect.orDie)
  yield* database.db.insert(SessionTable).values({
    id: sessionID, project_id: projectID, directory, version: "test", slug: "currency", title: "currency", agent: "maestro",
  }).run().pipe(Effect.orDie)
  const sequence = { next: 1 }
  const insert = (messages: readonly SessionMessage.Message[]) => database.db.insert(SessionMessageTable).values(
    messages.map((message) => {
      const encoded = Schema.encodeSync(SessionMessage.Message)(message)
      const { id, type, ...data } = encoded
      return {
        id: SessionMessage.ID.make(id), session_id: sessionID, type, seq: sequence.next++,
        time_created: DateTime.toEpochMillis(message.time.created), data,
      }
    }),
  ).run().pipe(Effect.orDie)
  const time = { created: DateTime.makeUnsafe(1_700_000_000_000) }
  const user = (id: string, text: string) => SessionMessage.User.make({ id: SessionMessage.ID.make(id), type: "user", text, time })
  const assistant = (id: string, content: SessionMessage.Assistant["content"] = []) => SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(id), type: "assistant", agent: "maestro", content, time,
    model: { id: ModelV2.ID.make("fixture-model"), providerID: ProviderV2.ID.make("fixture-provider") },
  })
  const call = (name: string, input: unknown, message = "msg_calling", callID = `call_${name}`) => registry.materialize().pipe(
    Effect.flatMap((materialized) => materialized.settle({
      sessionID, agent: AgentV2.ID.make("maestro"), assistantMessageID: SessionMessage.ID.make(message),
      call: { type: "tool-call", id: callID, name, input },
    })),
    Effect.flatMap((settled) => settled.result.type === "error"
      ? Effect.die(new Error(`${name}: ${String(settled.result.value)}`))
      : Effect.succeed(String(settled.result.value))),
  )
  const bindings = (text: string) => Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(
    Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(
      text.split("\n").find((line) => line.startsWith("Bindings: "))?.slice(10) ?? "{}",
    ),
  )
  yield* insert([user("msg_owner", "Add CSV export"), assistant("msg_calling")])
  yield* call("maestro_record_admission", {
    methodVersion: "admit-request-v1", assessment: {
      kind: "work", goal: "Ship the CSV export", known: [{ text: "CSV export requested", source: "stakeholder" }],
      proposals: [], unknowns: [], uncertainty: "low", activeWorkEffect: "none", reason: "Goal and scope are clear",
    },
  })
  yield* call("maestro_catalog_context", {})
  const field = (value: string) => ({ value, source: "stakeholder" })
  const revision = bindings(yield* call("maestro_record_plan_revision", {
    admissionMessageID: "msg_owner", methodVersion: "plan-v1", goal: field("CSV export"),
    acceptance: [field("A CSV downloads")], scope: [field("backend")], units: [unit], constraints: [],
    reviewRequirement: field("cold review"), assumptions: [], risks: [],
  }))
  const contextBinding = bindings(yield* call("maestro_record_context", { planRevisionID: revision.planRevisionID }))
  const validated = bindings(yield* call("maestro_record_validation", {
    planRevisionID: revision.planRevisionID, contextRecordID: contextBinding.contextRecordID,
    contextHash: contextBinding.contextHash, projectID, workCardID: "card_currency", workCard,
    routedMemberID: "backend", validatorVersion: "validator-v1", checks,
  }))
  const validation = yield* GovernanceRecordsV2.readValidation(database.db, validated.validationRecordID)
  const context = yield* GovernanceRecordsV2.readContext(database.db, contextBinding.contextRecordID)
  if (!validation || !context || context.mode !== "GROUNDED" || !("reviewBaseSHA" in validation))
    return yield* Effect.die("real grounded evidence records missing")
  const artifact = yield* ReviewArtifactsV2.planArtifact(cli, directory, validation.reviewBaseSHA, context.headSHA)
  // Deterministic assessment only. Artifact verification, evidence bindings and durable review producer are real.
  yield* MaestroReviewRecords.recordReview(services, {
    sessionID, validationRecordID: validation.id, workCard, reviewMethodVersion: "review-v1", stage: "plan",
    verdict: "APPROVE", findings: [], checks, artifact: { ...artifact, worktree: directory },
  })
  const presented = yield* call("maestro_present_approval", {
    planRevisionID: revision.planRevisionID, validationRecordID: validation.id,
    revisionHash: revision.revisionHash, validationHash: validated.validationHash,
    contextHash: context.contextHash, contextRecordID: context.id, policyHash: validated.policyHash,
    intent: { subagentType: "backend", prompt }, methodVersion: "present-v1", plan: "CSV export",
    provenance: "admission msg_owner", assumptions: [], validationLedger: "spec: PASS (docs/export.md committed)",
    contextState: "CURRENT",
  }, "msg_presenting", "call_present")
  yield* insert([
    assistant("msg_presenting", [{
      type: "tool", id: "call_present", name: "maestro_present_approval", time,
      state: { status: "completed", input: {}, content: [{ type: "text", text: presented }], structured: {} },
    }]),
    user("msg_reply", "aprovo"), assistant("msg_after"),
  ])
  yield* call("maestro_record_approval", {}, "msg_after")
  const approved = yield* MaestroApprovalTools.recordApproval(services, sessionID)
  if (approved.status !== "APPROVED") return yield* Effect.die("visible real approval was not recorded")
  const authorizationID = yield* call("maestro_grant_authorization", {
    validationRecordID: validation.id, approvalMessageID: approved.decision.approvalMessageID,
  }, "msg_after")
  if (!authorizationID.startsWith("evt_")) return yield* Effect.die("real authorization was not recorded")
  const decision = approved.decision
  const governed = {
    sessionID, projectID, memberID: "maestro", approvalMessageID: decision.approvalMessageID,
    planRevisionID: decision.planRevisionID, revisionHash: decision.revisionHash,
    validationRecordID: decision.validationRecordID, validationHash: decision.validationHash,
    contextHash: decision.contextHash, policyHash: decision.policyHash, taskHash: decision.taskHash,
  }
  const reserve = () => GovernanceReservationV2.reserve(services, {
    governed, subagentType: "backend", prompt, sessionID, projectID, caller: "maestro", callID: "call_task",
    target: "backend", permission: [],
  })
  const child = (id: SessionSchema.ID) => database.db.insert(SessionTable).values({
    id, project_id: projectID, directory, parent_id: sessionID, version: "test", slug: "reserved", title: "reserved",
    agent: "backend", permission: [],
  }).onConflictDoNothing().run().pipe(Effect.orDie)
  return {
    directory, services, sessionID, context, validation, governed, approved, reserve, child,
    git: (args: string[]) => git(directory, args),
    current: () => GovernanceEvidenceV2.current(cli, directory),
    isCurrent: () => GovernanceEvidenceV2.contextIsCurrent(services, context),
    consume: (id: string) => GovernanceReservationV2.consume(services, id),
    publicationCollision: () => Effect.gen(function* () {
      const bothArrived = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const arrivals = { count: 0 }
      const publish: EventV2.Interface["publish"] = (definition, data, options) => {
        if (definition.type !== MaestroEvent.Approval.ConsumedV2.type) return events.publish(definition, data, options)
        return Effect.gen(function* () {
          arrivals.count++
          if (arrivals.count === 2) yield* Deferred.succeed(bothArrived, undefined)
          yield* Deferred.await(release)
          return yield* events.publish(definition, data, options)
        })
      }
      return {
        arrivals: () => arrivals.count,
        bothArrived: Deferred.await(bothArrived),
        release: Deferred.succeed(release, undefined),
        consume: (id: string) => GovernanceReservationV2.consume({ ...services, events: { ...events, publish } }, id),
      }
    }),
    beforeTurn: (id: SessionSchema.ID) => store.get(id).pipe(Effect.flatMap((session) =>
      session ? governance.beforeTurn(session) : Effect.die("reserved child missing"),
    )),
    rows: () => database.db.select().from(EventV2.EventTable).all().pipe(Effect.orDie),
    dispatch: () => GovernanceDispatchV2.reserve(services, { sessionID, authorizationID, permission: [] }),
  }
})

export type CurrencyFixture = Effect.Success<ReturnType<typeof approval>>

export function withApproval<A, E>(use: (fixture: CurrencyFixture) => Effect.Effect<A, E>) {
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const base = yield* Effect.acquireRelease(
      Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "maestro-currency-")))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
    )
    const directory = path.join(base, "repository")
    yield* Effect.promise(() => Promise.all([mkdir(directory), mkdir(path.join(base, "state"))]))
    return yield* approval(directory).pipe(Effect.flatMap(use), Effect.provide(layer(directory, path.join(base, "state"))))
  })))
}

export type Mutation = "tracked" | "untracked" | "head" | "grounding"
export const mutate = Effect.fn("CurrencyFixture.mutate")(function* (fixture: CurrencyFixture, kind: Mutation) {
  if (kind === "tracked") return yield* Effect.promise(() => appendFile(path.join(fixture.directory, "docs/export.md"), "changed\n"))
  if (kind === "untracked") return yield* Effect.promise(() => writeFile(path.join(fixture.directory, "stray.txt"), "untracked\n"))
  if (kind === "head") return yield* fixture.git(["commit", "--allow-empty", "-q", "-m", "advance HEAD"])
  const file = fixture.context.toolPlan?.actions.at(0)?.path
  if (!file) return yield* Effect.die("grounded context has no actual skill")
  // Hide only this tracked skill from Git's diff; the GROUNDED reader must still read and reject its changed bytes.
  yield* fixture.git(["update-index", "--assume-unchanged", file])
  yield* Effect.promise(() => appendFile(path.join(fixture.directory, file), "\nChanged grounded content.\n"))
})

export const memoryOnly = (fixture: CurrencyFixture) => Effect.promise(async () => {
  await mkdir(path.join(fixture.directory, ".atlas"), { recursive: true })
  await appendFile(path.join(fixture.directory, ".atlas/memory.jsonl"), '{"note":"append-only memory"}\n')
})

export const removeContext = (fixture: CurrencyFixture) => fixture.services.db.delete(EventV2.EventTable)
  .where(eq(EventV2.EventTable.id, EventV2.ID.make(fixture.context.id))).run().pipe(Effect.orDie)

export const reservationType = EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2)
export const consumedType = EventV2.versionedType(MaestroEvent.Approval.ConsumedV2.type, 2)
