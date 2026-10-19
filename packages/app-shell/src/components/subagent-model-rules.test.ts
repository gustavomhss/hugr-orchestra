import { describe, expect, test } from "bun:test"
import type { Provider } from "@orchestra/sdk/v2/client"
import {
  allowsEveryModel,
  connectedSubagentModels,
  createModelRuleEditor,
  effectiveModelState,
  hasModelScope,
  modelUnavailable,
  parseModelKey,
  toggleModelRules,
  wildcardMatch,
  type ModelRule,
} from "./subagent-model-rules"

describe("subagent model rules", () => {
  test("wildcardMatch handles model-scoped globs", () => {
    expect(wildcardMatch("openrouter/x", "openrouter/*")).toBe(true)
    expect(wildcardMatch("openrouter/x", "*/*")).toBe(true)
    expect(wildcardMatch("general", "*/*")).toBe(false)
    expect(wildcardMatch("general", "*")).toBe(true)
    expect(wildcardMatch("openrouter/x", "groq/*")).toBe(false)
    expect(wildcardMatch("provider\\model", "provider/*")).toBe(true)
    expect(wildcardMatch("provider/model", "provider\\*")).toBe(true)
    expect(wildcardMatch("Provider/model", "provider/*")).toBe(false)
    expect(wildcardMatch("provider/model", "provider/model *")).toBe(false)
  })

  test("model rules finish on a glob that caused regex backtracking", async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `import { wildcardMatch } from ${JSON.stringify(new URL("./subagent-model-rules.ts", import.meta.url).href)};
         console.log(JSON.stringify([
           wildcardMatch("ab".repeat(50_000), "*a*b*a*b*c"),
           wildcardMatch("ab".repeat(50_000) + "c", "*a*b*a*b*c"),
           wildcardMatch("ab".repeat(50_000) + "c", "*a*b*a*b*d*c")
         ]));`,
      ],
      { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" },
    )
    // A regressed synchronous matcher cannot be stopped by Bun's in-process test timeout.
    const timer = setTimeout(() => child.kill(), 5_000)
    expect(await child.exited.finally(() => clearTimeout(timer))).toBe(0)
    expect(JSON.parse(await new Response(child.stdout).text())).toEqual([false, true, false])
  })

  test("hasModelScope detects only task rules with model patterns", () => {
    expect(hasModelScope([])).toBe(false)
    expect(hasModelScope([{ permission: "task", pattern: "general", action: "allow" }])).toBe(false)
    expect(hasModelScope([{ permission: "task", pattern: "openrouter/*", action: "allow" }])).toBe(true)
    expect(hasModelScope([{ permission: "bash", pattern: "a/b", action: "allow" }])).toBe(false)
  })

  test("effectiveModelState resolves last match wins", () => {
    const rules = [
      { permission: "task", pattern: "*/*", action: "deny" as const },
      { permission: "task", pattern: "openrouter/*", action: "allow" as const },
    ]
    expect(effectiveModelState(rules, "openrouter", "x")).toBe("allow")
    expect(effectiveModelState(rules, "groq", "x")).toBe("deny")
    expect(effectiveModelState([], "groq", "x")).toBeUndefined()
    expect(
      effectiveModelState(
        [...rules, { permission: "task", pattern: "openrouter/x", action: "deny" as const }],
        "openrouter",
        "x",
      ),
    ).toBe("deny")
  })

  test("toggleModelRules writes the deny baseline once", () => {
    expect(toggleModelRules([], "openrouter", "x", true)).toEqual([
      { permission: "task", pattern: "*/*", action: "deny" },
      { permission: "task", pattern: "openrouter/x", action: "allow" },
    ])
    const scoped = [
      { permission: "task", pattern: "*/*", action: "deny" as const },
      { permission: "task", pattern: "openrouter/x", action: "allow" as const },
    ]
    expect(toggleModelRules(scoped, "groq", "y", true)).toEqual([
      { permission: "task", pattern: "groq/y", action: "allow" },
    ])
    expect(toggleModelRules(scoped, "openrouter", "x", false)).toEqual([
      { permission: "task", pattern: "openrouter/x", action: "deny" },
    ])
  })

  test("an ask rule overrides a previous allow rather than presenting stale permission", () => {
    expect(
      effectiveModelState(
        [
          { permission: "task", pattern: "*/*", action: "allow" },
          { permission: "task", pattern: "openrouter/team/*", action: "ask" },
        ],
        "openrouter",
        "team/model",
      ),
    ).toBe("ask")
  })

  test("allowsEveryModel holds only while the last model-scoped task rule allows every model", () => {
    const deny: ModelRule = { permission: "task", pattern: "*/*", action: "deny" }
    const all: ModelRule = { permission: "task", pattern: "*/*", action: "allow" }
    const one: ModelRule = { permission: "task", pattern: "router/x", action: "allow" }
    expect(allowsEveryModel([])).toBe(false)
    expect(allowsEveryModel([deny, one])).toBe(false)
    expect(allowsEveryModel([deny, one, all])).toBe(true)
    expect(allowsEveryModel([all, { ...one, action: "deny" }])).toBe(false)
    expect(allowsEveryModel([all, { permission: "task", pattern: "general", action: "deny" }])).toBe(true)
  })

  test("a scoped v1 session returns to inherit by appending an allow-all rule", async () => {
    const stored: ModelRule[] = [
      { permission: "task", pattern: "*/*", action: "deny" },
      { permission: "task", pattern: "router/x", action: "allow" },
    ]
    const writes: ModelRule[][] = []
    const editor = createModelRuleEditor({
      read: () => stored,
      write: async (rules) => {
        writes.push(rules)
        stored.push(...rules)
        return [...stored]
      },
    })
    expect(allowsEveryModel(editor.rules())).toBe(false)
    await editor.inherit()
    expect(writes).toEqual([[{ permission: "task", pattern: "*/*", action: "allow" }]])
    expect(allowsEveryModel(editor.rules())).toBe(true)
    expect(effectiveModelState(editor.rules(), "groq", "y")).toBe("allow")
  })

  test("model identities keep every slash after the provider separator", () => {
    expect(parseModelKey("openrouter/team/model/version")).toEqual({
      providerID: "openrouter",
      modelID: "team/model/version",
    })
    expect(parseModelKey("openrouter/")).toBeUndefined()
    expect(parseModelKey("model")).toBeUndefined()
    expect(toggleModelRules([], "openrouter", "team/model/version", true).at(-1)?.pattern).toBe(
      "openrouter/team/model/version",
    )
  })

  test("reports missing, deprecated and non-agent models instead of treating a connected provider as sufficient", () => {
    const model = { capabilities: { toolcall: true, input: { text: true }, output: { text: true } } }
    expect(modelUnavailable(model)).toBeUndefined()
    expect(modelUnavailable()).toBe("unavailable")
    expect(modelUnavailable({ ...model, status: "deprecated" })).toBe("unavailable")
    expect(modelUnavailable({ capabilities: { ...model.capabilities, toolcall: false } })).toBe("incompatible")
    expect(modelUnavailable({ capabilities: { ...model.capabilities, input: { text: false } } })).toBe("incompatible")
    expect(modelUnavailable({ capabilities: { ...model.capabilities, output: { text: false } } })).toBe("incompatible")
  })

  test("connected models stay selectable regardless of age, with incompatible choices available for explanation", () => {
    const model = {
      id: "team/old-model",
      name: "Old model",
      providerID: "router",
      api: { id: "team/old-model", url: "", npm: "" },
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolcall: true,
        interleaved: false,
        input: { text: true, audio: false, image: false, video: false, pdf: false },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
      },
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: 1000, output: 100 },
      status: "active" as const,
      options: {},
      headers: {},
      release_date: "2020-01-01",
    }
    const provider: Provider = {
      id: "router",
      name: "Router",
      source: "custom",
      env: [],
      options: {},
      models: {
        [model.id]: model,
        image: { ...model, id: "image", capabilities: { ...model.capabilities, toolcall: false } },
      },
    }
    const choices = connectedSubagentModels([provider])
    expect(choices.map((item) => item.id)).toEqual(["team/old-model", "image"])
    expect(choices[0].provider.id).toBe("router")
    expect(modelUnavailable(choices[0])).toBeUndefined()
    expect(modelUnavailable(choices[1])).toBe("incompatible")
  })

  test("acknowledged selections survive another toggle before the session event arrives", async () => {
    const writes: ModelRule[][] = []
    const persisted: ModelRule[] = []
    const editor = createModelRuleEditor({
      read: () => [], // Session event deliberately remains stale.
      write: async (rules) => {
        writes.push(rules)
        persisted.push(...rules)
        return [...persisted]
      },
    })
    await editor.set("router", "team/first", true)
    expect(effectiveModelState(editor.rules(), "router", "team/first")).toBe("allow")
    await editor.set("router", "team/second", true)
    expect(writes[1]).toEqual([{ permission: "task", pattern: "router/team/second", action: "allow" }])
    expect(effectiveModelState(editor.rules(), "router", "team/first")).toBe("allow")
    expect(effectiveModelState(editor.rules(), "router", "team/second")).toBe("allow")
  })

  test("pending writes are serialized and failures retain acknowledged choices for retry", async () => {
    const gate = Promise.withResolvers<ModelRule[]>()
    const writes: ModelRule[][] = []
    const initial: ModelRule[] = [{ permission: "task", pattern: "router/first", action: "allow" }]
    const editor = createModelRuleEditor({
      read: () => initial,
      write: (rules) => {
        writes.push(rules)
        return writes.length === 1 ? gate.promise : Promise.resolve([...initial, ...rules])
      },
    })
    const first = editor.set("router", "first", false)
    expect(editor.state.saving).toBe(true)
    await editor.set("router", "second", true)
    expect(writes).toHaveLength(1)
    gate.reject(new Error("offline"))
    await first
    expect(editor.state.saving).toBe(false)
    expect(editor.state.failed).toBe(true)
    expect(effectiveModelState(editor.rules(), "router", "first")).toBe("allow")
    await editor.set("router", "first", false)
    expect(writes[1]).toEqual(writes[0])
    expect(editor.state.failed).toBe(false)
    expect(effectiveModelState(editor.rules(), "router", "first")).toBe("deny")
  })

  test("a newer session event takes precedence over the editor's cached acknowledgement", async () => {
    const session = { rules: [] as ModelRule[] }
    const editor = createModelRuleEditor({ read: () => session.rules, write: async (rules) => rules })
    await editor.set("router", "model", true)
    expect(effectiveModelState(editor.rules(), "router", "model")).toBe("allow")
    session.rules = [...editor.rules(), { permission: "task", pattern: "*/*", action: "deny" }]
    expect(effectiveModelState(editor.rules(), "router", "model")).toBe("deny")
  })

  test("two ACKs followed by the first ACK's event retain B until catch-up, including a rejected write", async () => {
    const session = { rules: [] as ModelRule[] }
    const server: ModelRule[] = []
    const writes: ModelRule[][] = []
    const editor = createModelRuleEditor({
      read: () => session.rules,
      write: async (rules) => {
        writes.push(rules)
        if (writes.length === 3) throw new Error("rejected")
        server.push(...rules)
        return [...server]
      },
    })
    await editor.set("router", "A", true)
    const first = [...server]
    await editor.set("router", "B", true)
    const second = [...server]
    // Event A arrives after HTTP ACK B; B must not flip to the deny baseline.
    session.rules = first
    expect(effectiveModelState(editor.rules(), "router", "A")).toBe("allow")
    expect(effectiveModelState(editor.rules(), "router", "B")).toBe("allow")
    await editor.set("router", "B", false)
    expect(editor.state.failed).toBe(true)
    expect(editor.rules()).toEqual(second)
    expect(effectiveModelState(editor.rules(), "router", "B")).toBe("allow")
    session.rules = second
    expect(editor.rules()).toBe(session.rules)
    session.rules = [...second, { permission: "task", pattern: "router/B", action: "deny" }]
    expect(editor.rules()).toBe(session.rules)
    expect(effectiveModelState(editor.rules(), "router", "B")).toBe("deny")
  })

  test("non-prefix authoritative replacements are not hidden behind an acknowledgement", async () => {
    const session = { rules: [] as ModelRule[] }
    const editor = createModelRuleEditor({ read: () => session.rules, write: async (rules) => rules })
    await editor.set("router", "A", true)
    session.rules = [{ permission: "task", pattern: "router/A", action: "deny" }]
    expect(editor.rules()).toBe(session.rules)
  })
})
