export * as CapabilityConnectionSetupFixture from "./capability-connection-setup"

import { expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { randomUUID } from "node:crypto"
import { Effect, Schema, Tracer } from "effect"
import { CapabilityConnectionSetup } from "../../src/capability/connection/setup"
import type { CapabilityConnectionSetupContract } from "../../src/capability/connection/setup-contract"
import type { CapabilityConnectionStoreContract } from "../../src/capability/connection/store-contract"
import type { CapabilityOperatorContract } from "../../src/capability/operator/contract"
import { CapabilityOperator } from "../../src/capability/operator/index"
import { CapabilityConnectionTable, CapabilityRequestTable } from "../../src/capability/sql"
import { CredentialTable } from "../../src/credential/sql"
import { Database } from "../../src/database/database"
import { ProjectTable } from "../../src/project/sql"
import { CapabilityConnectionManagementFixture } from "./capability-connection-management"

export const layer = CapabilityConnectionManagementFixture.layer
export const placement = CapabilityConnectionManagementFixture.placement
export const input: CapabilitySetup.Input = { provider: "slack", key: "setup-fixture-private-key", label: "user-owned account label" }

/** Actual dependency factories only. Missing modules/reconcile fail; no substitute or skip. */
export function fixture(options: { maxReceipts?: number; response?: (request: Request) => Response | Promise<Response> } = {}) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const { CapabilityRequest }: { CapabilityRequest: {
      make: (options: { operators: CapabilityOperatorContract.Interface; maxReceipts?: number }) =>
        Effect.Effect<CapabilityConnectionSetupContract.Options["ledger"], CapabilityConnectionStoreContract.Error, Database.Service>
    } } = yield* Effect.promise(() => import(new URL("../../src/capability/operator/request.ts", import.meta.url).href))
    const { CapabilityConnectionVerification }: { CapabilityConnectionVerification: {
      make: (options: { fixtureOrigin: string }) => Effect.Effect<CapabilityConnectionSetupContract.Verifier, CapabilityConnectionStoreContract.Error>
    } } = yield* Effect.promise(() => import(new URL("../../src/capability/connection/verify.ts", import.meta.url).href))
    const operators = yield* CapabilityOperator.make({ principal: `setup-${randomUUID()}`, scope: { placements: "instance", actions: ["*"] } })
    const ledger = yield* CapabilityRequest.make({ operators, maxReceipts: options.maxReceipts })
    if (typeof ledger.reconcile !== "function") return yield* Effect.die("Actual ledger reconciliation dependency is pending")
    const seen: { path: string; authorization: string | null }[] = []
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch(request) {
        seen.push({ path: new URL(request.url).pathname, authorization: request.headers.get("authorization") })
        return options.response ? options.response(request) : Response.json(new URL(request.url).pathname === "/api/auth.test"
          ? { ok: true, team_id: "T123", user_id: "U456", bot_id: "B789", secret: input.key }
          : { id: "123456789012345678", bot: true, secret: input.key })
      },
    })), (server) => Effect.promise(() => server.stop(true)))
    const actual = yield* CapabilityConnectionVerification.make({ fixtureOrigin: server.url.origin })
    const writerStates: boolean[] = []
    const verifier: CapabilityConnectionSetupContract.Verifier = { verify: (value) => Effect.gen(function* () {
      if (!database.inTransaction) return yield* Effect.die("Missing real SQL transaction identity")
      writerStates.push(yield* database.inTransaction)
      expect(writerStates[writerStates.length - 1]).toBe(false)
      return yield* actual.verify(value)
    }) }
    const setup = yield* CapabilityConnectionSetup.make({ operators, ledger, verifier })
    yield* database.db.insert(ProjectTable).values({ id: placement.projectID,
      worktree: placement.location.directory, sandboxes: [] }).onConflictDoNothing().run()
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, key: string = randomUUID(), authority = operators.configured) =>
      operators.withRequest(authority, { requestID: randomUUID(), idempotencyKey: key }, effect)
    const rows = Effect.gen(function* () {
      return { credentials: yield* database.db.select().from(CredentialTable),
        connections: yield* database.db.select().from(CapabilityConnectionTable),
        receipts: yield* database.db.select().from(CapabilityRequestTable) }
    })
    return { database, operators, ledger, verifier, setup, seen, writerStates, run, rows }
  })
}

export function result(receipt: { data: Schema.Json }) {
  return Schema.decodeUnknownSync(CapabilitySetup.Result)(receipt.data)
}

export function failed<A, E>(exit: import("effect").Exit.Exit<A, E>) {
  return CapabilityConnectionManagementFixture.failed(exit)
}

export function expectCode<A, E>(exit: import("effect").Exit.Exit<A, E>, code: Capability.ErrorCode) {
  const cause = CapabilityConnectionManagementFixture.expectCode(exit, code)
  cause.reasons.forEach((reason) => expect(JSON.stringify(reason)).not.toContain(input.key))
}

/** Reuse the real writer holder; map only the selected setup span to its admission checkpoint. */
export function checkpoint(database: Database.Interface, span: "reconcile" | "commit",
  change: (tx: CapabilityConnectionStoreContract.Transaction) => Effect.Effect<void, CapabilityConnectionStoreContract.Error>) {
  return CapabilityConnectionManagementFixture.writerCheckpoint(database, change).pipe(Effect.map((hold) => {
    const tracer = Tracer.make({ span: (options) => hold.tracer.span({ ...options,
      name: options.name === `CapabilityConnectionSetup.${span}` ? "CapabilityConnectionManagement.commit" : options.name }) })
    return { ...hold, start: <A, E, R>(effect: Effect.Effect<A, E, R>) => hold.start(effect.pipe(Effect.withTracer(tracer))) }
  }))
}
