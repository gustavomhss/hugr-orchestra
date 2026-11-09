import { expect, test } from "bun:test"
import { Effect } from "effect"
import { requestWithMetadata } from "../../src/capability/channel/http"
import { pagerdutyIncidents, sentryIssues, trelloNotifications } from "../../src/inbox/notifications"

async function fixture(
  run: (
    rpc: (input: Parameters<typeof requestWithMetadata>[2]) => ReturnType<typeof requestWithMetadata>,
    calls: URL[],
    respond: { value: (url: URL) => Response },
  ) => Promise<void>,
) {
  const calls: URL[] = []
  const respond = { value: (_url: URL): Response => Response.json({}, { status: 500 }) }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      calls.push(url)
      if (["/users/me", "/incidents"].includes(url.pathname))
        expect(req.headers.get("accept")).toBe("application/vnd.pagerduty+json;version=2")
      return respond.value(url)
    },
  })
  try {
    await run(
      (input) =>
        requestWithMetadata("https://provider.example", "fixture-only", input, { fixtureOrigin: server.url.origin }),
      calls,
      respond,
    )
  } finally {
    await server.stop(true)
  }
}

test("PagerDuty follows declared offsets, binds current assignment and never treats on-call/others' incidents as yours", async () => {
  await fixture(async (rpc, calls, respond) => {
    const incident = {
      id: "P1",
      title: "Service down",
      status: "triggered",
      urgency: "high",
      service: { id: "S1" },
      assignments: [{ assignee: { id: "U1" } }],
      html_url: "https://example.pagerduty.com/incidents/P1",
    }
    respond.value = (url) =>
      url.pathname.endsWith("/me")
        ? Response.json({ user: { id: "U1" } })
        : Response.json({
            incidents:
              url.searchParams.get("offset") === "0"
                ? []
                : [incident, { ...incident, id: "P2", assignments: [{ assignee: { id: "U2" } }] }],
            offset: Number(url.searchParams.get("offset")),
            limit: 100,
            more: url.searchParams.get("offset") === "0",
          })
    expect(await Effect.runPromise(pagerdutyIncidents(rpc, []))).toHaveLength(1)
    expect(calls.filter((url) => url.pathname === "/incidents").map((url) => url.searchParams.get("offset"))).toEqual([
      "0",
      "100",
    ])
    expect(
      calls
        .filter((url) => url.pathname === "/incidents")
        .every((url) => url.searchParams.get("user_ids[]") === "U1" && url.searchParams.get("date_range") === "all"),
    ).toBe(true)
  })
})

test("Sentry requires projects, keeps filters over cursor paging and fingerprints issue state rather than event counts", async () => {
  await fixture(async (rpc, calls, respond) => {
    expect(await Effect.runPromise(sentryIssues(rpc, "org", [], "review"))).toEqual([])
    expect(calls).toHaveLength(0)
    const issue = {
      id: "i1",
      title: "TypeError",
      status: "unresolved",
      substatus: "regressed",
      level: "error",
      project: { id: "20", slug: "api" },
      permalink: "https://sentry.io/organizations/org/issues/1/",
    }
    respond.value = (url) =>
      url.searchParams.has("cursor")
        ? Response.json([issue])
        : Response.json([], {
            headers: {
              Link: '<https://sentry.io/api/0/organizations/org/issues/?cursor=opaque>; rel="next"; results="true"; cursor="opaque"',
            },
          })
    const result = await Effect.runPromise(sentryIssues(rpc, "org", ["20"], "review"))
    expect(result).toHaveLength(1)
    expect(
      calls.every(
        (url) =>
          url.searchParams.get("project") === "20" &&
          url.searchParams.get("query") === "is:for_review issue.category:error",
      ),
    ).toBe(true)
    expect(result[0]?.reply).toBe(false)
  })
})

test("Trello reads personal unread notifications only on selected boards, never all board activity", async () => {
  await fixture(async (rpc, calls, respond) => {
    expect(await Effect.runPromise(trelloNotifications(rpc, []))).toEqual([])
    expect(calls).toHaveLength(0)
    respond.value = () =>
      Response.json([
        {
          id: "aaaaaaaaaaaaaaaaaaaaaaaa",
          unread: true,
          type: "mentionedOnCard",
          date: "2026-11-05T00:00:00Z",
          data: { board: { id: "board-1", name: "Work" }, card: { name: "Review release", shortLink: "Abcd1234" } },
          idMemberCreator: "ada",
        },
        {
          id: "bbbbbbbbbbbbbbbbbbbbbbbb",
          unread: true,
          type: "mentionedOnCard",
          date: "2026-11-05T00:00:00Z",
          data: { board: { id: "other", name: "Other" } },
          idMemberCreator: "ada",
        },
      ])
    const result = await Effect.runPromise(trelloNotifications(rpc, ["board-1"]))
    expect(result).toHaveLength(1)
    expect(result[0]?.deepLink).toBe("https://trello.com/c/Abcd1234")
    expect(calls[0]?.pathname).toBe("/1/members/me/notifications")
    expect(calls[0]?.searchParams.get("read_filter")).toBe("unread")
  })
})

