import { expect, test } from "bun:test"
import type { Catalog } from "@orchestra/core/catalog"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Config } from "@orchestra/core/config"
import { CatalogAvailability } from "@orchestra/core/host/catalog-availability"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import type { ModelV2 } from "@orchestra/core/model"
import type { ProviderV2 } from "@orchestra/core/provider"
import { type Context, Effect, Layer } from "effect"
import { ClaudeCodeCatalog } from "../src/v2/catalog"

// Claude mode lists Anthropic through the signed-in binary, with no API key and no ordinary connection.

const provider = { id: "anthropic", disabled: false, api: { type: "native", settings: {} } } as unknown as ProviderV2.Info
const model = (id: string, enabled = true) => ({ id, providerID: "anthropic", enabled }) as unknown as ModelV2.Info
const models = [model("opus", false), model("sonnet"), model("haiku")]
const catalog = (anthropic: ProviderV2.Info | undefined = provider) =>
  ({
    provider: { get: () => Effect.succeed(anthropic) },
    model: {
      get: (_provider: string, id: string) => Effect.succeed(models.find((item) => item.id === id)),
      all: () => Effect.succeed(models),
    },
  }) as unknown as Catalog.Interface

function resolve(input: { info: object; signedIn?: boolean; catalog?: Catalog.Interface }) {
  const config = Layer.succeed(
    Config.Service,
    Config.Service.of({ entries: () => Effect.succeed([{ type: "document", info: input.info } as unknown as Config.Entry]) }),
  )
  const account = Layer.succeed(
    ClaudeCodeAccount.Service,
    ClaudeCodeAccount.Service.of({
      account: Effect.succeed({ signedIn: input.signedIn ?? true }),
      startLogin: Effect.never,
      sendCode: () => Effect.succeed(false),
    }),
  )
  const locations = Layer.succeed(LocationServiceMap.Service, { get: () => config } as unknown as Context.Service.Shape<typeof LocationServiceMap.Service>)
  const location = Layer.succeed(Location.Service, { directory: "/project" } as unknown as Location.Interface)
  return Effect.runPromise(
    Effect.gen(function* () {
      const target = input.catalog ?? catalog()
      const additional = yield* CatalogAvailability.AdditionalProviders
      const preferred = yield* CatalogAvailability.DefaultModel
      return {
        providers: (yield* additional(target).pipe(Effect.provide(location))).map((item) => item.api.settings),
        model: (yield* preferred(target).pipe(Effect.provide(location)))?.id as string | undefined,
      }
    }).pipe(Effect.provide(ClaudeCodeCatalog.layer.pipe(Layer.provideMerge(Layer.mergeAll(locations, account))))),
  )
}

test("Claude mode lists Anthropic through the execution host and defaults to the first enabled model", async () => {
  expect(await resolve({ info: { agents: { maestro: { engine: "claude-code" } } } })).toEqual({
    providers: [{ executionHost: "claude-code" }],
    model: "sonnet",
  })
})

test("the configured Maestro or default model wins when it is an enabled Anthropic model", async () => {
  const maestro = { agents: { maestro: { engine: "claude-code", model: "anthropic/haiku" } }, model: "anthropic/sonnet" }
  expect((await resolve({ info: maestro })).model).toBe("haiku")
  expect((await resolve({ info: { agents: { maestro: { engine: "claude-code" } }, model: "anthropic/haiku" } })).model).toBe("haiku")
  // A disabled or foreign model falls back to the first enabled Anthropic one.
  expect((await resolve({ info: { agents: { maestro: { engine: "claude-code", model: "anthropic/opus" } } } })).model).toBe("sonnet")
  expect((await resolve({ info: { agents: { maestro: { engine: "claude-code" } }, model: "openai/gpt" } })).model).toBe("sonnet")
})

test("nothing is advertised outside Claude mode, when signed out, or when Anthropic is disabled", async () => {
  const off = { providers: [], model: undefined }
  expect(await resolve({ info: { agents: { maestro: { engine: "orchestra" } } } })).toEqual(off)
  expect(await resolve({ info: {} })).toEqual(off)
  expect(await resolve({ info: { agents: { maestro: { engine: "claude-code" } } }, signedIn: false })).toEqual(off)
  expect(
    await resolve({
      info: { agents: { maestro: { engine: "claude-code" } } },
      catalog: catalog({ ...provider, disabled: true } as ProviderV2.Info),
    }),
  ).toEqual(off)
})
