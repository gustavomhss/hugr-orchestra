import { customType, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import type { Credential } from "../credential"
import { CredentialCipher } from "./cipher"

/**
 * The secret is sealed at rest. Rows written before encryption hold plaintext JSON and still read; Credential
 * re-seals them. A sealed row no loaded key opens reads as null, so Credential reports and skips that one row
 * instead of failing every read, and never rewrites it.
 */
const sealedValue = customType<{ data: Credential.Value; driverData: string; driverOutput: string }>({
  dataType() {
    return "text"
  },
  toDriver(value) {
    return CredentialCipher.seal(JSON.stringify(value))
  },
  fromDriver(stored) {
    if (!CredentialCipher.isSealed(stored)) return JSON.parse(stored)
    return JSON.parse(CredentialCipher.open(stored) ?? "null")
  },
})

export const CredentialTable = sqliteTable("credential", {
  id: text().$type<Credential.ID>().primaryKey(),
  integration_id: text().$type<Credential.Info["integrationID"]>(),
  label: text().notNull(),
  value: sealedValue().notNull(),
  connector_id: text(),
  method_id: text(),
  active: integer({ mode: "boolean" }),
  ...Timestamps,
})
