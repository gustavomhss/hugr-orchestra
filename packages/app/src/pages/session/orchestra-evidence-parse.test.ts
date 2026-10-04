import { describe, expect, test } from "bun:test"
import {
  detectTestRunner,
  failedCount,
  parseTestOutput,
  ranCount,
  SUMMARY_WINDOW,
  type TestRunner,
} from "./orchestra-evidence-parse"

// Fixtures were captured from real runs (bun 1.3.14, vitest 4.1.7, @playwright/test 1.59.1,
// pytest 9.0.3, go 1.27.1, cargo 1.98.0) with absolute paths replaced by /repo.
// Jest 30.2.0 was captured on resume; its reproducer and command are beside the logs.
const fixture = (name: string) => Bun.file(new URL(`./orchestra-evidence-fixtures/${name}.txt`, import.meta.url)).text()

describe("detectTestRunner", () => {
  test("accepts direct runner invocations", () => {
    const cases: [string, TestRunner][] = [
      ["bun test", "bun"],
      ["bun test src/approval.test.ts --timeout 5000", "bun"],
      ["/usr/local/bin/bun test", "bun"],
      ["CI=1 bun test 2>&1", "bun"],
      ["vitest", "vitest"],
      ["bunx vitest run", "vitest"],
      ["npx vitest run src", "vitest"],
      ["pnpm exec jest --ci", "jest"],
      ["npx playwright test e2e/a.spec.ts", "playwright"],
      ["pytest -q tests", "pytest"],
      ["python3 -m pytest", "pytest"],
      ["go test ./...", "go"],
      ["cargo test --workspace", "cargo"],
    ]
    for (const [command, runner] of cases) expect(detectTestRunner(command)).toBe(runner)
  })

  test("keeps scripts, composition and interactive modes output-only", () => {
    for (const command of [
      "",
      "bun run test",
      "npm test",
      "pnpm test",
      "bun test | tail -20",
      "cd packages/app && bun test",
      "bun test > out.txt",
      "bun test; echo done",
      "echo bun test",
      "vitest watch",
      "npx vitest dev",
      "bun test --watch",
      "jest --watchAll",
      "playwright show-report",
      "cargo nextest run",
      "uv run pytest",
      "bun test $(cat list)",
    ])
      expect(detectTestRunner(command)).toBeUndefined()
  })

  test("long whitespace runs cannot stall detection", () => {
    const spaces = " ".repeat(60_000)
    for (const command of [`bun test${spaces}x`, `bun test${spaces}2>&1`]) {
      const start = performance.now()
      expect(detectTestRunner(command)).toBe("bun")
      expect(performance.now() - start).toBeLessThan(200)
    }
  })
})

