import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { request, type RPC } from "../../src/capability/channel/http"
import { search } from "../../src/inbox/jira"

const issue = { id: "10001", key: "ORCH-1", fields: { summary: "Assigned work" } }

async function fixture(
  pages: readonly { body: unknown; status?: number }[],
  run: (rpc: RPC, calls: { url: URL; method: string; authorization: string | null }[]) => Promise<void>,
) {
  const calls: { url: URL; method: string; authorization: string | null }[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      calls.push({ url: new URL(req.url), method: req.method, authorization: req.headers.get("authorization") })
      const page = pages[calls.length - 1]
      return Response.json(page?.body ?? { error: "unexpected request" }, { status: page?.status ?? (page ? 200 : 500) })
    },
  })
  const rpc: RPC = (input) => request("https://example.atlassian.net", "Bearer fixture-secret", input, {
    fixtureOrigin: server.url.origin,
    timeoutMs: 1000,
    maxResponseBytes: 256 * 1024,
  })
  try {
    await run(rpc, calls)
  } finally {
    await server.stop(true)
  }
}

describe("Jira enhanced search", () => {
  test("W1a uses enhanced search, explicit fields and the personal assignment constraint", async () => {
    await fixture([{ body: { issues: [issue], isLast: true } }], async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc))).toEqual({ issues: [issue] })
      expect(calls).toHaveLength(1)
      expect(calls[0]?.method).toBe("GET")
      expect(calls[0]?.url.pathname).toBe("/rest/api/3/search/jql")
      expect(calls[0]?.url.searchParams.get("jql")).toBe("assignee = currentUser() ORDER BY updated DESC")
      expect(calls[0]?.url.searchParams.get("fields")).toBe("summary")
      expect(calls[0]?.url.searchParams.get("maxResults")).toBe("50")
      expect(calls[0]?.url.searchParams.has("startAt")).toBe(false)
      expect(calls[0]?.authorization).toBe("Bearer fixture-secret")
    })
  })

  test("W1a follows opaque continuation tokens and combines every page", async () => {
    const next = "opaque+/=&?token"
    const second = { ...issue, id: "10002", key: "ORCH-2" }
    await fixture([
      { body: { issues: [issue], isLast: false, nextPageToken: next } },
      { body: { issues: [second], isLast: true } },
    ], async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc))).toEqual({ issues: [issue, second] })
      expect(calls).toHaveLength(2)
      expect(calls[0]?.url.searchParams.has("nextPageToken")).toBe(false)
      expect(calls[1]?.url.searchParams.get("nextPageToken")).toBe(next)
      expect(calls[1]?.url.searchParams.get("jql")).toBe(calls[0]?.url.searchParams.get("jql"))
    })
  })

  test("W1a continues through an empty intermediate page", async () => {
    await fixture([
      { body: { issues: [], isLast: false, nextPageToken: "next" } },
      { body: { issues: [issue], isLast: true } },
    ], async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc))).toEqual({ issues: [issue] })
      expect(calls).toHaveLength(2)
    })
  })

  test("W1a accepts a genuinely empty final result", async () => {
    await fixture([{ body: { issues: [], isLast: true } }], async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc))).toEqual({ issues: [] })
      expect(calls).toHaveLength(1)
    })
  })

  test.each([
    { errorMessages: ["query rejected"] },
    { issues: [], total: 0 },
    { issues: [{ id: "10001", key: "ORCH-1" }], isLast: true },
    { issues: [], isLast: false },
    { issues: [], isLast: false, nextPageToken: "" },
    { issues: [], isLast: true, nextPageToken: "unexpected" },
  ])("W1a rejects malformed or inconsistent response %#", async (body) => {
    await fixture([{ body }], async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc).pipe(Effect.flip))).toMatchObject({ reason: "invalid_response" })
      expect(calls).toHaveLength(1)
    })
  })

  test("W1a rejects cursor cycles instead of claiming partial success", async () => {
    await fixture([
      { body: { issues: [issue], isLast: false, nextPageToken: "a" } },
      { body: { issues: [], isLast: false, nextPageToken: "b" } },
      { body: { issues: [], isLast: false, nextPageToken: "a" } },
    ], async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc).pipe(Effect.flip))).toMatchObject({ reason: "invalid_response" })
      expect(calls).toHaveLength(3)
    })
  })

  test("W1a does not return earlier pages when a later page fails", async () => {
    await fixture([
      { body: { issues: [issue], isLast: false, nextPageToken: "next" } },
      { body: { errorMessages: ["forbidden"] }, status: 403 },
    ], async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc).pipe(Effect.flip))).toMatchObject({ reason: "http", status: 403 })
      expect(calls).toHaveLength(2)
    })
  })

  test("W1a bounds pagination without silently truncating it", async () => {
    await fixture(Array.from({ length: 100 }, (_, index) => ({
      body: { issues: [], isLast: false, nextPageToken: `page-${index}` },
    })), async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc).pipe(Effect.flip))).toMatchObject({ reason: "response_limit" })
      expect(calls).toHaveLength(100)
    })
  }, 15_000)

  test("W1a accepts completion at the page budget boundary", async () => {
    await fixture(Array.from({ length: 100 }, (_, index) => ({
      body: index === 99
        ? { issues: [issue], isLast: true }
        : { issues: [], isLast: false, nextPageToken: `page-${index}` },
    })), async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc))).toEqual({ issues: [issue] })
      expect(calls).toHaveLength(100)
    })
  }, 15_000)

  test("W1a rejects a page that exceeds the requested result bound", async () => {
    await fixture([{ body: { issues: Array.from({ length: 51 }, () => issue), isLast: true } }], async (rpc, calls) => {
      expect(await Effect.runPromise(search(rpc).pipe(Effect.flip))).toMatchObject({ reason: "invalid_response" })
      expect(calls).toHaveLength(1)
    })
  })
})
