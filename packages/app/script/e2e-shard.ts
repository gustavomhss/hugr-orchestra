// Prints the Playwright spec files of one CI shard, one per line, balanced by measured duration.
// `playwright test --shard` splits by file count, which left one shard with about 40% more work than another.
// Timings live in e2e-timings.json (seconds per spec on the Linux CI runner); specs without a timing weigh the median.
//
// Shard:   bun script/e2e-shard.ts <shard> <shards>
// Refresh: rebuild e2e-timings.json from the per-test timestamps in the e2e job logs (one worker per shard, so the gap
//          between consecutive test starts is that test's duration).
import path from "path"

const timings: Record<string, number> = await Bun.file(path.join(import.meta.dir, "e2e-timings.json")).json()
const shard = Number(process.argv[2])
const shards = Number(process.argv[3])
if (!(shard >= 1 && shard <= shards)) {
  console.error("usage: bun script/e2e-shard.ts <shard> <shards>")
  process.exit(1)
}

// Mirrors playwright.config.ts: spec and test files under e2e/, except e2e/performance.
const files = (
  await Array.fromAsync(
    new Bun.Glob("e2e/**/*.{spec,test}.{ts,tsx,js,mjs}").scan({ cwd: path.join(import.meta.dir, ".."), onlyFiles: true }),
  )
)
  .map((file) => file.replaceAll("\\", "/"))
  .filter((file) => !file.startsWith("e2e/performance/"))
  .toSorted()
const known = files.map((file) => timings[file]).filter((seconds) => seconds !== undefined)
const median = known.toSorted((a, b) => a - b)[Math.floor(known.length / 2)] ?? 1
const bins = Array.from({ length: shards }, () => ({ seconds: 0, files: [] as string[] }))
// Longest-processing-time first: each spec goes to the currently lightest shard.
for (const file of files.toSorted((a, b) => (timings[b] ?? median) - (timings[a] ?? median) || a.localeCompare(b))) {
  const bin = bins.reduce((lightest, candidate) => (candidate.seconds < lightest.seconds ? candidate : lightest))
  bin.seconds += timings[file] ?? median
  bin.files.push(file)
}

const selected = bins[shard - 1]
if (selected.files.length === 0) {
  console.error(`shard ${shard}/${shards} has no spec files`)
  process.exit(1)
}
console.error(`shard ${shard}/${shards}: ${selected.files.length} of ${files.length} specs, ~${Math.round(selected.seconds)}s`)
console.log(selected.files.join("\n"))
