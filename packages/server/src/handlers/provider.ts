import { Catalog } from "@orchestra/core/catalog"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ProviderNotFoundError, ServiceUnavailableError } from "@orchestra/protocol/errors"
import { response } from "../location"
import { CatalogAvailability } from "@orchestra/core/host/catalog-availability"

export const ProviderHandler = HttpApiBuilder.group(Api, "server.provider", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "provider.list",
        Effect.fn(function* () {
          const catalog = yield* Catalog.Service
          const additional = yield* CatalogAvailability.AdditionalProviders
          return yield* response(Effect.gen(function* () {
            const available = yield* catalog.provider.available()
            const extra = yield* additional(catalog)
            return [...available, ...extra.filter((provider) => !available.some((item) => item.id === provider.id))]
          }))
        }),
      )
      .handle(
        "provider.claudeCode.account",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.account
        }),
      )
      .handle(
        "provider.claudeCode.login",
        Effect.fn(function* () {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.startLogin.pipe(
            Effect.catchTag("ClaudeCodeAccount.LoginError", (error) =>
              Effect.fail(new ServiceUnavailableError({ message: error.message, service: "claude-code" })),
            ),
          )
        }),
      )
      .handle(
        "provider.claudeCode.loginCode",
        Effect.fn(function* (ctx) {
          const account = yield* ClaudeCodeAccount.Service
          return yield* account.sendCode(ctx.payload.code)
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const catalog = yield* Catalog.Service
          const provider = yield* catalog.provider.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
              providerID: ctx.params.providerID,
              message: `Provider not found: ${ctx.params.providerID}`,
            })
          return yield* response(Effect.succeed(provider))
        }),
      )
  }),
)
