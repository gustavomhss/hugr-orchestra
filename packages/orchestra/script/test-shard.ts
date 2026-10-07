// Prints the test files of one CI shard, one per line, balanced by measured duration.
// `bun test --shard` splits by file count, which left one Windows shard with twice the work of another.
// Timings live in test-timings.json, keyed by runner OS; files without a timing weigh the median.
//
// Shard:   bun script/test-shard.ts <linux|windows> <shard> <shards>
// Refresh: bun script/test-shard.ts --update <linux|windows> <junit.xml...>
//          (JUnit files come from the junit-* artifacts the test workflow uploads)
import path from "path"

const timingsFile = path.join(import.meta.dir, "test-timings.json")
const timings: Record<string, Record<string, number>> = await Bun.file(timingsFile).json()

if (process.argv[2] === "--update") {
  timings[process.argv[3]] = await readJUnit(process.argv.slice(4))
  await Bun.write(timingsFile, JSON.stringify(timings, null, 2) + "\n")
  process.exit(0)
}

const os = process.argv[2]
const shard = Number(process.argv[3])
const shards = Number(process.argv[4])
if (!timings[os] || !(shard >= 1 && shard <= shards)) {
  console.error("usage: bun script/test-shard.ts <linux|windows> <shard> <shards>")
  process.exit(1)
}

const files = await listTestFiles()
const known = files.map((file) => timings[os][file]).filter((seconds) => seconds !== undefined)
const median = known.toSorted((a, b) => a - b)[Math.floor(known.length / 2)] ?? 1
const bins = Array.from({ length: shards }, () => ({ seconds: 0, files: [] as string[] }))
// Longest-processing-time first: each file goes to the currently lightest shard.
for (const file of files.toSorted((a, b) => (timings[os][b] ?? median) - (timings[os][a] ?? median) || a.localeCompare(b))) {
  const bin = bins.reduce((lightest, candidate) => (candidate.seconds < lightest.seconds ? candidate : lightest))
  bin.seconds += timings[os][file] ?? median
  bin.files.push(file)
}

const selected = bins[shard - 1]
if (selected.files.length === 0) {
  console.error(`shard ${shard}/${shards} has no test files`)
  process.exit(1)
}
console.error(`shard ${shard}/${shards}: ${selected.files.length} of ${files.length} files, ~${Math.round(selected.seconds)}s`)
// A leading ./ makes bun treat each argument as a path rather than a substring filter.
console.log(selected.files.map((file) => `./${file}`).join("\n"))

// Mirrors bun test's discovery: these suffixes anywhere in the package, outside node_modules.
async function listTestFiles() {
  const glob = new Bun.Glob("**/*{.test,_test,.spec,_spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}")
  const files = await Array.fromAsync(glob.scan({ cwd: path.join(import.meta.dir, ".."), onlyFiles: true }))
  return files
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.split("/").includes("node_modules"))
    .toSorted()
}

async function readJUnit(reports: string[]) {
  const totals: Record<string, number> = {}
  for (const report of reports) {
    for (const testcase of (await Bun.file(report).text()).matchAll(/<testcase\b[^>]*>/g)) {
      const file = testcase[0].match(/\bfile="([^"]*)"/)?.[1]
      const seconds = Number(testcase[0].match(/\btime="([^"]*)"/)?.[1] ?? 0)
      if (!file) continue
      const key = file.replaceAll("\\", "/")
      totals[key] = (totals[key] ?? 0) + seconds
    }
  }
  return Object.fromEntries(
    Object.entries(totals)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([file, seconds]) => [file, Math.round(seconds * 100) / 100]),
  )
}
