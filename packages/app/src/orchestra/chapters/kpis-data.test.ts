import { describe, expect, test } from "bun:test"
import {
  activityEdges,
  allRange,
  change,
  compact,
  firstGitDay,
  heights,
  hours,
  parseActivity,
  parseGit,
  periodRange,
  summarizeActivity,
  summarizeGit,
  usageCsv,
  type Activity,
  type ActivityFact,
} from "./kpis-data"

const local = (year: number, month: number, day: number, hour = 0) => new Date(year, month - 1, day, hour).getTime()
const now = local(2026, 10, 4, 15)

const fact = (input: Partial<ActivityFact> & Pick<ActivityFact, "bucket" | "sessionID">): ActivityFact => ({
  providerID: null,
  modelID: null,
  user: 0,
  assistant: 0,
  failed: 0,
  activeMs: 0,
  tokens: 0,
  cost: 0,
  ...input,
})

const session = (id: string, files: number | null = null) => ({
  id,
  title: `Session ${id}`,
  parentID: null,
  created: local(2026, 9, 1),
  updated: local(2026, 10, 3),
  additions: files === null ? null : 10,
  deletions: files === null ? null : 2,
  files,
})

describe("dashboard windows", () => {
  test("a fixed period is whole local days ending today, split into at most eight bars", () => {
    const week = periodRange("7d", now)
    expect(week.end).toBe(local(2026, 10, 5))
    expect(week.start).toBe(local(2026, 9, 28))
    expect(week.previous).toBe(local(2026, 9, 21))
    expect(week.bars).toEqual(Array.from({ length: 8 }, (_, index) => local(2026, 9, 28 + index)))
    const month = periodRange("30d", now)
    expect(month.start).toBe(local(2026, 9, 5))
    expect(month.previous).toBe(local(2026, 8, 6))
    expect(month.bars).toHaveLength(9)
    expect(month.bars[0]).toBe(month.start)
    expect(month.bars.at(-1)).toBe(month.end)
    expect(activityEdges(month)).toEqual([month.previous!, ...month.bars])
  })

  test("All starts on the first recorded day and has no previous window", () => {
    const range = allRange(local(2026, 9, 6, 17), now)
    expect(range.start).toBe(local(2026, 9, 6))
    expect(range.end).toBe(local(2026, 10, 5))
    expect(range.previous).toBeUndefined()
    expect(range.bars).toHaveLength(9)
    expect(activityEdges(range)).toEqual(range.bars)
    expect(allRange(now, now).bars).toEqual([local(2026, 10, 4), local(2026, 10, 5)])
  })
})

describe("activity summary", () => {
  const range = periodRange("7d", now)
  const activity: Activity = {
    edges: activityEdges(range),
    sessions: [session("a", 3), session("b"), session("c")],
    facts: [
      fact({ bucket: 0, sessionID: "c", providerID: "openai", modelID: "gpt", assistant: 2, tokens: 50, activeMs: 1000 }),
      fact({ bucket: 1, sessionID: "a", user: 2 }),
      fact({
        bucket: 1,
        sessionID: "a",
        providerID: "openai",
        modelID: "gpt",
        assistant: 4,
        failed: 1,
        tokens: 300,
        activeMs: 7_200_000,
        cost: 0.5,
      }),
      fact({ bucket: 7, sessionID: "b", providerID: "anthropic", modelID: "sonnet", assistant: 1, tokens: 500, user: 1 }),
      fact({ bucket: 7, sessionID: "b", providerID: "openai", modelID: "gpt", assistant: 1, tokens: 20 }),
    ],
  }

  test("current totals exclude the previous bucket; previous totals are its own", () => {
    const summary = summarizeActivity(activity, range)
    expect(summary.current).toEqual({
      tokens: 820,
      activeMs: 7_200_000,
      messages: 9,
      runs: 6,
      failed: 1,
      cost: 0.5,
      models: 2,
      providers: 2,
    })
    expect(summary.previous).toMatchObject({ tokens: 50, runs: 2, messages: 2, models: 1 })
    expect(summary.bars).toHaveLength(7)
    expect(summary.bars.map((bar) => bar.tokens)).toEqual([300, 0, 0, 0, 0, 0, 520])
    expect(summary.bars[6]?.models).toBe(2)
  })

  test("sessions rank by tokens in the window and models by tokens", () => {
    const summary = summarizeActivity(activity, range)
    expect(summary.sessions.map((item) => [item.id, item.tokens, item.messages, item.files])).toEqual([
      ["b", 520, 3, null],
      ["a", 300, 6, 3],
    ])
    expect(summary.models).toEqual([
      { providerID: "anthropic", modelID: "sonnet", tokens: 500, runs: 1, cost: 0 },
      { providerID: "openai", modelID: "gpt", tokens: 320, runs: 5, cost: 0.5 },
    ])
  })

  test("All has no previous totals and treats bucket zero as the first bar", () => {
    const all = allRange(local(2026, 10, 3), now)
    const summary = summarizeActivity(
      { edges: activityEdges(all), sessions: [session("a")], facts: [fact({ bucket: 0, sessionID: "a", user: 1 })] },
      all,
    )
    expect(summary.previous).toBeUndefined()
    expect(summary.current.messages).toBe(1)
    expect(summary.bars.map((bar) => bar.messages)).toEqual([1, 0])
  })
})

