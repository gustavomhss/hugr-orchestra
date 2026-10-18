export * as ClaudeHostOptions from "./options"

// The SDK `Options` for one Claude-hosted Orchestra session (meta-harness PLAN.md §4.1, §4.3, §4.4). Claude Code keeps
// its own prompt, tools, login and loop; Orchestra adds to it through the documented channels only:
// - the `claude_code` preset with an appended Orchestra text, never a custom prompt or a main-thread agent;
// - one local `orchestra` plugin (seats, skills), one in-process `orchestra` MCP server and in-process hook callbacks;
// - the owner's own environment, plus switches that only turn on output Claude Code already offers.
// Built-in tools are never disabled or aliased, and nothing here touches a credential.
import type {
  AgentDefinition,
  CanUseTool,
  HookCallbackMatcher,
  HookEvent,
  McpSdkServerConfigWithInstance,
  Options,
  SDKTaskNotificationMessage,
} from "@anthropic-ai/claude-agent-sdk"
import type { SessionID } from "@/session/schema"

/**
 * What HOST hands the plugin, MCP and hook builders: one Claude-hosted Orchestra session. Fields past `abort` are
 * optional additions to the fixed build-brief shape.
 */
export type Context = {
  sessionID: SessionID
  directory: string
  worktree: string
  /** The main thread's seat id: `maestro`, or another seat when it is the main conversation. */
  agent: string
  /** Aborts when the session's Claude Code process is released or stopped for good. */
  abort: AbortController
  /** `orchestra:<seat>` → seat id, once the plugin is built. */
  seats?: Record<string, string>
  /** The session's Agent-call join (agent HOOKS, `host/join.ts`), fed by the stream consumer (spikes S3, S12). */
  join?: Join
}

/** What the plugin, MCP and hook builders need of the session's join (`ClaudeHostJoin`): the frames only HOST sees. */
export type Join = {
  /** `system/task_started`: the only frame carrying both the Agent `tool_use_id` and the agent id (spike S3). */
  taskStarted: (input: { toolUseID: string; taskID: string }) => void
  /** `system/task_notification`: the background delivery source (spike S12). */
  taskNotification: (frame: SDKTaskNotificationMessage) => void
  /** The child session the delegation hooks created for an Agent call. */
  child?: (toolUseID: string) => SessionID | undefined
}

/** The builders agents PLUGIN and HOOKS own (build brief, "Fixed interfaces"), injected so each side stays testable. */
export type Adapters = {
  plugin: (ctx: Context) => Promise<{ path: string; seats: Record<string, string>; sdkAgents?: Record<string, AgentDefinition> }>
  mcp: (ctx: Context) => McpSdkServerConfigWithInstance
  hooks: (ctx: Context) => Partial<Record<HookEvent, HookCallbackMatcher[]>>
  /** One join per session, created before the hooks so they share it through `ctx.join`. */
  join?: (ctx: Context) => Join
}

export type Preset = Extract<NonNullable<Options["systemPrompt"]>, { type: "preset" }>

export const MCP_SERVER = "orchestra"

/** Documented task-tracking opt-in for newer models; current binaries expose TaskCreate/Update/Get/List. */
export const ENV_FLAGS = { CLAUDE_CODE_ENABLE_TODO_TOOLS: "1" } as const

const REVIEW_NOTICE =
  "`mcp__orchestra__maestro_request_review` (Maestro only) runs the governed cold review by `lucy` as Orchestra's own " +
  "Task and records its receipt; use it, not `Agent`, when authorization needs a review."

const WORKFLOW_NOTICE =
  "An approved Relay workflow is dispatched with `mcp__orchestra__task`, never `Agent`: pass `subagent_type`, the " +
  "presented `prompt` and `model` byte for byte, `authorizationID`, `workflow` and `writePaths` exactly as approved. " +
  "Orchestra binds the approved plan and runs the seat as its own Task; a `task` call without `workflow` is held."

/** Seats that return a proposal Maestro must read in the same turn (contract V2: foreground only). */
export const FOREGROUND_SEATS = ["archie", "backend"]

