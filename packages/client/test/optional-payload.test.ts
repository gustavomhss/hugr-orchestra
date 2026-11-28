import { expect, test } from "bun:test"
import { Orchestra, Session } from "@orchestra/client/effect"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"

test("imported Effect synthetic payload omits undefined optionals while preserving resume false", async () => {
  const requests: HttpClientRequest.HttpClientRequest[] = []
  const httpClient = HttpClient.make((request) => {
    requests.push(request)
    return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ data: { id: "msg_restored" } })))
  })
  const restored = await Effect.gen(function* () {
    const client = yield* Orchestra.make({ baseUrl: "http://localhost:3000" })
    return yield* client.sessions.synthetic({
      sessionID: Session.ID.make("ses_restored"),
      id: undefined,
      text: "restored text",
      resume: false,
    })
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)
  expect(restored).toEqual({ id: "msg_restored" })
  expect(requests).toHaveLength(1)
  if (requests[0].body._tag !== "Uint8Array") throw new Error("Expected a JSON synthetic payload")
  expect(JSON.parse(new TextDecoder().decode(requests[0].body.body))).toEqual({ text: "restored text", resume: false })
})

test("imported Effect Slack discovery encodes an absent strict optional payload cursor", async () => {
  const requests: HttpClientRequest.HttpClientRequest[] = []
  const scope = { generation: "generation-1", conversations: [], selected: [], state: "idle" }
  const httpClient = HttpClient.make((request) => {
    requests.push(request)
    return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({
      location: { directory: "/work", project: { id: "global", directory: "/work" } }, data: scope,
    })))
  })
  const result = await Effect.gen(function* () {
    const client = yield* Orchestra.make({ baseUrl: "http://localhost:3000" })
    return yield* client["server.inbox"].slackDiscover({ generation: "generation-1", cursor: undefined })
  }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient), Effect.runPromise)
  expect(result.data).toEqual(scope)
  expect(requests).toHaveLength(1)
  if (requests[0].body._tag !== "Uint8Array") throw new Error("Expected a JSON discovery payload")
  expect(JSON.parse(new TextDecoder().decode(requests[0].body.body))).toEqual({ generation: "generation-1" })
})
