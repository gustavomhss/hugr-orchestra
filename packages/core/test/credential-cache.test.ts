import { afterAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdirSync, mkdtempSync } from "node:fs"
import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Exit, Layer, Schema } from "effect"
import { Credential } from "@orchestra/core/credential"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { Database } from "@orchestra/core/database/database"
import { Integration } from "@orchestra/core/integration"

const root = mkdtempSync(path.join(os.tmpdir(), "orchestra-cache-cas-"))
afterAll(() => rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined))
const integrationID = Integration.ID.make("fabric-cache-fixture")
const cache = (serialized: string) => Credential.Cache.make({ type: "cache", methodID: Integration.MethodID.make("entra"),
  format: "microsoft.identity.cache", version: 1, serialized })
const filename = (name: string) => {
  mkdirSync(path.join(root, name), { recursive: true })
  return path.join(root, name, "orchestra.db")
}
const run = <A, E>(file: string, release: string | undefined, effect: (credentials: Credential.Interface) => Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.gen(function* () {
    const credentials = yield* Credential.Service
    return yield* effect(credentials)
  }).pipe(Effect.provide(Credential.layerFrom(release).pipe(Layer.provide(Database.layerFromPath(file))))))

async function stored(file: string, id: string) {
  const { Database } = await import("bun:sqlite")
  const db = new Database(file, { readonly: true })
  const row = db.query<{ value: string; label: string; integration_id: string }, [string]>(
    "SELECT value, label, integration_id FROM credential WHERE id = ?",
  ).get(id)
  db.close()
  return row
}

function cacheFailure(exit: Exit.Exit<unknown, unknown>, reason: "invalid" | "binding", id: Credential.ID | undefined,
  secrets: readonly string[]) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Expected a typed cache failure")
  const failure = exit.cause.reasons[0]
  expect(failure?._tag).toBe("Fail")
  if (failure?._tag !== "Fail" || !(failure.error instanceof Credential.CacheError)) throw new Error("Expected CacheError")
  const error = failure.error
  expect(error.reason).toBe(reason)
  expect(Schema.decodeUnknownSync(Credential.ID)(error.credentialID)).toBe(error.credentialID)
  expect(error.credentialID).toStartWith("cred_")
  if (id !== undefined) expect(error.credentialID).toBe(id)
  expect(Schema.encodeSync(Credential.CacheError)(error)).toEqual({ _tag: "Credential.CacheError",
    credentialID: error.credentialID, reason })
  expect(error.message).toBe("Credential cache write rejected")
  expect(error).not.toHaveProperty("revision")
  expect(error).not.toHaveProperty("serialized")
  secrets.forEach((secret) => {
    expect(JSON.stringify(exit)).not.toContain(secret)
    expect(error.message).not.toContain(secret)
    expect(String(error)).not.toContain(secret)
  })
  return error
}

test("CCS01 cache snapshots reuse the canonical family and existing sealed credential storage", async () => {
  expect(Credential.Cache).toBeDefined()
  const canonical = await import("@orchestra/schema/credential")
  expect(Credential.Cache).toBe(canonical.Credential.Cache)
  const file = filename("roundtrip")
  const created = await run(file, undefined, (credentials) => credentials.create({ integrationID, label: "Account",
    value: cache("SYNTHETIC_CACHE_SECRET_ONE") }))
  const bytes = await stored(file, created.id)
  expect(bytes?.value).toStartWith(CredentialCipher.PREFIX)
  expect(bytes?.value).not.toContain("SYNTHETIC_CACHE_SECRET_ONE")
  const first = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(first?.mode).toBe("owned")
  if (first?.mode !== "owned") return
  expect(first.credential.value).toEqual(cache("SYNTHETIC_CACHE_SECRET_ONE"))
  expect(first.credential.id).toBe(created.id)
  expect(typeof first.revision).toBe("string")
  expect(first.revision.length).toBeGreaterThan(0)
  expect(first.revision).not.toContain("SYNTHETIC_CACHE_SECRET_ONE")
  const reopened = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(reopened).toEqual(first)
  const missing = Credential.ID.create()
  expect(await run(file, undefined, (credentials) => credentials.cache.read(missing))).toBeUndefined()
  expect(await stored(file, missing)).toBeNull()
  const before = await stored(file, created.id)
  const invalid = { ...cache("SYNTHETIC_INVALID_CREATE"), format: "" }
  const refused = await run(file, undefined, (credentials) => credentials.create({ integrationID, value: invalid }).pipe(Effect.exit))
  cacheFailure(refused, "invalid", undefined, ["SYNTHETIC_INVALID_CREATE", "SYNTHETIC_CACHE_SECRET_ONE", first.revision])
  expect(await run(file, undefined, (credentials) => credentials.list(integrationID))).toEqual([created])
  expect(await stored(file, created.id)).toEqual(before)
})

