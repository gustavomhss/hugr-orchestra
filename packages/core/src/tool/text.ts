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
The child runs in this Location, or in directory when given, through the canonical Session runner and returns its real assistant reply.
Optional model is an exact provider/model identity; nested model IDs and virtual providers are preserved.
Delegation requires the calling turn owner's task permission and every ancestor's hard model ceiling.
Use task_id to continue an existing child of this Session or explicitly recover unfinished work.
Use directory to run the child in another git worktree of this repository, named by its root; create the worktree first.
Calls without task_id are idempotent for the same recorded assistant and tool call. Maestro cannot be a target.`

export const teamMessage = `Send a short message to a teammate on the Orchestra team: \`maestro\` from live, \`live\` from Maestro.
It is queued into the teammate's current conversation and never interrupts a reply in progress.
The teammate reads it as a peer's note, not as the owner. Use it to propose work, share what a meeting decided or answer a question.`

export const liveLook = `Look at the owner's screen: the desktop captures one frame and sends it as your next input, labelled [On screen].
Use it when the answer depends on what the owner is showing or reading. Pass question to say what to look for.`

export const meetingRecall = `Recall what earlier meetings decided, asked or committed, from the owner's own meeting memory. Read only.
Filter by words (query), a person's name or alias, a date range (since, until) or kind. Up to 20 items come back, newest first, each with its meeting, date, who said it and the quote.
Label what you say from it as [From memory: person, date, "title"]. When nothing comes back, say nothing is stored; do not guess.`

export const meetingCommitments = `List commitments from earlier meetings: what the owner owes (mine) and what others owe the owner (theirs). Read only.
Filter by person, direction and state. Only open commitments (proposed, accepted, overdue) come back unless you ask for done or dropped. Label what you say from it as [From memory: person, date, "title"].`

export const answered = (
  questions: ReadonlyArray<{ readonly question: string }>,
  answers: ReadonlyArray<ReadonlyArray<string>>,
) => {
  const formatted = questions
    .map((item, index) => `"${item.question}"="${answers[index]?.length ? answers[index].join(", ") : "Unanswered"}"`)
    .join(", ")
  return `The owner has answered your questions: ${formatted}. You can now continue with the owner's answers in mind.`
}
