import { describe, expect, test } from "bun:test"
import type { Issue, Snapshot } from "./model"
import {
  bars,
  byEpic,
  byStage,
  filtered,
  frame,
  isoWeek,
  monday,
  range,
  seats,
  segment,
  shipLine,
  sorted,
  tally,
  waits,
  type Summary,
} from "./plan"

const day = 24 * 60 * 60 * 1000
const start = Date.UTC(2026, 9, 12)

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
    stageEnteredAt: start,
    githubNumber: null,
    steps: [],
    dependsOn: [],
    ...extra,
  }
}

function epic(number: number, position: number, status: Snapshot["epics"][number]["status"] = "open") {
  return {
    id: `epc_${number}`,
    number,
    ref: `LCH-E${number}`,
    title: `Epic ${number}`,
    goal: "",
    position,
    status,
    githubMilestone: null,
  }
}

function summary(key: string, status: Summary["project"]["status"]): Summary {
  return {
    project: {
      id: `prj_${key}`,
      key,
      name: key,
      goal: "",
      targetDate: null,
      budgetUsd: null,
      repoProjectID: null,
      githubRepo: null,
      status,
      pausedReason: null,
      autoAcceptIntake: false,
      githubState: "off",
      githubError: null,
      githubSyncedAt: null,
    },
    stages: {},
    openQuestions: 0,
    health: "on_track",
    forecast: { shipped: 0, remaining: 0, targetDate: null, forecast: { kind: "done" } },
  }
}

const question = (issue: number, status: "open" | "answered") => ({
  id: `bq_${issue}_${status}`,
  issue,
  epic: null,
  text: "Which one?",
  options: [],
  recommended: "a",
  costOfWaiting: null,
  blocking: true,
  status,
  answerOption: null,
  answerText: null,
  answeredAt: null,
  timeCreated: start,
})

describe("segment", () => {
  test("All hides archived projects, Running and Shipped narrow by status, Archived shows only archived ones", () => {
    const items = [summary("A", "active"), summary("B", "paused"), summary("C", "shipped"), summary("D", "archived")]
    const keys = (which: Parameters<typeof segment>[1]) => segment(items, which).map((item) => item.project.key)
    expect(keys("all")).toEqual(["A", "B", "C"])
    expect(keys("running")).toEqual(["A"])
    expect(keys("shipped")).toEqual(["C"])
    expect(keys("archived")).toEqual(["D"])
  })
})

describe("filtered and sorted", () => {
  const issues = [
    issue(1, "backlog", { position: 2 }),
    issue(2, "backlog", { position: 1 }),
    issue(3, "building", { seat: "backend" }),
    issue(4, "review", { seat: "frontend" }),
    issue(5, "shipped", { stageEnteredAt: start + day }),
    issue(6, "shipped", { stageEnteredAt: start + 3 * day }),
    issue(7, "ready", { seat: "backend" }),
    issue(8, "intake"),
    issue(9, "cut"),
  ]

  test("reads review first, then building, ready and backlog in Maestro's order, and shipped newest first", () => {
    expect(sorted(issues).map((item) => item.number)).toEqual([4, 3, 7, 2, 1, 6, 5])
  })

  test("filters keep intake and cut out and narrow by question, stage or seat", () => {
    const snapshot = { issues, questions: [question(7, "open"), question(1, "answered")] }
    const numbers = (which: Parameters<typeof filtered>[1]) => filtered(snapshot, which).map((item) => item.number)
    expect(numbers("all")).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(numbers("needs")).toEqual([7])
    expect(numbers("building")).toEqual([3])
    expect(numbers("review")).toEqual([4])
    expect(numbers("seat:backend")).toEqual([3, 7])
    expect(seats(issues)).toEqual(["backend", "frontend"])
  })

  test("byStage groups in reading order and drops empty stages", () => {
    expect(byStage(issues).map((group) => [group.stage, group.issues.map((item) => item.number)])).toEqual([
      ["review", [4]],
      ["building", [3]],
      ["ready", [7]],
      ["backlog", [2, 1]],
      ["shipped", [6, 5]],
    ])
  })
})

describe("byEpic", () => {
  test("puts the epic closest to done first, finished epics after open ones, and issues without an epic last", () => {
    const issues = [
      issue(1, "shipped", { epic: 1 }),
      issue(2, "building", { epic: 1 }),
      issue(3, "shipped", { epic: 2 }),
      issue(4, "shipped", { epic: 2 }),
      issue(5, "ready", { epic: 2 }),
      issue(6, "shipped", { epic: 3 }),
      issue(7, "backlog"),
      issue(8, "cut", { epic: 1 }),
      issue(9, "ready", { epic: 4 }),
    ]
    const snapshot = { epics: [epic(1, 1), epic(2, 2), epic(3, 3, "shipped"), epic(4, 4, "cut")], issues }
    const groups = byEpic(snapshot, sorted(issues))
    expect(groups.map((group) => [group.epic?.number ?? null, group.shipped, group.total])).toEqual([
      [2, 2, 3],
      [1, 1, 2],
      [3, 1, 1],
      [null, 0, 2],
    ])
    expect(groups.at(-1)?.issues.map((item) => item.number)).toEqual([9, 7])
  })

  test("counts stay whole while a filter hides rows, and a group with no matching rows disappears", () => {
    const issues = [issue(1, "shipped", { epic: 1 }), issue(2, "building", { epic: 1 }), issue(3, "ready", { epic: 2 })]
    const groups = byEpic({ epics: [epic(1, 1), epic(2, 2)], issues }, [issues[1]])
    expect(groups.map((group) => [group.epic?.number, group.shipped, group.total, group.issues.length])).toEqual([
      [1, 1, 2, 1],
    ])
  })
})

