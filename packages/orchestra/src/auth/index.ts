import { LayerNode } from "@orchestra/core/effect/layer-node"
import path from "path"
import { Effect, Layer, Record, Result, Schema, Context, Semaphore } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Flock } from "@orchestra/core/util/flock"
import { makeRuntime } from "../effect/run-service"
import { NonNegativeInt } from "@orchestra/core/schema"
import { Global } from "@orchestra/core/global"
import { FSUtil } from "@orchestra/core/fs-util"

export const OAUTH_DUMMY_KEY = "orchestra-oauth-dummy-key"

const file = path.join(Global.Path.data, "auth.json")
const locks = new Map<string, Semaphore.Semaphore>()

// Only public store paths/provider names enter lock keys; the critical body stays
// masked until native promises settle, so cancellation cannot release a live lease.
function locked<A, E, R>(key: string, body: Effect.Effect<A, E, R>) {
  const semaphore = locks.get(key) ?? Semaphore.makeUnsafe(1)
  locks.set(key, semaphore)
  return Effect.uninterruptibleMask((restore) => restore(semaphore.take(1)).pipe(
    Effect.flatMap(() => Effect.acquireUseRelease(
      Effect.tryPromise({ try: () => Flock.acquire(key, { dir: path.join(path.dirname(file), ".auth-locks") }), catch: fail("Failed to acquire auth lease") }),
      () => body,
      (lease) => Effect.tryPromise({ try: () => lease.release(), catch: fail("Failed to release auth lease") }),
    ).pipe(Effect.ensuring(semaphore.release(1)))),
  ))
}

export const withRefreshLease = <A, E, R>(providerID: string, body: Effect.Effect<A, E, R>) =>
  locked(`auth-refresh:${file}:${providerID}`, body)

const fail = (message: string) => (cause: unknown) => new AuthError({ message, cause })

export class Oauth extends Schema.Class<Oauth>("OAuth")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: NonNegativeInt,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}) {}

export class Api extends Schema.Class<Api>("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
}) {}

export class WellKnown extends Schema.Class<WellKnown>("WellKnownAuth")({
  type: Schema.Literal("wellknown"),
  key: Schema.String,
  token: Schema.String,
}) {}

export const Info = Schema.Union([Oauth, Api, WellKnown]).annotate({ discriminator: "type", identifier: "Auth" })
export type Info = Schema.Schema.Type<typeof Info>

export class AuthError extends Schema.TaggedErrorClass<AuthError>()("AuthError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export interface Interface {
  readonly get: (providerID: string) => Effect.Effect<Info | undefined, AuthError>
  readonly all: () => Effect.Effect<Record<string, Info>, AuthError>
  readonly set: (key: string, info: Info) => Effect.Effect<void, AuthError>
  readonly remove: (key: string) => Effect.Effect<void, AuthError>
  readonly replaceIf: (providerID: string, expected: Info, next: Info) => Effect.Effect<boolean, AuthError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/Auth") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fsys = yield* FSUtil.Service
    const decode = Schema.decodeUnknownOption(Info)

    const all = Effect.fn("Auth.all")(function* () {
      if (process.env.ORCHESTRA_AUTH_CONTENT) {
        try {
          return JSON.parse(process.env.ORCHESTRA_AUTH_CONTENT)
        } catch (err) {}
      }

      const data = (yield* fsys.readJson(file).pipe(Effect.orElseSucceed(() => ({})))) as Record<string, unknown>
      return Record.filterMap(data, (value) => Result.fromOption(decode(value), () => undefined))
    })

    const get = Effect.fn("Auth.get")(function* (providerID: string) {
      return (yield* all())[providerID]
    })

    const write = (data: Record<string, Info>) => Effect.acquireUseRelease(
        fsys.makeTempFile({ directory: path.dirname(file), prefix: ".auth-" }),
        (temporary) => fsys.writeJson(temporary, data, 0o600).pipe(Effect.andThen(fsys.rename(temporary, file))),
        (temporary) => fsys.remove(path.dirname(temporary), { recursive: true }).pipe(Effect.ignore),
      ).pipe(Effect.mapError(fail("Failed to write auth data")))

    const set = (key: string, info: Info) => locked(`auth-store:${file}`, Effect.gen(function* () {
      const norm = key.replace(/\/+$/, "")
      const data = yield* all()
      if (norm !== key) delete data[key]
      delete data[norm + "/"]
      yield* write({ ...data, [norm]: info })
    }))

    const remove = (key: string) => locked(`auth-store:${file}`, Effect.gen(function* () {
      const norm = key.replace(/\/+$/, "")
      const data = yield* all()
      delete data[key]
      delete data[norm]
      yield* write(data)
    }))

    const replaceIf = (key: string, expected: Info, next: Info) => locked(`auth-store:${file}`, Effect.gen(function* () {
      if (process.env.ORCHESTRA_AUTH_CONTENT) return false
      const norm = key.replace(/\/+$/, "")
      const data = yield* all()
      const current = data[norm]
      if (!current || !isDeepStrictEqual(Schema.encodeSync(Info)(current), Schema.encodeSync(Info)(expected))) return false
      yield* write({ ...data, [norm]: next })
      return true
    }))

    return Service.of({ get, all, set, remove, replaceIf })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [FSUtil.node] })
export const runPromise = makeRuntime(Service, LayerNode.compile(node)).runPromise

export * as Auth from "."
