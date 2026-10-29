import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { beforeEach, describe, expect, test } from "bun:test"
import { DateTime, Effect, Layer } from "effect"
import { exportContext } from "@orchestra/atlas-boundary/context"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage, SessionV2 } from "@orchestra/core/session"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ContinuityArchive } from "../src/v2/archive"
import { ContinuityStrategy } from "../src/v2/strategy"
import { ContinuityTools } from "../src/v2/tools"
import { config, permission, run, seed, store } from "./fixture"

const sessionID = SessionV2.ID.make("ses_tools")
const assertions: PermissionV2.AssertInput[] = []
let entries = config({})
// The Location has no VCS, so the committed `.atlas/` tree is read from its directory.
const repo = AbsolutePath.make(mkdtempSync(path.join(tmpdir(), "continuity-bundle-")))

const it = run(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      ToolRegistry.node,
      ToolRegistry.toolsNode,
      ContinuityStrategy.stateNode,
      ContinuityTools.toolsNode,
    ]),
    [
      [PermissionV2.node, permission(assertions)],
      [Config.node, Layer.succeed(Config.Service, Config.Service.of({ entries: () => Effect.succeed(entries) }))],
      [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
      [Location.node, Layer.succeed(Location.Service, { directory: repo, project: { id: Project.ID.global, directory: repo } })],
    ],
  ),
)

const created = DateTime.makeUnsafe(1)
const history: SessionMessage.Message[] = [
  SessionMessage.User.make({ id: SessionMessage.ID.make("msg_user"), type: "user", text: "find the bug", time: { created } }),
  SessionMessage.Assistant.make({
    id: SessionMessage.ID.make("msg_assistant"),
    type: "assistant",
    agent: "build",
    model: { id: ModelV2.ID.make("m"), providerID: ProviderV2.ID.make("fake") },
    time: { created },
    content: [
      { type: "text", id: "txt_1", text: "Looking at the logs." },
      {
        type: "tool",
        id: "call_logs",
        name: "bash",
        state: {
          status: "completed",
          input: { command: "cat app.log" },
          content: [{ type: "text", text: "ERROR deadlock in scheduler" }],
          structured: {},
        },
        time: { created },
      },
    ],
  }),
]

const call = (name: string, input: Record<string, unknown>) =>
  Effect.gen(function* () {
    const registry = yield* ToolRegistry.Service
    const materialized = yield* registry.materialize()
    const settlement = yield* materialized.settle({
      sessionID,
      agent: AgentV2.ID.make("build"),
      assistantMessageID: SessionMessage.ID.make("msg_caller"),
      call: { type: "tool-call", id: `call_${name}`, name, input },
    })
    return settlement.result
  })

const recall = (input: Record<string, unknown>) =>
  call(ContinuityTools.RECALL, input).pipe(
    Effect.map((result) => {
      expect(result.type).toBe("text")
      return JSON.parse(String(result.value))
    }),
  )

const seeded = Effect.gen(function* () {
  yield* seed(sessionID)
  yield* Effect.forEach(history, (message, index) => store(message, index + 1, sessionID))
})

