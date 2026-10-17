import { expect, test } from "bun:test"
import { Orchestra, Model, Session } from "@orchestra/client/effect"
import { SessionsCursor } from "@orchestra/protocol/groups/session"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

test("Effect session policy methods unwrap decoded data and encode the policy payload", async () => {
  const requests: HttpClientRequest.HttpClientRequest[] = []
  const policies = [
    { mode: "allowlist", models: [Model.Ref.make({ id: "claude", providerID: "anthropic", variant: "high" })] },
    { mode: "allowlist", models: [] },
    { mode: "inherit" },
  ] as const
  const httpClient = HttpClient.make((request) => {
    requests.push(request)
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        Response.json({ data: request.method === "GET" ? { mode: "inherit" } : policies[requests.length - 2] }),
      ),
    )
  })
  const result = await Effect.gen(function* () {
    const client = yield* Orchestra.make({ baseUrl: "http://localhost:3000" })
    const sessionID = Session.ID.make("ses_test")
    const initial = yield* client.sessions.getSubagentModels({ sessionID })
    const stored = yield* Effect.forEach(policies, (policy) => client.sessions.setSubagentModels({ sessionID, policy }))
    return { initial, stored }
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)

  expect(result.initial).toEqual({ mode: "inherit" })
  expect(result.stored).toEqual(policies)
  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["GET", "http://localhost:3000/api/session/ses_test/subagent-models"],
    ["POST", "http://localhost:3000/api/session/ses_test/subagent-models"],
    ["POST", "http://localhost:3000/api/session/ses_test/subagent-models"],
    ["POST", "http://localhost:3000/api/session/ses_test/subagent-models"],
  ])
  expect(requests[0].body._tag).toBe("Empty")
  expect(
    requests.slice(1).map((request) => {
      if (request.body._tag !== "Uint8Array") throw new Error("Expected an encoded JSON policy payload")
      return JSON.parse(new TextDecoder().decode(request.body.body))
    }),
  ).toEqual(policies.map((policy) => ({ policy })))
  expect(requests.slice(1).map((request) => request.headers["content-type"])).toEqual([
    "application/json",
    "application/json",
    "application/json",
  ])
})

test("Effect session archive and restore encode booleans and return void for 204", async () => {
  const requests: HttpClientRequest.HttpClientRequest[] = []
  const httpClient = HttpClient.make((request) => {
    requests.push(request)
    return Effect.succeed(HttpClientResponse.fromWeb(request, new Response(null, { status: 204 })))
  })
  const result = await Effect.gen(function* () {
    const client = yield* Orchestra.make({ baseUrl: "http://localhost:3000" })
    const sessionID = Session.ID.make("ses_test")
    return [
      yield* client.sessions.archive({ sessionID, archived: true }),
      yield* client.sessions.archive({ sessionID, archived: false }),
    ]
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)

  expect(result).toEqual([undefined, undefined])
  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["POST", "http://localhost:3000/api/session/ses_test/archive"],
    ["POST", "http://localhost:3000/api/session/ses_test/archive"],
  ])
  expect(
    requests.map((request) => {
      if (request.body._tag !== "Uint8Array") throw new Error("Expected an encoded JSON archive payload")
      return JSON.parse(new TextDecoder().decode(request.body.body))
    }),
  ).toEqual([{ archived: true }, { archived: false }])
})

test("Effect session list encodes includeArchived and follows the decoded cursor", async () => {
  const requests: HttpClientRequest.HttpClientRequest[] = []
  const next = SessionsCursor.make({
    includeArchived: true,
    order: "asc",
    anchor: { id: Session.ID.make("ses_test"), time: 1, direction: "next" },
  })
  const httpClient = HttpClient.make((request) => {
    requests.push(request)
    return Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        Response.json({
          data: [],
          cursor: request.urlParams.params.some(([key]) => key === "cursor") ? {} : { next },
        }),
      ),
    )
  })
  const result = await Effect.gen(function* () {
    const client = yield* Orchestra.make({ baseUrl: "http://localhost:3000" })
    const first = yield* client.sessions.list({ limit: 1, order: "asc", includeArchived: true })
    const last = yield* client.sessions.list({ limit: 1, cursor: first.cursor.next })
    yield* client.sessions.list({ includeArchived: false })
    return { first, last }
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)

  expect(result).toEqual({ first: { data: [], cursor: { next } }, last: { data: [], cursor: {} } })
  expect(
    requests.map((request) => [request.method, request.url, Object.fromEntries(request.urlParams.params)]),
  ).toEqual([
    ["GET", "http://localhost:3000/api/session", { limit: "1", order: "asc", includeArchived: "true" }],
    ["GET", "http://localhost:3000/api/session", { limit: "1", cursor: next }],
    ["GET", "http://localhost:3000/api/session", { includeArchived: "false" }],
  ])
  expect(requests.map((request) => request.body._tag)).toEqual(["Empty", "Empty", "Empty"])
})
