import { describe, expect, test } from "bun:test"
import { createRoot, getOwner } from "solid-js"
import { createTabMemory } from "@/context/tab-memory"
import { createPrincipalModel, modelActivity, principalModel, resolveModelLogo } from "./model-logo-resolver"

describe("session model manufacturer", () => {
  test("identifies the maker even when another company routes the request", () => {
    expect(resolveModelLogo({ id: "gpt-5", providerID: "opencode" })).toEqual({
      logo: "openai",
      source: "manufacturer",
    })
    expect(resolveModelLogo({ id: "anthropic/claude-sonnet-4", providerID: "openrouter" }).logo).toBe("anthropic")
    expect(resolveModelLogo({ id: "deepseek/deepseek-chat", providerID: "openrouter" }).logo).toBe("deepseek")
  })

  test("recognizes Qwen's maker as Alibaba, including catalog namespaces", () => {
    expect(resolveModelLogo({ id: "qwen3-coder", providerID: "opencode" }).logo).toBe("alibaba")
    expect(resolveModelLogo({ id: "qwen/qwen3-coder", providerID: "openrouter" }).logo).toBe("alibaba")
    expect(resolveModelLogo({ id: "Qwen/Qwen3-Coder-480B-A35B-Instruct", providerID: "openrouter" }).logo).toBe(
      "alibaba",
    )
  })

  test("honors explicit manufacturer metadata before catalog inference", () => {
    expect(resolveModelLogo({ id: "gpt-5", providerID: "openrouter", manufacturer: "google" }).logo).toBe("google")
    expect(resolveModelLogo({ id: "gpt-5", providerID: "openrouter", manufacturer: "private-lab" })).toEqual({
      logo: "openrouter",
      source: "router",
    })
  })

  test("unknown or assetless makers fall back to the actual router", () => {
    expect(resolveModelLogo({ id: "private-model", providerID: "opencode" })).toEqual({
      logo: "opencode",
      source: "router",
    })
    expect(resolveModelLogo({ id: "private-model", providerID: "opencode-go" }).logo).toBe("opencode")
    expect(resolveModelLogo({ id: "custom", providerID: "openrouter", manufacturer: "private-lab" }).logo).toBe(
      "openrouter",
    )
  })

  test("does not fabricate ownership from aliases, display names or compatible transports", () => {
    const model = {
      id: "my-claude-looking-alias",
      providerID: "openrouter",
      name: "Claude GPT",
      api: { npm: "@ai-sdk/openai-compatible" },
    }
    expect(resolveModelLogo(model)).toEqual({ logo: "openrouter", source: "router" })
    expect(resolveModelLogo({ id: "gpt-private-alias", providerID: "opencode" }).source).toBe("router")
  })

  test("unknown routes use a neutral model symbol, never ProviderIcon's Synthetic fallback", () => {
    expect(resolveModelLogo({ id: "private-model", providerID: "private-route" })).toEqual({
      logo: "neutral",
      source: "neutral",
    })
    expect(resolveModelLogo({ id: "toString", providerID: "constructor" }).logo).toBe("neutral")
    expect(resolveModelLogo()).toEqual({ logo: "neutral", source: "neutral" })
  })
})

describe("principal execution identity", () => {
  const first = { id: "gpt-5", providerID: "opencode" }
  const last = { id: "qwen3-coder", providerID: "openrouter" }
  const next = { id: "claude-sonnet-4", providerID: "anthropic" }

  test("uses the latest real assistant, including an unfinished provider turn", () => {
    expect(
      principalModel([
        { type: "assistant", model: first },
        { type: "assistant", model: last },
        { type: "model-switched", model: next },
        { type: "user", model: next },
        { type: "shell", model: next },
      ]),
    ).toBe(last)
  })

  test("missing or paginated history does not prove that the selected model executed", () => {
    const page = [...Array.from({ length: 19 }, () => ({ type: "shell" })), { type: "model-switched", model: next }]
    expect(principalModel(undefined)).toBeUndefined()
    expect(principalModel(page)).toBeUndefined()
    expect(resolveModelLogo(createPrincipalModel()(page)).logo).toBe("neutral")
    expect(principalModel([{ type: "assistant", model: last }])).toBe(last)
    expect(principalModel([])).toBeUndefined()
  })

  test("retains only a known execution per tab until that tab closes", () => {
    createRoot((dispose) => {
      const memory = createTabMemory(getOwner())
      const root = memory.ensure("server-A/root", "executed-model", createPrincipalModel)
      const child = memory.ensure("server-A/child", "executed-model", createPrincipalModel)
      const otherServer = memory.ensure("server-B/root", "executed-model", createPrincipalModel)
      expect(root([{ type: "assistant", model: first }])).toEqual(first)
      expect(child([{ type: "assistant", model: last }])).toEqual(last)
      expect(root([{ type: "model-switched", model: next }])).toEqual(first)
      expect(root(undefined)).toEqual(first)
      expect(child([])).toEqual(last)
      expect(otherServer(undefined)).toBeUndefined()
      expect(memory.ensure("server-A/root", "executed-model", createPrincipalModel)).toBe(root)
      expect(root([{ type: "assistant", model: next }])).toEqual(next)
      memory.remove("server-A/root")
      expect(memory.ensure("server-A/root", "executed-model", createPrincipalModel)(undefined)).toBeUndefined()
      memory.dispose()
      dispose()
    })
  })

  test("a descendant's model and a new composer choice cannot replace root history", () => {
    const history = {
      root: [{ type: "assistant", model: first }],
      child: [{ type: "assistant", model: last }],
    }
    expect(resolveModelLogo(principalModel(history.root)).logo).toBe("openai")
    expect(resolveModelLogo(principalModel(history.child)).logo).toBe("alibaba")
  })

  test("human waits override live work while stopped turns retain their last model", () => {
    expect(modelActivity({ waiting: true, running: true })).toBe("waiting")
    expect(modelActivity({ waiting: true, running: false })).toBe("waiting")
    expect(modelActivity({ waiting: false, running: true })).toBe("running")
    expect(modelActivity({ waiting: false, running: false })).toBe("idle")
    expect(principalModel([{ type: "assistant", model: last }])).toBe(last)
  })

  test("new drafts show their own configured model statically", () => {
    expect(resolveModelLogo(last).logo).toBe("alibaba")
    expect(modelActivity({ draft: true, waiting: false, running: true })).toBe("idle")
    expect(modelActivity({ draft: true, waiting: true, running: true })).toBe("idle")
  })
})
