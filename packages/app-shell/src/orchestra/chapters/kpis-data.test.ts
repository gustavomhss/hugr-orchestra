import { describe, expect, test } from "bun:test"
import {
  change,
  compact,
  gitWindow,
  heights,
  hours,
  localEnd,
  parseActivity,
  parseGit,
  summarizeActivity,
  summarizeGit,
  usageCsv,
  type Activity,
  type ActivityFact,
  type GitActivity,
} from "./kpis-data"

const fact = (input: Partial<ActivityFact> & Pick<ActivityFact, "bucket" | "sessionID">): ActivityFact => ({
  providerID: null,
  modelID: null,
  user: 0,
  assistant: 0,
  failed: 0,
  tokens: 0,
  ...input,
})

const session = (id: string, files: number | null = null) => ({
  id,
  title: `Session ${id}`,
  parentID: null,
  created: 1,
  updated: 2,
  additions: files === null ? null : 10,
  deletions: files === null ? null : 2,
  files,
})

// A 7d response: bucket 0 is the previous window, buckets 1..7 the daily bars.
const week = [
  "2026-09-21",
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
  "2026-10-05",
]
const activity: Activity = {
  period: "7d",
  edges: week.map((_, index) => index * 1000),
  days: week,
  previous: true,
  activeMs: [1000, 7_200_000, 0, 0, 0, 0, 0, 1_800_000],
  truncated: false,
  sessions: [session("a", 3), session("b"), session("c")],
  facts: [
    fact({ bucket: 0, sessionID: "c", providerID: "openai", modelID: "gpt", assistant: 2, tokens: 50 }),
    fact({ bucket: 1, sessionID: "a", user: 2 }),
    fact({ bucket: 1, sessionID: "a", providerID: "openai", modelID: "gpt", assistant: 4, failed: 1, tokens: 300 }),
    fact({ bucket: 7, sessionID: "b", providerID: "anthropic", modelID: "sonnet", assistant: 1, tokens: 500, user: 1 }),
    fact({ bucket: 7, sessionID: "b", providerID: "openai", modelID: "gpt", assistant: 1, tokens: 20 }),
  ],
}

describe("activity summary", () => {
  test("current totals leave out the previous bucket; wall clock comes from the server's buckets", () => {
    const summary = summarizeActivity(activity)
    expect(summary.current).toEqual({
      tokens: 820,
      activeMs: 9_000_000,
      messages: 9,
      runs: 6,
      failed: 1,
      models: 2,
      providers: 2,
    })
    expect(summary.previous).toMatchObject({ tokens: 50, runs: 2, messages: 2, models: 1, activeMs: 1000 })
    expect(summary.start).toBe("2026-09-28")
    expect(summary.bars.map((bar) => bar.tokens)).toEqual([300, 0, 0, 0, 0, 0, 520])
    expect(summary.bars.map((bar) => bar.activeMs)).toEqual([7_200_000, 0, 0, 0, 0, 0, 1_800_000])
    expect(summary.bars[6]?.models).toBe(2)
  })

  test("sessions rank by tokens in the period and models by tokens", () => {
    const summary = summarizeActivity(activity)
    expect(summary.sessions.map((item) => [item.id, item.tokens, item.messages, item.files])).toEqual([
      ["b", 520, 3, null],
      ["a", 300, 6, 3],
    ])
    expect(summary.models).toEqual([
      { providerID: "anthropic", modelID: "sonnet", tokens: 500, runs: 1 },
      { providerID: "openai", modelID: "gpt", tokens: 320, runs: 5 },
    ])
  })

  test("All has no previous totals and treats bucket zero as the first bar", () => {
    const summary = summarizeActivity({
      ...activity,
      period: "all",
      previous: false,
      edges: [0, 1, 2],
      days: ["2026-10-03", "2026-10-04", "2026-10-05"],
      activeMs: [5, 0],
      facts: [fact({ bucket: 0, sessionID: "a", user: 1 })],
    })
    expect(summary.previous).toBeUndefined()
    expect(summary.start).toBe("2026-10-03")
    expect(summary.current).toMatchObject({ messages: 1, activeMs: 5 })
    expect(summary.bars.map((bar) => bar.messages)).toEqual([1, 0])
  })
})