test("CCS02 compare-and-swap preserves binding and labels and refuses stale or cross-ID revisions", async () => {
  expect(Credential.Cache).toBeDefined()
  const file = filename("replace")
  const created = await run(file, undefined, (credentials) => credentials.create({ integrationID, label: "Original",
    value: cache("SYNTHETIC_CACHE_SECRET_OLD") }))
  const first = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(first?.mode).toBe("owned")
  if (first?.mode !== "owned") return
  await run(file, undefined, (credentials) => credentials.update(created.id, { label: "Renamed" }))
  const renamed = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(renamed?.mode).toBe("owned")
  if (renamed?.mode !== "owned") return
  expect(renamed.revision).toBe(first.revision)
  expect(renamed.credential.value).toEqual(first.credential.value)
  expect(renamed.credential.integrationID).toBe(integrationID)
  expect(renamed.credential.label).toBe("Renamed")
  const changed = await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: first.revision, value: cache("SYNTHETIC_CACHE_SECRET_NEW") }))
  expect(changed.updated).toBe(true)
  if (!changed.updated) return
  expect(changed.revision).not.toBe(first.revision)
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: first.revision, value: cache("SYNTHETIC_CACHE_SECRET_STALE") }))).toEqual({ updated: false })
  const current = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(current?.mode).toBe("owned")
  if (current?.mode !== "owned") return
  expect(current.revision).toBe(changed.revision)
  expect(current.credential.value).toEqual(cache("SYNTHETIC_CACHE_SECRET_NEW"))
  expect(current.credential.label).toBe("Renamed")
  expect(current.credential.integrationID).toBe(integrationID)
  const unchanged = await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: changed.revision, value: cache("SYNTHETIC_CACHE_SECRET_NEW") }))
  expect(unchanged.updated).toBe(true)
  if (!unchanged.updated) return
  expect(unchanged.revision).not.toBe(changed.revision)
  const identical = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(identical?.mode).toBe("owned")
  if (identical?.mode !== "owned") return
  expect(identical.revision).toBe(unchanged.revision)
  const second = await run(file, undefined, (credentials) => credentials.create({ integrationID, value: cache("second") }))
  // Identical encrypted bytes still cannot make another credential's revision transferable.
  const sealed = await stored(file, created.id)
  expect(sealed).not.toBeNull()
  const { Database } = await import("bun:sqlite")
  const copied = new Database(file)
  copied.run("UPDATE credential SET value = ? WHERE id = ?", [sealed!.value, second.id])
  copied.close()
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: second.id,
    revision: unchanged.revision, value: cache("foreign-revision") }))).toEqual({ updated: false })
  expect((await run(file, undefined, (credentials) => credentials.get(second.id)))?.value).toEqual(cache("SYNTHETIC_CACHE_SECRET_NEW"))
  const before = await stored(file, created.id)
  for (const entry of [
    { value: { ...cache("SYNTHETIC_CACHE_SECRET_INVALID"), version: 0 }, reason: "invalid" },
    { value: { ...cache("SYNTHETIC_CACHE_SECRET_INVALID"), format: "different.cache" }, reason: "binding" },
    { value: { ...cache("SYNTHETIC_CACHE_SECRET_INVALID"), methodID: Integration.MethodID.make("other") }, reason: "binding" },
    { value: { ...cache("SYNTHETIC_CACHE_SECRET_INVALID"), version: 2 }, reason: "binding" },
  ]) {
    const exit = await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
      revision: unchanged.revision, value: entry.value }).pipe(Effect.exit))
    cacheFailure(exit, entry.reason === "invalid" ? "invalid" : "binding", created.id,
      ["SYNTHETIC_CACHE_SECRET_INVALID", "SYNTHETIC_CACHE_SECRET_NEW", unchanged.revision])
    expect(await stored(file, created.id)).toEqual(before)
  }
  for (const revision of ["", "not-a-revision", "x".repeat(16777217), changed.revision]) {
    expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
      revision, value: cache("must-not-write") }))).toEqual({ updated: false })
    expect(await stored(file, created.id)).toEqual(before)
  }
  const invalidUpdate = await run(file, undefined, (credentials) => credentials.update(created.id, {
    value: { ...cache("SYNTHETIC_INVALID_UPDATE"), version: 0 },
  }).pipe(Effect.exit))
  cacheFailure(invalidUpdate, "invalid", created.id, ["SYNTHETIC_INVALID_UPDATE", "SYNTHETIC_CACHE_SECRET_NEW", unchanged.revision])
  expect(await stored(file, created.id)).toEqual(before)
  const resumed = await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: unchanged.revision, value: cache("SYNTHETIC_CACHE_SECRET_NEW") }))
  expect(resumed.updated).toBe(true)
  if (!resumed.updated) return
  await run(file, undefined, (credentials) => credentials.update(created.id, { value: cache("legacy-writer") }))
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: resumed.revision, value: cache("old-refresh") }))).toEqual({ updated: false })
  expect((await run(file, undefined, (credentials) => credentials.get(created.id)))?.value).toEqual(cache("legacy-writer"))
  const legacy = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(legacy?.mode).toBe("owned")
  if (legacy?.mode !== "owned") return
  // Reseal the identical value without changing time_updated: revision must track ciphertext, not time or plaintext.
  const rewritten = new Database(file)
  rewritten.run("UPDATE credential SET value = ? WHERE id = ?", [CredentialCipher.seal(JSON.stringify(cache("legacy-writer"))), created.id])
  rewritten.close()
  const resealed = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(resealed?.mode).toBe("owned")
  if (resealed?.mode !== "owned") return
  expect(resealed.revision).not.toBe(legacy.revision)
  expect(resealed.credential).toEqual(legacy.credential)
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: legacy.revision, value: cache("old-ciphertext") }))).toEqual({ updated: false })
  const missing = Credential.ID.create()
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: missing,
    revision: unchanged.revision, value: cache("no-upsert") }))).toEqual({ updated: false })
  expect(await stored(file, missing)).toBeNull()
  await run(file, undefined, (credentials) => credentials.remove(created.id))
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: unchanged.revision, value: cache("no-resurrection") }))).toEqual({ updated: false })
  expect(await stored(file, created.id)).toBeNull()
})

