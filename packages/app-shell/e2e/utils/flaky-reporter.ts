import { appendFileSync } from "node:fs"
import type { FullConfig, Reporter, Suite } from "@playwright/test/reporter"

// A test that fails and then passes on a retry ends the run green, so nobody sees it. This reporter lists those
// tests (outcome "flaky") in the log, as a GitHub warning annotation, and in the job summary. It never changes the
// run result.
// A reporter owns the run output, so it writes to stdout directly.
const print = (line: string) => process.stdout.write(`${line}\n`)

export default class FlakyReporter implements Reporter {
  private root: Suite | undefined

  printsToStdio() {
    return false
  }

  onBegin(_config: FullConfig, suite: Suite) {
    this.root = suite
  }

  onEnd() {
    const flaky = this.root?.allTests().filter((test) => test.outcome() === "flaky") ?? []
    if (flaky.length === 0) return
    const rows = flaky.map((test) => ({
      file: test.location.file.replace(/^.*[\\/]e2e[\\/]/, "e2e/"),
      line: test.location.line,
      title: test.titlePath().slice(3).join(" > "),
      attempts: test.results.length,
    }))
    print(`\n${rows.length} flaky test(s) passed only on retry:`)
    rows.forEach((row) => print(`  ${row.file}:${row.line} ${row.title} (${row.attempts} attempts)`))
    if (process.env.GITHUB_ACTIONS)
      rows.forEach((row) =>
        print(`::warning file=${row.file},line=${row.line},title=Flaky Playwright test::${row.title} passed only on retry (${row.attempts} attempts)`),
      )
    if (!process.env.GITHUB_STEP_SUMMARY) return
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `### Flaky Playwright tests (${rows.length})`,
        "",
        "These tests failed and then passed on a retry. The run is green, but each one needs a fix.",
        "",
        "| Test | Location | Attempts |",
        "| --- | --- | --- |",
        ...rows.map((row) => `| ${row.title.replaceAll("|", "\\|")} | \`${row.file}:${row.line}\` | ${row.attempts} |`),
        "",
      ].join("\n"),
    )
  }
}
