export * as ServerAuth from "./auth"

import { createHash, timingSafeEqual } from "node:crypto"
import { Config as EffectConfig, Context, Effect, Layer, Option, Redacted } from "effect"

export type Credentials = {
  password?: string
  username?: string
}

export type DecodedCredentials = {
  readonly username: string
  readonly password: Redacted.Redacted
}

export type Info = {
  readonly password: Option.Option<string>
  readonly username: string
}

export class Config extends Context.Service<Config, Info>()("@orchestra/ServerAuthConfig") {
  static configLayer(input: Info) {
    return Layer.succeed(this, this.of(input))
  }

  static get layer() {
    return Layer.effect(
      this,
      Effect.gen(function* () {
        return Config.of(
          yield* EffectConfig.all({
            password: EffectConfig.string("ORCHESTRA_SERVER_PASSWORD").pipe(EffectConfig.option),
            username: EffectConfig.string("ORCHESTRA_SERVER_USERNAME").pipe(EffectConfig.withDefault("orchestra")),
          }),
        )
      }),
    )
  }
}

export function required(config: Info) {
  return Option.isSome(config.password) && config.password.value !== ""
}

export function authorized(credentials: DecodedCredentials, config: Info) {
  if (Option.isNone(config.password)) return false
  // Both sides are compared even when the username is wrong, so timing does not say which half failed.
  const username = same(credentials.username, config.username)
  const password = same(Redacted.value(credentials.password), config.password.value)
  return username && password
}

// Hashing first gives timingSafeEqual equal-length inputs, so the length of the secret does not leak either.
function same(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())
}

export function header(credentials?: Credentials) {
  const password = credentials?.password ?? process.env.ORCHESTRA_SERVER_PASSWORD
  if (!password) return undefined

  return `Basic ${Buffer.from(`${credentials?.username ?? process.env.ORCHESTRA_SERVER_USERNAME ?? "orchestra"}:${password}`).toString("base64")}`
}

export function headers(credentials?: Credentials) {
  const authorization = header(credentials)
  if (!authorization) return undefined
  return { Authorization: authorization }
}
