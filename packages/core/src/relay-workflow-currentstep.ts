export * as RelayWorkflowCurrentStep from "./relay-workflow-currentstep"

import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Effect, Option, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { ArmLoad } from "@orchestra/relay/arm/load"
import { ArmState } from "@orchestra/relay/arm/state"
import { LedgerRead } from "@orchestra/relay/ledger/read"
import { RelayWorkflowBinding } from "./relay-workflow-binding"

export interface View extends RelayArm.WorkflowPosition {
  readonly state: RelayArm.State
  readonly index: number
  readonly wp: string
  readonly instructions: string
}

// Pure view: no position migration, run-lock recovery, macro markers, entered_at or retry writes. In particular,
// ArmState.position is deliberately not used: it writes legacy migration state even on a nominal read.
export const read = Effect.fn("RelayWorkflowCurrentStep.read")(function* (
  token: RelayArm.Token,
  binding: RelayArm.WorkflowBinding,
) {
  const arm = yield* ArmState.dir(token)
  const loaded = yield* ArmLoad.arm(arm)
  if (!isDeepStrictEqual(loaded.meta.workflow, binding) ||
    loaded.meta.project_id !== binding.definition.publication.projectID ||
    loaded.meta.session_id !== binding.executionSessionID)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_BINDING_MISMATCH" })
  if (RelayWorkflowBinding.digest(loaded.sprintBytes) !== binding.definition.materialization.digest ||
    loaded.sprintBytes.length !== binding.definition.materialization.byteLength)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_MATERIALIZATION_DRIFT" })
  const rawState = yield* ArmState.read(arm, RelayArm.Files.state)
  const state = Option.getOrElse(rawState, () => "active").replace(/\n+$/, "")
  if (!Schema.is(RelayArm.State)(state))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_STATE_INVALID" })
  const rawPosition = Option.getOrUndefined(yield* ArmState.read(arm, RelayArm.Files.position))
  const counter = Option.getOrElse(yield* ArmState.read(arm, RelayArm.Files.counter), () => "0").trim()
  if (!/^\d+$/.test(counter) || !Number.isSafeInteger(Number(counter)))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_POSITION_INVALID" })
  const position = rawPosition || (loaded.sprint.work_packages[Number(counter)]
    ? ArmState.canonicalPosition(loaded.sprint.work_packages[Number(counter)]) : undefined)
  if (!position) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_POSITION_INVALID" })
  const index = yield* Option.match(ArmState.resolve(loaded.sprint, position), {
    onNone: () => Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_POSITION_INVALID" })),
    onSome: Effect.succeed,
  })
  const wp = loaded.sprint.work_packages[index]
  const retry = Option.getOrElse(yield* ArmState.read(arm, `retry_${ArmState.safe(wp.id)}`), () => "0").trim()
  const regression = Option.getOrElse(yield* ArmState.read(arm, RelayArm.Files.regRetry), () => "0").trim()
  if (![retry, regression].every((value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ATTEMPT_INVALID" })
  const entries = yield* LedgerRead.entries(path.join(arm, RelayArm.Files.ledger)).pipe(
    Effect.catchTag("LedgerRead.Missing", () => Effect.succeed([])),
  )
  const seq = entries.at(-1)?.seq ?? -1
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < -1)
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_LEDGER_INVALID" })
  const macro = wp.macro ? loaded.sprint.macros?.find((macro) => macro.id === wp.macro)?.instructions : undefined
  return {
    position, attempt: Number(retry) + Number(regression), ledgerSeq: seq,
    state: state === "escalated" ? "awaiting-human" : state,
    index, wp: wp.id,
    instructions: [macro, wp.instructions,
      wp.self_check?.length ? `Before finishing this step:\n${wp.self_check.map((item) => `- ${item}`).join("\n")}` : undefined,
      wp.kind === "review" ? "REVIEW: cold-read frozen artifacts. Their author cannot review them in this context." : undefined,
    ].filter((text): text is string => !!text).join("\n\n"),
  } satisfies View
})
