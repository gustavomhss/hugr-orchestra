import { expect } from "bun:test"
import { Effect } from "effect"
import type { AccountInfo, Query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeHostProvider } from "@/claude-code/host/provider"
import { ClaudeCodeSDK } from "@orchestra/engine-claude-code/sdk"
import { Provider } from "@/provider/provider"
import { ClaudeEngineFixture } from "../engine-fixture"
import { HostCatalog } from "@/server/routes/instance/httpapi/handlers/catalog"
import { CatalogAvailability } from "@orchestra/core/host/catalog-availability"
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

for (const [label, info, expected] of [
  [
    "a signed-in subscription",
    { email: "owner@example.com", subscriptionType: "max", tokenSource: "claude.ai", apiProvider: "firstParty" },
    { signedIn: true, email: "owner@example.com", subscription: "max" },
  ],
  ["a signed-out binary", { email: "stale@example.com", tokenSource: "none", apiKeySource: "none" }, { signedIn: false }],
] as const)
  ClaudeEngineFixture.it.instance(`the account the app shows reports ${label} without credential sources`, () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      ClaudeEngineFixture.state.construct = () =>
        Object.assign((async function* () {})(), {
          accountInfo: async (): Promise<AccountInfo> => info,
          close: () => {},
        }) as unknown as Query
      const account = yield* ClaudeHostProvider.account.pipe(Effect.provideService(ClaudeCodeSDK.Environment, {}))
      expect(account).toEqual(expected)
      expect(ClaudeEngineFixture.state.inputs).toEqual([])
    }),
  )

ClaudeEngineFixture.it.instance("an unavailable Claude Code executable reads as signed out", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const account = yield* ClaudeHostProvider.account.pipe(
      Effect.provideService(ClaudeCodeSDK.Environment, { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: "relative/claude" }),
    )
    expect(account).toEqual({ signedIn: false })
    expect(ClaudeEngineFixture.state.queries).toEqual([])
  }),
)

ClaudeEngineFixture.it.instance("the provider status check queries a signed-out account without the retired flag or a model prompt", () =>
  Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const accounts: boolean[] = []
    const closed: boolean[] = []
    const inputs: Promise<IteratorResult<unknown>>[] = []
    ClaudeEngineFixture.state.construct = (params) => {
      if (typeof params.prompt === "string") throw new Error("Account status must not submit a model prompt")
      // Start reading before cleanup aborts the probe; an empty stream must finish without yielding a user message.
      inputs.push(params.prompt[Symbol.asyncIterator]().next())
      return Object.assign((async function* () {})(), {
        accountInfo: async (): Promise<AccountInfo> => {
          accounts.push(true)
          return { tokenSource: "none", apiKeySource: "none" }
        },
        close: () => {
          closed.push(true)
        },
      }) as unknown as Query
    }
    expect(yield* ClaudeHostProvider.signedIn.pipe(Effect.provideService(ClaudeCodeSDK.Environment, {}))).toBe(false)
    expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
    expect(accounts).toEqual([true])
    expect(closed).toEqual([true])
    expect(inputs).toHaveLength(1)
    expect(yield* Effect.promise(() => inputs[0])).toEqual({ done: true, value: undefined })
    const options = ClaudeEngineFixture.state.queries[0].options
    expect(options?.env?.ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
    expect(options?.abortController?.signal.aborted).toBe(true)
    expect(ClaudeEngineFixture.state.inputs).toEqual([])
    expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
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
