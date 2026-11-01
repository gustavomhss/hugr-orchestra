// Plans the shards of test.yml from measured times, so a new test file rebalances the lanes instead of lengthening one.
// Runs on Node 24 (type stripping) as well as Bun: the plan job installs nothing.
//
// Plan:    node packages/script/src/test-plan.ts plan               writes `unit`, `e2e` and `e2e_shards` to $GITHUB_OUTPUT
// Shard:   node packages/script/src/test-plan.ts shard <package directory> <linux|windows> <shard> <shards>
//                                                      prints the test files of one shard, one per line
// Refresh: node packages/script/src/test-plan.ts refresh <junit directory>   (see .orchestra/skills/ci-lanes-maintenance)
//
// packages/script/src/test-timings.json holds seconds of test time on the CI runner. A job's test time is `target`, the shard count of
// a package is ceil(total * margin / target), and files go to the lightest shard first (longest first). A file with no
// timing weighs its size at the seconds-per-byte of the files that have one.
import { appendFileSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.join(import.meta.dirname, "../../..")
const timingsFile = path.join(import.meta.dirname, "test-timings.json")

export type Platform = "linux" | "windows"

export type Timings = {
  // Seconds of test time per job, after `overhead`. `e2e` sizes the Playwright shards.
  target: Record<Platform | "e2e", number>
  // How much slower a file runs in a sharded job than in the measuring run (Bun startup per file, omni, antivirus on
  // Windows). Round 1 of the epic ran Windows shards at 1.0 to 1.6 times their measured time with one at 1.57 or worse.
  overhead: Record<Platform, number>
  // Headroom for the imbalance longest-first packing leaves.
  margin: number
  // Concurrent hosted jobs the account allows, and the jobs of test.yml outside this plan.
  budget: { limit: number; fixed: number }
  // Seconds per test file of a sharded package, keyed `<package directory>:<platform>`, measured by a cold run.
  files: Record<string, Record<string, number>>
  // Seconds per sharded package in total, keyed `<package directory>`; it sets the shard count.
  totals: Record<string, Record<Platform, number>>
}

export function shardCount(seconds: number, target: number, margin: number) {
  return Math.max(1, Math.ceil((seconds * margin) / target))
}

// Shards of a time-sharded package on one platform: its measured total, scaled by the platform's overhead.
export function packageShards(timings: Timings, directory: string, platform: Platform) {
  return shardCount((timings.totals[directory]?.[platform] ?? 0) * timings.overhead[platform], timings.target[platform], timings.margin)
}

// Longest-processing-time first: each item goes to the currently lightest bin. Deterministic for equal weights.
export function balance(items: { name: string; weight: number }[], bins: number) {
  const result = Array.from({ length: bins }, () => ({ seconds: 0, names: [] as string[] }))
  for (const item of items.toSorted((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))) {
    const lightest = result.reduce((best, candidate) => (candidate.seconds < best.seconds ? candidate : best))
    lightest.seconds += item.weight
    lightest.names.push(item.name)
  }
  return result
}

// Test files of a package with their weights in seconds.
export function weigh(directory: string, measured: Record<string, number>, total: number) {
  const files = testFiles(path.join(root, directory)).map((file) => ({ file, bytes: statSync(path.join(root, directory, file)).size }))
  const known = files.filter((entry) => measured[entry.file] !== undefined)
  const unknown = files.filter((entry) => measured[entry.file] === undefined)
  const knownSeconds = known.reduce((sum, entry) => sum + (measured[entry.file] ?? 0), 0)
  const knownBytes = known.reduce((sum, entry) => sum + entry.bytes, 0)
  const unknownBytes = unknown.reduce((sum, entry) => sum + entry.bytes, 0)
  // With no measurement the package total is spread over the files by size.
  const rate =
    knownBytes > 0 ? knownSeconds / knownBytes : unknownBytes > 0 ? Math.max(total - knownSeconds, 0) / unknownBytes : 0
  return files.map((entry) => ({ name: entry.file, weight: measured[entry.file] ?? Math.max(entry.bytes * rate, 0.05) }))
}

// Per-file seconds from a Bun JUnit report: only the top-level suites, which are named after the test file. Describe
// blocks are nested suites with other names and are skipped.
export function suiteTimes(xml: string) {
  return [...xml.matchAll(/<testsuite\s[^>]*?name="([^"]+\.test\.ts)"[^>]*?time="([\d.]+)"/g)].map((match) => {
    const name = (match[1] ?? "").replaceAll("\\", "/")
    return [name.match(/(?:^|\/)(test\/.+)$/)?.[1] ?? name, Number(match[2])] as [string, number]
  })
}

