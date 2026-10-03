import stripAnsi from "strip-ansi"

export type TestRunner = "bun" | "vitest" | "jest" | "playwright" | "pytest" | "go" | "cargo"
export type TestCountKey =
  | "passed"
  | "failed"
  | "errors"
  | "interrupted"
  | "flaky"
  | "skipped"
  | "todo"
  | "notRun"
  | "noTests"
export type TestCounts = Partial<Record<TestCountKey, number>>
export type TestSummary = {
  runner: TestRunner
  // Counts exactly as the runner reported them; go test only reports packages.
  tests: { unit: "tests" | "packages"; counts: TestCounts; total?: number }
  groups?: { unit: "files" | "suites" | "binaries"; counts?: TestCounts; total: number }
  failures: string[]
  duration?: string
}

// Summaries only read the end of retained output once per completed revision.
export const SUMMARY_WINDOW = 64 * 1024

const COMPOSITION = /[|;&<>`\n\r]|\$\(/
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/
const LAUNCHERS = [["npx"], ["bunx"], ["bun", "x"], ["pnpm", "exec"], ["npm", "exec"], ["yarn", "exec"]]
const VITEST_INTERACTIVE = new Set(["watch", "dev", "bench", "init", "list"])

// Only direct runner invocations qualify: package scripts, pipelines and other
// shell composition stay output-only because the printed text cannot be attributed.
export function detectTestRunner(command: string): TestRunner | undefined {
  const text = command.trim().replace(/\s+2>&1$/, "")
  if (!text || COMPOSITION.test(text)) return
  const words = text.split(/\s+/)
  const start = words.findIndex((word) => !ENV_ASSIGNMENT.test(word))
  if (start < 0) return
  const args = words.slice(start)
  const program = executable(args[0]!)
  if (program === "bun" && args[1] === "test") return "bun"
  if (program === "go" && args[1] === "test") return "go"
  if (program === "cargo" && args[1] === "test") return "cargo"
  if ((program === "python" || program === "python3") && args[1] === "-m" && args[2] === "pytest") return "pytest"
  const launcher = LAUNCHERS.find((prefix) => prefix.every((word, index) => executable(args[index] ?? "") === word))
  return packageRunner(launcher ? args.slice(launcher.length) : args)
}

export function parseTestOutput(runner: TestRunner, output: string): TestSummary | undefined {
  const window = output.length > SUMMARY_WINDOW ? output.slice(-SUMMARY_WINDOW) : output
  const lines = stripAnsi(window).replace(/\r\n?/g, "\n").split("\n")
  while (lines.length > 0 && !lines.at(-1)!.trim()) lines.pop()
  if (lines.length === 0) return
  if (runner === "bun") return parseBun(lines)
  if (runner === "vitest") return parseVitest(lines)
  if (runner === "jest") return parseJest(lines)
  if (runner === "playwright") return parsePlaywright(lines)
  if (runner === "pytest") return parsePytest(lines)
  // go and cargo aggregate every package or binary, so a cut window cannot be summed.
  if (window.length !== output.length) return
  if (runner === "go") return parseGo(lines)
  return parseCargo(lines)
}

export function failedCount(summary: TestSummary) {
  const counts = summary.tests.counts
  return (counts.failed ?? 0) + (counts.errors ?? 0) + (counts.interrupted ?? 0)
}

export function ranCount(summary: TestSummary) {
  const counts = summary.tests.counts
  return failedCount(summary) + (counts.passed ?? 0) + (counts.flaky ?? 0)
}

function executable(word: string) {
  return (word.split(/[\\/]/).at(-1) ?? "").replace(/\.(exe|cmd)$/i, "")
}

function packageRunner(args: string[]): TestRunner | undefined {
  const program = executable(args[0] ?? "")
  if (program === "vitest") return VITEST_INTERACTIVE.has(args[1] ?? "") ? undefined : "vitest"
  if (program === "jest") return "jest"
  if (program === "playwright" && args[1] === "test") return "playwright"
  if (program === "pytest" || program === "py.test") return "pytest"
}

function count(value: string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

function sum(counts: TestCounts) {
  return Object.values(counts).reduce((total, value) => total + (value ?? 0), 0)
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

// Parses "N label" items joined by a separator; any unknown label rejects the line.
function items(text: string, separator: string, labels: Record<string, TestCountKey>) {
  const counts: TestCounts = {}
  for (const item of text.split(separator)) {
    const match = item.trim().match(/^(\d+) (.+)$/)
    const key = match ? labels[match[2]!] : undefined
    const value = match ? count(match[1]!) : undefined
    if (!key || value === undefined || counts[key] !== undefined) return
    counts[key] = value
  }
  return counts
}

const BUN_FOOTER = /^Ran (\d+) tests? across (\d+) files?\. \[([\d.]+m?s)\]$/
const BUN_COUNT = /^\s*(\d+) (pass|fail|skip|todo|expect\(\) calls)$/
const BUN_LABELS: Record<string, TestCountKey | undefined> = {
  pass: "passed",
  fail: "failed",
  skip: "skipped",
  todo: "todo",
}

function parseBun(lines: string[]): TestSummary | undefined {
  const footer = lines.at(-1)!.match(BUN_FOOTER)
  if (!footer || lines.filter((line) => BUN_FOOTER.test(line)).length !== 1) return
  const counts: TestCounts = {}
  const seen = new Set<string>()
  for (const line of lines.slice(0, -1).toReversed()) {
    const match = line.match(BUN_COUNT)
    if (!match) break
    if (seen.has(match[2]!)) return
    seen.add(match[2]!)
    const key = BUN_LABELS[match[2]!]
    const value = count(match[1]!)
    if (value === undefined) return
    if (key) counts[key] = value
  }
  const total = count(footer[1]!)
  const files = count(footer[2]!)
  if (counts.passed === undefined || counts.failed === undefined || total === undefined || files === undefined) return
  if (sum(counts) !== total) return
  return {
    runner: "bun",
    tests: { unit: "tests", counts, total },
    groups: { unit: "files", total: files },
    failures: unique(lines.flatMap((line) => line.match(/^(?:\(fail\)|✗) (.+?)(?: \[[\d.]+m?s\])?$/)?.[1] ?? [])),
    duration: footer[3],
  }
}

const VITEST_LABELS: Record<string, TestCountKey> = {
  passed: "passed",
  failed: "failed",
  skipped: "skipped",
  todo: "todo",
}

function vitestRow(line: string | undefined, label: string) {
  const match = line?.match(new RegExp(`^\\s*${label}\\s{2,}(.+) \\((\\d+)\\)$`))
  if (!match) return
  const counts = items(match[1]!, " | ", VITEST_LABELS)
  const total = count(match[2]!)
  if (!counts || total === undefined || sum(counts) !== total) return
  return { counts, total }
}

function parseVitest(lines: string[]): TestSummary | undefined {
  const index = lines.findIndex((line) => /^\s*Test Files\s{2,}/.test(line))
  if (index < 0 || lines.filter((line) => /^\s*Test Files\s{2,}/.test(line)).length !== 1) return
  const files = vitestRow(lines[index], "Test Files")
  const tests = vitestRow(lines[index + 1], "Tests")
  const rest = lines.slice(index + 2).map((line) => line.trim())
  const duration = rest.at(-1)?.match(/^Duration\s{2,}(\S+)/)
  if (!files || !tests || !duration) return
  if (!rest.slice(0, -1).every((line) => /^(Errors|Start at)\s{2,}\S/.test(line))) return
  const errors = rest.find((line) => line.startsWith("Errors"))?.match(/^Errors\s{2,}(\d+) errors?$/)
  if (rest.some((line) => line.startsWith("Errors")) && !errors) return
  return {
    runner: "vitest",
    tests: {
      unit: "tests",
      counts: { ...tests.counts, ...(errors ? { errors: count(errors[1]!) } : {}) },
      total: tests.total,
    },
    groups: { unit: "files", counts: files.counts, total: files.total },
    failures: unique(lines.flatMap((line) => line.match(/^\s*FAIL\s{2}(.+)$/)?.[1] ?? [])),
    duration: duration[1],
  }
}

const JEST_LABELS: Record<string, TestCountKey> = {
  passed: "passed",
  failed: "failed",
  skipped: "skipped",
  todo: "todo",
}

function jestRow(line: string | undefined, label: string) {
  const match = line?.match(new RegExp(`^${label}:\\s+(.+), (\\d+) total$`))
  if (!match) return
  const counts = items(match[1]!, ", ", JEST_LABELS)
  const total = count(match[2]!)
  if (!counts || total === undefined || sum(counts) !== total) return
  return { counts, total }
}

function parseJest(lines: string[]): TestSummary | undefined {
  const index = lines.findIndex((line) => line.startsWith("Test Suites:"))
  if (index < 0 || lines.filter((line) => line.startsWith("Test Suites:")).length !== 1) return
  const suites = jestRow(lines[index], "Test Suites")
  const tests = jestRow(lines[index + 1], "Tests")
  const snapshots = lines[index + 2]?.match(/^Snapshots:\s+.*\d+ total$/)
  const time = lines[index + 3]?.match(/^Time:\s+([\d.]+ m?s)(?:, estimated .+)?$/)
  const rest = lines.slice(index + 4)
  if (!suites || !tests || !snapshots || !time) return
  if (rest.length > 1 || (rest[0] !== undefined && !/^Ran all test suites/.test(rest[0]))) return
  return {
    runner: "jest",
    tests: { unit: "tests", counts: tests.counts, total: tests.total },
    groups: { unit: "suites", counts: suites.counts, total: suites.total },
    failures: unique(lines.flatMap((line) => line.match(/^\s*● (.+)$/)?.[1] ?? [])),
    duration: time[1]!.replace(" ", ""),
  }
}

const PLAYWRIGHT_COUNT = /^ {2}(\d+) (failed|flaky|skipped|did not run|interrupted|passed)(?: \(([^)]+)\))?$/
const PLAYWRIGHT_LABELS: Record<string, TestCountKey> = {
  failed: "failed",
  flaky: "flaky",
  skipped: "skipped",
  "did not run": "notRun",
  interrupted: "interrupted",
  passed: "passed",
}

function parsePlaywright(lines: string[]): TestSummary | undefined {
  const counts: TestCounts = {}
  const failures: string[] = []
  const pending: string[] = []
  let duration: string | undefined
  for (const line of lines.toReversed()) {
    const match = line.match(PLAYWRIGHT_COUNT)
    if (match) {
      const key = PLAYWRIGHT_LABELS[match[2]!]!
      const value = count(match[1]!)
      if (value === undefined || counts[key] !== undefined) return
      counts[key] = value
      if (match[3]) {
        if (key !== "passed" || duration) return
        duration = match[3]
      }
      if (key === "failed" || key === "interrupted") failures.push(...pending)
      pending.length = 0
      continue
    }
    if (!/^ {4}\S/.test(line)) break
    pending.unshift(line.trim().replace(/\s*─+$/, ""))
  }
  if (pending.length > 0 || Object.keys(counts).length === 0) return
  const running = lines.filter((line) => /^Running \d+ tests? using \d+ workers?/.test(line))
  const total = running.length === 1 ? count(running[0]!.match(/^Running (\d+)/)![1]!) : undefined
  if (running.length > 1 || (total !== undefined && sum(counts) !== total)) return
  return { runner: "playwright", tests: { unit: "tests", counts, total }, failures: unique(failures), duration }
}

const PYTEST_LABELS: Record<string, TestCountKey | "ignored"> = {
  failed: "failed",
  passed: "passed",
  skipped: "skipped",
  error: "errors",
  errors: "errors",
  warning: "ignored",
  warnings: "ignored",
  deselected: "ignored",
}
const PYTEST_FOOTER = /^(?:=+ )?(.+?) in ([\d.]+s)(?: \([\d:]+\))?(?: =+)?$/

function parsePytest(lines: string[]): TestSummary | undefined {
  const last = lines.at(-1)!.trim()
  const footer = last.match(PYTEST_FOOTER)
  if (!footer || last.startsWith("=") !== last.endsWith("=")) return
  if (lines.slice(0, -1).some((line) => /^=+ .+ in [\d.]+s.* =+$/.test(line.trim()))) return
  const counts: TestCounts = {}
  if (footer[1] !== "no tests ran") {
    for (const item of footer[1]!.split(", ")) {
      const match = item.match(/^(\d+) ([a-z]+)$/)
      const key = match ? PYTEST_LABELS[match[2]!] : undefined
      const value = match ? count(match[1]!) : undefined
      if (!key || value === undefined) return
      if (key !== "ignored") counts[key] = (counts[key] ?? 0) + value
    }
  }
  return {
    runner: "pytest",
    tests: { unit: "tests", counts },
    failures: unique(lines.flatMap((line) => line.match(/^(?:FAILED|ERROR) (\S+)/)?.[1] ?? [])),
    duration: footer[2],
  }
}

const GO_OK = /^ok\s+(\S+)\s+(?:[\d.]+s|\(cached\))(?:\s+coverage: .+)?(\s+\[no tests to run\])?$/
const GO_FAIL = /^FAIL\s+(\S+)\s+(?:[\d.]+s|\[[a-z ]+ failed\])$/
const GO_NONE = /^\?\s+(\S+)\s+\[no test files\]$/

function parseGo(lines: string[]): TestSummary | undefined {
  const results = lines.flatMap((line): { name: string; key: TestCountKey }[] => {
    const ok = line.match(GO_OK)
    if (ok) return [{ name: ok[1]!, key: ok[2] ? "noTests" : "passed" }]
    const fail = line.match(GO_FAIL)
    if (fail) return [{ name: fail[1]!, key: "failed" }]
    const none = line.match(GO_NONE)
    return none ? [{ name: none[1]!, key: "noTests" }] : []
  })
  const last = lines.at(-1)!
  if (results.length === 0 || !(last === "FAIL" || GO_OK.test(last) || GO_FAIL.test(last) || GO_NONE.test(last))) return
  if (new Set(results.map((result) => result.name)).size !== results.length) return
  const counts = results.reduce<TestCounts>((acc, result) => ({ ...acc, [result.key]: (acc[result.key] ?? 0) + 1 }), {})
  return {
    runner: "go",
    tests: { unit: "packages", counts: { passed: 0, failed: 0, ...counts }, total: results.length },
    failures: unique(lines.flatMap((line) => line.match(/^\s*--- FAIL: (\S+) \(/)?.[1] ?? [])),
  }
}

const CARGO_RESULT =
  /^test result: (ok|FAILED)\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out; finished in ([\d.]+s)$/
const CARGO_TAIL = [/^\s*$/, /^error: test failed, to rerun pass `.+`$/, /^error: \d+ targets? failed:$/, /^ {4}`.+`$/]

function parseCargo(lines: string[]): TestSummary | undefined {
  const tail = lines.findLastIndex((line) => !CARGO_TAIL.some((pattern) => pattern.test(line)))
  if (tail < 0 || !CARGO_RESULT.test(lines[tail]!)) return
  const counts: TestCounts = { passed: 0, failed: 0, skipped: 0 }
  let running: number | undefined
  let binaries = 0
  for (const line of lines) {
    const start = line.match(/^running (\d+) tests?$/)
    if (start) {
      if (running !== undefined) return
      running = count(start[1]!)
      continue
    }
    const result = line.match(CARGO_RESULT)
    if (!result) continue
    const [passed, failed, ignored, measured] = result.slice(2, 6).map(count)
    if (running === undefined || [passed, failed, ignored].some((value) => value === undefined) || measured !== 0)
      return
    if (passed! + failed! + ignored! !== running) return
    if ((result[1] === "FAILED") !== failed! > 0) return
    counts.passed! += passed!
    counts.failed! += failed!
    counts.skipped! += ignored!
    running = undefined
    binaries++
  }
  if (running !== undefined || binaries === 0) return
  return {
    runner: "cargo",
    tests: { unit: "tests", counts, total: sum(counts) },
    groups: { unit: "binaries", total: binaries },
    failures: unique(lines.flatMap((line) => line.match(/^test (.+) \.\.\. FAILED$/)?.[1] ?? [])),
  }
}
