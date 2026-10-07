import { describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProjectV2 } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { MessageTable, SessionMessageTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { Effect } from "effect"
import { SessionActivity } from "../../src/session/activity"
import { MessageID, SessionID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Database.node])))

// Server-local calendar times; the period windows are local midnights.
const sep = (day: number, hour = 0, minute = 0) => new Date(2026, 8, day, hour, minute).getTime()
const oct = (day: number, hour = 0, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()
const now = oct(4, 15)
const minutes = (count: number) => count * 60_000
const project = ProjectV2.ID.make("prj_activity")
const usage = (input: number) => ({ input, output: 1, reasoning: 0, cache: { read: 0, write: 0 } })
const sessionRow = (
  id: string,
  input: { project?: ProjectV2.ID; directory: string; parent?: string; files?: number },
) => ({
  id,
  project: input.project ?? project,
  directory: input.directory,
  parent: input.parent ?? null,
  files: input.files ?? null,
})

// Persisted rows only: the repository root, a sandbox of the same project, a child session,
// another project, and two non-git directories that share the global project.
const seed = Effect.fn("SessionActivityTest.seed")(function* () {
  const { db } = yield* Database.Service
  yield* Effect.forEach(
    [
      { id: project, worktree: "/tmp/activity-repo" },
      { id: ProjectV2.ID.make("prj_activity_other"), worktree: "/tmp/activity-other" },
      { id: ProjectV2.ID.global, worktree: "/" },
    ],
    (row) =>
      db
        .insert(ProjectTable)
        .values({
          id: row.id,
          worktree: AbsolutePath.make(row.worktree),
          sandboxes: [],
          time_created: 1,
          time_updated: 1,
        })
        .onConflictDoNothing()
        .run()
        .pipe(Effect.orDie),
  )
  const sessions = [
    sessionRow("ses_activity_root1", { directory: "/tmp/activity-repo", files: 2 }),
    sessionRow("ses_activity_root2", { directory: "/tmp/activity-sandbox" }),
    sessionRow("ses_activity_child", { directory: "/tmp/activity-repo", parent: "ses_activity_root1" }),
    sessionRow("ses_activity_other", {
      directory: "/tmp/activity-other",
      project: ProjectV2.ID.make("prj_activity_other"),
    }),
    sessionRow("ses_activity_plain", { directory: "/tmp/activity-plain", project: ProjectV2.ID.global }),
    sessionRow("ses_activity_elsewhere", { directory: "/tmp/activity-elsewhere", project: ProjectV2.ID.global }),
  ]
  yield* Effect.forEach(sessions, (session) =>
    db
      .insert(SessionTable)
      .values({
        id: SessionID.make(session.id),
        project_id: session.project,
        parent_id: session.parent === null ? null : SessionID.make(session.parent),
        slug: session.id,
        directory: session.directory,
        title: session.id,
        version: "test",
        summary_additions: session.files === null ? null : 12,
        summary_deletions: session.files === null ? null : 3,
        summary_files: session.files,
        time_created: sep(1),
        time_updated: oct(4),
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
  const assistant = (input: { created: number; completed?: number; tokens: number; error?: unknown }) => ({
    role: "assistant",
    providerID: "openai",
    modelID: "gpt",
    cost: 0,
    tokens: usage(input.tokens),
    time: { created: input.created, ...(input.completed === undefined ? {} : { completed: input.completed }) },
    ...(input.error === undefined ? {} : { error: input.error }),
  })
  const legacy = [
    // Exactly the first edge: the previous window's first instant.
    { id: "msg_activity_01", session: "ses_activity_root1", created: sep(21), data: { role: "user" } },
    { id: "msg_activity_02", session: "ses_activity_root1", created: sep(20, 23, 59), data: { role: "user" } },
    {
      id: "msg_activity_03",
      session: "ses_activity_root1",
      created: sep(28),
      data: assistant({ created: sep(28), completed: sep(28, 0, 10), tokens: 10 }),
    },
    {
      id: "msg_activity_04",
      session: "ses_activity_root1",
      created: oct(4, 10),
      data: assistant({
        created: oct(4, 10),
        completed: oct(4, 10, 30),
        tokens: 4,
        error: { name: "APIError", data: {} },
      }),
    },
    {
      id: "msg_activity_05",
      session: "ses_activity_root1",
      created: oct(4, 10, 20),
      data: assistant({
        created: oct(4, 10, 20),
        completed: oct(4, 11),
        tokens: 0,
        error: { name: "MessageAbortedError", data: {} },
      }),
    },
    // Exactly the last edge: outside the period.
    { id: "msg_activity_06", session: "ses_activity_root1", created: oct(5), data: { role: "user" } },
    {
      id: "msg_activity_07",
      session: "ses_activity_child",
      created: oct(4, 13),
      data: assistant({ created: oct(4, 13), completed: oct(4, 14), tokens: 2 }),
    },
    { id: "msg_activity_08", session: "ses_activity_other", created: oct(4), data: { role: "user" } },
    { id: "msg_activity_09", session: "ses_activity_plain", created: oct(4), data: { role: "user" } },
    { id: "msg_activity_10", session: "ses_activity_elsewhere", created: oct(4), data: { role: "user" } },
  ]
  yield* Effect.forEach(legacy, (row) =>
    db
      .insert(MessageTable)
      .values({
        id: MessageID.make(row.id),
        session_id: SessionID.make(row.session),
        time_created: row.created,
        time_updated: row.created,
        data: row.data as never,
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
  const v2 = (input: { created: number; completed: number; error?: string; tokens: number }) => ({
    time: { created: input.created, completed: input.completed },
    agent: "maestro",
    model: { id: "sonnet", providerID: "anthropic" },
    content: [],
    tokens: usage(input.tokens),
    ...(input.error === undefined ? {} : { error: { type: "unknown", message: input.error } }),
  })
  const current = [
    {
      id: "msg_activity_v2_1",
      type: "user",
      created: oct(3, 23, 50),
      data: { time: { created: oct(3, 23, 50) }, text: "hi" },
    },
    // Crosses midnight: ten minutes before the edge, twenty after.
    {
      id: "msg_activity_v2_2",
      type: "assistant",
      created: oct(3, 23, 50),
      data: v2({ created: oct(3, 23, 50), completed: oct(4, 0, 20), tokens: 20 }),
    },
    // A stopped drain records the runner's interruption error; it is not a failure.
    {
      id: "msg_activity_v2_3",
      type: "assistant",
      created: oct(4, 10, 40),
      data: v2({ created: oct(4, 10, 40), completed: oct(4, 10, 50), error: "Provider turn interrupted", tokens: 1 }),
    },
    {
      id: "msg_activity_v2_4",
      type: "assistant",
      created: oct(4, 12),
      data: v2({ created: oct(4, 12), completed: oct(4, 12, 5), error: "Provider overloaded", tokens: 1 }),
    },
    { id: "msg_activity_v2_5", type: "shell", created: oct(4, 12, 1), data: { time: { created: oct(4, 12, 1) } } },
  ]
  yield* Effect.forEach(current, (row, index) =>
    db
      .insert(SessionMessageTable)
      .values({
        id: SessionMessage.ID.make(row.id),
        session_id: SessionID.make("ses_activity_root2"),
        type: row.type as never,
        seq: index + 1,
        time_created: row.created,
        time_updated: row.created,
        data: row.data as never,
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
})

const fact = (bucket: number, sessionID: string, input: Partial<SessionActivity.Fact>) => ({
  bucket,
  sessionID,
  providerID: null,
  modelID: null,
  user: 0,
  assistant: 0,
  failed: 0,
  tokens: 0,
  ...input,
})
const gpt = { providerID: "openai", modelID: "gpt" }
const sonnet = { providerID: "anthropic", modelID: "sonnet" }

describe("session activity", () => {
  it.live("counts the project's sessions in both storages within whole local days", () =>
    Effect.gen(function* () {
      yield* seed()
      const result = yield* SessionActivity.collect({ scope: { projectID: project }, period: "7d", now })
      expect(result.edges).toEqual([sep(21), sep(28), sep(29), sep(30), oct(1), oct(2), oct(3), oct(4), oct(5)])
      expect(result.days).toEqual([
        "2026-09-21",
        "2026-09-28",
        "2026-09-29",
        "2026-09-30",
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
        "2026-10-04",
        "2026-10-05",
      ])
      expect(result.previous).toBe(true)
      expect(result.truncated).toBe(false)
      expect(result.facts).toEqual([
        fact(0, "ses_activity_root1", { user: 1 }),
        fact(1, "ses_activity_root1", { ...gpt, assistant: 1, tokens: 11 }),
        fact(6, "ses_activity_root2", { user: 1 }),
        fact(6, "ses_activity_root2", { ...sonnet, assistant: 1, tokens: 21 }),
        fact(7, "ses_activity_child", { ...gpt, assistant: 1, tokens: 3 }),
        // The API error is a failure; the user abort is not.
        fact(7, "ses_activity_root1", { ...gpt, assistant: 2, failed: 1, tokens: 6 }),
        // The provider error is a failure; the interrupted drain is not.
        fact(7, "ses_activity_root2", { ...sonnet, assistant: 2, failed: 1, tokens: 4 }),
      ])
      expect(result.sessions.map((session) => [session.id, session.parentID, session.files])).toEqual([
        ["ses_activity_child", "ses_activity_root1", null],
        ["ses_activity_root1", null, 2],
        ["ses_activity_root2", null, null],
      ])
    }),
  )

  it.live("wall clock merges overlapping root turns per bucket and leaves out child sessions", () =>
    Effect.gen(function* () {
      yield* seed()
      const result = yield* SessionActivity.collect({ scope: { projectID: project }, period: "7d", now })
      expect(result.activeMs).toEqual([
        0,
        minutes(10),
        0,
        0,
        0,
        0,
        minutes(10),
        // 20 after midnight, 10:00-11:00 merged across the failed, aborted and interrupted turns, 12:00-12:05.
        minutes(20 + 60 + 5),
      ])
    }),
  )

  it.live("non-git directories share the global project and are scoped to their own directory", () =>
    Effect.gen(function* () {
      yield* seed()
      const result = yield* SessionActivity.collect({ scope: { directory: "/tmp/activity-plain" }, period: "7d", now })
      expect(result.facts).toEqual([fact(7, "ses_activity_plain", { user: 1 })])
    }),
  )

  it.live("All starts on the first recorded day and has no previous window", () =>
    Effect.gen(function* () {
      yield* seed()
      const result = yield* SessionActivity.collect({ scope: { projectID: project }, period: "all", now })
      expect(result.previous).toBe(false)
      expect(result.edges).toEqual([sep(20), sep(21), sep(23), sep(25), sep(27), sep(29), oct(1), oct(3), oct(5)])
      expect(result.facts.reduce((total, item) => total + item.user + item.assistant, 0)).toBe(10)
      const empty = yield* SessionActivity.collect({ scope: { directory: "/tmp/nothing" }, period: "all", now })
      expect(empty).toMatchObject({ edges: [oct(4), oct(5)], facts: [], sessions: [], activeMs: [0] })
    }),
  )

  it.live("a read past the message bound is marked truncated", () =>
    Effect.gen(function* () {
      yield* seed()
      const result = yield* SessionActivity.collect({ scope: { projectID: project }, period: "7d", now, limit: 3 })
      expect(result.truncated).toBe(true)
    }),
  )
})

describe("activity windows", () => {
  it.live("wall clock clips each merged interval to its bucket", () =>
    Effect.sync(() => {
      expect(
        SessionActivity.wallClock(
          [0, 100, 200],
          [
            [50, 150],
            [60, 70],
            [140, 160],
            [190, 250],
          ],
        ),
      ).toEqual([50, 70])
    }),
  )
})