test("notification adapters fail malformed completion, foreign cursors and cycles rather than returning partial data", async () => {
  await fixture(async (rpc, calls, respond) => {
    respond.value = (url) =>
      url.pathname.endsWith("/me")
        ? Response.json({ user: { id: "U1" } })
        : Response.json({ incidents: [], offset: 0, limit: 100, more: true })
    expect(await Effect.runPromise(pagerdutyIncidents(rpc, []).pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
    expect(calls).toHaveLength(3)
  })
  await fixture(async (rpc, calls, respond) => {
    respond.value = () =>
      Response.json([], {
        headers: { Link: '<https://evil.example/issues/?cursor=opaque>; rel="next"; results="true"; cursor="opaque"' },
      })
    expect(await Effect.runPromise(sentryIssues(rpc, "org", ["20"], "review").pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
    expect(calls).toHaveLength(1)
    respond.value = () =>
      Response.json([], {
        headers: {
          Link: '<https://sentry.io/api/0/organizations/org/issues/?cursor=opaque>; rel="next"; results="true"; cursor="opaque"',
        },
      })
    expect(await Effect.runPromise(sentryIssues(rpc, "org", ["20"], "assigned").pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
    expect(calls).toHaveLength(3)
  })
  await fixture(async (rpc, calls, respond) => {
    respond.value = () =>
      Response.json(
        Array.from({ length: 100 }, (_, index) => ({
          id: index.toString(16).padStart(24, "0"),
          unread: true,
          type: "mentionedOnCard",
          date: "2026-11-05T00:00:00Z",
          idMemberCreator: "ada",
          data: { board: { id: "board-1", name: "Work" } },
        })),
      )
    expect(await Effect.runPromise(trelloNotifications(rpc, ["board-1"]).pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
    expect(calls).toHaveLength(2)
  })
})

test("Trello accepts documented system notifications with null creators/data and expanded board/card entities", async () => {
  await fixture(async (rpc, calls, respond) => {
    respond.value = () =>
      Response.json([
        {
          id: "111111111111111111111111",
          unread: true,
          type: "cardDueSoon",
          date: "2026-11-05T00:00:00Z",
          idMemberCreator: null,
          data: null,
          board: { id: "board-1", name: "Work" },
          card: { name: "Due tomorrow", shortLink: "Abcd1234" },
        },
        {
          id: "222222222222222222222222",
          unread: true,
          type: "accountNotice",
          date: "2026-11-05T00:00:00Z",
          idMemberCreator: null,
          data: null,
        },
        {
          id: "333333333333333333333333",
          unread: true,
          type: "cardDueSoon",
          date: "2026-11-05T00:00:00Z",
          idMemberCreator: null,
          data: null,
          board: { id: "other", name: "Other" },
          card: { name: "Not selected" },
        },
      ])
    const items = await Effect.runPromise(trelloNotifications(rpc, ["board-1"]))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      actor: "Trello",
      snippet: "Due tomorrow",
      deepLink: "https://trello.com/c/Abcd1234",
      reply: false,
    })
    expect(calls).toHaveLength(1)
  })
})

test("Trello refuses contradictory expanded board identity instead of widening selected scope", async () => {
  await fixture(async (rpc, calls, respond) => {
    respond.value = () =>
      Response.json([
        {
          id: "111111111111111111111111",
          unread: true,
          type: "mentionedOnCard",
          date: "2026-11-05T00:00:00Z",
          idMemberCreator: "ada",
          data: { board: { id: "board-1", name: "Selected" } },
          board: { id: "other", name: "Unselected" },
        },
      ])
    expect(await Effect.runPromise(trelloNotifications(rpc, ["board-1"]).pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
    expect(calls).toHaveLength(1)
  })
})

test("Sentry accepts an explicitly null optional substatus and sends selected project slugs unchanged", async () => {
  await fixture(async (rpc, calls, respond) => {
    respond.value = () =>
      Response.json([
        {
          id: "i1",
          title: "TypeError",
          status: "unresolved",
          substatus: null,
          level: "error",
          project: { id: "20", slug: "api" },
          permalink: "https://sentry.io/organizations/org/issues/1/",
        },
      ])
    const first = await Effect.runPromise(sentryIssues(rpc, "org", ["api"], "assigned"))
    expect(first).toHaveLength(1)
    expect(calls[0]?.searchParams.get("project")).toBe("api")
    respond.value = () =>
      Response.json([
        {
          id: "i1",
          title: "TypeError",
          status: "unresolved",
          level: "error",
          project: { id: "20", slug: "api" },
          permalink: "https://sentry.io/organizations/org/issues/1/",
        },
      ])
    expect((await Effect.runPromise(sentryIssues(rpc, "org", ["api"], "assigned")))[0]?.revision).toBe(
      first[0]?.revision,
    )
  })
})
