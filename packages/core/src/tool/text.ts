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

export const answered = (
  questions: ReadonlyArray<{ readonly question: string }>,
  answers: ReadonlyArray<ReadonlyArray<string>>,
) => {
  const formatted = questions
    .map((item, index) => `"${item.question}"="${answers[index]?.length ? answers[index].join(", ") : "Unanswered"}"`)
    .join(", ")
  return `The owner has answered your questions: ${formatted}. You can now continue with the owner's answers in mind.`
}