function testFiles(directory: string) {
  return (readdirSync(path.join(directory, "test"), { recursive: true }) as string[])
    .map((file) => `test/${file.replaceAll("\\", "/")}`)
    .filter((file) => file.endsWith(".test.ts"))
    .toSorted()
}

function readTimings() {
  return JSON.parse(readFileSync(timingsFile, "utf8")) as Timings
}

if (import.meta.main) {
  const [command, ...args] = process.argv.slice(2)
  if (command === "plan") plan(readTimings())
  else if (command === "shard") shard(readTimings(), args)
  else if (command === "refresh") refresh(readTimings(), args[0])
  else {
    console.error("usage: test-plan.ts plan | shard <directory> <linux|windows> <shard> <shards> | refresh <junit directory>")
    process.exit(2)
  }
}

function shard(timings: Timings, args: string[]) {
  const [directory, platform, index, count] = args
  const shards = Number(count)
  const selected = Number(index)
  if (!directory || !(selected >= 1 && selected <= shards) || (platform !== "linux" && platform !== "windows")) {
    console.error("usage: test-plan.ts shard <package directory> <linux|windows> <shard> <shards>")
    process.exit(2)
  }
  const weights = weigh(directory, timings.files[`${directory}:${platform}`] ?? {}, timings.totals[directory]?.[platform] ?? 0)
  const mine = balance(weights, shards)[selected - 1]
  if (!mine || mine.names.length === 0) {
    console.error(`shard ${selected}/${shards} has no test files`)
    process.exit(1)
  }
  console.error(`shard ${selected}/${shards}: ${mine.names.length} files, ~${Math.round(mine.seconds)}s`)
  console.log(mine.names.toSorted().join("\n"))
}

function plan(timings: Timings) {
  const linuxCore = packageShards(timings, "packages/core", "linux")
  const windowsCore = packageShards(timings, "packages/core", "windows")
  const unit = [
    ...coreShards("linux", "ubuntu-24.04", linuxCore),
    ...coreShards("windows", "windows-latest", windowsCore),
    ...packageLanes("linux", "ubuntu-24.04"),
    ...packageLanes("windows", "windows-latest"),
  ]
  const e2e = Array.from({ length: e2eShards(timings) }, (_, index) => index + 1)
  const jobs = unit.length + e2e.length + timings.budget.fixed
  const lines = [`unit=${JSON.stringify(unit)}`, `e2e=${JSON.stringify(e2e)}`, `e2e_shards=${e2e.length}`].map((line) => `${line}\n`).join("")
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines)
  else process.stdout.write(lines)
  console.error(`plan: ${unit.length} unit jobs (core ${linuxCore} linux, ${windowsCore} windows), ${e2e.length} e2e shards, ${jobs} jobs with the fixed ones`)
  // test.yml caps its matrices with max-parallel, so an over-budget plan queues instead of losing jobs to the account cap.
  if (jobs > timings.budget.limit)
    console.log(`::warning title=test plan::${jobs} jobs exceed the ${timings.budget.limit}-job account cap; max-parallel queues the surplus`)
}

function coreShards(name: Platform, host: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name,
    host,
    part: `core-${index + 1}`,
    label: `core ${index + 1}/${count}`,
    shard: `${index + 1}/${count}`,
    turbo: true,
    filters: "--filter=@orchestra/core",
  }))
}

