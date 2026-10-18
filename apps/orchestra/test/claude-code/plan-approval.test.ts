import { expect, test } from "bun:test"
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

// The approved rollout's temporary pause is retired; real SDK failures still end the turn without API fallback.

const SPAWN_FAILURE = "Injected Claude Code SDK spawn failure"

test("a real SDK query reaches the spawner without the retired approval flag", async () => {
  await using dir = await tmpdir()
  const environments: Record<string, string | undefined>[] = []
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
    env: { HOME: dir.path, PATH: dir.path, CLAUDE_CONFIG_DIR: dir.path }, pathToClaudeCodeExecutable: process.execPath,
    spawnClaudeCodeProcess: (options) => {
      environments.push(options.env)
      throw new Error(SPAWN_FAILURE)
    } })
  const run = async () => {
    for await (const _ of query({ prompt: "No provider work: injected failing spawner only", options: lifetime.options })) {}
  }
  await expect(run()).rejects.toThrow(SPAWN_FAILURE)
  expect(environments).toHaveLength(1)
  expect(environments[0]).toMatchObject({ HOME: dir.path, PATH: dir.path, CLAUDE_CONFIG_DIR: dir.path })
  expect(environments[0].ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
  await lifetime.join()
})

test("the retired approval flag is not forwarded to a real scratch subprocess", async () => {
  await using dir = await tmpdir()
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
    env: { ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1", HOME: dir.path, PATH: dir.path, CLAUDE_CONFIG_DIR: dir.path,
      ANTHROPIC_API_KEY: "owner-test-api-key", CLAUDE_CODE_OAUTH_TOKEN: "owner-test-oauth-token" },
    pathToClaudeCodeExecutable: process.execPath,
    spawnClaudeCodeProcess: (options) => {
      return spawn(process.execPath, ["-e", "process.stdout.write(JSON.stringify(process.env))"],
        { env: options.env, stdio: ["pipe", "pipe", "pipe"] })
    } })
  expect(lifetime.options.env.ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
  const child = lifetime.options.spawnClaudeCodeProcess({ command: "unused", args: [], env: lifetime.options.env,
    signal: new AbortController().signal })
  const output = (async () => {
    const chunks: string[] = []
    for await (const chunk of child.stdout) chunks.push(chunk.toString())
    return chunks.join("")
  })()
  await lifetime.join()
  expect(child.exitCode).toBe(0)
  const observed = JSON.parse(await output)
  expect(observed.HOME).toBe(dir.path)
  expect(observed.PATH).toBe(dir.path)
  expect(observed.CLAUDE_CONFIG_DIR).toBe(dir.path)
  expect(observed.ANTHROPIC_API_KEY).toBe("owner-test-api-key")
  expect(observed.CLAUDE_CODE_OAUTH_TOKEN).toBe("owner-test-oauth-token")
  expect(observed.ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
})

const MODEL = "anthropic/claude-haiku-4-5-20251001"

for (const agent of ["maestro", "archie"]) {
  ClaudeEngineFixture.it.instance(`${agent} on claude-code surfaces a real SDK spawn failure once without API fallback`, () =>
    Effect.gen(function* () {
      ClaudeEngineFixture.reset()
      const instance = yield* TestInstance
      writeFileSync(path.join(instance.directory, "orchestra.json"), JSON.stringify({ agent: { [agent]: { engine: "claude-code", model: MODEL } } }))
      const sessions = yield* Session.Service
      const chat = yield* sessions.create({ title: "Failing SDK spawn", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
      const prompt = yield* SessionPrompt.Service
      const environments: Record<string, string | undefined>[] = []
      // Use the real SDK, injecting failure only at its spawn boundary: no child or model request can run.
      ClaudeEngineFixture.state.construct = (params) =>
        query({ ...params, options: { ...params.options, spawnClaudeCodeProcess: (options) => {
          environments.push(options.env)
          throw new Error(SPAWN_FAILURE)
        } } })
      const result = yield* prompt.prompt({ sessionID: chat.id, agent, parts: [{ type: "text", text: "start work" }] }).pipe(
        Effect.provideService(ClaudeCodeSDK.Environment, { HOME: instance.directory, PATH: instance.directory,
          CLAUDE_CONFIG_DIR: instance.directory, ORCHESTRA_CLAUDE_CODE_EXECUTABLE: process.execPath }))
      expect(result.info.role === "assistant" && result.info.finish).toBe("error")
      expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining(SPAWN_FAILURE) })
      // Never retried, and never handed to Orchestra's own API transport instead.
      expect(environments).toHaveLength(1)
      expect(environments[0].ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
      expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
      expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
      const messages = yield* sessions.messages({ sessionID: chat.id })
      expect(messages.filter((message) => message.info.role === "assistant")).toHaveLength(1)
    }), 30_000)
}
