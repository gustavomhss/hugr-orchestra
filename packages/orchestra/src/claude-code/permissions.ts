// Claude Code's tool calls asked under the permission IDs and patterns of Orchestra's own equivalents, so one ruleset
// and one prompt decide for both engines. The host's policy gate (host/gate.ts) and its approval dialogs
// (host/session.ts) use it.
import { Effect } from "effect"
import type { Tool } from "@/tool/tool"
import { assertExternalDirectoryEffect } from "@/tool/external-directory"

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