describe("waits and shipLine", () => {
  test("an epic waits on unshipped dependencies outside itself", () => {
    const issues = [
      issue(1, "building", { epic: 1 }),
      issue(2, "ready", { epic: 2, dependsOn: ["LCH-1", "LCH-3", "LCH-4"] }),
      issue(3, "backlog", { epic: 2 }),
      issue(4, "shipped", { epic: 1 }),
    ]
    expect(
      waits(
        { issues },
        issues.filter((item) => item.epic === 2),
      ).map((item) => [item.ref, item.for.ref, item.on?.stage]),
    ).toEqual([["LCH-1", "LCH-2", "building"]])
  })

  test("the ship line counts shipped issues by the day they shipped", () => {
    const issues = [
      issue(1, "shipped", { stageEnteredAt: start + 2 * day }),
      issue(2, "building"),
      issue(3, "shipped", { stageEnteredAt: start }),
    ]
    expect(shipLine(issues)).toEqual([
      { at: start, count: 1 },
      { at: start + 2 * day, count: 2 },
    ])
    expect(tally(issues)).toEqual({ shipped: 2, total: 3 })
  })
})

describe("timeline frame", () => {
  test("weeks start on a UTC Monday and carry their ISO week number", () => {
    expect(monday(Date.UTC(2026, 9, 15, 18))).toBe(Date.UTC(2026, 9, 12))
    expect(monday(Date.UTC(2026, 9, 12))).toBe(Date.UTC(2026, 9, 12))
    expect(isoWeek(Date.UTC(2026, 9, 12))).toBe(42)
    expect(isoWeek(Date.UTC(2027, 0, 1))).toBe(53)
  })

  test("spans first activity to a week past the latest forecast or target, and places dates inside it", () => {
    const p85 = Date.UTC(2026, 10, 6)
    const snapshot = {
      issues: [issue(1, "shipped", { stageEnteredAt: Date.UTC(2026, 9, 14) })],
      scope: [{ at: Date.UTC(2026, 9, 13), scope: 4, shipped: 0, reason: null }],
      forecast: {
        shipped: 1,
        remaining: 3,
        targetDate: Date.UTC(2026, 10, 2),
        forecast: { kind: "dates" as const, p50: Date.UTC(2026, 10, 4), p85, vsTarget: { p50: 2, p85: 4 } },
      },
      epicForecasts: [],
    }
    const view = frame(snapshot, Date.UTC(2026, 9, 26))
    expect(view.start).toBe(Date.UTC(2026, 9, 12))
    expect(view.end).toBe(Date.UTC(2026, 10, 9))
    expect(view.weeks.map((item) => item.week)).toEqual([42, 43, 44, 45])
    expect(view.at(view.start)).toBe(0)
    expect(view.at(Date.UTC(2026, 9, 26))).toBe(50)
    expect(view.at(Date.UTC(2027, 0, 1))).toBe(100)
  })

  test("bars follow Maestro's epic order and fall back to done without a forecast", () => {
    const snapshot = {
      epics: [epic(1, 2), epic(2, 1), epic(3, 3, "cut")],
      issues: [
        issue(1, "shipped", { epic: 1, stageEnteredAt: start + day }),
        issue(2, "building", { epic: 1, stageEnteredAt: start + 2 * day }),
        issue(3, "ready", { epic: 2 }),
      ],
      epicForecasts: [
        {
          epic: 1,
          ref: "LCH-E1",
          shipped: 1,
          remaining: 1,
          forecast: { kind: "dates" as const, p50: start + 9 * day, p85: start + 12 * day, vsTarget: null },
          setsDate: true,
        },
      ],
    }
    expect(
      bars(snapshot).map((bar) => [bar.epic.number, bar.shipped, bar.total, bar.forecast.kind, bar.setsDate, bar.last]),
    ).toEqual([
      [2, 0, 1, "done", false, undefined],
      [1, 1, 2, "dates", true, start + day],
    ])
  })

  test("a forecast range reads in UTC, so a midnight date never slips to the day before", () => {
    // ICU builds differ on the space around the dash (thin space on macOS, plain space on Linux).
    expect(range(Date.UTC(2026, 10, 13), Date.UTC(2026, 10, 17), "en-US").replace(/\s/g, " ")).toBe("Nov 13 – 17")
    expect(range(Date.UTC(2026, 10, 13), Date.UTC(2026, 10, 13), "en-US")).toBe("Nov 13")
  })
})
