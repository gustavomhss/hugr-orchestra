import { Database } from "bun:sqlite"
import { afterAll, expect, test } from "bun:test"
import { createHash, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { inspect } from "node:util"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../src/process"
import { LayerNode } from "../src/effect/layer-node"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const root = mkdtempSync(path.join(os.tmpdir(), "orchestra-protected-recovery-"))
afterAll(() => rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined))
const secret = "SYNTHETIC_PROTECTED_CONTEXT_SECRET"
const sealed = () => CredentialCipher.seal(secret, randomBytes(32))
const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex")
const fixture = () => {
  const directory = mkdtempSync(path.join(root, "case-"))
  return { directory, key: path.join(directory, "credential.key"), database: path.join(directory, "orchestra.db"),
    auth: path.join(directory, "mcp-auth.json") }
}
function store(file: string, table: "credential" | "fabric_record", column: "value" | "sealed" | "unrelated", value?: string) {
  const database = new Database(file)
  try {
    database.run(`CREATE TABLE "${table}" ("${column}" TEXT)`)
    if (value !== undefined) database.query(`INSERT INTO "${table}" ("${column}") VALUES (?)`).run(value)
  } finally {
    database.close()
  }
}
async function rejected(operation: Promise<void>, forbidden: readonly string[] = []) {
  const error: unknown = await operation.then(() => undefined, (error: unknown) => error)
  expect(error).toBeInstanceOf(Error)
  if (!(error instanceof Error)) throw new Error("Expected protected-store recovery refusal")
  for (const text of [error.message, String(error), JSON.stringify(error), inspect(error, { showHidden: true, depth: 4, customInspect: false })]) {
    for (const value of [secret, ...forbidden]) expect(text).not.toContain(value)
  }
}

test("KRP01 existing credential and MCP ciphertext refuse replacement keys without touching stored bytes", async () => {
  for (const kind of ["credential", "mcp"] as const) {
    const f = fixture()
    const value = sealed()
    const body = JSON.stringify(value)
    if (kind === "credential") {
      store(f.database, "credential", "value", "legacy plaintext first")
      const database = new Database(f.database)
      database.query("INSERT INTO credential (value) VALUES (?)").run(value)
      database.query("INSERT INTO credential (value) VALUES (?)").run("legacy plaintext last")
      database.close()
    }
    if (kind === "mcp") writeFileSync(f.auth, body)
    const target = kind === "credential" ? f.database : f.auth
    const before = digest(target)
    await rejected(CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [f.auth] }), [value, body])
    expect(existsSync(f.key)).toBe(false)
    expect(digest(target)).toBe(before)
  }
})

test("KRP02 Fabric-only ciphertext is protected even without a credential table", async () => {
  for (const withCredential of [false, true]) {
    const f = fixture()
    if (withCredential) store(f.database, "credential", "value", "legacy credential")
    store(f.database, "fabric_record", "sealed")
    const empty = digest(f.database)
    await CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [] })
    expect(existsSync(f.key)).toBe(false)
    expect(digest(f.database)).toBe(empty)
    const plaintext = new Database(f.database)
    plaintext.query("INSERT INTO fabric_record (sealed) VALUES (?)").run("legacy plaintext")
    plaintext.close()
    const legacy = digest(f.database)
    await CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [] })
    expect(existsSync(f.key)).toBe(false)
    expect(digest(f.database)).toBe(legacy)
    const value = sealed()
    const database = new Database(f.database)
    database.query("INSERT INTO fabric_record (sealed) VALUES (?)").run(value)
    database.query("INSERT INTO fabric_record (sealed) VALUES (?)").run("legacy plaintext last")
    database.close()
    const before = digest(f.database)
    await rejected(CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [] }), [value])
    expect(existsSync(f.key)).toBe(false)
    expect(digest(f.database)).toBe(before)
  }
})

