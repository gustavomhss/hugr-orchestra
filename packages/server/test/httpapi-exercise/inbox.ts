import { check, isRecord, object } from "./assertions"
import { http } from "./dsl"
import type { Scenario } from "./types"

function refused(reason: string) {
  return (body: unknown) => {
    object(body)
    check(body.name === "InboxError", `expected InboxError, got ${String(body.name)}`)
    check(isRecord(body.data) && body.data.reason === reason, `an inbox route should answer reason ${reason}`)
  }
}

const pulled = {
  source: "slack",
  externalId: "m1",
  actor: "ada",
  snippet: "see you",
  threadId: "t1",
  reply: true,
}

export const inboxScenarios: Scenario[] = [
  http.protected
    .get("/api/inbox/calendar", "v2.inbox.calendarConfiguration")
    .at((ctx) => ({ path: "/api/inbox/calendar", headers: ctx.headers() }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .put("/api/inbox/calendar", "v2.inbox.calendarConfigure")
    .at((ctx) => ({
      path: "/api/inbox/calendar",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { generation: "absent", selected: [] },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/calendar/choices", "v2.inbox.calendarDiscover")
    .at((ctx) => ({
      path: "/api/inbox/calendar/choices",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { generation: "absent" },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .get("/api/inbox/feeds", "v2.inbox.feeds")
    .at((ctx) => ({ path: "/api/inbox/feeds", headers: ctx.headers() }))
    .json(
      200,
      (body) => {
        object(body)
        check(Array.isArray(body.data), "feed list should be an array")
      },
      "status",
    ),
  http.protected
    .post("/api/inbox/feeds", "v2.inbox.addFeed")
    .at((ctx) => ({
      path: "/api/inbox/feeds",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { source: "rss", url: "https://127.0.0.1/private" },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/feeds/sync", "v2.inbox.syncFeed")
    .at((ctx) => ({
      path: "/api/inbox/feeds/sync",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "absent" },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/feeds/remove", "v2.inbox.removeFeed")
    .at((ctx) => ({
      path: "/api/inbox/feeds/remove",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "absent" },
    }))
    .status(204, undefined, "none"),
  http.protected
    .get("/api/inbox/notifications", "v2.inbox.notificationConfiguration")
    .at((ctx) => ({ path: "/api/inbox/notifications?source=sentry", headers: ctx.headers() }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .put("/api/inbox/notifications", "v2.inbox.notificationConfigure")
    .at((ctx) => ({
      path: "/api/inbox/notifications",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { source: "sentry", generation: "absent", selected: [], organization: "example", relevance: "review" },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .get("/api/inbox/gitlab", "v2.inbox.gitlabConfiguration")
    .at((ctx) => ({ path: "/api/inbox/gitlab", headers: ctx.headers() }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .put("/api/inbox/gitlab", "v2.inbox.gitlabConfigure")
    .at((ctx) => ({
      path: "/api/inbox/gitlab",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { generation: "absent", projects: [] },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .get("/api/inbox/communication", "v2.inbox.communicationConfiguration")
    .at((ctx) => ({ path: "/api/inbox/communication?source=mail", headers: ctx.headers() }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .put("/api/inbox/communication", "v2.inbox.communicationConfigure")
    .at((ctx) => ({
      path: "/api/inbox/communication",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { source: "mail", generation: "absent", selected: ["INBOX"], unreadOnly: false },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/communication/choices", "v2.inbox.communicationDiscover")
    .at((ctx) => ({
      path: "/api/inbox/communication/choices",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { source: "teams", generation: "absent" },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/account/disconnect", "v2.inbox.disconnectAccount")
    .at((ctx) => ({
      path: "/api/inbox/account/disconnect",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { source: "github", generation: "absent" },
    }))
    .status(204, undefined, "none"),
  http.protected
    .post("/api/inbox/account/sync", "v2.inbox.syncWork")
    .at((ctx) => ({
      path: "/api/inbox/account/sync",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { source: "github", generation: "absent" },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .get("/api/inbox/github/preferences", "v2.inbox.githubPreferences")
    .at((ctx) => ({ path: "/api/inbox/github/preferences", headers: ctx.headers() }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .put("/api/inbox/github/preferences", "v2.inbox.githubConfigure")
    .at((ctx) => ({
      path: "/api/inbox/github/preferences",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: {
        generation: "absent",
        repositories: [],
        reviews: true,
        mentions: true,
        assignments: true,
        ownCi: true,
      },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .get("/api/inbox/slack/scope", "v2.inbox.slackScope")
    .at((ctx) => ({ path: "/api/inbox/slack/scope", headers: ctx.headers() }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/slack/conversations", "v2.inbox.slackDiscover")
    .at((ctx) => ({
      path: "/api/inbox/slack/conversations",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { generation: "absent" },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/slack/selection", "v2.inbox.slackSelect")
    .at((ctx) => ({
      path: "/api/inbox/slack/selection",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { generation: "absent", selected: [] },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/slack/sync", "v2.inbox.slackSync")
    .at((ctx) => ({
      path: "/api/inbox/slack/sync",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { generation: "absent" },
    }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .post("/api/inbox/slack/authorize", "v2.inbox.slackStart")
    .at((ctx) => ({ path: "/api/inbox/slack/authorize", headers: { ...ctx.headers(), host: "remote.example" } }))
    .json(400, refused("unavailable"), "status"),
  http.protected
    .get("/api/inbox/slack", "v2.inbox.slackStatus")
    .at((ctx) => ({ path: "/api/inbox/slack", headers: ctx.headers() }))
    .json(
      200,
      (body) => {
        object(body)
        check(
          isRecord(body.data) && body.data.connected === false && body.data.state === "idle",
          "fresh location has no Slack grant",
        )
        check(!JSON.stringify(body).includes("access_token"), "Slack status must not return tokens")
      },
      "status",
    ),
  http.protected
    .post("/api/inbox/slack/cancel", "v2.inbox.slackCancel")
    .at((ctx) => ({
      path: "/api/inbox/slack/cancel",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "unknown" },
    }))
    .status(204, undefined, "none"),
  http.protected
    .post("/api/inbox/slack/disconnect", "v2.inbox.slackDisconnect")
    .at((ctx) => ({ path: "/api/inbox/slack/disconnect", headers: ctx.headers() }))
    .status(204, undefined, "none"),
  http.protected
    .get("/api/inbox", "v2.inbox.list")
    .at((ctx) => ({ path: "/api/inbox", headers: ctx.headers() }))
    .json(
      200,
      (body) => {
        object(body)
        check(Array.isArray(body.data), "inbox list should answer the stored list")
      },
      "status",
    ),
  http.protected
    .post("/api/inbox", "v2.inbox.upsert")
    .at((ctx) => ({
      path: "/api/inbox",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: pulled,
    }))
    .json(
      200,
      (body) => {
        object(body)
        check(
          isRecord(body.data) && body.data.source === "slack" && body.data.externalId === "m1",
          "upsert should return the stored item",
        )
        check(isRecord(body.data) && body.data.waiting === true, "a new item is waiting")
      },
      "status",
    ),
  http.protected
    .post("/api/inbox/archive", "v2.inbox.archive")
    .at((ctx) => ({
      path: "/api/inbox/archive",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "in_missing" },
    }))
    .json(400, refused("missing"), "status"),
  http.protected
    .post("/api/inbox/read", "v2.inbox.read")
    .at((ctx) => ({
      path: "/api/inbox/read",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "in_missing" },
    }))
    .json(400, refused("missing"), "status"),
  http.protected
    .post("/api/inbox/remind", "v2.inbox.remind")
    .at((ctx) => ({
      path: "/api/inbox/remind",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "in_missing" },
    }))
    .json(400, refused("missing"), "status"),
  http.protected
    .post("/api/inbox/draft", "v2.inbox.draft")
    .at((ctx) => ({
      path: "/api/inbox/draft",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "in_missing", text: "draft" },
    }))
    .json(400, refused("missing"), "status"),
  http.protected
    .post("/api/inbox/origin-draft", "v2.inbox.originDraft")
    .at((ctx) => ({
      path: "/api/inbox/origin-draft",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "in_missing", text: "draft" },
    }))
    .json(400, refused("missing"), "status"),
  http.protected
    .post("/api/inbox/send", "v2.inbox.send")
    .at((ctx) => ({
      path: "/api/inbox/send",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "in_missing", text: "shown", click: true },
    }))
    .json(400, refused("missing"), "status"),
  http.protected
    .post("/api/inbox/handoff", "v2.inbox.handoff")
    .at((ctx) => ({
      path: "/api/inbox/handoff",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { ids: [] },
    }))
    .json(
      200,
      (body) => {
        object(body)
        check(
          isRecord(body.data) && Array.isArray(body.data.ids) && body.data.ids.length === 0,
          "an empty handoff delivers nothing",
        )
      },
      "status",
    ),
  http.protected
    .get("/api/inbox/accounts", "v2.inbox.accounts")
    .at((ctx) => ({ path: "/api/inbox/accounts", headers: ctx.headers() }))
    .json(
      200,
      (body) => {
        object(body)
        check(Array.isArray(body.data), "accounts should answer which sources are connected")
      },
      "status",
    ),
  http.protected
    .post("/api/inbox/account", "v2.inbox.connect")
    .at((ctx) => ({
      path: "/api/inbox/account",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { source: "github", token: "not-a-real-token" },
    }))
    .status(204, undefined, "none"),
  http.protected
    .post("/api/inbox/door", "v2.inbox.door")
    .at((ctx) => ({
      path: "/api/inbox/door",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { from: "none" },
    }))
    .json(
      200,
      (body) => {
        object(body)
        check(isRecord(body.data) && body.data.openApp === true, "a door without a number opens the app")
      },
      "status",
    ),
]
