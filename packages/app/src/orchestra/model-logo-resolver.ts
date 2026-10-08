import { iconNames } from "@orchestra/ui/icons/provider"

export type ModelReference = {
  id: string
  providerID: string
  variant?: string
  manufacturer?: string
}

export type ModelActivity = "running" | "waiting" | "idle"

const manufacturers: Record<string, string> = {
  "claude-3.5-sonnet": "anthropic",
  "claude-3.5-haiku": "anthropic",
  "claude-3-5-sonnet": "anthropic",
  "claude-3-5-haiku": "anthropic",
  "claude-sonnet-4": "anthropic",
  "claude-opus-4": "anthropic",
  "claude-sonnet-4-5": "anthropic",
  "claude-sonnet-4-6": "anthropic",
  "claude-opus-4-5": "anthropic",
  "claude-opus-4-6": "anthropic",
  "claude-haiku-4-5": "anthropic",
  "gpt-5-codex": "openai",
  "gpt-5": "openai",
  "gemini-2.5-pro": "google",
  "deepseek-chat": "deepseek",
  "deepseek-r1": "deepseek",
  "qwen3-coder": "alibaba",
  "qwen3-coder-plus": "alibaba",
  "qwen3-coder-flash": "alibaba",
}

const namespaces: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  deepseek: "deepseek",
  google: "google",
  qwen: "alibaba",
  alibaba: "alibaba",
}

export function resolveModelLogo(model?: ModelReference) {
  const id = model?.id ?? ""
  const namespace = id.includes("/") ? id.split("/")[0].toLowerCase() : ""
  // Delivery connections and SDK transports are not manufacturer metadata.
  const manufacturer =
    model?.manufacturer ??
    (Object.hasOwn(manufacturers, id) ? manufacturers[id] : undefined) ??
    (Object.hasOwn(namespaces, namespace) ? namespaces[namespace] : undefined)
  const router = model?.providerID === "opencode-go" ? "opencode" : model?.providerID
  if (manufacturer && iconNames.some((name) => name === manufacturer)) {
    return { logo: manufacturer, source: "manufacturer" as const }
  }
  if (router && iconNames.some((name) => name === router)) return { logo: router, source: "router" as const }
  return { logo: "neutral", source: "neutral" as const }
}

export function principalModel(messages: readonly { type: string; model?: ModelReference }[] | undefined) {
  // Read the session's source messages: projected shell turns also look like assistants.
  return messages?.findLast((message) => message.type === "assistant" && message.model)?.model
}

export function createPrincipalModel() {
  // One executed reference per open tab; missing/paginated history is not proof of an empty session.
  let executed: ModelReference | undefined
  return (messages: Parameters<typeof principalModel>[0]) => {
    const model = principalModel(messages)
    if (model) executed = { ...model }
    return executed
  }
}

export function modelActivity(input: { waiting: boolean; running: boolean; draft?: boolean }): ModelActivity {
  if (input.draft) return "idle"
  if (input.waiting) return "waiting"
  return input.running ? "running" : "idle"
}
