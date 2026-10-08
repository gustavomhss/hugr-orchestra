import { join } from "node:path"
import type { PluginContext } from "@orchestra/plugin/v2/effect"
import type { IntegrationOAuthMethodRegistration } from "@orchestra/plugin/v2/effect/integration"
import { define } from "@orchestra/plugin/v2/effect/plugin"
import { Effect } from "effect"
import type { Scope } from "effect"
import { OwnOAuthApp } from "../../auth/oauth-app"
import { Siwc } from "../../auth/siwc"
import { SiwcInference } from "../../auth/siwc-inference"
import { SiwcListener } from "../../auth/siwc-listener"
import { SiwcRefresh } from "../../auth/siwc-refresh"
import { Credential } from "../../credential"
import { Global } from "../../global"
import { Integration } from "../../integration"
import { ModelV2 } from "../../model"
import { ProviderV2 } from "../../provider"
import type { PluginInternal } from "../internal"

function browser(ctx: PluginContext, integration: Integration.Interface, hostFile: string, methodID: Integration.MethodID, label: string, owned = false) {
  return {
    integrationID: Integration.ID.make("openai"),
    method: { id: methodID, type: "oauth", label, prompts: [{ type: "select", key: "account",
      message: "ChatGPT account", options: [
        { label: "Add a ChatGPT account or workspace", value: "new" },
        { label: "Continue with the active saved ChatGPT account", value: "saved" },
      ] }] },
    authorize: (inputs) => Effect.gen(function* () {
      const connection = inputs.account === "saved" ? yield* ctx.integration.connection.active("openai") : undefined
      if (inputs.account === "saved" && !connection) return yield* Effect.fail(new Error("No saved ChatGPT account selected"))
      const value = connection?.type === "credential"
        ? yield* integration.connection.saved({ ...connection, id: Credential.ID.make(connection.id) }) : undefined
      if (connection && value?.type !== "oauth") return yield* Effect.fail(new Error("Select a saved ChatGPT account, not an API key"))
      const registration = value?.type === "oauth"
        ? yield* Effect.try({ try: () => Siwc.registration(value.metadata), catch: (cause) => cause }) : undefined
      // Configured partner clients are a separate, explicit advanced method.
      // Returning sign-in always keeps its saved client, even if ENV changed.
      const clientId = owned && !registration
        ? yield* Effect.try({ try: () => OwnOAuthApp.requireClientID("openai"), catch: (cause) => cause }) : undefined
      return yield* SiwcListener.authorize({ hostFile, methodID, registration, clientId })
    }),
    refresh: (value) => Effect.tryPromise(() => SiwcRefresh.exchange(
      Credential.OAuth.make({ ...value, methodID: Integration.MethodID.make(value.methodID) }),
    )),
    label: (value) => {
      const registration = Siwc.registration(value.metadata)
      return `${registration.subject} (${registration.clientId})`
    },
  } satisfies IntegrationOAuthMethodRegistration
}

export const OpenAIPlugin = define({
  id: "openai",
  effect: Effect.fn(function* (ctx) {
    const global = yield* Global.Service
    const integration = yield* Integration.Service
    const hostFile = join(global.data, "siwc", "host-id")
    yield* ctx.integration.transform((draft) => {
      draft.method.update(browser(ctx, integration, hostFile, Integration.MethodID.make("chatgpt-browser"), "Continue with ChatGPT (Orchestra)"))
      draft.method.update(browser(ctx, integration, hostFile, Integration.MethodID.make("chatgpt-headless"), "Continue with ChatGPT (manual browser)"))
      if (process.env.ORCHESTRA_OPENAI_CLIENT_ID?.trim())
        draft.method.update(browser(ctx, integration, hostFile, Integration.MethodID.make("chatgpt-browser-owned"), "ChatGPT (approved partner client, advanced)", true))
    })
    yield* ctx.catalog.transform(
      Effect.fn(function* (evt) {
        const connection = yield* ctx.integration.connection.active("openai")
        const value = connection ? yield* ctx.integration.connection.resolve(connection).pipe(Effect.orDie) : undefined
        if (value?.type === "oauth") {
          const credential = Credential.OAuth.make({ ...value, methodID: Integration.MethodID.make(value.methodID) })
          const models = yield* Effect.tryPromise(() => SiwcInference.models(credential)).pipe(Effect.orDie)
          const item = evt.provider.list().find((item) => item.provider.id === ProviderV2.ID.openai)
          if (item) {
            for (const [id] of item.models) evt.model.update(item.provider.id, id, (model) => { model.enabled = false })
            models.forEach((available) => evt.model.update(item.provider.id, ModelV2.ID.make(available.slug), (model) => {
              model.name = available.display_name
              model.api = { type: "aisdk", package: "@ai-sdk/openai", id: ModelV2.ID.make(available.slug), url: Siwc.resource }
              model.enabled = true
            }))
          }
          return
        }
        for (const item of evt.provider.list()) {
          if (item.provider.api.type !== "aisdk") continue
          if (item.provider.api.package !== "@ai-sdk/openai") continue
          if (!item.models.has(ModelV2.ID.make("gpt-5-chat-latest"))) continue
          evt.model.update(item.provider.id, ModelV2.ID.make("gpt-5-chat-latest"), (model) => { model.enabled = false })
        }
      }),
    )
    yield* ctx.aisdk.sdk(
      Effect.fn(function* (evt) {
        if (evt.package !== "@ai-sdk/openai") return
        const mod = yield* Effect.promise(() => import("@ai-sdk/openai"))
        if (evt.model.providerID === ProviderV2.ID.openai) {
          const connection = yield* ctx.integration.connection.active("openai")
          const value = connection ? yield* ctx.integration.connection.resolve(connection).pipe(Effect.orDie) : undefined
          if (value?.type === "oauth") {
            const selected = Siwc.registration(value.metadata)
            Siwc.requirePlanUsage(value)
            evt.options.baseURL = Siwc.resource
            evt.options.apiKey = value.access
            evt.options.fetch = SiwcInference.transport(selected, () => Effect.runPromise(Effect.gen(function* () {
              const active = yield* ctx.integration.connection.active("openai")
              const current = active ? yield* ctx.integration.connection.resolve(active) : undefined
              if (current?.type !== "oauth") return yield* Effect.fail(new Error("ChatGPT account is no longer active"))
              return Credential.OAuth.make({ ...current, methodID: Integration.MethodID.make(current.methodID) })
            })))
          }
        }
        evt.sdk = mod.createOpenAI(evt.options)
      }),
    )
    yield* ctx.aisdk.language(
      Effect.fn(function* (evt) {
        if (evt.model.providerID !== ProviderV2.ID.openai) return
        evt.language = evt.sdk.responses(evt.model.api.id)
      }),
    )
  }),
} satisfies PluginInternal.Plugin<PluginInternal.Requirements | Scope.Scope>)
