// Every approval Claude Code asks for goes through Orchestra's permission service, with the permission IDs and
// patterns Orchestra's own tools use, so one ruleset and one prompt decide for both engines.
import { Effect, Exit } from "effect"
import type { CanUseTool, HookCallbackMatcher, PermissionResult } from "@anthropic-ai/claude-agent-sdk"
import type * as Tool from "@/tool/tool"
import { assertExternalDirectoryEffect } from "@/tool/external-directory"
import { failure, NAMES as ORCHESTRA_TOOLS } from "./tools"

type Input = Record<string, unknown>
const text = (input: Input, key: string) => (typeof input[key] === "string" ? (input[key] as string) : undefined)

/** The asks one Claude Code tool call needs, as Orchestra's equivalent tool would make them. */
export function asks(
  name: string,
  input: Input,
  ctx: Tool.Context,
  shell: (command: string) => Effect.Effect<void, unknown, never>,
) {
  return Effect.gen(function* () {
    if (name === "Bash") return yield* shell(text(input, "command") ?? "")
    if (name === "Grep" || name === "Glob") {
      yield* assertExternalDirectoryEffect(ctx, text(input, "path"), { kind: "directory" })
      const pattern = text(input, "pattern") ?? "*"
      return yield* ctx.ask({ permission: name.toLowerCase(), patterns: [pattern], always: ["*"], metadata: { pattern, path: text(input, "path") } })
    }
    if (name === "WebFetch") {
      const url = text(input, "url") ?? "*"
      return yield* ctx.ask({ permission: "webfetch", patterns: [url], always: ["*"], metadata: { url } })
    }
    if (name === "WebSearch") {
      const query = text(input, "query") ?? "*"
      return yield* ctx.ask({ permission: "websearch", patterns: [query], always: ["*"], metadata: { query } })
    }
    // Anything else, including MCP tools from configuration: the tool name is the permission.
    return yield* ctx.ask({ permission: name, patterns: ["*"], always: ["*"], metadata: { input } })
  })
}

type Gate = {
  run: <A>(effect: Effect.Effect<A, unknown, any>) => Promise<A>
  /** The context of the call: the mirrored part's message and call, and Orchestra's ask. */
  context: (toolUseID: string) => Tool.Context
  shell: (ctx: Tool.Context, command: string) => Effect.Effect<void, unknown, never>
}

/** Orchestra's decision on one call. Orchestra's own tools ask inside their implementation, so they pass here. */
function decide(gate: Gate, name: string, toolInput: Input, toolUseID: string) {
  return gate.run(Effect.gen(function* () {
    if (ORCHESTRA_TOOLS.includes(name)) return { allow: true as const }
    const ctx = gate.context(toolUseID)
    const exit = yield* asks(name, toolInput, ctx, (command) => gate.shell(ctx, command)).pipe(Effect.exit)
    return Exit.isSuccess(exit) ? { allow: true as const } : { allow: false as const, message: failure(exit.cause) }
  }))
}

/** Every tool call, before Claude Code's own permission logic: Orchestra allows or denies it. */
export function preToolUse(gate: Gate): HookCallbackMatcher[] {
  return [{
    hooks: [async (hook) => {
      if (hook.hook_event_name !== "PreToolUse") return {}
      const decision = await decide(gate, hook.tool_name, (hook.tool_input ?? {}) as Input, hook.tool_use_id)
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision.allow ? "allow" : "deny",
        ...(decision.allow ? {} : { permissionDecisionReason: decision.message }) } }
    }],
  }]
}

/** The same decision, for anything that still reaches a Claude Code permission prompt. */
export function canUseTool(gate: Gate): CanUseTool {
  return async (name, toolInput, options) => {
    const decision = await decide(gate, name, toolInput, options.toolUseID)
    return decision.allow ? { behavior: "allow", updatedInput: toolInput } satisfies PermissionResult
      : { behavior: "deny", message: decision.message } satisfies PermissionResult
  }
}
