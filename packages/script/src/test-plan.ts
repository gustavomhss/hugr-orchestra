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
  // Declared scheduling floors, separate from cold-run measurements. Same keys as `files`.
  reserves?: Record<string, Record<string, number>>
  // Scheduling evidence, including estimates that must not be mistaken for platform measurements.
  provenance?: Record<string, unknown>
  // Seconds per sharded package in total, keyed `<package directory>`.
  totals: Record<string, Record<Platform, number>>
}

export function shardCount(seconds: number, target: number, margin: number) {
  return Math.max(1, Math.ceil((seconds * margin) / target))
}

// Size from the larger of the measured total and current file weights, scaled by platform overhead.
export function packageShards(timings: Timings, directory: string, platform: Platform) {
  if (directory === "apps/desktop") return desktopAnchors.length
  const total = timings.totals[directory]?.[platform]
  if (total === undefined) return 1
  const weights = weigh(directory, timings.files[`${directory}:${platform}`] ?? {}, total, UNTIMED_FLOOR, timings.reserves?.[`${directory}:${platform}`])
  const seconds = Math.round(weights.reduce((sum, entry) => sum + entry.weight, 0) * 1000) / 1000
  return shardCount(Math.max(total, seconds) * timings.overhead[platform], timings.target[platform], timings.margin)
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
// A measured 0 is a skip or a file the timer missed. Left at 0, every such file falls into the lightest shard.
// Windows core 4/6 then held 206 files and the 8-minute step died before a test printed (run 42923208918).
// Linux core 2/4 held 151 files, estimated 319s, and the tests alone took 476s (run 42930009745).
const UNTIMED_FLOOR = 1

/** The bins `shard` prints. The floor lives here, so a test of this function is a test of the split CI runs. */
export function plannedBins(timings: Timings, directory: string, platform: Platform) {
  if (directory === "apps/desktop") return desktopBins(timings, platform)
  return balance(
    weigh(
      directory,
      timings.files[`${directory}:${platform}`] ?? {},
      timings.totals[directory]?.[platform] ?? 0,
      UNTIMED_FLOOR,
      timings.reserves?.[`${directory}:${platform}`],
    ),
    packageShards(timings, directory, platform),
  )
}

export function weigh(
  directory: string,
  measured: Record<string, number>,
  total: number,
  floorOrReserves: number | Record<string, number> = 0,
  reserves: Record<string, number> = {},
) {
  const files = (directory === "apps/desktop" ? desktopFiles().bun : testFiles(path.join(root, directory))).map((file) => ({ file, bytes: statSync(path.join(root, directory, file)).size }))
  const known = files.filter((entry) => measured[entry.file] !== undefined)
  const unknown = files.filter((entry) => measured[entry.file] === undefined)
  const knownSeconds = known.reduce((sum, entry) => sum + (measured[entry.file] ?? 0), 0)
  const knownBytes = known.reduce((sum, entry) => sum + entry.bytes, 0)
  const unknownBytes = unknown.reduce((sum, entry) => sum + entry.bytes, 0)
  // With no measurement the package total is spread over the files by size.
  const rate =
    knownBytes > 0 ? knownSeconds / knownBytes : unknownBytes > 0 ? Math.max(total - knownSeconds, 0) / unknownBytes : 0
  const floor = typeof floorOrReserves === "number" ? floorOrReserves : 0
  const held = typeof floorOrReserves === "number" ? reserves : floorOrReserves
  return files.map((entry) => {
    const recorded = measured[entry.file]
    const estimated = Math.max(recorded === undefined ? Math.max(entry.bytes * rate, 0.05) : recorded, held[entry.file] ?? 0)
    return { name: entry.file, weight: floor > 0 && estimated < floor ? floor : estimated }
  })
}

// Per-file seconds from a Bun JUnit report: only the top-level suites, which are named after the test file. Describe
// blocks are nested suites with other names and are skipped.
export function suiteTimes(xml: string) {
  return [...xml.matchAll(/<testsuite\s[^>]*?name="([^"]+(?:\.test|_test|\.spec|_spec)\.[jt]sx?)"[^>]*?time="([\d.]+)"/g)].map((match) => {
    const name = (match[1] ?? "").replaceAll("\\", "/")
    return [name.match(/(?:^|\/)((?:test|src|scripts)\/.+)$/)?.[1] ?? name, Number(match[2])] as [string, number]
  })
}

