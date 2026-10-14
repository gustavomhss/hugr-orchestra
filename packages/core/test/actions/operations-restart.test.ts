import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { eq } from "drizzle-orm"
import { Effect, Exit, Schema, Scope } from "effect"
import { ChildProcess } from "effect/unstable/process"
import path from "node:path"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { testEffect } from "../lib/effect"
import { fixture, intent, open, openDatabase } from "./operations-fixture"

const it = testEffect(LayerNode.compile(AppProcess.node))

it.live("actual process loss leaves sending; fresh Database recovery returns durable unknown and never replays", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* Scope.close(service.scope, Exit.void)
  yield* Scope.close(f.scope, Exit.void)
  const processService = yield* AppProcess.Service
  const result = yield* processService.run(ChildProcess.make(process.execPath, [
    path.join(import.meta.dir, "operations-restart-worker.ts"), f.filename, JSON.stringify(service.binding), lease.id,
  ]), { timeout: "15 seconds", maxOutputBytes: 4096, maxErrorBytes: 4096 })
  expect(result.exitCode).toBe(0)
  expect(result.stderr.toString()).toBe("")
  const exited = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ id: Actions.OperationID, pid: Schema.Int })))(result.stdout.toString())
  expect(exited.id).toBe(lease.id)
  expect(exited.pid).not.toBe(process.pid)
  const restarted = yield* openDatabase(f.filename)
  expect((yield* restarted.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get())?.state).toBe("sending")
  const rebuilt = yield* open(restarted.database, f.directory)
  const receipt = yield* rebuilt.operations.get(rebuilt.binding, lease.id)
  expect(receipt.state).toBe("outcome_unknown")
  expect(receipt.result).toBeUndefined()
  expect((yield* rebuilt.operations.execute(rebuilt.binding, { id: lease.id, input: {} }, () => Effect.die("restart must never replay provider write"))).state).toBe("outcome_unknown")
}))