describe("git summary", () => {
  const git = {
    repository: true,
    since: local(2026, 9, 21),
    until: now,
    truncated: false,
    days: [
      { day: "2026-09-22", commits: 4, merges: 1 },
      { day: "2026-09-28", commits: 2, merges: 0 },
      { day: "2026-10-04", commits: 5, merges: 2 },
    ],
  }

  test("server days land on local days of the current, previous and bar windows", () => {
    const summary = summarizeGit(git, periodRange("7d", now))
    expect(summary.current).toEqual({ commits: 7, merges: 2 })
    expect(summary.previous).toEqual({ commits: 4, merges: 1 })
    expect(summary.bars.map((bar) => bar.commits)).toEqual([2, 0, 0, 0, 0, 0, 5])
    expect(firstGitDay(git)).toBe(local(2026, 9, 22))
    expect(firstGitDay({ ...git, days: [] })).toBe(now)
  })
})

describe("display helpers", () => {
  test("change against the previous window", () => {
    expect(change(5, undefined)).toBeUndefined()
    expect(change(0, 0)).toBeUndefined()
    expect(change(3, 0)).toEqual({ trend: "up", percent: undefined })
    expect(change(112, 100)).toEqual({ trend: "up", percent: 12 })
    expect(change(92, 100)).toEqual({ trend: "down", percent: -8 })
    expect(change(100, 100)).toEqual({ trend: "flat", percent: 0 })
  })

  test("compact counts, hours and bar heights", () => {
    expect(compact(950)).toEqual({ value: 950, unit: "", digits: 0 })
    expect(compact(18_400_000)).toEqual({ value: 18.4, unit: "M", digits: 1 })
    expect(compact(312_000)).toEqual({ value: 312, unit: "k", digits: 0 })
    expect(compact(83_000)).toEqual({ value: 83, unit: "k", digits: 0 })
    expect(compact(1_500)).toEqual({ value: 1.5, unit: "k", digits: 1 })
    expect(compact(2_500_000_000)).toEqual({ value: 2.5, unit: "B", digits: 1 })
    expect(hours(1_800_000)).toEqual({ value: 0.5, digits: 2 })
    expect(hours(0)).toEqual({ value: 0, digits: 0 })
    expect(hours(345_600_000)).toEqual({ value: 96, digits: 0 })
    expect(hours(18_000_000)).toEqual({ value: 5, digits: 1 })
    expect(heights([0, 5, 10])).toEqual([0, 50, 100])
    expect(heights([0, 0])).toEqual([0, 0])
  })
})

describe("response checks", () => {
  test("malformed activity and git responses fail closed", () => {
    const valid = { edges: [0, 1], sessions: [session("a")], facts: [fact({ bucket: 0, sessionID: "a" })] }
    expect(parseActivity(valid)).toBe(valid as never)
    expect(parseActivity({ ...valid, facts: [{ ...fact({ bucket: 0, sessionID: "a" }), tokens: Number.NaN }] })).toBeUndefined()
    expect(parseActivity({ ...valid, facts: [{ ...fact({ bucket: 0, sessionID: "a" }), tokens: -1 }] })).toBeUndefined()
    expect(parseActivity({ ...valid, sessions: [{ ...session("a"), title: 1 }] })).toBeUndefined()
    expect(parseActivity({ edges: [0, 1], facts: [] })).toBeUndefined()
    expect(parseActivity(null)).toBeUndefined()
    const git = { repository: true, since: 0, until: 1, truncated: false, days: [{ day: "2026-10-04", commits: 1, merges: 0 }] }
    expect(parseGit(git)).toBe(git as never)
    expect(parseGit({ ...git, days: [{ day: "October", commits: 1, merges: 0 }] })).toBeUndefined()
    expect(parseGit({ ...git, truncated: undefined })).toBeUndefined()
  })

  test("CSV preserves values and quotes and neutralizes spreadsheet formulas", () => {
    expect(
      usageCsv([
        ["Tokens spent", 18400000],
        ['a,"b"\nc', 90],
        ["=SUM(A1)", "Unavailable"],
      ]),
    ).toBe('"Tokens spent","18400000"\r\n"a,""b""\nc","90"\r\n"\'=SUM(A1)","Unavailable"\r\n')
  })
})
