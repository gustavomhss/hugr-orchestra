import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { HARD_LIMIT_LOC, TARGET_LOC, countLoc, formatGodfileReport, runGodfileGate } from "../../../script/godfile"

const repos: string[] = []

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
}

function lines(count: number) {
  return Array.from({ length: count }, (_, index) => `const line${index} = ${index}`).join("\n")
}

function repo() {
  const cwd = mkdtempSync(join(tmpdir(), "godfile-"))
  repos.push(cwd)
  git(cwd, "init", "--initial-branch=main", "--quiet")
  git(cwd, "config", "user.email", "test@example.com")
  git(cwd, "config", "user.name", "Godfile Test")
  mkdirSync(join(cwd, "foundation/atlas"), { recursive: true })
  writeFileSync(join(cwd, "legacy.ts"), lines(HARD_LIMIT_LOC + 1))
  writeFileSync(join(cwd, "near.ts"), lines(TARGET_LOC + 1))
  writeFileSync(join(cwd, "foundation/atlas/vendor.ts"), lines(HARD_LIMIT_LOC + 1))
  git(cwd, "add", ".")
  git(cwd, "commit", "-m", "baseline")
  return cwd
}

afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true })
})

describe("godfile", () => {
  test("counts physical non-blank lines", () => {
    expect(countLoc("one\n\n two\r\n  \nthree")).toBe(3)
  })

  test("flags target files, tolerates unchanged legacy, excludes vendored Atlas", () => {
    const report = runGodfileGate({ cwd: repo(), baseRef: "HEAD" })
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual(
      expect.arrayContaining([
        { file: "near.ts", lines: TARGET_LOC + 1, kind: "target" },
        { file: "legacy.ts", lines: HARD_LIMIT_LOC + 1, baseLines: HARD_LIMIT_LOC + 1, kind: "legacy" },
      ]),
    )
    expect(report.warnings.some((finding) => finding.file.startsWith("foundation/atlas/"))).toBeFalse()
  })

  test("fails when a legacy hard-limit file grows", () => {
    const cwd = repo()
    writeFileSync(join(cwd, "legacy.ts"), lines(HARD_LIMIT_LOC + 2))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("legacy.ts")]),
    )
  })

  test("fails a new hard-limit file", () => {
    const cwd = repo()
    writeFileSync(join(cwd, "new.ts"), lines(HARD_LIMIT_LOC + 1))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("new.ts")]),
    )
  })

  test("permits only named pre-existing files through an explicit fixed maximum", () => {
    const cwd = repo()
    writeFileSync(
      join(cwd, "godfile-waivers.json"),
      JSON.stringify({
        waivers: {
          "legacy.ts": {
            maximumLines: HARD_LIMIT_LOC + 2,
            reason: "Human-authorized legacy exception",
            authorizedBy: "stakeholder",
            authorizedAt: "2026-09-08",
          },
        },
      }),
    )
    writeFileSync(join(cwd, "legacy.ts"), lines(HARD_LIMIT_LOC + 2))

    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual([])
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).warnings).toEqual(
      expect.arrayContaining([
        {
          file: "legacy.ts",
          lines: HARD_LIMIT_LOC + 2,
          baseLines: HARD_LIMIT_LOC + 1,
          kind: "waiver",
          reason: "Human-authorized legacy exception",
        },
      ]),
    )

    writeFileSync(join(cwd, "legacy.ts"), lines(HARD_LIMIT_LOC + 3))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("approved waiver maximum")]),
    )
  })

  test("marks a valid waiver used when unchanged legacy handling accepts the file", () => {
    const cwd = repo()
    writeFileSync(
      join(cwd, "godfile-waivers.json"),
      JSON.stringify({
        waivers: {
          "legacy.ts": {
            maximumLines: HARD_LIMIT_LOC + 1,
            reason: "Human-authorized legacy exception",
            authorizedBy: "stakeholder",
            authorizedAt: "2026-09-08",
          },
        },
      }),
    )

    const report = runGodfileGate({ cwd, baseRef: "HEAD" })
    expect(report.errors).toEqual([])
    expect(report.warnings).toContainEqual({
      file: "legacy.ts",
      lines: HARD_LIMIT_LOC + 1,
      baseLines: HARD_LIMIT_LOC + 1,
      kind: "legacy",
    })
  })

  test("fails a stale or malformed waiver ledger", () => {
    const cwd = repo()
    writeFileSync(join(cwd, "godfile-waivers.json"), JSON.stringify({ waivers: {} }))
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("expected non-empty waivers object")]),
    )

    writeFileSync(
      join(cwd, "godfile-waivers.json"),
      JSON.stringify({
        waivers: {
          "near.ts": {
            maximumLines: HARD_LIMIT_LOC + 1,
            reason: "No longer needed",
            authorizedBy: "stakeholder",
            authorizedAt: "2026-09-08",
          },
        },
      }),
    )
    expect(runGodfileGate({ cwd, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("stale waiver for near.ts")]),
    )
  })

  test("fails closed for a missing base and an empty source tree", () => {
    const cwd = repo()
    expect(runGodfileGate({ cwd, baseRef: "missing" }).errors[0]).toContain("Cannot resolve merge-base")

    const empty = mkdtempSync(join(tmpdir(), "godfile-empty-"))
    repos.push(empty)
    git(empty, "init", "--initial-branch=main", "--quiet")
    git(empty, "config", "user.email", "test@example.com")
    git(empty, "config", "user.name", "Godfile Test")
    writeFileSync(join(empty, "README.md"), "empty")
    git(empty, "add", ".")
    git(empty, "commit", "-m", "baseline")
    expect(runGodfileGate({ cwd: empty, baseRef: "HEAD" }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining("zero source files")]),
    )
  })

  test("reports every warning and error with its file", () => {
    const output = formatGodfileReport({
      checked: 1,
      warnings: [{ file: "near.ts", lines: TARGET_LOC + 1, kind: "target" }],
      errors: ["new.ts: 751 LOC exceeds 750"],
    })
    expect(output).toContain("near.ts")
    expect(output).toContain("new.ts")
  })
})
