import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { balance, packageLanes, packageShards, plannedBins, shardCount, suiteTimes, weigh, type Timings } from "../src/test-plan.ts"

describe("test shard planner", () => {
  test("a platform's overhead scales its total before the shard count", () => {
    const timings: Timings = {
      target: { linux: 300, windows: 300, e2e: 300 },
      overhead: { linux: 1, windows: 1.6 },
      margin: 1,
      budget: { limit: 20, fixed: 4 },
      files: {},
      totals: { "packages/core": { linux: 900, windows: 900 } },
    }
    expect(packageShards(timings, "packages/core", "linux")).toBe(3)
    expect(packageShards(timings, "packages/core", "windows")).toBe(5)
    expect(packageShards(timings, "packages/missing", "windows")).toBe(1)
  })

  test("relay, gates and rollback never share a lane with a bulk package", () => {
    for (const [name, host] of [["linux", "ubuntu-24.04"], ["windows", "windows-latest"]] as const) {
      const lanes = packageLanes(name, host) as { part: string; filters?: string; turbo?: boolean; relay?: boolean; repo_gates?: boolean; rollback?: boolean }[]
      expect(new Set(lanes.map((lane) => lane.part)).size).toBe(lanes.length)
      for (const lane of lanes.filter((entry) => entry.relay || entry.repo_gates)) expect(lane.turbo).toBeUndefined()
      const rollback = lanes.filter((lane) => lane.rollback)
      expect(rollback.map((lane) => lane.filters)).toEqual(name === "windows" ? ["--filter=@orchestra/atlas-boundary"] : [])
      const libs = lanes.find((lane) => lane.part.endsWith("libs"))
      expect(libs?.filters).toContain("--filter=!@orchestra/atlas-boundary")
      expect(libs?.filters).toContain("--filter=!@orchestra/relay")
      expect(libs?.relay ?? libs?.repo_gates ?? libs?.rollback).toBeUndefined()
      expect((libs as { budget?: number }).budget).toBe(name === "windows" ? 15 : undefined)
    }
  })

  test("a core shard does not compile plugin inside the timed test step", () => {
    const workflow = readFileSync(new URL("../../../.github/workflows/test.yml", import.meta.url), "utf8").replaceAll("\r\n", "\n")
    const step = workflow.split("- name: Run unit tests")[1]?.split("- name:")[0] ?? ""
    const code = step.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n")
    const invocations = [...code.matchAll(/bun turbo test --filter=@orchestra\/core[^\n]*/g)].map((match) => match[0])
    expect(invocations).toEqual([
      "bun turbo test --filter=@orchestra/core --only --log-order=stream -- --preload ./test/file-start.ts \"${files[@]}\" \"${report[@]}\"",
    ])
    expect(code).toContain('cd packages/core && GITHUB_ACTIONS=false ')
    expect(code).toContain('=declared bun test --timeout 30000 --only-failures --preload ./test/file-start.ts "$alone_file") &')
    expect(code).toContain('wait "$pid"')
    const waited = code.split('if [ -n "${alone_pids[0]:-}" ]; then')[1]?.split("fi")[0] ?? ""
    expect(waited).toContain('for pid in "${alone_pids[@]}"; do')
    expect(waited).toContain('wait "$pid"')
    expect(waited).not.toContain(":-")
    expect(code).not.toContain('bun test --timeout 30000 --only-failures "${alone[@]}"')
    const own = code.split('if [ "$file" = "test/filesystem/watcher.test.ts" ] || [ "$file" = "test/tool-write.test.ts" ] || [ "$file" = "test/tool-safety-loopback.test.ts" ] || [ "$file" = "test/tool-safety-sandbox-repairs.test.ts" ] || [ "$file" = "test/review-toolkit/dependency-shadow.test.ts" ]; then')[1]?.split("else")[0] ?? ""
    expect(own).toContain('alone+=("$file")')
    expect(own).not.toContain("kept")
    const strip = (text: string) => text.replaceAll("\r\n", "\n").replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n")
    const repairs = strip(readFileSync(new URL("../../core/test/tool-safety-sandbox-repairs.test.ts", import.meta.url), "utf8"))
    const runner = strip(readFileSync(new URL("../../core/test/lib/effect.ts", import.meta.url), "utf8"))
    expect(repairs).toContain("failed = true")
    expect([...repairs.matchAll(/process\.exit\([^)]*\)/g)].map((match) => match[0])).toEqual(["process.exit(failed ? 1 : 0)"])
    expect(runner).toContain("run(value, layer).catch(")
    expect(runner).toContain("onFailure?.()")
    const live = runner.split("const live =")[1]?.split("live.only")[0] ?? ""
    expect(live).toContain("noted(value, liveLayer)")
    expect(live).not.toContain("run(")
    expect(step).not.toContain("turbo build")
    expect(workflow).not.toContain("Build Windows test dependencies")
    const start = strip(readFileSync(new URL("../../core/test/file-start.ts", import.meta.url), "utf8"))
    const hook = start.split("build.onResolve")[1] ?? ""
    expect(hook).toContain("writeSync(2,")
    expect([...hook.matchAll(/return\s+[^\n]+/g)].map((match) => match[0].trim())).toEqual(["return undefined", "return undefined"])
    expect(start).not.toContain("onLoad")
    expect(start).not.toContain("console.")
    expect(workflow).toContain("timeout-minutes: ${{ matrix.budget && 12 || 8 }}")
    expect(workflow).toContain("timeout-minutes: ${{ matrix.budget || 10 }}")
    const app = code.split("if printf '%s\\n' \"${filters[@]}\" | grep -qx -- '--filter=@orchestra/app'; then")[1]?.split("fi")[0] ?? ""
    expect(app).toContain("only=(--only)")
    expect(app).not.toContain("filters")
    expect(code).toContain('bun turbo test --concurrency="$concurrency" --continue=dependencies-successful "${only[@]}" "${filters[@]}"')
  })

  test("shard count follows the measured time and the target", () => {
    expect(shardCount(1139, 270, 1.15)).toBe(5)
    expect(shardCount(100, 270, 1.15)).toBe(1)
    expect(shardCount(0, 270, 1.15)).toBe(1)
  })

  test("longest-first packing keeps every file once and balances the bins", () => {
    const items = [100, 90, 80, 30, 20, 10, 5, 5].map((weight, index) => ({ name: `f${index}`, weight }))
    const bins = balance(items, 3)
    expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(items.map((item) => item.name).toSorted())
    const seconds = bins.map((bin) => bin.seconds)
    expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(30)
    expect(balance(items, 3)).toEqual(bins)
  })

  test("the real core package is covered by its shards without overlap", () => {
    const weights = weigh("packages/core", {}, 1200)
    const bins = balance(weights, 5)
    expect(bins.flatMap((bin) => bin.names).toSorted()).toEqual(weights.map((entry) => entry.name).toSorted())
    expect(bins.every((bin) => bin.names.length > 0)).toBe(true)
  })

  test("a measured file keeps its time and an unmeasured one is scaled from it", () => {
    const weights = weigh("packages/core", { "test/session-runner.test.ts": 60 }, 1200)
    expect(weights.find((entry) => entry.name === "test/session-runner.test.ts")?.weight).toBe(60)
    expect(weights.every((entry) => entry.weight > 0)).toBe(true)
  })

  test("a zero measurement does not stay zero when a floor is set", () => {
    const weights = weigh("packages/core", { "test/session-runner.test.ts": 0 }, 1200, 1)
    expect(weights.find((entry) => entry.name === "test/session-runner.test.ts")?.weight).toBe(1)
    expect(weights.every((entry) => entry.weight >= 1)).toBe(true)
  })

  test("core shards do not pile untimed files, and a multi-file bin stays under the step", () => {
    const timings = JSON.parse(readFileSync(new URL("../src/test-timings.json", import.meta.url), "utf8")) as Timings
    for (const platform of ["linux", "windows"] as const) {
      const bins = plannedBins(timings, "packages/core", platform)
      expect(Math.max(...bins.map((bin) => bin.names.length))).toBeLessThanOrEqual(120)
      // Windows 1.6 left multi-file bins at 255s, and that shard was still running at 8 minutes (run 43120112874).
      const limit = platform === "windows" ? 220 : 280
      expect(bins.filter((bin) => bin.names.length > 1).every((bin) => bin.seconds <= limit)).toBe(true)
      const bare = balance(
        weigh("packages/core", timings.files[`packages/core:${platform}`] ?? {}, timings.totals["packages/core"]?.[platform] ?? 0),
        packageShards(timings, "packages/core", platform),
      )
      expect(Math.max(...bare.map((bin) => bin.names.length))).toBeGreaterThan(120)
    }
  })

  test("reads per-file times from Bun's JUnit suites and ignores describe blocks", () => {
    const xml = `<testsuites><testsuite name="test/a.test.ts" tests="2" time="1.25"><testsuite name="inner" time="1.0"/></testsuite>` +
      `<testsuite name="test\\b.test.ts" tests="1" time="0.5"/></testsuites>`
    expect(suiteTimes(xml)).toEqual([["test/a.test.ts", 1.25], ["test/b.test.ts", 0.5]])
  })
})
