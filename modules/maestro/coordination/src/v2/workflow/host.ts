export * as MaestroWorkflowHostV2 from "./host"

import { isDeepStrictEqual } from "node:util"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { GitCli } from "@orchestra/core/git-cli"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { PermissionV2 } from "@orchestra/core/permission"
import { AppProcess } from "@orchestra/core/process"
import { Relay } from "@orchestra/core/relay"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { RelayWorkflowSession } from "@orchestra/core/relay-workflow-session"
import { SessionStore, SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SkillV2 } from "@orchestra/core/skill"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { RelayArm } from "@orchestra/schema/relay-arm"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionMessage } from "@orchestra/core/session/message"
import { WorkflowGateV2 } from "../governance/workflow"
import { MaestroSeats } from "../seats-service"
import { WorkflowArmV2 } from "./arm"
import { WorkflowRecordsV2 } from "./records"
import { WorkflowRelayV2 } from "./relay"
import { WorkflowSettlementV2 } from "./settlement"

// Workflow session host. V1
// built one host per armed receipt and kept it in memory; V2 keeps one stateless global host that resolves every call
// from the durable binding: the authority Session that approved the plan, its arm and its Location's own Relay. The
// runner reads it through RelayWorkflowSession, so every provider turn of a bound child reads its step here.

type Bound = Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowBound.data>

export interface Interface extends RelayWorkflowSession.Host {
  /**
   * The authorized resume of a step held for a code review: grades the held settlement now when the workers' result
   * has a FIX_FIRST code review, so the gate spends one retry and the next attempt carries its findings.
   */
  readonly grade: (bound: Bound, settlement: RelayArm.WorkflowSettlement) => Effect.Effect<void, RelayWorkflowBinding.Held>
  /**
   * Adopts a workflow Task's binding before its child runs (V1's WorkflowBinding.adopt): the approved plan must carry
   * the global acceptance checks and bind only checks this host runs; a first dispatch arms the plan's sprint for the
   * child, moving an arm a child that never ran still holds, and stores the binding; every call reads the current step,
   * and a parked arm holds until the owner releases it. A `continuation` that resumes a step held for a code review
   * grades that hold first, as V1's authorized resume does.
   */
  readonly admit: (bound: Bound, continuation: boolean) => Effect.Effect<void, RelayWorkflowBinding.Held>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/maestro/WorkflowHost") {}

/** The host as a Location sees it: a capture of the process's global host, none where no Maestro host runs. */
export class Capture extends Context.Service<Capture, Option.Option<Interface>>()("@orchestra/maestro/WorkflowHost/Capture") {}

export const captureNode = makeGlobalNode({
  name: "maestro/workflow/global/host",
  layer: Layer.effect(Capture, Effect.serviceOption(Service)),
  deps: [],
})

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const events = yield* EventV2.Service
    const sessions = yield* RelayWorkflowSession.Service
    const git = yield* GitCli.Service
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    // Without the process's execution service every child counts as running, so no arm moves (V1's Activity default).
    const execution = yield* Effect.serviceOption(SessionExecution.Service)

