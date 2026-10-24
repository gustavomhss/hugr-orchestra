import { expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { LeanProject } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { MessageTable, PartTable, SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { testEffect } from "./lib/effect"

const scope = { profileID: "hash", projectID: "prj_lean_v2", directory: "/tmp/lean-v2-one" }
const sessionID = SessionSchema.ID.make("ses_lean_v2_one")
const other = SessionSchema.ID.make("ses_lean_v2_other")

const metrics = (session: string, callID: string, saved = 80) => ({
  version: 1, scope: "standard-registry", engine: LeanEngine.current,
  owner: { projectID: scope.projectID, location: scope.directory, sessionID: session, callID },
  model: { provider: "test", id: "model" }, producer: "native-shell", eligible: true,
  status: "applied", reason: "shell_summary", filterProfile: "go-test-verbose", durationMs: 1,
  bytes: { before: 100, after: 100 - saved, saved },
  tokens: { kind: "estimated", counter: "chars-per-token-4", before: 25, after: 5, saved: 20 },
})

const tool = (session: string, callID: string, lean?: unknown, completed = 20) => ({
  type: "tool", id: callID, name: "bash",
  state: { status: "completed", input: { command: "go test -v ." }, structured: { exit: 0, truncated: false },
    content: [{ type: "text", text: "large".repeat(1000) }], ...(lean === undefined ? {} : { metadata: { lean } }) },
  time: { created: 10, completed },
})

const it = testEffect(Database.layerFromPath(":memory:"))

it.live("collects V2 Session message tool parts with owner checks, legacy dedupe and staged reverts", () => Effect.gen(function* () {
  const database = yield* Database.Service
  const project = ProjectV2.ID.make(scope.projectID)
  yield* database.db.insert(ProjectTable).values({ id: project, worktree: AbsolutePath.make(scope.directory), sandboxes: [] }).run()
  for (const [id, directory] of [[sessionID, scope.directory], [other, "/tmp/lean-v2-two"]] as const)
    yield* database.db.insert(SessionTable).values({ id, project_id: project, directory, slug: id, title: "test", version: "test" }).run()
  yield* database.db.insert(SessionMessageTable).values([
    { id: SessionMessage.ID.make("msg_lean_v2_user"), session_id: sessionID, type: "user", seq: 1, time_created: 5, data: { text: "go" } as never },
    { id: SessionMessage.ID.make("msg_lean_v2_one"), session_id: sessionID, type: "assistant", seq: 2, time_created: 10,
      data: { content: [
        { type: "text", id: "text", text: "running" },
        tool(sessionID, "call_a", metrics(sessionID, "call_a")),
        tool(sessionID, "call_b", metrics(sessionID, "call_b", 40), 21),
        // No measurement, a foreign owner claim and a foreign directory never count.
        tool(sessionID, "call_plain"),
        tool(sessionID, "call_forged", metrics(other, "call_forged")),
      ] } as never },
    { id: SessionMessage.ID.make("msg_lean_v2_other"), session_id: other, type: "assistant", seq: 1, time_created: 10,
      data: { content: [tool(other, "call_c", metrics(other, "call_c"))] } as never },
  ]).run()

  const all = yield* LeanProject.collect(scope)
  expect(all.complete).toBe(true)
  expect(all.executions.map((execution) => [execution.callID, execution.partID, execution.itemID, execution.exit, execution.bytesSaved]))
    .toEqual([["call_a", "call_a", "go", 0, 80], ["call_b", "call_b", "go", 0, 40]])
  expect(LeanProject.savings(all.executions)).toEqual({ bytesSaved: 120, tokensSaved: 40, calls: 2, tokenCalls: 2 })
  const latest = yield* LeanProject.collect(scope, 1, true)
  expect(latest.complete).toBe(false)
  expect(latest.executions.map((execution) => execution.callID)).toEqual(["call_b"])

  // The same call recorded as a legacy part counts once.
  yield* database.db.insert(MessageTable).values({ id: "msg_lean_legacy" as never, session_id: sessionID, time_created: 10, time_updated: 10,
    data: { role: "assistant" } as never }).run()
  yield* database.db.insert(PartTable).values({ id: "prt_lean_legacy" as never, session_id: sessionID, message_id: "msg_lean_legacy" as never,
    time_created: 10, time_updated: 10, data: { type: "tool", callID: "call_a", tool: "bash", state: { status: "completed",
      input: { command: "go test -v ." }, time: { start: 1, end: 20 }, output: "x", title: "x",
      metadata: { exit: 0, lean: metrics(sessionID, "call_a") } } } as never }).run()
  const merged = yield* LeanProject.collect(scope)
  expect(merged.executions.map((execution) => [execution.callID, execution.messageID]))
    .toEqual([["call_a", "msg_lean_legacy"], ["call_b", "msg_lean_v2_one"]])
  yield* database.db.delete(PartTable).where(eq(PartTable.id, "prt_lean_legacy" as never)).run()

  // A staged revert to the prompt hides its answer; a vanished boundary hides the Session and marks history uncertain.
  yield* database.db.update(SessionTable).set({ revert: { messageID: "msg_lean_v2_user" } as never }).where(eq(SessionTable.id, sessionID)).run()
  const reverted = yield* LeanProject.collect(scope)
  expect(reverted.executions).toEqual([])
  expect(reverted.complete).toBe(true)
  yield* database.db.update(SessionTable).set({ revert: { messageID: "msg_missing" } as never }).where(eq(SessionTable.id, sessionID)).run()
  const uncertain = yield* LeanProject.collect(scope)
  expect(uncertain.executions).toEqual([])
  expect(uncertain.complete).toBe(false)
}))
