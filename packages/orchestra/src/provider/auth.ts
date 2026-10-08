import { LayerNode } from "@orchestra/core/effect/layer-node"
import type { AuthOAuthResult, Hooks } from "@orchestra/plugin"
import { serviceUse } from "@orchestra/core/effect/service-use"
import { Auth } from "@/auth"
import { InstanceState } from "@/effect/instance-state"
import { optional } from "@orchestra/core/schema"
import { Plugin } from "../plugin"
import { ProviderV2 } from "@orchestra/core/provider"
import { Array as Arr, Effect, Layer, Record, Result, Context, Schema, Semaphore } from "effect"

const When = Schema.Struct({
  key: Schema.String,
  op: Schema.Literals(["eq", "neq"]),
  value: Schema.String,
})

const TextPrompt = Schema.Struct({
  type: Schema.Literal("text"),
  key: Schema.String,
  message: Schema.String,
  placeholder: optional(Schema.String),
  when: optional(When),
})

const SelectOption = Schema.Struct({
  label: Schema.String,
  value: Schema.String,
  hint: optional(Schema.String),
})

const SelectPrompt = Schema.Struct({
  type: Schema.Literal("select"),
  key: Schema.String,
  message: Schema.String,
  options: Schema.Array(SelectOption),
  when: optional(When),
})

const Prompt = Schema.Union([TextPrompt, SelectPrompt])

export class Method extends Schema.Class<Method>("ProviderAuthMethod")({
  type: Schema.Literals(["oauth", "api"]),
  label: Schema.String,
  prompts: optional(Schema.Array(Prompt)),
}) {}

export const Methods = Schema.Record(Schema.String, Schema.Array(Method))
export type Methods = typeof Methods.Type

export class Authorization extends Schema.Class<Authorization>("ProviderAuthAuthorization")({
  url: Schema.String,
  method: Schema.Literals(["auto", "code"]),
  instructions: Schema.String,
}) {}

export const AuthorizeInput = Schema.Struct({
  method: Schema.Finite.annotate({ description: "Auth method index" }),
  inputs: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({ description: "Prompt inputs" }),
})
export type AuthorizeInput = Schema.Schema.Type<typeof AuthorizeInput>

export const CallbackInput = Schema.Struct({
  method: Schema.Finite.annotate({ description: "Auth method index" }),
  code: Schema.optional(Schema.String).annotate({ description: "OAuth authorization code" }),
})
export type CallbackInput = Schema.Schema.Type<typeof CallbackInput>

export class OauthMissing extends Schema.TaggedErrorClass<OauthMissing>()("ProviderAuthOauthMissing", {
  providerID: ProviderV2.ID,
}) {}

export class OauthCodeMissing extends Schema.TaggedErrorClass<OauthCodeMissing>()("ProviderAuthOauthCodeMissing", {
  providerID: ProviderV2.ID,
}) {}

export class OauthCallbackFailed extends Schema.TaggedErrorClass<OauthCallbackFailed>()(
  "ProviderAuthOauthCallbackFailed",
  {},
) {}

export class ValidationFailed extends Schema.TaggedErrorClass<ValidationFailed>()("ProviderAuthValidationFailed", {
  field: Schema.String,
  message: Schema.String,
}) {}

export type Error = Auth.AuthError | OauthMissing | OauthCodeMissing | OauthCallbackFailed | ValidationFailed

type Hook = NonNullable<Hooks["auth"]>

export interface Interface {
  readonly methods: () => Effect.Effect<Methods>
  readonly authorize: (
    input: {
      providerID: ProviderV2.ID
    } & AuthorizeInput,
  ) => Effect.Effect<Authorization | undefined, Error>
  readonly callback: (input: { providerID: ProviderV2.ID } & CallbackInput) => Effect.Effect<void, Error>
  readonly cancel: (input: { providerID: ProviderV2.ID }) => Effect.Effect<void>
}

interface BrowserAttempt {
  expected: Auth.Info | undefined
  revision: string
  method: number
  result?: AuthOAuthResult
}

interface State {
  hooks: Record<ProviderV2.ID, Hook>
  pending: Map<ProviderV2.ID, AuthOAuthResult>
  browser: { active: boolean; lock: Semaphore.Semaphore; attempt?: BrowserAttempt }
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ProviderAuth") {}

export const use = serviceUse(Service)

const layer: Layer.Layer<Service, never, Auth.Service | Plugin.Service> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const state = yield* InstanceState.make<State>(
      Effect.fn("ProviderAuth.state")(function* () {
        const plugins = yield* plugin.list()
        const browser: State["browser"] = { active: true, lock: Semaphore.makeUnsafe(1) }
        yield* Effect.addFinalizer(() => browser.lock.withPermits(1)(Effect.sync(() => {
          browser.active = false
          browser.attempt = undefined
        })))
        return {
          hooks: Record.fromEntries(
            Arr.filterMap(plugins, (x) =>
              x.auth?.provider !== undefined
                ? Result.succeed([ProviderV2.ID.make(x.auth.provider), x.auth] as const)
                : Result.failVoid,
            ),
          ),
          pending: new Map<ProviderV2.ID, AuthOAuthResult>(),
          browser,
        }
      }),
    )

