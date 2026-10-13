import { expect, test } from "bun:test"
import { resolve } from "node:path"
import { ClaudeCodeSDK } from "@/claude-code/sdk"

test("packaged executable becomes an SDK option without enabling the engine or forwarding the capability", async () => {
  const executable = resolve("candidate/Resources/claude-code/claude")
  const lifetime = ClaudeCodeSDK.processLifetime({
    systemPrompt: ClaudeCodeSDK.preset(),
    env: { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: executable },
  })
  expect(lifetime.options.pathToClaudeCodeExecutable).toBe(executable)
  expect(lifetime.options.env.ORCHESTRA_CLAUDE_CODE_EXECUTABLE).toBeUndefined()
  expect(lifetime.options.env.ORCHESTRA_CLAUDE_CODE_PLAN_APPROVED).toBeUndefined()
  expect(() => ClaudeCodeSDK.requirePlanApproval({})).toThrow("Claude Code engine is paused")
  // Options construction and the empty lifetime join do not invoke SDK query, spawn or MachineLogin.read.
  await lifetime.join()
})

test("explicit SDK executable keeps precedence and checkout mode keeps SDK default", async () => {
  const executable = resolve("explicit/claude")
  const lifetime = ClaudeCodeSDK.processLifetime({
    systemPrompt: ClaudeCodeSDK.preset(),
    pathToClaudeCodeExecutable: executable,
    env: { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: resolve("candidate/claude") },
  })
  expect(lifetime.options.pathToClaudeCodeExecutable).toBe(executable)
  expect(
    ClaudeCodeSDK.processLifetime({ systemPrompt: ClaudeCodeSDK.preset(), env: {} }).options.pathToClaudeCodeExecutable,
  ).toBeUndefined()
  await lifetime.join()
})

test("relative or empty executable configuration fails during options construction", () => {
  for (const executable of ["", "../host/claude", "Resources/claude-code/claude"])
    expect(() =>
      ClaudeCodeSDK.processLifetime({
        systemPrompt: ClaudeCodeSDK.preset(),
        env: { ORCHESTRA_CLAUDE_CODE_EXECUTABLE: executable },
      }),
    ).toThrow("Claude Code executable must be an absolute path")
})
