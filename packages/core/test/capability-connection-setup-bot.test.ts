import { expect } from "bun:test"
import { Credential } from "@orchestra/schema/credential"
import { Integration } from "@orchestra/schema/integration"
import { Effect } from "effect"
import { CredentialTable } from "../src/credential/sql"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionSetupFixture.layer)
const placement = CapabilityConnectionSetupFixture.placement

it.live("two Discord bots require exact HTTP Bot headers and private provider grant; credentials never inherit another account", () => Effect.gen(function* () {
  const keys = ["discord-fixture-first-private-key", "discord-fixture-second-private-key"]
  const ids = ["111111111111111111", "222222222222222222"]
  const f = yield* CapabilityConnectionSetupFixture.fixture({ response: (request) => Response.json({ bot: true,
    id: request.headers.get("authorization") === `Bot ${keys[0]}` ? ids[0] : ids[1], token: keys[0] }) })
  const inherited = Credential.ID.create()
  yield* f.database.db.insert(CredentialTable).values({ id: inherited, integration_id: Integration.ID.make("capability.discord"),
    label: "unrelated active credential", value: { type: "key", key: "must-not-inherit" }, active: true }).run()
  const issued = yield* f.operators.issue({ origin: "sdk", scope: { placements: [placement], actions: ["connection.connect"],
    resources: [{ kind: "provider", id: "discord" }] } })
  const receipts = yield* Effect.forEach(keys, (key, index) => f.run(f.setup.connect(placement,
    { provider: "discord", key, label: `bot account ${index}` }), `account-${index}`, issued.authority))
  const results = receipts.map(CapabilityConnectionSetupFixture.result)
  const rows = yield* f.rows
  expect(new Set(results.map((result) => result.connection.id)).size).toBe(2)
  expect(rows.connections).toHaveLength(2)
  expect(new Set(rows.connections.map((row) => row.credential_id)).size).toBe(2)
  expect(new Set(rows.connections.map((row) => row.scope_hash)).size).toBe(2)
  results.forEach((result, index) => {
    const connection = rows.connections.find((row) => row.id === result.connection.id)
    expect(connection).toMatchObject({ provider: "discord", subject_id: ids[index],
      endpoint: "https://discord.com/api/v10", integration_id: "capability.discord" })
    expect(connection?.credential_id).not.toBe(inherited)
    expect(rows.credentials.find((row) => row.id === connection?.credential_id)?.value).toEqual({ type: "key", key: keys[index] })
    keys.forEach((key) => expect(JSON.stringify(receipts[index])).not.toContain(key))
    expect(JSON.stringify(receipts[index])).not.toContain(ids[index])
  })
  expect(f.seen).toEqual(keys.map((key) => ({ path: "/api/v10/users/@me", authorization: `Bot ${key}` })))
  const before = yield* f.rows
  const denied = yield* f.operators.issue({ origin: "sdk", scope: { placements: [placement], actions: ["connection.connect"],
    resources: [{ kind: "provider", id: "slack" }] } })
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(placement, { provider: "discord", key: keys[0] }),
    "wrong-provider", denied.authority).pipe(Effect.exit), "target_denied")
  expect(f.seen).toHaveLength(2)
  const replay = yield* f.run(f.setup.connect(placement, { provider: "discord", key: keys[0], label: "bot account 0" }), "account-0", issued.authority)
  expect(replay).toEqual({ ...receipts[0], reused: true })
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(placement,
    { provider: "discord", key: keys[1], label: "bot account 0" }), "account-0", issued.authority).pipe(Effect.exit), "outcome_unknown")
  expect(f.seen).toHaveLength(2)
  expect(yield* f.rows).toEqual(before)
}))

;[false, null, "true", undefined].forEach((bot) => it.live(
  `Discord setup rejects ${bot === undefined ? "missing" : typeof bot + " " + String(bot)} bot before persistence`, () => Effect.gen(function* () {
    // Intentionally malformed provider responses are negative fixtures, never successful identity data.
    const f = yield* CapabilityConnectionSetupFixture.fixture({ response: () => Response.json({ id: "123456789012345678",
      ...(bot === undefined ? {} : { bot }) }) })
    const before = yield* f.rows
    CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(placement,
      { provider: "discord", key: "discord-negative-private-key" })).pipe(Effect.exit), "connection_unavailable")
    expect(f.seen).toEqual([{ path: "/api/v10/users/@me", authorization: "Bot discord-negative-private-key" }])
    expect(yield* f.rows).toEqual(before)
  })))