    // The placement a binding names, opened in its authority Session's Location: the Relay that holds its arm, the
    // publication port that revalidates its plan and the two global acceptance checks bound to that Session.
    const within = <A, E>(
      bound: Bound,
      use: (placement: {
        readonly relay: Relay.Interface
        readonly revalidate: Effect.Effect<Effect.Success<ReturnType<typeof RelayWorkflowBinding.revalidate>>, RelayWorkflowBinding.Held>
        readonly checks: ReadonlyMap<string, Effect.Effect<WorkflowSettlementV2.Outcome, unknown>>
        readonly host: Pick<WorkflowSettlementV2.Binding, "projectID" | "sessionID" | "directory">
      }) => Effect.Effect<A, E>,
    ) =>
      Effect.gen(function* () {
        const authority = yield* store.get(SessionV2.ID.make(bound.binding.authoritySessionID))
        if (!authority) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_LINEAGE_MISMATCH" })
        const arm = (yield* WorkflowArmV2.arms(database, authority.id)).find((entry) => entry.token === bound.token)
        if (!arm || arm.projectID !== authority.projectID || arm.directory !== authority.location.directory)
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_PLACEMENT_MISMATCH" })
        return yield* Effect.gen(function* () {
          const relay = yield* Relay.Service
          const permission = yield* PermissionV2.Service
          const config = yield* Config.Service
          const skills = yield* SkillV2.Service
          // A contributed Location node: present in every Maestro Location, though the map's type names only core services.
          const seats = Option.getOrElse(yield* Effect.serviceOption(MaestroSeats.Service), () => MaestroSeats.make([]))
          const port = yield* WorkflowRelayV2.publication(relay, authority, {
            store,
            seats,
            atlas: { config, git, fs, skills },
          })
          const directory = authority.location.directory
          const binding = {
            sessionID: authority.id,
            projectID: authority.projectID,
            planID: bound.binding.planRevisionID,
            taskID: bound.executionSessionID,
            directory,
          }
          return yield* use({
            relay,
            revalidate: RelayWorkflowBinding.revalidate(port, bound.binding.definition).pipe(
              Effect.mapError((error) =>
                error instanceof RelayWorkflowBinding.Held
                  ? error
                  : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_BINDING_ACQUISITION" }),
              ),
            ),
            host: binding,
            checks: new Map([
              [
                "cold-review",
                Effect.gen(function* () {
                  const top = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: directory })
                  if (top.exitCode || top.truncated)
                    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_STALE" })
                  const worktree = yield* fs.realPath(top.text().trim())
                  yield* WorkflowSettlementV2.coldReview({ db: database.db, git, fs }, { ...binding, worktree })
                  return { status: "pass" as const, exitCode: 0 }
                }),
              ],
              [
                "package-verification",
                WorkflowSettlementV2.verification(directory, (command) =>
                  permission.authorize({
                    sessionID: authority.id,
                    action: "bash",
                    resources: [command],
                    metadata: { completionCheck: true },
                  }),
                ).pipe(
                  Effect.map((verified) => verified.outcome),
                  Effect.provideService(FSUtil.Service, fs),
                  Effect.provideService(AppProcess.Service, processes),
                ),
              ],
            ]),
          })
        }).pipe(Effect.provide(locations.get(authority.location)))
      }).pipe(
        Effect.mapError((error) =>
          error instanceof RelayWorkflowBinding.Held ? error : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_ACQUISITION" }),
        ),
      )

    // A settlement for exactly the binding stored for its execution Session; `regrade` is the authorized resume, which
    // may grade a receipt an ordinary settlement holds as unaddressed.
    const settle = (current: RelayWorkflowSession.Current, settlement: RelayArm.WorkflowSettlement, regrade: boolean) =>
      Effect.gen(function* () {
        const bound = yield* WorkflowRecordsV2.read(database.db, current.binding.executionSessionID)
        if (!bound || bound.token !== current.token || !isDeepStrictEqual(bound.binding, current.binding))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
        return yield* within(bound, (placement) =>
          Effect.gen(function* () {
            const materialized = yield* placement.revalidate
            const step = { executionSessionID: bound.executionSessionID, token: bound.token, position: current.view.position }
            return yield* WorkflowSettlementV2.settle({
              checklist: materialized.sprint.work_packages[current.view.index]?.checklist,
              coldReview: placement.checks.get("cold-review"),
              held: WorkflowRecordsV2.recordReviewHeld(
                { db: database.db, events },
                { executionSessionID: bound.executionSessionID, token: bound.token, settlement },
              ),
              graded: regrade ? undefined : WorkflowRecordsV2.graded(database.db, step),
              transition: placement.relay.transition({
                token: bound.token,
                binding: bound.binding,
                settlement,
                agentID: bound.executionSessionID,
                revalidate: () => Effect.asVoid(placement.revalidate),
                hostChecks: new Map(
                  [...placement.checks].map(([name, check]) => [name, WorkflowSettlementV2.adapt(check, placement.host)]),
                ),
              }),
            })
          }),
        )
      }).pipe(
        Effect.mapError((error) =>
          error instanceof RelayWorkflowBinding.Held
            ? error
            : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_ACQUISITION" }),
        ),
      )

    const current = (bound: Bound) =>
      within(bound, (placement) =>
        Effect.gen(function* () {
          yield* placement.revalidate
          const view = yield* placement.relay.currentStep(bound.token, bound.binding)
          // The findings of a code review that graded the previous attempt ride after the step's own instructions; the
          // approved Task prompt never changes.
          const findings = yield* WorkflowRecordsV2.stepFindings(database.db, {
            executionSessionID: bound.executionSessionID,
            token: bound.token,
            position: view.position,
          })
          return {
            token: bound.token,
            binding: bound.binding,
            view: findings ? { ...view, instructions: [view.instructions, findings].filter(Boolean).join("\n\n") } : view,
          }
        }),
      )

    // V1's moveArm: an arm still bound to another child moves here only when that child never ran a provider turn, and
    // moves only forward. A move Relay made but Orchestra never recorded is recorded first, with this call as recorder.
    const moveArm = (
      relay: Relay.Interface,
      bound: Bound,
      arm: Parameters<Relay.Interface["create"]>[0] & { readonly agentID: string },
      conflict: boolean,
    ) =>
      Effect.gen(function* () {
        const held = Option.getOrUndefined(yield* relay.holder(bound.token))
        const recorded = yield* WorkflowRecordsV2.holders(database.db, bound.token)
        const authority = { authorityMessageID: bound.authorityMessageID, authorityCallID: bound.authorityCallID }
        if (held && recorded.holder && held !== recorded.holder && !recorded.movedFrom.has(held))
          yield* WorkflowRecordsV2.recordMove(
            { db: database.db, events },
            { executionSessionID: SessionID.make(held), from: SessionID.make(recorded.holder), token: bound.token, recoveredBy: authority },
          )
        if (!conflict) return
        if (!held || held === bound.executionSessionID || recorded.movedFrom.has(bound.executionSessionID))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })
        if (yield* ranProviderTurn(held))
          return yield* new RelayWorkflowBinding.Held({
            reason: "WORKFLOW_ARM_BINDING_MISMATCH",
            detail: `This arm is bound to Task session ${held}, which ran or is running. Arm a new contract for this Task.`,
          })
        yield* relay.rebind({ ...arm, from: held })
        yield* WorkflowRecordsV2.recordMove(
          { db: database.db, events },
          { executionSessionID: bound.executionSessionID, from: SessionID.make(held), token: bound.token, ...authority },
        )
      })

    // A child ran when it runs in this process now, a code-review hold was recorded for it, or a reply of it carries a
    // finish or any content: the V2 runner persists an empty reply before its pre-model checks.
    const ranProviderTurn = (executionSessionID: string) =>
      Effect.gen(function* () {
        if (Option.isNone(execution) || (yield* execution.value.active).has(SessionV2.ID.make(executionSessionID))) return true
        if ((yield* WorkflowRecordsV2.reviewHolds(database.db, executionSessionID)).length > 0) return true
        // A history that no longer decodes counts as run: an arm never moves on what Orchestra cannot read.
        return yield* store.entries(SessionV2.ID.make(executionSessionID)).pipe(
          Effect.map((entries) =>
            entries.some(
              (entry) => entry.message.type === "assistant" && (entry.message.finish !== undefined || entry.message.content.length > 0),
            ),
          ),
          Effect.catch(() => Effect.succeed(true)),
        )
      })

    const admit = (bound: Bound, continuation: boolean) =>
      within(bound, (placement) =>
        Effect.gen(function* () {
          const materialized = yield* placement.revalidate
          const binding = { ...bound.binding, definition: materialized.definition }
          const last = materialized.sprint.work_packages.at(-1)?.checklist ?? []
          if (!WorkflowRelayV2.GLOBAL_ACCEPTANCE.every((name) => last.some((control) => control.host_check === name)))
            return yield* new RelayWorkflowBinding.Held({
              reason: "WORKFLOW_GLOBAL_ACCEPTANCE_MISSING",
              detail: `The approved plan's last step carries ${JSON.stringify(
                last.flatMap((control) =>
                  control.host_check && WorkflowRelayV2.GLOBAL_ACCEPTANCE.includes(control.host_check)
                    ? [{ id: control.id, hostCheck: control.host_check }]
                    : [],
                ),
              )}; a workflow Task requires the ${WorkflowRelayV2.GLOBAL_ACCEPTANCE.join(" and ")} host checks there.`,
            })
          if (
            materialized.sprint.work_packages.some((wp) =>
              (wp.checklist ?? []).some((control) => control.host_check && !placement.checks.has(control.host_check)),
            )
          )
            return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_CHECK_UNBOUND" })
          const existing = yield* WorkflowRecordsV2.read(database.db, bound.executionSessionID)
          if (existing && (!isDeepStrictEqual(existing.binding, binding) || existing.token !== bound.token))
            return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
          const record = { ...bound, binding }
          if (!existing) {
            const arm = {
              token: bound.token,
              sprint: materialized.sprint,
              agentID: bound.executionSessionID,
              meta: {
                workdir: placement.host.directory,
                token: bound.token,
                project_id: placement.host.projectID,
                session_id: bound.executionSessionID,
                workflow: binding,
              },
            }
            yield* placement.relay.create(arm).pipe(
              Effect.catchIf(
                (error) => error._tag === "ArmCreate.Conflict",
                () => Effect.succeed("conflict" as const),
              ),
              Effect.flatMap((created) => (created === "created" ? Effect.void : moveArm(placement.relay, record, arm, created === "conflict"))),
              Effect.mapError((error) =>
                error instanceof RelayWorkflowBinding.Held ? error : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" }),
              ),
            )
            yield* events.publish(MaestroEvent.Task.WorkflowBound, record, { id: WorkflowGateV2.eventID(bound.executionSessionID) }).pipe(
              // A concurrent adoption of the same child stored first: only that same binding passes.
              Effect.catchCause((cause) =>
                Effect.gen(function* () {
                  const stored = yield* WorkflowRecordsV2.read(database.db, bound.executionSessionID)
                  if (!stored) return yield* Effect.failCause(cause)
                  if (stored.token !== bound.token || !isDeepStrictEqual(stored.binding, binding))
                    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
                }),
              ),
            )
          }
          const view = yield* placement.relay.currentStep(bound.token, binding)
          if (view.state === "awaiting-human" && !view.pending)
            return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_PARKED" })
          if (!continuation || view.state !== "active" || view.pending !== undefined) return
          if (Option.isSome(execution) && (yield* execution.value.active).has(SessionV2.ID.make(bound.executionSessionID)))
            return
          // The newest reply settled the current step and held for a code review before the arm graded it: the resume
          // grades it now. A reply a resume already graded runs again without a second grade.
          const reply = (yield* store.entries(SessionV2.ID.make(bound.executionSessionID)))
            .toReversed()
            .find((entry) => entry.message.type === "assistant")?.message.id
          const expected = { position: view.position, attempt: view.attempt, ledgerSeq: view.ledgerSeq }
          const atStep = (entry: { readonly token: string; readonly assistantMessageID: string; readonly expected: RelayArm.WorkflowPosition }) =>
            entry.token === bound.token && entry.assistantMessageID === reply && isDeepStrictEqual(entry.expected, expected)
          if (!reply || !(yield* WorkflowRecordsV2.reviewHolds(database.db, bound.executionSessionID)).some(atStep)) return
          if ((yield* WorkflowRecordsV2.findingsRecords(database.db, bound.executionSessionID)).some(atStep)) return
          yield* service.grade(record, { assistantMessageID: SessionMessage.ID.make(reply), expected })
        }),
      ).pipe(
        Effect.mapError((error) =>
          error instanceof RelayWorkflowBinding.Held ? error : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_ACQUISITION" }),
        ),
      )

    const service: Interface = Service.of({
      admit,
      current,
      settle: (position, settlement) => settle(position, settlement, false),
      grade: (bound, settlement) =>
        within(bound, (placement) =>
          WorkflowSettlementV2.gradeReviewedHold({
            coldReview: placement.checks.get("cold-review"),
            verdict: (receiptID) =>
              WorkflowRecordsV2.review(database.db, receiptID).pipe(Effect.map((review) => review?.verdict)),
            settle: Effect.gen(function* () {
              const position = yield* current(bound)
              return yield* settle(position, settlement, true)
            }),
            next: placement.relay.currentStep(bound.token, bound.binding).pipe(
              Effect.map((view) => ({ position: view.position, attempt: view.attempt, ledgerSeq: view.ledgerSeq })),
            ),
            record: (reviewID, expected) =>
              WorkflowRecordsV2.recordReviewFindings(
                { db: database.db, events },
                {
                  executionSessionID: bound.executionSessionID,
                  token: bound.token,
                  reviewID,
                  assistantMessageID: settlement.assistantMessageID,
                  expected,
                },
              ),
          }),
        ).pipe(
          Effect.mapError((error) =>
            error instanceof RelayWorkflowBinding.Held
              ? error
              : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_ACQUISITION" }),
          ),
        ),
    })
    yield* sessions.register({ current: service.current, settle: service.settle })
    return service
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [
    Database.node,
    SessionStore.node,
    LocationServiceMap.node,
    EventV2.node,
    RelayWorkflowSession.node,
    GitCli.node,
    FSUtil.node,
    AppProcess.node,
  ],
})
