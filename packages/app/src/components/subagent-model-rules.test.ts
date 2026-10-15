import { describe, expect, test } from "bun:test"
import { effectiveModelState, hasModelScope, toggleModelRules, wildcardMatch } from "./subagent-model-rules"

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
})
