// Manual hosted diagnostic: one runner, unchanged production scenarios, serial A-B-A source revisions.
import assert from "node:assert/strict"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { cpus, freemem, loadavg, totalmem } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { Omni } from "../../core/src/omni.ts"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const app = path.join(root, "packages/app-shell")
const sourcePath = "packages/app-shell/src/context/server-session.ts"
const baseline = "107669604c022e71c35ad9e8250abfcc8533b719"
const candidate = "47bc5027894fa7024e7edb7acb83962500f25c84"
const spec = "e2e/performance/timeline/session-tab-switch-benchmark.spec.ts"
const expectedNames = [
  "benchmarks cold and hot session tab switching",
  "benchmarks v2 session tab switching with and without the review pane",
]

test("compares production session switching serially on one hosted machine", { timeout: 20 * 60_000 }, async (t) => {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "This diagnostic only runs on hosted CI")
  const omni = await Omni.load()
  const original = await readFile(path.join(root, sourcePath))
  async function run(command, args, cwd = root, env = {}, echo = false) {
    const result = await omni.run(command, args, {
      cwd,
      inheritEnv: false,
      env: Omni.childEnv(env),
      timeoutMs: 8 * 60_000,
      signal: t.signal,
      maxOutputBytes: 16 * 1024 * 1024,
    })
    Omni.count("spawns")
    if (echo || !result.success) {
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
    }
    assert.equal(result.success, true, `${command} failed: ${result.stderr}`)
    return result.stdout
  }
  try {
    await run("git", ["fetch", "--no-tags", "--depth=1", "origin", baseline, candidate])
    const changed = await run("git", ["diff", "--name-only", baseline, candidate])
    assert.deepEqual(
      changed.trim().split("\n").sort(),
      ["CHANGELOG.md", sourcePath, "packages/app-shell/src/context/server-session-evict.test.ts"].sort(),
    )
    const before = await run("git", ["show", `${baseline}:${sourcePath}`])
    const after = await run("git", ["show", `${candidate}:${sourcePath}`])
    assert.equal(original.toString("utf8"), after)
    await run("bunx", ["playwright", "install", "--with-deps", "chromium"], app, {}, true)
    console.log(
      "ABA_HOST " + JSON.stringify({ cpu: cpus(), totalmem: totalmem(), node: process.version, baseline, candidate }),
    )
    for (const [phase, revision, source] of [
      ["A1", baseline, before],
      ["B", candidate, after],
      ["A2", baseline, before],
    ]) {
      await writeFile(path.join(root, sourcePath), source)
      const evidence = path.join(root, "test-ci-evidence", "aba", phase)
      await mkdir(evidence, { recursive: true })
      console.log("ABA_PHASE " + JSON.stringify({ phase, revision, load: loadavg(), freemem: freemem() }))
      const output = await run(
        "bun",
        [
          "run",
          "test:e2e:local",
          spec,
          "--config",
          "e2e/performance/playwright.config.ts",
          "--repeat-each",
          "1",
          "--workers",
          "1",
          "--retries",
          "0",
          "--trace",
          "retain-on-failure",
          "--reporter",
          "line,json",
        ],
        app,
        {
          RESEARCH_BENCH_RENDERER: "current",
          RESEARCH_BENCH_REVISION: revision,
          ORCHESTRA_PERFORMANCE_RUN_ID: `${process.env.GITHUB_RUN_ID}-${phase}`,
          PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(evidence, "runtime.json"),
        },
        true,
      )
      const reports = output
        .split("\n")
        .filter((line) => line.includes("BENCHMARK "))
        .map((line) => JSON.parse(line.slice(line.indexOf("BENCHMARK ") + "BENCHMARK ".length)))
      assert.deepEqual(reports.map((report) => report.name).sort(), expectedNames)
      assert.ok(
        reports.every((report) => report.status === "passed" && report.retry === 0 && report.repeatEachIndex === 0),
      )
      console.log("ABA_RESULT " + JSON.stringify({ phase, revision, reports, load: loadavg(), freemem: freemem() }))
    }
  } finally {
    await writeFile(path.join(root, sourcePath), original)
  }
})
