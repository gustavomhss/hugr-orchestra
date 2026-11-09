import { expect, test } from "bun:test"
import { Effect } from "effect"
import { request, type RPC } from "../../src/capability/channel/http"
import {
  communicationChoices,
  gmailSnapshot,
  graphPages,
  outlookSnapshot,
  teamsSnapshot,
} from "../../src/inbox/communication"
import { discordChoices, discordSnapshot } from "../../src/inbox/discord"

async function fixture(run: (rpc: RPC, calls: URL[], reply: { value: (url: URL) => Response }) => Promise<void>) {
  const calls: URL[] = []
  const reply = { value: (_url: URL): Response => Response.json({}, { status: 500 }) }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      expect(req.headers.get("authorization")).toBe("Bearer local-fixture")
      const url = new URL(req.url)
      calls.push(url)
      return reply.value(url)
    },
  })
  try {
    await run(
      (input) =>
        request("https://graph.microsoft.com", "Bearer local-fixture", input, { fixtureOrigin: server.url.origin }),
      calls,
      reply,
    )
  } finally {
    await server.stop(true)
  }
}

test("Gmail selected labels are a paged union, deduplicated with forbidden categories excluded", async () => {
  await fixture(async (rpc, calls, reply) => {
    reply.value = (url) => {
      if (url.pathname.endsWith("/messages"))
        return Response.json(
          url.searchParams.has("pageToken")
            ? { messages: [{ id: "m2" }, { id: "spam" }] }
            : { messages: [{ id: "m1" }], nextPageToken: "opaque+/=" },
        )
      const id = url.pathname.split("/").at(-1)
      return Response.json({
        id,
        threadId: `thread-${id}`,
        labelIds: id === "spam" ? ["SPAM", "Label_a"] : ["Label_a", "UNREAD"],
        snippet: "Preview",
        payload: { headers: [{ name: "From", value: "ada@example.com" }] },
      })
    }
    const result = await Effect.runPromise(gmailSnapshot(rpc, ["Label_a", "Label_b"], true))
    expect(result.map((item) => item.id)).toEqual(["m1", "m2"])
    expect(
      calls.filter((url) => url.pathname.endsWith("/messages")).map((url) => url.searchParams.getAll("labelIds")),
    ).toEqual([["Label_a"], ["Label_a"], ["Label_b"], ["Label_b"]])
    expect(
      calls
        .filter((url) => url.pathname.endsWith("/messages"))
        .every((url) => url.searchParams.get("q") === "-in:spam -in:trash -in:drafts -in:sent is:unread"),
    ).toBe(true)
    expect(calls.filter((url) => !url.pathname.endsWith("/messages"))).toHaveLength(3)
  })
})

