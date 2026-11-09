import { describe, expect, test } from "bun:test"
import { items } from "./fixture"
import {
  defaults,
  connectionInput,
  initials,
  itemActions,
  itemKind,
  openHref,
  openLabel,
  primaryAction,
  replyKind,
  safeLink,
  shown,
  sourceGroups,
  sources,
  type Item,
} from "./model"

const mail: Item = {
  id: "mail-1",
  source: "mail",
  externalId: "m1",
  actor: "Ada Lovelace",
  snippet: "Please send the notes",
  threadId: "mail-thread",
  reply: true,
  waiting: true,
}
const issue: Item = {
  id: "issue-1",
  source: "github",
  externalId: "i1",
  actor: "grace",
  snippet: "Review the parser",
  threadId: "repo/pull/42",
  reply: true,
  waiting: true,
  deepLink: "https://github.com/a/b/pull/42",
}

describe("independent inbox presentation", () => {
  test("calendar and mail credentials retain the selected provider without leaking unrelated form fields", () => {
    for (const source of ["calendar", "mail"] as const)
      expect(connectionInput({ source, account: "outlook", token: "fixture", site: "https://old.example" })).toEqual({
        source,
        account: "outlook",
        token: "fixture",
      })
    expect(
      connectionInput({ source: "gitlab", account: "outlook", token: "fixture", site: "https://gitlab.example" }),
    ).toEqual({ source: "gitlab", token: "fixture", site: "https://gitlab.example" })
  })
  test("filters real waiting state without inventing priorities or reordering sources", () => {
    const done = { ...mail, id: "done", waiting: false }
    expect(shown([mail, done, issue], "waiting", "all", "").map((item) => item.id)).toEqual(["mail-1", "issue-1"])
    expect(shown([mail, done, issue], "all", "all", "").map((item) => item.id)).toEqual(["mail-1", "done", "issue-1"])
    expect(shown([mail, issue], "waiting", "github", " PARSER ")).toEqual([issue])
    expect(shown([mail, issue], "waiting", "mail", "grace")).toEqual([])
    expect(shown([mail, issue], "waiting", "all", "42")).toEqual([issue])
  })

  test("context and user preference select only actions this item supports", () => {
    expect(primaryAction(mail, "auto")).toBe("reply")
    expect(primaryAction({ ...issue, commitmentId: "c1" }, "auto")).toBe("handoff")
    expect(primaryAction({ ...issue, commitmentId: "c1" }, "reply")).toBe("reply")
    expect(primaryAction(issue, "open")).toBe("open")
    expect(primaryAction(issue, "auto")).toBe("open")
    expect(primaryAction(mail, "open")).toBe("reply")
    expect(primaryAction({ ...issue, reply: false }, "auto")).toBe("open")
    expect(primaryAction({ ...mail, reply: false }, "auto")).toBe("handoff")
    expect(primaryAction(mail, "handoff")).toBe("handoff")
    expect(replyKind("github")).toBe("comment")
    expect(replyKind("linear")).toBe("comment")
    expect(replyKind("jira")).toBe("comment")
    expect(replyKind("slack")).toBe("reply")
    expect(replyKind("mail")).toBe("reply")
    expect(replyKind("discord")).toBe("reply")
    expect(replyKind("reddit")).toBe("reply")
    expect(replyKind("gitlab")).toBe("comment")
  })

  test("message and notification are properties of the event, not just the provider", () => {
    const notification: Item = { ...mail, kind: "notification", title: "Invitation changed", context: "Design review" }
    const message: Item = { ...issue, kind: "message" }
    expect(itemKind(mail)).toBe("message")
    expect(itemKind(issue)).toBe("notification")
    expect(itemKind(notification)).toBe("notification")
    expect(itemKind(message)).toBe("message")
    expect(shown([mail, notification, message, issue], "all", "all", "", "message")).toEqual([mail, message])
    expect(shown([mail, notification, message, issue], "waiting", "mail", "DESIGN", "notification")).toEqual([
      notification,
    ])
    expect(shown([notification], "all", "all", "invitation")).toEqual([notification])
    expect(shown([message], "all", "all", "", "notification")).toEqual([])
  })

  test.each([
    ["preview-board-decision", "orchestra.inbox.openDecision"],
    ["preview-board-approval", "orchestra.inbox.openApproval"],
    ["preview-github-review", "orchestra.inbox.reviewPull"],
    ["preview-github-ci", "orchestra.inbox.viewChecks"],
    ["preview-gitlab-review", "orchestra.inbox.reviewMerge"],
    ["preview-gitlab-pipeline", "orchestra.inbox.viewPipeline"],
    ["preview-jira-issue", "orchestra.inbox.openIssue"],
    ["preview-trello", "orchestra.inbox.openCard"],
    ["preview-youtube", "orchestra.inbox.watchVideo"],
    ["preview-rss", "orchestra.inbox.readUpdate"],
    ["preview-github-release", "orchestra.inbox.viewRelease"],
    ["preview-calendar", "orchestra.inbox.openCalendar"],
    ["preview-pagerduty", "orchestra.inbox.openIncident"],
  ])("%s opens the work appropriate to its event", (id, label) => {
    const item = items.find((item) => item.id === id)
    expect(item).toBeDefined()
    expect(openLabel(item!)).toBe(label)
    expect(primaryAction(item!, "auto")).toBe("open")
  })

  test("informational updates and the Board never default to handoff, even with that preference", () => {
    const restricted = items.filter((item) => ["board", "youtube", "rss", "calendar"].includes(item.source))
    expect(restricted.length).toBeGreaterThan(0)
    for (const item of restricted) {
      expect(itemActions(item)).toEqual(["remind", "read", "archive"])
      expect(primaryAction(item, "handoff")).toBe("open")
      expect(primaryAction({ ...item, deepLink: undefined }, "handoff")).toBe("open")
    }
  })

  test("the WhatsApp contact door is neither message nor notification and cannot send or triage", () => {
    const door = items.find((item) => item.source === "whatsapp")
    expect(door).toBeDefined()
    expect(itemKind(door!)).toBe("contact")
    expect(door!.snippet).toBe("")
    expect(door!.reply).toBe(false)
    expect(itemActions(door!)).toEqual([])
    expect(primaryAction(door!, "handoff")).toBe("open")
    expect(shown([door!], "all", "all", "", "message")).toEqual([])
    expect(shown([door!], "all", "all", "", "notification")).toEqual([])
    expect(new URL(openHref(door!)!).search).toBe("")
  })

  test("catalog sources each have samples, and a provider may span event kinds", () => {
    expect(new Set(sourceGroups.flatMap((group) => [...group.sources]))).toEqual(new Set(sources))
    expect(new Set(items.map((item) => item.source))).toEqual(new Set(sources))
    expect(shown(items, "all", "reddit", "", "message").map((item) => item.id)).toEqual(["preview-reddit-message"])
    expect(shown(items, "all", "reddit", "", "notification").map((item) => item.id)).toEqual(["preview-reddit-reply"])
    expect(shown(items, "all", "discord", "", "message").map((item) => item.id)).toEqual([
      "preview-discord",
      "preview-discord-mention",
      "preview-discord-dm",
    ])
    expect(openHref(items.find((item) => item.source === "board")!)).toBe("/orchestra/board")
  })

  test("open-original accepts web links, not executable or credential-bearing URLs", () => {
    expect(safeLink(issue.deepLink)).toBe("https://github.com/a/b/pull/42")
    expect(safeLink("javascript:alert(1)")).toBeUndefined()
    expect(safeLink("file:///private/message")).toBeUndefined()
    expect(safeLink("https://secret:token@example.com")).toBeUndefined()
    expect(safeLink(undefined)).toBeUndefined()
    expect(primaryAction({ ...mail, reply: false, deepLink: "javascript:alert(1)" }, "open")).toBe("handoff")
  })

  test("default preferences describe appearance and actions, not inbox content", () => {
    expect(defaults).toEqual({
      compact: false,
      preview: true,
      primary: "auto",
      quick: { handoff: true, remind: true, read: false, archive: false },
    })
    expect(initials("Ada Lovelace")).toBe("AL")
    expect(initials("ada@example.com")).toBe("AE")
  })
})
