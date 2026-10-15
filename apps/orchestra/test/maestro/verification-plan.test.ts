import { describe, expect, test } from "bun:test"
import {
  compileVerificationPlan,
  type CompileVerificationPlanInput,
  type VerificationPlan,
} from "../../src/maestro/verification-plan"

const input: CompileVerificationPlanInput = {
  baseSHA: "a".repeat(40),
  headSHA: "b".repeat(40),
  changedPaths: ["packages/orchestra/src/index.ts"],
  risk: "package",
  packages: ["orchestra"],
  reverseDependencies: [],
}

const allChecks = [
  "atlas",
  "core-unit",
  "docs",
  "generated",
  "godfile",
  "linux-unit",
  "orchestra-unit",
  "schema-unit",
  "windows-unit",
] as const

describe("compileVerificationPlan", () => {
  test("preserves exact SHAs and selects docs only for markdown changes", () => {
    const result = compileVerificationPlan({
      ...input,
      baseSHA: "A".repeat(40),
      changedPaths: ["README.md", "docs/guide.md"],
      risk: "docs",
      packages: [],
    })

    expect(result).toMatchObject({
      baseSHA: "A".repeat(40),
      headSHA: input.headSHA,
      required: ["docs"],
      fallback: false,
    })
    expect(result.skipped.every((check) => check.reason === "not-selected")).toBe(true)
  })

  test("falls back when docs risk includes non-markdown path", () => {
    expect(compileVerificationPlan({ ...input, risk: "docs", changedPaths: ["README.md", "src/index.ts"] })).toEqual(
      fallback(),
    )
  })

  test("selects affected package and reverse dependency checks plus Linux", () => {
    expect(
      compileVerificationPlan({
        ...input,
        changedPaths: ["packages/core/src/index.ts"],
        packages: ["core"],
        reverseDependencies: ["orchestra"],
      }),
    ).toEqual({
      baseSHA: input.baseSHA,
      headSHA: input.headSHA,
      required: ["core-unit", "linux-unit", "orchestra-unit"],
      skipped: [
        { id: "atlas", reason: "not-selected" },
        { id: "docs", reason: "not-selected" },
        { id: "generated", reason: "not-selected" },
        { id: "godfile", reason: "not-selected" },
        { id: "schema-unit", reason: "not-selected" },
        { id: "windows-unit", reason: "not-selected" },
      ],
      fallback: false,
    })
  })

  test("falls back when package selection is empty or path falls outside selected exact package", () => {
    expect(compileVerificationPlan({ ...input, packages: [] })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, changedPaths: ["packages/orchestra-extra/src/index.ts"] })).toEqual(
      fallback(),
    )
  })

  test("selects workflow checks", () => {
    expect(
      compileVerificationPlan({ ...input, changedPaths: [".github/workflows/test.yml"], risk: "workflow" }),
    ).toEqual({
      baseSHA: input.baseSHA,
      headSHA: input.headSHA,
      required: ["atlas", "generated", "godfile", "linux-unit", "windows-unit"],
      skipped: [
        { id: "core-unit", reason: "not-selected" },
        { id: "docs", reason: "not-selected" },
        { id: "orchestra-unit", reason: "not-selected" },
        { id: "schema-unit", reason: "not-selected" },
      ],
      fallback: false,
    })
  })

  test("falls back when workflow risk includes incoherent path", () => {
    expect(compileVerificationPlan({ ...input, risk: "workflow" })).toEqual(fallback())
  })

  test("falls back for unknown and elevated risks", () => {
    for (const risk of ["unknown", "api", "persistence", "security", "concurrency"] as const) {
      expect(compileVerificationPlan({ ...input, risk })).toEqual(fallback())
    }
  })

  test("falls back for unclassified risks, invalid package IDs, and duplicate package lists", () => {
    expect(compileVerificationPlan({ ...input, risk: "unclassified" as never })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, packages: ["evil" as never] })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, reverseDependencies: ["evil" as never] })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, packages: ["orchestra", "orchestra"] })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, reverseDependencies: ["core", "core"] })).toEqual(fallback())
  })

  test("falls back for malformed SHAs and paths", () => {
    for (const changes of [
      { baseSHA: "bad" },
      { headSHA: input.baseSHA },
      { changedPaths: [] },
      { changedPaths: ["same.ts", "same.ts"] },
      { changedPaths: ["/absolute.ts"] },
      { changedPaths: ["C:\\absolute.ts"] },
      { changedPaths: ["d:relative.ts"] },
      { changedPaths: ["packages/../escape.ts"] },
    ]) {
      expect(compileVerificationPlan({ ...input, ...changes })).toEqual(fallback({ ...changes }))
    }
  })

  test("falls back for malformed input collections", () => {
    expect(compileVerificationPlan({ ...input, changedPaths: "README.md" as never })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, packages: "orchestra" as never })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, packages: [1 as never] })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, reverseDependencies: "core" as never })).toEqual(fallback())
    expect(compileVerificationPlan({ ...input, reverseDependencies: [1 as never] })).toEqual(fallback())
  })

  test("rejects case-insensitive drive prefixes before docs risk reduction", () => {
    expect(compileVerificationPlan({ ...input, changedPaths: ["d:relative.md"], risk: "docs" })).toEqual(fallback())
  })
})

function fallback(changes: Partial<CompileVerificationPlanInput> = {}): VerificationPlan {
  return {
    baseSHA: changes.baseSHA ?? input.baseSHA,
    headSHA: changes.headSHA ?? input.headSHA,
    required: allChecks,
    skipped: [],
    fallback: true,
  }
}
