import { afterAll, expect, test } from "bun:test"
import { createDecipheriv, randomBytes } from "node:crypto"
import { mkdtemp, rm, utimes } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CredentialCipher } from "../src/credential/cipher"
import { CredentialKeychain } from "../src/credential/keychain"
import { Flock } from "../src/util/flock"
import { Hash } from "../src/util/hash"

const root = await mkdtemp(path.join(os.tmpdir(), "orchestra-keychain-"))
afterAll(() => rm(root, { recursive: true, force: true }))

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function decrypt(text: string, key: Buffer) {
  const raw = Buffer.from(text.slice(CredentialCipher.PREFIX.length), "base64")
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
}

test("independent first starts retain both ciphertexts after a fresh keychain reload", async () => {
  const entered = gate()
  const resume = gate()
  let stored: string | null = null
  let sets = 0
  let reads = 0
  let creates = 0
  const store = {
    get: async () => { reads++; return stored },
    set: async (value: string) => { sets++; stored = value },
  }
  const options = {
    store, dir: path.join(root, "race"),
    beforeCreate: async () => {
      if (++creates !== 1) return
      entered.resolve()
      await resume.promise
    },
  }
  const first = CredentialKeychain.load(options)
  await entered.promise
  // Model a paused live owner whose heartbeat is old while its native operation is outstanding.
  const old = new Date(Date.now() - 120_000)
  await utimes(path.join(options.dir, Hash.fast(CredentialKeychain.identity.key) + ".lock", "heartbeat"), old, old)
    .catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error })
  const contended = gate()
  const second = CredentialKeychain.load({ ...options, onWait: () => contended.resolve() })
  // Both initializers have started, but only the lease holder may inspect/create the entry.
  // Under the original unlocked implementation the contender completes instead; let it expose divergent keys.
  await Promise.race([contended.promise, second.then(() => {})])
  resume.resolve()
  const keys = await Promise.all([first, second])
  const ciphertexts = keys.map((key, i) => CredentialCipher.seal(`secret-${i}`, key))
  const reloaded = await CredentialKeychain.load(options)
  expect(ciphertexts.map((text) => decrypt(text, reloaded))).toEqual(["secret-0", "secret-1"])
  expect(reads).toBe(4)
  expect(sets).toBe(1)
})

test("existing key is never replaced", async () => {
  const stored = randomBytes(32)
  const key = await CredentialKeychain.load({
    dir: path.join(root, "existing"),
    store: { get: async () => stored.toString("base64"), set: async () => { throw new Error("must not set") } },
    beforeCreate: async () => { throw new Error("must not create") },
  })
  expect(key).toEqual(stored)
})

test("creation failure and cancellation release the lease without a late replacement", async () => {
  const dir = path.join(root, "release")
  const options = { dir, beforeCreate: async () => {} }
  await expect(CredentialKeychain.load({ ...options, store: {
    get: async () => null, set: async () => { throw new Error("store failed") },
  } })).rejects.toThrow("store failed")
  const entered = gate()
  const resume = gate()
  const contended = gate()
  const controller = new AbortController()
  let stored: string | null = null
  let reads = 0
  let sets = 0
  const store = {
    get: async () => { reads++; return stored },
    set: async (value: string) => {
      sets++
      entered.resolve()
      await resume.promise
      stored = value
    },
  }
  const canceled = CredentialKeychain.load({ ...options, signal: controller.signal, store })
    .then(() => undefined, (error: unknown) => error)
  await entered.promise
  controller.abort(new Error("canceled"))
  const second = CredentialKeychain.load({ ...options, store, onWait: () => contended.resolve() })
  await contended.promise
  expect(reads).toBe(1)
  expect(sets).toBe(1)
  resume.resolve()
  expect(await canceled).toEqual(new Error("canceled"))
  const key = await second
  const text = CredentialCipher.seal("after cancellation", key)
  const reloaded = await CredentialKeychain.load({ ...options, store })
  expect(decrypt(text, reloaded)).toBe("after cancellation")
  expect(sets).toBe(1)
})

test("missing key with sealed data refuses creation and releases the lease", async () => {
  const dir = path.join(root, "refuse")
  await expect(CredentialKeychain.load({ dir,
    beforeCreate: async () => { throw new Error("restore missing key") },
    store: { get: async () => null, set: async () => { throw new Error("must not set") } },
  })).rejects.toThrow("restore missing key")
  const lease = await Flock.acquire(CredentialKeychain.identity.key, { dir, timeoutMs: 100 })
  await lease.release()
})

test("keychain lock identity uses the user home, independently of profile data locations", () => {
  expect(CredentialKeychain.identity).toEqual({
    key: "ai.hugr.orchestra:credential-key",
    dir: path.join(os.homedir(), ".orchestra", "locks"),
  })
})

test("contended initialization times out or cancels without touching the keychain", async () => {
  const dir = path.join(root, "wait")
  const lease = await Flock.acquire(CredentialKeychain.identity.key, { dir })
  const store = {
    get: async (): Promise<string | null> => { throw new Error("must not read") },
    set: async () => { throw new Error("must not set") },
  }
  const options = { dir, store, beforeCreate: async () => {} }
  try {
    await expect(CredentialKeychain.load({ ...options, timeoutMs: 1 })).rejects.toThrow("Timed out waiting")
    const controller = new AbortController()
    const waiting = CredentialKeychain.load({ ...options, signal: controller.signal })
    controller.abort(new Error("stop waiting"))
    await expect(waiting).rejects.toThrow("stop waiting")
  } finally {
    await lease.release()
  }
})
