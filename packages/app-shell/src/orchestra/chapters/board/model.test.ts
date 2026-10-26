import { describe, expect, test } from "bun:test"
import {
  across,
  answered,
  attachmentKind,
  canUndo,
  changed,
  credential,
  fold,
  foldAbove,
  gapAfter,
  gaps,
  group,
  inbox,
  intake,
  options,
  order,
  progress,
  rewind,
  shippedDay,
  step,
  steps,
  ticks,
  waitingOn,
  waits,
  type Activity,
  type Issue,
  type Question,
  type Snapshot,
} from "./model"

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
  // Split so the repo secret guard does not flag fake tokens.
  const github = "ghp" + "_abcdefghijklmnopqrstuvwxyz0123"
  const aws = "AKIA" + "ABCDEFGHIJKLMNOP"
  expect(credential("use sk-live-abcdefghijklmnop1234 for staging")).toBe("sk-live-abcdefghijklmnop1234")
  expect(credential("token " + github)).toBe(github)
  expect(credential(aws)).toBe(aws)
  expect(credential("key: Zm9vYmFyYmF6cXV4cXV1eHF1dXpxdXV6cXV1eg")).toBe("Zm9vYmFyYmF6cXV4cXV1eHF1dXpxdXV6cXV1eg")
  expect(credential("fixed in 3f9c2a1d4b5e6f708192a3b4c5d6e7f809102030")).toBeUndefined()
  expect(credential("see https://github.com/acme/app/pull/12 before merging")).toBeUndefined()
  expect(credential("run 550e8400-e29b-41d4-a716-446655440000 again")).toBeUndefined()
  expect(credential("plain words only")).toBeUndefined()
})

function row(id: string, issue: number | null, action: Activity["action"], time: number, extra: Partial<Activity> = {}): Activity {
  return { id, issue, actor: "maestro", action, reason: null, before: null, after: null, undoes: null, undoneBy: null, timeCreated: time, ...extra }
}

function question(id: string, issue: number | null, time: number, extra: Partial<Question> = {}): Question {
  return {
    id,
    issue,
    epic: null,
    text: `Question ${id}`,
    options: [
      { id: "a", label: "A", consequence: "" },
      { id: "b", label: "B", consequence: "" },
    ],
    recommended: "a",
    costOfWaiting: null,
    blocking: true,
    status: "open",
    answerOption: null,
    answerText: null,
    answeredAt: null,
    timeCreated: time,
    ...extra,
  }
}

function snapshot(key: string, extra: Partial<Snapshot> = {}): Snapshot {
  return {
    project: {
      id: `prj_${key}`,
      key,
      name: `Project ${key}`,
      goal: "",
      targetDate: null,
      budgetUsd: null,
      repoProjectID: null,
      githubRepo: null,
      status: "active",
      pausedReason: null,
      autoAcceptIntake: false,
      githubState: "off",
      githubError: null,
      githubSyncedAt: null,
    },
    epics: [],
    issues: [],
    questions: [],
    cursor: null,
    forecast: { shipped: 0, remaining: 0, targetDate: null, forecast: { kind: "done" } },
    epicForecasts: [],
    scope: [],
    ...extra,
  }
}

describe("intake", () => {
  test("five or fewer issues show as cards, newest first, without themes", () => {
    const queue = intake({ epics: [], issues: [issue(1, "intake", { stageEnteredAt: now - day }), issue(2, "intake"), issue(3, "ready")] })
    expect(queue.items.map((item) => item.number)).toEqual([2, 1])
    expect(queue.themes).toEqual([])
  })

  test("more than five group by epic, else by type, largest group first", () => {
    const epic = { id: "epc_1", number: 1, ref: "E1", title: "Billing", goal: "", position: 1, status: "open" as const, githubMilestone: null }
    const queue = intake({
      epics: [epic],
      issues: [
        issue(1, "intake", { epic: 1 }),
        issue(2, "intake", { epic: 1 }),
        issue(3, "intake", { epic: 1 }),
        issue(4, "intake", { type: "bug" }),
        issue(5, "intake", { type: "bug" }),
        issue(6, "intake", { type: "chore" }),
      ],
    })
    expect(queue.items).toHaveLength(6)
    expect(queue.themes.map((theme) => [theme.id, theme.issues.length])).toEqual([
      ["epic:1", 3],
      ["type:bug", 2],
      ["type:chore", 1],
    ])
    expect(queue.themes[0]).toMatchObject({ epic: "Billing" })
  })
})

