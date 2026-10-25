export * as MaestroGovernanceV2 from "./governance"

import { isDeepStrictEqual } from "node:util"
import { ToolFailure } from "@orchestra/llm"
import { and, eq, sql } from "drizzle-orm"
import { Effect, Layer, Option, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { Location } from "@orchestra/core/location"
import { SessionInput, SessionSchema, SessionStore } from "@orchestra/core/session"
import { SkillV2 } from "@orchestra/core/skill"
import { TaskTool } from "@orchestra/core/tool/task"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Seats } from "../seats"
import { SessionAuthority } from "../session-authority"
import { UpstreamResult } from "../upstream-result"
import { GovernanceBackgroundV2 } from "./governance/background"
import { CallerGateV2 } from "./governance/caller"
import { GovernanceDispatchV2 } from "./governance/dispatch"
import { GovernanceInputV2 } from "./governance/input"
import { LogicalTaskV2 } from "./governance/logical-task"
import { GovernanceRecordsV2 } from "./governance/records"
import { GovernanceReservationV2 } from "./governance/reservation"
import { UnsupportedV2 } from "./governance/unsupported"
import { WorkflowGateV2 } from "./governance/workflow"
import { WriteRootsV2 } from "./governance/write-roots"
import { MaestroSeats } from "./seats-service"

const decode = Schema.decodeUnknownOption(GovernanceInputV2.Input)
const decodeReserved = Schema.decodeUnknownSync(MaestroEvent.Dispatch.ReservedV2.data)

/**
 * Maestro's Task governance on V2, in V1's phase order: the caller seat's native profile, the phases whose host is not
 * on V2 yet (refused, never skipped), the workflow holds, logical-task resume, the authorized and governed
 * reservations with their write-once child, then a write-roots seat's bound scope as the child's rules. Each reserved
 * child is revalidated (dispatch) or consumes its approval (governed) once, before its first provider turn. A plain
 * Task otherwise delegates exactly as core's `allowAll`.
 */
