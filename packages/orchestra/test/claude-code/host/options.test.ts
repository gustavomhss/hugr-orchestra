import { expect, test } from "bun:test"
import type { HookCallbackMatcher, McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeHostOptions } from "@/claude-code/host/options"
import { SessionID } from "@/session/schema"

// The Claude host's SDK options (meta-harness PLAN.md §4.3, §4.4; build brief hard rules): Claude Code's preset prompt
// with an appended text, the owner's own environment, built-ins untouched, and the plugin, MCP server and hooks wired.

const ORCHESTRA_AUTH = /^CLAUDE_CODE_OAUTH_|_SUBSCRIPTION_TYPE$|_RATE_LIMIT_TIER$|_PROVIDER_MANAGED_BY_HOST$|^CLAUDE_CODE_.*TOKEN/

const server = { type: "sdk", name: "orchestra" } as unknown as McpSdkServerConfigWithInstance
const hooks = { PreToolUse: [{ hooks: [async () => ({})] }] as HookCallbackMatcher[] }

function setup(agent: string) {
  const calls: { plugin: unknown[]; mcp: unknown[]; hooks: unknown[] } = { plugin: [], mcp: [], hooks: [] }
  const adapters: ClaudeHostOptions.Adapters = {
    plugin: async (ctx) => {
      calls.plugin.push(ctx)
      return { path: "/tmp/orchestra-plugin", seats: { "orchestra:archie": "archie", "orchestra:backend": "backend", "orchestra:jimmy": "jimmy" } }
    },
    mcp: (ctx) => {
      calls.mcp.push(ctx)
      return server
    },
    hooks: (ctx) => {
      calls.hooks.push(ctx)
      return hooks
    },
  }
  const ctx = { sessionID: SessionID.descending(), directory: "/repo/app", worktree: "/repo", agent, abort: new AbortController() }
  const env = { HOME: "/home/owner", PATH: "/bin", ANTHROPIC_API_KEY: "owner-key", CLAUDE_CONFIG_DIR: "/home/owner/.claude" }
  const build = (session: Parameters<typeof ClaudeHostOptions.build>[0]["session"] = {}) =>
    ClaudeHostOptions.build({ ctx, adapters, model: "claude-opus-5-5", session, abortController: new AbortController(), env })
  return { calls, ctx, env, build }
}

test("every seat keeps Claude Code's preset prompt; only an appended text is added", async () => {
  for (const agent of ["maestro", "backend", "jimmy"]) {
    const options = await setup(agent).build()
    expect(options.systemPrompt.type).toBe("preset")
    expect(options.systemPrompt.preset).toBe("claude_code")
    expect(typeof options.systemPrompt.append).toBe("string")
    // A main-thread agent would replace the preset (12-host-mechanics-verified.md, Agreement 1).
    expect(options.agent).toBeUndefined()
    expect(options.agents).toBeUndefined()
  }
})

test("Maestro's append delegates through Agent with plugin seats and names Orchestra's tools, without precedence or env", async () => {
  const append = (await setup("maestro").build()).systemPrompt.append ?? ""
  expect(append).toContain("Maestro on Claude Code")
  expect(append).toContain('subagent_type: "orchestra:<seat>"')
  expect(append).toContain("`orchestra:archie`, `orchestra:backend`, `orchestra:jimmy`")
  expect(append).toContain("Run `orchestra:archie` and `orchestra:backend` in the foreground")
  expect(append).toContain("mcp__orchestra__process")
  expect(append).toContain("mcp__orchestra__context_recall")
  expect(append).toContain("`mcp__orchestra__maestro_request_review` (Maestro only) runs the governed cold review")
  expect(append).toContain("An approved Relay workflow is dispatched with `mcp__orchestra__task`, never `Agent`")
  expect(append).toContain("TaskCreate and TaskUpdate")
  expect(append).toContain("TaskList or TaskGet")
  expect(append).not.toContain("TodoWrite")
  expect(append).not.toMatch(/use Grep|use Glob/i)
  expect(append).not.toMatch(/<env>|working directory:|precedence|follow them|override|instead of the Claude Code/i)
})

// Governed reviews and workflow dispatch are Maestro's, so another seat's body names neither.
test("another main-thread seat keeps a short scoped body without Maestro's governed tools", async () => {
  for (const seat of ["backend", "jimmy"]) {
    const append = (await setup(seat).build()).systemPrompt.append ?? ""
    expect(append).toContain(`\`${seat}\` seat`)
    expect(append).toContain("owner's main conversation")
    expect(append).toContain("mcp__orchestra__process")
    expect(append).toContain("use Bash for short commands")
    expect(append).not.toContain("Maestro")
    expect(append).not.toContain("maestro_request_review")
    expect(Buffer.byteLength(append, "utf8")).toBeLessThan(600)
  }
})