test("Gmail empty scope collects nothing; cycles and malformed pages fail rather than truncate", async () => {
  await fixture(async (rpc, calls, reply) => {
    expect(await Effect.runPromise(gmailSnapshot(rpc, [], false))).toEqual([])
    expect(calls).toHaveLength(0)
    reply.value = () => Response.json({ messages: [], nextPageToken: "cycle" })
    expect(await Effect.runPromise(gmailSnapshot(rpc, ["INBOX"], false).pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
    expect(calls).toHaveLength(2)
    reply.value = () => Response.json({ messages: "bad" })
    expect(await Effect.runPromise(gmailSnapshot(rpc, ["INBOX"], false).pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
  })
})

test("Graph follows empty pages but rejects cross-origin, changed-resource, duplicate-query and cyclic next links", async () => {
  await fixture(async (rpc, calls, reply) => {
    reply.value = (url) =>
      Response.json(
        url.searchParams.has("$skiptoken")
          ? { value: [{ id: "folder" }] }
          : { value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/mailFolders?$skiptoken=opaque" },
      )
    expect(await Effect.runPromise(graphPages(rpc, { method: "GET", path: "/v1.0/me/mailFolders" }))).toEqual([
      { id: "folder" },
    ])
    expect(calls).toHaveLength(2)
    for (const next of [
      "https://evil.example/v1.0/me/mailFolders",
      "https://graph.microsoft.com/v1.0/me/messages",
      "https://graph.microsoft.com/v1.0/me/mailFolders?a=1&a=2",
      "https://graph.microsoft.com/v1.0/me/mailFolders",
    ]) {
      reply.value = () => Response.json({ value: [], "@odata.nextLink": next })
      expect(
        await Effect.runPromise(graphPages(rpc, { method: "GET", path: "/v1.0/me/mailFolders" }).pipe(Effect.flip)),
      ).toMatchObject({ reason: "invalid_response" })
    }
  })
})

test("unfinished Gmail and Graph snapshots exhaust their budgets as failure, not a successful truncation", async () => {
  await fixture(async (rpc, calls, reply) => {
    reply.value = () => Response.json({ messages: [], nextPageToken: `next-${calls.length}` })
    expect(await Effect.runPromise(gmailSnapshot(rpc, ["INBOX"], false).pipe(Effect.flip))).toMatchObject({
      reason: "response_limit",
    })
    expect(calls).toHaveLength(100)
    calls.length = 0
    reply.value = () =>
      Response.json({
        value: [],
        "@odata.nextLink": `https://graph.microsoft.com/v1.0/me/chats?$skiptoken=${calls.length}`,
      })
    expect(
      await Effect.runPromise(graphPages(rpc, { method: "GET", path: "/v1.0/me/chats" }).pipe(Effect.flip)),
    ).toMatchObject({ reason: "response_limit" })
    expect(calls).toHaveLength(100)
  })
})

test("Teams reads only chosen chats, namespaces message ids and binds missing chatId to the requested chat", async () => {
  await fixture(async (rpc, calls, reply) => {
    reply.value = () =>
      Response.json({
        value: [
          {
            id: "same-id",
            messageType: "message",
            lastModifiedDateTime: "2026-11-05T00:00:00Z",
            from: { user: { id: "ada" } },
            body: { contentType: "text", content: "Hello" },
          },
        ],
      })
    const result = await Effect.runPromise(teamsSnapshot(rpc, ["chat:a", "chat:b"], "2026-10-29T00:00:00Z"))
    expect(result.map((item) => item.externalId)).toEqual([
      JSON.stringify(["chat:a", "same-id"]),
      JSON.stringify(["chat:b", "same-id"]),
    ])
    expect(result.map((item) => item.threadId)).toEqual(["chat:a", "chat:b"])
    expect(calls.every((url) => url.searchParams.get("$orderby") === "lastModifiedDateTime desc")).toBe(true)
    expect(
      calls.every((url) => url.searchParams.get("$filter") === "lastModifiedDateTime gt 2026-10-29T00:00:00Z"),
    ).toBe(true)
    expect(await Effect.runPromise(teamsSnapshot(rpc, [], "2026-10-29T00:00:00Z"))).toEqual([])
    expect(calls).toHaveLength(2)
    reply.value = () =>
      Response.json({
        value: [
          {
            id: "m",
            messageType: "message",
            chatId: "other",
            lastModifiedDateTime: "2026-11-05T00:00:00Z",
            body: { contentType: "text", content: "Hello" },
            from: { user: { id: "ada" } },
          },
        ],
      })
    expect(
      await Effect.runPromise(teamsSnapshot(rpc, ["chat:a"], "2026-10-29T00:00:00Z").pipe(Effect.flip)),
    ).toMatchObject({ reason: "invalid_response" })
  })
})

test("Outlook discovers nested folders without forbidden subtrees and paginates immutable-id snapshots", async () => {
  await fixture(async (rpc, calls, reply) => {
    reply.value = (url) => {
      const key = url.pathname.split("/").at(-1)!
      if (["inbox", "deleteditems", "junkemail", "drafts", "sentitems"].includes(key))
        return Response.json({ id: `id-${key}` })
      if (key === "mailFolders")
        return Response.json({
          value: [
            { id: "id-inbox", displayName: "Inbox", childFolderCount: 0 },
            { id: "id-sentitems", displayName: "Sent", childFolderCount: 1 },
            { id: "custom", displayName: "Work", childFolderCount: 1 },
          ],
        })
      if (key === "childFolders")
        return Response.json({ value: [{ id: "nested", displayName: "Nested", childFolderCount: 0 }] })
      if (key === "messages")
        return Response.json({
          value: [
            {
              id: "mail",
              conversationId: "conversation",
              bodyPreview: "Preview",
              webLink: "https://outlook.office.com/mail/id/mail",
              isDraft: false,
              isRead: false,
              from: { emailAddress: { address: "ada@example.com" } },
            },
          ],
        })
      return Response.json({}, { status: 500 })
    }
    expect(await Effect.runPromise(communicationChoices(rpc, "outlook"))).toEqual([
      { id: "inbox", name: "Inbox" },
      { id: "custom", name: "Work" },
      { id: "nested", name: "Nested" },
    ])
    expect(calls.some((url) => url.pathname.includes("id-sentitems/childFolders"))).toBe(false)
    expect(await Effect.runPromise(outlookSnapshot(rpc, ["inbox", "nested"], true))).toHaveLength(1)
    expect(
      calls
        .filter((url) => url.pathname.endsWith("messages"))
        .every((url) => url.searchParams.get("$filter") === "isDraft eq false and isRead eq false"),
    ).toBe(true)
  })
})

test("Discord choices prove effective channel/history permissions and exclude threads, DMs and denied channels", async () => {
  await fixture(async (rpc, calls, reply) => {
    reply.value = (url) => {
      if (url.pathname.endsWith("/users/@me")) return Response.json({ id: "99", bot: true })
      if (url.pathname.endsWith("/guilds")) return Response.json([{ id: "10", name: "Server" }])
      if (url.pathname.endsWith("/roles"))
        return Response.json([
          { id: "10", permissions: "66560" },
          { id: "11", permissions: "0" },
        ])
      if (url.pathname.includes("/members/")) return Response.json({ roles: ["11"] })
      return Response.json([
        { id: "20", guild_id: "10", name: "readable", type: 0, permission_overwrites: [] },
        {
          id: "21",
          guild_id: "10",
          name: "denied",
          type: 0,
          permission_overwrites: [{ id: "11", type: 0, allow: "0", deny: "65536" }],
        },
        { id: "22", guild_id: "10", name: "thread", type: 11, permission_overwrites: [] },
        {
          id: "23",
          guild_id: "10",
          name: "restored",
          type: 5,
          permission_overwrites: [
            { id: "10", type: 0, allow: "0", deny: "65536" },
            { id: "99", type: 1, allow: "65536", deny: "0" },
          ],
        },
      ])
    }
    expect(await Effect.runPromise(discordChoices(rpc))).toEqual([
      { id: "20", name: "Server · #readable" },
      { id: "23", name: "Server · #restored" },
    ])
    expect(calls.some((url) => url.pathname.endsWith("messages"))).toBe(false)
  })
})

test("Discord snapshots page backwards, stop at the window and reject user tokens or missing content access", async () => {
  await fixture(async (rpc, calls, reply) => {
    const state = { bot: true, flags: 1 << 19, repeat: false, empty: false }
    reply.value = (url) => {
      if (url.pathname.endsWith("/users/@me")) return Response.json({ id: "99", bot: state.bot })
      if (url.pathname.includes("applications")) return Response.json({ flags: state.flags })
      const messages = Array.from({ length: 100 }, (_, index) => ({
        id: String(200 - index),
        channel_id: "20",
        author: { id: "99" },
        content: state.empty ? "" : "Hello",
        type: 0,
        timestamp: "2026-11-05T00:00:00Z",
        edited_timestamp: null,
      }))
      return Response.json(
        !url.searchParams.has("before") || state.repeat
          ? messages
          : [{ ...messages[0], id: "100", timestamp: "2026-10-01T00:00:00Z" }],
      )
    }
    expect(await Effect.runPromise(discordSnapshot(rpc, ["20"], Date.parse("2026-10-29T00:00:00Z")))).toHaveLength(100)
    expect(calls.at(-1)?.searchParams.get("before")).toBe("101")
    state.repeat = true
    expect(await Effect.runPromise(discordSnapshot(rpc, ["20"], 0).pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
    state.repeat = false
    state.empty = true
    expect(await Effect.runPromise(discordSnapshot(rpc, ["20"], 0).pipe(Effect.flip))).toMatchObject({
      reason: "provider",
      missing: true,
    })
    state.flags = 0
    expect(await Effect.runPromise(discordSnapshot(rpc, ["20"], 0).pipe(Effect.flip))).toMatchObject({
      reason: "provider",
      missing: true,
    })
    state.bot = false
    expect(await Effect.runPromise(discordSnapshot(rpc, ["20"], 0).pipe(Effect.flip))).toMatchObject({
      reason: "invalid_response",
    })
  })
})
