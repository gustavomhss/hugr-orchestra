import { expect, test } from "bun:test"
import { ClientApi, groupNames } from "../src/contract"
import {
  isConflictError,
  isInvalidRequestError,
  isResearchArtifactNotFoundError,
  isServiceUnavailableError,
  isSessionNotFoundError,
  isUnauthorizedError,
  Orchestra,
  type ResearchArtifactOutput,
} from "../src"

test("exposes every standard HTTP API group", () => {
  const client = Orchestra.make({ baseUrl: "http://localhost:3000" })

  const groups = [
    "health",
    "location",
    "agents",
    "sessions",
    "research",
    "messages",
    "models",
    "providers",
    "integrations",
    "credentials",
    "permissions",
    "files",
    "vcs",
    "commands",
    "mcp",
    "skills",
    "behaviors",
    "events",
    "ptys",
    "questions",
    "references",
    "projectCopies",
    "projects",
    "config",
    "relayDocuments",
    "relayPublish",
    "relayHooks",
    "pullRequests",
    "schedules",
    "actionsBindings",
    "actionsOperations",
    "actionsWorkflows",
    "actionsRuns",
    "actionsJobs",
    "actionsPipelines",
    "actionsResources",
    "actionsSource",
    "actionsTransfers",
    "relayRuns",
  ]
  expect(Object.keys(client)).toEqual(groups)
  expect(
    Object.values(ClientApi.groups)
      .map((group) => groupNames[group.identifier])
      .sort(),
  ).toEqual([...groups].sort())
  expect(Object.keys({ ...client, unknown: {} })).not.toEqual(groups)
  expect(Object.keys(client.research)).toEqual(["artifact"])
  expect(client.sessions).not.toHaveProperty("research")
  expect(Object.keys(client.messages)).toEqual(["list"])
  expect(Object.keys(client.integrations)).toEqual([
    "list",
    "get",
    "connectKey",
    "connectOauth",
    "oauthStatus",
    "oauthComplete",
    "oauthCancel",
    "attemptStatus",
    "attemptComplete",
    "attemptCancel",
  ])
  expect(Object.keys(client.files)).toEqual(["list", "find"])
  expect(Object.keys(client.ptys)).toEqual(["list", "create", "get", "update", "remove"])
})

test("sessions.get returns the wire projection", async () => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input) => {
      expect(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).toBe(
        "http://localhost:3000/api/session/ses_test",
      )
      return Response.json(session)
    },
  })

  const result = await client.sessions.get({ sessionID: "ses_test" })

  expect(result.time.created).toBe(1_717_171_717_000)
})

test("research.artifact uses the public revision and cursor contract", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const page = {
    ref: { id: "cart_01ARZ3NDEKTSV4RRFFQ69G5FAV", revision: 2 },
    representation: "text",
    text: "First retained line.\n",
    receipt: {
      binding: {
        projectID: "project",
        memberID: "jimmy",
        taskId: "task_research",
        executionSessionID: "ses_execution",
        authoritySessionID: "ses_authority",
        directory: "/tmp/project",
        worktree: "/tmp/project",
      },
      ref: {
        artifact: { id: "cart_01ARZ3NDEKTSV4RRFFQ69G5FAV", revision: 2 },
        representation: "text",
        digest: "a".repeat(64),
      },
      origin: { kind: "file", uri: "file:///tmp/project/source.txt" },
      capturedAt: 1_717_171_717_000,
      mediaType: "text/plain",
      bytes: 41,
      complete: true,
    },
    complete: false,
    cursor: "next/page+offset=20&revision=2",
  } satisfies ResearchArtifactOutput
  const lastPage = {
    ref: page.ref,
    representation: page.representation,
    text: "Last retained line.\n",
    receipt: page.receipt,
    complete: true,
  } satisfies ResearchArtifactOutput
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      requests.push({ url, init })
      return Response.json(new URL(url).searchParams.has("cursor") ? lastPage : page)
    },
  })

  const first = await client.research.artifact({
    sessionID: "ses_authority",
    artifactID: page.ref.id,
    revision: page.ref.revision,
  })
  const last = await client.research.artifact({
    sessionID: "ses_authority",
    artifactID: first.ref.id,
    revision: first.ref.revision,
    cursor: first.cursor,
  })

  expect(first).toEqual(page)
  expect(last).toEqual(lastPage)
  expect(last).not.toHaveProperty("cursor")
  expect(requests.map((request) => [request.init?.method, request.url])).toEqual([
    ["GET", "http://localhost:3000/api/session/ses_authority/research/cart_01ARZ3NDEKTSV4RRFFQ69G5FAV?revision=2"],
    [
      "GET",
      "http://localhost:3000/api/session/ses_authority/research/cart_01ARZ3NDEKTSV4RRFFQ69G5FAV?revision=2&cursor=next%2Fpage%2Boffset%3D20%26revision%3D2",
    ],
  ])
  expect(requests.map((request) => request.init?.body)).toEqual([undefined, undefined])
})

