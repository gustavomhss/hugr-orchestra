import { expect, test } from "bun:test"
import { ToolFailure } from "@orchestra/llm"
import { Effect, type Layer, type Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { GovernanceDispatchV2 } from "../src/v2/governance/dispatch"
import { GovernanceRecordsV2 } from "../src/v2/governance/records"
import { admit, answered, event, governanceLayer, session, worktree } from "./fixture/v2-governance"

// Authorized and governed dispatch on V2 against V1-format records: the write-once child each reservation names, its
// replay on retry, the checks a reserved child must pass, and the gate before the child's first provider turn.

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(governanceLayer(directory)))
      }),
    ),
  )

const refusal = <R>(effect: Effect.Effect<unknown, ToolFailure, R>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.message))

const hex = (digit: string) => digit.repeat(64)
const AUTHORIZATION = "evt_authorization_fixture"
const granted = EventV2.versionedType(MaestroEvent.Authorization.Granted.type, 1)
const dispatchReserved = EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2)

/** A V1 grant in `sessionID` routing `routedMemberID` to the fixture's Task intent (prompt "p", no model). */
const grant = Effect.fn("ReservationTest.grant")(function* (input: {
  sessionID: SessionSchema.ID
  routedMemberID?: string
  prompt?: string
}) {
  const store = yield* SessionStore.Service
  const parent = yield* store.get(input.sessionID)
  if (!parent) return yield* Effect.die("grant parent missing")
  yield* event(AUTHORIZATION, input.sessionID, granted, {
    sessionID: input.sessionID,
    projectID: parent.projectID,
    approvalMessageID: "msg_approval",
    validationRecordID: "evt_validation_missing",
    workCardHash: hex("a"),
    routedMemberID: input.routedMemberID ?? "general",
    rosterHash: hex("b"),
    grantHash: hex("c"),
    reviewPolicyHash: hex("d"),
    actor: { version: "rfc8785-v1", bytes: "{}", sha256: hex("e") },
    reviewerID: "lucy",
    taskIntentHash: GovernanceDispatchV2.taskIntentHash({ subagentType: input.routedMemberID ?? "general", prompt: input.prompt ?? "p" }),
    methodVersion: "v1",
  })
  return parent
})

/** The V1 v2 dispatch reservation of the fixture grant, as an earlier dispatch wrote it. */
const reservation = Effect.fn("ReservationTest.reservation")(function* (
  parent: SessionSchema.Info,
  permission: ReadonlyArray<GovernanceDispatchV2.Rule> = [],
  type = dispatchReserved,
) {
  yield* event(GovernanceDispatchV2.reservationID(AUTHORIZATION), parent.id, type, {
    sessionID: parent.id,
    authorizationID: AUTHORIZATION,
    childSessionID: GovernanceDispatchV2.childSessionID(AUTHORIZATION),
    projectID: parent.projectID,
    routedMemberID: "general",
    taskIntentHash: GovernanceDispatchV2.taskIntentHash({ subagentType: "general", prompt: "p" }),
    permission,
  })
})

const authorized = { authorizationID: AUTHORIZATION }

test("an authorized Task comes only from Maestro and only for the approved seat and intent", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      expect(yield* refusal(admit({ directory, caller: "custom", target: "general", parentID, extra: authorized })))
        .toBe("Authorized Task requires Maestro")
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
        .toStartWith("MaestroDispatchRejected: authorization-not-found.")
      yield* grant({ sessionID: parentID, routedMemberID: "backend" })
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
        .toStartWith("Authorized Task denied: routed-seat-mismatch.")
      // A grant of another Session is not this Session's to dispatch.
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "backend", extra: authorized })))
        .toStartWith("MaestroDispatchRejected: session-mismatch.")
    }),
  ))

test("an authorized Task whose prompt differs from the approved intent is refused", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      yield* grant({ sessionID: parentID, prompt: "approved" })
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
        .toStartWith("Authorized Task denied: task-intent-mismatch.")
    }),
  ))

test("a first dispatch needs its validation and context evidence", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      yield* grant({ sessionID: parentID })
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
        .toStartWith("MaestroDispatchRejected: authorization-evidence-mismatch.")
    }),
  ))

test("a recorded reservation replays to the same write-once child on every retry", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      const parent = yield* grant({ sessionID: parentID })
      yield* reservation(parent)
      const childID = GovernanceDispatchV2.childSessionID(AUTHORIZATION)
      const first = yield* admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })
      expect(first).toEqual({ childID })
      expect(childID).toStartWith("ses_maestro_dispatch_")
      expect(yield* admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })).toEqual(first)
      // A reserved child is prompted only by the call that reserved it; another call is not a replay of it.
      yield* session({ id: childID, directory, agent: "general", parentID })
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
        .toStartWith("Task denied: authorized-replay-unavailable:")
    }),
  ))

