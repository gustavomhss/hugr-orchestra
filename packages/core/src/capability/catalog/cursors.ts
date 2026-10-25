export * as CapabilityCursors from "./cursors"

import { randomBytes } from "node:crypto"
import { Effect } from "effect"
import { Capability } from "@orchestra/schema/capability"

export type PreflightScope = Readonly<{
  owner: Capability.Owner
  query: string
  provider: string
  limit: number
  requestedConnectionID?: Capability.ConnectionID
  requestedTargetID?: Capability.TargetID
}>
export type Scope = PreflightScope & Readonly<{
  connectionID: Capability.ConnectionID
  targetID: Capability.TargetID
  connectionGeneration: number
  targetGeneration: number
  catalogGeneration: number
  catalogHash: string
  visibilityHash: string
  canonicalIdentity: object
}>
export type Store = {
  issue: (scope: Scope, offset: number) => Effect.Effect<string, Capability.Failure>
  preflight: (cursor: string, scope: PreflightScope) => Effect.Effect<void, Capability.Failure>
  read: (cursor: string, scope: Scope) => Effect.Effect<number, Capability.Failure>
  remove: (cursor: string) => Effect.Effect<void>
  clear: () => Effect.Effect<void>
}

/** Random handles disclose no query, actor, placement or selection. Scope is host-only metadata. */
export function make(options: { maxEntries: number; ttlMillis: number; now: () => number }): Effect.Effect<Store> {
  return Effect.sync(() => {
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries <= 0 ||
      !Number.isFinite(options.ttlMillis) || options.ttlMillis <= 0) throw new RangeError("Invalid cursor bounds")
    const records = new Map<string, { scope: Scope; offset: number; expiresAt: number }>()
    const check = (cursor: string, scope: PreflightScope) => {
      const record = records.get(cursor)
      const now = options.now()
      if (!record || !Number.isFinite(now) || record.expiresAt <= now || !sameOwner(record.scope.owner, scope.owner) ||
        record.scope.query !== scope.query || record.scope.provider !== scope.provider || record.scope.limit !== scope.limit ||
        record.scope.requestedConnectionID !== scope.requestedConnectionID || record.scope.requestedTargetID !== scope.requestedTargetID)
        return stale()
      return record
    }
    return {
      issue: (scope, offset) => Effect.suspend(() => {
        const now = options.now()
        if (!Number.isFinite(now) || !Number.isFinite(now + options.ttlMillis) ||
          !Number.isSafeInteger(offset) || offset < 0) return Effect.fail(stale())
        Array.from(records).forEach(([key, record]) => { if (record.expiresAt <= now) records.delete(key) })
        if (records.size >= options.maxEntries) return Effect.fail(new Capability.Failure({
          code: "quota_exceeded", message: "Discovery cursor quota exceeded",
        }))
        const cursor = randomBytes(32).toString("base64url")
        records.set(cursor, { offset, expiresAt: now + options.ttlMillis, scope: Object.freeze({
          ...scope, owner: Object.freeze({ ...scope.owner, location: Object.freeze({ ...scope.owner.location }) }),
        }) })
        return Effect.succeed(cursor)
      }),
      preflight: (cursor, scope) => Effect.suspend(() => {
        const record = check(cursor, scope)
        return record instanceof Capability.Failure ? Effect.fail(record) : Effect.void
      }),
      read: (cursor, scope) => Effect.suspend(() => {
        const record = check(cursor, scope)
        if (record instanceof Capability.Failure) return Effect.fail(record)
        const old = record.scope
        if (old.connectionID !== scope.connectionID ||
          old.targetID !== scope.targetID || old.connectionGeneration !== scope.connectionGeneration ||
          old.targetGeneration !== scope.targetGeneration || old.catalogGeneration !== scope.catalogGeneration ||
          old.catalogHash !== scope.catalogHash || old.visibilityHash !== scope.visibilityHash || old.canonicalIdentity !== scope.canonicalIdentity)
          return Effect.fail(stale())
        return Effect.succeed(record.offset)
      }),
      remove: (cursor) => Effect.sync(() => { records.delete(cursor) }),
      clear: () => Effect.sync(() => records.clear()),
    }
  })
}

export function sameOwner(left: Capability.Owner, right: Capability.Owner) {
  return left.projectID === right.projectID && left.sessionID === right.sessionID && left.agentID === right.agentID &&
    left.location.directory === right.location.directory && left.location.workspaceID === right.location.workspaceID
}

function stale() {
  return new Capability.Failure({ code: "stale_descriptor", message: "Discovery cursor unavailable" })
}
