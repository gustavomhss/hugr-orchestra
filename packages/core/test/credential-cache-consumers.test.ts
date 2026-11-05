import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { Credential } from "@orchestra/core/credential"
import { Integration } from "@orchestra/core/integration"
import { Catalog } from "@orchestra/core/catalog"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { Policy } from "@orchestra/core/policy"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { AbsolutePath } from "@orchestra/core/schema"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityServiceData } from "../src/capability/service/execution/data"
import { fixture, selected, token } from "./fixture/capability-mcp"
import { location } from "./fixture/location"
import { it, testEffect } from "./lib/effect"

const methodID = Integration.MethodID.make("opaque-cache-fixture")
const cache = () => Credential.Cache.make({ type: "cache", methodID, format: "identity.fixture", version: 1,
  serialized: "SYNTHETIC_OPAQUE_CACHE_SECRET" })
const integration = testEffect(AppNodeBuilder.build(LayerNode.group([Integration.node, Credential.node, EventV2.node])))

integration.effect("CCX01 generic Integration excludes cache without refresh or fallback and preserves Key/OAuth", () =>
  Effect.gen(function* () {
    expect(Credential.Cache).toBeDefined()
    const integrations = yield* Integration.Service
    const credentials = yield* Credential.Service
    const integrationID = Integration.ID.make("opaque-cache-consumer")
    const calls: string[] = []
    const refreshed = Credential.OAuth.make({ type: "oauth", methodID, access: "refreshed-access", refresh: "new-refresh",
      expires: Date.now() + 3600000 })
    yield* integrations.transform((editor) => {
      editor.update(integrationID, (entry) => { entry.name = "Cache fixture" })
      editor.method.update({ integrationID, method: { type: "key", label: "Key" } })
      editor.method.update({ integrationID, method: { type: "oauth", id: methodID, label: "OAuth" },
        authorize: () => Effect.die("This fixture never starts a login"),
        refresh: (value) => Effect.sync(() => { calls.push(value.type); return refreshed }),
      })
    })
    const saved = yield* credentials.create({ integrationID, value: cache(), label: "Cache" })
    expect((yield* integrations.get(integrationID))?.connections).toEqual([])
    expect((yield* integrations.list()).find((entry) => entry.id === integrationID)?.connections).toEqual([])
    expect(yield* integrations.connection.active(integrationID)).toBeUndefined()
    expect(yield* integrations.connection.resolve({ type: "credential", id: saved.id, label: saved.label })).toBeUndefined()
    expect(calls).toEqual([])
    const key = yield* credentials.create({ integrationID, value: Credential.Key.make({ type: "key", key: "synthetic-key" }) })
    const expired = yield* credentials.create({ integrationID, value: Credential.OAuth.make({ type: "oauth", methodID,
      access: "old-access", refresh: "old-refresh", expires: 0 }) })
    const keyConnection = { type: "credential" as const, id: key.id, label: key.label }
    const oauthConnection = { type: "credential" as const, id: expired.id, label: expired.label }
    expect(yield* integrations.connection.resolve(keyConnection)).toEqual(Credential.Key.make({ type: "key", key: "synthetic-key" }))
    expect(yield* integrations.connection.resolve(oauthConnection)).toEqual(refreshed)
    expect(calls).toEqual(["oauth"])
    const newer = yield* credentials.create({ integrationID, value: cache(), label: "Newest cache" })
    const available = (yield* integrations.get(integrationID))?.connections
    expect(available).toHaveLength(2)
    expect(available).toContainEqual(keyConnection)
    expect(available).toContainEqual(oauthConnection)
    expect(yield* integrations.connection.active(integrationID)).toEqual(oauthConnection)
    expect(yield* integrations.connection.resolve({ type: "credential", id: newer.id, label: newer.label })).toBeUndefined()
    expect(calls).toEqual(["oauth"])
    expect((yield* credentials.get(saved.id))?.value).toEqual(cache())
    expect((yield* credentials.get(newer.id))?.value).toEqual(cache())
  }),
)

