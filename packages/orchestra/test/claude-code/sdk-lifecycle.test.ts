import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { tmpdir } from "../fixture/fixture"

const login = { claudeAiOauth: {
  accessToken: "local-test-not-a-real-token", refreshToken: "local-test-not-a-real-refresh",
  expiresAt: 4102444800000, scopes: ["user:inference"],
} }

test("API-only bare mode fails before credential lookup or spawn", async () => {
  const lifetime = ClaudeCodeSDK.processLifetime({ env: {}, extraArgs: { bare: null }, spawnClaudeCodeProcess: () => {
    throw new Error("spawn must not run")
  } })
  expect(() => lifetime.options.spawnClaudeCodeProcess({ command: "unused", args: ["--bare"], env: lifetime.options.env,
    signal: new AbortController().signal })).toThrow("Claude Code bare mode cannot enforce machine OAuth login")
  await lifetime.join()
})

for (const abort of [false, true]) {
  test(`real SDK return does not confirm child exit (abort=${abort})`, async () => {
    await using dir = await tmpdir({ init: (dir) => Bun.write(`${dir}/.credentials.json`, JSON.stringify(login)) })
    const controller = new AbortController()
    const spawned: ReturnType<typeof spawn>[] = []
    const lifetime = ClaudeCodeSDK.processLifetime({
      env: { CLAUDE_CONFIG_DIR: dir.path }, abortController: controller,
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

test("explicit machine env removes ambient API/auth/backend overrides and preserves login essentials", async () => {
  await using dir = await tmpdir({ init: (dir) => Bun.write(`${dir}/.credentials.json`, JSON.stringify(login)) })
  const env = {
    HOME: dir.path, PATH: process.env.PATH ?? "", CLAUDE_CONFIG_DIR: dir.path, USER: "test-user",
    ANTHROPIC_API_KEY: "paid-key", ANTHROPIC_AUTH_TOKEN: "paid-auth", ANTHROPIC_BASE_URL: "https://wrong.invalid",
    ANTHROPIC_CUSTOM_HEADERS: "Authorization: paid", CLAUDE_CODE_OAUTH_TOKEN: "override-login",
    CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR: "3", CLAUDE_CODE_USE_BEDROCK: "1", CLAUDE_CODE_USE_VERTEX: "1",
    CLAUDE_CODE_USE_FOUNDRY: "1", CLAUDE_CODE_USE_ANTHROPIC_AWS: "1", CLAUDE_CODE_USE_MANTLE: "1",
    AWS_BEARER_TOKEN_BEDROCK: "paid", CLOUDSDK_AUTH_ACCESS_TOKEN: "paid", NODE_OPTIONS: "--require paid",
    CLAUDE_CODE_SESSION_ACCESS_TOKEN: "host-override", CLAUDE_CODE_CUSTOM_OAUTH_URL: "https://wrong.invalid",
    claude_code_use_vertex: "1", ANTHROPIC_NEW_BACKEND: "future-override",
  }
  const captured: NonNullable<Parameters<typeof query>[0]["options"]>["env"][] = []
  const lifetime = ClaudeCodeSDK.processLifetime({ env, spawnClaudeCodeProcess: (options) => {
    captured.push(options.env)
    return spawn(process.execPath, ["-e", "process.exit(0)"], { env: options.env, stdio: ["pipe", "pipe", "pipe"] })
  } })
  expect(lifetime.options.env).toEqual({ HOME: dir.path, PATH: env.PATH, CLAUDE_CONFIG_DIR: dir.path, USER: "test-user",
    CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "1" })
  expect(env.ANTHROPIC_API_KEY).toBe("paid-key")
  lifetime.options.spawnClaudeCodeProcess({ command: "preserved-spawner", args: ["unchanged"], cwd: dir.path,
    signal: new AbortController().signal, env: { ...env, CLAUDE_AGENT_SDK_VERSION: "0.3.289" } })
  await lifetime.join()
  expect(captured).toHaveLength(1)
  expect(captured[0]).toEqual({ ...lifetime.options.env, CLAUDE_AGENT_SDK_VERSION: "0.3.289",
    CLAUDE_CODE_OAUTH_TOKEN: login.claudeAiOauth.accessToken, CLAUDE_CODE_OAUTH_SCOPES: "user:inference" })
})

test("missing, malformed, non-inference, and expired machine login fail before supplied spawn", async () => {
  await using dir = await tmpdir()
  let spawned = 0
  const lifetime = ClaudeCodeSDK.processLifetime({ env: { CLAUDE_CONFIG_DIR: dir.path }, spawnClaudeCodeProcess: () => {
    spawned++
    throw new Error("spawn must not run")
  } })
  const run = () => lifetime.options.spawnClaudeCodeProcess({ command: "unused", args: [], env: lifetime.options.env,
    signal: new AbortController().signal })
  expect(run).toThrow("Claude Code machine login unavailable")
  for (const contents of ["not-json", JSON.stringify({ apiKey: "paid" }),
    JSON.stringify({ claudeAiOauth: { ...login.claudeAiOauth, scopes: [] } }),
    JSON.stringify({ claudeAiOauth: { ...login.claudeAiOauth, expiresAt: 0 } }),
    JSON.stringify({ claudeAiOauth: { ...login.claudeAiOauth, expiresAt: 0, refreshToken: undefined } })]) {
    await Bun.write(`${dir.path}/.credentials.json`, contents)
    expect(run).toThrow("Claude Code machine login unavailable")
  }
  expect(spawned).toBe(0)
  await lifetime.join()
})

test("default spawner forwards command, args, cwd, env and joins fast exit", async () => {
  await using dir = await tmpdir({ init: (dir) => Bun.write(`${dir}/.credentials.json`, JSON.stringify(login)) })
  const lifetime = ClaudeCodeSDK.processLifetime({ env: { CLAUDE_CONFIG_DIR: dir.path } })
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
  expect(observed.env.ANTHROPIC_API_KEY).toBeUndefined()
  expect(observed.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(login.claudeAiOauth.accessToken)
})

test("default spawner observes failed spawn and aborted process without mistaking error for exit", async () => {
  await using dir = await tmpdir({ init: (dir) => Bun.write(`${dir}/.credentials.json`, JSON.stringify(login)) })
  const failed = ClaudeCodeSDK.processLifetime({ env: { CLAUDE_CONFIG_DIR: dir.path } })
  failed.options.spawnClaudeCodeProcess({ command: `${dir.path}/missing`, args: [], env: failed.options.env,
    signal: new AbortController().signal })
  await expect(failed.join()).rejects.toThrow()

  const controller = new AbortController()
  const lifetime = ClaudeCodeSDK.processLifetime({ env: { CLAUDE_CONFIG_DIR: dir.path } })
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

for (const backend of [false, true]) {
test(`pinned CLI selects current local OAuth over conflicting settings (backend=${backend})`, async () => {
  await using dir = await tmpdir({ init: (dir) => Bun.write(`${dir}/.credentials.json`, JSON.stringify(login)) })
  const binary = createRequire(import.meta.resolve("@anthropic-ai/claude-agent-sdk")).resolve(
    `@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude${process.platform === "win32" ? ".exe" : ""}`,
  )
  const conflicts = JSON.stringify({
    forceLoginMethod: "console", apiKeyHelper: "printf synthetic-api-key",
    env: { ANTHROPIC_API_KEY: "synthetic-api-key", ANTHROPIC_AUTH_TOKEN: "synthetic-auth",
      CLAUDE_CODE_OAUTH_TOKEN: "synthetic-managed-oauth", CLAUDE_CODE_USE_VERTEX: backend ? "1" : "0",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:1", CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: "0" },
  })
  await Bun.write(`${dir.path}/settings-conflict.json`, conflicts)
  const args = ["--settings", `${dir.path}/settings-conflict.json`, "--managed-settings", conflicts, "auth", "status", "--json"]
  const current = { claudeAiOauth: { ...login.claudeAiOauth, accessToken: "synthetic-current-local-token" } }
  const observed: string[] = []
  const lifetime = ClaudeCodeSDK.processLifetime({ env: { HOME: dir.path, CLAUDE_CONFIG_DIR: dir.path, USER: "",
    CLAUDE_CODE_OAUTH_TOKEN: "synthetic-ambient-oauth" }, spawnClaudeCodeProcess: (options) => {
    expect(options.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(current.claudeAiOauth.accessToken)
    const child = spawn(binary, args, { env: { ...options.env,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      DISABLE_AUTOUPDATER: "1", DISABLE_TELEMETRY: "1", }, stdio: ["pipe", "pipe", "pipe"] })
    child.stdout.on("data", (chunk: Buffer) => observed.push(chunk.toString()))
    child.stderr.resume()
    return child
  } })
  // Read at spawn, not helper construction: a freshly rotated local login must win.
  await Bun.write(`${dir.path}/.credentials.json`, JSON.stringify(current))
  const child = lifetime.options.spawnClaudeCodeProcess({ command: binary, args: [], env: lifetime.options.env,
    signal: new AbortController().signal })
  await lifetime.join()
  expect(child.exitCode).toBe(0)
  const protectedStatus = JSON.parse(observed.join(""))
  expect(protectedStatus).toMatchObject({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" })
  expect(protectedStatus.apiKeySource).toBeUndefined()

  // Positive control: the same --settings/--managed-settings fixture wins without launch-only protection.
  const control = spawn(binary, args, { env: {
    HOME: dir.path, CLAUDE_CONFIG_DIR: dir.path,
    CLAUDE_CODE_OAUTH_TOKEN: login.claudeAiOauth.accessToken,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", DISABLE_AUTOUPDATER: "1", DISABLE_TELEMETRY: "1",
  }, stdio: ["pipe", "pipe", "pipe"] })
  const output: string[] = []
  control.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()))
  control.stderr.resume()
  await new Promise<void>((resolve) => control.once("exit", () => resolve()))
  expect(JSON.parse(output.join(""))).toMatchObject({ apiProvider: backend ? "vertex" : "firstParty",
    apiKeySource: "ANTHROPIC_API_KEY", forcedLoginMethod: "console" })
}, 30000)
}
