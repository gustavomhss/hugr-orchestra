export * as ConductorV2 from "./conductor"

import { Effect } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import type { Snapshot } from "@orchestra/core/snapshot"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Seats } from "../seats"

// Maestro conducts; seats investigate and build. These limits hold Maestro to that in both engines: every Maestro call
// passes ToolSafety.run, natively around the tool and in Claude mode around the host's authorization, so each check
// runs before the call and each count after it succeeds. A budget lasts one drain: the runner's `session-idle` event
// clears it, and a restart starts a fresh one.

export const READS = 10
export const LINES = 20
export const FILES = 2

const READ_TOOLS = new Set(["read", "grep", "glob", "lsp", "codesearch", "webfetch", "websearch", "bash"])
const WRITE_TOOLS = new Set(["edit", "write", "apply_patch", "multiedit"])
// Board tools that change it, and the input field that names their project.
const BOARD_WRITES: Readonly<Record<string, string>> = {
  board_project: "key",
  board_epic: "project",
  board_issue: "project",
  board_move: "project",
  board_steps: "project",
  board_question: "project",
  board_settings: "project",
  board_decision: "project",
  board_queue: "project",
  board_dequeue: "project",
  board_bundle: "project",
}
const MERGE = /(^|[\s;&|(])gh\s+pr\s+merge\b/

type Budget = {
  reads: number
  /** Projects Maestro read with `board_read` this drain. */
  readonly boards: Set<string>
  /** The worktree when Maestro first edited or ran a shell this drain, and at its latest such call. */
  baseline?: Snapshot.ID
  last?: Snapshot.ID
  over: boolean
  /** The worktree changed again after the budget ran out: no further edit or shell this drain. */
  locked: boolean
}

export function make(snapshot: Snapshot.Interface) {
  const budgets = new Map<string, Budget>()
  const budget = (sessionID: string) => {
    const known = budgets.get(sessionID)
    if (known) return known
    const made: Budget = { reads: 0, boards: new Set(), over: false, locked: false }
    budgets.set(sessionID, made)
    return made
  }

  /** Runs `call` for Maestro inside the limits; any other agent's call runs as it is. */
  const run = <A, E, R>(input: ToolSafety.Invocation, call: Effect.Effect<A, E | ToolSafety.Denied, R>) =>
    Effect.gen(function* () {
      if (input.agent !== AgentV2.defaultID) return yield* call
      const state = budget(input.sessionID)
      const args = input.args && typeof input.args === "object" ? (input.args as Record<string, unknown>) : {}
      yield* board(state, input.tool, args)
      if (input.tool === "bash" && typeof args.command === "string" && MERGE.test(args.command))
        return yield* new ToolSafety.Denied({ reason: "maestro-merge", detail: "Queue the card with board_queue; the host merges it." })
      if (READ_TOOLS.has(input.tool) && state.reads >= READS) {
        const research = Seats.research()
        return yield* new ToolSafety.Denied({
          reason: "maestro-read-budget",
          detail: `Maestro made ${READS} reads since its last dispatch. Investigation goes to ${research ? `\`${research.id}\`` : "a research agent"}: dispatch it with task.`,
        })
      }
      if (input.tool === "bash" || WRITE_TOOLS.has(input.tool)) yield* writes(state, input.tool)
      const value = yield* call
      if (READ_TOOLS.has(input.tool)) state.reads++
      if (input.tool === "task" && args.background !== true) state.reads = 0
      if (input.tool === "board_read" && typeof args.project === "string") state.boards.add(args.project)
      return value
    })

  // A board change, or a dispatch naming a card, needs a board_read of that project this drain.
  const board = (state: Budget, tool: string, args: Record<string, unknown>) => {
    const field = BOARD_WRITES[tool]
    const card = tool === "task" && typeof args.card === "string" ? args.card : undefined
    const project = card ? card.slice(0, card.indexOf("-")) : field ? args[field] : undefined
    if (typeof project !== "string" || state.boards.has(project)) return Effect.void
    return Effect.fail(
      new ToolSafety.Denied({
        reason: "maestro-board-unread",
        detail: `Read the board first: call board_read with project ${JSON.stringify(project)}, then retry.`,
      }),
    )
  }

  // Git decides what changed, whatever wrote it. The worktree is measured before each Maestro edit or shell, so the
  // call that crosses the limit stands and the next one is refused. Without snapshots (no git, or `snapshots: false`)
  // nothing is measured.
  const writes = (state: Budget, tool: string) =>
    Effect.gen(function* () {
      const now = yield* snapshot.capture()
      if (now && !state.baseline) state.baseline = now
      if (now && state.baseline && now !== state.last) {
        const diff = yield* snapshot.diff({ from: state.baseline, to: now, context: 0 }).pipe(Effect.orElseSucceed(() => []))
        const lines = diff.reduce((sum, file) => sum + file.additions + file.deletions, 0)
        if (state.over && state.last) state.locked = true
        state.over = lines > LINES || diff.length > FILES
        state.last = now
      }
      if (state.locked || (state.over && tool !== "bash"))
        return yield* new ToolSafety.Denied({
          reason: "maestro-write-budget",
          detail: `Maestro's own changes this turn passed ${LINES} lines or ${FILES} files. Dispatch the area's seat with writePaths.`,
        })
    })

  return {
    run,
    /** Ends Maestro's budget for the drain that settled. */
    idle: (sessionID: string) => budgets.delete(sessionID),
  }
}
