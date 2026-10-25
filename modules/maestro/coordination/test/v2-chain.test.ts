import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { like } from "drizzle-orm"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
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
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import type { SessionV2 } from "@orchestra/core/session"
import type { SessionExecution } from "@orchestra/core/session/execution"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { SkillV2 } from "@orchestra/core/skill"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { GovernanceBackgroundV2 } from "../src/v2/governance/background"
import { MaestroSeats } from "../src/v2/seats-service"
import { MaestroToolsV2 } from "../src/v2/tools"
import { MaestroReviewTools } from "../src/v2/tools/review"

// The V2 governed chain end to end on a real verified Own fixture: admission, catalog, plan, context, validation, the
// cold review in a `lucy` child Session, presentation, the owner's approval and the authorization grant, each step
// writing the event V1 writes; refusals and a dirty-tree mutation probe record nothing new.

const projectID = Project.ID.make("prj_maestro_chain")
const sessionID = SessionSchema.ID.make("ses_maestro_chain")
const units = ["packages/alpha/shared", "packages/beta/shared"]
const sources = ["src/alpha.ts", "src/beta.ts"]

const runGit = (directory: string, args: string[]) =>
  Effect.gen(function* () {
    const cli = yield* GitCli.Service
    const result = yield* cli.run(
      ["-c", "user.email=chain@example.com", "-c", "user.name=Chain", "-c", "commit.gpgsign=false", ...args],
      { cwd: directory },
    )
    if (result.exitCode !== 0) return yield* Effect.die(new Error(`git ${args.join(" ")}: ${result.stderr.toString()}`))
    return result.text().trim()
  }).pipe(Effect.provide(AppNodeBuilder.build(GitCli.node) as Layer.Layer<GitCli.Service>))

// A main branch with the verified Own artifacts committed, and a work branch one commit ahead, so the review artifact
// has a nonempty committed delta and the tree is clean.
async function fixture() {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "maestro-chain-v2-")))
  const git = (args: string[]) => Effect.runPromise(runGit(directory, args))
  await fs.mkdir(path.join(directory, "src"), { recursive: true })
  await fs.writeFile(path.join(directory, sources[0]), "export const alpha = 1\n")
  await fs.writeFile(path.join(directory, sources[1]), "export const beta = 2\n")
  await git(["init", "-q", "-b", "main"])
  await git(["add", "src"])
  await git(["commit", "-q", "-m", "source fixture"])
  const revision = await git(["rev-parse", "HEAD"])
  const blobs = (await git(["hash-object", "--no-filters", "--", ...sources])).split(/\r?\n/)
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
          invariants: [
            { nodeId: `${unit}:contract`, tier: "T1", claim: `${unit} stays deterministic.`, freshness: "FRESH" },
          ],
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
  await git(["add", "-A"])
  await git(["commit", "-q", "-m", "own artifacts"])
  await git(["checkout", "-q", "-b", "work"])
  await fs.mkdir(path.join(directory, "docs"), { recursive: true })
  await fs.writeFile(path.join(directory, "docs/export.md"), "# CSV export\n\nThe report downloads as CSV.\n")
  await git(["add", "docs"])
  await git(["commit", "-q", "-m", "spec the export"])
  return AbsolutePath.make(directory)
}

const directory = await fixture()

// The cold reviewer's child Session: request_review creates and prompts it, and the drain runs its one receipt call.
const child = {
  create: (_input: { readonly id: SessionSchema.ID; readonly parentID: SessionSchema.ID }) => Effect.void,
  resume: (_sessionID: SessionSchema.ID) => Effect.void,
  prompts: [] as string[],
  reviews: [] as { readonly type: string; readonly text: string }[],
}

const sessions = {
  create: (input: { readonly id: SessionSchema.ID; readonly parentID: SessionSchema.ID }) =>
    Effect.suspend(() => child.create(input)).pipe(Effect.as({ id: input.id })),
  prompt: (input: { readonly prompt: { readonly text: string } }) =>
    Effect.sync(() => child.prompts.push(input.prompt.text)),
  messages: () => Effect.succeed([]),
} as unknown as SessionV2.Interface

const execution = {
  resume: (id: SessionSchema.ID) => Effect.suspend(() => child.resume(id)),
} as unknown as SessionExecution.Interface

