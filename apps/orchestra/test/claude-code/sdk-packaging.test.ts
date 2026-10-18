import { expect, test } from "bun:test"
import { chmod, realpath, rm } from "node:fs/promises"
import { join } from "node:path"
import { ClaudeCodeExecutable } from "@/claude-code/executable"
import { ClaudeCodeSDK } from "@/claude-code/sdk"
import { stageClaudeCodeResource, verifyClaudeCodeResource } from "../../script/claude-code-resources"
import { tmpdir } from "../fixture/fixture"

const systemPrompt = { type: "preset", preset: "claude_code" } as const

test("staged executable is resolved while owner env survives and only retired metadata is stripped", async () => {
  await using dir = await tmpdir()
  const executable = await deployed(dir.path)
  const env = {
    ORCHESTRA_CLAUDE_CODE_EXECUTABLE: executable,
    OWNER_FIXTURE_SETTING: "unchanged",
    // Synthetic options metadata, never a process.env assignment or activation value.
    ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED: "retired-fixture-metadata",
  }
  const lifetime = ClaudeCodeSDK.processLifetime({
    systemPrompt,
    env,
  })
  expect(lifetime.options.pathToClaudeCodeExecutable).toBe(executable)
  expect(lifetime.options.env).toEqual({
    ORCHESTRA_CLAUDE_CODE_EXECUTABLE: executable,
    OWNER_FIXTURE_SETTING: "unchanged",
  })
  expect(env.ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBe("retired-fixture-metadata")
  // Neither query(), the spawn hook nor any credential reader is invoked.
  await lifetime.join()
})

test("explicit SDK executable wins over a different staged env executable", async () => {
  await using dir = await tmpdir()
  const staged = await deployed(dir.path)
  const executable = join(dir.path, "explicit-claude")
  await Bun.write(executable, "public synthetic executable; never run")
  await chmod(executable, 0o755)
  const lifetime = ClaudeCodeSDK.processLifetime({
    systemPrompt,
    pathToClaudeCodeExecutable: executable,
    env: { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: staged },
  })
  expect(lifetime.options.pathToClaudeCodeExecutable).toBe(await realpath(executable))
  await lifetime.join()
})

test("configured deployed-directory fallback verifies a real artifact and rejects missing bytes", async () => {
  await using dir = await tmpdir()
  const executable = await deployed(dir.path)
  const env = { ORCHESTRA_CLAUDE_CODE_RESOURCES: join(dir.path, "deployed") }
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt, env })
  expect(lifetime.options.pathToClaudeCodeExecutable).toBe(executable)
  await lifetime.join()
  await rm(executable)
  expect(() => ClaudeCodeSDK.processLifetime({ systemPrompt, env })).toThrow("Cannot acquire Claude Code executable:")
})

test("source defaults delegate to the current public resolver contract", async () => {
  const lifetime = ClaudeCodeSDK.processLifetime({ systemPrompt, env: {} })
  expect(lifetime.options.pathToClaudeCodeExecutable).toBe(ClaudeCodeExecutable.resolve({ env: {} }))
  await lifetime.join()
})

test("relative and empty SDK/env executable paths fail with the resolver's specific error", () => {
  for (const executable of ["", "../host/claude", "Resources/claude-code/claude"]) {
    for (const options of [
      { pathToClaudeCodeExecutable: executable, env: {} },
      { env: { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: executable } },
    ]) {
      expect(() => ClaudeCodeSDK.processLifetime({ systemPrompt, ...options })).toThrow(
        ClaudeCodeExecutable.UnavailableError,
      )
      expect(() => ClaudeCodeSDK.processLifetime({ systemPrompt, ...options })).toThrow(
        `Claude Code executable must be absolute: ${executable}`,
      )
    }
  }
})

async function deployed(root: string) {
  const source = join(root, "fixture-claude")
  await Bun.write(source, "public synthetic deployed resource; never run")
  await chmod(source, 0o755)
  await Bun.write(join(root, "README.md"), "fixture readme")
  await Bun.write(join(root, "LICENSE.md"), "fixture notice")
  const abi = process.platform === "linux" ? ClaudeCodeExecutable.nativeLibc() : undefined
  const directory = join(root, "deployed")
  stageClaudeCodeResource(
    {
      source,
      file: process.platform === "win32" ? "claude.exe" : "claude",
      target: ClaudeCodeExecutable.target(process.platform, process.arch, abi),
      sdkVersion: ClaudeCodeExecutable.SDK_VERSION,
      claudeCodeVersion: ClaudeCodeExecutable.CODE_VERSION,
    },
    directory,
  )
  return verifyClaudeCodeResource(directory, { os: process.platform, arch: process.arch, abi })
}
