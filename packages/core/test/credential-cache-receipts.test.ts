import { expect, test } from "bun:test"
import { Effect, Layer, Schema } from "effect"
import { Capability } from "@orchestra/schema/capability"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { Integration } from "@orchestra/core/integration"
import { CredentialTable } from "../src/credential/sql"
import { publicReceipts } from "./fixture/capability-connection-setup"

test("CCR01 public receipt checks accept an empty cache without hiding meaningful cache secrets", () => Effect.runPromise(
  Effect.gen(function* () {
    const credentials = yield* Credential.Service
    const database = yield* Database.Service
    const integrationID = Integration.ID.make("cache-receipt-fixture")
    const secret = "synthetic-nonempty-cache-secret"
    const cache = (serialized: string) => Credential.Cache.make({ type: "cache",
      methodID: Integration.MethodID.make("cache-receipt"), format: "identity.fixture", version: 1, serialized })
    const empty = yield* credentials.create({ integrationID, value: cache("") })
    const meaningful = yield* credentials.create({ integrationID, value: cache(secret) })
    const key = yield* credentials.create({ integrationID,
      value: Credential.Key.make({ type: "key", key: "synthetic-receipt-key" }) })
    const rows = { credentials: yield* database.db.select().from(CredentialTable), connections: [] }
    expect(rows.credentials).toHaveLength(3)
    expect(rows.credentials.find((row) => row.id === empty.id)?.value).toEqual(cache(""))
    expect(rows.credentials.find((row) => row.id === meaningful.id)?.value).toEqual(cache(secret))
    const data = Schema.encodeSync(CapabilitySetup.Result)(CapabilitySetup.Result.make({
      connection: Capability.ConnectionRef.make({ id: Capability.ConnectionID.create(), provider: "slack", generation: 1 }),
      verification: "verified",
    }))
    // These are the actual stored rows and the real receipt oracle, not a copied list of forbidden values.
    publicReceipts([{ data }], rows)
    for (const leaked of [secret, "synthetic-receipt-key", empty.id, meaningful.id, key.id]) {
      const receipt = { data, diagnostic: leaked }
      expect(() => publicReceipts([receipt], rows)).toThrow()
    }
  }).pipe(Effect.provide(Credential.layerFrom(undefined).pipe(Layer.provideMerge(Database.layerFromPath(":memory:"))))),
))
