import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Meeting } from "@orchestra/schema/meeting"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { MeetingTable } from "@orchestra/core/session/meeting.sql"
import { MeetingItemTable, MeetingPersonTable } from "@orchestra/core/session/meeting-memory.sql"
import { MeetingRecallTool } from "@orchestra/core/tool/meeting-recall"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { testEffect } from "./lib/effect"
import { executeTool } from "./lib/tool"

const directory = AbsolutePath.make("/project")
const sessionID = SessionV2.ID.make("ses_meeting_recall")
const assertions: PermissionV2.AssertInput[] = []

const permission = Layer.mock(PermissionV2.Service, {
  assert: (input) => Effect.sync(() => assertions.push(input)),
})

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([Database.node, EventV2.node, ToolRegistry.node, ToolRegistry.toolsNode, MeetingRecallTool.node]),
    [
      [Location.node, Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } })],
      [PermissionV2.node, permission],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
    ],
  ),
)

const call = (agent: string, tool: string, input: object) => ({
  sessionID,
  agent: AgentV2.ID.make(agent),
  assistantMessageID: SessionMessage.ID.make("msg_meeting_recall_test"),
  call: { type: "tool-call" as const, id: "call-meeting-recall", name: tool, input },
})

const item = (
  meetingID: string,
  id: string,
  kind: "decision" | "commitment",
  text: string,
  extra: Partial<typeof MeetingItemTable.$inferInsert> = {},
) => ({
  id,
  revision: 1,
  meeting_id: Meeting.ID.make(meetingID),
  kind,
  text,
  quote: `quote ${id}`,
  asserter: "per_ana",
  status: "claimed" as const,
  created_at: 1,
  ...extra,
})

const seed = Effect.gen(function* () {
  const { db } = yield* Database.Service
  yield* db
    .insert(ProjectTable)
    .values({ id: ProjectV2.ID.global, worktree: directory, sandboxes: [] })
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(MeetingPersonTable)
    .values({ id: "per_ana", name: "Ana", aliases: ["Anita"] })
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(MeetingTable)
    .values([
      {
        id: Meeting.ID.make("mtg_new"),
        title: "Planning",
        time_started: Date.UTC(2026, 9, 20),
        time_ended: Date.UTC(2026, 9, 20) + 1,
      },
      {
        id: Meeting.ID.make("mtg_old"),
        title: "Kickoff",
        time_started: Date.UTC(2026, 8, 1),
        time_ended: Date.UTC(2026, 8, 1) + 1,
      },
    ])
    .run()
    .pipe(Effect.orDie)
  yield* db
    .insert(MeetingItemTable)
    .values([
      item("mtg_new", "itm_1", "decision", "Ship the beta on Friday"),
      item("mtg_old", "itm_2", "decision", "Use Postgres"),
      item("mtg_old", "itm_3", "decision", "Hidden"),
      item("mtg_old", "itm_3", "decision", "Hidden", { revision: 2, status: "dismissed" }),
      item("mtg_new", "itm_4", "commitment", "Send the deck", {
        owner: "me",
        counterparty: "per_ana",
        state: "accepted",
      }),
      item("mtg_new", "itm_5", "commitment", "Draft the contract", { owner: "per_ana", state: "proposed" }),
      item("mtg_old", "itm_6", "commitment", "Book the venue", { owner: "me", state: "done" }),
    ])
    .run()
    .pipe(Effect.orDie)
})

describe("MeetingRecallTool", () => {
  it.effect("recalls the latest revisions newest first with provenance and filters", () =>
    Effect.gen(function* () {
      yield* seed
      const registry = yield* ToolRegistry.Service

      const all = yield* executeTool(registry, call("live", MeetingRecallTool.name, { kind: "decision" }))
      expect(all.type).toBe("text")
      expect(all.value).toContain('[From memory: Ana, 2026-10-20, "Planning"] decision: Ship the beta on Friday')
      expect(all.value).toContain('"Kickoff"')
      expect(all.value).not.toContain("Hidden")
      expect(String(all.value).indexOf("Planning")).toBeLessThan(String(all.value).indexOf("Kickoff"))

      const byAlias = yield* executeTool(
        registry,
        call("live", MeetingRecallTool.name, { person: "anita", query: "postgres" }),
      )
      expect(byAlias.value).toContain("Use Postgres")
      expect(byAlias.value).not.toContain("beta")

      const since = yield* executeTool(
        registry,
        call("live", MeetingRecallTool.name, { since: "2026-10-01", kind: "decision" }),
      )
      expect(since.value).toContain("beta")
      expect(since.value).not.toContain("Postgres")
      const until = yield* executeTool(
        registry,
        call("live", MeetingRecallTool.name, { until: "2026-09-01", kind: "decision" }),
      )
      expect(until.value).toContain("Postgres")
      expect(until.value).not.toContain("beta")
      expect(assertions.at(-1)).toMatchObject({ action: "meeting_recall", resources: ["meetings"] })
    }),
  )

  it.effect("says plainly when nothing is stored", () =>
    Effect.gen(function* () {
      yield* seed
      const registry = yield* ToolRegistry.Service
      const none = yield* executeTool(registry, call("live", MeetingRecallTool.name, { query: "zebra" }))
      expect(none.value).toContain("Nothing is stored in your meetings")
      const nobody = yield* executeTool(registry, call("live", MeetingRecallTool.name, { person: "Zed" }))
      expect(nobody.value).toContain("Nothing is stored in your meetings")
    }),
  )

  it.effect("lists commitments by direction, person and state", () =>
    Effect.gen(function* () {
      yield* seed
      const registry = yield* ToolRegistry.Service
      const mine = yield* executeTool(registry, call("live", MeetingRecallTool.commitmentsName, { direction: "mine" }))
      expect(mine.value).toContain("Send the deck")
      expect(mine.value).not.toContain("Draft the contract")
      expect(mine.value).not.toContain("Book the venue")
      const done = yield* executeTool(registry, call("live", MeetingRecallTool.commitmentsName, { state: "done" }))
      expect(done.value).toContain("Book the venue")
      expect(done.value).not.toContain("Send the deck")
      const theirs = yield* executeTool(
        registry,
        call("live", MeetingRecallTool.commitmentsName, { direction: "theirs" }),
      )
      expect(theirs.value).toContain("Draft the contract")
      expect(theirs.value).toContain("owner: Ana")
      const proposed = yield* executeTool(
        registry,
        call("live", MeetingRecallTool.commitmentsName, { state: "proposed", person: "Ana" }),
      )
      expect(proposed.value).toContain("Draft the contract")
      expect(proposed.value).not.toContain("Send the deck")
    }),
  )

  it.effect("is closed to every seat but live", () =>
    Effect.gen(function* () {
      assertions.length = 0
      const registry = yield* ToolRegistry.Service
      expect(yield* executeTool(registry, call("maestro", MeetingRecallTool.name, {}))).toEqual({
        type: "error",
        value: "maestro has no meeting memory",
      })
      expect(yield* executeTool(registry, call("general", MeetingRecallTool.commitmentsName, {}))).toEqual({
        type: "error",
        value: "general has no meeting memory",
      })
      expect(assertions).toEqual([])
    }),
  )
})
