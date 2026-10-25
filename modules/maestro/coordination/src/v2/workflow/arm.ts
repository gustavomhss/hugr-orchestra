export * as WorkflowArmV2 from "./arm"

import { ToolFailure } from "@orchestra/llm"
import { and, desc, eq, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import type { PermissionV2 } from "@orchestra/core/permission"
import type { Relay } from "@orchestra/core/relay"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { SessionEvent } from "@orchestra/schema/session-event"
import { ArsenalObservations } from "../../arsenal-observations"
import { WorkflowGateV2 } from "../governance/workflow"
import { WorkflowSettlementV2 } from "./settlement"

/** The Arsenal capability that arms, and releases, a Relay completion contract. */
export const CAPABILITY = "relay-arm"

/**
 * The Session's own completion-arm facts, newest first: the native record of what Maestro armed through the Arsenal.
 * A history past 256 arms holds instead of reading a guessed prefix.
 */
export const arms = Effect.fn("WorkflowArmV2.arms")(function* (database: Database.Interface, sessionID: string) {
  const rows = yield* database.db
    .select()
    .from(EventV2.EventTable)
    .where(
      and(
        eq(EventV2.EventTable.aggregate_id, sessionID),
        eq(EventV2.EventTable.type, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)),
        sql`json_extract(${EventV2.EventTable.data}, '$.structured.nativeArsenal.kind') = 'completion-arm'`,
      ),
    )
    .orderBy(desc(EventV2.EventTable.seq))
    .limit(257)
    .all()
    .pipe(Effect.orDie)
  if (rows.length > 256) return yield* new ToolFailure({ message: "Tool safety HOLD: COMPLETION_ARM_HISTORY_OVERFLOW" })
  return rows.flatMap((row) =>
    Option.toArray(
      Schema.decodeUnknownOption(
        Schema.Struct({
          structured: Schema.Struct({
            nativeArsenal: Schema.Struct({
              ...ArsenalObservations.NativeFact.fields,
              token: Schema.NonEmptyString,
              projectID: Schema.String,
              directory: Schema.String,
            }),
          }),
        }),
      )(row.data).pipe(Option.map((data) => ({ id: row.id, ...data.structured.nativeArsenal }))),
    ),
  )
})

/**
 * The arm receipt a workflow Task binds to: the newest completion contract this Session armed, in this placement.
 * Undefined when the Session armed nothing; an arm recorded for another placement holds.
 */
export const receipt = Effect.fn("WorkflowArmV2.receipt")(function* (
  database: Database.Interface,
  input: { readonly sessionID: string; readonly directory: string; readonly projectID: string },
) {
  const arm = (yield* arms(database, input.sessionID)).at(0)
  if (!arm) return undefined
  if (arm.projectID !== input.projectID || arm.directory !== input.directory)
    return yield* new ToolFailure({ message: "Tool safety HOLD: COMPLETION_ARM_PLACEMENT_MISMATCH" })
  return { token: arm.token, eventID: arm.id }
})

/**
 * The Arsenal execute guards for the Relay arm, as V1's native bindings keep them: a Session already bound to a
 * workflow Task never changes its arm, an arm names its own Session, and every successful arm records its token as a
 * native completion-arm fact the workflow Task reads back as its receipt. A release names an arm this Session armed
 * natively, and only the owner's answer to the approval releases it (V1's ArsenalBindings.release).
 */
export function hooks(input: {
  readonly database: Database.Interface
  readonly observations: ArsenalObservations.Interface
  readonly placement: { readonly directory: string; readonly projectID: string }
  readonly relay: Relay.Interface
  readonly permission: PermissionV2.Interface
}) {
  return {
    beforeExecute: (context: Tool.Context, name: string, args: unknown) =>
      Effect.gen(function* () {
        if (name !== CAPABILITY) return
        if (yield* WorkflowGateV2.bound(input.database, context.sessionID))
          return yield* new ToolFailure({
            message:
              "WORKFLOW_NATIVE_ARM_MUTATION_REFUSED: a workflow Task is already bound in this Session, so its arm cannot change; arm before dispatching the workflow Task, never after.",
          })
        const request = Schema.decodeUnknownOption(
          Schema.Struct({ action: Schema.String, contract: Schema.optional(Schema.Struct({ sessionID: Schema.String })) }),
        )(args)
        if (Option.isSome(request) && request.value.action === "arm" && request.value.contract?.sessionID !== context.sessionID)
          return yield* new ToolFailure({ message: "COMPLETION_ARM_SESSION_MISMATCH" })
      }),
    afterExecute: (context: Tool.Context, name: string, args: unknown, result: unknown) =>
      Effect.gen(function* () {
        if (name !== CAPABILITY) return
        const action = Schema.decodeUnknownOption(Schema.Struct({ action: Schema.Literals(["arm", "release"]) }))(args)
        if (Option.isNone(action)) return
        if (action.value.action === "release") {
          const request = Schema.decodeUnknownOption(
            Schema.Struct({ token: Schema.NonEmptyString, reason: Schema.NonEmptyString }),
          )(args)
          if (Option.isNone(request)) return yield* new ToolFailure({ message: "COMPLETION_RELEASE_INVALID" })
          if (!(yield* arms(input.database, context.sessionID)).some((entry) => entry.token === request.value.token))
            return yield* new ToolFailure({ message: "COMPLETION_RELEASE_TOKEN_UNBOUND" })
          return yield* WorkflowSettlementV2.release({
            relay: input.relay,
            token: request.value.token,
            reason: request.value.reason,
            approve: (message) =>
              input.permission.askExplicit({
                sessionID: context.sessionID,
                agent: context.agent,
                action: "completion_release",
                resources: [`relay-arm:${request.value.token}`],
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                metadata: { nativeSafety: true, projectID: input.placement.projectID, message },
              }),
          })
        }
        const armed = yield* Schema.decodeUnknownEffect(
          Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }),
        )(result).pipe(
          Effect.flatMap((envelope) =>
            Schema.decodeUnknownEffect(
              Schema.fromJsonString(
                Schema.Struct({ token: Schema.NonEmptyString, contract: Schema.Struct({ sessionID: Schema.String }) }),
              ),
            )(envelope.content.at(0)?.text ?? ""),
          ),
          Effect.mapError(() => new ToolFailure({ message: "COMPLETION_ARM_RECEIPT_INVALID" })),
        )
        if (armed.contract.sessionID !== context.sessionID)
          return yield* new ToolFailure({ message: "COMPLETION_ARM_SESSION_MISMATCH" })
        yield* input.observations.emit({
          sessionID: context.sessionID,
          assistantMessageID: context.assistantMessageID,
          callID: context.toolCallID,
          placement: input.placement,
          fact: {
            source: "native-host",
            version: 1,
            kind: "completion-arm",
            tool: MaestroArsenal.names.execute,
            token: armed.token,
          },
        })
      }),
  }
}