describe("parseTestOutput", () => {
  test("bun reports pass, fail, skip and todo with the files it ran", async () => {
    const summary = parseTestOutput("bun", await fixture("bun-fail"))
    expect(summary?.tests).toEqual({ unit: "tests", counts: { passed: 5, failed: 2, skipped: 1, todo: 1 }, total: 9 })
    expect(summary?.groups).toEqual({ unit: "files", total: 3 })
    expect(summary?.failures).toEqual(["approval > rejects empty", "top level failure"])
    expect(summary?.duration).toBe("50.00ms")
    expect(failedCount(summary!)).toBe(2)
    expect(ranCount(summary!)).toBe(7)
  })

  test("bun output with ANSI styling parses like plain output", async () => {
    const summary = parseTestOutput("bun", await fixture("bun-fail-ansi"))
    expect(summary?.tests.counts).toEqual({ passed: 5, failed: 2, skipped: 1, todo: 1 })
    expect(summary?.failures).toEqual(["approval > rejects empty", "top level failure"])
  })

  test("bun passing run and zero-file error", async () => {
    const pass = parseTestOutput("bun", await fixture("bun-pass"))
    expect(pass?.tests).toEqual({ unit: "tests", counts: { passed: 2, failed: 0 }, total: 2 })
    expect(pass?.failures).toEqual([])
    expect(parseTestOutput("bun", await fixture("bun-zero"))).toBeUndefined()
  })

  test("vitest reports file and test rows", async () => {
    const summary = parseTestOutput("vitest", await fixture("vitest-fail"))
    expect(summary?.groups).toEqual({ unit: "files", counts: { failed: 1, passed: 1 }, total: 2 })
    expect(summary?.tests).toEqual({
      unit: "tests",
      counts: { failed: 1, passed: 2, skipped: 1, todo: 1 },
      total: 5,
    })
    expect(summary?.failures).toEqual(["a.test.ts > approval > rejects empty"])
    expect(summary?.duration).toBe("887ms")
    expect(parseTestOutput("vitest", await fixture("vitest-pass"))?.tests.counts).toEqual({ passed: 1 })
    expect(parseTestOutput("vitest", await fixture("vitest-zero"))).toBeUndefined()
  })

  test("jest reports suites and tests", async () => {
    const summary = parseTestOutput("jest", await fixture("jest-fail"))
    expect(summary?.groups).toEqual({ unit: "suites", counts: { failed: 1, passed: 1 }, total: 2 })
    expect(summary?.tests).toEqual({ unit: "tests", counts: { failed: 1, skipped: 1, passed: 2 }, total: 4 })
    expect(summary?.failures).toEqual(["approval › rejects empty"])
    expect(summary?.duration).toBe("0.402s")
  })

  test("Jest distinguishes reporter Console headings from an actual failed test named Console", async () => {
    const passing = parseTestOutput("jest", await fixture("jest-console"))
    expect(passing?.tests.counts).toEqual({ passed: 2 })
    expect(passing?.failures).toEqual([])
    const failing = parseTestOutput("jest", await fixture("jest-console-fail"))
    expect(failing?.tests.counts).toEqual({ failed: 1, passed: 1 })
    expect(failing?.failures).toEqual(["Console"])
  })

  test("rejects Bun failure records that contradict their totals", async () => {
    expect(parseTestOutput("bun", await fixture("bun-ghost"))).toBeUndefined()
  })

  test("rejects Playwright failure rows that contradict their totals", async () => {
    expect(parseTestOutput("playwright", await fixture("pw-extra-failure-row.invalid"))).toBeUndefined()
    const failed = await fixture("pw-allfail")
    expect(parseTestOutput("playwright", failed)?.failures).toEqual(["a.spec.ts:3:7 › approval › rejects empty"])
    expect(parseTestOutput("playwright", failed + failed.split("\n").at(-2) + "\n")).toBeUndefined()
  })

  test("playwright list, line and dot reporters", async () => {
    for (const name of ["pw-fail", "pw-line-fail", "pw-dot-fail"]) {
      const summary = parseTestOutput("playwright", await fixture(name))
      expect(summary?.tests).toEqual({ unit: "tests", counts: { passed: 2, skipped: 1, failed: 1 }, total: 4 })
      expect(summary?.failures).toEqual(["a.spec.ts:3:7 › approval › rejects empty"])
      expect(summary?.duration).toMatch(/^\d\.\ds$/)
    }
    const failedOnly = parseTestOutput("playwright", await fixture("pw-allfail"))
    expect(failedOnly?.tests.counts).toEqual({ failed: 1 })
    expect(failedOnly?.duration).toBeUndefined()
    expect(parseTestOutput("playwright", await fixture("pw-pass"))?.tests.counts).toEqual({ passed: 1 })
    expect(parseTestOutput("playwright", await fixture("pw-zero"))).toBeUndefined()
  })

  test("pytest verbose, quiet and empty sessions", async () => {
    const summary = parseTestOutput("pytest", await fixture("pytest-fail"))
    expect(summary?.tests.counts).toEqual({ failed: 2, passed: 3, skipped: 1 })
    expect(summary?.failures).toEqual([
      "test_approval.py::test_rejects_empty",
      "test_approval.py::TestSuite::test_inside",
    ])
    expect(summary?.duration).toBe("0.07s")
    expect(parseTestOutput("pytest", await fixture("pytest-q-fail"))?.tests.counts).toEqual({
      failed: 2,
      passed: 3,
      skipped: 1,
    })
    expect(parseTestOutput("pytest", await fixture("pytest-pass"))?.tests.counts).toEqual({ passed: 2 })
    const empty = parseTestOutput("pytest", await fixture("pytest-zero"))
    expect(empty?.tests.counts).toEqual({})
    expect(ranCount(empty!)).toBe(0)
  })

  test("pytest preserves full nodeids with spaces and rejects ambiguous delimiters", async () => {
    expect(parseTestOutput("pytest", await fixture("pytest-nodeid-spaces"))?.failures).toEqual([
      "pytest_nodeid_case.py::test_label[hello world]",
    ])
    expect(parseTestOutput("pytest", await fixture("pytest-nodeid-ambiguous"))).toBeUndefined()
  })

  test("go reports packages, not test counts", async () => {
    const summary = parseTestOutput("go", await fixture("go-fail"))
    expect(summary?.tests).toEqual({ unit: "packages", counts: { passed: 1, failed: 1, noTests: 1 }, total: 3 })
    expect(summary?.failures).toEqual(["TestRejectsEmpty", "TestSub", "TestSub/inner"])
    expect(parseTestOutput("go", await fixture("go-v-fail"))?.tests.counts).toEqual({
      passed: 1,
      failed: 1,
      noTests: 1,
    })
    expect(parseTestOutput("go", await fixture("go-pass"))?.tests.counts).toEqual({ passed: 1, failed: 0 })
  })

  test("cargo sums every test binary it ran", async () => {
    const failed = parseTestOutput("cargo", await fixture("cargo-fail"))
    expect(failed?.tests).toEqual({ unit: "tests", counts: { passed: 1, failed: 1, skipped: 1 }, total: 3 })
    expect(failed?.groups).toEqual({ unit: "binaries", total: 1 })
    expect(failed?.failures).toEqual(["tests::rejects_empty"])
    const all = parseTestOutput("cargo", await fixture("cargo-nff"))
    expect(all?.tests.counts).toEqual({ passed: 3, failed: 1, skipped: 1 })
    expect(all?.groups?.total).toBe(3)
    expect(parseTestOutput("cargo", await fixture("cargo-pass"))?.tests.counts).toEqual({
      passed: 4,
      failed: 0,
      skipped: 1,
    })
  })

  test("rejects summaries that are not the runner's final, coherent footer", async () => {
    const bun = await fixture("bun-fail")
    // Text after the footer, a repeated footer, a cut footer and incoherent totals.
    expect(parseTestOutput("bun", `${bun}\nDone.\n`)).toBeUndefined()
    expect(parseTestOutput("bun", `${bun}\n${bun}`)).toBeUndefined()
    expect(parseTestOutput("bun", bun.slice(0, bun.lastIndexOf("Ran ")))).toBeUndefined()
    expect(parseTestOutput("bun", bun.replace("Ran 9 tests", "Ran 10 tests"))).toBeUndefined()
    expect(parseTestOutput("bun", bun.replace(" 2 fail", " 2.5 fail"))).toBeUndefined()
    expect(parseTestOutput("bun", bun.replace(" 2 fail\n", ""))).toBeUndefined()
    expect(parseTestOutput("bun", bun.replace("50.00ms", "1.2.3ms"))).toBeUndefined()
    expect(parseTestOutput("bun", "echo:  3 pass\n 0 fail\nRan 3 tests across 1 file. [1.00ms]")).toBeUndefined()
    const vitest = await fixture("vitest-fail")
    expect(parseTestOutput("vitest", vitest.replace("(5)", "(6)"))).toBeUndefined()
    expect(parseTestOutput("vitest", vitest.replace("1 todo (5)", "1 expected fail (5)"))).toBeUndefined()
    expect(parseTestOutput("pytest", "== 1 failed, 1 xfailed in 0.1s ==")).toBeUndefined()
    expect(parseTestOutput("pytest", "Finished in 0.5s")).toBeUndefined()
    expect(parseTestOutput("pytest", "1 passed, 1 passed in 0.1s")).toBeUndefined()
    expect(parseTestOutput("pytest", "1 warnings in 0.1s")).toBeUndefined()
    const playwright = await fixture("pw-fail")
    expect(parseTestOutput("playwright", playwright.replace("Running 4 tests", "Running 5 tests"))).toBeUndefined()
    const cargo = await fixture("cargo-pass")
    expect(parseTestOutput("cargo", cargo.replace("running 3 tests", "running 4 tests"))).toBeUndefined()
    expect(
      parseTestOutput(
        "cargo",
        cargo.replace("test result: ok. 1 passed; 0 failed", "test result: ok. 1 passed; 1 failed"),
      ),
    ).toBeUndefined()
    const go = await fixture("go-fail")
    expect(parseTestOutput("go", `${go}ok  \texample.com/approval/b\t0.1s\n`)).toBeUndefined()
    expect(parseTestOutput("go", "ok example.com/a 0.1s\nFAIL\n")).toBeUndefined()
    expect(parseTestOutput("go", "FAIL example.com/b [unknown failure]\nok example.com/a 0.1s\n")).toBeUndefined()
    expect(parseTestOutput("playwright", "  1 passed (1s)\n")).toBeUndefined()
  })

  test("reads only the bounded tail and refuses aggregates it cannot see whole", async () => {
    const padding = `${"x".repeat(99)}\n`.repeat(Math.ceil(SUMMARY_WINDOW / 100) + 10)
    const bun = parseTestOutput("bun", padding + (await fixture("bun-pass")))
    expect(bun?.tests.counts).toEqual({ passed: 2, failed: 0 })
    expect(parseTestOutput("cargo", padding + (await fixture("cargo-pass")))).toBeUndefined()
  })

  test("long lines inside the window parse in linear time", async () => {
    // Competing quantifiers used to backtrack polynomially: each of these lines took seconds.
    const spaces = " ".repeat(60_000)
    const box = "─".repeat(60_000)
    const title = "a.spec.ts:3:7 › approval › rejects empty"
    const jest = "Test Suites: 1 passed, 1 total\nTests: 1 passed, 1 total\n"
    const playwright = await fixture("pw-fail")
    const cases: [TestRunner, string, string[] | undefined][] = [
      ["vitest", ` Test Files${spaces}x`, undefined],
      ["vitest", ` Test Files  1 passed (1)\n      Tests${spaces}x`, undefined],
      ["jest", `Test Suites:${spaces}x`, undefined],
      ["jest", `Test Suites: 1 passed, 1 total\nTests:${spaces}x`, undefined],
      ["jest", `${jest}Snapshots:${spaces}x`, undefined],
      ["jest", `${jest}Snapshots: ${"1".repeat(60_000)}x`, undefined],
      ["playwright", playwright.replace(`    ${title}`, `    ${title}${spaces}x`), [`${title}${spaces}x`]],
      ["playwright", playwright.replace(`    ${title}`, `    ${title} ${box}x`), [`${title} ${box}x`]],
    ]
    for (const [runner, output, failures] of cases) {
      const start = performance.now()
      const summary = parseTestOutput(runner, output)
      expect(performance.now() - start).toBeLessThan(200)
      expect(summary?.failures).toEqual(failures)
    }
  })
})
