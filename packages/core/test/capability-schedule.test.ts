import { expect } from "bun:test"
import { CapabilityScheduleContract } from "@orchestra/core/capability/schedule/contract"
import { Database } from "@orchestra/core/database/database"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { ScheduledTaskTable } from "@orchestra/core/scheduled-task/sql"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { ScheduleFixture } from "./fixture/capability-schedule"
import { testEffect } from "./lib/effect"

const it = testEffect(ScheduleFixture.layer)
const DAY = 86_400_000
const base = { action: "create", name: "Check", prompt: "Check the build." }

const created = (output: CapabilityScheduleContract.Output) => {
  if (!("schedule" in output)) throw new Error(`unexpected ${output.action}`)
  return output.schedule
}

it.live("creates every cadence kind for the issued owner, in the host zone by default", () => Effect.gen(function* () {
  const f = yield* ScheduleFixture.setup
  const s = yield* f.session
  const before = (yield* f.rows).length
  const cadences: Schema.Json[] = [{ kind: "once", at: Date.now() + DAY }, { kind: "interval", minutes: 30 },
    { kind: "daily", time: "09:30" }, { kind: "weekly", day: 1, time: "18:00" }, { kind: "cron", expression: "*/15 9-17 * * 1-5" }]
  for (const cadence of cadences) {
    const schedule = created(yield* s.output({ ...base, cadence }))
    expect(schedule).toMatchObject({ cadence, revision: 0, enabled: true, catchUp: "latest", runs: 0, skipped: 0 })
    expect(schedule.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }
  const zoned = created(yield* s.output({ ...base, cadence: { kind: "daily", time: "07:00" }, timezone: "Asia/Tokyo" }))
  expect(zoned.timezone).toBe("Asia/Tokyo")
  const rows = (yield* f.rows).slice(before)
  expect(rows).toHaveLength(6)
  for (const row of rows) expect(row).toMatchObject({ policy: "capability",
    owner: { sessionID: s.context.sessionID, agentID: s.context.agent } })
  expect(yield* s.output({ action: "list" })).toMatchObject({ action: "list", items: rows.map((row) => ({ id: row.id })) })
}))

it.live("invalid cron, unknown zone and past once are rejected without a row; a deny rule writes nothing", () => Effect.gen(function* () {
  const f = yield* ScheduleFixture.setup
  const s = yield* f.session
  const before = (yield* f.rows).length
  expect(yield* s.failure({ ...base, cadence: { kind: "cron", expression: "61 * * * *" } })).toBe("unsupported_schema")
  expect(yield* s.failure({ ...base, cadence: { kind: "cron", expression: "* * 31 2 *" } })).toBe("unsupported_schema")
  expect(yield* s.failure({ ...base, cadence: { kind: "daily", time: "09:00" }, timezone: "Mars/Olympus" }))
    .toBe("unsupported_schema")
  expect(yield* s.failure({ ...base, cadence: { kind: "once", at: Date.now() - DAY } })).toBe("unsupported_schema")
  yield* CapabilityPolicyFixture.setRules([...ScheduleFixture.allow,
    { action: "schedule.manage", resource: "*", effect: "deny" }])
  expect(yield* s.failure({ ...base, cadence: { kind: "interval", minutes: 5 } })).toBe("target_denied")
  // Validation precedes authorization, so an invalid definition never reaches a permission ask.
  expect(yield* s.failure({ ...base, cadence: { kind: "cron", expression: "bad" } })).toBe("unsupported_schema")
  yield* CapabilityPolicyFixture.setRules(ScheduleFixture.allow)
  expect((yield* f.rows).length).toBe(before)
}))

it.live("update bumps the revision; pause, resume and delete act on the owner's schedule", () => Effect.gen(function* () {
  const f = yield* ScheduleFixture.setup
  const s = yield* f.session
  const id = created(yield* s.output({ ...base, cadence: { kind: "interval", minutes: 10 } })).id
  const updated = created(yield* s.output({ action: "update", id, prompt: "Check twice.", cadence: { kind: "daily", time: "08:00" } }))
  expect(updated).toMatchObject({ revision: 1, prompt: "Check twice.", cadence: { kind: "daily", time: "08:00" } })
  expect(yield* s.failure({ action: "update", id, timezone: "Nowhere/Zone" })).toBe("unsupported_schema")
  expect(created(yield* s.output({ action: "get", id })).revision).toBe(1)
  expect(created(yield* s.output({ action: "pause", id })).enabled).toBe(false)
  expect(created(yield* s.output({ action: "resume", id })).enabled).toBe(true)
  expect(yield* s.output({ action: "delete", id })).toEqual({ action: "delete", id })
  expect(yield* s.failure({ action: "get", id })).toBe("target_denied")
  expect((yield* f.rows).some((row) => row.id === id)).toBe(false)
}))

it.live("run admits a fresh Session; a retry of the same call reuses it", () => Effect.gen(function* () {
  const f = yield* ScheduleFixture.setup
  const s = yield* f.session
  const id = created(yield* s.output({ ...base, cadence: { kind: "daily", time: "06:00" } })).id
  const first = yield* s.output({ action: "run", id })
  if (first.action !== "run") throw new Error("expected run")
  expect(first.reused).toBe(false)
  expect(first.sessionID).not.toBe(s.context.sessionID)
  expect(yield* s.output({ action: "run", id }, s.last())).toEqual({ ...first, reused: true })
  const second = yield* s.output({ action: "run", id })
  if (second.action !== "run") throw new Error("expected run")
  expect(second).toMatchObject({ reused: false })
  expect(second.sessionID).not.toBe(first.sessionID)
  expect(created(yield* s.output({ action: "get", id }))).toMatchObject({ runs: 0 })
}))

it.live("foreign and unknown IDs fail identically for every action; list shows only own", () => Effect.gen(function* () {
  const f = yield* ScheduleFixture.setup
  const s = yield* f.session
  const foreign = yield* f.session
  const id = created(yield* s.output({ ...base, cadence: { kind: "interval", minutes: 15 } })).id
  const unknown = yield* foreign.failure({ action: "get", id: ScheduledTask.ID.create() })
  expect(unknown).toBe("target_denied")
  const actions: Schema.Json[] = [{ action: "get", id }, { action: "update", id, name: "Mine" },
    { action: "pause", id }, { action: "resume", id }, { action: "run", id }, { action: "delete", id }]
  for (const input of actions) expect(yield* foreign.failure(input)).toBe(unknown)
  expect(yield* foreign.output({ action: "list" })).toEqual({ action: "list", items: [] })
  expect(created(yield* s.output({ action: "get", id }))).toMatchObject({ id, revision: 0, enabled: true })
}))

// Under a deny rule an authorization attempt fails target_denied, so any other code proves no ask happened.
const denyAll = CapabilityPolicyFixture.setRules([...ScheduleFixture.allow,
  { action: "schedule.manage", resource: "*", effect: "deny" }])

it.live("an owner holds at most 64 schedules; the 65th is refused before authorization", () => Effect.gen(function* () {
  const f = yield* ScheduleFixture.setup
  const s = yield* f.session
  for (const n of Array.from({ length: 64 }, (_, i) => i))
    yield* s.output({ ...base, name: `Check ${n}`, cadence: { kind: "interval", minutes: 5 + n } })
  yield* denyAll
  expect(yield* s.failure({ ...base, cadence: { kind: "interval", minutes: 5 } })).toBe("quota_exceeded")
  yield* CapabilityPolicyFixture.setRules(ScheduleFixture.allow)
  expect(yield* s.failure({ ...base, cadence: { kind: "interval", minutes: 5 } })).toBe("quota_exceeded")
  const list = yield* s.output({ action: "list" })
  expect(list.action === "list" ? list.items.length : 0).toBe(64)
  const other = yield* f.session
  expect(created(yield* other.output({ ...base, cadence: { kind: "interval", minutes: 5 } })).revision).toBe(0)
}))

it.live("resume of an exhausted or past once schedule and an update that never fires are refused before asking", () =>
  Effect.gen(function* () {
    const f = yield* ScheduleFixture.setup
    const s = yield* f.session
    const database = yield* Database.Service
    const past = created(yield* s.output({ ...base, cadence: { kind: "once", at: Date.now() - DAY }, enabled: false })).id
    const exhausted = created(yield* s.output({ ...base, cadence: { kind: "interval", minutes: 5 }, repeat: 2 })).id
    yield* database.db.update(ScheduledTaskTable).set({ runs: 2, enabled: false, disabled_reason: "exhausted" })
      .where(eq(ScheduledTaskTable.id, exhausted)).run().pipe(Effect.orDie)
    const live = created(yield* s.output({ ...base, cadence: { kind: "daily", time: "10:00" } })).id
    yield* denyAll
    expect(yield* s.failure({ action: "resume", id: past })).toBe("unsupported_schema")
    expect(yield* s.failure({ action: "resume", id: exhausted })).toBe("unsupported_schema")
    expect(yield* s.failure({ action: "update", id: live, cadence: { kind: "cron", expression: "0 0 31 2 *" } }))
      .toBe("unsupported_schema")
    expect(yield* s.failure({ action: "update", id: live, cadence: { kind: "once", at: Date.now() - DAY } }))
      .toBe("unsupported_schema")
    expect(yield* s.failure({ action: "update", id: live, name: "Renamed" })).toBe("target_denied")
    yield* CapabilityPolicyFixture.setRules(ScheduleFixture.allow)
    expect(created(yield* s.output({ action: "get", id: live }))).toMatchObject({ revision: 0, cadence: { kind: "daily" } })
  }))

it.live("the schedule name is an authorization resource", () => Effect.gen(function* () {
  const f = yield* ScheduleFixture.setup
  const s = yield* f.session
  yield* CapabilityPolicyFixture.setRules([...ScheduleFixture.allow,
    { action: "schedule.manage", resource: "name:Secret*", effect: "deny" }])
  expect(yield* s.failure({ ...base, name: "Secret sync", cadence: { kind: "interval", minutes: 5 } })).toBe("target_denied")
  const id = created(yield* s.output({ ...base, name: "Public sync", cadence: { kind: "interval", minutes: 5 } })).id
  expect(yield* s.failure({ action: "update", id, name: "Secret sync" })).toBe("target_denied")
  expect(created(yield* s.output({ action: "update", id, name: "Public sync 2" }))).toMatchObject({ revision: 1 })
  yield* CapabilityPolicyFixture.setRules(ScheduleFixture.allow)
}))
