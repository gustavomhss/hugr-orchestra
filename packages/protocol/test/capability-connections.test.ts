import { describe, expect, test } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { SessionID } from "@orchestra/schema/session-id"
import { Effect, Layer, Schema, SchemaAST } from "effect"
import { HttpRouter, HttpServer, HttpServerRequest } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder, HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"
import { makeCapabilityConnectionsGroup } from "../src/groups/capability-connections"
import { ForbiddenError, UnauthorizedError } from "../src/errors"
import { CapabilityAuthorization } from "../src/middleware/capability-authorization"

class FixtureLocation extends HttpApiMiddleware.Service<FixtureLocation>()("test/ConnectionLocation") {}

const connection = Schema.decodeUnknownSync(Capability.ConnectionRef)({
  id: "cconn_" + "1".repeat(26), provider: "fixture", generation: 1,
})
const target = Schema.decodeUnknownSync(Capability.TargetRef)({
  id: "ctgt_" + "2".repeat(26), connectionID: connection.id, generation: 2, environment: "fixture",
})
const sessionID = SessionID.make("ses_fixture")
const input = { environment: "fixture", resource: { bucket: "example" } }
const binding = { sessionID, actions: ["read"] }
const receipt = { requestID: "request-fixture", reused: false, data: { target } }
const item = { connection, state: "active" as const, credential: "present" as const }
const connections = { items: [item], after: connection.id, coverage: "live" as const }
// Synthetic schema token only; Core owns cursor encryption and authority checks.
const targetCursor = Schema.decodeUnknownSync(CapabilityManagement.TargetCursor)("C".repeat(32))
const targets = { items: [{ target }], after: targetCursor, coverage: "live" as const }
const cases = [
  { name: "capability.connection.list", method: "get", path: "/api/capability/connections", payload: undefined, output: connections, success: CapabilityManagement.ConnectionPage },
  { name: "capability.connection.get", method: "get", path: "/api/capability/connections/{connectionID}", payload: undefined, output: item, success: CapabilityManagement.Connection },
  { name: "capability.connection.targets", method: "get", path: "/api/capability/connections/{connectionID}/targets", payload: undefined, output: targets, success: CapabilityManagement.TargetPage },
  { name: "capability.connection.disconnect", method: "post", path: "/api/capability/connections/disconnect", payload: { connection }, output: receipt, success: CapabilityManagement.Receipt },
  { name: "capability.target.create", method: "post", path: "/api/capability/targets", payload: { connection, input }, output: receipt, success: CapabilityManagement.Receipt },
  { name: "capability.target.retarget", method: "post", path: "/api/capability/targets/retarget", payload: { target, input }, output: receipt, success: CapabilityManagement.Receipt },
  { name: "capability.target.remove", method: "post", path: "/api/capability/targets/remove", payload: { target }, output: receipt, success: CapabilityManagement.Receipt },
  { name: "capability.binding.put", method: "post", path: "/api/capability/bindings", payload: { target, input: binding }, output: receipt, success: CapabilityManagement.Receipt },
  { name: "capability.binding.remove", method: "post", path: "/api/capability/bindings/remove", payload: { target, sessionID }, output: receipt, success: CapabilityManagement.Receipt },
] as const
const group = makeCapabilityConnectionsGroup(FixtureLocation)
const api = HttpApi.make("connection-protocol-test").add(group)
const spec = OpenApi.fromApi(api)

// Endpoint projections erase service types; these DTO ASTs are service-free.
function decode(schema: Schema.Top | undefined, value: unknown) {
  if (!schema) throw new Error("Missing endpoint schema")
  return Schema.decodeUnknownSync(Schema.make<Schema.Codec<unknown>>(schema.ast))(value)
}

