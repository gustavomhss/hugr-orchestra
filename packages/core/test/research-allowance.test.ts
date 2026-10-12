import { describe, expect } from "bun:test"
import { Cause, Effect, Exit, Option, Schema } from "effect"
import { and, eq, sql } from "drizzle-orm"
import path from "node:path"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Project } from "@orchestra/schema/project"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionV1 } from "@orchestra/schema/session-v1"
import { AbsolutePath } from "@orchestra/schema/schema"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const root = LayerNode.group([ResearchAllowance.node, Database.node, EventV2.node])
const it = testEffect(AppNodeBuilder.build(root))
const binding = (): Research.Binding => ({
  projectID: Project.ID.make("prj_allowance"), memberID: "jimmy", taskId: EventV2.ID.create(),
  executionSessionID: SessionID.create(), authoritySessionID: SessionID.create(),
  directory: AbsolutePath.make(path.resolve("research")), worktree: AbsolutePath.make(path.resolve("research")),
})
const error = (exit: Exit.Exit<unknown, Research.Error>) => {
  expect(Exit.isFailure(exit)).toBe(true)
  return Exit.isFailure(exit) ? Option.getOrUndefined(Cause.findErrorOption(exit.cause)) : undefined
}
const ledger = Effect.fn("AllowanceTest.ledger")(function* (sessionID: SessionID) {
  const database = yield* Database.Service
  return yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
})