test("CCS03 independent database clients permit only one writer and retain the winner after reopen", async () => {
  expect(Credential.Cache).toBeDefined()
  const file = filename("concurrent")
  const created = await run(file, undefined, (credentials) => credentials.create({ integrationID, value: cache("initial") }))
  const snapshots = await Promise.all([0, 1].map(() => run(file, undefined, (credentials) => credentials.cache.read(created.id))))
  expect(snapshots[0]).toEqual(snapshots[1])
  const first = snapshots[0]
  expect(first?.mode).toBe("owned")
  if (first?.mode !== "owned") return
  const results = await Promise.all(["writer-a", "writer-b"].map((serialized) => run(file, undefined,
    (credentials) => credentials.cache.compareAndSwap({ id: created.id, revision: first.revision, value: cache(serialized) }))))
  expect(results.filter((result) => result.updated)).toHaveLength(1)
  expect(results.filter((result) => !result.updated)).toHaveLength(1)
  const winner = results.findIndex((result) => result.updated)
  const reopened = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(reopened?.mode).toBe("owned")
  if (reopened?.mode !== "owned") return
  expect(reopened.credential.value).toEqual(cache(winner === 0 ? "writer-a" : "writer-b"))
  expect(reopened.revision).not.toBe(first.revision)
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: first.revision, value: cache("late-error-replacement") }))).toEqual({ updated: false })
  expect(await run(file, undefined, (credentials) => credentials.cache.read(created.id))).toEqual(reopened)
})

