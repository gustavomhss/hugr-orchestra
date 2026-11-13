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
  if (directory === "packages/app-shell") return platform === "windows" ? appBrowserAnchors.length : 1
  if (directory === "modules/atlas/boundary") return platform === "windows" ? 2 : 1
  if (directory === "modules/maestro/coordination") return platform === "windows" ? 2 : 1
  const total = timings.totals[directory]?.[platform]
  if (total === undefined) return 1
  const weights = weigh(directory, timings.files[`${directory}:${platform}`] ?? {}, total, UNTIMED_FLOOR, timings.reserves?.[`${directory}:${platform}`])
  const seconds = Math.round(weights.reduce((sum, entry) => sum + entry.weight, 0) * 1000) / 1000
  return shardCount(Math.max(total, seconds) * timings.overhead[platform], timings.target[platform], timings.margin)
}

// Longest-processing-time first: each item goes to the currently lightest bin. Deterministic for equal weights.
export function balance(items: { name: string; weight: number }[], bins: number, anchors: string[] = []) {
  if (anchors.length > bins || new Set(anchors).size !== anchors.length) throw new Error("Invalid shard control anchors")
  const result = Array.from({ length: bins }, (_, index) => {
    const name = anchors[index]
    if (name === undefined) return { seconds: 0, names: [] as string[] }
    const anchor = items.find((item) => item.name === name)
    if (!anchor) throw new Error(`Missing real process control: ${name}`)
    return { seconds: anchor.weight, names: [name] }
  })
  for (const item of items.filter((item) => !anchors.includes(item.name)).toSorted((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))) {
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
  if (directory === "packages/app-shell" && platform === "windows")
    return balance(weigh(directory, timings.files[`${directory}:${platform}`] ?? {}, 0, UNTIMED_FLOOR), appBrowserAnchors.length, appBrowserAnchors)
  const weights = weigh(
    directory,
    timings.files[`${directory}:${platform}`] ?? {},
    timings.totals[directory]?.[platform] ?? 0,
    UNTIMED_FLOOR,
    timings.reserves?.[`${directory}:${platform}`],
  )
  // Currency consumed half the whole Windows Maestro run. Keep it alone; ordinary anchor balancing
  // would add files to that bin, and a new file must join the complement without editing a list.
  if (directory === "modules/maestro/coordination" && platform === "windows") {
    const currency = weights.find((entry) => entry.name === "test/v2-reservation-currency.test.ts")
    const remaining = weights.filter((entry) => entry !== currency)
    if (!currency || remaining.length === 0) throw new Error("Windows Maestro requires currency and a nonempty complement")
    return [
      { seconds: currency.weight, names: [currency.name] },
      { seconds: remaining.reduce((sum, entry) => sum + entry.weight, 0), names: remaining.map((entry) => entry.name) },
    ]
  }
  return balance(weights, packageShards(timings, directory, platform))
}

export function weigh(
  directory: string,
  measured: Record<string, number>,
  total: number,
  floorOrReserves: number | Record<string, number> = 0,
  reserves: Record<string, number> = {},
) {
  const files = (directory === "apps/desktop" ? desktopFiles().bun : testFiles(path.join(root, directory), directory === "packages/app-shell" ? "test-browser" : "test")).map((file) => ({ file, bytes: statSync(path.join(root, directory, file)).size }))
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
    return [name.match(/(?:^|\/)((?:test-browser|test|src|scripts)\/.+)$/)?.[1] ?? name, Number(match[2])] as [string, number]
  })
}