it.live("CCX02 native MCP rejects opaque cache before HTTP while Key/OAuth still send their actual bearer", () =>
  Effect.gen(function* () {
    expect(Credential.Cache).toBeDefined()
    const server = yield* fixture()
    const transport = server.transport()
    const rejectCache = Effect.gen(function* () {
      const error = yield* transport.listTools({ ...selected, credential: cache() }).pipe(Effect.flip)
      expect(error).toBeInstanceOf(Capability.Failure)
      expect(error.code).toBe("authentication_required")
      ;[JSON.stringify(error), error.message, String(error)].forEach((text) => {
        expect(text).not.toContain("SYNTHETIC_OPAQUE_CACHE_SECRET")
        expect(text).not.toContain(token)
      })
    })
    yield* rejectCache
    expect(server.requests).toEqual([])
    yield* transport.listTools(selected)
    expect(server.requests.some((request) => request.headers.get("authorization") === `Bearer ${token}`)).toBe(true)
    const oauth = Credential.OAuth.make({ type: "oauth", methodID, access: "synthetic-oauth-bearer", refresh: "not-a-bearer",
      expires: Date.now() + 3600000 })
    yield* transport.listTools({ ...selected, credential: oauth })
    expect(server.requests.some((request) => request.headers.get("authorization") === "Bearer synthetic-oauth-bearer")).toBe(true)
    const before = server.requests.length
    yield* rejectCache
    expect(server.requests).toHaveLength(before)
    expect(JSON.stringify(server.requests.map((request) => ({ body: request.body, headers: [...request.headers] }))))
      .not.toContain("SYNTHETIC_OPAQUE_CACHE_SECRET")
  }),
)

test("CCX03 service credential guard rejects cache structurally and preserves existing secret projection", () => {
  expect(Credential.Cache).toBeDefined()
  const failure = CapabilityServiceData.credentialFailure(cache())
  expect(failure).toBeInstanceOf(Capability.Failure)
  expect(failure?.code).toBe("authentication_required")
  expect(JSON.stringify(failure)).not.toContain("SYNTHETIC_OPAQUE_CACHE_SECRET")
  const key = Credential.Key.make({ type: "key", key: "synthetic-service-key" })
  const oauth = Credential.OAuth.make({ type: "oauth", methodID, access: "synthetic-service-access", refresh: "synthetic-service-refresh",
    expires: Date.now() + 3600000 })
  ;[key, oauth].forEach((value) => expect(CapabilityServiceData.credentialFailure(value)).toBeUndefined())
  expect(CapabilityServiceData.credentialFailure({ ...oauth, expires: 0 })).toBeInstanceOf(Capability.Failure)
  expect(CapabilityServiceData.credentialIdentity(key)).not.toBe(CapabilityServiceData.credentialIdentity(oauth))
  const endpoint = "https://fixture.invalid/private-endpoint"
  expect(CapabilityServiceData.redact({ text: `${key.key} ${endpoint}` }, key, endpoint))
    .toEqual({ data: { text: "[REDACTED] [REDACTED]" }, redacted: true })
  expect(CapabilityServiceData.redact({ text: `${oauth.access} ${oauth.refresh}` }, oauth, endpoint))
    .toEqual({ data: { text: "[REDACTED] [REDACTED]" }, redacted: true })
})

const catalog = testEffect(AppNodeBuilder.build(
  LayerNode.group([Catalog.node, EventV2.node, Credential.node, Integration.node, Policy.node]),
  [[Location.node, Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make("cache-fixture") })))]]),
)

catalog.effect("CCX04 opaque cache never advertises a generic provider as connected", () => Effect.gen(function* () {
  expect(Credential.Cache).toBeDefined()
  const catalog = yield* Catalog.Service
  const integrations = yield* Integration.Service
  const credentials = yield* Credential.Service
  const integrationID = Integration.ID.make("opencode")
  const modelID = ModelV2.ID.make("cache-test-paid")
  yield* integrations.transform((editor) => editor.update(integrationID, () => {}))
  yield* catalog.transform((editor) => {
    editor.provider.update(ProviderV2.ID.opencode, () => {})
    editor.model.update(ProviderV2.ID.opencode, modelID, (model) => {
      model.cost = [{ input: 1, output: 1, cache: { read: 0, write: 0 } }]
    })
  })
  expect((yield* catalog.model.available()).filter((model) => model.id === modelID)).toEqual([])
  const saved = yield* credentials.create({ integrationID, value: cache() })
  expect((yield* catalog.model.available()).filter((model) => model.id === modelID)).toEqual([])
  const key = yield* credentials.create({ integrationID, value: Credential.Key.make({ type: "key", key: "synthetic-catalog-key" }) })
  expect((yield* catalog.model.available()).map((model) => model.id)).toContain(modelID)
  yield* credentials.remove(key.id)
  expect((yield* catalog.model.available()).filter((model) => model.id === modelID)).toEqual([])
  expect((yield* credentials.get(saved.id))?.value).toEqual(cache())
}))