test("CCS04 inheritance, unreadable rows and legacy credential families never become writable caches", async () => {
  expect(Credential.Cache).toBeDefined()
  const file = filename("protected")
  const created = await run(file, undefined, (credentials) => credentials.create({ integrationID, value: cache("protected") }))
  const snapshot = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(snapshot?.mode).toBe("owned")
  if (snapshot?.mode !== "owned") return
  const foreign = CredentialCipher.seal(JSON.stringify(cache("different-key")), randomBytes(32))
  const { Database } = await import("bun:sqlite")
  const db = new Database(file)
  db.run("UPDATE credential SET value = ? WHERE id = ?", [foreign, created.id])
  db.close()
  expect(await run(file, undefined, (credentials) => credentials.cache.read(created.id))).toBeUndefined()
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: snapshot.revision, value: cache("must-not-replace") }))).toEqual({ updated: false })
  expect((await stored(file, created.id))?.value).toBe(foreign)
  const tampered = foreign.slice(0, -4) + "AAAA"
  const tamper = new Database(file)
  tamper.run("UPDATE credential SET value = ? WHERE id = ?", [tampered, created.id])
  tamper.close()
  expect(await run(file, undefined, (credentials) => credentials.cache.read(created.id))).toBeUndefined()
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: snapshot.revision, value: cache("must-not-repair-tamper") }))).toEqual({ updated: false })
  expect((await stored(file, created.id))?.value).toBe(tampered)
  const legacy = await run(file, undefined, (credentials) => credentials.create({ integrationID,
    value: Credential.Key.make({ type: "key", key: "synthetic-key" }) }))
  expect(await run(file, undefined, (credentials) => credentials.cache.read(legacy.id))).toBeUndefined()
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: legacy.id,
    revision: snapshot.revision, value: cache("not-a-key") }))).toEqual({ updated: false })
  expect((await run(file, undefined, (credentials) => credentials.get(legacy.id)))?.value).toEqual(legacy.value)
  const oauth = await run(file, undefined, (credentials) => credentials.create({ integrationID,
    value: Credential.OAuth.make({ type: "oauth", methodID: Integration.MethodID.make("existing"),
      access: "synthetic-access", refresh: "synthetic-refresh", expires: 0 }) }))
  expect(await run(file, undefined, (credentials) => credentials.cache.read(oauth.id))).toBeUndefined()
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: oauth.id,
    revision: snapshot.revision, value: cache("not-oauth") }))).toEqual({ updated: false })
  expect((await run(file, undefined, (credentials) => credentials.get(oauth.id)))?.value).toEqual(oauth.value)
  const release = filename("release")
  const inherited = await run(release, undefined, (credentials) => credentials.create({ integrationID, value: cache("inherited") }))
  const releaseSnapshot = await run(release, undefined, (credentials) => credentials.cache.read(inherited.id))
  expect(releaseSnapshot?.mode).toBe("owned")
  if (releaseSnapshot?.mode !== "owned") return
  const dev = filename("dev")
  const inheritedBefore = await stored(release, inherited.id)
  const read = await run(dev, release, (credentials) => credentials.cache.read(inherited.id))
  expect(read?.mode).toBe("inherited")
  if (read?.mode === "inherited") {
    expect(read.source).toBe(release)
    expect(read.credential.value).toEqual(cache("inherited"))
    expect(read).not.toHaveProperty("revision")
  }
  const refused = await run(dev, release, (credentials) => credentials.cache.compareAndSwap({ id: inherited.id,
    revision: releaseSnapshot.revision, value: cache("must-not-refresh-inherited") }).pipe(Effect.exit))
  expect(Exit.isFailure(refused)).toBe(true)
  if (Exit.isFailure(refused)) {
    const reason = refused.cause.reasons[0]
    expect(reason?._tag).toBe("Fail")
    if (reason?._tag === "Fail") expect(reason.error).toBeInstanceOf(Credential.InheritedError)
  }
  expect(await stored(release, inherited.id)).toEqual(inheritedBefore)
  expect(await stored(dev, inherited.id)).toBeNull()
})

