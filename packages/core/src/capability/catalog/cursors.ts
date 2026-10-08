export * as CapabilityCursors from "./cursors"

import { randomBytes } from "node:crypto"
import { Effect } from "effect"
import { Capability } from "@orchestra/schema/capability"

export type Scope = Readonly<{
  owner: Capability.Owner
  query: string
  provider: string
  connectionID: Capability.ConnectionID
  targetID: Capability.TargetID
  connectionGeneration: number
  targetGeneration: number
  catalogGeneration: number
  catalogHash: string
  canonicalIdentity: object
  limit: number
}>
export type Store = {
  issue: (scope: Scope, offset: number) => Effect.Effect<string, Capability.Failure>
  read: (cursor: string, scope: Scope) => Effect.Effect<number, Capability.Failure>
  clear: () => Effect.Effect<void>
}

/** Random handles disclose no query, actor, placement or selection. Scope is host-only metadata. */
export function make(options: { maxEntries: number; ttlMillis: number; now: () => number }): Effect.Effect<Store> {
  return Effect.sync(() => {
    if (!Number.isSafeInteger(options.maxEntries) || options.maxEntries <= 0 ||
      !Number.isFinite(options.ttlMillis) || options.ttlMillis <= 0) throw new RangeError("Invalid cursor bounds")
    const records = new Map<string, { scope: Scope; offset: number; expiresAt: number }>()
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
      read: (cursor, scope) => Effect.suspend(() => {
        const record = records.get(cursor)
        const now = options.now()
        if (!record || !Number.isFinite(now) || record.expiresAt <= now) return Effect.fail(stale())
        const old = record.scope
        if (old.owner.projectID !== scope.owner.projectID || old.owner.sessionID !== scope.owner.sessionID ||
          old.owner.agentID !== scope.owner.agentID || old.owner.location.directory !== scope.owner.location.directory ||
          old.owner.location.workspaceID !== scope.owner.location.workspaceID) return Effect.fail(stale())
        if (old.query !== scope.query || old.provider !== scope.provider || old.connectionID !== scope.connectionID ||
          old.targetID !== scope.targetID || old.connectionGeneration !== scope.connectionGeneration ||
          old.targetGeneration !== scope.targetGeneration || old.catalogGeneration !== scope.catalogGeneration ||
          old.catalogHash !== scope.catalogHash || old.canonicalIdentity !== scope.canonicalIdentity || old.limit !== scope.limit)
          return Effect.fail(stale())
        return Effect.succeed(record.offset)
      }),
      clear: () => Effect.sync(() => records.clear()),
    }
  })
}

function stale() {
  return new Capability.Failure({ code: "stale_descriptor", message: "Discovery cursor unavailable" })
}
