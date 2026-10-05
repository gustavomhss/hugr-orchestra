import { describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProjectV2 } from "@opencode-ai/core/project"
import { MessageTable, SessionMessageTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Effect } from "effect"
import { SessionActivity } from "../../src/session/activity"
import { MessageID, SessionID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Database.node])))

const directory = "/tmp/activity-repo"
const usage = (input: number) => ({ input, output: 1, reasoning: 0, cache: { read: 0, write: 0 } })

// Seeds persisted rows directly: one legacy session with V1 messages, one V2 session with
// session_message rows, and one session in another directory that must not be counted.
const seed = Effect.fn("SessionActivityTest.seed")(function* () {
  const { db } = yield* Database.Service
  const project = ProjectV2.ID.make("prj_activity")
  yield* db
    .insert(ProjectTable)
    .values({ id: project, worktree: AbsolutePath.make(directory), sandboxes: [], time_created: 1, time_updated: 1 })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  const sessions = [
    { id: "ses_activity_legacy", directory, title: "Legacy", additions: 12, deletions: 3, files: 2 },
    { id: "ses_activity_current", directory, title: "Current", additions: null, deletions: null, files: null },
    { id: "ses_activity_other", directory: "/tmp/other-repo", title: "Other", additions: null, deletions: null, files: null },
  ]
  yield* Effect.forEach(sessions, (session) =>
    db
      .insert(SessionTable)
      .values({
        id: SessionID.make(session.id),
        project_id: project,
        slug: session.id,
        directory: session.directory,
        title: session.title,
        version: "test",
        summary_additions: session.additions,
        summary_deletions: session.deletions,
        summary_files: session.files,
        time_created: 1_000,
        time_updated: 9_000,
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
  const legacy = [
    { id: "msg_activity_1", session: "ses_activity_legacy", created: 1_000, data: { role: "user" } },
    {
      id: "msg_activity_2",
      session: "ses_activity_legacy",
      created: 1_100,
      data: { role: "assistant", providerID: "openai", modelID: "gpt", cost: 0.5, tokens: usage(10), time: { created: 1_100, completed: 1_600 } },
    },
    {
      id: "msg_activity_3",
      session: "ses_activity_legacy",
      created: 1_700,
      data: {
        role: "assistant",
        providerID: "openai",
        modelID: "gpt",
        cost: 0,
        tokens: usage(4),
        time: { created: 1_700, completed: 1_800 },
        error: { name: "APIError", data: {} },
      },
    },
    {
      id: "msg_activity_4",
      session: "ses_activity_legacy",
      created: 1_900,
      data: {
        role: "assistant",
        providerID: "openai",
        modelID: "gpt",
        cost: 0,
        tokens: usage(0),
        time: { created: 1_900 },
        error: { name: "MessageAbortedError", data: {} },
      },
    },
    { id: "msg_activity_5", session: "ses_activity_legacy", created: 5_000, data: { role: "user" } },
    { id: "msg_activity_6", session: "ses_activity_other", created: 1_000, data: { role: "user" } },
    { id: "msg_activity_7", session: "ses_activity_legacy", created: 9_500, data: { role: "user" } },
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
  const current = [
    { id: "msg_activity_v2_user", type: "user", seq: 1, created: 4_000, data: { time: { created: 4_000 }, text: "hi" } },
    {
      id: "msg_activity_v2_assistant",
      type: "assistant",
      seq: 2,
      created: 4_100,
      data: {
        time: { created: 4_100, completed: 4_400 },
        agent: "build",
        model: { id: "sonnet", providerID: "anthropic" },
        content: [],
        tokens: usage(20),
      },
    },
    { id: "msg_activity_v2_shell", type: "shell", seq: 3, created: 4_200, data: { time: { created: 4_200 } } },
  ]
  yield* Effect.forEach(current, (row) =>
    db
      .insert(SessionMessageTable)
      .values({
        id: SessionMessage.ID.make(row.id),
        session_id: SessionID.make("ses_activity_current"),
        type: row.type as never,
        seq: row.seq,
        time_created: row.created,
        time_updated: row.created,
        data: row.data as never,
      })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie),
  )
})

describe("session activity", () => {
  it.live("aggregates both message storages by bucket, session and model within the directory", () =>
    Effect.gen(function* () {
      yield* seed()
      const result = yield* SessionActivity.collect({ directory, edges: [1_000, 3_000, 9_000] })
      expect(result.edges).toEqual([1_000, 3_000, 9_000])
      expect(result.facts).toEqual([
        {
          bucket: 0,
          sessionID: "ses_activity_legacy",
          providerID: null,
          modelID: null,
          user: 1,
          assistant: 0,
          failed: 0,
          activeMs: 0,
          tokens: 0,
          cost: 0,
        },
        {
          bucket: 0,
          sessionID: "ses_activity_legacy",
          providerID: "openai",
          modelID: "gpt",
          user: 0,
          assistant: 3,
          // The aborted turn is not a failure; the API error is.
          failed: 1,
          // 500ms + 100ms; the unfinished aborted turn adds nothing.
          activeMs: 600,
          tokens: 17,
          cost: 0.5,
        },
        {
          bucket: 1,
          sessionID: "ses_activity_current",
          providerID: null,
          modelID: null,
          user: 1,
          assistant: 0,
          failed: 0,
          activeMs: 0,
          tokens: 0,
          cost: 0,
        },
        {
          bucket: 1,
          sessionID: "ses_activity_current",
          providerID: "anthropic",
          modelID: "sonnet",
          user: 0,
          assistant: 1,
          failed: 0,
          activeMs: 300,
          tokens: 21,
          cost: 0,
        },
        {
          bucket: 1,
          sessionID: "ses_activity_legacy",
          providerID: null,
          modelID: null,
          user: 1,
          assistant: 0,
          failed: 0,
          activeMs: 0,
          tokens: 0,
          cost: 0,
        },
      ])
      expect(result.sessions).toEqual([
        {
          id: "ses_activity_current",
          title: "Current",
          parentID: null,
          created: 1_000,
          updated: 9_000,
          additions: null,
          deletions: null,
          files: null,
        },
        {
          id: "ses_activity_legacy",
          title: "Legacy",
          parentID: null,
          created: 1_000,
          updated: 9_000,
          additions: 12,
          deletions: 3,
          files: 2,
        },
      ])
    }),
  )

  it.live("an empty window has no facts and no sessions", () =>
    Effect.gen(function* () {
      yield* seed()
      expect(yield* SessionActivity.collect({ directory, edges: [20_000, 30_000] })).toEqual({
        edges: [20_000, 30_000],
        sessions: [],
        facts: [],
      })
    }),
  )
})

describe("session activity edges", () => {
  it.live("accepts 2..64 ascending non-negative integers and rejects everything else", () =>
    Effect.sync(() => {
      expect(SessionActivity.parseEdges("0,10,20")).toEqual([0, 10, 20])
      expect(SessionActivity.parseEdges("10")).toBeUndefined()
      expect(SessionActivity.parseEdges("10,10")).toBeUndefined()
      expect(SessionActivity.parseEdges("20,10")).toBeUndefined()
      expect(SessionActivity.parseEdges("-1,10")).toBeUndefined()
      expect(SessionActivity.parseEdges("0,1.5")).toBeUndefined()
      expect(SessionActivity.parseEdges("0,abc")).toBeUndefined()
      expect(SessionActivity.parseEdges(Array.from({ length: 65 }, (_, i) => i).join(","))).toBeUndefined()
      expect(SessionActivity.parseEdges(Array.from({ length: 64 }, (_, i) => i).join(","))).toHaveLength(64)
    }),
  )
})
