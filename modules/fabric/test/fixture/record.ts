import { expect } from "bun:test"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { Database } from "@orchestra/core/database/database"
import { Capability } from "@orchestra/schema/capability"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { FabricRecord } from "@orchestra/schema/fabric-record"
import { Effect, Exit, Layer } from "effect"
import { FabricContexts } from "../../src/context"
import { FabricRecords } from "../../src/record"
import type { FabricRecordsContract } from "../../src/record-contract"
import { FabricRecordTable } from "../../src/record/sql"
import { layer, owner, request } from "./context"

export const layers = (filename: string) => Layer.merge(layer(filename), CredentialCipher.layer)
export const rows = Effect.gen(function* () {
  const database = yield* Database.Service
  return yield* database.db.select().from(FabricRecordTable)
})
export function setup(
  root: import("@orchestra/schema/schema").AbsolutePath,
  limits?: Partial<FabricRecordsContract.Limits>,
) {
  return Effect.gen(function* () {
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root })
    const context = (yield* request(operators, contexts.create({}))).context
    const records = yield* FabricRecords.make({ operators, root, limits })
    const write = {
      context,
      id: FabricRecord.ID.create(),
      kind: "draft" as const,
      expected: null,
      payload: "SYNTHETIC_FABRIC_PROTECTED_PAYLOAD_á😀",
    }
    return { operators, contexts, context, records, write }
  })
}
export function refusal<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  code: FabricRecord.Failure["code"] | Capability.ErrorCode,
) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("Expected protected-record refusal")
    expect(exit.cause.reasons).toHaveLength(1)
    const reason = exit.cause.reasons[0]
    expect(reason._tag).toBe("Fail")
    if (reason._tag !== "Fail") throw new Error("Defect/interruption is not an expected record refusal")
    expect(
      reason.error instanceof FabricRecord.Failure ||
        reason.error instanceof FabricContext.Failure ||
        reason.error instanceof Capability.Failure,
    ).toBe(true)
    if (
      !(reason.error instanceof FabricRecord.Failure) &&
      !(reason.error instanceof FabricContext.Failure) &&
      !(reason.error instanceof Capability.Failure)
    )
      throw new Error("Unexpected error type")
    expect(reason.error.code).toBe(code)
    expect(JSON.stringify(reason.error)).not.toContain("SYNTHETIC_FABRIC")
    return reason.error
  })
}
