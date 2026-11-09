import { expect, test } from "bun:test"
import { Effect } from "effect"
import { request, type RPC } from "../../src/capability/channel/http"
import { communicationChoices, outlookSnapshot } from "../../src/inbox/communication"
import { fixture } from "./work-service-fixture"

// Code-verified facts pinned by these mocks (faithful, no accommodation):
// - communicationChoices (outlook) builds its exclusion set from
//   known.slice(1) of ["inbox","deleteditems","junkemail","drafts","sentitems"],
//   so deleteditems/junkemail/drafts/sentitems are excluded and "outbox" is NOT
//   in the exclusion set. If Graph lists Outbox it surfaces as a selectable choice
//   under its raw id (e.g. "id-outbox"); Inbox's raw id is remapped to "inbox".
// - outlookSnapshot sends $filter `isDraft eq false` plus `and isRead eq false`
//   iff unreadOnly, and post-filters identically. Drafts are always excluded.
//   Non-draft read messages import iff unreadOnly is false.
// - collectWork("mail") with account outlook validates selected ids against those
//   choices, then maps outlookSnapshot via mailItems and prefixes
//   externalId as `scoped:outlook:<generation>:<id>` with reply:false.
// - GitHub CI authorship is proven only via loadCi evidence + ownPull user.login
//   === /user login ("ada" here). No branch-name field exists or is consulted.

