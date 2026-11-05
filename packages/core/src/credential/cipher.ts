export * as CredentialCipher from "./cipher"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Context, Effect, Layer, Option } from "effect"
import { makeGlobalNode } from "../effect/app-node"
import { Flag } from "../flag/flag"

/**
 * Secrets at rest (stored credentials, MCP OAuth tokens) are sealed with AES-256-GCM under one 32-byte data key.
 * The key lives in the OS keychain; without one it lives in a 0600 key file in the data directory. Sealed text is
 * `enc:v1:` plus base64 of iv, auth tag and ciphertext, so plaintext written before encryption stays readable.
 *
 * The key is process-wide state because the credential column seals and opens synchronously inside drizzle's row
 * mapping. The layer loads it; without the layer only ORCHESTRA_CREDENTIAL_KEY_FILE can supply it.
 */
export const PREFIX = "enc:v1:"
const KEYCHAIN = { service: "ai.hugr.orchestra", name: "credential-key" }

// The first key seals; every key is tried when opening, so rows sealed under the key-file fallback stay readable
// once the keychain answers again.
let loaded: Buffer[] | undefined

export const isSealed = (text: string) => text.startsWith(PREFIX)

export function seal(plain: string, key = keys()[0]) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")
}

/** Returns the plaintext, or undefined when no loaded key opens the sealed text. */
export function open(text: string) {
  const raw = Buffer.from(text.slice(PREFIX.length), "base64")
  return keys().reduce<string | undefined>((plain, key) => plain ?? attempt(key, raw), undefined)
}

export interface Interface {
  readonly seal: (plain: string) => string
  readonly open: (text: string) => string | undefined
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/CredentialCipher") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    if (!loaded) loaded = yield* load()
    return Service.of({ seal: (plain) => seal(plain), open })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })

function load() {
  return Effect.gen(function* () {
    const file = Flag.ORCHESTRA_CREDENTIAL_KEY_FILE
    if (file) {
      yield* Effect.promise(() => refuseNewKey(file))
      return [fileKey(file)]
    }
    const { Global } = yield* Effect.promise(() => import("../global"))
    const fallback = path.join(Global.Path.data, "credential.key")
    const keychain = yield* Effect.tryPromise(() => keychainKey()).pipe(Effect.timeout("10 seconds"), Effect.option)
    if (Option.isSome(keychain)) return [keychain.value, ...(existsSync(fallback) ? [fileKey(fallback)] : [])]
    yield* Effect.logWarning(
      "OS keychain unavailable: stored credentials are encrypted with a key file in the data directory, which is weaker",
      { path: fallback },
    )
    yield* Effect.promise(() => refuseNewKey(fallback))
    return [fileKey(fallback)]
  })
}

type ProtectedStores = Readonly<{ databaseFiles: readonly string[]; authFiles: readonly string[] }>

/**
 * Refuse replacement keys when protected stores contain sealed data or cannot be inspected.
 * Optional paths are trusted host selections only; otherwise inspect the active/release DBs and profile MCP auth.
 */
export async function refuseNewKey(file: string, selected?: ProtectedStores): Promise<void> {
  if (existsSync(file)) return
  try {
    const stores = selected
      ? { databaseFiles: [...selected.databaseFiles], authFiles: [...selected.authFiles] }
      : await defaultProtectedStores()
    if (!(await hasSealedData(stores))) return
  } catch {
    // Driver and filesystem errors can contain store contents; never attach the original error.
    throw new Error(
      `Cannot inspect protected stores while credential key file ${file} is missing. Restore access to the stores and the key file or OS keychain entry; a new key is not created.`,
    )
  }
  throw new Error(
    `The credential key file ${file} is missing, but protected stores contain encrypted data. Restore the key file or the OS keychain entry; a new key is not created because it could not open them.`,
  )
}

async function defaultProtectedStores(): Promise<ProtectedStores> {
  const { Global } = await import("../global")
  const { DatabaseFilename } = await import("../database/filename")
  return {
    databaseFiles: [...new Set([DatabaseFilename.path(), DatabaseFilename.releasePath()])].filter((file) => file !== ":memory:"),
    authFiles: [path.join(Global.Path.data, "mcp-auth.json")],
  }
}

async function hasSealedData(stores: ProtectedStores) {
  const sealed: boolean[] = []
  for (const file of new Set(stores.authFiles)) {
    if (!statSync(file, { throwIfNoEntry: false })) continue
    sealed.push(readFileSync(file, "utf8").includes(`"${PREFIX}`))
  }
  for (const file of new Set(stores.databaseFiles)) {
    if (file === ":memory:" || !statSync(file, { throwIfNoEntry: false })) continue
    if (typeof Bun === "undefined") throw new Error("Protected database inspection needs the Bun runtime")
    const { Database } = await import("bun:sqlite")
    const sqlite = new Database(file, { readonly: true })
    try {
      // This register protects exact pairs, not arbitrary columns or tables containing ciphertext.
      for (const entry of [
        { table: "credential", column: "value" },
        { table: "fabric_record", column: "sealed" },
      ] as const) {
        if (!sqlite.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(entry.table)) continue
        // SQLite may interpret a quoted missing column as a string literal; validate metadata first.
        if (
          !sqlite.query<{ name: string }, []>(`PRAGMA table_info("${entry.table}")`).all().some((column) => column.name === entry.column)
        ) {
          throw new Error("The protected store schema cannot be inspected")
        }
        sealed.push(
          sqlite.query(`SELECT 1 FROM "${entry.table}" WHERE "${entry.column}" LIKE ? LIMIT 1`).get(`${PREFIX}%`) !== null,
        )
      }
    } finally {
      sqlite.close()
    }
  }
  return sealed.some(Boolean)
}

function keys() {
  if (loaded) return loaded
  const file = Flag.ORCHESTRA_CREDENTIAL_KEY_FILE
  if (!file) throw new Error("The credential key is not loaded; build the CredentialCipher layer first")
  loaded = [fileKey(file)]
  return loaded
}

async function keychainKey() {
  if (typeof Bun === "undefined") throw new Error("The OS keychain needs the Bun runtime")
  // Linux keychains are the Secret Service on the D-Bus session bus; without a bus (headless, CI, bare WSL) the
  // native lookup can stall for a long time before it fails, so skip it and use the key file.
  if (process.platform === "linux" && !process.env.DBUS_SESSION_BUS_ADDRESS) throw new Error("No Secret Service session bus")
  const stored = await Bun.secrets.get(KEYCHAIN)
  if (stored) return decodeKey(stored)
  await Bun.secrets.set({ ...KEYCHAIN, value: randomBytes(32).toString("base64") })
  // Read back so two first starts racing on the same keychain entry converge on the value that won.
  const created = await Bun.secrets.get(KEYCHAIN)
  if (!created) throw new Error("The OS keychain did not keep the credential key")
  return decodeKey(created)
}

function fileKey(file: string) {
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true })
    // "wx" never replaces a key another process created first.
    try {
      writeFileSync(file, randomBytes(32).toString("base64"), { mode: 0o600, flag: "wx" })
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error
    }
  }
  return decodeKey(readFileSync(file, "utf8"))
}

function decodeKey(text: string) {
  const key = Buffer.from(text.trim(), "base64")
  if (key.length !== 32) throw new Error("The credential key is not 32 bytes")
  return key
}

function attempt(key: Buffer, raw: Buffer) {
  // A wrong key, tampered data or a truncated envelope fails here, mostly at the GCM tag check.
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12))
    decipher.setAuthTag(raw.subarray(12, 28))
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")
  } catch {
    return undefined
  }
}
