import { afterEach, expect } from "bun:test"
import path from "node:path"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { LeanDashboard } from "@orchestra/schema/lean-dashboard"
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
  AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node])),
  AppNodeBuilder.build(InstanceStore.node, [[InstanceStore.bootstrapNode, noopBootstrap]]), httpApiLayer,
))

it.instance("Lean routes follow native profile, persist independent controls, expose typed history and storage failures", () => Effect.gen(function* () {
  const instance = yield* TestInstance
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  const other = yield* tmpdirScoped({ config: { tool_output: { lean: { enabled: false } } } })
  const firstResponse = yield* requestInDirectory("/project/lean?projectID=ignored", instance.directory)
  if (firstResponse.status !== 200) throw new Error(`Lean read failed: ${firstResponse.status} ${JSON.stringify(yield* firstResponse.json)}`)
  expect(firstResponse.status).toBe(200)
  const first = yield* Schema.decodeUnknownEffect(LeanDashboard.Info)(yield* firstResponse.json)
  expect(first.scope.directory).toBe(instance.directory)
  expect(first.enabled).toBe(true)
  expect(first.items).toHaveLength(32)
  expect(first.savings).toEqual({ bytesSaved: 0, tokensSaved: 0, calls: 0, tokenCalls: 0 })
  const patch = (directory: string, body: LeanDashboard.Update) => requestInDirectory("/project/lean", directory, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  })
  expect((yield* patch(instance.directory, { itemID: "cargo", enabled: false })).status).toBe(200)
  const disabledResponse = yield* patch(instance.directory, { enabled: false })
  const disabled = yield* Schema.decodeUnknownEffect(LeanDashboard.Info)(yield* disabledResponse.json)
  expect(disabled.enabled).toBe(false)
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
  expect(second.items.find((item) => item.id === "cargo")?.enabled).toBe(true)
  const historyResponse = yield* requestInDirectory("/project/lean/history/cargo", instance.directory)
  expect(historyResponse.status).toBe(200)
  const history = yield* Schema.decodeUnknownEffect(LeanDashboard.History)(yield* historyResponse.json)
  expect(history).toEqual({ scope: first.scope, itemID: "cargo", complete: true, executions: [] })
  expect((yield* requestInDirectory("/project/lean/history/unknown", instance.directory)).status).toBe(400)
  const file = path.join(global.data, "lean", "profiles", `${first.scope.profileID}.json`)
  yield* fs.writeFileString(file, "invalid")
  for (const response of [yield* requestInDirectory("/project/lean", instance.directory), yield* patch(instance.directory, { enabled: true })]) {
    expect(response.status).toBe(503)
    expect(yield* response.json).toMatchObject({ _tag: "ServiceUnavailableError", service: "lean" })
  }
}))