describe("git summary", () => {
  const git: GitActivity = {
    repository: true,
    since: 0,
    until: 1,
    truncated: false,
    days: [
      { day: "2026-09-20", commits: 9, merges: 9 },
      { day: "2026-09-22", commits: 4, merges: 1 },
      { day: "2026-09-28", commits: 2, merges: 0 },
      { day: "2026-10-04", commits: 5, merges: 2 },
      { day: "2026-10-05", commits: 7, merges: 7 },
    ],
  }

  test("fixed periods use the activity's server days, so both sources share one calendar", () => {
    const window = gitWindow("7d", "2026-10-05", git)
    expect(window).toEqual({ previous: week[0], bars: week.slice(1) })
    const summary = summarizeGit(git, window)
    expect(summary.current).toEqual({ commits: 7, merges: 2 })
    expect(summary.previous).toEqual({ commits: 4, merges: 1 })
    expect(summary.bars.map((bar) => bar.commits)).toEqual([2, 0, 0, 0, 0, 0, 5])
  })

  test("All starts on the first commit day and splits into at most eight bars", () => {
    const window = gitWindow("all", "2026-10-05", git)
    expect(window.previous).toBeUndefined()
    expect(window.bars).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-23",
      "2026-09-25",
      "2026-09-27",
      "2026-09-29",
      "2026-10-01",
      "2026-10-03",
      "2026-10-05",
    ])
    expect(summarizeGit(git, window).current).toEqual({ commits: 20, merges: 12 })
    expect(gitWindow("all", "2026-10-05", { ...git, days: [] }).bars).toEqual(["2026-10-04", "2026-10-05"])
  })

  test("only a cut commit scan makes the counts partial", () => {
    const window = gitWindow("7d", "2026-10-05", git)
    expect(summarizeGit({ ...git, truncated: true, partial: { commits: false, lines: true } }, window).partial).toBe(
      false,
    )
    expect(summarizeGit({ ...git, truncated: true, partial: { commits: true, lines: false } }, window).partial).toBe(
      true,
    )
    expect(summarizeGit({ ...git, truncated: true }, window).partial).toBe(true)
    expect(summarizeGit(git, window).partial).toBe(false)
  })

  test("the local fallback end is tomorrow", () => {
    expect(localEnd(new Date(2026, 9, 4, 23, 59).getTime())).toBe("2026-10-05")
    expect(localEnd(new Date(2026, 11, 31, 8).getTime())).toBe("2027-01-01")
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

  test("compact counts never show 1000 of a unit", () => {
    expect(compact(0)).toEqual({ value: 0, unit: "", digits: 0 })
    expect(compact(950)).toEqual({ value: 950, unit: "", digits: 0 })
    expect(compact(999.6)).toEqual({ value: 0.9996, unit: "k", digits: 1 })
    expect(compact(1_500)).toEqual({ value: 1.5, unit: "k", digits: 1 })
    expect(compact(83_000)).toEqual({ value: 83, unit: "k", digits: 0 })
    expect(compact(312_000)).toEqual({ value: 312, unit: "k", digits: 0 })
    expect(compact(999_950)).toEqual({ value: 0.99995, unit: "M", digits: 1 })
    expect(compact(18_400_000)).toEqual({ value: 18.4, unit: "M", digits: 1 })
    expect(compact(2_500_000_000)).toEqual({ value: 2.5, unit: "B", digits: 1 })
  })

  test("hours and bar heights", () => {
    expect(hours(0)).toEqual({ value: 0, digits: 0 })
    expect(hours(1_800_000)).toEqual({ value: 0.5, digits: 2 })
    expect(hours(18_000_000)).toEqual({ value: 5, digits: 1 })
    expect(hours(345_600_000)).toEqual({ value: 96, digits: 0 })
    expect(heights([0, 5, 10])).toEqual([0, 50, 100])
    expect(heights([0, 0])).toEqual([0, 0])
    expect(heights(Array.from({ length: 200_000 }, (_, index) => index)).at(-1)).toBe(100)
  })
})

describe("response checks", () => {
  test("malformed activity and git responses fail closed", () => {
    expect(parseActivity(activity)).toBe(activity)
    expect(parseActivity({ ...activity, period: "12d" })).toBeUndefined()
    expect(parseActivity({ ...activity, days: week.slice(1) })).toBeUndefined()
    expect(parseActivity({ ...activity, activeMs: [0] })).toBeUndefined()
    expect(parseActivity({ ...activity, truncated: undefined })).toBeUndefined()
    expect(
      parseActivity({ ...activity, facts: [{ ...fact({ bucket: 0, sessionID: "a" }), tokens: Number.NaN }] }),
    ).toBeUndefined()
    expect(
      parseActivity({ ...activity, facts: [{ ...fact({ bucket: 0, sessionID: "a" }), tokens: -1 }] }),
    ).toBeUndefined()
    expect(parseActivity({ ...activity, sessions: [{ ...session("a"), title: 1 }] })).toBeUndefined()
    expect(parseActivity(null)).toBeUndefined()
    const git = {
      repository: true,
      since: 0,
      until: 1,
      truncated: false,
      days: [{ day: "2026-10-04", commits: 1, merges: 0 }],
    }
    expect(parseGit(git)).toBe(git as never)
    expect(parseGit({ ...git, days: [{ day: "October", commits: 1, merges: 0 }] })).toBeUndefined()
    expect(parseGit({ ...git, truncated: undefined })).toBeUndefined()
    expect(parseGit({ ...git, partial: { commits: true, lines: false } })).toBeDefined()
    expect(parseGit({ ...git, partial: { commits: "yes", lines: false } })).toBeUndefined()
  })

  test("CSV writes numbers as-is and guards only text against spreadsheet formulas", () => {
    expect(
      usageCsv([
        ["Tokens spent", 18400000],
        ["Hours worked", -20],
        ['a,"b"\nc', 90],
        ["=SUM(A1)", "-1", "+cmd"],
      ]),
    ).toBe('"Tokens spent","18400000"\r\n"Hours worked","-20"\r\n"a,""b""\nc","90"\r\n"\'=SUM(A1)","\'-1","\'+cmd"\r\n')
  })
})
