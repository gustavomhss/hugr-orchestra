import { describe, expect } from "bun:test"
import { Cause, DateTime, Effect, Exit, Option, Schema } from "effect"
import { and, eq, sql } from "drizzle-orm"
import path from "node:path"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Project } from "@orchestra/schema/project"
import { SessionID } from "@orchestra/schema/session-id"
import { SessionEvent } from "@orchestra/schema/session-event"
import { AbsolutePath } from "@orchestra/schema/schema"
import { ResearchAllowance } from "@orchestra/core/research/allowance"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { EventCompaction } from "../src/event/compaction"
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
      // Retained native Session rows share the aggregate with the allowance ledger.
      const renamed = (title: string, millis: number) =>
        ({ sessionID: native.executionSessionID, timestamp: DateTime.makeUnsafe(millis), title })
      yield* events.publish(SessionEvent.Renamed, renamed("retained native projection", 1))
      yield* events.publish(SessionEvent.Renamed, renamed("updated projection", 2))
      yield* events.publish(SessionEvent.Renamed, renamed("retained native projection", 3), { persist: false })
      return admitted
    }).pipe(Effect.provide(layer()))
    yield* Effect.gen(function* () {
      const service = yield* ResearchAllowance.Service
      const database = yield* Database.Service
      expect(yield* service.bind(native, "dispatch")).toEqual(allowance)
      expect(yield* ledger(native.executionSessionID)).toHaveLength(27)
      // Snapshot maintenance as the retire-legacy-events migration does it: delete one retained row, record the marker.
      const retained = yield* database.db.select({ id: EventTable.id }).from(EventTable).where(and(
        eq(EventTable.aggregate_id, native.executionSessionID), eq(EventTable.type, EventV2.versionedType(SessionEvent.Renamed.type, 1)),
      )).all().pipe(Effect.orDie)
      expect(retained).toHaveLength(2)
      yield* database.db.delete(EventTable).where(eq(EventTable.id, retained[0].id)).run().pipe(Effect.orDie)
      yield* database.db.run(sql`INSERT OR REPLACE INTO data_migration (name, time_completed) VALUES (${EventCompaction.SNAPSHOT_COMPACTION_MARKER}, ${Date.now()})`).pipe(Effect.orDie)
      yield* service.charge(allowance, "provider", "call:0")
      expect(error(yield* Effect.exit(service.charge(allowance, "provider", "new-call")))?.code).toBe("budget_exhausted")
      expect(yield* ledger(native.executionSessionID)).toHaveLength(26)
    }).pipe(Effect.provide(layer()))
  }))

  it.live("each effort tier binds its owner-approved limits and deadline; absent tier is quick", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const expected = {
      quick: [24, 64, 64 * 1024 * 1024, 600],
      focused: [48, 128, 128 * 1024 * 1024, 1200],
      deep: [96, 256, 256 * 1024 * 1024, 2400],
    }
    for (const tier of ["quick", "focused", "deep"] as const) {
      const native = binding()
      const allowance = yield* service.bind(native, "dispatch", tier)
      expect([allowance.tier, allowance.providerLimit, allowance.toolLimit, allowance.byteLimit, allowance.deadlineSeconds])
        .toEqual([tier, ...expected[tier]])
      const rows = yield* ledger(native.executionSessionID)
      expect(Schema.decodeUnknownSync(ResearchEvent.AllowanceBound.data)(rows[0].data).allowance).toEqual(allowance)
    }
    const absent = yield* service.bind(binding(), "dispatch")
    expect([absent.tier, absent.providerLimit, absent.toolLimit, absent.byteLimit, absent.deadlineSeconds]).toEqual(["quick", ...expected.quick])
  }))

  it.live("an unknown tier is refused before any binding row", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    for (const tier of ["max", "toString", ""]) {
      const native = binding()
      // @ts-expect-error a caller outside the typed Task surface may still pass an unknown tier
      expect(error(yield* Effect.exit(service.bind(native, "dispatch", tier)))?.code).toBe("unsupported")
      expect(yield* ledger(native.executionSessionID)).toHaveLength(0)
    }
  }))

  it.live("an admitted tier cannot be raised by re-binding or by a widened allowance", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const native = binding()
    const quick = yield* service.bind(native, "dispatch", "quick")
    expect(error(yield* Effect.exit(service.bind(native, "dispatch", "deep")))?.code).toBe("binding_mismatch")
    const deep = { ...quick, tier: "deep" as const, providerLimit: 96, toolLimit: 256, byteLimit: 256 * 1024 * 1024, deadlineSeconds: 2400 }
    expect(error(yield* Effect.exit(service.charge(deep, "provider", "escalate")))?.code).toBe("binding_mismatch")
    expect(yield* service.bind(native, "dispatch")).toEqual(quick)
    expect(yield* ledger(native.executionSessionID)).toHaveLength(1)
  }))

  for (const tier of ["focused", "deep"] as const) it.live(`${tier} provider and tool charges exhaust at the ${tier} limit`, () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const allowance = yield* service.bind(binding(), "dispatch", tier)
    for (const kind of ["provider", "tool"] as const) {
      const limit = kind === "provider" ? Research.Tiers[tier].providerCalls : Research.Tiers[tier].toolCalls
      const results = yield* Effect.forEach(Array.from({ length: limit + 2 }, (_, index) => index),
        (index) => Effect.exit(service.charge(allowance, kind, `${kind}:${index}`)), { concurrency: 8 })
      expect(results.filter(Exit.isSuccess)).toHaveLength(limit)
      expect(results.filter(Exit.isFailure).map((exit) => error(exit)?.code)).toEqual(["budget_exhausted", "budget_exhausted"])
    }
    yield* service.reserveBytes(allowance, "bytes:full", Research.Tiers[tier].capturedBytes)
    expect(error(yield* Effect.exit(service.reserveBytes(allowance, "bytes:over", 1)))?.code).toBe("budget_exhausted")
  }))

  it.live("each tier binds its probe seconds, and probe charges exhaust there with the named error (J1.10)", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    for (const tier of ["quick", "focused", "deep"] as const) {
      const allowance = yield* service.bind(binding(), "dispatch", tier)
      expect(allowance.probeSecondsLimit).toBe(Research.ProbeSeconds[tier])
      yield* service.charge(allowance, "probe", "probe:1", Research.ProbeSeconds[tier] - 1)
      yield* service.charge(allowance, "probe", "probe:2", 1)
      const over = error(yield* Effect.exit(service.charge(allowance, "probe", "probe:3", 1)))
      expect(over?.code).toBe("budget_exhausted")
      expect(over?.message).toContain("probe allowance exhausted")
    }
  }))

  it.live("a focused dispatch admitted before probe seconds keeps its stored limit on re-bind", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const database = yield* Database.Service
    const native = binding()
    yield* service.bind(native, "dispatch", "focused")
    const row = (yield* ledger(native.executionSessionID))[0]
    const legacy = structuredClone(row.data) as { allowance: Record<string, unknown> }
    delete legacy.allowance.probeSecondsLimit
    yield* database.db.update(EventTable).set({ data: legacy }).where(eq(EventTable.id, row.id)).run().pipe(Effect.orDie)
    const rebound = yield* service.bind(native, "dispatch", "focused")
    expect(rebound.probeSecondsLimit).toBe(Research.ProbeSeconds.quick)
    yield* service.charge(rebound, "probe", "probe:legacy", 1)
  }))

  it.live("a version 1 binding admitted before tiers decodes as quick and re-binds unchanged", () => Effect.gen(function* () {
    const service = yield* ResearchAllowance.Service
    const database = yield* Database.Service
    const native = binding()
    const allowance = yield* service.bind(native, "dispatch")
    const row = (yield* ledger(native.executionSessionID))[0]
    const legacy = structuredClone(row.data) as { allowance: Record<string, unknown> }
    delete legacy.allowance.tier
    delete legacy.allowance.deadlineSeconds
    yield* database.db.update(EventTable).set({ data: legacy }).where(eq(EventTable.id, row.id)).run().pipe(Effect.orDie)
    expect(yield* service.bind(native, "dispatch")).toEqual(allowance)
    yield* service.charge(allowance, "provider", "legacy:1")
  }))
})
