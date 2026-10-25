import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeSDK } from "@orchestra/engine-claude-code/sdk"
import { tmpdir } from "../../../../packages/core/test/fixture/tmpdir"

// Retain the deprecated rollout flag here to exercise child-environment compatibility stripping.
const approved = { ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1" }

for (const abort of [false, true]) {
  test(`real SDK return does not confirm child exit (abort=${abort})`, async () => {
    await using dir = await tmpdir()
    const controller = new AbortController()
    const spawned: ReturnType<typeof spawn>[] = []
    const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
      env: { ...approved, CLAUDE_CONFIG_DIR: dir.path }, abortController: controller,
      pathToClaudeCodeExecutable: process.execPath,
      spawnClaudeCodeProcess: (options) => {
        const child = spawn(process.execPath, ["-e", `
          process.on("SIGTERM", () => {});
          process.stdin.resume();
          process.stdin.on("end", () => setTimeout(() => process.exit(0), 2600));
          process.stdout.write("ready\\n");
        `], { env: options.env, stdio: ["pipe", "pipe", "pipe"] })
        spawned.push(child)
        return child
      },
    })
    const session = query({ prompt: "No provider work: local child only", options: lifetime.options })
    const child = spawned[0]
    try {
      await new Promise<void>((resolve) => child.stdout?.once("data", () => resolve()))
      if (abort) controller.abort()
      await session.return(undefined)
      expect(child.exitCode).toBeNull()
      await lifetime.join()
      if (process.platform === "win32" && abort) expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
      if (process.platform !== "win32" || !abort) expect(child.exitCode).toBe(0)
      expect(spawned).toHaveLength(1)
    } finally {
      child.kill("SIGKILL")
      session.close()
      await lifetime.join()
    }
  }, 10000)
}

test("default spawner forwards command, args, cwd, the owner's env and joins fast exit", async () => {
  await using dir = await tmpdir()
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
    env: { ...approved, CLAUDE_CONFIG_DIR: dir.path, ANTHROPIC_API_KEY: "user-api-key" } })
  const child = lifetime.options.spawnClaudeCodeProcess({ command: process.execPath,
    args: ["-e", "process.stdout.write(JSON.stringify({ cwd: process.cwd(), env: process.env }));"],
    cwd: dir.path, env: lifetime.options.env, signal: new AbortController().signal })
  const output = (async () => {
    const chunks: string[] = []
    for await (const chunk of child.stdout) chunks.push(chunk.toString())
    return chunks.join("")
  })()
  await lifetime.join()
  expect(child.exitCode).toBe(0)
  const observed = JSON.parse(await output)
  expect(observed.cwd).toBe(dir.path)
  expect(observed.env.CLAUDE_CONFIG_DIR).toBe(dir.path)
  expect(observed.env.ANTHROPIC_API_KEY).toBe("user-api-key")
  expect(observed.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
  expect(observed.env.ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
})

test("default spawner observes failed spawn and aborted process without mistaking error for exit", async () => {
  await using dir = await tmpdir()
  const failed = ClaudeCodeSDK.processLifetime({ systemPrompt: { type: "preset" as const, preset: "claude_code" as const }, env: { ...approved, CLAUDE_CONFIG_DIR: dir.path } })
  failed.options.spawnClaudeCodeProcess({ command: `${dir.path}/missing`, args: [], env: failed.options.env,
    signal: new AbortController().signal })
  await expect(failed.join()).rejects.toThrow()

  const controller = new AbortController()
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: { type: "preset" as const, preset: "claude_code" as const }, env: { ...approved, CLAUDE_CONFIG_DIR: dir.path } })
  const child = lifetime.options.spawnClaudeCodeProcess({ command: process.execPath, args: ["-e", `
    process.on("SIGTERM", () => setTimeout(() => process.exit(0), 100));
    setInterval(() => {}, 1000); process.stdout.write("ready");
  `], env: lifetime.options.env, signal: controller.signal })
  await new Promise<void>((resolve) => child.stdout.once("data", () => resolve()))
  controller.abort()
  if (process.platform !== "win32") expect(child.exitCode).toBeNull()
  await lifetime.join()
  if (process.platform === "win32") expect(child.exitCode !== null || child.signalCode != null).toBe(true)
  if (process.platform !== "win32") expect(child.exitCode).toBe(0)
})
