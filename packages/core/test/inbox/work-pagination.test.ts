import { expect, test } from "bun:test"
import { Effect } from "effect"
import { request, requestWithMetadata } from "../../src/capability/channel/http"
import { notifications } from "../../src/inbox/github"
import { assignedIssues } from "../../src/inbox/linear"
import { githubDefaults, githubItems, provenCi } from "../../src/inbox/remote"

async function fixture(
  run: (input: {
    origin: string
    calls: { url: URL; body: unknown }[]
    respond: { value: (url: URL) => Response }
  }) => Promise<void>,
) {
  const calls: { url: URL; body: unknown }[] = []
  const respond = { value: (_url: URL): Response => Response.json({ unexpected: true }, { status: 500 }) }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      expect(req.headers.get("authorization")).toBe("Bearer fixture-token")
      const url = new URL(req.url)
      calls.push({ url, body: req.method === "POST" ? await req.json() : undefined })
      return respond.value(url)
    },
  })
  try {
    await run({ origin: server.url.origin, calls, respond })
  } finally {
    await server.stop(true)
  }
}

const note = {
  updated_at: "2026-11-05T00:00:00Z",
  id: "n1",
  reason: "assign",
  subject: {
    title: "Assigned",
    type: "Issue",
    url: "https://api.github.com/repos/a/b/issues/1",
    latest_comment_url: null,
  },
  repository: { full_name: "a/b" },
}
const issue = {
  id: "issue-1",
  identifier: "ORCH-1",
  title: "Assigned work",
  url: "https://linear.app/work/issue/ORCH-1",
  updatedAt: "2026-11-05T00:00:00Z",
  state: { id: "state-1", name: "In Progress" },
  priority: 2,
  dueDate: null,
}
const linearPage = (nodes: unknown[], hasNextPage: boolean, endCursor: string | null, viewer = "user-1") => ({
  data: { viewer: { id: viewer }, issues: { nodes, pageInfo: { hasNextPage, endCursor } } },
})

test("GitHub 403 rate-limit headers are distinguished from a permission denial", async () => {
  await fixture(async ({ origin, respond }) => {
    respond.value = () =>
      Response.json(
        {},
        {
          status: 403,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.floor(Date.now() / 1000) + 120),
          },
        },
      )
    const requestPage = () =>
      requestWithMetadata(
        "https://api.github.com",
        "Bearer fixture-token",
        {
          method: "GET",
          path: "/notifications",
        },
        { fixtureOrigin: origin },
      )
    const limited = await Effect.runPromise(requestPage().pipe(Effect.flip))
    expect(limited).toMatchObject({ status: 403, rateLimited: true })
    expect(limited.retryAfterMs).toBeGreaterThan(110_000)
    respond.value = () => Response.json({}, { status: 403 })
    expect((await Effect.runPromise(requestPage().pipe(Effect.flip))).rateLimited).toBeUndefined()
  })
})

test("GitHub repository/class preferences are explicit, case-insensitive and never exempt CI from authorship proof", () => {
  const review = { ...note, id: "review", reason: "review_requested" }
  const mention = { ...note, id: "mention", reason: "team_mention" }
  const ci = {
    ...note,
    id: "ci",
    reason: "ci_activity",
    subject: { ...note.subject, type: "PullRequest", url: "https://api.github.com/repos/a/b/pulls/2" },
  }
  expect(
    githubItems([note, review, mention, ci], "ada", new Map(), {
      ...githubDefaults,
      repositories: ["A/B"],
      reviews: false,
      mentions: false,
    }).map((item) => item.externalId),
  ).toEqual(["n1"])
  expect(githubItems([note], "ada", new Map(), { ...githubDefaults, repositories: ["other/repo"] })).toEqual([])
  expect(githubItems([note], "ada", new Map(), { ...githubDefaults, assignments: false })).toEqual([])
  const unsafe = githubItems(
    [{ ...note, subject: { ...note.subject, url: "https://evil.example/repos/a/b/issues/1" } }],
    "ada",
  )
  expect(unsafe[0]?.reply).toBe(false)
  expect(unsafe[0]?.deepLink).toBeUndefined()
  expect(
    provenCi([ci], "ada", {
      pulls: {
        "/repos/a/b/pulls/2": {
          url: "https://api.github.com/repos/a/b/pulls/3",
          user: { login: "ada" },
        },
      },
      suites: {},
      commits: {},
    }).size,
  ).toBe(0)
})