// The plan job has Node but no dependencies. Accept the current literal exclusions, never guess at new glob syntax.
export function desktopIgnores(config: string) {
  if (Buffer.byteLength(config) > 32_768) throw new Error("Desktop bunfig exceeds the bounded exclusion parser")
  const section = config.split(/^\[test\]\s*$/m)[1]?.split(/^\[/m)[0]
  const source = section?.replace(/#[^\n]*/g, "") ?? ""
  const matches = [...source.matchAll(/(?:^|\n)\s*pathIgnorePatterns\s*=\s*\[([^\]]*)\][ \t]*(?=\r?\n|$)/g)]
  if (matches.length !== 1 || [...source.matchAll(/\bpathIgnorePatterns\b/g)].length !== 1) throw new Error("Expected one literal Desktop pathIgnorePatterns array")
  const body = matches[0]![1]!
  const paths = [...body.matchAll(/"([^"\\]*)"/g)].map((match) => match[1]!)
  if (!/^\s*"[^"\\]*"(?:\s*,\s*"[^"\\]*")*\s*,?\s*$/.test(body) || paths.length === 0 || new Set(paths).size !== paths.length)
    throw new Error("Unsupported Desktop exclusion syntax")
  if (paths.some((file) => file !== "src/**/*.node.test.ts" && !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.test\.[jt]sx?$/.test(file)))
    throw new Error("Unsupported Desktop exclusion pattern")
  if (!paths.includes("src/**/*.node.test.ts")) throw new Error("Desktop Node exclusion is missing")
  return paths
}

export function desktopFiles() {
  const directory = path.join(root, "apps/desktop")
  const ignores = desktopIgnores(readFileSync(path.join(directory, "bunfig.toml"), "utf8"))
  const files = desktopTree(directory).filter((file) => /(?:\.test|_test|\.spec|_spec)\.[jt]sx?$/.test(file)).toSorted()
  const node = files.filter((file) => file.startsWith("src/") && file.endsWith(".node.test.ts"))
  const excluded = files.filter((file) => ignores.includes(file))
  const bun = files.filter((file) => !node.includes(file) && !excluded.includes(file))
  if (!bun.length || !node.length) throw new Error("Desktop discovery selected an empty runner")
  return { bun, node, excluded }
}

function desktopTree(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git") return []
    const file = `${prefix}${entry.name}`
    if (entry.isDirectory()) return desktopTree(path.join(directory, entry.name), `${file}/`)
    return entry.isFile() ? [file] : []
  })
}

export const desktopAnchors = ["src/main/omni-process.test.ts", "src/main/owned-serve.test.ts", "src/main/owned-serve-omni.test.ts"]

export function desktopBins(timings: Timings, platform: Platform) {
  const weights = weigh("apps/desktop", timings.files[`apps/desktop:${platform}`] ?? {}, timings.totals["apps/desktop"]?.[platform] ?? 0, UNTIMED_FLOOR)
  const bins = desktopAnchors.map((name) => {
    const anchor = weights.find((entry) => entry.name === name)
    if (!anchor) throw new Error(`Missing Desktop real process control: ${name}`)
    return { seconds: anchor.weight, names: [name] }
  })
  for (const entry of weights.filter((entry) => !desktopAnchors.includes(entry.name)).toSorted((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))) {
    const bin = bins.reduce((best, candidate) => candidate.seconds < best.seconds ? candidate : best)
    bin.seconds += entry.weight
    bin.names.push(entry.name)
  }
  return bins
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
  const bins = plannedBins(timings, directory, platform)
  if (bins.length !== shards) {
    console.error(`shard count ${shards} does not match the plan (${bins.length})`)
    process.exit(1)
  }
  const mine = bins[selected - 1]
  if (!mine || mine.names.length === 0) {
    console.error(`shard ${selected}/${shards} has no test files`)
    process.exit(1)
  }
  console.error(`shard ${selected}/${shards}: ${mine.names.length} files, ~${Math.round(mine.seconds)}s`)
  console.log(mine.names.toSorted().join("\n"))
}