async function graphFixture(run: (rpc: RPC, calls: URL[], reply: { value: (url: URL) => Response }) => Promise<void>) {
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

function outlookMatrix(prefix: string) {
  return [
    { isDraft: true, isRead: false },
    { isDraft: true, isRead: true },
    { isDraft: false, isRead: false },
    { isDraft: false, isRead: true },
  ].map(({ isDraft, isRead }) => {
    const id = `${prefix}-${isDraft ? "draft" : "live"}-${isRead ? "read" : "unread"}`
    return {
      id,
      conversationId: `conv-${id}`,
      bodyPreview: `Preview ${id}`,
      webLink: `https://outlook.office.com/mail/id/${id}`,
      isDraft,
      isRead,
      from: { emailAddress: { address: "ada@example.com" } },
    }
  })
}

function outlookReply(url: URL): Response {
  const segments = url.pathname.split("/").filter(Boolean)
  // /v1.0/me/mailFolders/{folder}/messages
  if (segments.at(-1) === "messages") {
    const folder = decodeURIComponent(segments[3]!)
    const prefix = folder === "inbox" || folder === "id-inbox" ? "inbox" : folder === "id-outbox" || folder === "outbox" ? "outbox" : null
    if (!prefix) return Response.json({ value: [] })
    return Response.json({ value: outlookMatrix(prefix) })
  }
  if (url.pathname.endsWith("/childFolders")) {
    if (url.pathname.includes("/custom/")) return Response.json({ value: [{ id: "nested", displayName: "Nested", childFolderCount: 0 }] })
    return Response.json({ value: [] })
  }
  if (url.pathname === "/v1.0/me/mailFolders")
    return Response.json({
      value: [
        { id: "id-inbox", displayName: "Inbox", childFolderCount: 0 },
        { id: "id-outbox", displayName: "Outbox", childFolderCount: 0 },
        { id: "id-sentitems", displayName: "Sent", childFolderCount: 1 },
        { id: "id-drafts", displayName: "Drafts", childFolderCount: 0 },
        { id: "id-deleteditems", displayName: "Deleted", childFolderCount: 0 },
        { id: "id-junkemail", displayName: "Junk", childFolderCount: 0 },
        { id: "custom", displayName: "Work", childFolderCount: 1 },
      ],
    })
  const key = segments.at(-1)!
  if (["inbox", "deleteditems", "junkemail", "drafts", "sentitems"].includes(key)) return Response.json({ id: `id-${key}` })
  return Response.json({}, { status: 500 })
}

test("QA-29 Outlook choices include Outbox and exclude deleted/junk/drafts/sent (outbox NOT in exclusion set)", async () => {
  await graphFixture(async (rpc, calls, reply) => {
    reply.value = outlookReply
    const choices = await Effect.runPromise(communicationChoices(rpc, "outlook"))
    expect(choices).toEqual([
      { id: "inbox", name: "Inbox" },
      { id: "id-outbox", name: "Outbox" },
      { id: "custom", name: "Work" },
      { id: "nested", name: "Nested" },
    ])
    // Excluded subtrees are never traversed.
    expect(calls.some((url) => url.pathname.includes("id-sentitems/childFolders"))).toBe(false)
    expect(calls.some((url) => url.pathname.includes("id-drafts/childFolders"))).toBe(false)
    expect(calls.some((url) => url.pathname.includes("id-outbox/childFolders"))).toBe(false)
  })
})

test("QA-29 Outlook snapshot matrix: isolated Inbox/Outbox x isDraft x isRead with unread variants", async () => {
  await graphFixture(async (rpc, calls, reply) => {
    reply.value = outlookReply
    // Inbox, unreadOnly=false -> non-draft read+unread (2); drafts excluded.
    calls.length = 0
    const inboxAll = await Effect.runPromise(outlookSnapshot(rpc, ["inbox"], false))
    expect(inboxAll.map((m) => m.id).toSorted()).toEqual(["inbox-live-read", "inbox-live-unread"])
    expect(calls.filter((u) => u.pathname.endsWith("/messages"))).toHaveLength(1)
    expect(calls.find((u) => u.pathname.endsWith("/messages"))!.pathname).toContain("/mailFolders/inbox/messages")
    expect(calls.find((u) => u.pathname.endsWith("/messages"))!.searchParams.get("$filter")).toBe("isDraft eq false")
    expect(calls.find((u) => u.pathname.endsWith("/messages"))!.searchParams.get("$select")).toContain("isDraft")

    // Inbox, unreadOnly=true -> non-draft unread only (1).
    calls.length = 0
    const inboxUnread = await Effect.runPromise(outlookSnapshot(rpc, ["inbox"], true))
    expect(inboxUnread.map((m) => m.id)).toEqual(["inbox-live-unread"])
    expect(calls.find((u) => u.pathname.endsWith("/messages"))!.searchParams.get("$filter")).toBe(
      "isDraft eq false and isRead eq false",
    )

    // Outbox isolated (choice id id-outbox), unreadOnly=false -> (2).
    calls.length = 0
    const outboxAll = await Effect.runPromise(outlookSnapshot(rpc, ["id-outbox"], false))
    expect(outboxAll.map((m) => m.id).toSorted()).toEqual(["outbox-live-read", "outbox-live-unread"])
    expect(calls.filter((u) => u.pathname.endsWith("/messages"))).toHaveLength(1)
    expect(calls.find((u) => u.pathname.endsWith("/messages"))!.pathname).toContain("/mailFolders/id-outbox/messages")
    expect(calls.find((u) => u.pathname.endsWith("/messages"))!.searchParams.get("$filter")).toBe("isDraft eq false")
    // Isolation: no inbox messages call for the outbox snapshot.
    expect(calls.some((u) => u.pathname.includes("mailFolders/inbox/messages"))).toBe(false)

    // Outbox isolated, unreadOnly=true -> (1); draft-unread still excluded.
    calls.length = 0
    const outboxUnread = await Effect.runPromise(outlookSnapshot(rpc, ["id-outbox"], true))
    expect(outboxUnread.map((m) => m.id)).toEqual(["outbox-live-unread"])
    expect(calls.find((u) => u.pathname.endsWith("/messages"))!.searchParams.get("$filter")).toBe(
      "isDraft eq false and isRead eq false",
    )

    // Full 16-row correlation: folder_id | isDraft | isRead | requested | imported
    for (const [folder, prefix] of [["inbox", "inbox"], ["id-outbox", "outbox"]] as const) {
      for (const unreadOnly of [false, true]) {
        const rows = await Effect.runPromise(outlookSnapshot(rpc, [folder], unreadOnly))
        const imported = new Set(rows.map((m) => m.id))
        for (const probe of outlookMatrix(prefix)) {
          const expected = !probe.isDraft && (!unreadOnly || !probe.isRead)
          expect(imported.has(probe.id)).toBe(expected)
        }
        expect(rows.every((m) => !m.isDraft)).toBe(true)
      }
    }
  })
})

fixture(
  "QA-29 mail syncWork with Outbox explicitly selected (unreadOnly=false) imports non-draft read+unread",
  ({ inbox, calls }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "mail", account: "outlook", token: "fixture-mail" })
      const configuration = yield* inbox.communicationConfiguration("mail")
      const discovery = yield* inbox.discoverCommunication("mail", configuration.generation)
      expect(discovery.choices).toContainEqual({ id: "id-outbox", name: "Outbox" })
      expect(discovery.choices.some((c) => c.id === "id-sentitems" || c.name === "Sent" || c.name === "Drafts")).toBe(
        false,
      )
      yield* inbox.communicationConfiguration("mail", {
        ...configuration,
        selected: ["id-outbox"],
        unreadOnly: false,
      })
      const before = calls.length
      expect((yield* inbox.syncWork("mail")).state).toBe("synced")
      const items = yield* inbox.list()
      expect(items.map((i) => i.externalId).toSorted()).toEqual([
        expect.stringContaining(":outbox-live-read"),
        expect.stringContaining(":outbox-live-unread"),
      ].toSorted())
      expect(items.every((i) => i.source === "mail" && i.reply === false && i.externalId.startsWith("scoped:outlook:"))).toBe(
        true,
      )
      const syncCalls = calls.slice(before).filter((u) => u.pathname.endsWith("/messages"))
      expect(syncCalls).toHaveLength(1)
      expect(syncCalls[0]!.pathname).toContain("/mailFolders/id-outbox/messages")
      expect(syncCalls[0]!.searchParams.get("$filter")).toBe("isDraft eq false")
    }),
)

