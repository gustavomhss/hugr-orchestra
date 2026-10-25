export * as CapabilityConnectionBindings from "./bindings"

import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { Cause, Effect, Option, Schema } from "effect"
import { Database } from "../../database/database"
import { SessionTable } from "../../session/sql"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../sql"
import type { CapabilityOperatorContract } from "../operator/contract"
import type { CapabilityConnectionBindingsContract } from "./bindings-contract"
import type { CapabilityConnectionStoreContract } from "./store-contract"
import { capture, decode } from "./input"

// SQLite's default trim removes only ASCII space. This closed ECMAScript WhiteSpace/LineTerminator
// set matches JS trim, so invalid actors cannot consume a page slot before LIMIT.
const actorTrim = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"

export function make(options: CapabilityConnectionBindingsContract.Options) {
  const operators = Object.freeze({ ...options.operators })
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const parent = Effect.fn("CapabilityConnectionBindings.parent")(function* (id: Capability.TargetID) {
      const row = yield* database.db.select({ id: CapabilityTargetTable.id, connectionID: CapabilityTargetTable.connection_id,
        generation: CapabilityTargetTable.generation, environment: CapabilityTargetTable.environment,
        projectID: CapabilityConnectionTable.project_id, directory: CapabilityConnectionTable.directory,
        workspaceID: CapabilityConnectionTable.workspace_id, state: CapabilityConnectionTable.state }).from(CapabilityTargetTable)
        .innerJoin(CapabilityConnectionTable, eq(CapabilityTargetTable.connection_id, CapabilityConnectionTable.id))
        .where(eq(CapabilityTargetTable.id, id)).get()
      if (!row || row.state !== "active") return yield* unavailable()
      return row
    })
    const authorize = Effect.fn("CapabilityConnectionBindings.authorize")(function* (
      row: Effect.Success<ReturnType<typeof parent>>, action: string,
    ) {
      const target: CapabilityOperatorContract.Target = Object.freeze({ action, resource: Object.freeze({ kind: "target", id: row.id }),
        placement: Object.freeze({ projectID: row.projectID, location: Object.freeze({ directory: row.directory,
          ...(row.workspaceID === null ? {} : { workspaceID: row.workspaceID }) }) }) })
      return { target, binding: yield* operators.require(target) }
    })
    const get: CapabilityConnectionBindingsContract.Interface["get"] = (id) => {
      const captured = capture(id, decode(Capability.TargetID))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const row = yield* parent(captured.value)
        const allowed = yield* authorize(row, "target.get")
        const target = Schema.decodeUnknownOption(Schema.toType(Capability.TargetRef))({ id: row.id,
          connectionID: row.connectionID, generation: row.generation, environment: row.environment })
        if (Option.isNone(target)) return yield* unavailable()
        yield* operators.validate(allowed.binding, allowed.target)
        return Object.freeze({ target: Object.freeze(target.value) })
      }).pipe(Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())))
    }
    const list: CapabilityConnectionBindingsContract.Interface["list"] = (id, input) => {
      const captured = capture({ id, input }, decode(Schema.Struct({ id: Capability.TargetID, input: CapabilityManagement.BindingQuery })))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        const row = yield* parent(value.id)
        const allowed = yield* authorize(row, "binding.list")
        const limit = value.input.limit ?? 16
        // Current persisted actor and placement filter in SQL, before keyset pagination.
        const rows = yield* database.db.select({ sessionID: CapabilityBindingTable.session_id,
          actions: sql<string>`${CapabilityBindingTable.actions}` }).from(CapabilityBindingTable)
          .innerJoin(SessionTable, eq(CapabilityBindingTable.session_id, SessionTable.id)).where(and(
            eq(CapabilityBindingTable.target_id, value.id), eq(CapabilityBindingTable.agent_id, SessionTable.agent),
            sql`${SessionTable.agent} <> '' AND ${SessionTable.agent} = trim(${SessionTable.agent}, ${actorTrim})`,
            eq(SessionTable.project_id, row.projectID), eq(SessionTable.directory, row.directory),
            row.workspaceID === null ? isNull(SessionTable.workspace_id) : eq(SessionTable.workspace_id, row.workspaceID),
            value.input.after === undefined ? undefined : gt(CapabilityBindingTable.session_id, value.input.after),
          )).orderBy(CapabilityBindingTable.session_id).limit(limit + 1).all()
        const items = yield* Effect.forEach(rows.slice(0, limit), (row) => {
          if (row.actions.length > 65536) return Effect.fail(unavailable())
          const actions = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(row.actions)
          if (Option.isNone(actions)) return Effect.fail(unavailable())
          const parsed = capture({ sessionID: row.sessionID, actions: actions.value }, decode(CapabilityManagement.BindingInput))
          if (!parsed.ok || parsed.value.actions.some((action) => action !== action.trim())) return Effect.fail(unavailable())
          return Effect.succeed(Object.freeze({ sessionID: parsed.value.sessionID, actions: Object.freeze(parsed.value.actions) }))
        })
        yield* operators.validate(allowed.binding, allowed.target)
        return Object.freeze({ items: Object.freeze(items), coverage: "current-actor" as const,
          ...(rows.length > limit ? { after: rows[limit - 1].sessionID } : {}) })
      }).pipe(Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())))
    }
    return Object.freeze({ get, list }) satisfies CapabilityConnectionBindingsContract.Interface
  })
}

export type Interface = CapabilityConnectionBindingsContract.Interface

function pureAuthorityRejection(cause: Cause.Cause<CapabilityConnectionStoreContract.Error>) {
  return cause.reasons.length > 0 && cause.reasons.every((reason) => reason._tag === "Fail" &&
    reason.error instanceof Capability.Failure && ["invocation_binding_missing", "invocation_binding_mismatch",
      "target_denied", "authentication_required", "authentication_revoked"].includes(reason.error.code))
}

function unavailable() {
  return new Capability.Failure({ code: "connection_unavailable", message: "Capability connection is unavailable" })
}