function plan(timings: Timings) {
  // Validate the current Desktop discovery and all three real controls before emitting matrix entries.
  desktopBins(timings, "linux")
  desktopBins(timings, "windows")
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

export function coreShards(name: Platform, host: string, count: number) {
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
// whose one generator test takes about 210 / 294 s and so gets a lane of its own. `@orchestra/relay` has its own turbo
// lane on both platforms: its package tests took over 6 minutes inside the libs complement. The libs lane is the
// complement of every claimed package, so a package added later lands in it instead of in no lane. Repo-wide gates and
// the Relay pytest suite are not package tests: they share the Linux gates lane and share it with no bulk package (the
// lane that carried them with the other packages ran past the 10-minute limit). The legacy rollback proof rides in the
// Windows atlas lane beside the process query proof, for the same reason.
export function packageLanes(name: Platform, host: string) {
  const linux = name === "linux"
  const claimed = ["core", "cli", "app", "server", "sdk-next", "client", "tui", "session-ui", "atlas-boundary", "relay", "desktop", ...(linux ? [] : ["script"])].map((entry) => `@orchestra/${entry}`)
  // httpapi-codegen is a build-time generator whose tests pin POSIX paths, so it runs on Linux only.
  const excluded = name === "windows" ? [...claimed, "@orchestra/httpapi-codegen"] : claimed
  const filters = (packages: string[]) => packages.map((entry) => `--filter=@orchestra/${entry}`).join(" ")
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
    lane("relay", "relay", "--filter=@orchestra/relay"),
    ...[1, 2, 3].map((index) => lane(`desktop-bun-${index}`, `desktop Bun ${index}/3`, filters(["desktop"]), { desktop: "bun", desktopShard: `${index}/3`, electron: linux })),
    lane("desktop-node", "desktop Node", filters(["desktop"]), { desktop: "node", electron: linux }),
    // Windows script remains separate from the libs lane.
    ...(linux ? [] : [
      lane("script", "script", filters(["script"]), { budget: 15 }),
    ]),
    lane("libs", "other packages", excluded.map((entry) => `--filter=!${entry}`).join(" "), {
      electron: linux,
      // The Windows lane left past the step's 8 minutes without assertions; the workflow gives that one a 12/15 budget.
      ...(linux ? {} : { budget: 15 }),
    }),
    ...(linux
      ? [
          { name, host, part: "gates", label: "gates, relay", repo_gates: true, relay: true },
          ...[1, 2].map((index) => ({
            name,
            host,
            part: `httpapi-${index}`,
            label: `httpapi ${index}/2`,
            httpapi: true,
            httpapiShard: `${index}/2`,
          })),
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

// Folds the JUnit reports of a cold run (artifacts `junit-<os>-<part>`, files `<os>-<part>.xml` and the Windows
// watcher process's `<os>-<part>-watcher.xml`) into the per-file times and the per-platform totals of test-timings.json.
function refresh(timings: Timings, directory: string | undefined) {
  if (!directory) {
    console.error("usage: test-plan.ts refresh <junit directory>")
    process.exit(2)
  }
  const reports = (readdirSync(directory, { recursive: true }) as string[]).filter((file) =>
    /(^|[\\/])(linux|windows)-(?:core-\d+(?:-watcher)?|(?:packages|windows)-desktop-bun-\d+)\.xml$/.test(file),
  )
  if (reports.length === 0) {
    console.error(`no Core or Desktop JUnit report under ${directory}`)
    process.exit(1)
  }
  const measured = new Map<string, Record<string, number>>()
  for (const report of reports) {
    const platform = path.basename(report).startsWith("linux") ? "linux" : "windows"
    const packageDirectory = path.basename(report).includes("desktop-bun-") ? "apps/desktop" : "packages/core"
    const key = `${packageDirectory}:${platform}`
    const files = measured.get(key) ?? {}
    for (const [file, seconds] of suiteTimes(readFileSync(path.join(directory, report), "utf8"))) files[file] = Number(seconds.toFixed(2))
    measured.set(key, files)
  }
  for (const [key, files] of measured) {
    const platform = key.endsWith("linux") ? "linux" : "windows"
    timings.files[key] = Object.fromEntries(Object.entries(files).toSorted(([a], [b]) => a.localeCompare(b)))
    const packageDirectory = key.slice(0, key.lastIndexOf(":"))
    const total = timings.totals[packageDirectory] ?? { linux: 0, windows: 0 }
    total[platform] = Math.round(Object.values(files).reduce((sum, seconds) => sum + seconds, 0))
    timings.totals[packageDirectory] = total
  }
  writeFileSync(timingsFile, JSON.stringify(timings, null, 2) + "\n")
  console.error(`refreshed ${[...measured.keys()].join(", ")} from ${reports.length} reports`)
}
