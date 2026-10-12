import { expect } from "bun:test"
import { Context, Effect, FileSystem } from "effect"
import type { HookInput, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { AppProcess } from "@orchestra/core/process"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { ClaudeHostJoin } from "@/claude-code/host/join"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { WriteRoots } from "@/maestro/write-roots"
import { ClaudeEngineFixture } from "../engine-fixture"

const pre = { hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "orchestra.json" },
  tool_use_id: "toolu_read", session_id: "native", transcript_path: "/tmp/unused", cwd: "/tmp" } satisfies HookInput

ClaudeEngineFixture.it.instance("a real hook dependency failure returns deny even when denial cleanup also fails", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const context = Context.omit(AppProcess.Service)(yield* Effect.context<never>())
  const abort = new AbortController()
  const hooks = ClaudeHostHooks.create({ sessionID: setup.chat.id, directory: setup.chat.directory, worktree: setup.chat.directory,
    agent: "claude", abort, join: ClaudeHostJoin.make(), granted: {},
    run: <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.runPromiseWith(context)(effect as Effect.Effect<A, unknown>),
  })
  yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
  const output = yield* Effect.promise(() => hooks.PreToolUse![0].hooks[0](pre, pre.tool_use_id, { signal: abort.signal }))
  expect(output).toMatchObject({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("AppProcess") } })
}), 30_000)

ClaudeEngineFixture.it.instance("SDK callbacks retain host dependencies even when the turn caller omits AppProcess", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  const decisions: HookJSONOutput[] = []
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...ClaudeEngineFixture.frame, session_id: pre.session_id }
    decisions.push(await params.options!.hooks!.PreToolUse![0].hooks[0](pre, pre.tool_use_id, { signal: new AbortController().signal }))
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: crypto.randomUUID(),
      message: { id: "answer", model: "claude-haiku-4-5-20251001", content: [{ type: "text", text: "allowed" }], usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, ...ClaudeEngineFixture.frame }
    for await (const _ of input) {}
  })
  const admitted = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("read config"), noReply: true })
  if (admitted.info.role !== "user") throw new Error("missing admitted user")
  yield* host.turn({ sessionID: setup.chat.id, user: admitted.info }).pipe(
    Effect.updateContext((context: Context.Context<never>) => Context.omit(AppProcess.Service)(context)))
  expect(decisions).toEqual([{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }])
}), 30_000)

ClaudeEngineFixture.it.instance("Agent grant binding retains the host filesystem when HTTP supplies a noop filesystem", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const setup = yield* ClaudeEngineFixture.setup()
  const host = yield* ClaudeHost.Service
  const rules = yield* WriteRoots.bind("archie", ["proposal.md"], [])
  const grantID = "grt_filesystem"
  ClaudeHostMcp.grants(setup.chat.id).set(grantID, { grantID, sessionID: setup.chat.id, seat: "archie", writePaths: ["proposal.md"],
    writeRoots: WriteRoots.read(rules) ?? [], purpose: "proposal", time: Date.now() })
  const decisions: HookJSONOutput[] = []
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "claude-haiku-4-5-20251001", ...ClaudeEngineFixture.frame, session_id: pre.session_id }
    const args = { subagent_type: "orchestra:archie", description: "bounded proposal", run_in_background: false, prompt: `grantID: ${grantID}\nWrite proposal.md.` }
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: crypto.randomUUID(), message: { id: "dispatch", model: "claude-haiku-4-5-20251001",
      content: [{ type: "tool_use", id: "toolu_agent", name: "Agent", input: args }], usage: {} } }
    decisions.push(await params.options!.hooks!.PreToolUse![0].hooks[0]({ ...pre, tool_name: "Agent", tool_use_id: "toolu_agent", tool_input: args },
      "toolu_agent", { signal: new AbortController().signal }))
    yield { type: "system", subtype: "task_started", task_id: "native-child", tool_use_id: "toolu_agent", description: "bounded proposal", ...ClaudeEngineFixture.frame }
    for (const [name, file] of [["Write", "proposal.md"], ["Write", "denied.txt"], ["Read", "orchestra.json"], ["Read", ".env"]])
      decisions.push(await params.options!.hooks!.PreToolUse![0].hooks[0]({ ...pre, agent_id: "native-child", tool_name: name,
        tool_use_id: `${name}-${file}`, tool_input: { file_path: `${setup.chat.directory}/${file}`, content: "proposal" } },
        `${name}-${file}`, { signal: new AbortController().signal }))
    yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, ...ClaudeEngineFixture.frame }
    for await (const _ of input) {}
  })
  const admitted = yield* setup.prompt.prompt({ sessionID: setup.chat.id, ...ClaudeEngineFixture.say("write proposal"), noReply: true })
  if (admitted.info.role !== "user") throw new Error("missing admitted user")
  yield* host.turn({ sessionID: setup.chat.id, user: admitted.info }).pipe(
    Effect.provideService(FileSystem.FileSystem, FileSystem.makeNoop({})))
  expect(decisions[0]).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(decisions.slice(1).map((decision) => "hookSpecificOutput" in decision && decision.hookSpecificOutput &&
    "permissionDecision" in decision.hookSpecificOutput ? decision.hookSpecificOutput.permissionDecision : undefined)).toEqual(["allow", "deny", "allow", "deny"])
}), 30_000)

