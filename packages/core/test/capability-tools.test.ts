import { expect } from "bun:test"
import { join } from "node:path"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityTools } from "@orchestra/core/capability/tools"
import { CapabilityServiceProviders } from "@orchestra/core/capability/service/providers"
import { AgentV2 } from "@orchestra/core/agent"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { Global } from "@orchestra/core/global"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { EventV2 } from "@orchestra/core/event"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { Effect, Layer } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.unwrap(Effect.gen(function* () {
  const tmp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))
  return AppNodeBuilder.build(LayerNode.group([CapabilityTools.node, EventV2.node, SessionProjector.node,
    Database.node, Location.node, Global.node, FSUtil.node, Credential.node, AgentV2.node,
    PermissionV2.node, PermissionSaved.node, SessionStore.node, ToolRegistry.node]), [
    [Database.node, Database.layerFromPath(join(tmp.path, "capabilities.sqlite"))],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of(CapabilityPolicyFixture.placement))],
    [Global.node, Global.layerWith({ data: tmp.path, home: tmp.path })],
    [Credential.node, makeGlobalNode({ service: Credential.Service,
      layer: Credential.layerFrom(undefined), deps: [Database.node] })],
  ])
})))

it.live("Location capability producer registers canonical leaves and settlement requires real bound accounts", () => Effect.gen(function* () {
  const f = yield* CapabilityPolicyFixture.fixture({ name: "channel_send" })
  const registry = yield* ToolRegistry.Service
  const rules = [{ action: "*", resource: "*", effect: "allow" as const }]
  yield* CapabilityPolicyFixture.setRules(rules)
  const materialized = yield* registry.materialize(rules)
  const names = ["channel_read", "channel_send", "channel_update", "image_create", "video_create",
    "document_read", "document_edit", "sheet_read", "sheet_edit", "service_find", "service_describe", "service_call",
    ...CapabilityServiceProviders.platformNames]
  names.forEach((name) => {
    expect(materialized.definition(name)).toBeDefined()
    expect(materialized.registrationIdentity(name)).toBe(registry.currentRegistrationIdentity(name))
  })
  expect(materialized.definitions.filter((tool) => CapabilityServiceProviders.platformNames.includes(tool.name))).toEqual([])
  expect(materialized.definitions.filter((tool) => tool.name.startsWith("service_")).map((tool) => tool.name))
    .toEqual(["service_find", "service_describe", "service_call"])
  const result = yield* CapabilityInvocation.withContext({ ...f.binding, rootToolName: "channel_send", effectiveRules: rules },
    materialized.settle({ ...f.context, call: { type: "tool-call", id: f.context.toolCallID,
      name: "channel_send", input: { provider: "slack", text: "fixture" } } }))
  expect(result.result.type).toBe("error")
  expect(result.result.value).toContain("connection_unavailable")
  expect(result.result.value).not.toContain("credential")
}))

it.live("Location service discovery uses the real bound-account facade and default platform advertisement stays lazy", () => Effect.gen(function* () {
  const f = yield* CapabilityPolicyFixture.fixture({ name: "service_find" })
  const registry = yield* ToolRegistry.Service
  const rules = [{ action: "*", resource: "*", effect: "allow" as const }]
  yield* CapabilityPolicyFixture.setRules(rules)
  const materialized = yield* registry.materialize(rules)
  const settled = yield* CapabilityInvocation.withContext({ ...f.binding, rootToolName: "service_find", effectiveRules: rules },
    materialized.settle({ ...f.context, call: { type: "tool-call", id: f.context.toolCallID,
      name: "service_find", input: { provider: "cloudflare", query: "" } } }))
  expect(settled.result.type).toBe("error")
  expect(String(settled.result.value)).toContain("Capability connection is unavailable")
  expect(String(settled.result.value)).not.toContain("credential")
  expect(materialized.definitions.some((tool) => tool.name.startsWith("platform_"))).toBe(false)
  const projected = yield* registry.materialize(rules, { advertisedNames: ["platform_cloudflare"] })
  expect(projected.definitions.map((tool) => tool.name)).toEqual(["platform_cloudflare"])
  expect(projected.registrationIdentity("platform_cloudflare")).toBe(materialized.registrationIdentity("platform_cloudflare"))
}))
