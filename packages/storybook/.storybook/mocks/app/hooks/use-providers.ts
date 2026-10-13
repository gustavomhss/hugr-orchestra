import { createProviderResource } from "@/hooks/provider-catalog"
import { decode64 } from "@/utils/base64"
import { useParams } from "@solidjs/router"
import type { Accessor } from "solid-js"

const model_id = "claude-3-7-sonnet"

export const popularProviders = [
  "opencode",
  "opencode-go",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
]

const provider = {
  id: "anthropic",
  name: "Anthropic",
  models: {
    [model_id]: {
      id: model_id,
      name: "Claude 3.7 Sonnet",
      cost: { input: 1, output: 1 },
      variants: { fast: {}, thinking: {} },
    },
  },
}

const popular = [
  { id: "opencode", name: "OpenCode Zen", models: {} },
  { id: "opencode-go", name: "OpenCode Go", models: {} },
  { id: "openai", name: "OpenAI", models: {} },
  provider,
  { id: "google", name: "Google", models: {} },
  { id: "github-copilot", name: "GitHub Copilot", models: {} },
]

const catalog = [
  ...popular,
  { id: "openrouter", name: "OpenRouter", models: {} },
  { id: "vercel", name: "Vercel AI Gateway", models: {} },
  { id: "302ai", name: "302.AI", models: {} },
  { id: "abacus", name: "Abacus", models: {} },
  { id: "abliteration", name: "abliteration.ai", models: {} },
  { id: "alibaba", name: "Alibaba", models: {} },
  { id: "alibaba-cn", name: "Alibaba (China)", models: {} },
  { id: "alibaba-coding-plan", name: "Alibaba Coding Plan", models: {} },
]

export function useProviders(directory?: Accessor<string | null | undefined>) {
  const params = useParams()
  const dir = () => (directory ? directory() : params.dir === undefined ? null : decode64(params.dir))
  return {
    directory: dir,
    refresh: async () => {
      if (dir() === undefined) throw new Error("Provider directory is unresolved")
    },
    all: () => new Map(catalog.map((item) => [item.id, item])),
    default: () => ({ anthropic: model_id }),
    defaultModel: () => ({ providerID: provider.id, modelID: model_id }),
    connected: () => [provider],
    paid: () => [[provider.id, provider] as const],
    popular: () => popular,
  }
}

export function useProviderDiscovery(directory?: Accessor<string | null | undefined>) {
  const providers = useProviders(directory)
  // Use the production resource boundary: unresolved scope loads, scoped failures stay local, retry refetches.
  const discovery = createProviderResource(
    () => {
      const value = providers.directory()
      return value === undefined ? undefined : { directory: value }
    },
    async () => [...providers.all().values()].map((item) => ({ id: item.id, name: item.name })),
  )
  return {
    all: () => discovery.data() ?? [],
    loading: () => providers.directory() === undefined || discovery.loading(),
    error: discovery.error,
    retry: discovery.retry,
  }
}