test.each([
  [404, { _tag: "ResearchArtifactNotFoundError", message: "Research artifact not found" }, isResearchArtifactNotFoundError],
  [409, { _tag: "ConflictError", message: "Revision conflict", resource: "research artifact" }, isConflictError],
  [400, { _tag: "InvalidRequestError", message: "Invalid cursor", field: "cursor" }, isInvalidRequestError],
  [503, { _tag: "ServiceUnavailableError", message: "Research unavailable", service: "research" }, isServiceUnavailableError],
  [401, { _tag: "UnauthorizedError", message: "Authentication required" }, isUnauthorizedError],
] as const)("research.artifact preserves declared HTTP %i errors", async (status, declared, guard) => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async () => Response.json(declared, { status }),
  })

  await client.research
    .artifact({
      sessionID: "ses_authority",
      artifactID: "cart_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      revision: 2,
    })
    .then(
      () => {
        throw new Error("Expected request to fail")
      },
      (error: unknown) => {
        expect(guard(error)).toBe(true)
        expect(error).toEqual(declared)
      },
    )
})

test("events.subscribe exposes the Promise event stream wire projection", async () => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async () =>
      new Response(
        `: heartbeat\n\ndata: ${JSON.stringify({ id: "evt_connected", type: "server.connected", data: {} })}\n\n` +
          `data: ${JSON.stringify(modelSwitchedEvent)}\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      ),
  })
  const events = []
  for await (const event of client.events.subscribe()) events.push(event)

  expect(events).toEqual([{ id: "evt_connected", type: "server.connected", data: {} }, modelSwitchedEvent])
  expect(events[1]?.type === "session.next.model.switched" && events[1].data.timestamp).toBe(1_717_171_717_000)
})

test("events.subscribe terminates on malformed Promise SSE data", async () => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async () => new Response("data: {not-json}\n\n", { headers: { "content-type": "text/event-stream" } }),
  })

  const next = client.events.subscribe()[Symbol.asyncIterator]().next()
  expect(
    await next.then(
      () => {
        throw new Error("Expected promise to reject")
      },
      (error: unknown) => error,
    ),
  ).toMatchObject({
    name: "ClientError",
    reason: "MalformedResponse",
  })
})

test("session methods use the public HTTP contract", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  let historyPage = 0
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      requests.push({ url, init })
      if (url.includes("/event")) {
        return new Response(`data: ${JSON.stringify(modelSwitchedEvent)}\n\n`, {
          headers: { "content-type": "text/event-stream" },
        })
      }
      if (url.includes("/history")) {
        historyPage++
        return Response.json(
          historyPage === 1 ? { data: [modelSwitchedEvent], hasMore: true } : { data: [], hasMore: false },
        )
      }
      if (url.includes("/prompt")) return Response.json(admission)
      if (url.includes("/context")) return Response.json({ data: [] })
      if (url.includes("/message/")) return Response.json({ data: modelSwitchedMessage })
      if (url.endsWith("/api/session/active")) return Response.json({ data: { ses_test: { type: "running" } } })
      if (init?.method === "POST" && url.endsWith("/api/session")) return Response.json(session)
      if (url.endsWith("/compact")) return Response.json({ data: { compacted: true } })
      if (init?.method === "POST") return new Response(null, { status: 204 })
      return Response.json({ data: [session.data], cursor: { next: "next" } })
    },
  })

  const page = await client.sessions.list({ limit: 10, order: "desc" })
  const active = await client.sessions.active()
  const created = await client.sessions.create({ location: { directory: "/tmp/project" } })
  await client.sessions.switchAgent({ sessionID: "ses_test", agent: "maestro" })
  await client.sessions.switchModel({
    sessionID: "ses_test",
    model: { id: "claude", providerID: "anthropic" },
  })
  const admitted = await client.sessions.prompt({
    sessionID: "ses_test",
    prompt: { text: "Hello" },
    resume: false,
  })
  await client.sessions.compact({ sessionID: "ses_test" })
  await client.sessions.wait({ sessionID: "ses_test" })
  const context = await client.sessions.context({ sessionID: "ses_test" })
  const history = await client.sessions.history({ sessionID: "ses_test", after: 0, limit: 1 })
  const historyAfter = history.data.at(-1)?.durable?.seq
  const historyNext = history.hasMore
    ? await client.sessions.history({ sessionID: "ses_test", after: historyAfter, limit: 2 })
    : undefined
  const events = []
  for await (const event of client.sessions.events({ sessionID: "ses_test", after: 0 })) events.push(event)
  await client.sessions.interrupt({ sessionID: "ses_test" })
  const message = await client.sessions.message({ sessionID: "ses_test", messageID: "msg_model" })

  expect(page.cursor.next).toBe("next")
  expect(active).toEqual({ ses_test: { type: "running" } })
  expect(created.id).toBe("ses_test")
  expect(admitted.id).toBe("msg_test")
  expect(context).toEqual([])
  expect(history).toEqual({ data: [modelSwitchedEvent], hasMore: true })
  expect(historyNext).toEqual({ data: [], hasMore: false })
  expect(events).toEqual([modelSwitchedEvent])
  expect(message).toEqual(modelSwitchedMessage)
  expect(requests.map((request) => [request.init?.method, request.url])).toEqual([
    ["GET", "http://localhost:3000/api/session?limit=10&order=desc"],
    ["GET", "http://localhost:3000/api/session/active"],
    ["POST", "http://localhost:3000/api/session"],
    ["POST", "http://localhost:3000/api/session/ses_test/agent"],
    ["POST", "http://localhost:3000/api/session/ses_test/model"],
    ["POST", "http://localhost:3000/api/session/ses_test/prompt"],
    ["POST", "http://localhost:3000/api/session/ses_test/compact"],
    ["POST", "http://localhost:3000/api/session/ses_test/wait"],
    ["GET", "http://localhost:3000/api/session/ses_test/context"],
    ["GET", "http://localhost:3000/api/session/ses_test/history?limit=1&after=0"],
    ["GET", "http://localhost:3000/api/session/ses_test/history?limit=2&after=1"],
    ["GET", "http://localhost:3000/api/session/ses_test/event?after=0"],
    ["POST", "http://localhost:3000/api/session/ses_test/interrupt"],
    ["GET", "http://localhost:3000/api/session/ses_test/message/msg_model"],
  ])
  const body = requests.find((request) => request.url.endsWith("/api/session/ses_test/prompt"))?.init?.body
  if (typeof body !== "string") throw new Error("Expected JSON request body")
  expect(JSON.parse(body)).toEqual({
    prompt: { text: "Hello" },
    resume: false,
  })
})

test("middleware errors remain declared client errors", async () => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async () =>
      Response.json({ _tag: "UnauthorizedError", message: "Authentication required" }, { status: 401 }),
  })

  try {
    await client.sessions.create({})
    throw new Error("Expected request to fail")
  } catch (error) {
    expect(isUnauthorizedError(error)).toBe(true)
  }
})

test("sessions.history decodes SessionNotFoundError", async () => {
  const client = Orchestra.make({
    baseUrl: "http://localhost:3000",
    fetch: async () =>
      Response.json(
        { _tag: "SessionNotFoundError", sessionID: "ses_missing", message: "Session not found" },
        { status: 404 },
      ),
  })

  try {
    await client.sessions.history({ sessionID: "ses_missing" })
    throw new Error("Expected request to fail")
  } catch (error) {
    expect(isSessionNotFoundError(error)).toBe(true)
  }
})

const session = {
  data: {
    id: "ses_test",
    projectID: "project",
    cost: 0,
    tokens: {
      input: 1,
      output: 2,
      reasoning: 3,
      cache: { read: 4, write: 5 },
    },
    time: {
      created: 1_717_171_717_000,
      updated: 1_717_171_717_000,
    },
    title: "Test",
    location: { directory: "/tmp/project" },
  },
}

const admission = {
  data: {
    admittedSeq: 0,
    id: "msg_test",
    sessionID: "ses_test",
    prompt: { text: "Hello" },
    delivery: "steer",
    timeCreated: 1_717_171_717_000,
  },
}

const modelSwitchedMessage = {
  id: "msg_model",
  type: "model-switched",
  time: { created: 1_717_171_717_000 },
  model: { id: "claude", providerID: "anthropic" },
}

const modelSwitchedEvent = {
  id: "evt_model",
  type: "session.next.model.switched",
  durable: { aggregateID: "ses_test", seq: 1, version: 1 },
  data: {
    timestamp: 1_717_171_717_000,
    sessionID: "ses_test",
    messageID: "msg_model",
    model: { id: "claude", providerID: "anthropic" },
  },
}