// The package lanes. Core is sharded by time above; these stay fixed and are sized from the round 2 epic run (seconds of test
// time, Linux / Windows): app 283 / 301, cli 223 / 177, server 37 / 65, the four small clients 38 / 39, and `atlas-boundary`,
// whose one generator test takes about 210 / 294 s and so gets a lane of its own. The last lane is the complement of every
// other lane, so a package added later lands in it instead of in no lane. Repo-wide gates and the Relay suite are not
// package tests: they share a lane with each other and with no bulk package (the lane that carried them with the other
// packages ran past the 10-minute limit). The legacy rollback proof rides in the Windows atlas lane beside the process
// query proof, for the same reason.
export function packageLanes(name: Platform, host: string) {
  const claimed = ["core", "cli", "app", "server", "sdk-next", "client", "tui", "session-ui", "atlas-boundary"].map((entry) => `@orchestra/${entry}`)
  // httpapi-codegen is a build-time generator whose tests pin POSIX paths, so it runs on Linux only.
  const excluded = name === "windows" ? [...claimed, "@orchestra/httpapi-codegen"] : claimed
  const filters = (packages: string[]) => packages.map((entry) => `--filter=@orchestra/${entry}`).join(" ")
  const linux = name === "linux"
  const lane = (part: string, label: string, selected: string, extra: object = {}) => ({
    name,
    host,
    part: linux ? `packages-${part}` : `windows-${part}`,
    label,
    turbo: true,
    filters: selected,
    ...extra,
  })
  return [
    lane("app", "app", filters(["app"]), { electron: linux }),
    lane("cli", "cli, server, clients", filters(["cli", "server", "sdk-next", "client", "tui", "session-ui"]), { electron: linux }),
    lane("atlas", linux ? "atlas boundary" : "atlas boundary, process query, rollback", filters(["atlas-boundary"]), {
      electron: linux,
      hosted: !linux,
      rollback: !linux,
    }),
    lane("libs", "other packages", excluded.map((entry) => `--filter=!${entry}`).join(" "), { electron: linux }),
    ...(linux
      ? [
          { name, host, part: "gates", label: "gates, relay", repo_gates: true, relay: true },
          { name, host, part: "httpapi", label: "httpapi", httpapi: true },
          { name, host, part: "sandbox", label: "sandbox proofs", hosted: true },
        ]
      : []),
  ]
}

// Specs from packages/app-shell/script/e2e-timings.json; a spec without a timing weighs the median, as e2e-shard.ts does.
function e2eShards(timings: Timings) {
  const measured = JSON.parse(readFileSync(path.join(root, "packages/app-shell/script/e2e-timings.json"), "utf8")) as Record<string, number>
  const specs = (readdirSync(path.join(root, "packages/app-shell/e2e"), { recursive: true }) as string[])
    .map((file) => `e2e/${file.replaceAll("\\", "/")}`)
    .filter((file) => /\.(spec|test)\.(ts|tsx|js|mjs)$/.test(file) && !file.startsWith("e2e/performance/"))
  const known = specs.map((file) => measured[file]).filter((seconds) => seconds !== undefined).toSorted((a, b) => a - b)
  const median = known[Math.floor(known.length / 2)] ?? 1
  const seconds = specs.reduce((sum, file) => sum + (measured[file] ?? median), 0)
  return shardCount(seconds, timings.target.e2e, timings.margin)
}

// Folds the JUnit reports of a cold run (artifacts `junit-<os>-<part>`, files `<os>-<part>.xml`) into the per-file times
// and the per-platform totals of test-timings.json.
function refresh(timings: Timings, directory: string | undefined) {
  if (!directory) {
    console.error("usage: test-plan.ts refresh <junit directory>")
    process.exit(2)
  }
  const reports = (readdirSync(directory, { recursive: true }) as string[]).filter((file) => /(^|[\\/])(linux|windows)-core-\d+\.xml$/.test(file))
  if (reports.length === 0) {
    console.error(`no core JUnit report under ${directory}`)
    process.exit(1)
  }
  const measured = new Map<string, Record<string, number>>()
  for (const report of reports) {
    const platform = path.basename(report).startsWith("linux") ? "linux" : "windows"
    const key = `packages/core:${platform}`
    const files = measured.get(key) ?? {}
    for (const [file, seconds] of suiteTimes(readFileSync(path.join(directory, report), "utf8"))) files[file] = Number(seconds.toFixed(2))
    measured.set(key, files)
  }
  for (const [key, files] of measured) {
    const platform = key.endsWith("linux") ? "linux" : "windows"
    timings.files[key] = Object.fromEntries(Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b)))
    const core = timings.totals["packages/core"] ?? { linux: 0, windows: 0 }
    core[platform] = Math.round(Object.values(files).reduce((sum, seconds) => sum + seconds, 0))
    timings.totals["packages/core"] = core
  }
  writeFileSync(timingsFile, JSON.stringify(timings, null, 2) + "\n")
  console.error(`refreshed ${[...measured.keys()].join(", ")} from ${reports.length} reports`)
}
