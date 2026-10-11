import { afterEach, expect } from "bun:test"
import path from "node:path"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Database } from "@orchestra/core/database/database"
import { ProjectV2 } from "@orchestra/core/project"
import { MessageTable, PartTable, SessionTable } from "@orchestra/core/session/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { LeanDashboard } from "@orchestra/schema/lean-dashboard"
import { LeanEngine } from "@orchestra/schema/lean-engine"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { Effect, Layer, Schema } from "effect"
import { InstanceBootstrap } from "../../src/project/bootstrap"
import { InstanceStore } from "../../src/project/instance-store"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "../server/httpapi-layer"

afterEach(async () => { await disposeAllInstances(); await resetDatabase() })
const noopBootstrap = Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void }))
const it = testEffect(Layer.mergeAll(
  AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node, Database.node])),
  AppNodeBuilder.build(InstanceStore.node, [[InstanceStore.bootstrapNode, noopBootstrap]]), httpApiLayer,
))

it.instance("Lean routes follow native profile, persist independent controls, expose typed history and storage failures", () => Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  const database = yield* Database.Service
  const other = yield* tmpdirScoped({ config: { tool_output: { lean: { enabled: false } } } })
  const firstResponse = yield* requestInDirectory("/project/lean?projectID=ignored", instance.directory)
  if (firstResponse.status !== 200) throw new Error(`Lean read failed: ${firstResponse.status} ${JSON.stringify(yield* firstResponse.json)}`)
  expect(firstResponse.status).toBe(200)
  const first = yield* Schema.decodeUnknownEffect(LeanDashboard.Info)(yield* firstResponse.json)
  expect(first.scope.directory).toBe(instance.directory)
  expect(first.enabled).toBe(true)
  expect(first.items).toHaveLength(32)
  expect(first.savings).toEqual({ bytesSaved: 0, tokensSaved: 0, calls: 0, tokenCalls: 0 })
  const sessionID = SessionID.make("ses_lean_http_saved")
  const messageID = MessageID.make("msg_lean_http_saved")
  yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: ProjectV2.ID.make(first.scope.projectID),
    directory: instance.directory, title: "saved", slug: "saved", version: "test", time_created: 1, time_updated: 1 }).run()
  yield* database.db.insert(MessageTable).values({ id: messageID, session_id: sessionID, data: { role: "assistant" } as never, time_created: 1, time_updated: 1 }).run()
  yield* database.db.insert(PartTable).values({ id: PartID.make("prt_lean_http_saved"), session_id: sessionID, message_id: messageID,
    time_created: 1, time_updated: 1, data: { type: "tool", tool: "bash", callID: "saved", state: {
      status: "completed", input: { command: "go test -v ." }, output: "saved", title: "saved", time: { start: 1, end: 2 }, metadata: { exit: 0, lean: {
        version: 1, scope: "standard-registry", engine: LeanEngine.legacy,
        owner: { projectID: first.scope.projectID, location: instance.directory, sessionID, callID: "saved" },
        model: { provider: "test", id: "test" }, producer: "native-shell", eligible: true, status: "applied", reason: "reduced",
        filterProfile: "go-test-verbose", durationMs: 1, bytes: { before: 100, after: 20, saved: 80 }, tokens: { kind: "unavailable" },
      } } } } as never }).run()
  const patch = (directory: string, body: LeanDashboard.Update) => requestInDirectory("/project/lean", directory, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })
  expect((yield* patch(instance.directory, { itemID: "cargo", enabled: false })).status).toBe(200)
  const disabledResponse = yield* patch(instance.directory, { enabled: false })
  const disabled = yield* Schema.decodeUnknownEffect(LeanDashboard.Info)(yield* disabledResponse.json)
  expect(disabled.enabled).toBe(false)
  expect(disabled.savings).toEqual({ bytesSaved: 80, tokensSaved: null, calls: 1, tokenCalls: 0 })
  expect(disabled.items.find((item) => item.id === "cargo")?.enabled).toBe(false)
  expect(disabled.items.find((item) => item.id === "pytest")?.enabled).toBe(true)
  const itemResponse = yield* patch(instance.directory, { itemID: "pytest", enabled: true })
  const independent = yield* Schema.decodeUnknownEffect(LeanDashboard.Info)(yield* itemResponse.json)
  expect(independent.enabled).toBe(false)
  const otherResponse = yield* requestInDirectory("/project/lean", other)
  const second = yield* Schema.decodeUnknownEffect(LeanDashboard.Info)(yield* otherResponse.json)
  expect(second.scope.projectID).toBe(first.scope.projectID)
  expect(second.scope.profileID).not.toBe(first.scope.profileID)
  expect(second.enabled).toBe(false)
  expect(second.savings.calls).toBe(0)
  expect(second.items.find((item) => item.id === "cargo")?.enabled).toBe(true)
  const historyResponse = yield* requestInDirectory("/project/lean/history/go", instance.directory)
  expect(historyResponse.status).toBe(200)
  const history = yield* Schema.decodeUnknownEffect(LeanDashboard.History)(yield* historyResponse.json)
  expect(history.scope).toEqual(first.scope)
  expect(history.itemID).toBe("go")
  expect(history.executions).toHaveLength(1)
  expect(history.executions[0]).toMatchObject({ command: "go test -v .", bytesSaved: 80, tokensSaved: null })
  expect((yield* requestInDirectory("/project/lean/history/unknown", instance.directory)).status).toBe(400)
  const file = path.join(global.data, "lean", "profiles", `${first.scope.profileID}.json`)
  yield* fs.writeFileString(file, "invalid")
  for (const response of [yield* requestInDirectory("/project/lean", instance.directory), yield* patch(instance.directory, { enabled: true })]) {
    expect(response.status).toBe(503)
    expect(yield* response.json).toMatchObject({ _tag: "ServiceUnavailableError", service: "lean" })
  }
}))
