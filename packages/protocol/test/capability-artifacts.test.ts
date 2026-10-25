import { describe, expect, test } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { Schema } from "effect"
import { HttpApi, HttpApiMiddleware, OpenApi } from "effect/unstable/httpapi"
import { makeCapabilityArtifactsGroup } from "../src/groups/capability-artifacts"
import { CapabilityAuthorization } from "../src/middleware/capability-authorization"

class FixtureLocation extends HttpApiMiddleware.Service<FixtureLocation>()("test/ArtifactLocation") {}

const group = makeCapabilityArtifactsGroup(FixtureLocation)
const spec = OpenApi.fromApi(HttpApi.make("artifact-protocol-test").add(group))
const item = "/api/capability/sessions/{sessionID}/artifacts/{artifactID}/{revision}"
const cases = [
  { name: "capability.artifact.list", method: "get", path: "/api/capability/sessions/{sessionID}/artifacts", mutation: false },
  { name: "capability.artifact.get", method: "get", path: item, mutation: false },
  { name: "capability.artifact.content", method: "get", path: `${item}/content`, mutation: false },
  { name: "capability.artifact.contentTicket", method: "post", path: `${item}/content-ticket`, mutation: false },
  { name: "capability.artifact.share", method: "post", path: `${item}/share`, mutation: true },
  { name: "capability.artifact.pin", method: "put", path: `${item}/pin`, mutation: true },
  { name: "capability.artifact.removeReference", method: "delete", path: item, mutation: true },
] as const
const artifactID = Capability.ArtifactID.create()

function decode(schema: Schema.Top | undefined, value: unknown) {
  if (!schema) throw new Error("Missing endpoint schema")
  return Schema.decodeUnknownSync(Schema.make<Schema.Codec<unknown>>(schema.ast))(value)
}

describe("capability artifact projections", () => {
  test("group id, endpoints and Location-then-authorization middleware are frozen", () => {
    expect(group.identifier).toBe("server.capability.artifacts")
    expect(Object.keys(group.endpoints).sort()).toEqual(cases.map((entry) => entry.name).sort())
    Object.values(group.endpoints).forEach((endpoint) =>
      expect([...endpoint.middlewares]).toEqual([FixtureLocation, CapabilityAuthorization]))
  })

  test.each([...cases])("$name projects route, auth errors and idempotency", (entry) => {
    const operation = spec.paths[entry.path]?.[entry.method]
    expect(operation?.operationId).toBe(`server.capability.artifacts.${entry.name}`)
    expect(Object.keys(operation?.responses ?? {}).sort()).toEqual(entry.name === "capability.artifact.content"
      ? ["200", "206", "400", "401", "403", "409", "416", "500"] : ["200", "400", "401", "403", "409", "500"])
    const headers = group.endpoints[entry.name].headers
    if (!entry.mutation) return
    expect(decode(headers, { "idempotency-key": "retry-1" })).toEqual({ "idempotency-key": "retry-1" })
    expect(() => decode(headers, {})).toThrow()
    expect(operation?.parameters?.find((parameter) => parameter.name === "idempotency-key")).toMatchObject({
      in: "header", required: true,
    })
  })

  test("artifact selectors require branded IDs and canonical non-negative revisions", () => {
    const params = group.endpoints["capability.artifact.get"].params
    ;["0", "3", "10", "1".repeat(16)].forEach((revision) => expect(decode(params, { sessionID: "ses_x", artifactID, revision }))
      .toEqual({ sessionID: "ses_x", artifactID, revision: Number(revision) }))
    ;[{ artifactID: "cconn_" + "1".repeat(26), revision: "0" }, { artifactID, revision: "-1" },
      { artifactID, revision: "1.5" }, { artifactID, revision: "x" }, { artifactID, revision: "01" },
      { artifactID, revision: "+3" }, { artifactID, revision: "1e2" }, { artifactID, revision: "0x10" },
      { artifactID, revision: " 3" }, { artifactID, revision: "3 " }, { artifactID, revision: "" },
      { artifactID, revision: "1".repeat(17) }].forEach((value) =>
      expect(() => decode(params, { sessionID: "ses_x", ...value })).toThrow())
    expect(() => decode(params, { sessionID: "nope", artifactID, revision: "0" })).toThrow()
  })

  test("content is raw bytes with an optional Range header; list bounds the page", () => {
    const content = group.endpoints["capability.artifact.content"]
    expect(decode(content.headers, {})).toEqual({})
    expect(decode(content.headers, { range: "bytes=0-1" })).toEqual({ range: "bytes=0-1" })
    const responses = spec.paths[`${item}/content`]?.get?.responses
    expect(responses?.[200]?.content).toHaveProperty("application/octet-stream")
    expect(responses?.[206]?.content).toHaveProperty("application/octet-stream")
    expect(responses?.[416]?.content).toBeUndefined()
    const query = group.endpoints["capability.artifact.list"].query
    expect(decode(query, { limit: "32", after: `${artifactID}:0` })).toEqual({ limit: 32, after: `${artifactID}:0` })
    ;["0", "33", "x"].forEach((limit) => expect(() => decode(query, { limit })).toThrow())
    expect(() => decode(query, { after: artifactID })).toThrow()
  })
})
