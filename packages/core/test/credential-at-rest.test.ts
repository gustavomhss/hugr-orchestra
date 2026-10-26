import { Database as Sqlite } from "bun:sqlite"
import { afterAll, expect, test } from "bun:test"
import { randomBytes } from "crypto"
import { mkdtempSync } from "fs"
import { rm } from "fs/promises"
import os from "os"
import path from "path"
import { Effect, Layer } from "effect"
import { Credential } from "@orchestra/core/credential"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { Database } from "@orchestra/core/database/database"
import { Integration } from "@orchestra/core/integration"

const root = mkdtempSync(path.join(os.tmpdir(), "orchestra-at-rest-"))
afterAll(() => rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined))

const openai = Integration.ID.make("openai")
const key = (value: string) => Credential.Key.make({ type: "key", key: value })

let count = 0
const database = () => path.join(root, `case-${count++}`, "orchestra.db")

const run = <A>(filename: string, effect: (credentials: Credential.Interface) => Effect.Effect<A>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* effect(yield* Credential.Service)
    }).pipe(Effect.provide(Credential.layerFrom(undefined).pipe(Layer.provide(Database.layerFromPath(filename))))),
  )

const stored = (filename: string, id: string) => {
  const db = new Sqlite(filename)
  const row = db.query<{ value: string }, [string]>("SELECT value FROM credential WHERE id = ?").get(id)
  db.close()
  return row?.value
}

const overwrite = (filename: string, id: string, value: string) => {
  const db = new Sqlite(filename)
  db.run("UPDATE credential SET value = ? WHERE id = ?", [value, id])
  db.close()
}

test("stores a credential sealed and reads it back", async () => {
  const filename = database()
  const created = await run(filename, (credentials) =>
    credentials.create({ integrationID: openai, label: "main", value: key("sk-round-trip") }),
  )

  expect(stored(filename, created.id)).toStartWith(CredentialCipher.PREFIX)
  expect(stored(filename, created.id)).not.toContain("sk-round-trip")
  const read = await run(filename, (credentials) => credentials.get(created.id))
  expect(read?.value).toEqual(key("sk-round-trip"))
})

test("reads a plaintext credential written before encryption and seals it", async () => {
  const filename = database()
  const created = await run(filename, (credentials) =>
    credentials.create({ integrationID: openai, label: "legacy", value: key("placeholder") }),
  )
  overwrite(filename, created.id, JSON.stringify({ type: "key", key: "sk-legacy" }))

  const read = await run(filename, (credentials) => credentials.get(created.id))

  expect(read?.value).toEqual(key("sk-legacy"))
  expect(stored(filename, created.id)).toStartWith(CredentialCipher.PREFIX)
  expect(stored(filename, created.id)).not.toContain("sk-legacy")
})

test("skips a credential no key opens and leaves it untouched", async () => {
  const filename = database()
  const credentials = await run(filename, (credentials) =>
    Effect.all([
      credentials.create({ integrationID: openai, label: "lost", value: key("sk-lost") }),
      credentials.create({ integrationID: openai, label: "kept", value: key("sk-kept") }),
    ]),
  )
  const foreign = CredentialCipher.seal(JSON.stringify(key("sk-lost")), randomBytes(32))
  overwrite(filename, credentials[0].id, foreign)

  const all = await run(filename, (credentials) => credentials.all())

  expect(all.map((credential) => credential.id)).toEqual([credentials[1].id])
  expect(stored(filename, credentials[0].id)).toBe(foreign)
})