fixture(
  "QA-29 mail syncWork with Outbox explicitly selected (unreadOnly=true) keeps only unread non-draft",
  ({ inbox, calls }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "mail", account: "outlook", token: "fixture-mail" })
      const configuration = yield* inbox.communicationConfiguration("mail")
      yield* inbox.discoverCommunication("mail", configuration.generation)
      yield* inbox.communicationConfiguration("mail", {
        ...configuration,
        selected: ["id-outbox"],
        unreadOnly: true,
      })
      const before = calls.length
      expect((yield* inbox.syncWork("mail")).state).toBe("synced")
      const items = yield* inbox.list()
      expect(items).toHaveLength(1)
      expect(items[0]!.externalId).toContain(":outbox-live-unread")
      const syncCalls = calls.slice(before).filter((u) => u.pathname.endsWith("/messages"))
      expect(syncCalls[0]!.searchParams.get("$filter")).toBe("isDraft eq false and isRead eq false")
    }),
)

fixture("QA-29 mail syncWork isolated Inbox (unreadOnly=false) imports non-draft read+unread", ({ inbox, calls }) =>
  Effect.gen(function* () {
    yield* inbox.connect({ source: "mail", account: "outlook", token: "fixture-mail" })
    const configuration = yield* inbox.communicationConfiguration("mail")
    expect(configuration.selected).toEqual(["inbox"])
    const before = calls.length
    expect((yield* inbox.syncWork("mail")).state).toBe("synced")
    const items = yield* inbox.list()
    expect(items.map((i) => i.externalId).toSorted()).toEqual([
      expect.stringContaining(":inbox-live-read"),
      expect.stringContaining(":inbox-live-unread"),
    ].toSorted())
    const syncCalls = calls.slice(before).filter((u) => u.pathname.endsWith("/messages"))
    expect(syncCalls).toHaveLength(1)
    expect(syncCalls[0]!.pathname).toContain("/mailFolders/inbox/messages")
    expect(syncCalls[0]!.searchParams.get("$filter")).toBe("isDraft eq false")
  }),
)

fixture("QA-29 mail syncWork isolated Inbox (unreadOnly=true) keeps only unread non-draft", ({ inbox, calls }) =>
  Effect.gen(function* () {
    yield* inbox.connect({ source: "mail", account: "outlook", token: "fixture-mail" })
    const configuration = yield* inbox.communicationConfiguration("mail")
    yield* inbox.communicationConfiguration("mail", { ...configuration, selected: ["inbox"], unreadOnly: true })
    const before = calls.length
    expect((yield* inbox.syncWork("mail")).state).toBe("synced")
    const items = yield* inbox.list()
    expect(items).toHaveLength(1)
    expect(items[0]!.externalId).toContain(":inbox-live-unread")
    const syncCalls = calls.slice(before).filter((u) => u.pathname.endsWith("/messages"))
    expect(syncCalls[0]!.searchParams.get("$filter")).toBe("isDraft eq false and isRead eq false")
  }),
)

