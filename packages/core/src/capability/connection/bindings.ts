export * as CapabilityConnectionBindings from "./bindings"

import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { and, eq, gt, isNull, sql } from "drizzle-orm"
import { Cause, Effect, Option, Schema } from "effect"
import { Database } from "../../database/database"
import { SessionTable } from "../../session/sql"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../sql"
import type { CapabilityConnectionBindingsContract } from "./bindings-contract"
import type { CapabilityConnectionStoreContract } from "./store-contract"
import { capture, decode } from "./input"

export function make(options: CapabilityConnectionBindingsContract.Options) {
  const operators = Object.freeze({ ...options.operators })
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const list: CapabilityConnectionBindingsContract.Interface["list"] = (id, input) => {
      const captured = capture({ id, input }, decode(Schema.Struct({ id: Capability.TargetID, input: CapabilityManagement.BindingQuery })))
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        const parent = yield* database.db.select({ projectID: CapabilityConnectionTable.project_id,
          directory: CapabilityConnectionTable.directory, workspaceID: CapabilityConnectionTable.workspace_id,
          state: CapabilityConnectionTable.state }).from(CapabilityTargetTable)
          .innerJoin(CapabilityConnectionTable, eq(CapabilityTargetTable.connection_id, CapabilityConnectionTable.id))
          .where(eq(CapabilityTargetTable.id, value.id)).get()
        if (!parent || parent.state !== "active") return yield* unavailable()
        const target = Object.freeze({ action: "binding.list", resource: Object.freeze({ kind: "target", id: value.id }),
          placement: Object.freeze({ projectID: parent.projectID, location: Object.freeze({ directory: parent.directory,
            ...(parent.workspaceID === null ? {} : { workspaceID: parent.workspaceID }) }) }) })
        const binding = yield* operators.require(target)
        const limit = value.input.limit ?? 16
        // Current persisted actor and placement filter in SQL, before keyset pagination.
        const rows = yield* database.db.select({ sessionID: CapabilityBindingTable.session_id,
          actions: sql<string>`${CapabilityBindingTable.actions}` }).from(CapabilityBindingTable)
          .innerJoin(SessionTable, eq(CapabilityBindingTable.session_id, SessionTable.id)).where(and(
            eq(CapabilityBindingTable.target_id, value.id), eq(CapabilityBindingTable.agent_id, SessionTable.agent),
            sql`${SessionTable.agent} <> '' AND ${SessionTable.agent} = trim(${SessionTable.agent})`,
            eq(SessionTable.project_id, parent.projectID), eq(SessionTable.directory, parent.directory),
            parent.workspaceID === null ? isNull(SessionTable.workspace_id) : eq(SessionTable.workspace_id, parent.workspaceID),
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
        yield* operators.validate(binding, target)
        return Object.freeze({ items: Object.freeze(items), coverage: "current-actor" as const,
          ...(rows.length > limit ? { after: rows[limit - 1].sessionID } : {}) })
      }).pipe(Effect.catchCauseIf(pureAuthorityRejection, () => Effect.fail(unavailable())))
    }
    return Object.freeze({ list }) satisfies CapabilityConnectionBindingsContract.Interface
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
