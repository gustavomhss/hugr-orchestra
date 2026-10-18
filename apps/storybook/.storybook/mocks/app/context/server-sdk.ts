import { useProviders } from "@/hooks/use-providers"
import { useServerSync } from "@/context/server-sync"
import type { IntegrationMethod, IntegrationOauthConnectInput } from "@opencode-ai/client/promise"

const providers = [
  "opencode",
  "opencode-go",
  "anthropic",
  "openai",
  "google",
  "openrouter",
  "vercel",
  "github-copilot",
  "302ai",
  "abacus",
  "abliteration",
  "alibaba",
  "alibaba-cn",
  "alibaba-coding-plan",
]

const client = {
  provider: {
    auth: async () => ({
      data: Object.fromEntries(providers.map((provider) => [provider, [{ type: "api", label: "API key" }]])),
    }),
    oauth: {
      authorize: async (input: { method?: number }) => ({
        data: {
          url: "https://example.com/oauth",
          method: input.method === 1 ? ("code" as const) : ("auto" as const),
          instructions: input.method === 1 ? "Paste the authorization code" : "Confirmation code: ABCD-EFGH",
        },
      }),
      callback: async (input: { method?: number }) => {
        if (input.method === 0) return new Promise<never>(() => {})
        return { data: undefined }
      },
    },
  },
  auth: {
    set: async () => ({ data: true }),
  },
  global: {
    dispose: async () => ({ data: true }),
  },
}

export function useServerSDK() {
  const catalog = useProviders()
  const sync = useServerSync()
  const location = { directory: "story", project: { id: "story-project", directory: "story" } }
  const time = { created: 1, expires: 4_102_444_800_000 }
  const integration = (id: string) => {
    const provider = catalog.all().get(id)
    if (!provider) return null
    return {
      id,
      name: provider.name,
      methods: (sync().data.provider_auth[id] ?? [{ type: "api", label: "API key" }]).map(
        (method, index): IntegrationMethod =>
          method.type === "api" ? { type: "key", label: method.label } : { ...method, id: String(index) },
      ),
      connections: id === "anthropic" ? [{ type: "credential" as const, id: "story-key", label: "Storybook" }] : [],
    }
  }
  const api = {
    integration: {
      list: async () => ({ location, data: [...catalog.all().keys()].flatMap((id) => integration(id) ?? []) }),
      get: async (input: { integrationID: string }) => ({ location, data: integration(input.integrationID) }),
      connect: { key: async () => undefined },
      oauth: {
        connect: async (input: IntegrationOauthConnectInput) => ({
          location,
          data: {
            attemptID: `story-${input.integrationID}-${input.methodID}`,
            url: "https://example.com/oauth",
            mode: input.methodID === "1" ? ("code" as const) : ("auto" as const),
            instructions: input.methodID === "1" ? "Paste the authorization code" : "Confirmation code: ABCD-EFGH",
            time,
          },
        }),
        // The browser-login story remains pending until the user completes its external flow.
        status: async () => ({ location, data: { status: "pending" as const, time } }),
        complete: async () => undefined,
      },
    },
  }
  return () => ({ client, api, scope: "story-server", server: { type: "mock" }, protocolKind: () => "v2" as const })
}

export function useServerProtocol() {
  return () => "v2" as const
}

export function ServerSDKProvider(props: { children?: unknown }) {
  return props.children
}