fixture("QA-6 GitHub variety imports review/mention/assign plus proven own-PR CI, excludes other/unprovable CI", ({
  inbox,
  calls,
  provider,
}) =>
  Effect.gen(function* () {
    provider.githubVariety = true
    yield* inbox.connect({ source: "github", token: "fixture-github" })
    expect((yield* inbox.syncWork("github")).state).toBe("synced")
    const items = yield* inbox.list()
    expect(items.map((i) => i.externalId).toSorted()).toEqual([
      "gh-assign",
      "gh-ci-own-pull",
      "gh-ci-own-suite",
      "gh-mention",
      "gh-review",
    ])
    // Positive eligible deliveries with correlated thread/deepLink.
    const ownPull = items.find((i) => i.externalId === "gh-ci-own-pull")!
    expect(ownPull).toMatchObject({
      actor: "owner/repo",
      threadId: "https://api.github.com/repos/owner/repo/pulls/21",
      deepLink: "https://github.com/owner/repo/pull/21",
      reply: true,
    })
    const ownSuite = items.find((i) => i.externalId === "gh-ci-own-suite")!
    expect(ownSuite).toMatchObject({
      threadId: "https://api.github.com/repos/owner/repo/pulls/22",
      deepLink: "https://github.com/owner/repo/pull/22",
      reply: true,
    })
    for (const id of ["gh-review", "gh-mention", "gh-assign"]) {
      expect(items.find((i) => i.externalId === id)!.reply).toBe(true)
    }
    // Excluded controls: other-author and commit with empty pulls never import.
    for (const id of ["gh-ci-other-pull", "gh-ci-unprovable-commit"]) {
      expect(items.some((i) => i.externalId === id)).toBe(false)
    }
    // Proof was actually fetched via the designed path (user.login), not branch names.
    for (const path of ["/repos/owner/repo/pulls/21", "/repos/owner/repo/pulls/22", "/repos/owner/repo/pulls/41"]) {
      expect(calls.some((u) => u.pathname === path)).toBe(true)
    }
    expect(calls.some((u) => u.pathname === "/repos/owner/repo/check-suites/31")).toBe(true)
    expect(calls.some((u) => u.pathname === "/repos/owner/repo/commits/abcdef1/pulls")).toBe(true)
  }),
)

fixture("QA-6 GitHub ownCi=false excludes even proven own-PR CI while personal items remain", ({ inbox, calls, provider }) =>
  Effect.gen(function* () {
    provider.githubVariety = true
    yield* inbox.connect({ source: "github", token: "fixture-github" })
    yield* inbox.githubPreferences({
      generation: (yield* inbox.githubPreferences()).generation,
      repositories: [],
      reviews: true,
      mentions: true,
      assignments: true,
      ownCi: false,
    })
    expect((yield* inbox.syncWork("github")).state).toBe("synced")
    const items = yield* inbox.list()
    expect(items.map((i) => i.externalId).toSorted()).toEqual(["gh-assign", "gh-mention", "gh-review"])
    // ownCi=false short-circuits proof fetching.
    expect(calls.some((u) => u.pathname === "/repos/owner/repo/pulls/21")).toBe(false)
  }),
)

fixture("QA-6 GitHub reason filters off for review/mention/assign keep only proven CI", ({ inbox, provider }) =>
  Effect.gen(function* () {
    provider.githubVariety = true
    yield* inbox.connect({ source: "github", token: "fixture-github" })
    yield* inbox.githubPreferences({
      generation: (yield* inbox.githubPreferences()).generation,
      repositories: [],
      reviews: false,
      mentions: false,
      assignments: false,
      ownCi: true,
    })
    expect((yield* inbox.syncWork("github")).state).toBe("synced")
    expect((yield* inbox.list()).map((i) => i.externalId).toSorted()).toEqual(["gh-ci-own-pull", "gh-ci-own-suite"])
  }),
)

fixture("QA-6 GitHub repository filter mismatch imports nothing and skips proof", ({ inbox, calls, provider }) =>
  Effect.gen(function* () {
    provider.githubVariety = true
    yield* inbox.connect({ source: "github", token: "fixture-github" })
    yield* inbox.githubPreferences({
      generation: (yield* inbox.githubPreferences()).generation,
      repositories: ["other/repo"],
      reviews: true,
      mentions: true,
      assignments: true,
      ownCi: true,
    })
    expect((yield* inbox.syncWork("github")).state).toBe("synced")
    expect(yield* inbox.list()).toEqual([])
    expect(calls.some((u) => u.pathname === "/repos/owner/repo/pulls/21")).toBe(false)
  }),
)
