import { expect, spyOn, test } from "bun:test"
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { Effect } from "effect"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance, tmpdir } from "../fixture/fixture"
import { ClaudeEngineFixture } from "./engine-fixture"

// The Claude Code engine is paused until the owner approves its meta-harness plan (specs/claude-code-engine.md).

const PAUSED = "The Claude Code engine is paused until its meta-harness plan is approved by the owner."
const login = { claudeAiOauth: {
  accessToken: "local-test-not-a-real-token", expiresAt: 4102444800000, scopes: ["user:inference"],
} }

/** Spies on the real login reader; it fails instead of reading, so even a missing gate never touches a real login. */
function loginReader() {
  return spyOn(ClaudeCodeSDK.MachineLogin, "read").mockImplementation(() => {
    throw new Error("the machine login must not be read")
  })
}

test("without the owner's approval a real SDK query is refused before any login read or spawn", async () => {
  await using dir = await tmpdir({ init: (dir) => Bun.write(`${dir}/.credentials.json`, JSON.stringify(login)) })
  const read = loginReader()
  try {
    let spawned = 0
    const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: ClaudeCodeSDK.preset(),
      env: { HOME: dir.path, PATH: dir.path, CLAUDE_CONFIG_DIR: dir.path }, pathToClaudeCodeExecutable: process.execPath,
      spawnClaudeCodeProcess: () => {
        spawned++
        throw new Error("spawn must not run")
      } })
    const run = async () => {
      for await (const _ of query({ prompt: "refused before any process", options: lifetime.options })) {}
    }
    await expect(run()).rejects.toThrow(PAUSED)
    expect(read).not.toHaveBeenCalled()
    expect(spawned).toBe(0)
    await lifetime.join()
  } finally {
    read.mockRestore()
  }
})

test("with the owner's approval the real spawn path reads the login and reaches the transport", async () => {
  await using dir = await tmpdir({ init: (dir) => Bun.write(`${dir}/.credentials.json`, JSON.stringify(login)) })
  const read = spyOn(ClaudeCodeSDK.MachineLogin, "read")
  try {
    const tokens: (string | undefined)[] = []
    // PATH holds no `security`, so the reader falls back to the synthetic credential file on every platform.
    const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: ClaudeCodeSDK.preset(),
      env: { ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1", HOME: dir.path, PATH: dir.path, CLAUDE_CONFIG_DIR: dir.path },
      spawnClaudeCodeProcess: (options) => {
        tokens.push(options.env.CLAUDE_CODE_OAUTH_TOKEN)
        return spawn(process.execPath, ["-e", "process.exit(0)"], { env: options.env, stdio: ["pipe", "pipe", "pipe"] })
      } })
    // The approval flag gates the parent only; it never reaches Claude Code's environment.
    expect(lifetime.options.env.ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
    lifetime.options.spawnClaudeCodeProcess({ command: "unused", args: [], env: lifetime.options.env,
      signal: new AbortController().signal })
    await lifetime.join()
    expect(read).toHaveBeenCalledTimes(1)
    expect(tokens).toEqual([login.claudeAiOauth.accessToken])
  } finally {
    read.mockRestore()
  }
})

const MODEL = "anthropic/claude-haiku-4-5-20251001"

for (const agent of ["maestro", "archie"]) {
  ClaudeEngineFixture.it.instance(`${agent} on claude-code gets the pause as its turn error, once, with no login read`, () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const { directory } = yield* TestInstance
      writeFileSync(path.join(directory, "orchestra.json"), JSON.stringify({ agent: { [agent]: { engine: "claude-code", model: MODEL } } }))
      const sessions = yield* Session.Service
      const chat = yield* sessions.create({ title: "Paused engine", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
      const prompt = yield* SessionPrompt.Service
      // The real SDK builds the query, so the refusal surfaces exactly as it would in production.
      ClaudeEngineFixture.state.construct = (params) =>
        query({ ...params, options: { ...params.options, pathToClaudeCodeExecutable: process.execPath } })
      const read = loginReader()
      const reads: number[] = []
      const result = yield* prompt.prompt({ sessionID: chat.id, agent, parts: [{ type: "text", text: "start work" }] }).pipe(
        Effect.provideService(ClaudeCodeSDK.Environment, { HOME: directory, PATH: directory, CLAUDE_CONFIG_DIR: directory }),
        Effect.ensuring(Effect.sync(() => {
          reads.push(read.mock.calls.length)
          read.mockRestore()
        })))
      expect(result.info.role === "assistant" && result.info.finish).toBe("error")
      expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining(PAUSED) })
      expect(reads).toEqual([0])
      // Never retried, and never handed to Orchestra's own API transport instead.
      expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
      expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
    }), 30_000)
}
