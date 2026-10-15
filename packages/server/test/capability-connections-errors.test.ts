import { expect } from "bun:test"
import type { CapabilityConnectionStoreContract } from "@orchestra/core/capability/connection/store-contract"
import { ForbiddenError, UnauthorizedError } from "@orchestra/protocol/errors"
import { Capability } from "@orchestra/schema/capability"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { Cause, Context, Effect, Exit, Schema } from "effect"
import { ConnectionError, SqlError } from "effect/unstable/sql/SqlError"
import { it } from "../../core/test/lib/effect"
import { connectionResponse } from "../src/handlers/capability-connections"
import { CapabilityConnectionsFixture } from "./capability-connections-fixture"

it.live("connection response redacts each expected Fail while retaining mixed lifecycle reasons and annotations", () => Effect.gen(function* () {
  const defect = new Error("lifecycle-defect")
  const failures: CapabilityConnectionStoreContract.Error[] = [
    new Capability.Failure({ code: "authentication_required", message: "private-auth" }),
    new Capability.Failure({ code: "target_denied", message: "private-target" }),
    new SqlError({ reason: new ConnectionError({ cause: "private-sql", message: "private-query" }) }),
    new EffectDrizzleQueryError({ query: "private-query", params: ["private-params"], cause: "private-driver" }),
  ]
  const original = Cause.fromReasons([
    ...failures.flatMap((failure) => Cause.fail(failure).reasons),
    ...Cause.die(defect).reasons, ...Cause.interrupt(914).reasons,
  ].map((reason, index) => reason.annotate(Context.makeUnsafe(new Map([["annotation", index]])))))
  const exit = yield* connectionResponse(Effect.failCause(original)).pipe(Effect.exit)
  if (Exit.isSuccess(exit)) return yield* Effect.die("Expected failed mixed Cause")
  expect(exit.cause.reasons.map((reason) => reason._tag)).toEqual(["Fail", "Fail", "Fail", "Fail", "Die", "Interrupt"])
  expect(exit.cause.reasons.map((reason) => Object.fromEntries(reason.annotations))).toEqual(
    original.reasons.map((reason) => Object.fromEntries(reason.annotations)),
  )
  exit.cause.reasons.slice(0, 4).forEach((reason, index) => {
    if (reason._tag !== "Fail") throw new Error("Expected mapped failure")
    expect(reason.error).toBeInstanceOf(index === 0 ? UnauthorizedError : ForbiddenError)
    expect(Schema.encodeUnknownSync(index === 0 ? UnauthorizedError : ForbiddenError)(reason.error)).toEqual(index === 0
      ? { _tag: "UnauthorizedError", message: "Authentication required" }
      : { _tag: "ForbiddenError", message: "Request denied" })
  })
  exit.cause.reasons.slice(4).forEach((reason, index) => expect(reason === original.reasons[index + 4]).toBe(true))
  expect(exit.cause.reasons[4]._tag === "Die" && exit.cause.reasons[4].defect).toBe(defect)
}))

it.live("real HTTP SQL query failure returns constant denial without query or parameter metadata", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionsFixture.make()
  const auth = yield* f.issue()
  const path = `/api/capability/connections/${f.parent.id}`
  expect((yield* f.request(path, { auth })).status).toBe(200)
  yield* f.database.db.run("DROP TABLE capability_connection")
  const response = yield* f.request(path, { auth })
  expect(response.status).toBe(403)
  expect(yield* Effect.promise(() => response.json())).toEqual({ _tag: "ForbiddenError", message: "Request denied" })
}), 20_000)
