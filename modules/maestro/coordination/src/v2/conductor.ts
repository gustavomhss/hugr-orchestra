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
  /** `board_read` stamps this drain, by project. A key is a project read; its numbers are issue reads. */
  readonly stamps: Map<string, Set<number>>
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
    const made: Budget = { reads: 0, stamps: new Map(), over: false, locked: false }
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
      if (input.tool === "board_read" && typeof args.project === "string") {
        const read = state.stamps.get(args.project) ?? new Set<number>()
        if (typeof args.issue === "number") read.add(args.issue)
        state.stamps.set(args.project, read)
      }
      const written = BOARD_WRITES[input.tool]
      const project = written ? args[written] : undefined
      if (typeof project === "string") state.stamps.delete(project)
      return value
    })

  // A board write needs a `board_read` of that project since its last write this drain; reading an issue counts. A task
  // naming a card needs that issue read — a project-only read does not — and does not itself drop the stamps. The check
  // runs before the call; stamps drop only after a write succeeds.
  const board = (state: Budget, tool: string, args: Record<string, unknown>) => {
    const field = BOARD_WRITES[tool]
    const project = field ? args[field] : undefined
    if (typeof project === "string" && !state.stamps.has(project)) return unread(project)
    if (tool !== "task" || typeof args.card !== "string") return Effect.void
    const at = args.card.indexOf("-")
    const key = args.card.slice(0, at)
    const issue = Number(args.card.slice(at + 1))
    if (state.stamps.get(key)?.has(issue)) return Effect.void
    return unread(key, issue)
  }

  const unread = (project: string, issue?: number) =>
    Effect.fail(
      new ToolSafety.Denied({
        reason: "maestro-board-unread",
        detail: `Read the board first: call board_read with project ${JSON.stringify(project)}${issue === undefined ? "" : ` and issue ${issue}`}, then retry.`,
      }),
    )

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
