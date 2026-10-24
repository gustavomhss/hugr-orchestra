export * as MaestroGovernanceV2 from "./governance"

import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { SessionSchema, SessionStore } from "@orchestra/core/session"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Seats } from "../seats"
import { CallerGateV2 } from "./governance/caller"
import { GovernanceInputV2 } from "./governance/input"
import { UnsupportedV2 } from "./governance/unsupported"
import { WorkflowGateV2 } from "./governance/workflow"
import { WriteRootsV2 } from "./governance/write-roots"
import { MaestroSeats } from "./seats-service"

const decode = Schema.decodeUnknownOption(GovernanceInputV2.Input)

/**
 * Maestro's Task governance on V2, in V1's phase order: the caller seat's native profile, the workflow holds, the
 * phases whose host is not on V2 yet (refused, never skipped), then a write-roots seat's bound scope as the child's
 * rules. A plain Task otherwise delegates exactly as core's `allowAll`.
 */
export const make = Effect.gen(function* () {
  const seats = yield* MaestroSeats.Service
  const store = yield* SessionStore.Service
  const database = yield* Database.Service
  const location = yield* Location.Service
  const fs = yield* FSUtil.Service
  // The roster loads lazily (see `seats.ts`); where it cannot load no agent is a seat, so no profile is read.
  const roster = yield* Effect.tryPromise(() => import("../roster")).pipe(Effect.option)
  const profiles = roster._tag === "Some" ? roster.value.nativeProfiles : {}
  return TaskGovernance.Service.of({
    input: GovernanceInputV2.fields,
    admit: (admission) =>
      Effect.gen(function* () {
        const input = decode(admission.input)
        if (input._tag === "None") return yield* new ToolFailure({ message: "Task denied: governance-input-invalid" })
        const target = admission.target.id
        yield* CallerGateV2.check(seats, profiles, admission.context.agent, target)
        yield* UnsupportedV2.check(seats, target, input.value)
        yield* WorkflowGateV2.check(database, { parentID: admission.parent.id, taskID: input.value.task_id })
        if (!seats.has(target) || !Seats.all[target]?.writeRoots) return {}
        const resumed = input.value.task_id
        const recorded =
          resumed && Schema.is(SessionSchema.ID)(resumed) ? yield* store.permissions(resumed) : []
        return { permissions: yield* WriteRootsV2.bind(fs, location, input.value.writePaths, recorded) }
      }),
    beforeTurn: TaskGovernance.allowAll.beforeTurn,
    settle: TaskGovernance.allowAll.settle,
  })
})

export const node = makeLocationNode({
  service: TaskGovernance.Service,
  layer: Layer.effect(TaskGovernance.Service, make),
  deps: [MaestroSeats.node, SessionStore.node, Database.node, Location.node, FSUtil.node],
})

/** Task governance and the write-roots ToolSafety, after the Arsenal's replacements (a later replacement wins). */
export const replacements = [
  [TaskGovernance.node, node],
  [ToolSafety.node, WriteRootsV2.safetyNode],
] as const
