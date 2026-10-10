import { expect } from "bun:test"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Integration } from "@orchestra/schema/integration"
import { eq } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { CapabilityConnections } from "../src/capability/connection/index"
import { CapabilityConnectionManagement } from "../src/capability/connection/management"
import { CapabilityConnectionStore } from "../src/capability/connection/store"
import { CapabilityInvocation } from "../src/capability/invocation"
import { Credential } from "../src/credential"
import { CredentialTable } from "../src/credential/sql"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(Credential.layerFrom(undefined).pipe(Layer.provideMerge(CapabilityPolicyFixture.layer)))

it.live("operator-admitted Slack/Discord accounts feed canonical model resolution with exact selected keys despite newer credentials", () => Effect.gen(function* () {
  const root = yield* CapabilityPolicyFixture.fixture()
  const placement = { projectID: root.binding.owner.projectID, location: root.binding.owner.location }
  const f = yield* CapabilityConnectionSetupFixture.fixture({ response: (request) => {
    const second = request.headers.get("authorization")?.includes("-second")
    return Response.json(new URL(request.url).pathname === "/api/auth.test"
      ? { ok: true, team_id: second ? "T999" : "T123", user_id: "U456", bot_id: "B789" }
      : { id: second ? "222222222222222222" : "111111111111111111", bot: true })
  } })
  const credentials = yield* Credential.Service
  const canonical = yield* CapabilityConnections.make
  const store = yield* CapabilityConnectionStore.make
  const management = yield* CapabilityConnectionManagement.make({ operators: f.operators, store })
  const issued = yield* f.operators.issue({ origin: "sdk", scope: { placements: [placement], actions: ["connection.connect"],
    resources: [{ kind: "provider", id: "slack" }, { kind: "provider", id: "discord" }] } })
  // A persisted model root is not an operator frame; an operator frame is not a model invocation.
  CapabilityConnectionSetupFixture.expectCode(yield* CapabilityInvocation.withContext(root.binding,
    f.setup.connect(placement, { provider: "slack", key: "consumption-slack-first" })).pipe(Effect.exit), "invocation_binding_missing", ["consumption-slack-first"])
  const accounts = yield* Effect.forEach(["slack", "discord"] as const, (provider) => Effect.forEach(
    ["first", "second"], (account) => Effect.gen(function* () {
      const input: CapabilitySetup.Input = { provider, key: `consumption-${provider}-${account}`, label: "same account label" }
      const receipt = yield* f.run(f.setup.connect(placement, input), `${provider}-${account}`, issued.authority)
      const connection = CapabilityConnectionSetupFixture.result(receipt).connection
      const child = yield* f.run(management.createTarget({ connection, input: { environment: "test", resource: { selected: account } } }))
      const target = Schema.decodeUnknownSync(Schema.toType(CapabilityManagement.Target), { onExcessProperty: "error" })(child.data).target
      yield* f.run(management.bind({ target, input: { sessionID: root.context.sessionID, actions: ["read"] } }))
      const replay = yield* f.run(f.setup.connect(placement, input), `${provider}-${account}`, issued.authority)
      return { input, connection, target, receipt, replay }
    })))
  const selected = accounts.flat()
  yield* credentials.create({ integrationID: Integration.ID.make("unrelated"), value: { type: "key", key: "unrelated-private-key" } })
  yield* Effect.forEach(["slack", "discord"] as const, (provider) => Effect.gen(function* () {
    const newest = yield* credentials.create({ integrationID: Integration.ID.make(`capability.${provider}`),
      value: { type: "key", key: `newest-${provider}-must-not-select` }, label: "same account label" })
    yield* f.database.db.update(CredentialTable).set({ time_created: Date.now() + 1000 }).where(eq(CredentialTable.id, newest.id)).run()
    expect((yield* credentials.list(newest.integrationID)).at(-1)?.id).toBe(newest.id)
  }))
  const rows = yield* f.rows
  CapabilityConnectionSetupFixture.publicReceipts(selected.flatMap((account) => [account.receipt, account.replay]), rows)
  yield* Effect.forEach(selected, (account) => Effect.gen(function* () {
    const request = { provider: account.input.provider, connectionID: account.connection.id, targetID: account.target.id, action: "read" }
    CapabilityConnectionSetupFixture.expectCode(yield* f.run(canonical.resolve(root.context, request)).pipe(Effect.exit),
      "invocation_binding_missing", [account.input.key])
    const resolved = yield* CapabilityInvocation.withContext(root.binding, canonical.resolve(root.context, request))
    expect(resolved.connection).toEqual(account.connection)
    expect(resolved.target).toEqual(account.target)
    const stored = rows.connections.find((row) => row.id === account.connection.id)
    if (!stored?.credential_id) return yield* Effect.die("Missing setup credential reference")
    expect(resolved.credentialID).toBe(stored.credential_id)
    expect(yield* CapabilityInvocation.withContext(root.binding, canonical.loadCredential(root.context, resolved, "read")))
      .toEqual({ type: "key", key: account.input.key })
  }))
  expect(f.seen).toEqual(selected.map((account) => ({ path: account.input.provider === "slack" ? "/api/auth.test" : "/api/v10/users/@me",
    authorization: `${account.input.provider === "slack" ? "Bearer" : "Bot"} ${account.input.key}` })))
}))