describe("native ResearchAllowance", () => {
  it.live("concurrent exact bind and charge retries admit one row; changed input conflicts", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const native = binding()
    const allowances = yield* Effect.forEach(Array.from({ length: 8 }), () => service.bind(native, "dispatch"), { concurrency: "unbounded" })
    expect(allowances.every((value) => value.providerLimit === 24 && value.toolLimit === 64 && value.byteLimit === 64 * 1024 * 1024)).toBe(true)
    const allowance = allowances[0]
    yield* Effect.forEach(Array.from({ length: 8 }), () => service.charge(allowance, "provider", "primary:1"), { concurrency: "unbounded" })
    expect(yield* ledger(native.executionSessionID)).toHaveLength(2)
    expect(error(yield* Effect.exit(service.charge(allowance, "tool", "primary:1")))?.code).toBe("conflict")
    expect(error(yield* Effect.exit(service.bind({ ...native, taskId: "other-task" }, "dispatch")))?.code).toBe("binding_mismatch")
    expect(error(yield* Effect.exit(service.charge({ ...allowance, providerLimit: 240 }, "provider", "widen")))?.code).toBe("binding_mismatch")
    expect(yield* ledger(native.executionSessionID)).toHaveLength(2)
    const resumed = yield* service.bind(native, "authorized-new-call")
    yield* service.charge(resumed, "provider", "primary:1")
    expect(yield* ledger(native.executionSessionID)).toHaveLength(4)
  }))

  for (const kind of ["provider", "tool"] as const) it.live(`${kind} concurrent native transactions stop at exact ceiling and return typed exhaustion`, () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const allowance = yield* service.bind(binding(), "dispatch")
    const limit = kind === "provider" ? allowance.providerLimit : allowance.toolLimit
    const results = yield* Effect.forEach(Array.from({ length: limit + 8 }, (_, index) => index),
      (index) => Effect.exit(service.charge(allowance, kind, `native:${index}`)), { concurrency: "unbounded" })
    expect(results.filter(Exit.isSuccess)).toHaveLength(limit)
    expect(results.filter(Exit.isFailure).map((exit) => error(exit)?.code)).toEqual(Array.from({ length: 8 }, () => "budget_exhausted"))
    const rows = yield* ledger(allowance.binding.executionSessionID)
    expect(rows.filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))).toHaveLength(limit)
    // The last request has no transaction/event; exact retry of an admitted operation still reconciles at the ceiling.
    const accepted = rows.find((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
    expect(accepted).toBeDefined()
    const operation = Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(accepted?.data).operation
    yield* service.charge(allowance, kind, operation)
    expect(yield* ledger(allowance.binding.executionSessionID)).toHaveLength(limit + 1)
  }))

  it.live("byte reservations race one allowance; repeated and uncertain reconciliation never refunds", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const allowance = yield* service.bind(binding(), "dispatch")
    const reserved = allowance.byteLimit / 4
    const results = yield* Effect.forEach(Array.from({ length: 8 }, (_, index) => `capture:${index}`),
      (operation) => Effect.exit(service.reserveBytes(allowance, operation, reserved)), { concurrency: "unbounded" })
    expect(results.filter(Exit.isSuccess)).toHaveLength(4)
    expect(results.filter(Exit.isFailure).map((exit) => error(exit)?.code)).toEqual(Array.from({ length: 4 }, () => "budget_exhausted"))
    const rows = yield* ledger(allowance.binding.executionSessionID)
    const admitted = rows.filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
      .map((row) => Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(row.data))
    yield* Effect.forEach(admitted, (entry) => service.reconcileBytes(allowance, entry.operation, 0))
    yield* Effect.forEach(admitted, (entry) => service.reconcileBytes(allowance, entry.operation, 0))
    expect(error(yield* Effect.exit(service.reserveBytes(allowance, "new-write", 1)))?.code).toBe("budget_exhausted")
    expect(error(yield* Effect.exit(service.reconcileBytes(allowance, admitted[0].operation, reserved + 1)))?.code).toBe("over_cap")
    expect(error(yield* Effect.exit(service.reconcileBytes(allowance, "unadmitted", 0)))?.code).toBe("binding_missing")
    expect(admitted.reduce((total, entry) => total + entry.amount, 0)).toBe(allowance.byteLimit)
    expect(yield* ledger(allowance.binding.executionSessionID)).toEqual(rows)
  }))

  it.live("missing allowance, invalid charge, corrupt row and SQL failure cannot yield success", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const allowance = yield* service.bind(binding(), "dispatch")
    expect(error(yield* Effect.exit(service.charge({ ...allowance, dispatchCallID: "missing" }, "provider", "call")))?.code).toBe("binding_missing")
    for (const amount of [0, -1, 0.5, NaN, Infinity])
      expect(error(yield* Effect.exit(service.charge(allowance, "provider", "invalid", amount)))?.code).toBe("over_cap")
    yield* service.charge(allowance, "provider", "control")
    const database = yield* Database.Service
    yield* database.db.update(EventTable).set({ data: { sessionID: allowance.binding.executionSessionID } }).where(and(
      eq(EventTable.aggregate_id, allowance.binding.executionSessionID), eq(EventTable.type, EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1)),
    )).run().pipe(Effect.orDie)
    expect(error(yield* Effect.exit(service.charge(allowance, "provider", "after-corruption")))?.code).toBe("publication_uncertain")
    // Real native SQL query failure, not a fake empty query result.
    yield* database.db.run(sql`ALTER TABLE event RENAME TO allowance_test_event`).pipe(Effect.orDie)
    expect(error(yield* Effect.exit(service.charge(allowance, "provider", "after-query-failure")))?.code).toBe("publication_uncertain")
    yield* database.db.run(sql`ALTER TABLE allowance_test_event RENAME TO event`).pipe(Effect.orDie)
    expect(yield* ledger(allowance.binding.executionSessionID)).toHaveLength(2)
  }))

  it.live("file-backed allowance survives connection closure, snapshot maintenance and same dispatch retry", () => Effect.gen(function* () {
    const directory = yield* Effect.acquireRelease(Effect.promise(tmpdir), (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()))
    const native = binding()
    const layer = () => AppNodeBuilder.build(root, [[Database.node, Database.layerFromPath(path.join(directory.path, "allowance.sqlite"))]])
    const allowance = yield* Effect.gen(function* () {
      const service = yield* ResearchAllowance.Service
      const admitted = yield* service.bind(native, "dispatch")
      yield* Effect.forEach(Array.from({ length: admitted.providerLimit }, (_, index) => index),
        (index) => service.charge(admitted, "provider", `call:${index}`))
      const events = yield* EventV2.Service
      const part = { id: SessionV1.PartID.ascending(), messageID: SessionV1.MessageID.ascending(),
        sessionID: native.executionSessionID, type: "text" as const, text: "retained native projection" }
      yield* events.publish(SessionV1.Event.PartUpdated, { sessionID: native.executionSessionID, part, time: 1 })
      yield* events.publish(SessionV1.Event.PartUpdated, { sessionID: native.executionSessionID, part: { ...part, text: "updated projection" }, time: 2 })
      yield* events.publish(SessionV1.Event.PartUpdated, { sessionID: native.executionSessionID, part, time: 3 }, { persist: false })
      return admitted
    }).pipe(Effect.provide(layer()))
    yield* Effect.gen(function* () {
      const service = yield* ResearchAllowance.Service
      const database = yield* Database.Service
      expect(yield* service.bind(native, "dispatch")).toEqual(allowance)
      expect(yield* ledger(native.executionSessionID)).toHaveLength(27)
      expect((yield* EventV2.compactSnapshotEvents(database.db)).removed).toBe(1)
      yield* service.charge(allowance, "provider", "call:0")
      expect(error(yield* Effect.exit(service.charge(allowance, "provider", "new-call")))?.code).toBe("budget_exhausted")
      expect(yield* ledger(native.executionSessionID)).toHaveLength(26)
    }).pipe(Effect.provide(layer()))
  }))
})
