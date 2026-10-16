import { expect, test } from "bun:test"
import { Orchestra, type SessionsSetSubagentModelsInput } from "@orchestra/client"

test("session policy methods unwrap data and send only the policy payload", async () => {
  const requests: Request[] = []
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request.clone())
      if (request.method === "GET") return Response.json({ data: { mode: "inherit" } })
      const body: unknown = await request.json()
      if (!body || typeof body !== "object" || !("policy" in body)) throw new Error("Expected a policy payload")
      return Response.json({ data: body.policy })
    },
  })
  const policies = [
    { mode: "allowlist", models: [{ id: "claude", providerID: "anthropic", variant: "high" }] },
    { mode: "allowlist", models: [] },
    { mode: "inherit" },
  ] satisfies SessionsSetSubagentModelsInput["policy"][]

  expect(await client.sessions.getSubagentModels({ sessionID: "ses_test" })).toEqual({ mode: "inherit" })
  for (const policy of policies) {
    expect(await client.sessions.setSubagentModels({ sessionID: "ses_test", policy })).toEqual(policy)
  }
  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["GET", "http://localhost:3000/api/session/ses_test/subagent-models"],
    ["POST", "http://localhost:3000/api/session/ses_test/subagent-models"],
    ["POST", "http://localhost:3000/api/session/ses_test/subagent-models"],
    ["POST", "http://localhost:3000/api/session/ses_test/subagent-models"],
  ])
  expect(await requests[0].text()).toBe("")
  expect(await Promise.all(requests.slice(1).map((request) => request.json()))).toEqual(
    policies.map((policy) => ({ policy })),
  )
  expect(requests.slice(1).map((request) => request.headers.get("content-type"))).toEqual([
    "application/json",
    "application/json",
    "application/json",
  ])
})

test("session archive and restore send booleans and return void for 204", async () => {
  const requests: Request[] = []
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      requests.push(new Request(input, init))
      return new Response(null, { status: 204 })
    },
  })

  expect(await client.sessions.archive({ sessionID: "ses_test", archived: true })).toBeUndefined()
  expect(await client.sessions.archive({ sessionID: "ses_test", archived: false })).toBeUndefined()
  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["POST", "http://localhost:3000/api/session/ses_test/archive"],
    ["POST", "http://localhost:3000/api/session/ses_test/archive"],
  ])
  expect(await Promise.all(requests.map((request) => request.json()))).toEqual([
    { archived: true },
    { archived: false },
  ])
})

test("session list sends includeArchived on the first page and follows the returned cursor", async () => {
  const requests: Request[] = []
  const next = "next/page+archive=true&offset=1"
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return Response.json({ data: [], cursor: request.url.includes("cursor=") ? {} : { next } })
    },
  })

  const first = await client.sessions.list({ limit: 1, order: "asc", includeArchived: true })
  expect(first).toEqual({ data: [], cursor: { next } })
  expect(await client.sessions.list({ limit: 1, cursor: first.cursor.next })).toEqual({ data: [], cursor: {} })
  await client.sessions.list({ includeArchived: false })
  expect(requests.map((request) => [request.method, request.url])).toEqual([
    ["GET", "http://localhost:3000/api/session?limit=1&order=asc&includeArchived=true"],
    ["GET", "http://localhost:3000/api/session?limit=1&cursor=next%2Fpage%2Barchive%3Dtrue%26offset%3D1"],
    ["GET", "http://localhost:3000/api/session?includeArchived=false"],
  ])
  expect(await Promise.all(requests.map((request) => request.text()))).toEqual(["", "", ""])
})
