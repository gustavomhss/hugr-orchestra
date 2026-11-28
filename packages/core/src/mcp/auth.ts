import { LayerNode } from "../effect/layer-node"
import path from "path"
import { serviceUse } from "../effect/service-use"
import { Global } from "../global"
import { Effect, Layer, Context, Option, Schema } from "effect"
import { FSUtil } from "../fs-util"
import { EffectFlock } from "../util/effect-flock"
import { CredentialCipher } from "../credential/cipher"

export const Tokens = Schema.Struct({
  issuer: Schema.mutableKey(Schema.optional(Schema.Unknown)),
  accessToken: Schema.mutableKey(Schema.String),
  refreshToken: Schema.mutableKey(Schema.optional(Schema.String)),
  expiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),
  scope: Schema.mutableKey(Schema.optional(Schema.String)),
})
export type Tokens = Schema.Schema.Type<typeof Tokens>

export const ClientInfo = Schema.Struct({
  issuer: Schema.mutableKey(Schema.optional(Schema.Unknown)),
  source: Schema.mutableKey(Schema.optional(Schema.Unknown)),
  clientId: Schema.mutableKey(Schema.String),
  clientSecret: Schema.mutableKey(Schema.optional(Schema.String)),
  clientIdIssuedAt: Schema.mutableKey(Schema.optional(Schema.Number)),
  clientSecretExpiresAt: Schema.mutableKey(Schema.optional(Schema.Number)),
})
export type ClientInfo = Schema.Schema.Type<typeof ClientInfo>

export const StaticClientBinding = Schema.Struct({ clientId: Schema.String, issuer: Schema.String })
export type StaticClientBinding = Schema.Schema.Type<typeof StaticClientBinding>