describe("capability connection projections", () => {
  test("factory protects every endpoint in Location then authorization order", () => {
    expect(Object.keys(group.endpoints).sort()).toEqual(cases.map((entry) => entry.name).sort())
    Object.values(group.endpoints).forEach((endpoint) => {
      expect([...endpoint.middlewares]).toEqual([FixtureLocation, CapabilityAuthorization])
    })
  })

  test.each([...cases])("$name projects route, query, strict payload and direct success", (entry) => {
    const endpoint = group.endpoints[entry.name]
    const operation = spec.paths[entry.path]?.[entry.method]
    expect(operation?.operationId).toBe(`server.capability.connections.${entry.name}`)
    expect(operation?.responses[401]).toBeDefined()
    expect(operation?.responses[403]).toBeDefined()
    expect(operation?.parameters?.find((parameter) => parameter.name === "location")).toMatchObject({
      in: "query", style: "deepObject", explode: true, required: false,
    })
    expect(decode(endpoint.query, { location: { directory: "/caller", workspace: "workspace" } })).toEqual({
      location: { directory: "/caller", workspace: "workspace" },
    })
    expect(endpoint.success.size).toBe(1)
    // Match the exact imported DTO after HttpApi's JSON codec projection.
    expect([...endpoint.success][0]?.ast).toBe(Schema.toCodecJson<unknown, unknown, never, never>(entry.success).ast)
    expect(decode([...endpoint.success][0], entry.output)).toEqual(entry.output)
    expect(operation?.responses[200]?.content?.["application/json"]?.schema).not.toHaveProperty("properties.location")
    if (!entry.payload) {
      expect(operation?.requestBody).toBeUndefined()
      return
    }
    expect(endpoint.payload.size).toBe(1)
    const payload = endpoint.payload.get("application/json")?.schemas[0]
    expect(decode(payload, entry.payload)).toEqual(entry.payload)
    expect(() => decode(payload, { ...entry.payload, agentID: "forged" })).toThrow()
    expect(() => decode(payload, {})).toThrow()
    const projected = operation?.requestBody?.content["application/json"]?.schema
    expect(projected).toMatchObject({ additionalProperties: false, required: Object.keys(entry.payload) })
    if ("connection" in entry.payload) {
      expect(projected).toHaveProperty("properties.connection.$ref", "#/components/schemas/Capability.ConnectionRef")
      expect(() => decode(payload, { ...entry.payload, connection: { ...connection, credentialID: "secret" } })).toThrow()
    }
    if ("target" in entry.payload) {
      expect(projected).toHaveProperty("properties.target.$ref", "#/components/schemas/Capability.TargetRef")
      expect(() => decode(payload, { ...entry.payload, target: { ...target, resource: "secret" } })).toThrow()
    }
    if ("input" in entry.payload) {
      const invalid = { ...entry.payload, input: { ...entry.payload.input, agentID: "forged" } }
      expect(() => decode(payload, invalid)).toThrow()
      expect(projected).toHaveProperty("properties.input.additionalProperties", false)
    }
    expect(decode(endpoint.headers, { "idempotency-key": "retry-1" })).toEqual({ "idempotency-key": "retry-1" })
    expect(() => decode(endpoint.headers, {})).toThrow()
    expect(() => decode(endpoint.headers, { "idempotency-key": "" })).toThrow()
    expect(operation?.parameters?.find((parameter) => parameter.name === "idempotency-key")).toMatchObject({
      in: "header", required: true,
    })
  })

  test.each([
    { name: "capability.connection.list", after: connection.id, wrong: target.id, ref: "Capability.ConnectionID" },
    { name: "capability.connection.targets", after: targetCursor, wrong: target.id, ref: "CapabilityManagement.TargetCursor" },
  ] as const)("$name decodes bounded HTTP pagination", (entry) => {
    const endpoint = group.endpoints[entry.name]
    expect(decode(endpoint.query, {})).toEqual({})
    ;["1", "32"].forEach((limit) => {
      expect(decode(endpoint.query, { after: entry.after, limit })).toEqual({ after: entry.after, limit: Number(limit) })
    })
    ;["0", "33", "1.5", "malformed", "", "NaN", "Infinity", 1, 32].forEach((limit) => {
      expect(() => decode(endpoint.query, { limit })).toThrow()
    })
    expect(() => decode(endpoint.query, { after: entry.wrong })).toThrow()
    expect(() => decode(endpoint.query, { after: entry.after + "\n" })).toThrow()
    const operation = spec.paths[endpoint.path.replace(":connectionID", "{connectionID}")]?.get
    expect(operation?.parameters?.find((parameter) => parameter.name === "after")?.schema).toEqual({
      $ref: `#/components/schemas/${entry.ref}`,
    })
    expect(operation?.parameters?.find((parameter) => parameter.name === "limit")?.schema).toEqual({ type: "string" })
  })

  test("target query preserves imported opaque cursor AST and bounds", () => {
    const query = group.endpoints["capability.connection.targets"].query
    if (!query || !SchemaAST.isObjects(query.ast)) throw new Error("Missing target query object schema")
    expect(query.ast.propertySignatures.find((property) => property.name === "after")?.type).toBe(
      CapabilityManagement.TargetQuery.fields.after.ast,
    )
    expect(decode(query, { after: "C".repeat(2048) })).toEqual({ after: "C".repeat(2048) })
    ;["C".repeat(31), "C".repeat(2049), "/".repeat(32), target.id].forEach((after) => {
      expect(() => decode(query, { after })).toThrow()
    })
  })

  test("item reads require branded parent IDs", () => {
    ;["capability.connection.get", "capability.connection.targets"].forEach((name) => {
      const endpoint = group.endpoints[name]
      expect(decode(endpoint.params, { connectionID: connection.id })).toEqual({ connectionID: connection.id })
      expect(() => decode(endpoint.params, { connectionID: target.id })).toThrow()
      expect(() => decode(endpoint.params, {})).toThrow()
    })
  })
})