describe("ContinuityTools", () => {
  beforeEach(() => {
    assertions.length = 0
    entries = config({})
  })

  test("registers both tools and asserts permission from the tool call", () =>
    it(
      Effect.gen(function* () {
        const registry = yield* ToolRegistry.Service
        const names = (yield* registry.materialize()).definitions.map((definition) => definition.name)
        expect(names).toEqual(expect.arrayContaining([ContinuityTools.RECALL, ContinuityTools.COMPACT]))
        yield* seeded
        yield* recall({ query: "deadlock" })
        expect(assertions).toMatchObject([
          { action: "context_recall", sessionID, source: { type: "tool", messageID: "msg_caller", callID: "call_context_recall" } },
        ])
      }),
    ))

  test("looks up stored messages, parts and aliases", () =>
    it(
      Effect.gen(function* () {
        yield* seeded
        const message = yield* recall({ message_id: "msg_assistant" })
        expect(message).toMatchObject({ status: "found", source: { message_id: "msg_assistant" }, complete: true })
        expect(JSON.parse(message.content).content).toHaveLength(2)
        const part = yield* recall({ message_id: "msg_assistant", part_id: "call_logs" })
        expect(JSON.parse(part.content)).toMatchObject({ id: "call_logs", state: { input: { command: "cat app.log" } } })
        expect(yield* recall({ reference: "t1" })).toMatchObject({ source: { message_id: "msg_assistant", part_id: "call_logs" } })
        expect(JSON.parse((yield* recall({ reference: "u1" })).content)).toMatchObject({ text: "find the bug" })
        expect(JSON.parse((yield* recall({ reference: "a1" })).content)).toMatchObject({ id: "msg_assistant" })
        expect(yield* recall({ reference: "t9" })).toEqual({ status: "unavailable", source: { reference: "t9" }, reason: "missing" })
        const paged = yield* recall({ message_id: "msg_assistant", offset: 10, limit: 20 })
        expect(paged).toMatchObject({ offset: 10, next_offset: 30, complete: false })
        expect(paged.content).toHaveLength(20)
      }),
    ))

  test("searches the stored history newest first", () =>
    it(
      Effect.gen(function* () {
        yield* seeded
        expect(yield* recall({ query: "DEADLOCK" })).toMatchObject({
          status: "found",
          matches: [{ source: { message_id: "msg_assistant", part_id: "call_logs" }, field: "tool.output" }],
        })
        expect(yield* recall({ query: "absent" })).toMatchObject({ status: "not_found", matches: [] })
      }),
    ))

  test("reads, lists and searches the archive", () =>
    it(
      Effect.gen(function* () {
        const chunks = ContinuityArchive.chunks(sessionID, "msg_assistant", "assistant", "scheduler deadlock trace")
        yield* ContinuityArchive.publish(sessionID, chunks)
        const id = chunks[0].id
        const found = yield* recall({ reference: id })
        expect(found).toMatchObject({ status: "found", source: { reference: id }, complete: true })
        expect(found.content).toContain("scheduler deadlock trace")
        expect(yield* recall({ archive_list: true })).toMatchObject({ status: "found", total: 1, references: [{ id }] })
        expect(yield* recall({ archive_query: "deadlock trace" })).toMatchObject({ total: 1, references: [{ id }] })
        expect(yield* recall({ archive_query: "trace scheduler", match: "terms" })).toMatchObject({
          total: 1,
          references: [{ id }],
        })
        expect(yield* recall({ archive_query: "deadlock", role: "user" })).toMatchObject({ status: "not_found", total: 0 })
      }),
    ))

  test("reads a reference the local archive lacks from the agent's committed archive", () =>
    it(
      Effect.gen(function* () {
        const [chunk] = ContinuityArchive.chunks("ses_predecessor", "msg_assistant", "assistant", "committed handover notes")
        exportContext(repo, "build", "ses_predecessor", { references: [chunk], masks: [] }, {
          commit: true,
          at: "2026-10-28T10:00:00.000Z",
        })
        const found = yield* recall({ reference: chunk.id })
        expect(found).toMatchObject({ status: "found", source: { reference: chunk.id }, bytes: chunk.bytes })
        expect(found.content).toContain("committed handover notes")
        expect(yield* recall({ reference: "f".repeat(64) })).toMatchObject({ status: "unavailable", reason: "missing" })
      }),
    ))

  test("scrubs credential shapes before a chunk is hashed", () => {
    const secret = "AKIA" + "IOSFODNN7EXAMPLE"
    const [chunk] = ContinuityArchive.chunks(sessionID, "msg_assistant", "assistant", `key ${secret}`)
    expect(chunk.markdown).not.toContain(secret)
    expect(chunk.id).toBe(ContinuityArchive.hash(chunk.markdown))
  })

  test("refuses ambiguous input", () =>
    it(
      Effect.gen(function* () {
        expect(yield* call(ContinuityTools.RECALL, { query: "x", archive_list: true })).toEqual({
          type: "error",
          value: "Give exactly one of message_id, query, reference, archive_query, archive_list; got 2",
        })
      }),
    ))

  test("context_compact requests a compaction for the next turn", () =>
    it(
      Effect.gen(function* () {
        const result = yield* call(ContinuityTools.COMPACT, {})
        expect(String(result.value)).toStartWith("Compaction requested")
        expect((yield* ContinuityStrategy.Service).session(sessionID).requested).toBe(true)
        expect(assertions).toMatchObject([{ action: "context_compact", sessionID }])
      }),
    ))

  test("context_compact reports disabled continuity", () => {
    entries = config({ continuity: { enabled: false } })
    return it(
      Effect.gen(function* () {
        expect((yield* call(ContinuityTools.COMPACT, {})).value).toBe("Context continuity is disabled for this project.")
        expect((yield* ContinuityStrategy.Service).session(sessionID).requested).toBe(false)
      }),
    )
  })
})
