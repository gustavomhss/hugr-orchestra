export * as CapabilityChildrenFixture from "./capability-children"

import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityChildren } from "@orchestra/core/capability/children"
import { CapabilityVendorSchema } from "@orchestra/core/capability/catalog/schema"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityChildTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionStore } from "@orchestra/core/session/store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Effect, Layer, Ref, Schema } from "effect"
import { join } from "node:path"
import { CapabilityPolicyFixture } from "./capability-policy"
import { tmpdir } from "./tmpdir"

export const layer = Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  return AppNodeBuilder.build(LayerNode.group([
    Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
    AgentV2.node, Location.node, PermissionSaved.node, ToolRegistry.nativeNode, Global.node, FSUtil.node,
  ]), [
    [Location.node, Layer.succeed(Location.Service, CapabilityPolicyFixture.placement)],
    [Global.node, Global.layerWith({ data: join(tmp.path, "data"), home: tmp.path })],
    [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
  ])
}))

export const fixture = Effect.gen(function* () {
  const f = yield* CapabilityPolicyFixture.fixture()
  yield* f.events.publish(SessionEvent.Tool.Called, {
    sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
    callID: f.context.toolCallID, tool: f.binding.rootToolName, input: {},
    timestamp: CapabilityPolicyFixture.timestamp, provider: { executed: false },
  })
  const registry = yield* ToolRegistry.Service
  const children = yield* CapabilityChildren.make
  const seen = yield* Ref.make<Tool.Context[]>([])
  yield* registry.register({ leaf: Tool.make({
    description: "Authorized canonical child", input: Schema.Struct({ text: Schema.String }), output: Schema.String,
    execute: (input, context) => Effect.gen(function* () {
      const permit = yield* f.policy.authorize(context, CapabilityPolicyFixture.input)
      yield* f.policy.commit(permit, () => f.target)
      yield* Ref.update(seen, (seen) => [...seen, context])
      return input.text
    }).pipe(Effect.mapError((error) => new Tool.Failure({ message: "Child denied", error }))),
  }) })
  const materialization = yield* registry.materialize(undefined, { advertisedNames: [] })
  const rows = () => f.database.db.select().from(CapabilityChildTable)
    .where(eq(CapabilityChildTable.session_id, f.context.sessionID)).all().pipe(Effect.orDie)
  return { ...f, registry, children, seen, materialization, rows }
})

export function proof(invocation: Capability.InvocationRef, ordinal = 1, toolName = "leaf", input: Schema.Json = { text: "ok" }) {
  return { callID: CapabilityInvocation.childID(invocation, ordinal), parentCallID: invocation.callID,
    ordinal, toolName, requestHash: CapabilityVendorSchema.hash({ name: toolName, input }) }
}

export function admit(f: Effect.Success<typeof fixture>, proof: CapabilityInvocation.ChildProof, depth = 1) {
  return f.database.db.insert(CapabilityChildTable).values({
    id: proof.callID, session_id: f.context.sessionID, agent_id: f.context.agent,
    assistant_message_id: f.context.assistantMessageID,
    root_call_id: f.context.toolCallID, root_tool_name: f.binding.rootToolName,
    parent_call_id: proof.parentCallID, ordinal: proof.ordinal, depth,
    tool_name: proof.toolName, request_hash: proof.requestHash, state: "running",
  }).returning().get().pipe(Effect.orDie)
}
