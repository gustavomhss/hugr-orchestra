export * as ToolText from "./text"

import QUESTION from "./question.txt"
import SKILL from "./skill.txt"
import TODOWRITE from "./todowrite.txt"
import WEBSEARCH from "./websearch.txt"

// What models read about the tools that behave alike in both session paths, so both paths say the same thing.
export const question = QUESTION
export const skill = SKILL
export const todowrite = TODOWRITE
export const websearch = (year: number) => WEBSEARCH.replace("{{year}}", String(year))
export const task = `Delegate a complete task to a visible agent using its stable ID in subagent_type.
The child runs in this Location through the canonical Session runner and returns its real assistant reply.
Optional model is an exact provider/model identity; nested model IDs and virtual providers are preserved.
Delegation requires the calling turn owner's task permission and every ancestor's hard model ceiling.
Use task_id to continue an existing child of this Session or explicitly recover unfinished work.
Calls without task_id are idempotent for the same recorded assistant and tool call. Maestro cannot be a target.`

export const answered = (
  questions: ReadonlyArray<{ readonly question: string }>,
  answers: ReadonlyArray<ReadonlyArray<string>>,
) => {
  const formatted = questions
    .map((item, index) => `"${item.question}"="${answers[index]?.length ? answers[index].join(", ") : "Unanswered"}"`)
    .join(", ")
  return `The owner has answered your questions: ${formatted}. You can now continue with the owner's answers in mind.`
}
