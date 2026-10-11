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

// The Claude Code engine is paused until the owner approves its meta-harness plan (specs/claude-code-engine.md).

const PAUSED = "The Claude Code engine is paused until its meta-harness plan is approved by the owner."

test("without the owner's approval a real SDK query is refused before any spawn", async () => {
  await using dir = await tmpdir()
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
  expect(spawned).toBe(0)
  await lifetime.join()
})

test("with the owner's approval the real spawn path reaches the transport with the owner's environment", async () => {
  await using dir = await tmpdir()
  const environments: Record<string, string | undefined>[] = []
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt: ClaudeCodeSDK.preset(),
    env: { ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "1", HOME: dir.path, PATH: dir.path, CLAUDE_CONFIG_DIR: dir.path },
    spawnClaudeCodeProcess: (options) => {
      environments.push(options.env)
      return spawn(process.execPath, ["-e", "process.exit(0)"], { env: options.env, stdio: ["pipe", "pipe", "pipe"] })
    } })
  // The approval flag gates the parent only; it never reaches Claude Code's environment.
  expect(lifetime.options.env.ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
  lifetime.options.spawnClaudeCodeProcess({ command: "unused", args: [], env: lifetime.options.env,
    signal: new AbortController().signal })
  await lifetime.join()
  expect(environments).toEqual([{ HOME: dir.path, PATH: dir.path, CLAUDE_CONFIG_DIR: dir.path }])
})

const MODEL = "anthropic/claude-haiku-4-5-20251001"

for (const agent of ["maestro", "archie"]) {
  ClaudeEngineFixture.it.instance(`${agent} on claude-code gets the pause as its turn error, once`, () =>
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
      const result = yield* prompt.prompt({ sessionID: chat.id, agent, parts: [{ type: "text", text: "start work" }] }).pipe(
        Effect.provideService(ClaudeCodeSDK.Environment, { HOME: directory, PATH: directory, CLAUDE_CONFIG_DIR: directory }))
      expect(result.info.role === "assistant" && result.info.finish).toBe("error")
      expect(result.info.role === "assistant" && result.info.error?.data).toMatchObject({ message: expect.stringContaining(PAUSED) })
      // Never retried, and never handed to Orchestra's own API transport instead.
      expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
      expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
    }), 30_000)
}