describe("inbox", () => {
  test("lists open questions across projects oldest first, with the cards each one blocks", () => {
    const one = snapshot("ONE", {
      issues: [issue(1, "building", { paused: true }), issue(2, "ready", { dependsOn: ["LCH-1"] })],
      questions: [question("q2", 1, now), question("q3", null, now - day, { status: "answered" })],
    })
    const two = snapshot("TWO", { questions: [question("q1", null, now - 2 * day)] })
    const items = inbox([one, two])
    expect(items.map((item) => item.question.id)).toEqual(["q1", "q2"])
    expect(items[1]).toMatchObject({ key: "ONE", blocks: ["LCH-2"] })
    expect(items[1].issue?.number).toBe(1)
  })

  test("the recommended option comes first so key 1 takes it", () => {
    expect(options(question("q", null, now, { recommended: "b" })).map((option) => option.id)).toEqual(["b", "a"])
  })

  test("what waits on you counts open questions and the cards paused on them", () => {
    const one = snapshot("ONE", {
      issues: [issue(1, "building", { paused: true }), issue(2, "building", { paused: true })],
      questions: [question("q1", 1, now), question("q2", 2, now, { status: "answered" })],
    })
    expect(waits([one, snapshot("TWO")])).toEqual([{ key: "ONE", project: "Project ONE", targetDate: null, questions: 1, held: 1 }])
  })

  test("answered this week pairs each answer with its question and Maestro's next move", () => {
    const activity = [
      row("a1", 1, "question.ask", now - 9 * day, { after: { id: "old", text: "Old?" } }),
      row("a2", 1, "question.answer", now - 8 * day, { actor: "owner", after: { id: "old", answer_option: "a" } }),
      row("a3", 2, "question.ask", now - 2 * day, { after: { id: "q", text: "Ship it?" } }),
      row("a4", 2, "question.answer", now - day, { actor: "owner", after: { id: "q", answer_option: "b", answer_text: "yes" } }),
      row("a5", 2, "issue.move", now - day + 1),
    ]
    const list = answered(activity, now)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ ask: "q", issue: 2, question: "Ship it?", option: "b", text: "yes" })
    expect(list[0].next?.id).toBe("a5")
  })
})

describe("replay", () => {
  test("rewind undoes later rows from their before values and drops issues created after the mark", () => {
    const board = [issue(1, "review", { position: 3, steps: [{ title: "Ship", status: "done", now: null }] }), issue(2, "backlog")]
    const activity = [
      row("r0", 1, "issue.move", now - 3 * day, { before: { stage: "backlog" } }),
      row("r1", 1, "issue.move", now - day, { before: { stage: "building", position: 1, stage_entered_at: now - 2 * day } }),
      row("r2", 1, "steps.set", now - day + 1, { before: { steps: [{ title: "Ship", status: "active", now: "ci" }, "junk"] } }),
      row("r3", 2, "issue.create", now - day + 2, { after: { title: "Issue 2" } }),
    ]
    const past = rewind(board, activity, now - 2 * day)
    expect(past.map((item) => item.number)).toEqual([1])
    expect(past[0]).toMatchObject({ stage: "building", position: 1, stageEnteredAt: now - 2 * day })
    expect(past[0].steps).toEqual([{ title: "Ship", status: "active", now: "ci" }])
    expect(rewind(board, activity, now)).toEqual(board)
    expect([...changed(activity, now - 2 * day)].sort()).toEqual([1, 2])
  })

  test("runs of step updates fold only when the replay is long", () => {
    const short = [row("s1", 1, "steps.set", 1), row("s2", 1, "steps.set", 2)]
    expect(fold(short).map((entry) => entry.count)).toEqual([1, 1])
    const long = Array.from({ length: foldAbove + 1 }, (_, index) =>
      row(`l${index}`, 1, index === 0 ? "issue.move" : "steps.set", index),
    )
    expect(fold(long).map((entry) => [entry.row.id, entry.count])).toEqual([
      ["l0", 1],
      [`l${foldAbove}`, foldAbove],
    ])
  })

  test("quiet stretches of six hours or more become gaps, shorter ones do not", () => {
    const start = now
    expect(gaps([start + 1000, start + 1000 + gapAfter], start, start + 1000 + gapAfter + 60_000)).toEqual([
      { from: start + 1000, to: start + 1000 + gapAfter },
    ])
    expect(gaps([], start, start + gapAfter - 1)).toEqual([])
  })
})
