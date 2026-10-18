import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Question } from "../question"
import { ToolText } from "@orchestra/core/tool/text"

export const Parameters = Schema.Struct({
  // An empty list would open a question prompt with nothing to answer.
  questions: Schema.mutable(Schema.Array(Question.Prompt).check(Schema.isMinLength(1))).annotate({
    description: "Questions to ask (at least one)",
  }),
})

type Metadata = {
  answers: ReadonlyArray<Question.Answer>
}

export const QuestionTool = Tool.define<typeof Parameters, Metadata, Question.Service>(
  "question",
  Effect.gen(function* () {
    const question = yield* Question.Service

    return {
      description: ToolText.question,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const answers = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: params.questions,
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })

          return {
            title: `Asked ${params.questions.length} question${params.questions.length > 1 ? "s" : ""}`,
            output: ToolText.answered(params.questions, answers),
            metadata: {
              answers,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
