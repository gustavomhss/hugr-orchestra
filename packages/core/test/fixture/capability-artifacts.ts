import { expect } from "bun:test"
import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "../../src/capability/artifact"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { CapabilityPolicyFixture } from "../fixture/capability-policy"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

export const host = Layer.unwrap(Effect.acquireRelease(
  Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
).pipe(Effect.map((tmp) => Layer.mergeAll(
  Layer.succeed(Location.Service, location({ directory: AbsolutePath.make(tmp.path) })),
  Global.layerWith({
    data: join(tmp.path, "data"), config: join(tmp.path, "config"), state: join(tmp.path, "state"),
    cache: join(tmp.path, "cache"), tmp: join(tmp.path, "tmp"), home: tmp.path,
    bin: join(tmp.path, "bin"), log: join(tmp.path, "log"), repos: join(tmp.path, "repos"),
  }),
))))
export const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
  AgentV2.node, Location.node, PermissionSaved.node, FSUtil.node, Global.node,
]), [
  [Database.node, Layer.unwrap(Effect.map(Location.Service,
    (placement) => Database.layerFromPath(join(placement.directory, "artifacts.sqlite")),
  )).pipe(Layer.provide(host))], [Location.node, host], [Global.node, host],
]))
export const allow: PermissionV2.Ruleset = [{ action: "artifact.*", resource: "*", effect: "allow" }]
export const input: CapabilityArtifacts.Input = {
  data: new TextEncoder().encode("durable ✓"), mime: "text/plain", kind: "document", verification: "observed",
  metadata: { secret: "host-private", title: "unicode ✓" },
}

export function fixture(options: Parameters<typeof CapabilityPolicyFixture.fixture>[0] = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture(options)
    const placement = yield* Location.Service
    yield* f.database.db.update(SessionTable).set({ directory: placement.directory })
      .where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding: CapabilityInvocation.HostInput = {
      ...f.binding, owner: { ...f.binding.owner, location: { directory: placement.directory } }, effectiveRules: allow,
    }
    return { ...f, binding, root: join(placement.directory, "artifacts") }
  })
}

export function expectCode(error: unknown, code: CapabilityArtifacts.Failure["code"] | Capability.Failure["code"]) {
  expect(error instanceof CapabilityArtifacts.Failure || error instanceof Capability.Failure).toBe(true)
  if (!(error instanceof CapabilityArtifacts.Failure) && !(error instanceof Capability.Failure))
    throw new Error("Expected typed artifact failure")
  expect(error.code).toBe(code)
  expect(JSON.stringify(error)).not.toContain("host-private")
  expect(JSON.stringify(error)).not.toContain("orchestra-core-test-")
}
