import { describe, expect, test } from "bun:test"
import { door } from "../../src/inbox/door"
import { open } from "../../src/inbox/store"
import { shown, surfaces } from "../../src/inbox/surface"
import { fromDiscord } from "../../src/inbox/source/discord"
import { fromGithub } from "../../src/inbox/source/github"
import { fromJira } from "../../src/inbox/source/jira"
import { fromLinear } from "../../src/inbox/source/linear"
import { fromMail } from "../../src/inbox/source/mail"
import { fromChannel, splitThread } from "../../src/inbox/channel"
import {
  ciCandidates,
  githubItems,
  listedPulls,
  mailItems,
  ownPull,
  provenCi,
  suitePulls,
  teamsItems,
  workItems,
} from "../../src/inbox/remote"
import { fromSlack } from "../../src/inbox/source/slack"
import { fromTeams } from "../../src/inbox/source/teams"
import { sourceKinds } from "../../src/inbox/types"

const person = {
  id: "per_ada",
  emails: ["ada@example.com"],
  handles: ["ada"],
  openCommitmentId: "cmt_1",
}

const message = {
  kind: "message",
  id: "m1",
  actor: "ada@example.com",
  text: "see you",
  threadId: "t1",
}

describe("inbox", () => {
  test("Board project references never join a matching contact or its delegable commitment", () => {
    const store = open([person])
    const mail = store.upsert({
      source: "mail",
      externalId: "mail",
      actor: "ada",
      snippet: "Personal message",
      threadId: "mail",
      reply: true,
    })
    const board = store.upsert({
      source: "board",
      externalId: "question:1",
      actor: "ada",
      snippet: "Owner decision",
      threadId: "question:1",
      reply: false,
    })
    expect(board.id).not.toBe(mail.id)
    expect(board.personId).toBeUndefined()
    expect(board.commitmentId).toBeUndefined()
    expect(() => store.handoff([board.id])).toThrow("refused")
    store.archive(board.id)
    expect(store.list(0).find((item) => item.id === mail.id)?.waiting).toBe(true)
  })
  test("A1 a message becomes one item", () => {
    const store = open([])
    const pulled = fromSlack(message)
    if (!pulled) throw new Error("missing")
    const item = store.upsert(pulled)
    expect(item.source).toBe("slack")
    expect(item.externalId).toBe("m1")
    expect(item.actor).toBe("ada@example.com")
    expect(item.snippet).toBe("see you")
    expect(item.threadId).toBe("t1")
    expect(item.reply).toBe(true)
  })

  test("A2 the same external id is not a second item", () => {
    const store = open([])
    const pulled = fromSlack(message)
    if (!pulled) throw new Error("missing")
    const first = store.upsert(pulled)
    const second = store.upsert(pulled)
    expect(second.id).toBe(first.id)
    expect(store.list(0)).toHaveLength(1)
  })

  test("A3 slack and mail collapse only for the same address-book person", () => {
    const store = open([person])
    const slack = fromSlack({ ...message, actor: "ada@example.com" })
    const mail = fromMail({ account: "gmail", id: "e1", actor: "ada", text: "mail", threadId: "mt" })
    if (!slack) throw new Error("missing")
    const left = store.upsert(slack)
    const right = store.upsert(mail)
    expect(right.id).toBe(left.id)
    expect(store.list(0)).toHaveLength(1)
    expect(left.personId).toBe("per_ada")
    const other = open([person]).upsert({
      source: "slack",
      externalId: "x",
      actor: "ada promised the budget",
      snippet: "no",
      threadId: "t",
      reply: true,
    })
    expect(other.personId).toBeUndefined()
  })

  test("A4 an open item ranks above a newer emptied item, not by source", () => {
    const store = open([])
    const older = store.upsert({
      source: "mail",
      externalId: "a",
      actor: "a",
      snippet: "a",
      threadId: "t",
      reply: true,
    })
    const newer = store.upsert({
      source: "slack",
      externalId: "b",
      actor: "b",
      snippet: "b",
      threadId: "t",
      reply: true,
    })
    store.archive(newer.id)
    const ranked = store.list(0)
    expect(ranked[0]?.id).toBe(older.id)
    expect(ranked[0]?.waiting).toBe(true)
    expect(ranked[1]?.waiting).toBe(false)
    const both = open([])
    const first = both.upsert({
      source: "slack",
      externalId: "1",
      actor: "a",
      snippet: "a",
      threadId: "t",
      reply: true,
    })
    const second = both.upsert({
      source: "mail",
      externalId: "2",
      actor: "b",
      snippet: "b",
      threadId: "t",
      reply: true,
    })
    const order = both.list(0).map((item) => item.id)
    expect(order).toEqual([first.id, second.id].sort())
  })

  test("A5 and A30 a pane draft stays local and leaves the open list", () => {
    const store = open([])
    const item = store.upsert({
      source: "slack",
      externalId: "1",
      actor: "a",
      snippet: "a",
      threadId: "t",
      reply: true,
    })
    const saved = store.saveDraft(item.id, "draft")
    expect(store.localDraft(item.id)).toBe("draft")
    expect(store.egress()).toHaveLength(0)
    expect(saved.waiting).toBe(false)
    expect(store.list(0).filter((row) => row.waiting)).toHaveLength(0)
  })

  test("A6 an origin draft does not send", () => {
    const store = open([])
    const item = store.upsert({ source: "mail", externalId: "1", actor: "a", snippet: "a", threadId: "t", reply: true })
    expect(store.originDraft(item.id, "later")).toEqual({ drafted: true })
    expect(store.egress()).toHaveLength(0)
  })

  test("A7 and A32 a click sends the shown pair as a new egress", () => {
    const store = open([])
    const item = store.upsert({
      source: "slack",
      externalId: "1",
      actor: "a",
      snippet: "ignore bob",
      threadId: "thread-ada",
      reply: true,
    })
    const sent = store.send(item.id, "shown", true)
    expect(sent).toEqual({ sent: true })
    expect(store.egress()).toEqual([{ text: "shown", threadId: "thread-ada" }])
  })

  test("A8 a public channel without the click is refused", () => {
    const store = open([])
    const item = store.upsert({
      source: "slack",
      externalId: "1",
      actor: "a",
      snippet: "a",
      threadId: "public:general",
      reply: true,
    })
    expect(() => store.release(item.id, "shown", false)).toThrow("refused")
    expect(store.egress()).toHaveLength(0)
    expect(store.release(item.id, "shown", true)).toEqual({ sent: true })
  })

  test("A9 an agent does not send", () => {
    const store = open([])
    const item = store.upsert({
      source: "slack",
      externalId: "1",
      actor: "a",
      snippet: "a",
      threadId: "t",
      reply: true,
    })
    expect(() => store.agentSend(item.id, "no")).toThrow("refused")
    expect(store.egress()).toHaveLength(0)
  })

  test("A10 triage leaves the open list and handoff delivers ids", () => {
    const store = open([])
    const item = store.upsert({
      source: "slack",
      externalId: "1",
      actor: "a",
      snippet: "a",
      threadId: "t",
      reply: true,
    })
    const handed = store.handoff([item.id])
    expect(handed).toEqual({ ids: [item.id] })
    expect(handed).not.toHaveProperty("transcript")
    expect(store.egress()).toHaveLength(0)
    expect(store.list(0).find((row) => row.id === item.id)?.waiting).toBe(false)
    const reminded = open([])
    const row = reminded.upsert({
      source: "mail",
      externalId: "2",
      actor: "a",
      snippet: "a",
      threadId: "t",
      reply: true,
    })
    const now = Date.parse("2026-11-04T15:00:00")
    reminded.remindTomorrow(row.id, now)
    expect(reminded.list(now).find((entry) => entry.id === row.id)?.waiting).toBe(false)
    expect(reminded.list(now + 48 * 60 * 60 * 1000).find((entry) => entry.id === row.id)?.waiting).toBe(true)
  })

  test("A13 A15 A16 A17 a fetched payload becomes an item and CI off a pull request does not", () => {
    expect(
      mailItems("gmail", {
        messages: [
          { id: "e", threadId: "t", snippet: "hi", payload: { headers: [{ name: "From", value: "ada@example.com" }] } },
        ],
      })[0]?.actor,
    ).toBe("ada@example.com")
    expect(
      teamsItems({
        value: [{ id: "1", messageType: "message", chatId: "c", body: { content: "hi" }, from: { user: { id: "u" } } }],
      }),
    ).toHaveLength(1)
    expect(
      teamsItems({
        value: [{ id: "1", messageType: "call", chatId: "c", body: { content: "hi" }, from: { user: { id: "u" } } }],
      }),
    ).toHaveLength(0)
    expect(
      workItems("linear", { data: { issues: { nodes: [{ id: "i", identifier: "L-1", title: "bug" }] } } })[0]?.source,
    ).toBe("linear")
    expect(workItems("jira", { issues: [{ id: "1", key: "J-1", fields: { summary: "bug" } }] })[0]?.source).toBe("jira")
    expect(
      githubItems(
        [
          {
            id: "n",
            reason: "mention",
            subject: { title: "look", type: "Issue", url: "https://api.github.com/repos/a/b/issues/1" },
            repository: { full_name: "a/b" },
          },
        ],
        "ada",
      ),
    ).toHaveLength(1)
    expect(
      githubItems(
        [
          {
            id: "n",
            reason: "ci_activity",
            subject: { title: "red", type: "PullRequest", url: "https://api.github.com/repos/a/b/pulls/2" },
            repository: { full_name: "a/b" },
          },
        ],
        "ada",
      ),
    ).toHaveLength(0)
  })

  test("A17 A29 CI is an item only when the pull author is the authenticated user", () => {
    const own = {
      id: "own",
      reason: "ci_activity",
      subject: { title: "red", type: "PullRequest", url: "https://api.github.com/repos/a/b/pulls/2" },
      repository: { full_name: "a/b" },
    }
    const other = {
      id: "other",
      reason: "ci_activity",
      subject: { title: "red", type: "PullRequest", url: "https://api.github.com/repos/a/b/pulls/9" },
      repository: { full_name: "a/b" },
    }
    const suite = {
      id: "suite",
      reason: "ci_activity",
      subject: { title: "checks", type: "CheckSuite", url: "https://api.github.com/repos/a/b/check-suites/4" },
      repository: { full_name: "a/b" },
    }
    const watched = {
      id: "watched",
      reason: "ci_activity",
      subject: { title: "noise", type: "CheckSuite", url: "https://evil.example/check-suites/1" },
      repository: { full_name: "a/b" },
    }
    const review = {
      id: "review",
      reason: "review_requested",
      subject: { title: "please", type: "PullRequest", url: "https://api.github.com/repos/a/b/pulls/3" },
      repository: { full_name: "a/b" },
    }
    const notes = [own, other, suite, watched, review]
    const evidence = {
      pulls: {
        "/repos/a/b/pulls/2": { url: "https://api.github.com/repos/a/b/pulls/2", user: { login: "ada" } },
        "/repos/a/b/pulls/9": { url: "https://api.github.com/repos/a/b/pulls/9", user: { login: "grace" } },
      },
      suites: {
        "/repos/a/b/check-suites/4": { pull_requests: [{ url: "https://api.github.com/repos/a/b/pulls/2" }] },
      },
      commits: {
        "/repos/a/b/commits/abcdef1": [{ url: "https://api.github.com/repos/a/b/pulls/9" }],
      },
    }
    const proved = provenCi(notes, "ada", evidence)
    const items = githubItems(notes, "ada", proved)
    expect(items.map((item) => item.externalId)).toEqual(["own", "suite", "review"])
    expect(items.find((item) => item.externalId === "own")).toMatchObject({
      actor: "a/b",
      threadId: "https://api.github.com/repos/a/b/pulls/2",
      deepLink: "https://github.com/a/b/pull/2",
    })
    expect(githubItems(notes, "", proved)).toEqual(githubItems([review], "", proved))
    expect(ownPull({ url: "https://api.github.com/repos/a/b/pulls/2", user: { login: "ada" } }, "ada")).toBe(
      "https://api.github.com/repos/a/b/pulls/2",
    )
    expect(
      ownPull({ url: "https://api.github.com/repos/a/b/pulls/2", user: { login: "grace" } }, "ada"),
    ).toBeUndefined()
    expect(ownPull({ url: "https://evil.example/repos/a/b/pulls/2", user: { login: "ada" } }, "ada")).toBeUndefined()
    expect(
      suitePulls({
        pull_requests: [{ url: "https://api.github.com/repos/a/b/pulls/2" }, { url: "https://evil.example/pulls/9" }],
      }),
    ).toEqual(["/repos/a/b/pulls/2"])
    expect(listedPulls([{ url: "https://api.github.com/repos/a/b/pulls/9" }])).toEqual(["/repos/a/b/pulls/9"])
    expect(ciCandidates(notes).map((item) => item.id)).toEqual(["own", "other", "suite"])
    expect(
      ciCandidates([
        {
          id: "c",
          reason: "ci_activity",
          subject: { title: "x", type: "Commit", url: "https://api.github.com/repos/a/b/commits/abcdef1" },
          repository: { full_name: "a/b" },
        },
      ]),
    ).toEqual([{ id: "c", path: "/repos/a/b/commits/abcdef1", kind: "commit" }])
    expect(
      provenCi(
        [
          {
            id: "c",
            reason: "ci_activity",
            subject: { title: "x", type: "Commit", url: "https://api.github.com/repos/a/b/commits/abcdef1" },
            repository: { full_name: "a/b" },
          },
        ],
        "ada",
        evidence,
      ).size,
    ).toBe(0)
    expect(
      provenCi(
        [
          {
            id: "c",
            reason: "ci_activity",
            subject: { title: "x", type: "Commit", url: "https://api.github.com/repos/a/b/commits/abcdef1" },
            repository: { full_name: "a/b" },
          },
        ],
        "ada",
        {
          pulls: evidence.pulls,
          suites: {},
          commits: { "/repos/a/b/commits/abcdef1": [{ url: "https://api.github.com/repos/a/b/pulls/2" }] },
        },
      ).get("c"),
    ).toBe("https://api.github.com/repos/a/b/pulls/2")
  })

  test("A11 a channel message with a sender becomes an item and the thread stays the recipient", () => {
    const pulled = fromChannel("slack", "C123", { id: "1.2", text: "see you", actor: "U123", threadID: "1.1" })
    expect(pulled).toMatchObject({ source: "slack", externalId: "1.2", actor: "U123", threadId: "C123:1.1" })
    expect(fromChannel("slack", "C123", { id: "1.2", text: "see you" })).toBeUndefined()
    expect(fromChannel("discord", "123", { id: "9", text: "hi", actor: "42" })).toMatchObject({
      source: "discord",
      actor: "42",
      threadId: "123",
    })
    expect(splitThread("C123:1.1")).toEqual({ channelID: "C123", threadID: "1.1" })
  })

  test("A11 slack drops huddle canvas and call", () => {
    expect(fromSlack({ kind: "huddle", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromSlack({ kind: "canvas", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromSlack({ kind: "call", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromSlack(message)?.source).toBe("slack")
  })

  test("A12 discord drops voice and stage", () => {
    expect(fromDiscord({ kind: "voice", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromDiscord({ kind: "stage", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromDiscord({ kind: "message", id: "1", actor: "a", text: "a", threadId: "t" })?.source).toBe("discord")
  })

  test("A13 gmail or outlook produces an item and does not send on draft", () => {
    const drafted = fromMail({ account: "gmail", id: "e", actor: "a", text: "hi", threadId: "t" })
    const store = open([])
    const item = store.upsert(drafted)
    expect(item.source).toBe("mail")
    expect(store.originDraft(item.id, "reply")).toEqual({ drafted: true })
    expect(store.egress()).toHaveLength(0)
    expect(store.send(item.id, "reply", true)).toEqual({ sent: true })
  })

  test("A14 teams keeps chat channel and mention only", () => {
    expect(fromTeams({ kind: "call", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromTeams({ kind: "whiteboard", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromTeams({ kind: "chat", id: "1", actor: "a", text: "a", threadId: "t" })?.source).toBe("teams")
    expect(fromTeams({ kind: "channel", id: "2", actor: "a", text: "a", threadId: "t" })?.source).toBe("teams")
    expect(fromTeams({ kind: "mention", id: "3", actor: "a", text: "a", threadId: "t" })?.source).toBe("teams")
  })

  test("A15 and A16 linear and jira comments are items and boards are not", () => {
    expect(fromLinear({ kind: "board", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromLinear({ kind: "issue", id: "1", actor: "a", text: "a", threadId: "t" })?.source).toBe("linear")
    expect(fromJira({ kind: "status", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromJira({ kind: "comment", id: "1", actor: "a", text: "a", threadId: "t" })?.source).toBe("jira")
  })

  test("A17 and A29 github CI is only on the user PR and the diff is not an item", () => {
    expect(fromGithub({ kind: "diff", id: "1", actor: "a", text: "a", threadId: "t" })).toBeUndefined()
    expect(fromGithub({ kind: "ci", id: "2", actor: "a", text: "red", threadId: "t", onUserPr: false })).toBeUndefined()
    expect(fromGithub({ kind: "ci", id: "3", actor: "a", text: "red", threadId: "t", onUserPr: true })?.source).toBe(
      "github",
    )
    expect(fromGithub({ kind: "review", id: "4", actor: "a", text: "lgtm", threadId: "t" })?.source).toBe("github")
  })

  test("A19 and A28 inbox code does not write meeting or inbox text out", async () => {
    const files = new Bun.Glob("src/inbox/**/*.ts").scan({ cwd: new URL("../..", import.meta.url).pathname })
    for await (const file of files) {
      const text = await Bun.file(new URL(`../../${file}`, import.meta.url)).text()
      expect(text).not.toContain("@orchestra/atlas")
      expect(text).not.toContain("@orchestra/relay")
      expect(text).not.toContain("git commit")
    }
  })

  test("A21 and A26 the door is not a feed and the pipe is absent", async () => {
    expect(sourceKinds).not.toContain("whatsapp")
    expect(door({ from: "meeting", number: "+15551212" })).toEqual({ href: "https://wa.me/15551212" })
    expect(door({ from: "none" })).toEqual({ openApp: true })
    expect(door({ from: "contact", number: "555" })).toEqual({ openApp: true })
    const files = new Bun.Glob("src/inbox/**/*.ts").scan({ cwd: new URL("../..", import.meta.url).pathname })
    for await (const file of files) {
      const text = await Bun.file(new URL(`../../${file}`, import.meta.url)).text()
      expect(text).not.toContain("baileys")
      expect(text).not.toContain("notification-database")
    }
  })

  test("A22 and A35 the list does not show a thread or a share", () => {
    const view = shown()
    expect(view.thread).toBe(false)
    expect(view.reactions).toBe(false)
    expect(view.presence).toBe(false)
    expect(view.typing).toBe(false)
    expect(view.huddle).toBe(false)
    expect(view.call).toBe(false)
    expect(view.screenShare).toBe(false)
    const store = open([])
    const item = store.upsert({
      source: "slack",
      externalId: "1",
      actor: "a",
      snippet: "a",
      threadId: "t",
      reply: true,
      deepLink: "https://slack.example/t",
    })
    expect(item.deepLink).toBe("https://slack.example/t")
  })

  test("A31 the overlay and the flight engineer page stay", () => {
    expect(surfaces).toContain("overlay")
    expect(surfaces).toContain("flight-engineer")
  })

  test("A33 a work item uses the same fields", () => {
    const issue = fromLinear({ kind: "issue", id: "L1", actor: "a", text: "bug", threadId: "issue-1" })
    if (!issue) throw new Error("missing")
    const item = open([]).upsert(issue)
    expect(item).toMatchObject({ source: "linear", externalId: "L1", actor: "a", snippet: "bug", threadId: "issue-1" })
  })

  test("A20 inbox does not grant a pen or a product name", async () => {
    const files = new Bun.Glob("src/inbox/**/*.ts").scan({ cwd: new URL("../..", import.meta.url).pathname })
    for await (const file of files) {
      const text = await Bun.file(new URL(`../../${file}`, import.meta.url)).text()
      expect(text).not.toContain("schedule_manage")
      expect(text).not.toContain("one-box")
      expect(text).not.toContain("secretary")
    }
  })

  test("A36 and A38 an agent cannot send and a refresh does not", () => {
    const store = open([])
    const item = store.upsert({
      source: "slack",
      externalId: "1",
      actor: "a",
      snippet: "a",
      threadId: "t",
      reply: true,
    })
    expect(() => store.agentSend(item.id, "no")).toThrow("refused")
    store.list(0)
    expect(store.egress()).toHaveLength(0)
  })
})