test("KRP03 explicitly selected stores outside the key directory are inspected", async () => {
  for (const kind of ["database", "mcp"] as const) {
    const f = fixture()
    const other = fixture()
    mkdirSync(path.join(f.directory, "keys"))
    const key = path.join(f.directory, "keys", "credential.key")
    const value = sealed()
    const body = JSON.stringify(value)
    store(f.database, "credential", "value", "legacy first store")
    writeFileSync(f.auth, JSON.stringify({ legacy: "plaintext first store" }))
    if (kind === "database") store(other.database, "credential", "value", value)
    if (kind === "mcp") writeFileSync(other.auth, body)
    const target = kind === "database" ? other.database : other.auth
    const before = digest(target)
    const firstDatabase = digest(f.database)
    const firstAuth = digest(f.auth)
    await rejected(CredentialCipher.refuseNewKey(key, {
      databaseFiles: [f.database, other.database], authFiles: [f.auth, other.auth],
    }), [value, body])
    expect(existsSync(key)).toBe(false)
    expect(digest(target)).toBe(before)
    expect(digest(f.database)).toBe(firstDatabase)
    expect(digest(f.auth)).toBe(firstAuth)
  }
})

test("KRP04 recognized tables missing their protected column fail closed", async () => {
  for (const table of ["credential", "fabric_record"] as const) {
    for (const value of [undefined, secret, sealed()]) {
      const f = fixture()
      store(f.database, table, "unrelated", value)
      const before = digest(f.database)
      await rejected(CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [] }),
        value === undefined ? [] : [value])
      expect(existsSync(f.key)).toBe(false)
      expect(digest(f.database)).toBe(before)
    }
  }
})

test("KRP05 absent empty and plaintext stores permit preflight while existing keys stay untouched", async () => {
  for (const value of [undefined, "legacy plaintext"]) {
    const f = fixture()
    store(f.database, "credential", "value", value)
    const database = new Database(f.database)
    database.run("CREATE TABLE fabric_record (sealed TEXT)")
    database.close()
    const before = digest(f.database)
    await CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [f.auth] })
    expect(existsSync(f.key)).toBe(false)
    expect(digest(f.database)).toBe(before)
  }
  for (const entry of [{ table: "credential", column: "value" }, { table: "fabric_record", column: "sealed" }] as const) {
    const extra = fixture()
    store(extra.database, entry.table, entry.column, "legacy plaintext")
    const database = new Database(extra.database)
    database.run(`ALTER TABLE "${entry.table}" ADD COLUMN unrelated TEXT`)
    database.query(`UPDATE "${entry.table}" SET unrelated = ?`).run(sealed())
    database.close()
    const before = digest(extra.database)
    await CredentialCipher.refuseNewKey(extra.key, { databaseFiles: [extra.database], authFiles: [] })
    expect(existsSync(extra.key)).toBe(false)
    expect(digest(extra.database)).toBe(before)
  }
  const decoy = fixture()
  const unrelated = new Database(decoy.database)
  unrelated.run("CREATE TABLE unregistered_example (value TEXT)")
  unrelated.query("INSERT INTO unregistered_example (value) VALUES (?)").run(sealed())
  unrelated.close()
  const decoyBefore = digest(decoy.database)
  await CredentialCipher.refuseNewKey(decoy.key, { databaseFiles: [decoy.database], authFiles: [] })
  expect(existsSync(decoy.key)).toBe(false)
  expect(digest(decoy.database)).toBe(decoyBefore)
  const f = fixture()
  await CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [f.auth] })
  expect(existsSync(f.key)).toBe(false)
  expect(existsSync(f.database)).toBe(false)
  expect(existsSync(f.auth)).toBe(false)
  writeFileSync(f.key, randomBytes(32).toString("base64"), { mode: 0o600 })
  writeFileSync(f.database, secret)
  const before = digest(f.key)
  await CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [] })
  expect(digest(f.key)).toBe(before)
  expect(readFileSync(f.database, "utf8")).toBe(secret)
})

test("KRP06 corrupt SQLite is not mistaken for an empty store or echoed in an error", async () => {
  const f = fixture()
  writeFileSync(f.database, secret)
  const before = digest(f.database)
  await rejected(CredentialCipher.refuseNewKey(f.key, { databaseFiles: [f.database], authFiles: [] }))
  expect(existsSync(f.key)).toBe(false)
  expect(digest(f.database)).toBe(before)
})