test("the environment is the owner's own plus non-auth flags: nothing stripped, no credential added", async () => {
  const { build, env } = setup("maestro")
  const options = await build()
  expect(options.env).toEqual({ ...env, CLAUDE_CODE_ENABLE_TODO_TOOLS: "1" })
  expect(Object.keys(ClaudeHostOptions.ENV_FLAGS).filter((key) => ORCHESTRA_AUTH.test(key))).toEqual([])
  expect(Object.keys(options.env ?? {}).filter((key) => ORCHESTRA_AUTH.test(key))).toEqual([])
  expect(options.env?.ANTHROPIC_API_KEY).toBe("owner-key")
})

test("built-in tools are never disabled, scoped or aliased", async () => {
  const options = await setup("maestro").build()
  expect(options.tools).toBeUndefined()
  expect(options.disallowedTools).toBeUndefined()
  expect(options.allowedTools).toBeUndefined()
  expect(options.toolAliases).toBeUndefined()
})

test("the plugin, the in-process MCP server and the hooks are wired with the session context and the seat map", async () => {
  const { build, calls, ctx } = setup("maestro")
  const options = await build()
  expect(options.plugins).toEqual([{ type: "local", path: "/tmp/orchestra-plugin" }])
  expect(options.mcpServers).toEqual({ orchestra: server })
  expect(options.mcpServers?.orchestra).toBe(server)
  expect(options.hooks).toBe(hooks)
  expect(calls.plugin).toEqual([ctx])
  const seats = { "orchestra:archie": "archie", "orchestra:backend": "backend", "orchestra:jimmy": "jimmy" }
  expect(calls.mcp).toEqual([{ ...ctx, seats }])
  expect(calls.hooks).toEqual([{ ...ctx, seats }])
})

test("settings and the output switches Claude Code already offers are on; cwd, model and session pass through", async () => {
  const options = await setup("maestro").build({ resume: "5d0f1f43-58b6-5a37-9d44-6f1c2d3e4f50" })
  expect(options.settingSources).toEqual(["project"])
  expect(options.includePartialMessages).toBe(true)
  expect(options.forwardSubagentText).toBe(true)
  expect(options.agentProgressSummaries).toBe(true)
  expect(options.thinking).toEqual({ type: "adaptive", display: "summarized" })
  expect(options.cwd).toBe("/repo/app")
  expect(options.model).toBe("claude-opus-5-5")
  expect(options.resume).toBe("5d0f1f43-58b6-5a37-9d44-6f1c2d3e4f50")
  expect(options.sessionStore).toBeUndefined()
})

test("an inherited CLAUDE_CODE_ENTRYPOINT is dropped so the session is not labelled as the parent Claude surface", () => {
  const env = { HOME: "/home/owner", CLAUDE_CODE_ENTRYPOINT: "claude-desktop", ANTHROPIC_API_KEY: "owner-key" }
  expect(ClaudeHostOptions.environment(env)).toEqual({ HOME: "/home/owner", ANTHROPIC_API_KEY: "owner-key", CLAUDE_CODE_ENABLE_TODO_TOOLS: "1" })
  expect(env.CLAUDE_CODE_ENTRYPOINT).toBe("claude-desktop")
})

test("the session's join reaches the MCP server and the hooks through the context", async () => {
  const { ctx } = setup("maestro")
  const join = { taskStarted: () => {}, taskNotification: () => {} }
  const seen: unknown[] = []
  await ClaudeHostOptions.build({ ctx, session: {}, abortController: new AbortController(), env: {}, adapters: {
    plugin: async () => ({ path: "/p", seats: {} }),
    mcp: (value) => { seen.push(value.join); return server },
    hooks: (value) => { seen.push(value.join); return hooks },
    join: () => join,
  } })
  expect(seen).toEqual([join, join])
})

test("seats the plugin defines through the SDK go in the agents option; the main thread stays the preset", async () => {
  const { ctx } = setup("maestro")
  const sdkAgents = { "orchestra:backend": { description: "backend", prompt: "Backend seat.", permissionMode: "acceptEdits" as const } }
  const options = await ClaudeHostOptions.build({ ctx, session: {}, abortController: new AbortController(), env: {}, adapters: {
    plugin: async () => ({ path: "/p", seats: { "orchestra:backend": "backend" }, sdkAgents }),
    mcp: () => server,
    hooks: () => hooks,
  } })
  expect(options.agents).toEqual(sdkAgents)
  expect(options.agent).toBeUndefined()
  expect(options.systemPrompt).toMatchObject({ type: "preset", preset: "claude_code" })
})

test("a session whose hooks carry no PreToolUse policy gate never starts", async () => {
  const { ctx } = setup("maestro")
  for (const missing of [{}, { PreToolUse: [] }, { PostToolUse: hooks.PreToolUse }])
    await expect(ClaudeHostOptions.build({ ctx, session: {}, abortController: new AbortController(), env: {}, adapters: {
      plugin: async () => ({ path: "/p", seats: {} }),
      mcp: () => server,
      hooks: () => missing,
    } })).rejects.toThrow("Orchestra's policy gate is missing")
})