for (const event of ["PostToolUse", "PostToolUseFailure", "SubagentStop", "SessionStart", "PostCompact"] as const)
  ClaudeEngineFixture.it.instance(`${event} record failure stops execution and refuses the next tool`, () => Effect.gen(function* () {
    ClaudeEngineFixture.reset()
    const setup = yield* ClaudeEngineFixture.setup()
    const context = yield* Effect.context<never>()
    const abort = new AbortController()
    const hooks = ClaudeHostHooks.create({ sessionID: setup.chat.id, directory: setup.chat.directory, worktree: setup.chat.directory,
      agent: "claude", abort, join: ClaudeHostJoin.make(), granted: {},
      run: () => Promise.reject(new Error("record dependency unavailable")),
    })
    yield* Effect.addFinalizer(() => Effect.sync(() => abort.abort()))
    // SubagentStop records synchronously through its identity join, so break that boundary rather than the runner.
    const join = ClaudeHostJoin.make()
    const recording = event === "SubagentStop" ? ClaudeHostHooks.create({ sessionID: setup.chat.id, directory: setup.chat.directory,
      worktree: setup.chat.directory, agent: "claude", abort, granted: {},
      join: { ...join, toolUse: () => { throw new Error("record dependency unavailable") } },
      run: <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.runPromiseWith(context)(effect as Effect.Effect<A, unknown>),
    }) : hooks
    const input = event === "PostToolUse" ? { ...pre, hook_event_name: event, tool_response: "output" }
      : event === "PostToolUseFailure" ? { ...pre, hook_event_name: event, error: "tool failed" }
      : event === "SubagentStop" ? { ...pre, hook_event_name: event, agent_id: "child", agent_transcript_path: "/tmp/unused",
          stop_hook_active: false, last_assistant_message: "answer" }
      : event === "SessionStart" ? { ...pre, hook_event_name: event, source: "compact", model: "haiku" }
      : { ...pre, hook_event_name: event, trigger: "manual", compact_summary: "summary" }
    const output = yield* Effect.promise(() => recording[event]![0].hooks[0](input as HookInput, undefined, { signal: abort.signal }))
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("failed closed") })
    if (event === "PostToolUse") expect(output).toMatchObject({ hookSpecificOutput: {
      hookEventName: event, updatedToolOutput: expect.stringContaining("withheld") } })
    if (event === "SessionStart" || event === "PostCompact") expect(abort.signal.aborted).toBe(true)
    const denied = yield* Effect.promise(() => recording.PreToolUse![0].hooks[0](pre, pre.tool_use_id, { signal: abort.signal }))
    expect(denied).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny" } })
  }), 30_000)
