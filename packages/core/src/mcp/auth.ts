import { LayerNode } from "../effect/layer-node"
import path from "path"
import { serviceUse } from "../effect/service-use"
import { Global } from "../global"
import { Effect, Layer, Context, Option, Schema } from "effect"
import { FSUtil } from "../fs-util"
import { EffectFlock } from "../util/effect-flock"
import { CredentialCipher } from "../credential/cipher"

export const Tokens = Schema.Struct({
  accessToken: Schema.mutableKey(Schema.String),
  refreshToken: Schema.mutableKey(Schema.optional(Schema.String)),
  expiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),
  scope: Schema.mutableKey(Schema.optional(Schema.String)),
})
export type Tokens = Schema.Schema.Type<typeof Tokens>

export const ClientInfo = Schema.Struct({
  clientId: Schema.mutableKey(Schema.String),
  clientSecret: Schema.mutableKey(Schema.optional(Schema.String)),
  clientIdIssuedAt: Schema.mutableKey(Schema.optional(Schema.Number)),
  clientSecretExpiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),
})
export type ClientInfo = Schema.Schema.Type<typeof ClientInfo>

export const Entry = Schema.Struct({
  tokens: Schema.mutableKey(Schema.optional(Tokens)),
  clientInfo: Schema.mutableKey(Schema.optional(ClientInfo)),
  codeVerifier: Schema.mutableKey(Schema.optional(Schema.String)),
  oauthState: Schema.mutableKey(Schema.optional(Schema.String)),
  serverUrl: Schema.mutableKey(Schema.optional(Schema.String)),
})
export type Entry = Schema.Schema.Type<typeof Entry>

const decodeAuthData = Schema.decodeUnknownOption(Schema.Record(Schema.String, Entry))
const decodeAuthJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Entry)))
type AuthData = Record<string, Entry>

/** The auth file is sealed under a key this process could not load. */
class LockedError extends Schema.TaggedErrorClass<LockedError>()("McpAuthLockedError", {}) {}

const filepath = path.join(Global.Path.data, "mcp-auth.json")
const lockKey = `mcp-auth:${filepath}`