test("GitHub follows Link even from a short or empty page, deduplicates and retains assignments/team mentions", async () => {
  await fixture(async ({ origin, calls, respond }) => {
    respond.value = (url) =>
      url.searchParams.get("page") === "1"
        ? Response.json([], {
            headers: { Link: '<https://api.github.com/notifications?per_page=100&page=2>; rel="next"' },
          })
        : Response.json([note, note, { ...note, id: "n2", reason: "team_mention" }])
    const result = await Effect.runPromise(
      notifications((input) =>
        requestWithMetadata("https://api.github.com", "Bearer fixture-token", input, { fixtureOrigin: origin }),
      ),
    )
    expect(result).toHaveLength(2)
    expect(calls.map((call) => call.url.searchParams.get("page"))).toEqual(["1", "2"])
    expect(calls.every((call) => call.url.searchParams.get("all") === "false")).toBe(true)
    expect(githubItems(result, "ada")).toHaveLength(2)
  })
})

test("GitHub rejects foreign, cyclic, skipping, malformed and broadened pagination links before another request", async () => {
  for (const link of [
    '<https://evil.example/notifications?page=2>; rel="next"',
    '<https://api.github.com/notifications?page=1>; rel="next"',
    '<https://api.github.com/notifications?page=3>; rel="next"',
    '<https://api.github.com/notifications?page=2&all=true>; rel="next"',
    "not a link",
  ])
    await fixture(async ({ origin, calls, respond }) => {
      respond.value = () => Response.json([note], { headers: { Link: link } })
      expect(
        await Effect.runPromise(
          notifications((input) =>
            requestWithMetadata("https://api.github.com", "Bearer fixture-token", input, { fixtureOrigin: origin }),
          ).pipe(Effect.flip),
        ),
      ).toMatchObject({ reason: "invalid_response" })
      expect(calls).toHaveLength(1)
    })
})

test("GitHub fails an unfinished 100-page snapshot rather than returning the first pages", async () => {
  await fixture(async ({ origin, calls, respond }) => {
    respond.value = (url) =>
      Response.json([note], {
        headers: {
          Link: `<https://api.github.com/notifications?page=${Number(url.searchParams.get("page")) + 1}>; rel="next"`,
        },
      })
    expect(
      await Effect.runPromise(
        notifications((input) =>
          requestWithMetadata("https://api.github.com", "Bearer fixture-token", input, { fixtureOrigin: origin }),
        ).pipe(Effect.flip),
      ),
    ).toMatchObject({ reason: "response_limit" })
    expect(calls).toHaveLength(100)
  })
}, 15_000)

test("Linear follows opaque cursors including empty intermediate pages and enforces personal assignment", async () => {
  await fixture(async ({ origin, calls, respond }) => {
    respond.value = () =>
      Response.json(calls.length === 1 ? linearPage([], true, "opaque+/=&") : linearPage([issue], false, null))
    const result = await Effect.runPromise(
      assignedIssues((input) =>
        request("https://api.linear.app", "Bearer fixture-token", input, { fixtureOrigin: origin }),
      ),
    )
    expect(result.data.issues.nodes).toMatchObject([issue])
    expect(calls.map((call) => call.body)).toMatchObject([
      { variables: { after: null } },
      { variables: { after: "opaque+/=&" } },
    ])
    expect(JSON.stringify(calls[0]?.body)).toContain("assignee: { isMe: { eq: true } }")
  })
})

test("Linear rejects GraphQL errors, missing completion/cursor, cycles and a changed authenticated viewer", async () => {
  for (const pages of [
    [{ ...linearPage([issue], false, null), errors: [{ message: "fixture secret" }] }],
    [{ data: { issues: { nodes: [issue] } } }],
    [linearPage([issue], true, null)],
    [linearPage([issue], true, "same"), linearPage([], true, "same")],
    [linearPage([issue], true, "next"), linearPage([], false, null, "user-2")],
  ])
    await fixture(async ({ origin, calls, respond }) => {
      respond.value = () => Response.json(pages[calls.length - 1])
      expect(
        await Effect.runPromise(
          assignedIssues((input) =>
            request("https://api.linear.app", "Bearer fixture-token", input, { fixtureOrigin: origin }),
          ).pipe(Effect.flip),
        ),
      ).toMatchObject({ reason: "invalid_response" })
    })
})
