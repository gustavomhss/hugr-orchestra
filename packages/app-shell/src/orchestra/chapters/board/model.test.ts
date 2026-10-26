import { describe, expect, test } from "bun:test"
import { across, attachmentKind, canUndo, credential, group, order, progress, shippedDay, step, steps, ticks, waitingOn, type Issue } from "./model"

const day = 24 * 60 * 60 * 1000
const now = new Date(2026, 9, 25, 15).getTime()

function issue(number: number, stage: Issue["stage"], extra: Partial<Issue> = {}): Issue {
  return {
    id: `iss_${number}`,
    number,
    ref: `LCH-${number}`,
    epic: null,
    title: `Issue ${number}`,
    body: "",
    type: "feature",
    stage,
    position: number,
    estimate: null,
    seat: null,
    sessionID: null,
    branch: null,
    prNumber: null,
    holdBeforeMerge: false,
    paused: false,
    stageEnteredAt: now,
    githubNumber: null,
    steps: [],
    dependsOn: [],
    ...extra,
  }
}

describe("group", () => {
  test("puts each stage in its column in Maestro's order, counts intake and cut, and lists shipped newest first", () => {
    const grouped = group([
      issue(1, "ready", { position: 2 }),
      issue(2, "ready", { position: 1 }),
      issue(3, "intake"),
      issue(4, "intake"),
      issue(5, "cut"),
      issue(6, "shipped", { stageEnteredAt: now - 2 * day }),
      issue(7, "shipped", { stageEnteredAt: now }),
      issue(8, "building"),
      issue(9, "review"),
      issue(10, "backlog"),
    ])
    expect(Object.fromEntries(Object.entries(grouped.lanes).map(([stage, items]) => [stage, items.map((item) => item.number)])))
      .toEqual({ backlog: [10], ready: [2, 1], building: [8], review: [9], shipped: [7, 6] })
    expect(grouped.intake).toBe(2)
    expect(grouped.cut).toBe(1)
  })

  test("an empty board has five empty columns", () => {
    expect(Object.values(group([]).lanes).map((items) => items.length)).toEqual([0, 0, 0, 0, 0])
  })
})

test("progress counts only planned work, shipped first", () => {
  const plan = progress([issue(1, "shipped"), issue(2, "review"), issue(3, "backlog"), issue(4, "intake"), issue(5, "cut")])
  expect(plan.total).toBe(3)
  expect(plan.shipped).toBe(1)
  expect(plan.percent).toBe(33)
  expect(plan.stages.map((item) => item.stage)).toEqual(["shipped", "review", "building", "ready", "backlog"])
  expect(progress([]).percent).toBe(0)
})

test("steps report the active step and its now line, and count skipped steps as settled", () => {
  const plan = steps({
    steps: [
      { title: "a", status: "done", now: null },
      { title: "b", status: "skipped", now: null },
      { title: "c", status: "active", now: "running tests" },
      { title: "d", status: "pending", now: null },
    ],
  })
  expect(plan).toEqual({ total: 4, done: 2, current: 3, now: "running tests" })
  expect(steps({ steps: [] })).toEqual({ total: 0, done: 0, current: undefined, now: undefined })
})

test("ticks read GitHub's check rollup", () => {
  const ci = ticks([
    { name: "a", status: "COMPLETED", conclusion: "SUCCESS" },
    { name: "b", status: "completed", conclusion: "skipped" },
    { name: "c", status: "completed", conclusion: "failure" },
    { name: "d", status: "in_progress", conclusion: null },
  ])
  expect(ci).toEqual({ states: ["pass", "pass", "fail", "run"], passed: 2, total: 4 })
})

