import { describe, expect } from "bun:test"
import { CapabilityCursors } from "@orchestra/core/capability/catalog/cursors"
import { AgentV2 } from "@orchestra/core/agent"
import { Project } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema } from "@orchestra/core/session/schema"
import { Capability } from "@orchestra/schema/capability"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { Effect } from "effect"
import { it } from "./lib/effect"

const scope: CapabilityCursors.Scope = {
  owner: { projectID: Project.ID.global, location: { directory: AbsolutePath.make("/project") },
    sessionID: SessionSchema.ID.create(), agentID: AgentV2.ID.make("test") },
  query: "exact query", provider: "example", connectionID: Capability.ConnectionID.create(), targetID: Capability.TargetID.create(),
  connectionGeneration: 1, targetGeneration: 2, catalogGeneration: 3, catalogHash: "a".repeat(64), visibilityHash: "a".repeat(64),
  canonicalIdentity: {}, limit: 1,
}

describe("CapabilityCursors opaque bounded scope", () => {
  it.live("same scope replays; altered token, provider, selection, identity and every owner dimension fail", () => Effect.gen(function* () {
    const store = yield* CapabilityCursors.make({ maxEntries: 2, ttlMillis: 100, now: () => 1 })
    const token = yield* store.issue(scope, 2)
    expect(yield* store.read(token, scope)).toBe(2)
    yield* store.preflight(token, scope)
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(token).not.toContain("query")
    const altered: CapabilityCursors.Scope[] = [
      { ...scope, query: "exact Query" }, { ...scope, provider: "other" }, { ...scope, limit: 2 },
      { ...scope, requestedConnectionID: scope.connectionID }, { ...scope, requestedTargetID: scope.targetID },
      { ...scope, connectionID: Capability.ConnectionID.create() }, { ...scope, targetID: Capability.TargetID.create() },
      { ...scope, connectionGeneration: 2 }, { ...scope, targetGeneration: 3 }, { ...scope, catalogGeneration: 4 },
      { ...scope, catalogHash: "b".repeat(64) }, { ...scope, visibilityHash: "b".repeat(64) }, { ...scope, canonicalIdentity: {} },
      ...[
        { ...scope.owner, projectID: Project.ID.make("other") },
        { ...scope.owner, sessionID: SessionSchema.ID.create() },
        { ...scope.owner, agentID: AgentV2.ID.make("other") },
        { ...scope.owner, location: { directory: AbsolutePath.make("/other") } },
        { ...scope.owner, location: { ...scope.owner.location, workspaceID: WorkspaceID.make("wrk_other") } },
      ].map((owner) => ({ ...scope, owner })),
    ]
    yield* Effect.forEach(altered, (current) => store.read(token, current).pipe(Effect.flip, Effect.map((failure) => {
      expect(failure.code).toBe("stale_descriptor")
    })))
    expect((yield* store.read(token + "x", scope).pipe(Effect.flip)).code).toBe("stale_descriptor")
    expect(yield* store.read(token, scope)).toBe(2)
    yield* Effect.forEach([
      { ...scope, query: "changed" }, { ...scope, provider: "changed" }, { ...scope, limit: 2 },
      { ...scope, requestedConnectionID: scope.connectionID }, { ...scope, requestedTargetID: scope.targetID },
      ...altered.filter((current) => current.owner !== scope.owner),
    ], (current) => store.preflight(token, current).pipe(Effect.flip, Effect.map((failure) => {
      expect(failure.code).toBe("stale_descriptor")
    })))
    const changedGeneration = { ...scope, catalogGeneration: 100, visibilityHash: "changed", canonicalIdentity: {} }
    yield* store.preflight(token, changedGeneration)
  }))

  it.live("quota/expiry/invalid clock fail closed; caller mutations cannot rewrite retained scope", () => Effect.gen(function* () {
    const clock = { now: 10 }
    const store = yield* CapabilityCursors.make({ maxEntries: 1, ttlMillis: 10, now: () => clock.now })
    const mutable = { ...scope, owner: { ...scope.owner, location: { ...scope.owner.location } } }
    const token = yield* store.issue(mutable, 1)
    mutable.query = "changed"
    mutable.owner.agentID = AgentV2.ID.make("changed")
    mutable.owner.location.directory = AbsolutePath.make("/changed")
    expect(yield* store.read(token, scope)).toBe(1)
    expect((yield* store.issue(scope, 2).pipe(Effect.flip)).code).toBe("quota_exceeded")
    clock.now = 20
    expect((yield* store.read(token, scope).pipe(Effect.flip)).code).toBe("stale_descriptor")
    const next = yield* store.issue(scope, 2)
    expect(yield* store.read(next, scope)).toBe(2)
    clock.now = Number.NaN
    expect((yield* store.read(next, scope).pipe(Effect.flip)).code).toBe("stale_descriptor")
    expect((yield* store.issue(scope, 2).pipe(Effect.flip)).code).toBe("stale_descriptor")
    clock.now = 21
    yield* store.clear()
    expect((yield* store.read(next, scope).pipe(Effect.flip)).code).toBe("stale_descriptor")
  }))
})