test("CCS05 all three writers validate closed cache values without secret-bearing errors", async () => {
  expect(Credential.Cache).toBeDefined()
  const file = filename("validation")
  const created = await run(file, undefined, (credentials) => credentials.create({ integrationID, value: cache("") }))
  const first = await run(file, undefined, (credentials) => credentials.cache.read(created.id))
  expect(first?.mode).toBe("owned")
  if (first?.mode !== "owned") return
  expect(first.credential.value.serialized).toBe("")
  const before = await stored(file, created.id)
  const payloadID = Credential.ID.make("payload-chosen-id")
  for (const value of [
    { ...cache("SYNTHETIC_REJECTED_VALUE"), grant: "forbidden" },
    { ...cache("SYNTHETIC_REJECTED_VALUE"), serialized: "x".repeat(1048577) },
  ]) {
    const input = { id: payloadID, integrationID, value }
    const refused = await run(file, undefined, (credentials) => credentials.create(input).pipe(Effect.exit))
    const error = cacheFailure(refused, "invalid", undefined, [value.serialized, first.revision])
    expect(error.credentialID).not.toBe(payloadID)
    cacheFailure(await run(file, undefined, (credentials) => credentials.update(created.id, { value }).pipe(Effect.exit)),
      "invalid", created.id, [value.serialized, first.revision])
    cacheFailure(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
      revision: first.revision, value }).pipe(Effect.exit)), "invalid", created.id, [value.serialized, first.revision])
    expect(await run(file, undefined, (credentials) => credentials.list(integrationID))).toEqual([created])
    expect(await stored(file, created.id)).toEqual(before)
  }
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: created.id,
    revision: first.revision, value: cache("") })).then((result) => result.updated)).toBe(true)
})

test("CCS06 cache API bounds credential IDs without changing the generic credential contract", async () => {
  expect(Credential.Cache).toBeDefined()
  const file = filename("id-boundaries")
  const { Database } = await import("bun:sqlite")
  for (const text of ["x".repeat(256), "🙂".repeat(128), "🙂".repeat(128) + "x", ""]) {
    const created = await run(file, undefined, (credentials) => credentials.create({ integrationID, value: cache("id-fixture") }))
    const id = Credential.ID.make(text)
    const db = new Database(file)
    db.run("UPDATE credential SET id = ? WHERE id = ?", [id, created.id])
    db.close()
    expect((await run(file, undefined, (credentials) => credentials.get(id)))?.value).toEqual(cache("id-fixture"))
    const before = await stored(file, id)
    const snapshot = await run(file, undefined, (credentials) => credentials.cache.read(id))
    if (text.length > 256 || text.length === 0) {
      expect(snapshot).toBeUndefined()
      expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id,
        revision: "not-a-valid-revision", value: cache("must-not-write") }))).toEqual({ updated: false })
      expect(await stored(file, id)).toEqual(before)
      continue
    }
    expect(snapshot?.mode).toBe("owned")
    if (snapshot?.mode !== "owned") return
    expect(snapshot.credential.id).toBe(id)
    expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id,
      revision: snapshot.revision, value: cache("changed") })).then((result) => result.updated)).toBe(true)
  }
  const before = await run(file, undefined, (credentials) => credentials.all())
  // The static brand does not excuse missing runtime admission at this private boundary.
  const invalid = 42 as never
  expect(await run(file, undefined, (credentials) => credentials.cache.read(invalid))).toBeUndefined()
  expect(await run(file, undefined, (credentials) => credentials.cache.compareAndSwap({ id: invalid,
    revision: "not-a-revision", value: cache("must-not-write") }))).toEqual({ updated: false })
  expect(await run(file, undefined, (credentials) => credentials.all())).toEqual(before)
})