describe("keyboard order", () => {
  const lanes = group([issue(1, "backlog"), issue(2, "backlog"), issue(3, "building"), issue(4, "shipped")]).lanes

  test("down and up walk each column top to bottom, left to right, and stop at the ends", () => {
    const refs = order(lanes)
    expect(refs).toEqual(["LCH-1", "LCH-2", "LCH-3", "LCH-4"])
    expect(step(refs, undefined, 1)).toBe("LCH-1")
    expect(step(refs, undefined, -1)).toBe("LCH-4")
    expect(step(refs, "LCH-2", 1)).toBe("LCH-3")
    expect(step(refs, "LCH-4", 1)).toBe("LCH-4")
    expect(step([], undefined, 1)).toBeUndefined()
  })

  test("left and right skip empty columns and keep the row where they can", () => {
    expect(across(lanes, "LCH-2", 1)).toBe("LCH-3")
    expect(across(lanes, "LCH-3", 1)).toBe("LCH-4")
    expect(across(lanes, "LCH-3", -1)).toBe("LCH-1")
    expect(across(lanes, "LCH-4", 1)).toBe("LCH-4")
  })
})

test("shipped rows group by day", () => {
  expect(shippedDay({ stageEnteredAt: now }, now)).toBe("today")
  expect(shippedDay({ stageEnteredAt: now - day }, now)).toBe("yesterday")
  expect(shippedDay({ stageEnteredAt: now - 4 * day }, now)).toBe("week")
  expect(shippedDay({ stageEnteredAt: now - 30 * day }, now)).toBe("earlier")
})

test("a paused card names the open question asked on it", () => {
  const question = { status: "open" as const, issue: 3 }
  const questions = [{ ...question, status: "answered" as const }, question] as unknown as Parameters<typeof waitingOn>[0]["questions"]
  expect(waitingOn({ questions }, { number: 3 })).toBe(questions[1])
  expect(waitingOn({ questions }, { number: 4 })).toBeUndefined()
})

test("only Maestro's plan changes and GitHub overwrites offer undo, once", () => {
  expect(canUndo({ actor: "maestro", action: "issue.move", undoneBy: null })).toBe(true)
  expect(canUndo({ actor: "github", action: "github.overwrite", undoneBy: null })).toBe(true)
  expect(canUndo({ actor: "maestro", action: "issue.move", undoneBy: "act_9" })).toBe(false)
  expect(canUndo({ actor: "owner", action: "note.add", undoneBy: null })).toBe(false)
  expect(canUndo({ actor: "maestro", action: "question.ask", undoneBy: null })).toBe(false)
})

test("a dropped file's kind follows its MIME type", () => {
  expect(attachmentKind("image/png")).toBe("image")
  expect(attachmentKind("video/mp4")).toBe("video")
  expect(attachmentKind("application/pdf")).toBe("doc")
  expect(attachmentKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("doc")
  expect(attachmentKind("text/markdown")).toBe("doc")
  expect(attachmentKind("application/zip")).toBe("file")
  expect(attachmentKind("")).toBe("file")
})

test("a note that carries a key is caught, a commit hash or a link is not", () => {
  expect(credential("use sk-live-abcdefghijklmnop1234 for staging")).toBe("sk-live-abcdefghijklmnop1234")
  expect(credential("token ghp_abcdefghijklmnopqrstuvwxyz0123")).toBe("ghp_abcdefghijklmnopqrstuvwxyz0123")
  expect(credential("AKIAABCDEFGHIJKLMNOP")).toBe("AKIAABCDEFGHIJKLMNOP")
  expect(credential("key: Zm9vYmFyYmF6cXV4cXV1eHF1dXpxdXV6cXV1eg")).toBe("Zm9vYmFyYmF6cXV4cXV1eHF1dXpxdXV6cXV1eg")
  expect(credential("fixed in 3f9c2a1d4b5e6f708192a3b4c5d6e7f809102030")).toBeUndefined()
  expect(credential("see https://github.com/acme/app/pull/12 before merging")).toBeUndefined()
  expect(credential("run 550e8400-e29b-41d4-a716-446655440000 again")).toBeUndefined()
  expect(credential("plain words only")).toBeUndefined()
})