export interface Interface {
  readonly all: () => Effect.Effect<Record<string, Entry>>
  readonly get: (mcpName: string) => Effect.Effect<Entry | undefined>
  readonly getForUrl: (mcpName: string, serverUrl: string) => Effect.Effect<Entry | undefined>
  readonly set: (mcpName: string, entry: Entry, serverUrl?: string) => Effect.Effect<void>
  readonly remove: (mcpName: string) => Effect.Effect<void>
  readonly updateTokens: (mcpName: string, tokens: Tokens, serverUrl?: string) => Effect.Effect<void>
  readonly updateClientInfo: (mcpName: string, clientInfo: ClientInfo, serverUrl?: string) => Effect.Effect<void>
  readonly updateCodeVerifier: (mcpName: string, codeVerifier: string) => Effect.Effect<void>
  readonly clearCodeVerifier: (mcpName: string) => Effect.Effect<void>
  readonly updateOAuthState: (mcpName: string, oauthState: string) => Effect.Effect<void>
  readonly getOAuthState: (mcpName: string) => Effect.Effect<string | undefined>
  readonly clearOAuthState: (mcpName: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/McpAuth") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const flock = yield* EffectFlock.Service
    const cipher = yield* CredentialCipher.Service

    const write = (data: AuthData) => fs.writeJson(filepath, cipher.seal(JSON.stringify(data)), 0o600)

    // The file holds one sealed JSON string; a plain object is a file written before encryption, which is read and
    // sealed in place. A file that cannot be parsed or decodes to the wrong shape is moved aside, never overwritten,
    // so a later write cannot wipe every MCP login. A sealed file no loaded key opens (the keychain prompt was declined
    // or timed out, so this process fell back to the key file) is left in place and the read fails, so no write
    // replaces it. Any other read failure stops here instead of reading as empty.
    const read = Effect.fn("McpAuth.read")(function* () {
      const file = yield* fs.readJson(filepath).pipe(
        Effect.map((json) => {
          if (typeof json !== "string") return { legacy: true, locked: false, data: decodeAuthData(json) }
          const plain = CredentialCipher.isSealed(json) ? cipher.open(json) : undefined
          return {
            legacy: false,
            locked: CredentialCipher.isSealed(json) && plain === undefined,
            data: Option.flatMap(Option.fromUndefinedOr(plain), decodeAuthJson),
          }
        }),
        Effect.catchReason("PlatformError", "NotFound", () =>
          Effect.succeed({ legacy: false, locked: false, data: Option.some<AuthData>({}) }),
        ),
        Effect.catchTag("FileSystemError", () =>
          Effect.succeed({ legacy: false, locked: false, data: Option.none<AuthData>() }),
        ),
      )
      if (file.locked) {
        yield* Effect.logError(
          "mcp-auth.json is encrypted with a key this process could not load; it is left untouched. Restart Orchestra and allow the keychain prompt",
          { path: filepath },
        )
        return yield* new LockedError()
      }
      if (Option.isNone(file.data)) {
        const aside = `${filepath}.corrupt-${Date.now()}`
        yield* fs.rename(filepath, aside)
        yield* Effect.logError("mcp-auth.json could not be read and was moved aside; MCP servers need a new login", {
          path: aside,
        })
        return {} as AuthData
      }
      const data: AuthData = { ...file.data.value }
      if (file.legacy) yield* write(data)
      return data
    })

    const all = Effect.fn("McpAuth.all")(function* () {
      // A locked file reads as no logins; writes still fail, so the file is never replaced.
      return yield* read().pipe(
        Effect.catchTag("McpAuthLockedError", () => Effect.succeed({} as AuthData)),
        flock.withLock(lockKey),
        Effect.orDie,
      )
    })

    const mutate = Effect.fn("McpAuth.mutate")(function* (update: (data: AuthData) => AuthData | undefined) {
      yield* Effect.gen(function* () {
        const next = update(yield* read())
        if (!next) return
        yield* write(next).pipe(Effect.orDie)
      }).pipe(flock.withLock(lockKey), Effect.orDie)
    })

    const get = Effect.fn("McpAuth.get")(function* (mcpName: string) {
      const data = yield* all()
      return data[mcpName]
    })

    const getForUrl = Effect.fn("McpAuth.getForUrl")(function* (mcpName: string, serverUrl: string) {
      const entry = yield* get(mcpName)
      if (!entry) return undefined
      if (!entry.serverUrl) return undefined
      if (entry.serverUrl !== serverUrl) return undefined
      return entry
    })

    const set = Effect.fn("McpAuth.set")(function* (mcpName: string, entry: Entry, serverUrl?: string) {
      yield* mutate((data) => ({
        ...data,
        [mcpName]: serverUrl ? { ...entry, serverUrl } : entry,
      }))
    })

    const remove = Effect.fn("McpAuth.remove")(function* (mcpName: string) {
      yield* mutate((data) => {
        const next = { ...data }
        delete next[mcpName]
        return next
      })
    })

    const updateField = <K extends keyof Entry>(field: K, spanName: string) =>
      Effect.fn(`McpAuth.${spanName}`)(function* (mcpName: string, value: NonNullable<Entry[K]>, serverUrl?: string) {
        yield* mutate((data) => {
          const entry = data[mcpName] ?? {}
          entry[field] = value
          if (serverUrl) entry.serverUrl = serverUrl
          return { ...data, [mcpName]: entry }
        })
      })

    const clearField = (field: keyof Entry, spanName: string) =>
      Effect.fn(`McpAuth.${spanName}`)(function* (mcpName: string) {
        yield* mutate((data) => {
          const entry = data[mcpName]
          if (!entry) return undefined
          delete entry[field]
          return { ...data, [mcpName]: entry }
        })
      })

    const updateTokens = updateField("tokens", "updateTokens")
    const updateClientInfo = updateField("clientInfo", "updateClientInfo")
    const updateCodeVerifier = updateField("codeVerifier", "updateCodeVerifier")
    const updateOAuthState = updateField("oauthState", "updateOAuthState")
    const clearCodeVerifier = clearField("codeVerifier", "clearCodeVerifier")
    const clearOAuthState = clearField("oauthState", "clearOAuthState")

    const getOAuthState = Effect.fn("McpAuth.getOAuthState")(function* (mcpName: string) {
      const entry = yield* get(mcpName)
      return entry?.oauthState
    })

    return Service.of({
      all,
      get,
      getForUrl,
      set,
      remove,
      updateTokens,
      updateClientInfo,
      updateCodeVerifier,
      clearCodeVerifier,
      updateOAuthState,
      getOAuthState,
      clearOAuthState,
    })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [FSUtil.node, EffectFlock.node, CredentialCipher.node] })

export * as McpAuth from "./auth"
