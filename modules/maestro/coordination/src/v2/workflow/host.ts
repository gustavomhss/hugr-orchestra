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
import { SkillV2 } from "@orchestra/core/skill"
import type { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { RelayArm } from "@orchestra/schema/relay-arm"
import { MaestroSeats } from "../seats-service"
import { WorkflowArmV2 } from "./arm"
import { WorkflowRecordsV2 } from "./records"
import { WorkflowRelayV2 } from "./relay"
import { WorkflowSettlementV2 } from "./settlement"

// V2 port of V1's workflow session host (`apps/orchestra/src/maestro/arsenal-completion.ts` `workflowSessionHost`). V1
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
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/maestro/WorkflowHost") {}

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

    // The placement a binding names, opened in its authority Session's Location: the Relay that holds its arm, the
    // publication port that revalidates its plan and the two global acceptance checks bound to that Session.
    const within = <A, E>(
      bound: Bound,
      use: (placement: {
        readonly relay: Relay.Interface
        readonly revalidate: Effect.Effect<Effect.Success<ReturnType<typeof RelayWorkflowBinding.revalidate>>, RelayWorkflowBinding.Held>
        readonly checks: ReadonlyMap<string, Effect.Effect<WorkflowSettlementV2.Outcome, unknown>>
        readonly host: Pick<WorkflowSettlementV2.Binding, "projectID" | "sessionID">
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

    const service = Service.of({
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
