import { expect, test } from "bun:test"
import { Effect } from "effect"
import { asks, canUseTool, preToolUse } from "@/claude-code/permissions"
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

test("a rejection becomes a deny with a message the model can act on; an approval allows the call unchanged", async () => {
  const denied = canUseTool({ run, context: () => context(true).ctx, shell: () => Effect.void })
  const signal = new AbortController().signal
  const result = (await denied("WebFetch", { url: "https://example.com" }, { signal, toolUseID: "toolu_1" } as never))!
  expect(result.behavior).toBe("deny")
  if (result.behavior === "deny") expect(result.message).toContain("rejected")
  const allowed = canUseTool({ run, context: () => context().ctx, shell: () => Effect.void })
  expect(await allowed("WebSearch", { query: "q" }, { signal, toolUseID: "toolu_2" } as never))
    .toEqual({ behavior: "allow", updatedInput: { query: "q" } })
})

test("the PreToolUse hook lets Orchestra's own tools through and puts every other call to Orchestra", async () => {
  const { ctx, calls } = context(true)
  const [matcher] = preToolUse({ run, context: () => ctx, shell: () => Effect.die(new Error("rejected")) })
  const hook = (tool_name: string, tool_input: unknown) => matcher.hooks[0]({ hook_event_name: "PreToolUse", tool_name, tool_input,
    tool_use_id: "toolu_1" } as never, "toolu_1", { signal: new AbortController().signal }) as Promise<any>
  expect((await hook("mcp__orchestra__edit", { filePath: "a" })).hookSpecificOutput.permissionDecision).toBe("allow")
  expect(calls).toEqual([])
  const bash = await hook("Bash", { command: "rm -rf /" })
  expect(bash.hookSpecificOutput.permissionDecision).toBe("deny")
  const fetch = await hook("WebFetch", { url: "https://example.com" })
  expect(fetch.hookSpecificOutput).toMatchObject({ permissionDecision: "deny" })
  expect(calls.map((call) => call.permission)).toEqual(["webfetch"])
})
