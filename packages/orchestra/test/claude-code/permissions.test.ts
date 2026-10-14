import { expect, test } from "bun:test"
import { Cause, Effect, Exit } from "effect"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { ClaudeCodeTools } from "@/claude-code/tools"
import { asks } from "@/claude-code/permissions"
import { MessageID, SessionID } from "@/session/schema"
import type * as Tool from "@/tool/tool"

type Ask = Parameters<Tool.Context["ask"]>[0]

function context(reject = false) {
  const calls: Ask[] = []
  const ctx: Tool.Context = {
    sessionID: SessionID.descending(), messageID: MessageID.ascending(), callID: "toolu_1", agent: "claude",
    abort: new AbortController().signal, messages: [], extra: {}, metadata: () => Effect.void,
    ask: (request) => Effect.suspend(() => {
      calls.push(request)
      return reject ? Effect.die(Object.assign(new Error("rejected"), { _tag: "PermissionRejectedError" })) : Effect.void
    }),
  }
  return { ctx, calls }
}

const run = <A>(effect: Effect.Effect<A, unknown, any>) => Effect.runPromise(effect as Effect.Effect<A, unknown, never>)

test("Claude Code's tools ask under the permission IDs and patterns of Orchestra's equivalents", async () => {
  const { ctx, calls } = context()
  const shells: string[] = []
  const shell = (command: string) => Effect.sync(() => { shells.push(command) })
  await run(asks("Bash", { command: "git status" }, ctx, shell))
  await run(asks("WebFetch", { url: "https://example.com" }, ctx, shell))
  await run(asks("WebSearch", { query: "effect v4" }, ctx, shell))
  await run(asks("mcp__github__create_issue", { title: "x" }, ctx, shell))
  expect(shells).toEqual(["git status"])
  expect(calls.map((call) => [call.permission, call.patterns])).toEqual([
    ["webfetch", ["https://example.com"]],
    ["websearch", ["effect v4"]],
    ["mcp__github__create_issue", ["*"]],
  ])
})

test("a rejected ask fails the call with a message the model can act on", async () => {
  const exit = await Effect.runPromiseExit(asks("WebFetch", { url: "https://example.com" }, context(true).ctx, () => Effect.void) as Effect.Effect<void, unknown, never>)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(ClaudeCodeTools.failure(exit.cause)).toContain("Stop and wait")
})

test("a rule denial shows the rule and lets the model continue; only a user rejection says to stop", () => {
  const denied = ClaudeCodeTools.failure(Cause.fail(new PermissionV1.DeniedError({ ruleset: [{ permission: "bash", pattern: "*", action: "deny" }] })))
  expect(denied).toContain("rule which prevents")
  expect(denied).not.toContain("Stop and wait")
  expect(ClaudeCodeTools.failure(Cause.fail(new PermissionV1.RejectedError()))).toContain("Stop and wait")
})
