export * as CapabilityConnectionManagementFixture from "./capability-connection-management"

import { expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { Credential } from "@orchestra/schema/credential"
import { Integration } from "@orchestra/schema/integration"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { randomUUID } from "node:crypto"
import { Effect, Exit } from "effect"
import { CapabilityConnectionManagement } from "../../src/capability/connection/management"
import type { CapabilityConnectionStoreContract } from "../../src/capability/connection/store-contract"
import { CapabilityOperator } from "../../src/capability/operator/index"
import type { CapabilityOperatorContract } from "../../src/capability/operator/contract"
import { CapabilityConnectionTable, CapabilityTargetTable } from "../../src/capability/sql"
import { CredentialTable } from "../../src/credential/sql"
import { Database } from "../../src/database/database"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { EventV2 } from "../../src/event"
import { ProjectTable } from "../../src/project/sql"
import { SessionTable } from "../../src/session/sql"

export const layer = AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node]))
export const placement: CapabilityOperatorContract.Placement = {
  projectID: Project.ID.global, location: { directory: AbsolutePath.make("/management") },
}
export const foreign: CapabilityOperatorContract.Placement = {
  projectID: Project.ID.global, location: { directory: AbsolutePath.make("/foreign-management") },
}
export const secret = "management-private-material"

// Load the actual factory after Store integration. Missing implementation fails, never skips
// or substitutes a fake Store. The frozen-contract checkpoint must still typecheck beforehand.
const storeFactory = Effect.promise(async () => {
  const { CapabilityConnectionStore }: { CapabilityConnectionStore: {
    make: Effect.Effect<CapabilityConnectionStoreContract.Interface, CapabilityConnectionStoreContract.Error>
  } } = await import(new URL("../../src/capability/connection/store.ts", import.meta.url).href)
  return CapabilityConnectionStore.make
})

export function fixture(options: { scope?: CapabilityOperatorContract.GrantScope } = {}) {
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const makeStore = yield* storeFactory
    const store = yield* makeStore
    const operators = yield* CapabilityOperator.make({ principal: "management-operator",
      scope: options.scope ?? { placements: "instance", actions: ["*"] } })
    const management = yield* CapabilityConnectionManagement.make({ operators, store })
    const credentialID = Credential.ID.create()
    const integrationID = Integration.ID.make("management")
    yield* database.db.insert(ProjectTable).values({ id: placement.projectID,
      worktree: placement.location.directory, sandboxes: [] }).onConflictDoNothing().run()
    yield* database.db.insert(CredentialTable).values({ id: credentialID, integration_id: integrationID,
      label: secret, value: { type: "key", key: secret } }).run()
    const connection = (owner = placement) => Effect.gen(function* () {
      const ref: Capability.ConnectionRef = { id: Capability.ConnectionID.create(), provider: "fixture", generation: 0 }
      yield* database.db.insert(CapabilityConnectionTable).values({ id: ref.id, provider: ref.provider,
        generation: ref.generation, project_id: owner.projectID, directory: owner.location.directory,
        workspace_id: owner.location.workspaceID, integration_id: integrationID, credential_id: credentialID,
        endpoint: `https://example.invalid/${secret}`, subject_id: secret, scope_hash: "a".repeat(64), state: "active" }).run()
      return ref
    })
    const target = (parent: Capability.ConnectionRef) => Effect.gen(function* () {
      const ref: Capability.TargetRef = { id: Capability.TargetID.create(), connectionID: parent.id,
        environment: "test", generation: 0 }
      yield* database.db.insert(CapabilityTargetTable).values({ id: ref.id, connection_id: ref.connectionID,
        environment: ref.environment, generation: ref.generation, resource: { secret } }).run()
      return ref
    })
    const sessionID = SessionID.create()
    yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: placement.projectID,
      directory: placement.location.directory, slug: "management", title: "management", version: "test", agent: "persisted-actor" }).run()
    const parent = yield* connection()
    const child = yield* target(parent)
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>, key = "key", authority = operators.configured) =>
      operators.withRequest(authority, { requestID: randomUUID(), idempotencyKey: key }, effect)
    return { database, store, operators, management, credentialID, parent, child, sessionID, connection, target, run }
  })
}

export function failed<A, E>(exit: Exit.Exit<A, E>) {
  if (!Exit.isFailure(exit)) throw new Error("Expected failed Exit")
  return exit.cause
}

export function expectCode<A, E>(exit: Exit.Exit<A, E>, code: Capability.ErrorCode) {
  const cause = failed(exit)
  expect(cause.reasons.length).toBeGreaterThan(0)
  cause.reasons.forEach((reason) => {
    expect(reason._tag).toBe("Fail")
    if (reason._tag !== "Fail" || !(reason.error instanceof Capability.Failure)) throw new Error("Expected Capability.Failure")
    expect(reason.error.code).toBe(code)
    expect(reason.error.detail).toBeUndefined()
    expect(JSON.stringify(reason.error)).not.toContain(secret)
  })
  return cause
}
