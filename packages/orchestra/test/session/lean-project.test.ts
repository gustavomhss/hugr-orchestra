import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ProjectV2 } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { MessageTable, PartTable, SessionTable } from "@orchestra/core/session/sql"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { Effect } from "effect"
import { LeanProject } from "../../src/session/lean-project"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { testEffect } from "../lib/effect"

const scope = { profileID: "hash", projectID: "prj_lean_collector", directory: "/tmp/lean-profile-one" }
function row(patch: Partial<LeanProject.Row> = {}, metricPatch = {}): LeanProject.Row {
  return {
    sessionID: "ses_lean_one", messageID: "msg_z", partID: "prt_a", callID: "call", status: "completed",
    command: "go test -v .", commandLength: 12, exit: 0, time: 20, created: 10,
    revert: null, boundaryTime: null, boundaryPart: null,
    metrics: JSON.stringify({ version: 1, scope: "standard-registry", engine: LeanEngine.legacy,
      owner: { projectID: scope.projectID, location: scope.directory, sessionID: "ses_lean_one", callID: "call" },
      model: { provider: "test", id: "model" }, producer: "native-shell", eligible: true,
      status: "applied", reason: "reduced", filterProfile: "go-test-verbose", durationMs: 1,
      bytes: { before: 100, after: 20, saved: 80 },
      tokens: { kind: "estimated", counter: "chars-per-token-4", before: 25, after: 5, saved: 20 }, ...metricPatch }),
    ...patch,
  }
}

test("containing owners precede retry dedup, conflicts and fork copies cannot earn savings", () => {
  const original = row()
  const fork = row({ sessionID: "ses_fork", partID: "prt_fork" })
  const wrongCall = row({ callID: "other" })
  const wrongLocation = row({}, { owner: { projectID: scope.projectID, location: "/elsewhere", sessionID: "ses_lean_one", callID: "call" } })
  const result = LeanProject.projectRows(scope, [original, row({ partID: "prt_retry" }), fork, wrongCall, wrongLocation], true)
  expect(result.executions).toHaveLength(1)
  expect(LeanProject.savings(result.executions)).toEqual({ bytesSaved: 80, tokensSaved: 20, calls: 1, tokenCalls: 1 })
  expect(LeanProject.projectRows(scope, [original, row({}, { bytes: { before: 101, after: 20, saved: 81 } })], true).executions).toEqual([])
})

test("revert uses canonical time/message/part prefix, missing boundaries exclude uncertain history", () => {
  expect(LeanProject.projectRows(scope, [row({ revert: { messageID: "msg_a" }, boundaryTime: 11 })], true).executions).toHaveLength(1)
  expect(LeanProject.projectRows(scope, [row({ revert: { messageID: "msg_z", partID: "prt_b" }, boundaryTime: 10, boundaryPart: "prt_b" })], true).executions).toHaveLength(1)
  for (const patch of [
    { revert: { messageID: "msg_z" }, boundaryTime: 10 },
    { revert: { messageID: "msg_z", partID: "prt_a" }, boundaryTime: 10, boundaryPart: "prt_a" },
    { revert: { messageID: "missing" } },
    { revert: { messageID: "msg_z", partID: "missing" }, boundaryTime: 10 },
  ]) expect(LeanProject.projectRows(scope, [row(patch)], true).executions).toEqual([])
})

test("new item IDs, signed tokens, missing estimates, overflow and disabled earned totals remain honest", () => {
  const result = LeanProject.projectRows(scope, [row({}, { itemID: "cargo", tokens: { kind: "unavailable" } })], false)
  const info = LeanProject.dashboard({ scope, enabled: false, items: { cargo: false } }, true, result)
  expect(info.enabled).toBe(false)
  expect(info.complete).toBe(false)
  expect(info.items.find((item) => item.id === "cargo")).toMatchObject({ enabled: false, savings: { bytesSaved: 80, tokensSaved: null } })
  expect(info.items.find((item) => item.id === "pytest")?.enabled).toBe(true)
  const execution = result.executions[0]
  expect(LeanProject.savings([{ ...execution, bytesSaved: Number.MAX_SAFE_INTEGER }, execution]).bytesSaved).toBeNull()
  expect(LeanProject.savings([{ ...execution, tokensSaved: -4 }]).tokensSaved).toBe(-4)
  const history = LeanProject.historyResult(scope, "cargo", { complete: true,
    executions: Array.from({ length: 51 }, (_, index) => ({ ...execution, partID: `prt_${index}`, time: index })) })
  expect(history.complete).toBe(false)
  expect(history.executions).toHaveLength(50)
  expect(history.executions[0].time).toBe(50)
  expect(LeanProject.projectRows(scope, [row({ command: "x".repeat(4096), commandLength: 5000 })], true).executions[0].commandTruncated).toBe(true)
})

const it = testEffect(LayerNode.compile(Database.node))
it.live("SQL collector intersects native project and selected directory, bounds rows without reading outputs", () => Effect.gen(function* () {
  const database = yield* Database.Service
  const project = ProjectV2.ID.make(scope.projectID)
  yield* database.db.insert(ProjectTable).values({ id: project, worktree: AbsolutePath.make(scope.directory), sandboxes: [], time_created: 1, time_updated: 1 }).run()
  for (const [index, directory] of [scope.directory, "/tmp/lean-profile-two"].entries()) {
    const sessionID = SessionID.make(`ses_lean_sql_${index}`)
    const messageID = MessageID.make(`msg_lean_sql_${index}`)
    yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: project, directory, slug: sessionID, title: "test", version: "test", time_created: 1, time_updated: 1 }).run()
    yield* database.db.insert(MessageTable).values({ id: messageID, session_id: sessionID, time_created: 1, time_updated: 1, data: { role: "assistant" } as never }).run()
    for (const count of [0, 1]) {
      const metrics = JSON.parse(row().metrics!)
      // Foreign profile can contain copied same-scope claims: native directory still wins.
      metrics.owner = { projectID: scope.projectID, location: scope.directory, sessionID, callID: `call${count}` }
      yield* database.db.insert(PartTable).values({ id: PartID.make(`prt_lean_sql_${index}_${count}`), session_id: sessionID, message_id: messageID,
        time_created: 1, time_updated: 1, data: { type: "tool", callID: `call${count}`, tool: "bash", state: { status: "completed",
          input: { command: "go test -v ." }, time: { start: 1, end: 2 }, output: "large-output".repeat(100000), title: "test", metadata: { exit: 0, lean: metrics } } } as never }).run()
    }
  }
  const all = yield* LeanProject.collect(scope)
  expect(all.complete).toBe(true)
  expect(all.executions).toHaveLength(2)
  expect(LeanProject.savings(all.executions).bytesSaved).toBe(160)
  const capped = yield* LeanProject.collect(scope, 1)
  expect(capped.complete).toBe(false)
  expect(capped.executions).toHaveLength(1)
}))
