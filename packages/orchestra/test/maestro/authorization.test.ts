import { afterEach, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { Config } from "../../src/config/config"
import { Skill } from "../../src/skill"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { SessionV1 } from "@orchestra/core/v1/session"
import { Effect, FileSystem } from "effect"
import { eq } from "drizzle-orm"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { grantAuthorization, readAuthorization } from "../../src/maestro/authorization"
import { reserveDispatch } from "../../src/maestro/dispatch"
import { recordValidation, validationRecordHash } from "../../src/maestro/validation-record"
import { presentApprovalFromSession, recordApproval } from "../../src/maestro/approval-record"
import { renderPresentation } from "../../src/maestro/approval"
import { Git } from "../../src/git"
import { recordContext } from "../../src/maestro/context-record"
import { LEGACY_BACKEND_ID } from "../../src/maestro/roster"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => disposeAllInstances())

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      filesystem,
      Config.node,
      Skill.node,
      Database.node,
      EventV2Bridge.node,
      Git.node,
      Session.node,
      SessionProjector.node,
    ]),
  ),
)

it.instance(
  "requires direct user approval and independent Lucy approval",
  () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const events = yield* EventV2Bridge.Service
      const session = yield* sessions.create({ title: "authorization" })
      const planRevisionID = EventV2.ID.make("evt_maestro_plan_authorization")
      yield* events.publish(
        MaestroEvent.PlanRevision.Recorded,
        {
          id: planRevisionID,
          sessionID: session.id,
          admissionMessageID: "msg_admission",
          methodVersion: "draft-plan-v1",
          revision: "v1",
          goal: { value: "implement card", source: "maestro" },
          acceptance: [{ value: "tests pass", source: "maestro" }],
          scope: [{ value: "card", source: "maestro" }],
          constraints: [],
          reviewRequirement: { value: "Lucy", source: "maestro" },
          contextRequirement: "PENDING",
          assumptions: [],
          risks: [],
          status: "PROPOSED",
          revisionHash: "a".repeat(64),
          createdAt: 1,
        },
        { id: planRevisionID },
      )
      const context = yield* recordContext(planRevisionID, session.id)
      const validation = yield* recordValidation({
        sessionID: session.id,
        planRevisionID,
        contextRecordID: context.id,
        contextHash: context.contextHash,
        projectID: session.projectID,
        workCardID: "card_authorization",
        workCard: [
          "# Card",
          "## Definition of Done",
          "The routed card is implemented.",
          "## Invariants",
          "Only an approved, current validation is authorized.",
          "## Quality Standards",
          "Route checks pass.",
          "## Completeness Criteria",
          "Every authorization precondition is exercised.",
          "## Success Criteria",
          "The backend specialist receives exactly one authorized dispatch.",
          "",
        ].join("\n"),
        routedMemberID: "backend",
        validatorID: "maestro",
        validatorVersion: "validation-v1",
        checks: [{ id: "route", status: "PASS", detail: "routed" }],
      })
      const denied = yield* grantAuthorization({
        sessionID: session.id,
        validationRecordID: validation.id,
        approvalMessageID: "msg_missing",
      }).pipe(Effect.flip)
      expect(denied).toMatchObject({ reason: "review-not-approved" })
      // The model sees only the message, so it must carry the reason and the step that satisfies it.
      expect(denied instanceof Error && denied.message).toBe(
        "MaestroAuthorizationRejected: review-not-approved. Authorization needs a cold-review (`lucy`) APPROVE receipt for this validation and work card; call maestro_request_review, and after FIX_FIRST or REJECT fix the work and validate again with a new workCardID.",
      )
      yield* events.publish(MaestroEvent.Review.Received, {
        sessionID: session.id,
        projectID: session.projectID,
        validationRecordID: validation.id,
        workCardHash: validation.workCardHash,
        routedMemberID: validation.routedMemberID,
        rosterHash: validation.rosterHash,
        grantHash: validation.grantHash,
        reviewPolicyHash: validation.reviewPolicyHash,
        actor: validation.actor,
        reviewerID: "lucy",
        reviewMethodVersion: "review-v1",
        artifact: {
          workCardHash: validation.workCardHash,
          sha256: "a".repeat(64),
          baseSHA: "a".repeat(40),
          headSHA: "b".repeat(40),
          worktree: "/tmp",
          changedPaths: [],
          bytes: "ZGlmZg==",
        },
        verdict: "APPROVE",
        findings: [],
      })
      const assistant: SessionV1.Assistant = {
        id: MessageID.ascending(),
        parentID: MessageID.ascending(),
        role: "assistant",
        sessionID: session.id,
        mode: "maestro",
        agent: "maestro",
        path: { cwd: session.directory, root: session.directory },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: ModelV2.ID.make("test"),
        providerID: ProviderV2.ID.make("test"),
        time: { created: 1 },
      }
      yield* sessions.updateMessage(assistant)
      const presentation = yield* presentApprovalFromSession({
        sessionID: session.id,
        assistantMessageID: assistant.id,
        callID: "call_present",
        memberID: "maestro",
        planRevisionID,
        validationRecordID: validation.id,
        revisionHash: "a".repeat(64),
        validationHash: validationRecordHash(validation),
        contextHash: context.contextHash,
        policyHash: validation.reviewPolicyHash,
        taskHash: "e".repeat(64),
        intent: { subagentType: "backend", prompt: "implement card" },
        methodVersion: "request-approval-v1",
        plan: "implement card",
        provenance: "test",
        assumptions: [],
        validationLedger: "VALID",
        contextState: "CURRENT",
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID: assistant.id,
        type: "tool",
        tool: "maestro_present_approval",
        callID: "call_present",
        state: {
          status: "completed",
          input: {},
          output: renderPresentation(presentation),
          title: "approval",
          metadata: {},
          time: { start: 1, end: 2 },
        },
      })
      const direct = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: session.id,
        agent: "maestro",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
        time: { created: 2 },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        sessionID: session.id,
        messageID: direct.id,
        type: "text",
        text: "approve",
      })
      const approval = yield* recordApproval(session.id)
      if (approval.status === "HOLD") throw new Error(approval.reason)
      expect(approval.status).toBe("APPROVED")
      const { db } = yield* Database.Service
      const validationRow = yield* db
        .select()
        .from(EventTable)
        .where(eq(EventTable.id, validation.id))
        .get()
        .pipe(Effect.orDie)
      if (!validationRow) throw new Error("missing validation row")
      yield* db
        .update(EventTable)
        .set({ data: { ...validationRow.data, validatorVersion: "tampered" } })
        .where(eq(EventTable.id, validation.id))
        .run()
        .pipe(Effect.orDie)
      const tampered = yield* grantAuthorization({
        sessionID: session.id,
        validationRecordID: validation.id,
        approvalMessageID: direct.id,
      }).pipe(Effect.flip)
      expect(tampered).toMatchObject({ reason: "approval-binding-mismatch" })
      expect(tampered instanceof Error && tampered.message).toBe(
        "MaestroAuthorizationRejected: approval-binding-mismatch. Pass approvalMessageID from the maestro_record_approval Bindings line and the validationRecordID that was presented.",
      )
      yield* db
        .update(EventTable)
        .set({ data: validationRow.data })
        .where(eq(EventTable.id, validation.id))
        .run()
        .pipe(Effect.orDie)
      const test = yield* TestInstance
      yield* FileSystem.FileSystem.use((fs) => fs.writeFileString(`${test.directory}/stale.txt`, "stale\n"))
      const stale = yield* grantAuthorization({
        sessionID: session.id,
        validationRecordID: validation.id,
        approvalMessageID: direct.id,
      }).pipe(Effect.flip)
      expect(stale).toMatchObject({ reason: "context-not-current" })
      expect(stale instanceof Error && stale.message).toBe(
        "MaestroAuthorizationRejected: context-not-current. HEAD, the working tree or the Own source changed since the context was recorded; record a new plan revision (change any field, such as methodVersion), rerun the checks, then record a new context and a new validation.",
      )
      yield* Effect.promise(() => Bun.file(`${test.directory}/stale.txt`).delete())
      const granted = yield* grantAuthorization({
        sessionID: session.id,
        validationRecordID: validation.id,
        approvalMessageID: direct.id,
      })
      expect(granted).toMatchObject({
        sessionID: session.id,
        validationRecordID: validation.id,
        approvalMessageID: direct.id,
        reviewerID: "lucy",
      })
      yield* FileSystem.FileSystem.use((fs) => fs.writeFileString(`${test.directory}/stale.txt`, "stale again\n"))
      const staleDispatch = yield* reserveDispatch({
        sessionID: session.id,
        authorizationID: granted.id,
        permission: [],
      }).pipe(Effect.flip)
      expect(staleDispatch).toMatchObject({ reason: "context-not-current" })
      expect(staleDispatch instanceof Error && staleDispatch.message).toBe(
        "MaestroDispatchRejected: context-not-current. HEAD, the working tree or the Own source changed since the context was recorded; keep the tree untouched from context until the task returns, and restart from a new plan revision.",
      )
      yield* Effect.promise(() => Bun.file(`${test.directory}/stale.txt`).delete())
      const reservations = yield* Effect.all(
        [
          reserveDispatch({ sessionID: session.id, authorizationID: granted.id, permission: [] }),
          reserveDispatch({ sessionID: session.id, authorizationID: granted.id, permission: [] }),
        ],
        { concurrency: "unbounded" },
      )
      expect(reservations[0]).toEqual(reservations[1])
      expect(reservations[0]).toMatchObject({
        sessionID: session.id,
        authorizationID: granted.id,
        routedMemberID: "backend",
      })
      yield* FileSystem.FileSystem.use((fs) => fs.writeFileString(`${test.directory}/stale.txt`, "after reservation\n"))
      expect(yield* reserveDispatch({ sessionID: session.id, authorizationID: granted.id, permission: [] })).toEqual(
        reservations[0],
      )
      expect(
        yield* reserveDispatch({
          sessionID: session.id,
          authorizationID: granted.id,
          permission: [],
          requireCurrent: true,
        }).pipe(Effect.flip),
      ).toMatchObject({ reason: "context-not-current" })

      // An authorization and reservation written by a build before the backend seat's rename route to its former id.
      yield* Effect.forEach([granted.id, reservations[0].id], (id) =>
        Effect.gen(function* () {
          const row = yield* db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
          if (!row) throw new Error(`missing row ${id}`)
          yield* db
            .update(EventTable)
            .set({ data: { ...row.data, routedMemberID: LEGACY_BACKEND_ID } })
            .where(eq(EventTable.id, id))
            .run()
            .pipe(Effect.orDie)
        }),
      )
      expect(yield* readAuthorization(granted.id)).toEqual(granted)
      expect(yield* reserveDispatch({ sessionID: session.id, authorizationID: granted.id, permission: [] })).toEqual(
        reservations[0],
      )
    }),
  { git: true },
  15_000,
)
