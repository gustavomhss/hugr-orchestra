import { expect } from "bun:test"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { AbsolutePath } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { CapabilityConnectionBindings } from "../src/capability/connection/bindings"
import { CapabilityConnectionManagement } from "../src/capability/connection/management"
import { CapabilityConnectionStore } from "../src/capability/connection/store"
import { ProjectTable } from "../src/project/sql"
import { SessionTable } from "../src/session/sql"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionSetupFixture.layer)
const input = CapabilityConnectionSetupFixture.input
const placement = CapabilityConnectionSetupFixture.placement

it.live("verified creation stores canonical exact credential atomically; retry expired key makes no new HTTP", () => Effect.gen(function* () {
  const state = { expired: false }
  const f = yield* CapabilityConnectionSetupFixture.fixture({ response: () => Response.json(state.expired
    ? { ok: false, error: "token_expired" } : { ok: true, team_id: "T123", user_id: "U456", bot_id: "B789", secret: input.key }) })
  expect(Object.isFrozen(f.setup)).toBe(true)
  const receipt = yield* f.run(f.setup.connect(placement, input), "exact")
  const result = CapabilityConnectionSetupFixture.result(receipt)
  expect(receipt.reused).toBe(false)
  expect(result.verification).toBe("verified")
  expect(result.connection.id.startsWith("cconn_")).toBe(true)
  const before = yield* f.rows
  expect(before.credentials).toHaveLength(1)
  expect(before.connections).toHaveLength(1)
  expect(before.receipts).toHaveLength(1)
  expect(before.credentials[0].id.startsWith("cred_")).toBe(true)
  expect(before.credentials[0]).toMatchObject({ integration_id: "capability.slack", label: input.label,
    value: { type: "key", key: input.key } })
  expect(before.connections[0]).toMatchObject({ id: result.connection.id, credential_id: before.credentials[0].id,
    subject_id: '["T123","U456","B789"]', endpoint: "https://slack.com/api", state: "active", label: input.label })
  expect(before.connections[0].scope_hash).toMatch(/^[a-f0-9]{64}$/)
  expect(f.seen).toEqual([{ path: "/api/auth.test", authorization: `Bearer ${input.key}` }])
  state.expired = true
  const retry = yield* f.run(f.setup.connect(placement, input), "exact")
  expect(retry).toEqual({ ...receipt, reused: true })
  expect(yield* f.rows).toEqual(before)
  expect(f.seen).toHaveLength(1)
  expect(f.writerStates).toEqual([false])
  const store = yield* CapabilityConnectionStore.make
  const management = yield* CapabilityConnectionManagement.make({ operators: f.operators, store })
  const read = yield* f.run(management.get(result.connection.id))
  expect(read).toEqual({ connection: result.connection, state: "active", credential: "present", label: input.label })
  const page = yield* f.run(management.list(placement, {}))
  expect(page.items).toEqual([read])
  ;[receipt, retry, read, page].forEach((publicValue) => {
    const encoded = JSON.stringify(publicValue)
    expect(encoded).not.toContain(input.key)
    expect(encoded).not.toContain(before.credentials[0].id)
    expect(encoded).not.toContain(before.connections[0].subject_id)
    expect(encoded).not.toContain("scope_hash")
  })
}))

it.live("changed key/provider/label/placement conflicts before network; missing project and denied provider also preflight", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  yield* f.run(f.setup.connect(placement, input), "intent")
  const before = yield* f.rows
  yield* Effect.forEach([{ ...input, key: input.key + "-changed" }, { ...input, provider: "discord" as const },
    { ...input, label: "new intent" }], (value) => f.run(f.setup.connect(placement, value), "intent").pipe(Effect.exit,
      Effect.tap((exit) => Effect.sync(() => CapabilityConnectionSetupFixture.expectCode(exit, "outcome_unknown")))))
  // Same valid project, different actual directory is a distinct idempotent intent.
  const foreign = { ...placement, location: { ...placement.location, directory: AbsolutePath.make(placement.location.directory + "/foreign") } }
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(foreign, input), "intent").pipe(Effect.exit), "outcome_unknown")
  expect(f.seen).toHaveLength(1)
  expect(yield* f.rows).toEqual(before)
  const denied = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["connection.connect"],
    resources: [{ kind: "provider", id: "discord" }] } })
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(placement, input), "denied", denied.authority).pipe(Effect.exit), "target_denied")
  yield* f.database.db.delete(ProjectTable).where(eq(ProjectTable.id, placement.projectID)).run()
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(placement, input), "missing").pipe(Effect.exit), "connection_unavailable")
  expect(f.seen).toHaveLength(1)
}))

