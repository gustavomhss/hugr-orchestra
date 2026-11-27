import { expect, test } from "bun:test"
import type { HookInput, Options, SDKMessage, SDKUserMessage, query } from "@anthropic-ai/claude-agent-sdk"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionSchema } from "@orchestra/core/session"
import type { ExecutionHost } from "@orchestra/core/session/runner"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Effect, Layer, Stream } from "effect"
import { ClaudeCodeSDK } from "../src/sdk"
import { ClaudeCodeHost } from "../src/v2/host"

test("settles authorized built-ins exactly once with Claude Code's real callback response", async () => {
  const settled: { id: string; outcome: ToolSafety.HostedOutcome }[] = []
  const repair = new ToolSafety.Denied({ reason: "relay-hook-repair", detail: "Add a changelog entry." })
  const guard = new ToolSafety.Denied({ reason: "relay-hook-block", detail: "This file is protected." })
  const args = { file_path: "/project/a.ts" }
  const signal = new AbortController().signal
  const turn: ExecutionHost.Turn = {
    session: { id: SessionSchema.ID.make("ses_after"), location: { directory: "/project" } } as SessionSchema.Info,
    agent: AgentV2.Info.empty(AgentV2.ID.make("maestro")),
    model: undefined,
    system: [],
    context: [],
    history: [{ id: "prompt", type: "user", text: "Go", files: [], agents: [], time: { created: 0 } }] as ExecutionHost.Turn["history"],
    tools: [],
    execute: () => Effect.die("unused"),
    authorize: (input) => {
      if (input.callID === "blocked") return Effect.fail(guard)
      if (input.callID === "no-hook") return Effect.succeed({})
      return Effect.succeed({
        after: (outcome: ToolSafety.HostedOutcome) =>
          Effect.sync(() => settled.push({ id: input.callID, outcome })).pipe(
            Effect.andThen(
              input.callID === "repair" ? Effect.fail(repair)
                : input.callID === "broken" ? Effect.die("Relay unavailable")
                  : Effect.succeed(outcome.succeeded ? ["before", "after"] : ["before"]),
            ),
          ),
      })
    },
    question: () => Effect.die("unused"),
    memory: { recall: Effect.succeed(undefined), archive: () => Effect.void },
    steers: Stream.empty,
    consumed: () => Effect.void,
    notify: () => Effect.void,
    todos: () => Effect.void,
    state: { get: Effect.succeed(undefined), update: () => Effect.void },
  }
  const sdk = Layer.succeed(ClaudeCodeSDK.Service, ClaudeCodeSDK.Service.of({
    query: ((input: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => (async function* () {
      await input.prompt[Symbol.asyncIterator]().next()
      const call = (event: HookInput) =>
        input.options.hooks?.[event.hook_event_name]?.[0]?.hooks[0]?.(event, "tool_use_id" in event ? event.tool_use_id : undefined, { signal })
      const base = { session_id: "claude-1", transcript_path: "", cwd: "/project", tool_input: args }
      const pre = (id: string, name = "Write") =>
        call({ ...base, hook_event_name: "PreToolUse", tool_name: name, tool_use_id: id })
      const post = (id: string, response: unknown, name = "Write") =>
        call({ ...base, hook_event_name: "PostToolUse", tool_name: name, tool_use_id: id, tool_response: response })
      const failed = (id: string) =>
        call({ ...base, hook_event_name: "PostToolUseFailure", tool_name: "Write", tool_use_id: id, error: "EACCES" })
      const notes = (event: "PostToolUse" | "PostToolUseFailure", additionalContext: string) => ({
        hookSpecificOutput: { hookEventName: event, additionalContext },
      })
      for (const id of ["updated", "created", "failed", "repair", "broken", "no-hook", "blocked"])
        await pre(id)
      expect(await pre("blocked")).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
      expect(await post("updated", { type: "wrong", }, "Read")).toEqual({})
      const duplicate = await Promise.all([
        post("updated", { type: "update" }),
        post("updated", { type: "update" }),
      ])
      expect(duplicate).toContainEqual(notes("PostToolUse", "before\nafter"))
      expect(duplicate).toContainEqual({})
      expect(await post("created", { type: "create" })).toEqual(notes("PostToolUse", "before\nafter"))
      expect(await failed("failed")).toEqual(notes("PostToolUseFailure", "before"))
      expect(await post("repair", "written")).toEqual(notes("PostToolUse", repair.message))
      expect(await post("broken", "written")).toEqual({})
      expect(await post("no-hook", "written")).toEqual({})
      expect(await post("blocked", "unreachable")).toEqual({})
      await pre("mcp", "mcp__orchestra__task")
      expect(await post("mcp", "ok", "mcp__orchestra__task")).toEqual({})
      yield { type: "result", subtype: "success", is_error: false, session_id: "claude-1", result: "" } as SDKMessage
    })()) as unknown as typeof query,
  }))
  const events = await Effect.runPromise(
    ClaudeCodeHost.make.pipe(
      Effect.flatMap((host) => Stream.runCollect(host.stream(turn))),
      Effect.provide(sdk),
      Effect.provideService(ClaudeCodeSDK.Environment, {}),
    ),
  )
  expect(Array.from(events).at(-1)).toMatchObject({ type: "step-finish", reason: "stop" })
  expect(settled).toEqual([
    { id: "updated", outcome: { succeeded: true, response: { type: "update" } } },
    { id: "created", outcome: { succeeded: true, response: { type: "create" } } },
    { id: "failed", outcome: { succeeded: false } },
    { id: "repair", outcome: { succeeded: true, response: "written" } },
    { id: "broken", outcome: { succeeded: true, response: "written" } },
  ])
})