    const decode = Schema.decodeUnknownSync(Methods)
    const methods = Effect.fn("ProviderAuth.methods")(function* () {
      const hooks = (yield* InstanceState.get(state)).hooks
      return decode(
        Record.map(hooks, (item) =>
          item.methods.map((method) => ({
            type: method.type,
            label: method.label,
            ...(method.prompts && {
              prompts: method.prompts.map((prompt) => {
                if (prompt.type === "select") {
                  return {
                    type: "select" as const,
                    key: prompt.key,
                    message: prompt.message,
                    options: prompt.options,
                    ...(prompt.when && { when: prompt.when }),
                  }
                }
                return {
                  type: "text" as const,
                  key: prompt.key,
                  message: prompt.message,
                  ...(prompt.placeholder && { placeholder: prompt.placeholder }),
                  ...(prompt.when && { when: prompt.when }),
                }
              }),
            }),
          })),
        ),
      )
    })

    const authorize = Effect.fn("ProviderAuth.authorize")(function* (
      input: { providerID: ProviderV2.ID } & AuthorizeInput,
    ) {
      const current = yield* InstanceState.get(state)
      const method = current.hooks[input.providerID].methods[input.method]
      const attempt = input.providerID === "openai"
        ? yield* current.browser.lock.withPermits(1)(Effect.gen(function* () {
            current.browser.attempt = undefined
            if (!current.browser.active) return yield* new OauthMissing({ providerID: input.providerID })
            if (method.type !== "oauth") return
            const snapshot = yield* auth.snapshot(input.providerID)
            const attempt: BrowserAttempt = { expected: snapshot.value, revision: snapshot.revision, method: input.method }
            current.browser.attempt = attempt
            return attempt
          })) : undefined
      if (method.type !== "oauth") return

      if (method.prompts && input.inputs) {
        for (const prompt of method.prompts) {
          if (prompt.type === "text" && prompt.validate && input.inputs[prompt.key] !== undefined) {
            const error = prompt.validate(input.inputs[prompt.key])
            if (error) return yield* new ValidationFailed({ field: prompt.key, message: error })
          }
        }
      }

      const result = yield* Effect.promise(() => method.authorize(input.inputs)).pipe(
        Effect.onError(() => attempt ? invalidateBrowser(current.browser, attempt) : Effect.void),
      )
      if (attempt) {
        yield* current.browser.lock.withPermits(1)(Effect.gen(function* () {
          if (!current.browser.active || current.browser.attempt !== attempt) return yield* new OauthCallbackFailed({})
          attempt.result = result
        }))
      }
      if (!attempt) current.pending.set(input.providerID, result)
      return {
        url: result.url,
        method: result.method,
        instructions: result.instructions,
      }
    })

    const callback = Effect.fn("ProviderAuth.callback")(function* (
      input: { providerID: ProviderV2.ID } & CallbackInput,
    ) {
      const current = yield* InstanceState.get(state)
      const attempt = input.providerID === "openai" ? current.browser.attempt : undefined
      const match = input.providerID === "openai" ? attempt?.result : current.pending.get(input.providerID)
      if (!match) return yield* new OauthMissing({ providerID: input.providerID })
      if (attempt && attempt.method !== input.method) return yield* new OauthMissing({ providerID: input.providerID })
      if (match.method === "code" && !input.code) {
        return yield* new OauthCodeMissing({ providerID: input.providerID })
      }

      const result = yield* Effect.promise(() =>
        match.method === "code" ? match.callback(input.code!) : match.callback(),
      ).pipe(Effect.onError(() => attempt ? invalidateBrowser(current.browser, attempt) : Effect.void))
      if (!result || result.type !== "success") {
        if (attempt) yield* invalidateBrowser(current.browser, attempt)
        return yield* new OauthCallbackFailed({})
      }

      const persist = (next: Auth.Info) => attempt
        ? current.browser.lock.withPermits(1)(Effect.gen(function* () {
            if (!current.browser.active || current.browser.attempt !== attempt) return yield* new OauthCallbackFailed({})
            // Consume once while replacement/cancel/scope expiry share this lock.
            current.browser.attempt = undefined
            if (!(yield* auth.replaceIf(input.providerID, attempt.expected, next, attempt.revision))) return yield* new OauthCallbackFailed({})
          })) : auth.set(input.providerID, next)

      if ("key" in result) {
        yield* persist({
          type: "api",
          key: result.key,
          ...(result.metadata ? { metadata: result.metadata } : {}),
        })
      }

      if ("refresh" in result) {
        const { type: _, provider: __, refresh, access, expires, ...extra } = result
        yield* persist({
          type: "oauth",
          access,
          refresh,
          expires,
          ...extra,
        })
      }
    })

    const cancel = Effect.fn("ProviderAuth.cancel")(function* (input: { providerID: ProviderV2.ID }) {
      const current = yield* InstanceState.get(state)
      if (input.providerID !== "openai") { current.pending.delete(input.providerID); return }
      yield* current.browser.lock.withPermits(1)(Effect.sync(() => { current.browser.attempt = undefined }))
    })

    return Service.of({ methods, authorize, callback, cancel })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [Auth.node, Plugin.node] })

function invalidateBrowser(browser: State["browser"], attempt: BrowserAttempt) {
  return browser.lock.withPermits(1)(Effect.sync(() => {
    if (browser.attempt === attempt) browser.attempt = undefined
  }))
}

export * as ProviderAuth from "./auth"