export async function build(input: {
  ctx: Context
  adapters: Adapters
  /** The seat's model (`anthropic` model id), when the seat config names one; otherwise Claude Code's default. */
  model?: string
  /** Resume, fork or name the Claude Code session (session.ts maps it 1:1 to the Orchestra session). */
  session: Pick<Options, "resume" | "sessionId" | "forkSession" | "resumeSessionAt">
  abortController: AbortController
  canUseTool?: CanUseTool
  /** The owner's environment; defaults to this process's. */
  env?: Record<string, string | undefined>
  stderr?: (data: string) => void
}): Promise<Options & { systemPrompt: Preset }> {
  const plugin = await input.adapters.plugin(input.ctx)
  const ctx = { ...input.ctx, seats: plugin.seats, join: input.ctx.join ?? input.adapters.join?.(input.ctx) }
  const hooks = input.adapters.hooks(ctx)
  // Every call Claude Code makes passes Orchestra's PreToolUse policy gate first (spike S7): never run ungated.
  if (!hooks.PreToolUse?.length) throw new Error("The Claude Code host cannot start: Orchestra's policy gate is missing.")
  return {
    cwd: input.ctx.directory,
    ...(input.model ? { model: input.model } : {}),
    ...input.session,
    systemPrompt: { type: "preset", preset: "claude_code", append: append(input.ctx.agent, plugin.seats) },
    plugins: [{ type: "local", path: plugin.path }],
    // Seats that need `permissionMode` or their own MCP server, which plugin agent files ignore. Never the main thread.
    ...(Object.keys(plugin.sdkAgents ?? {}).length ? { agents: plugin.sdkAgents } : {}),
    mcpServers: { [MCP_SERVER]: input.adapters.mcp(ctx) },
    hooks,
    // CLAUDE.md and project agents load; the owner's user-level settings stay the owner's own Claude Code's.
    settingSources: ["project"],
    // Approvals reach Orchestra's dialogs through canUseTool, as with `claude` in its default mode.
    permissionMode: "default",
    ...(input.canUseTool ? { canUseTool: input.canUseTool } : {}),
    includePartialMessages: true,
    forwardSubagentText: true,
    agentProgressSummaries: true,
    thinking: { type: "adaptive", display: "summarized" },
    env: environment(input.env ?? process.env),
    abortController: input.abortController,
    ...(input.stderr ? { stderr: input.stderr } : {}),
  }
}

/**
 * The owner's environment as it is, plus ENV_FLAGS. One variable is dropped: `CLAUDE_CODE_ENTRYPOINT`, which a parent
 * Claude surface (for example the desktop app this process may run inside) passes down. Left in place it would label
 * this session as that surface; without it the SDK records its own entrypoint. This is truthful identification of the
 * caller, not a billing setting, and no credential or auth variable is added or removed.
 */
export function environment(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return { ...Object.fromEntries(Object.entries(env).filter(([key]) => key !== "CLAUDE_CODE_ENTRYPOINT")), ...ENV_FLAGS }
}

/** The text appended to Claude Code's preset for the main thread's seat. */
export function append(seat: string, seats: Record<string, string>) {
  if (seat === "maestro") return maestro(seats)
  return [
    `You are the \`${seat}\` seat of HuGR Orchestra, a desktop app for software work, working in this session as the`,
    "owner's main conversation. Orchestra shows your work to the owner and adds its own tools beside Claude Code's, under",
    "the `mcp__orchestra__` prefix. For a long-running or background command (a dev server, a watcher, a long build or",
    "test run) use `mcp__orchestra__process`, so the owner can follow its output live; use Bash for short commands.",
  ].join(" ")
}

function maestro(seats: Record<string, string>) {
  const names = Object.keys(seats).toSorted()
  const roster = names.length ? names.map((name) => `\`${name}\``).join(", ") : "none in this session"
  const foreground = names.filter((name) => FOREGROUND_SEATS.includes(seats[name] ?? ""))
  return [
    "# Maestro on Claude Code",
    "You are Maestro, the conductor of HuGR Orchestra, a desktop app for software work. The owner talks to you. You " +
      "carry each request until the owner's goal is met, doing the work yourself or through Orchestra's seats, and you " +
      "own every result you report.",
    "## Delegating to seats",
    [
      `- Orchestra's seats are subagents. Delegate with the \`Agent\` tool and \`subagent_type: "orchestra:<seat>"\`. ` +
        `Seats in this session: ${roster}.`,
      "- A seat sees only your brief. Give it the goal, what done looks like, the files and constraints that matter and " +
        "what to return.",
      ...(foreground.length
        ? [`- Run ${foreground.map((name) => `\`${name}\``).join(" and ")} in the foreground, never with ` +
          "`run_in_background`: you need their result in this turn, and Orchestra refuses a background dispatch of them."]
        : []),
      "- Read a seat's report before you rely on it, and check its claims against the repository when they matter.",
    ].join("\n"),
    "## Orchestra's tools",
    [
      "Orchestra adds its own tools beside Claude Code's, under the `mcp__orchestra__` prefix:",
      "- `mcp__orchestra__process` starts, tails and stops long-running or background commands such as dev servers, " +
        "watchers and long builds or test runs. Use it for those, so the owner can follow their output live in the " +
        "Processes panel; use Bash for short commands.",
      "- `mcp__orchestra__maestro_*` tools run Orchestra's governed workflow: admission, plans, reviews and approvals.",
      `- ${REVIEW_NOTICE}`,
      `- ${WORKFLOW_NOTICE}`,
      "- `mcp__orchestra__atlas_*` tools read and record Atlas project memory; `mcp__orchestra__dock_*` tools operate " +
        "apps in the owner's App Dock.",
      "- `mcp__orchestra__context_recall` brings back earlier work from this session after Claude Code compacted it.",
    ].join("\n"),
    "## Working with the owner",
    [
      "- A message the owner sends while you work reaches you at your next step. Treat it as steering: fold in " +
        "corrections and keep the goal unless the owner changes it.",
      "- Track multi-step work with TaskCreate and TaskUpdate; use TaskList or TaskGet to inspect it. The owner sees " +
        "the list. Use the task tools available in this session. When you need a decision, ask with " +
        "AskUserQuestion, offering short options.",
      "- Tool calls and seat reports show as collapsed rows, so put what the owner needs from them in your own reply.",
    ].join("\n"),
  ].join("\n\n")
}