const host = AppNodeBuilder.build(
  LayerNode.group([MaestroToolsV2.node, ToolRegistry.node, Database.node, EventV2.node]),
  [
    [Database.node, Database.layerFromPath(":memory:")],
    [
      Global.node,
      Layer.unwrap(
        Effect.acquireRelease(
          Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "maestro-chain-data-"))),
          (data) => Effect.promise(() => fs.rm(data, { recursive: true, force: true })),
        ).pipe(Effect.map((data) => Global.layerWith({ data }))),
      ),
    ],
    [
      Location.node,
      Layer.succeed(Location.Service, Location.Service.of({ directory, project: { id: projectID, directory } })),
    ],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    [
      PermissionV2.node,
      Layer.succeed(
        PermissionV2.Service,
        PermissionV2.Service.of({
          evaluate: () => Effect.die("unused"),
          authorize: () => Effect.die("unused"),
          askExplicit: () => Effect.die("unused"),
          assert: () => Effect.void,
          ask: () => Effect.die("unused"),
          reply: () => Effect.die("unused"),
          get: () => Effect.die("unused"),
          forSession: () => Effect.die("unused"),
          list: () => Effect.die("unused"),
        }),
      ),
    ],
    [SkillV2.node, Layer.mock(SkillV2.Service, { list: () => Effect.succeed([]) })],
    [MaestroSeats.node, Layer.succeed(MaestroSeats.Service, MaestroSeats.make(["backend", "archie", "lucy"]))],
    [
      AgentV2.node,
      Layer.mock(AgentV2.Service, {
        get: (id) =>
          Effect.succeed(["maestro", "backend", "archie", "lucy"].includes(id) ? AgentV2.Info.empty(id) : undefined),
      }),
    ],
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
    [
      GovernanceBackgroundV2.sessionsNode,
      Layer.succeed(GovernanceBackgroundV2.Sessions, Option.some(sessions)),
    ],
    [MaestroReviewTools.executionNode, Layer.succeed(MaestroReviewTools.Execution, Option.some(execution))],
  ],
) as Layer.Layer<ToolRegistry.Service | Database.Service>

