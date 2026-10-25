import { describe, expect, test } from "bun:test"
import { rules, scenarios } from "./fixture"
import {
  approvalLabel,
  excerptParts,
  exceptions,
  filterRules,
  groupFindings,
  groupRules,
  ignoreComment,
  splitPath,
  verdict,
} from "./model"

describe("verdict", () => {
  test("names each fixture scenario's state", () => {
    expect(verdict(scenarios.clean).kind).toBe("clean")
    expect(verdict(scenarios.warnings)).toEqual({ kind: "warnings", gates: 0, warnings: 2 })
    expect(verdict(scenarios.blocked)).toMatchObject({ kind: "blocked", gates: 4 })
    expect(verdict(scenarios.empty).kind).toBe("empty")
    expect(verdict(scenarios.noRepository).kind).toBe("no-repository")
    expect(verdict(scenarios.noBase).kind).toBe("no-base")
    expect(verdict(scenarios.invalid)).toMatchObject({ kind: "unchecked", failure: { kind: "rules-invalid" } })
    expect(verdict(scenarios.noRules)).toMatchObject({ kind: "unchecked", failure: { kind: "no-rules" } })
  })

  test("never reads as clean when the run proved nothing", () => {
    const clean = scenarios.clean
    expect(verdict({ ...clean, rules: 0 }).kind).not.toBe("clean")
    expect(verdict({ ...clean, base: null }).kind).not.toBe("clean")
    expect(verdict({ ...clean, errors: [{ kind: "other", message: "git crashed" }] }).kind).not.toBe("clean")
  })

  test("a setup error outranks findings, so a partial run never reads as blocked or warned", () => {
    const partial = { ...scenarios.blocked, errors: [{ kind: "other" as const, message: "git crashed" }] }
    expect(verdict(partial)).toMatchObject({ kind: "unchecked", gates: 4 })
  })
})

describe("groupFindings", () => {
  test("puts files with a gate first, and gates before warnings inside a file", () => {
    const files = groupFindings(scenarios.blocked.findings)
    expect(files.map((file) => file.gate)).toEqual([true, true, true, true, false, false])
    const runner = files.find((file) => file.path === "packages/core/src/session/runner.ts")
    expect(runner?.items.map((item) => item.rule)).toEqual(["ts-ignore", "ts-any-added"])
  })

  test("puts file-level findings before line findings and keeps a stable key per finding", () => {
    const findings = [
      { ...scenarios.warnings.findings[0], line: 30 },
      { ...scenarios.warnings.findings[0], line: null, excerpt: null, match: null },
    ]
    const items = groupFindings(findings)[0].items
    expect(items.map((item) => item.line)).toEqual([null, 30])
    expect(items.map((item) => item.key)).toEqual(["1", "0"])
  })
})

describe("exceptions", () => {
  test("lists added ignores, approved rules and guard edits", () => {
    expect(exceptions(scenarios.blocked).ignores.map((finding) => finding.path)).toEqual([
      "packages/app-shell/src/pages/session/timeline.tsx",
    ])
    expect(exceptions(scenarios.guards)).toMatchObject({ approved: ["protected-paths"], touchesGuards: true })
  })
})

describe("rules", () => {
  test("filters by text, severity, kind and group together", () => {
    const all = { query: "", severity: "all", kind: "all", group: "all" } as const
    expect(filterRules(rules, all)).toHaveLength(rules.length)
    expect(filterRules(rules, { ...all, query: "TS-IGNORE" }).map((rule) => rule.id)).toContain("ts-ignore")
    expect(filterRules(rules, { ...all, severity: "gate" }).every((rule) => rule.severity === "gate")).toBe(true)
    expect(
      filterRules(rules, { ...all, kind: "changed-paths", group: "secrets" }).every(
        (rule) => rule.kind === "changed-paths" && rule.group === "secrets",
      ),
    ).toBe(true)
    expect(filterRules(rules, { ...all, query: "zzz-no-such-rule" })).toEqual([])
  })

  test("groups every rule once, gates first inside a group", () => {
    const grouped = groupRules(rules)
    expect(grouped.flatMap((group) => group.items)).toHaveLength(rules.length)
    grouped.forEach((group) => {
      const severities = group.items.map((rule) => rule.severity)
      expect(severities).toEqual(severities.toSorted((a, b) => Number(a === "warn") - Number(b === "warn")))
    })
  })
})

describe("presentation helpers", () => {
  test("splits a path so the file name stays whole", () => {
    expect(splitPath("a/b/c.ts")).toEqual({ dir: "a/b/", base: "c.ts" })
    expect(splitPath("README.md")).toEqual({ dir: "", base: "README.md" })
  })

  test("clamps a match range that runs past the excerpt", () => {
    expect(excerptParts({ excerpt: "abcdef", match: [2, 4] })).toEqual({ before: "ab", match: "cd", after: "ef" })
    expect(excerptParts({ excerpt: "abc", match: [2, 99] })).toEqual({ before: "ab", match: "c", after: "" })
    expect(excerptParts({ excerpt: "abc", match: [-5, 1] })).toEqual({ before: "", match: "a", after: "bc" })
    expect(excerptParts({ excerpt: "abc", match: [3, 1] })).toEqual({ before: "abc", match: "", after: "" })
    expect(excerptParts({ excerpt: "abc", match: null })).toEqual({ before: "abc", match: "", after: "" })
    expect(excerptParts({ excerpt: null, match: null })).toBeUndefined()
  })

  test("builds the exact ignore comment and approval label", () => {
    expect(ignoreComment("ts-ignore", "typings lag")).toBe("guardrail-ignore: ts-ignore typings lag")
    expect(approvalLabel("protected-paths")).toBe("guardrail-approved:protected-paths")
  })
})
