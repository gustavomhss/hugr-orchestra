export * as McpIdentity from "./identity"

import path from "node:path"
import { createHmac, randomBytes } from "node:crypto"
import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  writeSync,
} from "node:fs"
import type { ConfigMCP } from "@orchestra/schema/config-mcp"
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { CredentialCipher } from "../credential/cipher"
import { makeGlobalNode } from "../effect/app-node"
import { Global } from "../global"
import { EffectFlock } from "../util/effect-flock"

export type Authority =
  | {
      readonly kind: "configured"
      readonly source: string
      readonly name: string
      readonly directory: string
      readonly server: ConfigMCP.Local | ConfigMCP.Remote
    }
  | { readonly kind: "provided"; readonly name: string; readonly key: string }

export class IdentityError extends Schema.TaggedErrorClass<IdentityError>()("McpIdentity.IdentityError", {}) {
  override get message() {
    return "MCP tool identity unavailable"
  }
}

export interface Interface {
  readonly identify: (
    authority: Authority,
    rawToolName: string,
  ) => Effect.Effect<{ id: string; origin: Redacted.Redacted<string> }, IdentityError>
}
export class Service extends Context.Service<Service, Interface>()("@orchestra/McpIdentity") {}

type Options = {
  readonly filename?: string
  readonly digest?: (canonical: string, seed: Redacted.Redacted<Uint8Array>) => string
}
const decodeSeed = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ version: Schema.Literal(1), seed: Schema.String })),
)
const MAX_SEED_BYTES = 4096

export const layerWith = (options: Options = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const global = yield* Global.Service
      const cipher = yield* CredentialCipher.Service
      const flock = yield* EffectFlock.Service
      const filename = options.filename ?? path.join(global.data, "mcp-tool-identity.key")
      const digest =
        options.digest ??
        ((canonical: string, seed: Redacted.Redacted<Uint8Array>) =>
          createHmac("sha256", Redacted.value(seed)).update(canonical).digest("base64url"))
      return Service.of({
        identify: (authority, rawToolName) =>
          Effect.gen(function* () {
            const canonical = yield* Effect.try({
              try: () => JSON.stringify(normalize([1, project(authority), rawToolName])),
              catch: () => new IdentityError(),
            })
            return yield* Effect.try({
              try: () => {
                // Started IO is synchronous and bounded: interruption cannot release the file lock during a partial write.
                const seed = loadSeed(filename, cipher)
                const value = digest(canonical, seed)
                if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new IdentityError()
                return { id: `mcp_${value}`, origin: Redacted.make(canonical) }
              },
              catch: () => new IdentityError(),
            }).pipe(
              flock.withLock(`mcp-tool-identity:${path.resolve(filename)}`),
              Effect.mapError(() => new IdentityError()),
            )
          }),
      })
    }),
  )

export const node = makeGlobalNode({
  service: Service,
  layer: layerWith(),
  deps: [Global.node, CredentialCipher.node, EffectFlock.node],
})

function project(authority: Authority) {
  if (authority.kind === "provided") return { kind: authority.kind, name: authority.name, key: authority.key }
  if (authority.kind !== "configured") throw new IdentityError()
  const server = authority.server
  return {
    kind: authority.kind,
    source: authority.source,
    name: authority.name,
    server:
      server.type === "local"
        ? {
            type: server.type,
            command: server.command,
            cwd: path.resolve(authority.directory, server.cwd ?? "."),
            environment: server.environment,
          }
        : server.type === "remote"
          ? {
              type: server.type,
              url: server.url,
              headers: server.headers,
              oauth:
                server.oauth === false
                  ? false
                  : server.oauth === undefined
                    ? undefined
                    : {
                        client_id: server.oauth.client_id,
                        client_secret: server.oauth.client_secret,
                        scope: server.oauth.scope,
                        callback_port: server.oauth.callback_port,
                        redirect_uri: server.oauth.redirect_uri,
                      },
            }
          : invalid(),
  }
}

function invalid(): never {
  throw new IdentityError()
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : invalid()
  if (Array.isArray(value)) return Array.from(value, normalize)
  if (
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  )
    return invalid()
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => [key, normalize(value)]),
  )
}

function loadSeed(filename: string, cipher: CredentialCipher.Interface): Redacted.Redacted<Uint8Array> {
  if (existsSync(filename)) return readSeed(filename, cipher)
  mkdirSync(path.dirname(filename), { recursive: true })
  const descriptor = (() => {
    try {
      return openSync(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") return undefined
      throw error
    }
  })()
  if (descriptor === undefined) return readSeed(filename, cipher)
  try {
    const seed = randomBytes(32)
    const record = Buffer.from(cipher.seal(JSON.stringify({ version: 1, seed: seed.toString("base64") })))
    let offset = 0
    while (offset < record.length) {
      const count = writeSync(descriptor, record, offset, record.length - offset)
      if (!count) throw new IdentityError()
      offset += count
    }
    fsyncSync(descriptor)
    return Redacted.make(seed)
  } finally {
    closeSync(descriptor)
  }
}

function readSeed(filename: string, cipher: CredentialCipher.Interface): Redacted.Redacted<Uint8Array> {
  const before = lstatSync(filename)
  if (!before.isFile() || before.isSymbolicLink()) throw new IdentityError()
  const descriptor = openSync(filename, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW))
  try {
    const actual = fstatSync(descriptor)
    const after = lstatSync(filename)
    if (
      !actual.isFile() ||
      !after.isFile() ||
      after.isSymbolicLink() ||
      actual.dev !== before.dev ||
      actual.ino !== before.ino ||
      actual.dev !== after.dev ||
      actual.ino !== after.ino ||
      actual.size === 0 ||
      actual.size > MAX_SEED_BYTES ||
      (process.platform !== "win32" && (actual.mode & 0o077) !== 0)
    )
      throw new IdentityError()
    const bytes = Buffer.alloc(MAX_SEED_BYTES + 1)
    let length = 0
    while (length < bytes.length) {
      const count = readSync(descriptor, bytes, length, bytes.length - length, length)
      if (!count) break
      length += count
    }
    if (length !== actual.size) throw new IdentityError()
    const sealed = bytes.subarray(0, length).toString("utf8")
    if (!CredentialCipher.isSealed(sealed)) throw new IdentityError()
    const plain = cipher.open(sealed)
    const decoded = plain === undefined ? Option.none() : decodeSeed(plain)
    if (Option.isNone(decoded)) throw new IdentityError()
    const seed = Buffer.from(decoded.value.seed, "base64")
    if (seed.length !== 32 || seed.toString("base64") !== decoded.value.seed) throw new IdentityError()
    return Redacted.make(seed)
  } finally {
    closeSync(descriptor)
  }
}