it.live("SQL faults after credential insert and at receipt insert roll back all local rows; quota retains its error", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const before = yield* f.rows
  yield* Effect.forEach(["capability_connection", "capability_request"], (table) => Effect.gen(function* () {
    yield* f.database.db.run(`CREATE TRIGGER setup_atomic_fault BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'SETUP_ATOMIC_FAULT'); END`)
    const exit = yield* f.run(f.setup.connect(placement, input)).pipe(Effect.ensuring(
      f.database.db.run("DROP TRIGGER setup_atomic_fault").pipe(Effect.orDie)), Effect.exit)
    CapabilityConnectionSetupFixture.expectCode(exit, "outcome_unknown")
    expect(yield* f.rows).toEqual(before)
  }))
  expect(f.seen).toHaveLength(2)
  const quota = yield* CapabilityConnectionSetupFixture.fixture({ maxReceipts: 1 })
  yield* quota.run(quota.setup.connect(placement, input), "first")
  const full = yield* quota.rows
  CapabilityConnectionSetupFixture.expectCode(yield* quota.run(quota.setup.connect(placement, input), "second").pipe(Effect.exit), "quota_exceeded")
  expect(yield* quota.rows).toEqual(full)
}))

it.live("two verified accounts keep distinct exact credentials, subjects, targets and current actor bindings", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture({ response: (request) => Response.json({ ok: true,
    team_id: request.headers.get("authorization") === `Bearer ${input.key}` ? "T123" : "T999", user_id: "U456", bot_id: "B789" }) })
  const first = CapabilityConnectionSetupFixture.result(yield* f.run(f.setup.connect(placement, input))).connection
  const second = CapabilityConnectionSetupFixture.result(yield* f.run(f.setup.connect(placement, { ...input, key: input.key + "-two", label: "second account" }))).connection
  expect(first.id).not.toBe(second.id)
  const rows = yield* f.rows
  expect(rows.credentials).toHaveLength(2)
  expect(new Set(rows.connections.map((row) => row.credential_id)).size).toBe(2)
  expect(rows.connections.map((row) => row.subject_id).sort()).toEqual(['["T123","U456","B789"]', '["T999","U456","B789"]'])
  rows.connections.forEach((row) => expect(rows.credentials.find((credential) => credential.id === row.credential_id)?.value)
    .toEqual({ type: "key", key: row.id === first.id ? input.key : input.key + "-two" }))
  const store = yield* CapabilityConnectionStore.make
  const management = yield* CapabilityConnectionManagement.make({ operators: f.operators, store })
  const bindings = yield* CapabilityConnectionBindings.make({ operators: f.operators })
  const sessionID = SessionID.create()
  yield* f.database.db.insert(SessionTable).values({ id: sessionID, project_id: placement.projectID,
    directory: placement.location.directory, slug: "accounts", title: "accounts", version: "test", agent: "current-actor" }).run()
  yield* Effect.forEach([first, second], (connection) => Effect.gen(function* () {
    const receipt = yield* f.run(management.createTarget({ connection, input: { environment: "test", resource: { channelID: "C123" } } }))
    const child = yield* f.run(management.targets(connection.id, {}))
    expect(child.items).toHaveLength(1)
    expect(receipt.data).toEqual({ target: child.items[0].target })
    yield* f.run(management.bind({ target: child.items[0].target, input: { sessionID, actions: ["read"] } }))
    expect((yield* f.run(bindings.list(child.items[0].target.id, {}))).items).toEqual([{ sessionID, actions: ["read"] }])
  }))
  const discord: CapabilitySetup.Input = { provider: "discord", key: input.key + "-discord" }
  const other = yield* CapabilityConnectionSetupFixture.fixture()
  const third = CapabilityConnectionSetupFixture.result(yield* other.run(other.setup.connect(placement, discord))).connection
  expect(third.provider).toBe("discord")
  const saved = yield* other.rows
  expect(saved.credentials.find((row) => row.id === saved.connections.find((row) => row.id === third.id)?.credential_id)?.label).toBe("discord")
}))
