export * as ClaudeHostOptions from "./options"

// What Claude mode adds to a Claude Code turn. Claude Code keeps its own prompt, tools, login and loop; Orchestra adds
// to it through the documented channels only: the `claude_code` preset with an appended Orchestra text (never a custom
// prompt), one in-process `orchestra` MCP server, in-process hook callbacks and the owner's own environment.

export const MCP_SERVER = "orchestra"

/** Documented task-tracking opt-in for newer models; current binaries expose TaskCreate/Update/Get/List. */
export const ENV_FLAGS = { CLAUDE_CODE_ENABLE_TODO_TOOLS: "1" } as const

const REVIEW_NOTICE =
  "`mcp__orchestra__maestro_request_review` runs the governed cold review by `lucy` and records its receipt; use it " +
  "when authorization needs a review."

const WORKFLOW_NOTICE =
  "An approved Relay workflow is dispatched with `mcp__orchestra__task`: pass `subagent_type`, the presented `prompt` " +
  "and `model` byte for byte, `authorizationID`, `workflow` and `writePaths` exactly as approved. Orchestra binds the " +
  "approved plan to that dispatch."

/**
 * The owner's environment as it is, plus ENV_FLAGS. One variable is dropped: `CLAUDE_CODE_ENTRYPOINT`, which a parent
 * Claude surface (for example the desktop app this process may run inside) passes down. Left in place it would label
 * this session as that surface; without it the SDK records its own entrypoint. This is truthful identification of the
 * caller, not a billing setting, and no credential or auth variable is added or removed.
 */
export function environment(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return { ...Object.fromEntries(Object.entries(env).filter(([key]) => key !== "CLAUDE_CODE_ENTRYPOINT")), ...ENV_FLAGS }
}

/**
 * The text appended to Claude Code's preset for the Session's seat. `tools` are the Orchestra tools served to this
 * Session, by Orchestra name: the note names only those, since a tool the Session does not hold would send the model
 * after a call that fails. `own` is the seat's own Orchestra prompt, which a seat other than Maestro works by, as it does
 * on Orchestra's own engine.
 */
export function append(seat: string, tools: ReadonlyArray<string> = [], own: ReadonlyArray<string> = []) {
  if (seat === "maestro") return maestro(tools)
  return [
    [
      `You are the \`${seat}\` seat of HuGR Orchestra, a desktop app for software work. Orchestra shows your work to the`,
      "owner and adds its own tools beside Claude Code's, under the `mcp__orchestra__` prefix: a tool named without the",
      "prefix below, such as `skill`, is `mcp__orchestra__skill` here.",
      ...(tools.includes("process_control") ? [PROCESS_NOTICE] : []),
    ].join(" "),
    ...own,
  ].join("\n\n")
}

const PROCESS_NOTICE =
  "For a long-running command (a dev server, a watcher, a long build or test run) use " +
  "`mcp__orchestra__process_control`, so the owner can follow its output live in the Processes panel; use Bash for short " +
  "commands."

function maestro(tools: ReadonlyArray<string>) {
  const has = (prefix: string) => tools.some((tool) => tool.startsWith(prefix))
  return [
    "# Maestro on Claude Code",
    "You are Maestro, the conductor of HuGR Orchestra, a desktop app for software work. The owner talks to you. You " +
      "carry each request until the owner's goal is met, doing the work yourself or through Orchestra's seats, and you " +
      "own every result you report. Claude Code is the engine you run on: when the owner asks who you are, you are Maestro.",
    ...(tools.includes("task")
      ? [
          "## Delegating to seats",
          [
            "- Dispatch a seat with `mcp__orchestra__task`, as on Orchestra's own engine: each dispatch is its own " +
              "Orchestra Session, which the owner opens and follows in the app. Claude Code's own `Agent` tool is not " +
              "available here.",
            "- Route by the `<team>` list in your context: it names each seat by id (the `subagent_type`), the name the " +
              "owner sees, its work and its areas. Investigation and research go to the research seat it names, plans to " +
              "the planner, code in a seat's areas to that seat. You verify, integrate and make micro-edits; seats build.",
            "- A seat sees only your brief. Give it the goal, what done looks like, the files and constraints that matter " +
              "and what to return.",
            "- Read a seat's report before you rely on it, and check its claims against the repository when they matter.",
          ].join("\n"),
        ]
      : []),
    "## Orchestra's tools",
    [
      "Orchestra adds its own tools beside Claude Code's, under the `mcp__orchestra__` prefix. A tool named without the " +
        "prefix in Orchestra's text, such as `board_read`, is `mcp__orchestra__board_read` here.",
      ...(tools.includes("skill")
        ? ["- Load Orchestra's playbooks and skills with `mcp__orchestra__skill`; Claude Code's own `Skill` tool does not " +
          "know them. `maestro-orchestra` maps what Orchestra can do and which tool or seat does it: load it before " +
          "you say Orchestra cannot do something."]
        : []),
      ...(has("board_")
        ? ["- The Projects board is where tracked work lives: read it with `mcp__orchestra__board_read` at the start of " +
          "every turn that touches tracked work, and keep each card's seat, Session, branch, PR and steps on it."]
        : []),
      ...(tools.includes("process_control") ? [`- ${PROCESS_NOTICE}`] : []),
      ...(has("maestro_")
        ? ["- `mcp__orchestra__maestro_*` tools run Orchestra's governed workflow: admission, plans, reviews and approvals."]
        : []),
      ...(tools.includes("maestro_request_review") ? [`- ${REVIEW_NOTICE}`] : []),
      ...(tools.includes("task") ? [`- ${WORKFLOW_NOTICE}`] : []),
      ...(has("atlas_") ? ["- `mcp__orchestra__atlas_*` tools read Atlas, the project's ownership and history."] : []),
      ...(has("dock_") ? ["- `mcp__orchestra__dock_*` tools operate apps in the owner's MCP Dock."] : []),
      ...(tools.includes("context_recall")
        ? ["- `mcp__orchestra__context_recall` brings back earlier work from this session after Claude Code compacted it."]
        : []),
    ].join("\n"),
    "## Working with the owner",
    [
      "- A message the owner sends while you work reaches you at your next step. Treat it as steering: fold in " +
        "corrections and keep the goal unless the owner changes it.",
      "- Track multi-step work with TaskCreate and TaskUpdate; use TaskList or TaskGet to inspect it. The owner sees " +
        "the list. Use the task tools available in this session. When you need a decision, ask with " +
        "AskUserQuestion, offering short options.",
      "- Tool calls and seat dispatches show as collapsed rows, so put what the owner needs from them in your own reply.",
    ].join("\n"),
  ].join("\n\n")
}