test("actual router authenticates before Location on every route and rejects malformed mutations", async () => {
  const entered: string[] = []
  const web = HttpRouter.toWebHandler(HttpApiBuilder.layer(api).pipe(
    Layer.provide(HttpApiBuilder.group(api, "server.capability.connections", (handlers) => handlers
      .handle("capability.connection.list", () => Effect.sync(() => { entered.push("handler"); return connections }))
      .handle("capability.connection.get", () => Effect.succeed(item))
      .handle("capability.connection.targets", () => Effect.succeed(targets))
      .handle("capability.connection.disconnect", () => Effect.succeed(receipt))
      .handle("capability.target.create", () => Effect.succeed(receipt))
      .handle("capability.target.retarget", () => Effect.succeed(receipt))
      .handle("capability.target.remove", () => Effect.succeed(receipt))
      .handle("capability.binding.put", () => Effect.succeed(receipt))
      .handle("capability.binding.remove", () => Effect.succeed(receipt)))),
    Layer.provide(Layer.succeed(FixtureLocation, FixtureLocation.of((effect) => Effect.suspend(() => {
      entered.push("location")
      return effect
    })))),
    Layer.provide(Layer.succeed(CapabilityAuthorization, CapabilityAuthorization.of((effect) => Effect.gen(function* () {
      entered.push("authorization")
      const request = yield* HttpServerRequest.HttpServerRequest
      if (request.headers.authorization === "Bearer denied") return yield* Effect.fail(new ForbiddenError({ message: "Denied" }))
      if (request.headers.authorization !== "Bearer fixture") return yield* Effect.fail(new UnauthorizedError({ message: "Required" }))
      return yield* effect
    })))),
    Layer.provide(HttpServer.layerServices),
  ), { disableLogger: true })
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    for (const entry of cases) {
      const url = `http://localhost${entry.path.replace("{connectionID}", connection.id)}?location[directory]=/caller`
      const options = { method: entry.method.toUpperCase(), body: entry.payload ? JSON.stringify(entry.payload) : undefined }
      entered.length = 0
      const rejected = yield* Effect.promise(() => web.handler(new Request(url, options)))
      expect(rejected.status).toBe(401)
      expect(entered).toEqual(["authorization"])
      entered.length = 0
      const denied = yield* Effect.promise(() => web.handler(new Request(url, {
        ...options, headers: { authorization: "Bearer denied" },
      })))
      expect(denied.status).toBe(403)
      expect(entered).toEqual(["authorization"])
      entered.length = 0
      const accepted = yield* Effect.promise(() => web.handler(new Request(url, {
        ...options, headers: { authorization: "Bearer fixture", "content-type": "application/json", "idempotency-key": "retry-1" },
      })))
      expect(accepted.status).toBe(200)
      expect(entered.slice(0, 2)).toEqual(["authorization", "location"])
      expect(yield* Effect.promise(() => accepted.json())).toEqual(entry.output)
    }
    const headers = { authorization: "Bearer fixture", "content-type": "application/json", "idempotency-key": "retry-1" }
    for (const payload of [
      { target, input: { ...binding, agentID: "forged" } },
      { target: { ...target, resource: "secret" }, input: binding },
      { target, input: binding, agentID: "forged" },
    ]) {
      const rejected = yield* Effect.promise(() => web.handler(new Request("http://localhost/api/capability/bindings", {
        method: "POST", headers, body: JSON.stringify(payload),
      })))
      expect(rejected.status).toBe(400)
    }
    const missingKey = yield* Effect.promise(() => web.handler(new Request("http://localhost/api/capability/bindings", {
      method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json" },
      body: JSON.stringify({ target, input: binding }),
    })))
    expect(missingKey.status).toBe(400)
    for (const limit of ["1", "32", "0", "33", "malformed"]) {
      entered.length = 0
      const response = yield* Effect.promise(() => web.handler(new Request(`http://localhost/api/capability/connections?limit=${limit}`, { headers })))
      expect(response.status).toBe(limit === "1" || limit === "32" ? 200 : 400)
      expect(entered.includes("handler")).toBe(limit === "1" || limit === "32")
    }
  })))
})