export const make = Effect.gen(function* () {
  const seats = yield* MaestroSeats.Service
  const store = yield* SessionStore.Service
  const database = yield* Database.Service
  const location = yield* Location.Service
  const fs = yield* FSUtil.Service
  const events = yield* EventV2.Service
  const git = yield* GitCli.Service
  const config = yield* Config.Service
  const skills = yield* SkillV2.Service
  const sessions = yield* GovernanceBackgroundV2.Sessions
  const background = yield* GovernanceBackgroundV2.make()
  // The roster loads lazily (see `seats.ts`); where it cannot load no agent is a seat, so no profile is read.
  const roster = yield* Effect.tryPromise(() => import("../roster")).pipe(Effect.option)
  const profiles = roster._tag === "Some" ? roster.value.nativeProfiles : {}
  const canonical = (id: string): string => (roster._tag === "Some" ? roster.value.canonicalMemberId(id) : id)
  const services = { db: database.db, store, events, canonical, atlas: { config, git, fs, skills } }
  const seatOf = (id: string) => (seats.has(canonical(id)) ? Seats.all[canonical(id)] : undefined)

  return TaskGovernance.Service.of({
    input: GovernanceInputV2.fields,
    admit: (admission) =>
      Effect.gen(function* () {
        const decoded = decode(admission.input)
        if (decoded._tag === "None") return yield* new ToolFailure({ message: "Task denied: governance-input-invalid" })
        const input = decoded.value
        const parent = admission.parent
        const caller = admission.context.agent
        const target = admission.target.id
        const memberID = canonical(target)
        const seat = seatOf(target)
        yield* CallerGateV2.check(seats, profiles, caller, target)
        yield* UnsupportedV2.check(seats, target, input)
        yield* WorkflowGateV2.check(database, { parentID: parent.id, taskID: input.task_id })
        // V1's Arsenal beforeDispatch binds a completion arm only through a native host, which V2 does not have; with
        // no host it holds a workflow step (refused above) and passes every other Task, so nothing runs here.
        const reserved = input.authorizationID !== undefined || input.governed !== undefined
        const resumed = yield* LogicalTaskV2.resolveResume(services, {
          taskID: input.task_id,
          strict: reserved || !!seat?.strictResume,
          parentSessionID: parent.id,
          projectID: parent.projectID,
          memberID,
        })
        // A reserved child is created by its reservation, so its rules are the snapshot alone.
        const base = !reserved && resumed ? yield* store.permissions(resumed.id) : []
        const permissions = seat?.writeRoots ? yield* WriteRootsV2.bind(fs, location, input.writePaths, base) : base
        const snapshot = permissions.map((rule) => ({ permission: rule.action, pattern: rule.resource, action: rule.effect }))

        const authorized = input.authorizationID === undefined
          ? undefined
          : yield* authorize(input.authorizationID)
        const governed = input.governed === undefined
          ? undefined
          : yield* GovernanceReservationV2.reserve(services, {
              governed: input.governed,
              subagentType: input.subagent_type,
              prompt: input.prompt,
              model: input.model,
              taskID: resumed?.id ?? authorized?.childSessionID,
              sessionID: parent.id,
              projectID: parent.projectID,
              caller,
              callID: admission.context.toolCallID,
              target,
              permission: snapshot,
            })
        const reservedID = governed?.childSessionID ?? authorized?.childSessionID
        const reservedChild = reservedID ? SessionSchema.ID.make(reservedID) : undefined
        if (reservedChild) yield* requireReservedChild(reservedChild, snapshot, authorized !== undefined)
        // Core resumes a `task_id` that is already the child's Session ID; only a resolved logical task names it here.
        const childID = reservedChild ?? (resumed && resumed.id !== input.task_id ? resumed.id : undefined)
        const skillsText = input.authorizationID === undefined
          ? []
          : yield* GovernanceDispatchV2.groundedSkills(services, input.authorizationID)

        if (input.background === true) {
          if (seat?.workResult === UpstreamResult.SCHEMA)
            return yield* UnsupportedV2.refuse(
              "upstream-settlement-unavailable",
              "an upstream proposal in the background needs the upstream settlement",
            )
          if (Option.isNone(sessions))
            return yield* UnsupportedV2.refuse(
              "background-unavailable",
              "a background Task's result has no way back to this Session",
            )
          background.register(
            GovernanceBackgroundV2.watch({
              parentID: parent.id,
              childID: childID ?? resumed?.id ?? TaskTool.taskChildID(admission.context),
              description: input.description,
              context: admission.context,
            }),
          )
        }
        return {
          ...(childID ? { childID } : {}),
          ...(seat?.writeRoots ? { permissions } : {}),
          ...(skillsText.length > 0 ? { prompt: { text: [input.prompt, ...skillsText].join("\n\n") } } : {}),
          ...(input.background === true ? { background: true } : {}),
        }

        function authorize(authorizationID: string) {
          return Effect.gen(function* () {
            if (caller !== AgentV2.defaultID)
              return yield* new ToolFailure({ message: "Authorized Task requires Maestro" })
            const why = GovernanceDispatchV2.mismatch(
              yield* GovernanceRecordsV2.readAuthorization(database.db, authorizationID, canonical),
              {
                sessionID: parent.id,
                memberID,
                subagentType: input.subagent_type,
                prompt: input.prompt,
                model: input.model,
              },
            )
            if (why) return yield* new ToolFailure({ message: why })
            const reservation = yield* GovernanceDispatchV2.reserve(services, {
              sessionID: parent.id,
              authorizationID,
              permission: snapshot,
            })
            if (resumed && resumed.id !== reservation.childSessionID)
              return yield* new ToolFailure({ message: "Task denied: reservation-child-mismatch" })
            return reservation
          })
        }

        function requireReservedChild(id: SessionSchema.ID, rules: typeof snapshot, dispatch: boolean) {
          return Effect.gen(function* () {
            const existing = yield* store.get(id)
            if (!existing) return
            if (existing.parentID !== parent.id || canonical(existing.agent) !== memberID)
              return yield* new ToolFailure({ message: "Task denied: reservation-child-mismatch" })
            const recorded = (yield* store.permissions(existing.id)).map((rule) => ({
              permission: rule.action,
              pattern: rule.resource,
              action: rule.effect,
            }))
            if (!isDeepStrictEqual(recorded, rules))
              return yield* new ToolFailure({ message: "Task denied: reservation-child-permission-mismatch" })
            // An authorization dispatches once: only the call that reserved its child (or its exact retry) prompts it.
            if (dispatch && !(yield* SessionInput.find(database.db, TaskTool.taskPromptID(admission.context, existing.id))))
              return yield* UnsupportedV2.refuse(
                "authorized-replay-unavailable",
                "a reserved dispatch child is prompted only by the Task call that reserved it",
              )
          })
        }
      }),
    beforeTurn: (session) =>
      Effect.gen(function* () {
        if (Option.isSome(sessions)) yield* background.start(sessions.value, session.id)
        if (!session.parentID) return
        // Only a child's first provider turn is gated; every later turn already ran under the same checks.
        // A refused turn leaves its input pending, so a promoted input means an earlier turn already passed this gate.
        if ((yield* SessionInput.promotedAfter(database.db, session.id, -1)).length > 0) return
        const dispatch = session.id.startsWith(GovernanceDispatchV2.CHILD_PREFIX)
        const governed = session.id.startsWith(GovernanceReservationV2.CHILD_PREFIX)
        if (dispatch) yield* revalidateDispatch(session.id)
        if (governed) yield* GovernanceReservationV2.consume(services, session.id)
        const member = canonical(session.agent)
        if (!seatOf(member)?.strictResume) return
        const authority = yield* SessionAuthority.make(store.get)(session.id, session.projectID).pipe(
          Effect.mapError((error) => new ToolFailure({ message: `Task binding denied: ${error.reason}` })),
        )
        yield* LogicalTaskV2.ensure(services, {
          executionSessionID: session.id,
          authoritySessionID: authority.rootID,
          projectID: session.projectID,
          memberID: member,
          ...LogicalTaskV2.origin(dispatch || governed ? session.id : undefined, governed),
        })
      }),
    settle: (input) =>
      Effect.gen(function* () {
        const settled = yield* TaskGovernance.allowAll.settle(input)
        if (seatOf(input.child.agent)?.workResult !== UpstreamResult.SCHEMA) return settled
        const card = UpstreamResult.parse(settled.text)
        return card ? { ...settled, structured: { upstreamResult: card } } : settled
      }),
  })

  // Before the dispatch child's first provider call its reservation must still replay with the child's own rules, and
  // the recorded context must still describe the tree (V1's beforeModel revalidation).
  function revalidateDispatch(childSessionID: string) {
    return Effect.gen(function* () {
      const row = yield* database.db
        .select({ data: EventV2.EventTable.data })
        .from(EventV2.EventTable)
        .where(
          and(
            eq(EventV2.EventTable.type, EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2)),
            sql`json_extract(${EventV2.EventTable.data}, '$.childSessionID') = ${childSessionID}`,
          ),
        )
        .get()
        .pipe(Effect.orDie)
      if (!row) return yield* GovernanceDispatchV2.rejected("authorization-not-found")
      const reservation = decodeReserved(row.data)
      yield* GovernanceDispatchV2.reserve(services, {
        sessionID: reservation.sessionID,
        authorizationID: reservation.authorizationID,
        permission: (yield* store.permissions(SessionSchema.ID.make(reservation.childSessionID))).map((rule) => ({
          permission: rule.action,
          pattern: rule.resource,
          action: rule.effect,
        })),
        requireCurrent: true,
      })
    })
  }
})

export const node = makeLocationNode({
  service: TaskGovernance.Service,
  layer: Layer.effect(TaskGovernance.Service, make),
  deps: [
    MaestroSeats.node,
    SessionStore.node,
    Database.node,
    Location.node,
    FSUtil.node,
    EventV2.node,
    GitCli.node,
    Config.node,
    SkillV2.node,
    GovernanceBackgroundV2.sessionsNode,
  ],
})

/** Task governance and the write-roots ToolSafety, after the Arsenal's replacements (a later replacement wins). */
export const replacements = [
  [TaskGovernance.node, node],
  [ToolSafety.node, WriteRootsV2.safetyNode],
] as const