export const Entry = Schema.Struct({
  issuer: Schema.mutableKey(Schema.optional(Schema.Unknown)),
  generation: Schema.mutableKey(Schema.optional(Schema.Unknown)),
  removed: Schema.mutableKey(Schema.optional(Schema.Boolean)),
  staticClientBinding: Schema.mutableKey(Schema.optional(Schema.Unknown)),
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

export type Binding = { readonly name: string; readonly serverUrl: string; readonly generation: string }
export type StampedTokens = Omit<Tokens, "issuer"> & { issuer: string }
export type StampedClientInfo = Omit<ClientInfo, "issuer" | "source"> & {
  issuer: string
  source: "dynamic" | "configured"
}
export type BoundEntry = Omit<Entry, "issuer" | "generation" | "tokens" | "clientInfo" | "staticClientBinding"> & {
  issuer?: string
  generation: string
  tokens?: StampedTokens
  clientInfo?: StampedClientInfo
  staticClientBinding?: StaticClientBinding
}
export type Patch = {
  issuer?: string
  tokens?: StampedTokens
  clientInfo?: StampedClientInfo
  codeVerifier?: string
  oauthState?: string
}

export class ReauthRequired extends Schema.TaggedErrorClass<ReauthRequired>()("McpReauthRequired", {}) {
  override get message() {
    return "MCP authentication must be renewed"
  }
}

export function issuerUrl(value: unknown) {
  if (typeof value !== "string" || !value || !URL.canParse(value)) return undefined
  const url = new URL(value)
  return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined
}

export function sameIssuer(a: unknown, b: unknown) {
  const first = issuerUrl(a)
  const second = issuerUrl(b)
  return (
    first !== undefined &&
    second !== undefined &&
    (first === second ||
      (first.endsWith("/") && first.slice(0, -1) === second) ||
      (second.endsWith("/") && second.slice(0, -1) === first))
  )
}

export interface Interface {
  readonly all: () => Effect.Effect<Record<string, Entry>>
  readonly get: (name: string) => Effect.Effect<Entry | undefined>
  readonly getForUrl: (name: string, serverUrl: string) => Effect.Effect<Entry | undefined>
  readonly checkout: (name: string, serverUrl: string) => Effect.Effect<Binding, ReauthRequired>
  readonly begin: (
    name: string,
    serverUrl: string,
  ) => Effect.Effect<
    { binding: Binding; previousState?: string; staticClientBinding?: StaticClientBinding },
    ReauthRequired
  >
  readonly readBinding: (binding: Binding) => Effect.Effect<BoundEntry, ReauthRequired>
  readonly updateBinding: (binding: Binding, patch: Patch) => Effect.Effect<void, ReauthRequired>
  readonly invalidateBinding: (
    binding: Binding,
    type: "all" | "client" | "tokens",
  ) => Effect.Effect<void, ReauthRequired>
  readonly consumeState: (binding: Binding, expectedState: string) => Effect.Effect<void, ReauthRequired>
  readonly commitBinding: (binding: Binding, entry: Patch) => Effect.Effect<void, ReauthRequired>
  readonly remove: (name: string) => Effect.Effect<{ previousState?: string }>
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

    // Validation and publication share the same cross-instance file lock, including read-only lease checks.
    const mutate = <A>(update: (data: AuthData) => { next?: AuthData; value: A }) =>
      Effect.gen(function* () {
        const data = yield* read().pipe(Effect.orDie)
        const result = yield* Effect.try({ try: () => update(data), catch: () => new ReauthRequired() })
        if (result.next) yield* write(result.next).pipe(Effect.orDie)
        return result.value
      }).pipe(
        flock.withLock(lockKey),
        Effect.catchTag("LockTimeoutError", Effect.die),
        Effect.catchTag("LockCompromisedError", Effect.die),
      )

    const pin = Schema.decodeUnknownOption(StaticClientBinding)
    const staticBinding = (entry: Entry) => {
      if (entry.staticClientBinding === undefined) return undefined
      const decoded = pin(entry.staticClientBinding)
      if (Option.isNone(decoded) || !issuerUrl(decoded.value.issuer) || !decoded.value.clientId)
        throw new ReauthRequired()
      return decoded.value
    }
    // Unknown is restricted to the new on-disk stamps. Authority comes only from this per-entry validation.
    const validate = (entry: Entry, createPin = false): BoundEntry => {
      if (typeof entry.generation !== "string" || !entry.generation) throw new ReauthRequired()
      const issuer = issuerUrl(entry.issuer)
      if (entry.issuer !== undefined && !issuer) throw new ReauthRequired()
      const authority = staticBinding(entry)
      if (entry.tokens && (!issuer || !sameIssuer(entry.tokens.issuer, issuer) || !entry.clientInfo))
        throw new ReauthRequired()
      if (
        entry.clientInfo &&
        (!issuer ||
          !sameIssuer(entry.clientInfo.issuer, issuer) ||
          (entry.clientInfo.source !== "dynamic" && entry.clientInfo.source !== "configured"))
      )
        throw new ReauthRequired()
      if (entry.clientInfo?.source === "configured") {
        if (
          entry.clientInfo.clientSecret !== undefined ||
          (!authority && !createPin) ||
          (authority && (authority.clientId !== entry.clientInfo.clientId || !sameIssuer(authority.issuer, issuer)))
        )
          throw new ReauthRequired()
      }
      return {
        ...entry,
        generation: entry.generation,
        issuer,
        tokens: entry.tokens ? { ...entry.tokens, issuer: issuer! } : undefined,
        clientInfo: entry.clientInfo
          ? { ...entry.clientInfo, issuer: issuer!, source: entry.clientInfo.source as "dynamic" | "configured" }
          : undefined,
        staticClientBinding:
          entry.clientInfo?.source === "configured"
            ? { clientId: entry.clientInfo.clientId, issuer: issuer! }
            : authority,
      }
    }
    const requireBinding = (data: AuthData, binding: Binding) => {
      const current = data[binding.name]
      if (
        !current ||
        current.removed ||
        typeof binding.generation !== "string" ||
        !binding.generation ||
        current.generation !== binding.generation ||
        current.serverUrl !== binding.serverUrl
      )
        throw new ReauthRequired()
      return validate(current)
    }
    const bindingFor = (name: string, entry: { serverUrl: string; generation: string }): Binding => ({
      name,
      serverUrl: entry.serverUrl,
      generation: entry.generation,
    })
    const get = (name: string) => all().pipe(Effect.map((data) => (data[name]?.removed ? undefined : data[name])))
    const getForUrl = (name: string, serverUrl: string) =>
      get(name).pipe(Effect.map((entry) => (entry?.serverUrl === serverUrl ? entry : undefined)))
    const checkout = (name: string, serverUrl: string) =>
      mutate((data) => {
        const current = data[name]
        if (current) {
          if (
            current.removed ||
            current.serverUrl !== serverUrl ||
            typeof current.generation !== "string" ||
            !current.generation
          )
            throw new ReauthRequired()
          validate(current)
          return { value: bindingFor(name, { serverUrl, generation: current.generation }) }
        }
        const next = { serverUrl, generation: crypto.randomUUID() }
        return { next: { ...data, [name]: next }, value: bindingFor(name, next) }
      })
    const begin = (name: string, serverUrl: string) =>
      mutate((data) => {
        const current = data[name]
        const next = {
          serverUrl,
          generation: crypto.randomUUID(),
          staticClientBinding: current ? staticBinding(current) : undefined,
        }
        return {
          next: { ...data, [name]: next },
          value: {
            binding: bindingFor(name, next),
            previousState: current?.oauthState,
            staticClientBinding: next.staticClientBinding,
          },
        }
      })
    const readBinding = (binding: Binding) => mutate((data) => ({ value: requireBinding(data, binding) }))
    const updateBinding = (binding: Binding, patch: Patch) =>
      mutate((data) => {
        const current = requireBinding(data, binding)
        if (patch.issuer !== undefined && current.issuer !== undefined && !sameIssuer(current.issuer, patch.issuer))
          throw new ReauthRequired()
        // Copy only this closed patch: no caller can replace a lease or resource URL.
        const next = validate(
          {
            ...current,
            ...(patch.issuer !== undefined ? { issuer: patch.issuer } : {}),
            ...(patch.tokens !== undefined ? { tokens: patch.tokens } : {}),
            ...(patch.clientInfo !== undefined ? { clientInfo: patch.clientInfo } : {}),
            ...(patch.codeVerifier !== undefined ? { codeVerifier: patch.codeVerifier } : {}),
            ...(patch.oauthState !== undefined ? { oauthState: patch.oauthState } : {}),
          },
          true,
        )
        return { next: { ...data, [binding.name]: next }, value: undefined }
      })
    const invalidateBinding = (binding: Binding, type: "all" | "client" | "tokens") =>
      mutate((data) => {
        const current = requireBinding(data, binding)
        const next = {
          ...current,
          tokens: undefined,
          ...(type !== "tokens" ? { clientInfo: undefined } : {}),
          ...(type === "all" ? { codeVerifier: undefined, oauthState: undefined } : {}),
        }
        return { next: { ...data, [binding.name]: next }, value: undefined }
      })
    const consumeState = (binding: Binding, expectedState: string) =>
      mutate((data) => {
        const current = requireBinding(data, binding)
        if (!expectedState || current.oauthState !== expectedState) throw new ReauthRequired()
        return { next: { ...data, [binding.name]: { ...current, oauthState: undefined } }, value: undefined }
      })
    const commitBinding = (binding: Binding, entry: Patch) =>
      mutate((data) => {
        const current = requireBinding(data, binding)
        if (!entry.tokens || !entry.clientInfo || !sameIssuer(current.issuer, entry.issuer)) throw new ReauthRequired()
        const next = validate(
          {
            issuer: entry.issuer,
            tokens: entry.tokens,
            clientInfo: entry.clientInfo,
            serverUrl: binding.serverUrl,
            generation: crypto.randomUUID(),
            staticClientBinding: current.staticClientBinding,
          },
          true,
        )
        return { next: { ...data, [binding.name]: next }, value: undefined }
      })
    const remove = (name: string) =>
      mutate((data) => ({
        next: { ...data, [name]: { generation: crypto.randomUUID(), removed: true } },
        value: { previousState: data[name]?.oauthState },
      })).pipe(Effect.orDie)

    return Service.of({
      all,
      get,
      getForUrl,
      checkout,
      begin,
      readBinding,
      updateBinding,
      invalidateBinding,
      consumeState,
      commitBinding,
      remove,
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [FSUtil.node, EffectFlock.node, CredentialCipher.node],
})

export * as McpAuth from "./auth"
