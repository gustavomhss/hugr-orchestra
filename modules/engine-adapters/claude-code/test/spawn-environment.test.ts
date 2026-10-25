import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeSDK } from "@orchestra/engine-claude-code/sdk"
import { tmpdir } from "../../../../packages/core/test/fixture/tmpdir"

// Spawn-environment audit (meta-harness PLAN.md §3, V2-V4): Claude Code gets the owner's environment as it is.
// Orchestra sets no login token, scope, plan, tier or host-managed provider variable, and strips nothing the owner set,
// so the owner's own ANTHROPIC_API_KEY reaches Claude Code untouched.

const ORCHESTRA_AUTH = /^CLAUDE_CODE_OAUTH_|_SUBSCRIPTION_TYPE$|_RATE_LIMIT_TIER$|_PROVIDER_MANAGED_BY_HOST$/

function audit(env: Record<string, string | undefined>) {
  return Object.keys(env).filter((key) => ORCHESTRA_AUTH.test(key.toUpperCase()))
}

test("the audit flags every variable the old engine injected", () => {
  expect(audit({ CLAUDE_CODE_OAUTH_TOKEN: "t", CLAUDE_CODE_OAUTH_SCOPES: "s", CLAUDE_CODE_SUBSCRIPTION_TYPE: "max",
    CLAUDE_CODE_RATE_LIMIT_TIER: "tier", CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "1", HOME: "/home", ANTHROPIC_API_KEY: "k" }))
    .toEqual(["CLAUDE_CODE_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_SCOPES", "CLAUDE_CODE_SUBSCRIPTION_TYPE", "CLAUDE_CODE_RATE_LIMIT_TIER",
      "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST"])
})

test("the environment a real SDK query hands the binary carries no Orchestra auth and the owner's API key untouched", async () => {
  await using dir = await tmpdir()
  const owner = { HOME: dir.path, PATH: process.env.PATH ?? "", CLAUDE_CONFIG_DIR: dir.path, ANTHROPIC_API_KEY: "user-api-key",
    ANTHROPIC_BASE_URL: "https://owner-gateway.invalid" }
  const captured: Record<string, string | undefined>[] = []
  const controller = new AbortController()
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: { type: "preset" as const, preset: "claude_code" as const }, pathToClaudeCodeExecutable: process.execPath,
    env: { ...owner, ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1" }, abortController: controller,
    spawnClaudeCodeProcess: (options) => {
      captured.push(options.env)
      return spawn(process.execPath, ["-e", "process.exit(0)"], { env: options.env, stdio: ["pipe", "pipe", "pipe"] })
    } })
  expect(lifetime.options.env).toEqual(owner)
  // The local child exits at once, so the SDK reports a failed session; only the environment it spawned with matters.
  const session = query({ prompt: "No provider work: local child only", options: lifetime.options })
  await Promise.race([(async () => { for await (const _ of session) {} })().catch(() => {}), Bun.sleep(5_000)])
  controller.abort()
  session.close()
  await lifetime.join()
  expect(captured).toHaveLength(1)
  expect(audit(captured[0])).toEqual([])
  expect(captured[0].ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
  for (const [key, value] of Object.entries(owner)) expect(captured[0][key]).toBe(value)
}, 15_000)

test("the default spawner's child process sees the owner's environment and no Orchestra auth", async () => {
  await using dir = await tmpdir()
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
    env: { ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1", CLAUDE_CONFIG_DIR: dir.path, ANTHROPIC_API_KEY: "user-api-key" } })
  const child = lifetime.options.spawnClaudeCodeProcess({ command: process.execPath,
    args: ["-e", "process.stdout.write(JSON.stringify(process.env));"], env: lifetime.options.env, signal: new AbortController().signal })
  const output = (async () => {
    const chunks: string[] = []
    for await (const chunk of child.stdout) chunks.push(chunk.toString())
    return chunks.join("")
  })()
  await lifetime.join()
  const env: Record<string, string> = JSON.parse(await output)
  expect(audit(env)).toEqual([])
  expect(env.ANTHROPIC_API_KEY).toBe("user-api-key")
})
