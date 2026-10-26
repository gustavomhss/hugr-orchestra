export * as BoardTools from "./tools"

import { Effect, Layer } from "effect"
import {
  DecisionOutcomeInput,
  EpicInput,
  IssueInput,
  MoveInput,
  ProjectInput,
  QuestionInput,
  Read,
  ReadInput,
  SettingsToolInput,
  StepsInput,
  WriteResult,
} from "@orchestra/schema/board"
import { AgentV2 } from "../agent"
import { makeGlobalNode } from "../effect/app-node"
import { ApplicationTools } from "../tool/application-tools"
import { Tool } from "../tool/tool"
import { Board } from "./board"

// The board tools are Maestro's only way to read and plan the board (contract section 4). Seats other than Maestro get a
// failure even when a profile would let them call the tool.

export const node = makeGlobalNode({
  name: "board/tools",
  layer: Layer.effectDiscard(
    Effect.gen(function* () {
      const tools = yield* ApplicationTools.Service
      const board = yield* Board.Service
      yield* tools
        .register({
          board_read: Tool.make({
            description:
              "Read a board project: epics, issues with steps, open questions, what the owner did since `since` (notes, answers, undos, pauses, holds), attachment names and, with `issue`, that issue's page with its live git trail. Pass the returned `cursor` as `since` next time.",
            input: ReadInput,
            output: Read,
            execute: (input, context) => guard(context, board.read(input)),
          }),
          board_project: Tool.make({
            description:
              "Create a board project (needs `name`) or update one by `key`. `repo` is the repo directory the agents work in.",
            input: ProjectInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.project(input)),
          }),
          board_epic: Tool.make({
            description: "Create an epic (omit `number`; needs `title`) or update one by `number`.",
            input: EpicInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.epic(input)),
          }),
          board_issue: Tool.make({
            description:
              "Create an issue in Backlog (omit `number`; needs `title`) or update one by `number`, including linking its branch, PR, session and seat, `attempts`, `crash_reason` and the `guardrail_rule` that blocked it. `depends_on` replaces the list.",
            input: IssueInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.issue(input)),
          }),
          board_move: Tool.make({
            description:
              "Move an issue to a stage. Review needs a linked PR; Shipped needs that PR merged (or no PR and a reason) and no owner hold. Intake is the owner's.",
            input: MoveInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.move(input)),
          }),
          board_steps: Tool.make({
            description: "Replace an issue's step list. At most one step is active; `now` is the live line on the card.",
            input: StepsInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.steps(input)),
          }),
          board_question: Tool.make({
            description:
              "Ask the owner a question with 2-4 options and a recommended one, or withdraw an open question by `id`. Works while the project is paused.",
            input: QuestionInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.question(input)),
          }),
          board_settings: Tool.make({
            description:
              "Set a project's target date (epoch milliseconds) and budget in dollars. Omitted fields stay; null clears one. At 100% of the budget the board starts no new work.",
            input: SettingsToolInput,
            output: WriteResult,
            execute: (input, context) =>
              guard(context, board.settings(input.project, { target_date: input.target_date, budget_usd: input.budget_usd, reason: input.reason }, "maestro")),
          }),
          board_decision: Tool.make({
            description:
              "Record the outcome of an answered decision, by decision id or the answered question's id. Say what came of it; until then it reads \"applied, no result yet\".",
            input: DecisionOutcomeInput,
            output: WriteResult,
            execute: (input, context) => guard(context, board.decisionOutcome(input)),
          }),
        })
        .pipe(Effect.orDie)
    }),
  ),
  deps: [ApplicationTools.node, Board.node],
})

function guard<A>(context: Tool.Context, effect: Effect.Effect<A, Board.Error>) {
  if (context.agent !== AgentV2.defaultID)
    return Effect.fail(new Tool.Failure({ message: "The board tools belong to Maestro; ask Maestro to change the board." }))
  return effect.pipe(Effect.mapError((error) => new Tool.Failure({ message: error.message })))
}