// Report names carry their package identity; an unknown lane must never be folded into Core timings.
export function timingReport(report: string) {
  const name = report.replaceAll("\\", "/").split("/").at(-1) ?? ""
  const match = name.match(/^(linux|windows)-(core-\d+(?:-watcher)?|(?:packages|windows)-desktop-bun-\d+|windows-atlas-\d+|windows-app-browser-\d+|windows-maestro-\d+)\.xml$/)
  if (!match) return
  const platform: Platform = match[1] === "linux" ? "linux" : "windows"
  const part = match[2]!
  const directory = part.includes("desktop-bun-") ? "apps/desktop"
    : part.startsWith("windows-atlas-") ? "modules/atlas/boundary"
    : part.startsWith("windows-app-browser-") ? "packages/app-shell"
    : part.startsWith("windows-maestro-") ? "modules/maestro/coordination" : "packages/core"
  return { platform, directory }
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

export const appBrowserAnchors = [
  "test-browser/lean-chapter-route.test.ts", "test-browser/lean-native-product.test.ts", "test-browser/prompt-retry.test.ts",
]

function testFiles(directory: string, folder = "test") {
  return (readdirSync(path.join(directory, folder), { recursive: true }) as string[])
    .map((file) => `${folder}/${file.replaceAll("\\", "/")}`)
    .filter((file) => folder === "test-browser" ? /(?:\.test|_test|\.spec|_spec)\.[jt]sx?$/.test(file) : file.endsWith(".test.ts"))
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
  plannedBins(timings, "packages/app-shell", "windows")
  if (plannedBins(timings, "modules/atlas/boundary", "windows").some((bin) => bin.names.length === 0))
    throw new Error("Windows Boundary selected an empty shard")
  plannedBins(timings, "modules/maestro/coordination", "windows")
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

// Core is sharded by measured time above. Linux keeps its original package/proof lanes. Windows CLI, Server and
// clients have separate clocks after cold 43453802489 exhausted the combined job before CLI started. Boundary's
// dominant producer file gets one of two bins; Maestro's currency file has its own Windows bin, with all other
// Maestro files in the second. Process-query and rollback have an independent lane. Package scopes
// stay disjoint except those explicit file partitions. The libs complement still owns future packages. Relay and
// repo gates keep their existing lanes; neither shares a bulk package's clock.
export function packageLanes(name: Platform, host: string) {
  const linux = name === "linux"
  const claimed = ["core", "cli", "app", "server", "sdk-next", "client", "tui", "session-ui", "atlas-boundary", "relay", "desktop", ...(linux ? [] : ["script", "maestro"])].map((entry) => `@orchestra/${entry}`)
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
    ...(linux
      ? [lane("app", "app", filters(["app"]), { electron: linux })]
      : [
          lane("app-unit", "app unit", filters(["app"]), { appMode: "unit" }),
          ...[1, 2, 3].map((index) => lane(`app-browser-${index}`, `app browser ${index}/3`, filters(["app"]), { appMode: "browser", appBrowserShard: `${index}/3` })),
        ]),
    ...(linux
      ? [lane("cli", "cli, server, clients", filters(["cli", "server", "sdk-next", "client", "tui", "session-ui"]), { electron: linux })]
      : [
          lane("cli", "cli", filters(["cli"])),
          lane("server", "server", filters(["server"])),
          lane("clients", "clients, SDK, TUI", filters(["client", "sdk-next", "tui", "session-ui"])),
        ]),
    ...(linux
      ? [lane("atlas", "atlas boundary", filters(["atlas-boundary"]), { electron: linux, hosted: false, rollback: false })]
      : [
          ...[1, 2].map((index) => lane(`atlas-${index}`, `atlas boundary ${index}/2`, filters(["atlas-boundary"]), { boundaryShard: `${index}/2` })),
          { name, host, part: "windows-process", label: "process query, rollback", hosted: true, rollback: true },
        ]),
    lane("relay", "relay", "--filter=@orchestra/relay"),
    ...[1, 2, 3].map((index) => lane(`desktop-bun-${index}`, `desktop Bun ${index}/3`, filters(["desktop"]), { desktop: "bun", desktopShard: `${index}/3`, electron: linux })),
    lane("desktop-node", "desktop Node", filters(["desktop"]), { desktop: "node", electron: linux }),
    ...(linux ? [] : [1, 2].map((index) => lane(`maestro-${index}`, `maestro ${index}/2`, filters(["maestro"]), { maestroShard: `${index}/2` }))),
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
  const reports = (readdirSync(directory, { recursive: true }) as string[]).flatMap((file) => {
    const source = timingReport(file)
    return source ? [{ file, ...source }] : []
  })
  if (reports.length === 0) {
    console.error(`no Core, Desktop, Boundary, App browser or Maestro JUnit report under ${directory}`)
    process.exit(1)
  }
  const measured = new Map<string, Record<string, number>>()
  for (const report of reports) {
    const key = `${report.directory}:${report.platform}`
    const files = measured.get(key) ?? {}
    for (const [file, seconds] of suiteTimes(readFileSync(path.join(directory, report.file), "utf8"))) files[file] = Number(seconds.toFixed(2))
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