test("a reserved child of another agent, parent or rule set is refused", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      const parent = yield* grant({ sessionID: parentID })
      yield* reservation(parent)
      const childID = GovernanceDispatchV2.childSessionID(AUTHORIZATION)
      yield* session({ id: childID, directory, agent: "lucy", parentID })
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
        .toBe("Task denied: reservation-child-mismatch")
    }),
  ).then(() =>
    run((directory) =>
      Effect.gen(function* () {
        const parentID = yield* session({ directory, agent: "maestro" })
        const parent = yield* grant({ sessionID: parentID })
        yield* reservation(parent)
        yield* session({
          id: GovernanceDispatchV2.childSessionID(AUTHORIZATION),
          directory,
          agent: "general",
          parentID,
          permission: [{ permission: "bash", pattern: "*", action: "allow" }],
        })
        expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
          .toBe("Task denied: reservation-child-permission-mismatch")
      }),
    ),
  ))

test("a reservation with another snapshot, or from before snapshots, never replays", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      const parent = yield* grant({ sessionID: parentID })
      yield* reservation(parent, [{ permission: "bash", pattern: "*", action: "allow" }])
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
        .toStartWith("MaestroDispatchRejected: reservation-binding-mismatch.")
    }),
  ).then(() =>
    run((directory) =>
      Effect.gen(function* () {
        const parentID = yield* session({ directory, agent: "maestro" })
        const parent = yield* grant({ sessionID: parentID })
        yield* reservation(parent, [], EventV2.versionedType(MaestroEvent.Dispatch.Reserved.type, 1))
        expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: authorized })))
          .toStartWith("MaestroDispatchRejected: reservation-missing-permission-snapshot.")
      }),
    ),
  ))

test("before its first provider turn a dispatch child revalidates its reservation against the current tree", () =>
  run((directory) =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      const store = yield* SessionStore.Service
      const parentID = yield* session({ directory, agent: "maestro" })
      const childID = yield* session({ id: GovernanceDispatchV2.childSessionID(AUTHORIZATION), directory, agent: "general", parentID })
      const child = yield* store.get(childID)
      if (!child) return yield* Effect.die("child missing")
      expect(yield* refusal(governance.beforeTurn(child))).toStartWith("MaestroDispatchRejected: authorization-not-found.")
      yield* reservation(yield* grant({ sessionID: parentID }))
      // The replay that is about to run work requires the recorded evidence, which this grant does not have.
      expect(yield* refusal(governance.beforeTurn(child))).toStartWith("MaestroDispatchRejected: authorization-evidence-mismatch.")
      // Only the first turn is gated: once the child promoted an input, later turns run under the checks already passed.
      yield* answered(childID)
      yield* governance.beforeTurn(child)
    }),
  ))

const governedRequest = (sessionID: string, projectID: string) => ({
  sessionID, projectID, memberID: "maestro", approvalMessageID: "m", planRevisionID: "r",
  revisionHash: "h", validationRecordID: "v", validationHash: "h", contextHash: "h", policyHash: "h", taskHash: "h",
})

test("a governed Task comes only from Maestro and only for its own approved request", () =>
  run((directory) =>
    Effect.gen(function* () {
      const store = yield* SessionStore.Service
      const parentID = yield* session({ directory, agent: "maestro" })
      const parent = yield* store.get(parentID)
      if (!parent) return yield* Effect.die("parent missing")
      expect(yield* refusal(admit({ directory, caller: "custom", target: "general", parentID, extra: { governed: governedRequest(parentID, parent.projectID) } })))
        .toBe("Governed Task requires Maestro")
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: { governed: governedRequest("ses_other", parent.projectID) } })))
        .toBe("Governed Task denied: request-context-mismatch")
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: { governed: { ...governedRequest(parentID, parent.projectID), memberID: "lucy" } } })))
        .toBe("Governed Task denied: request-actor-mismatch")
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID, extra: { governed: governedRequest(parentID, parent.projectID) } })))
        .toBe("Governed Task denied: task-hash-mismatch")
    }),
  ))

test("a governed child consumes its approval once, before its first provider turn", () =>
  run((directory) =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      const store = yield* SessionStore.Service
      const parentID = yield* session({ directory, agent: "maestro" })
      const suffix = hex("f")
      const childID = yield* session({ id: SessionSchema.ID.make(`ses_maestro_approval_${suffix}`), directory, agent: "general", parentID })
      const child = yield* store.get(childID)
      if (!child) return yield* Effect.die("child missing")
      expect(yield* refusal(governance.beforeTurn(child))).toBe("Governed Task denied: reservation-hold")
      yield* event(`evt_maestro_approval_reserved_${suffix}`, parentID, EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2), {
        ...governedRequest(parentID, child.projectID),
        presentationID: "evt_presentation",
        callID: "call_governed",
        childSessionID: childID,
        parentSessionID: parentID,
        agent: "general",
        permission: [],
      })
      yield* governance.beforeTurn(child)
      // A repeated first turn (a retried drain) finds the same receipt and passes.
      yield* governance.beforeTurn(child)
      const database = yield* Database.Service
      const receipt = yield* GovernanceRecordsV2.row(database.db, `evt_maestro_approval_consumed_${suffix}`)
      expect(receipt?.data).toEqual({
        sessionID: parentID,
        presentationID: "evt_presentation",
        approvalMessageID: "m",
        taskHash: "h",
        callID: "call_governed",
        childSessionID: childID,
      })
    }),
  ))
