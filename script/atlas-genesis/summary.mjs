// Render the Atlas genesis run's job summary, and write each arm's frontier as a TSV beside its output.
//
// Usage: node script/atlas-genesis/summary.mjs <out-dir>
// <out-dir> holds `doctor-index.txt` and, per arm, `arm-<arm>.txt` (the `atlas mine` stdout) and
// `arm-<arm>.code` (its exit code). Writes `frontier-<arm>.tsv` (rank, outcome, kind, path — every PLANNED
// site, i.e. the ranked frontier the run was cut from, read off the `site:` ledger rows) and prints Markdown.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const dir = process.argv[2]
if (dir === undefined) {
  console.error("usage: summary.mjs <out-dir>")
  process.exit(1)
}

const read = (name) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "")
const match = (text, re) => re.exec(text)?.[1]

const arms = readdirSync(dir)
  .flatMap((f) => (/^arm-(.+)\.txt$/.exec(f) ? [/^arm-(.+)\.txt$/.exec(f)[1]] : []))
  .sort()

const armRows = arms.map((arm) => {
  const out = read(`arm-${arm}.txt`)
  const sites = out
    .split("\n")
    .filter((l) => l.startsWith("site: "))
    .flatMap((l) => {
      try {
        return [JSON.parse(l.slice("site: ".length))]
      } catch {
        return []
      }
    })
  writeFileSync(
    join(dir, `frontier-${arm}.tsv`),
    ["rank\toutcome\tkind\tpath", ...sites.map((s) => `${s.rank}\t${s.outcome}\t${s.kind ?? ""}\t${s.path ?? ""}`)].join("\n") +
      "\n",
  )
  return {
    arm,
    code: read(`arm-${arm}.code`).trim() || "?",
    planned: sites.length,
    visited: match(out, /budgetSpent (\d+)/) ?? "?",
    seeded: match(out, /genesis: seeded (\d+)/) ?? "?",
    quarantine: match(out, /^quarantine: (\d+)/m) ?? "0",
    partial: match(out, /^partial: (.*)$/m) ?? "",
    coverage: match(out, /^coverage: (.*)$/m) ?? "",
  }
})

const doctor = read("doctor-index.txt")
const lines = [
  "## Atlas genesis",
  "",
  "### Index (`atlas doctor index`)",
  "",
  "```",
  ...doctor
    .split("\n")
    .filter((l) => l.startsWith("scip:") || l.startsWith("lang:") || l.startsWith("  run:")),
  "```",
  "",
  "### Excluded from the frontier (the site filter this run applied)",
  "",
  // The rules come from `atlas doctor index`, which prints the defaults and `.atlas/mine-exclude` in force.
  ...doctor
    .split("\n")
    .filter((l) => l.startsWith("sites:"))
    .map((l) => `- ${l.slice("sites:".length).trim()}`),
  "- coverage: Python is indexed for `modules/relay/lib` only, Rust for `native/omni` only",
  "",
  "### Arms",
  "",
  "| arm | exit | planned sites | visited | candidates (seeded) | quarantined | partial |",
  "| --- | ---- | ------------- | ------- | ------------------- | ----------- | ------- |",
  ...armRows.map(
    (r) =>
      `| ${r.arm} | ${r.code} | ${r.planned} | ${r.visited} | ${r.seeded} | ${r.quarantine} | ${r.partial.replace(/\|/g, "\\|")} |`,
  ),
  "",
  "`seeded` counts what this run staged; a re-run over the same commit seeds 0 for candidates already staged.",
  "Exit 1 is a partial pass (the per-arm budget was reached). Each arm's ranked frontier is in `frontier-<arm>.tsv`.",
]
console.log(lines.join("\n"))
