import { expect, test } from "bun:test"
import { isNoAnswer, parseAnswer, parseStopSummary, worthSuggesting } from "./live-answer"

test("reads the bold lead and the points, with per-point sources", () => {
  const answer = parseAnswer(
    ["**Ship on Friday, after the migration lands.**", "- The migration is the blocker", "* [memory] Ana owns it", "2. [Screen] CI is green"].join(
      "\n",
    ),
    { source: "heard", latencyMs: 900, question: "When do we ship?" },
  )
  expect(answer).toEqual({
    question: "When do we ship?",
    lead: "Ship on Friday, after the migration lands.",
    points: [
      { text: "The migration is the blocker", source: "heard" },
      { text: "Ana owns it", source: "memory" },
      { text: "CI is green", source: "screen" },
    ],
    latencyMs: 900,
  })
})

test("a reply off the shape still shows: first line leads, the rest are points", () => {
  const answer = parseAnswer("## Plain answer\n\nsecond line", { source: "screen", latencyMs: 0 })
  expect(answer.lead).toBe("Plain answer")
  expect(answer.points).toEqual([{ text: "second line", source: "screen" }])
})

test("recognises the no-answer token", () => {
  expect(isNoAnswer("  [NO-ANSWER]")).toBe(true)
  expect(isNoAnswer("**Yes.** [no-answer]")).toBe(false)
})

test("suggests only real questions, once", () => {
  expect(worthSuggesting("Right?")).toBe(false)
  expect(worthSuggesting("We shipped it last week.")).toBe(false)
  expect(worthSuggesting("What is the budget for Q3?")).toBe(true)
  expect(worthSuggesting("What is the budget for Q3?", "what is the budget for q3?")).toBe(false)
})

test("reads the stop summary from the first JSON object in the reply", () => {
  const view = parseStopSummary(
    'Done.\n{"decisions":["Ship Friday"],"openItems":[{"text":"Run the migration","owner":"Ana"}],"followUp":"Thanks all","saved":true}',
    { title: "Sync", durationMs: 60_000 },
  )
  expect(view).toEqual({
    kind: "stop-ready",
    title: "Sync",
    durationMs: 60_000,
    decisions: ["Ship Friday"],
    openItems: [{ text: "Run the migration", owner: "Ana" }],
    followUp: "Thanks all",
    saved: true,
  })
})

test("a stop reply that is not the JSON still closes the meeting, unsaved", () => {
  const view = parseStopSummary("I could not write the memory.", { title: "Sync", durationMs: 1 })
  expect(view.saved).toBe(false)
  expect(view.decisions).toEqual([])
  expect(view.followUp).toBe("I could not write the memory.")
})
