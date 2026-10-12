import { expect } from "bun:test"
import { Effect } from "effect"
import type { AccountInfo, Query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeHostProvider } from "@/claude-code/host/provider"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { Provider } from "@/provider/provider"
import { ClaudeEngineFixture } from "../engine-fixture"
import { HostCatalog } from "@/server/routes/instance/httpapi/handlers/catalog"
import { CatalogAvailability } from "@orchestra/server/catalog-availability"
import { Catalog } from "@orchestra/core/catalog"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { AbsolutePath } from "@orchestra/core/schema"
import { PluginV2 } from "@orchestra/core/plugin"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { TestInstance } from "../../fixture/fixture"

for (const [label, account, expected] of [
  ["stored host login", { tokenSource: "oauth", apiProvider: "firstParty" }, true],
  ["SDK 0.3.289 subscription login", { subscriptionType: "Claude Max", apiProvider: "firstParty" }, true],
  ["owner API key", { apiKeySource: "env", apiProvider: "firstParty" }, true],
  ["signed out", { tokenSource: "none", apiKeySource: "none" }, false],
  [
    "explicit signed out with subscription",
    { tokenSource: "none", apiKeySource: "none", subscriptionType: "Claude Max", apiProvider: "firstParty" },
    false,
  ],
  ["absent auth facts", {}, false],
] as const)
  ClaudeEngineFixture.it.instance(`provider availability checks ${label} without a model turn`, () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const closed: boolean[] = []
      ClaudeEngineFixture.state.construct = () =>
        Object.assign((async function* () {})(), {
          accountInfo: async (): Promise<AccountInfo> => account,
          close: () => {
            closed.push(true)
          },
        }) as unknown as Query
      expect(
        yield* ClaudeHostProvider.signedIn.pipe(
          Effect.provideService(ClaudeCodeSDK.Environment, { ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1" }),
        ),
      ).toBe(expected)
      expect(ClaudeEngineFixture.state.inputs).toEqual([])
      expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
      expect(closed).toEqual([true])
      const options = ClaudeEngineFixture.state.queries[0].options
      expect(options?.tools).toBeUndefined()
      expect(options?.disallowedTools).toBeUndefined()
      expect(options?.toolAliases).toBeUndefined()
      const provider = yield* Provider.Service
      expect((yield* provider.list())[ProviderV2.ID.anthropic]).toBeUndefined()
    }),
  )

ClaudeEngineFixture.it.instance("the provider status check respects the plan gate before constructing a query", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    expect(yield* ClaudeHostProvider.signedIn.pipe(Effect.provideService(ClaudeCodeSDK.Environment, {}))).toBe(false)
    expect(ClaudeEngineFixture.state.queries).toEqual([])
  }),
)

for (const [label, engine, disabled, signedIn, expected] of [
  ["signed-in Claude seat", "claude-code", false, true, true],
  ["signed-out Claude seat", "claude-code", false, false, false],
  ["ordinary seat", "orchestra", false, true, false],
  ["disabled Anthropic", "claude-code", true, true, false],
] as const)
  ClaudeEngineFixture.it.instance(
    `V2 host availability respects ${label}`,
    () =>
      Effect.gen(function* () {
        ClaudeEngineFixture.reset()
        ClaudeEngineFixture.state.construct = () =>
          Object.assign((async function* () {})(), {
            accountInfo: async () =>
              signedIn ? { subscriptionType: "Claude Max", apiProvider: "firstParty" } : { tokenSource: "none" },
            close: () => {},
          }) as unknown as Query
        const instance = yield* TestInstance
        const locations = yield* LocationServiceMap.Service
        yield* Effect.gen(function* () {
          const plugins = yield* PluginV2.Service
          yield* plugins.wait(PluginV2.ID.make("config-provider"))
          const catalog = yield* Catalog.Service
          yield* catalog.transform((editor) =>
            editor.model.update(ProviderV2.ID.anthropic, ModelV2.ID.make("claude-haiku-5-5"), () => {}),
          )
          const additional = yield* CatalogAvailability.AdditionalProviders
          const preferred = yield* CatalogAvailability.DefaultModel
          const result = yield* additional(catalog)
          expect(result.map((provider) => provider.id)).toEqual(expected ? [ProviderV2.ID.anthropic] : [])
          if (expected) expect(result[0].api.settings).toMatchObject({ executionHost: "claude-code" })
          expect((yield* catalog.provider.available()).some((provider) => provider.id === "anthropic")).toBe(false)
          const model = yield* preferred(catalog)
          if (expected) expect(model).toMatchObject({ providerID: ProviderV2.ID.anthropic, id: "claude-haiku-5-5" })
          if (!expected) expect(model).toBeUndefined()
          yield* additional(catalog)
          expect(ClaudeEngineFixture.state.queries).toHaveLength(engine === "claude-code" && !disabled ? 1 : 0)
          expect(ClaudeEngineFixture.state.inputs).toEqual([])
        }).pipe(
          Effect.provide(
            locations.get(
              Location.Ref.make({ directory: AbsolutePath.make(instance.directory), workspaceID: undefined }),
            ),
          ),
          Effect.provide(HostCatalog.layer),
          Effect.provideService(ClaudeCodeSDK.Environment, { ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1" }),
        )
      }),
    {
      config: {
        agent: { maestro: { engine, model: "anthropic/claude-haiku-5-5" }, claude: { engine: "claude-code" } },
        disabled_providers: disabled ? ["anthropic"] : [],
      },
    },
  )