const time = { created: DateTime.makeUnsafe(1_700_000_000_000) }
const model = { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
const encode = Schema.encodeSync(SessionMessage.Message)
const user = (id: string, text: string) =>
  SessionMessage.User.make({ id: SessionMessage.ID.make(id), type: "user", text, time })
const assistant = (id: string, content: SessionMessage.Assistant["content"] = []) =>
  SessionMessage.Assistant.make({ id: SessionMessage.ID.make(id), type: "assistant", agent: "maestro", model, content, time })

const field = (value: string) => ({ value, source: "stakeholder" })
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
const workCard = [
  "## Definition of Done",
  "The report downloads as CSV.",
  "## Invariants",
  "Existing reports keep their format.",
  "## Quality Standards",
  "Typed, no new dependencies.",
  "## Completeness Criteria",
  "Every report column is exported.",
  "## Success Criteria",
  "The owner downloads a CSV.",
].join("\n")
const checks = [{ id: "spec", status: "PASS", detail: "docs/export.md committed" }]

const bindings = (text: string) =>
  JSON.parse(
    text
      .split("\n")
      .find((line) => line.startsWith("Bindings: "))
      ?.slice("Bindings: ".length) ?? "{}",
  ) as Record<string, string>

// Each JSON block is one line of the prompt; the diff before `checks JSON` ends in its own newline.
const promptJSON = (text: string, label: string) =>
  JSON.parse(
    text
      .split("\n")
      .find((part) => part.startsWith(`${label} JSON: `))
      ?.slice(`${label} JSON: `.length) ?? "null",
  )

test("the governed chain records V1's events end to end, refuses out of order and on a dirty tree", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const database = yield* Database.Service
      const registry = yield* ToolRegistry.Service
      const db = database.db
      const call = (
        agent: string,
        name: string,
        input: unknown,
        options: { readonly session?: SessionSchema.ID; readonly message?: string; readonly callID?: string } = {},
      ) =>
        registry.materialize().pipe(
          Effect.flatMap((materialized) =>
            materialized.settle({
              sessionID: options.session ?? sessionID,
              agent: AgentV2.ID.make(agent),
              assistantMessageID: SessionMessage.ID.make(options.message ?? "msg_calling"),
              call: { type: "tool-call", id: options.callID ?? `call_${name}`, name, input },
            }),
          ),
          Effect.map((settled) => ({ type: settled.result.type, text: String(settled.result.value) })),
        )
      const seq = { next: 1 }
      const insert = (messages: readonly SessionMessage.Message[]) =>
        db
          .insert(SessionMessageTable)
          .values(
            messages.map((message) => {
              const { id, type, ...data } = encode(message)
              return {
                id: SessionMessage.ID.make(id),
                session_id: sessionID,
                type,
                seq: seq.next++,
                time_created: DateTime.toEpochMillis(message.time.created),
                data,
              }
            }),
          )
          .run()
          .pipe(Effect.orDie)
      const maestroEvents = () =>
        db
          .select()
          .from(EventTable)
          .where(like(EventTable.type, "maestro.%"))
          .all()
          .pipe(
            Effect.orDie,
            Effect.map((rows) => rows.map((row) => row.type)),
          )
      const session = {
        project_id: projectID,
        directory,
        version: "test",
      }
      yield* db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).run().pipe(Effect.orDie)
      yield* db
        .insert(SessionTable)
        .values({ ...session, id: sessionID, slug: "chain", title: "chain", agent: AgentV2.defaultID })
        .run()
        .pipe(Effect.orDie)
      child.create = (input) =>
        db
          .insert(SessionTable)
          .values({ ...session, id: input.id, parent_id: input.parentID, slug: "lucy", title: "lucy", agent: "lucy" })
          .onConflictDoNothing()
          .run()
          .pipe(Effect.orDie, Effect.asVoid)
      // The drain runs the cold reviewer's one receipt call with the exact evidence its prompt carries.
      child.resume = (id) =>
        Effect.gen(function* () {
          const prompt = child.prompts.at(-1) ?? ""
          const review = yield* call(
            "lucy",
            "maestro_record_review",
            {
              validationRecordID: /validationRecordID: (\S+)/.exec(prompt)?.[1],
              workCard,
              reviewMethodVersion: "review-v1",
              verdict: "APPROVE",
              findings: [],
              artifact: promptJSON(prompt, "artifact"),
              checks: promptJSON(prompt, "checks"),
              stage: "plan",
            },
            { session: id, message: "msg_lucy" },
          )
          child.reviews.push(review)
        }).pipe(Effect.orDie)

      yield* insert([user("msg_owner", "Add CSV export"), assistant("msg_calling")])
      const admission = yield* call("maestro", "maestro_record_admission", {
        methodVersion: "admit-request-v1",
        assessment: {
          kind: "work",
          goal: "Ship the CSV export",
          known: [{ text: "The owner wants CSV export", source: "stakeholder" }],
          proposals: [],
          unknowns: [],
          uncertainty: "low",
          activeWorkEffect: "none",
          reason: "Goal and scope are clear",
        },
      })
      expect(admission.type).toBe("text")

      const catalog = yield* call("maestro", "maestro_catalog_context", {})
      expect(catalog.type).toBe("text")
      expect(catalog.text).toContain(units[0])

      // Out of order: no context before the plan, and a plan on an unknown admission.
      expect((yield* call("maestro", "maestro_record_context", { planRevisionID: "evt_missing" })).text).toStartWith(
        "MaestroContextConflict: plan revision evt_missing",
      )
      expect(
        (yield* call("maestro", "maestro_record_plan_revision", { ...plan, admissionMessageID: "msg_other" })).text,
      ).toStartWith("MaestroPlanRevisionConflict: admission message msg_other")

      const planned = yield* call("maestro", "maestro_record_plan_revision", plan)
      expect(planned.text).toStartWith("PROPOSED: evt_maestro_plan_revision_")
      const revision = bindings(planned.text)
      // An exact retry replays the same revision.
      expect((yield* call("maestro", "maestro_record_plan_revision", plan)).text).toBe(planned.text)

      const context = yield* call("maestro", "maestro_record_context", { planRevisionID: revision.planRevisionID })
      expect(context.text).toStartWith("GROUNDED: evt_maestro_context_")
      const contextBindings = bindings(context.text)

      const validationInput = {
        planRevisionID: revision.planRevisionID,
        contextRecordID: contextBindings.contextRecordID,
        contextHash: contextBindings.contextHash,
        projectID,
        workCardID: "card_export",
        workCard,
        routedMemberID: "backend",
        validatorVersion: "validator-v1",
        checks,
      }
      expect(
        (yield* call("maestro", "maestro_record_validation", { ...validationInput, contextHash: "other" })).text,
      ).toBe("Validation contextHash does not match ContextRecord")
      const validated = yield* call("maestro", "maestro_record_validation", validationInput)
      expect(validated.text).toStartWith("VALID: evt_maestro_validation_")
      const validation = bindings(validated.text)
      expect(validation.reviewBaseSHA).toBe(yield* runGit(directory, ["rev-parse", "main"]))

      const presentInput = {
        planRevisionID: revision.planRevisionID,
        validationRecordID: validation.validationRecordID,
        revisionHash: revision.revisionHash,
        validationHash: validation.validationHash,
        contextHash: contextBindings.contextHash,
        contextRecordID: contextBindings.contextRecordID,
        policyHash: validation.policyHash,
        intent: { subagentType: "backend", prompt: "Implement the CSV export" },
        methodVersion: "present-v1",
        plan: "CSV export",
        provenance: "admission msg_owner",
        assumptions: [],
        validationLedger: "spec: PASS (docs/export.md committed)",
        contextState: "CURRENT",
      }
      // No presentation and no grant before the cold reviewer approves.
      expect((yield* call("maestro", "maestro_present_approval", presentInput)).text).toBe(
        "Approval presentation requires lucy APPROVE",
      )
      expect(
        (yield* call("maestro", "maestro_grant_authorization", {
          validationRecordID: validation.validationRecordID,
          approvalMessageID: "msg_reply",
        })).text,
      ).toStartWith("MaestroAuthorizationRejected: review-not-approved.")
      // A changed work card is not the validated one.
      expect(
        (yield* call("maestro", "maestro_request_review", {
          validationRecordID: validation.validationRecordID,
          workCard: `${workCard}\nmore`,
          reviewMethodVersion: "review-v1",
        })).text,
      ).toStartWith("Review delegation validation mismatch:")
      // Only a lucy child Session records a review.
      expect(
        (yield* call("lucy", "maestro_record_review", {
          validationRecordID: validation.validationRecordID,
          workCard,
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { baseSHA: "a", headSHA: "b", worktree: directory, changedPaths: [], sha256: "c" },
          checks,
        })).text,
      ).toBe("Review recording requires a lucy child session")

      const reviewed = yield* call("maestro", "maestro_request_review", {
        validationRecordID: validation.validationRecordID,
        workCard,
        reviewMethodVersion: "review-v1",
      })
      expect(child.reviews).toEqual([{ type: "text", text: expect.stringMatching(/^APPROVE: evt_maestro_review_/) }])
      expect(reviewed.text).toStartWith("APPROVE: evt_maestro_review_")
      expect(promptJSON(child.prompts[0] ?? "", "artifact")).toMatchObject({
        baseSHA: validation.reviewBaseSHA,
        changedPaths: ["docs/export.md"],
      })

      const presented = yield* call("maestro", "maestro_present_approval", presentInput, {
        message: "msg_presenting",
        callID: "call_present",
      })
      expect(presented.type).toBe("text")
      yield* insert([
        assistant("msg_presenting", [
          {
            type: "tool",
            id: "call_present",
            name: "maestro_present_approval",
            state: {
              status: "completed",
              input: {},
              content: [{ type: "text", text: presented.text }],
              structured: {},
            },
            time,
          },
        ]),
        user("msg_reply", "aprovo"),
        assistant("msg_after"),
      ])
      const approved = yield* call("maestro", "maestro_record_approval", {}, { message: "msg_after" })
      expect(approved.text).toContain('"approvalMessageID":"msg_reply"')

      // Mutation probe: an untracked file makes the recorded context stale, so the grant refuses.
      const grant = { validationRecordID: validation.validationRecordID, approvalMessageID: "msg_reply" }
      yield* Effect.promise(() => fs.writeFile(path.join(directory, "docs/stray.md"), "stray\n"))
      expect((yield* call("maestro", "maestro_grant_authorization", grant, { message: "msg_after" })).text).toStartWith(
        "MaestroAuthorizationRejected: context-not-current.",
      )
      yield* Effect.promise(() => fs.rm(path.join(directory, "docs/stray.md")))
      const granted = yield* call("maestro", "maestro_grant_authorization", grant, { message: "msg_after" })
      expect(granted.text).toStartWith("evt_maestro_authorization_")
      expect((yield* call("maestro", "maestro_grant_authorization", grant, { message: "msg_after" })).text).toBe(
        granted.text,
      )

      expect((yield* maestroEvents()).toSorted()).toEqual(
        [
          EventV2.versionedType(MaestroEvent.Admission.Decided.type, 1),
          EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV2.type, 2),
          EventV2.versionedType(MaestroEvent.Context.RecordedV2.type, 2),
          EventV2.versionedType(MaestroEvent.Validation.RecordedV3.type, 3),
          EventV2.versionedType(MaestroEvent.Review.ReceivedV2.type, 2),
          EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1),
          EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1),
          EventV2.versionedType(MaestroEvent.Authorization.Granted.type, 1),
        ].toSorted(),
      )
    }).pipe(Effect.provide(host), Effect.scoped),
  ))