const integration = testEffect(LayerNode.compile(AppProcess.node))
integration.live("KRP07 default discovery follows the actual configured profile rather than the key directory", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const processService = yield* AppProcess.Service
  for (const kind of ["database", "release", "mcp"] as const) {
    const f = fixture()
    const selected = fixture()
    const release = path.join(f.directory, "data", "orchestra", "orchestra.db")
    const auth = path.join(f.directory, "data", "orchestra", "mcp-auth.json")
    const temporary = path.join(f.directory, "tmp")
    mkdirSync(path.dirname(auth), { recursive: true })
    mkdirSync(temporary)
    const code = `const { inspect } = await import("node:util");
const { CredentialCipher } = await import(${JSON.stringify(new URL("../src/credential/cipher.ts", import.meta.url).href)});
try { await CredentialCipher.refuseNewKey(${JSON.stringify(f.key)}); process.stdout.write(JSON.stringify({ status: "allowed", errors: [] })); }
catch (error) { process.stdout.write(JSON.stringify({ status: "refused", errors: [String(error), error instanceof Error ? error.message : "", JSON.stringify(error) ?? "", inspect(error, { showHidden: true, depth: 4, customInspect: false })] })); }`
    const run = () => processService.run(ChildProcess.make(process.execPath, ["-e", code], {
      cwd: f.directory, extendEnv: false, stdin: "ignore", stdout: "pipe", stderr: "pipe",
      env: { HOME: f.directory, ORCHESTRA_TEST_HOME: f.directory,
        TMPDIR: temporary, TMP: temporary, TEMP: temporary,
        XDG_DATA_HOME: path.join(f.directory, "data"), XDG_CONFIG_HOME: path.join(f.directory, "config"),
        XDG_CACHE_HOME: path.join(f.directory, "cache"), XDG_STATE_HOME: path.join(f.directory, "state"),
        ORCHESTRA_DB: selected.database, ORCHESTRA_CREDENTIAL_KEY_FILE: f.key },
    }), { timeout: "15 seconds", maxOutputBytes: 8192, maxErrorBytes: 8192 })
    const observed = (result: AppProcess.RunResult) => {
      expect(result.exitCode).toBe(0)
      expect(result.stdoutTruncated).toBe(false)
      expect(result.stderrTruncated).toBe(false)
      return Schema.decodeUnknownSync(Schema.Struct({
        status: Schema.Literals(["allowed", "refused"]), errors: Schema.Array(Schema.String),
      }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(result.stdout.toString()))
    }
    const absent = yield* run()
    expect(observed(absent)).toEqual({ status: "allowed", errors: [] })
    store(selected.database, "credential", "value", "legacy plaintext")
    if (kind === "release") store(release, "credential", "value", "release legacy plaintext")
    if (kind === "mcp") writeFileSync(auth, JSON.stringify({ legacy: "plaintext" }))
    const plaintext = yield* run()
    expect(observed(plaintext)).toEqual({ status: "allowed", errors: [] })
    const value = sealed()
    const body = JSON.stringify(value)
    if (kind === "database" || kind === "release") {
      const database = new Database(kind === "database" ? selected.database : release)
      database.query("UPDATE credential SET value = ?").run(value)
      database.close()
    }
    if (kind === "mcp") writeFileSync(auth, body)
    const target = kind === "database" ? selected.database : kind === "release" ? release : auth
    const before = digest(target)
    const protectedResult = yield* run()
    expect(observed(protectedResult).status).toBe("refused")
    for (const text of [...observed(protectedResult).errors, protectedResult.stdout.toString(), protectedResult.stderr.toString()]) {
      for (const forbidden of [secret, value, body]) expect(text).not.toContain(forbidden)
    }
    expect(existsSync(f.key)).toBe(false)
    expect(digest(target)).toBe(before)
  }
}), 60000)
