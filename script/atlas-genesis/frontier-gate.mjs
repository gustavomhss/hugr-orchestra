// The automated frontier gate for an Atlas genesis run (genesis-hardening S10, owner decision: no human in the
// volume loop). Each arm's ranked frontier must be overwhelmingly hand-written source; if it is not, the site
// filter or the index broke, and spending model calls on it would mine tests, generated code and docs.
//
// Usage: node script/atlas-genesis/frontier-gate.mjs <out-dir> [--summary <file>]
// Reads every `frontier-<arm>.tsv` (rank, outcome, kind, path) in <out-dir>, written by summary.mjs.
//
// THE CLASSIFIER IS DELIBERATELY ITS OWN. It does not import the CLI's site filter (adapter-io site-filter.ts):
// this is an independent check of what that filter let through, so sharing its rules would make it agree with
// itself. A site counts as hand-written when its file is `.ts/.tsx/.mts/.cts`, `.py` or `.rs` and matches none
// of the exclusion classes below (which include `.d.ts` declarations and `node_modules/`, `dist/`, `target/`,
// `build/` output). An arm with at least one planned site fails when fewer than 85% of its top
// min(200, planned) sites are hand-written; an arm with an empty frontier fails outright. Python or Rust
// absent from every arm's top sites is a warning, not a failure.
import { existsSync, readdirSync, readFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

export const THRESHOLD = 0.85
export const TOP = 200

const LOCKFILES = new Set([
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.lock",
  "uv.lock",
  "poetry.lock",
])

/** Exclusion classes, first match wins. Each is a name and a test over the repo-relative FILE path. */
const CLASSES = [
  ["modules/atlas", (p) => p.startsWith("modules/atlas/")],
  ["native/omni/qa", (p) => p.startsWith("native/omni/qa/")],
  ["build output", (p) => /(^|\/)(node_modules|dist|target|build)\//.test(p)],
  ["declaration", (p) => /\.d\.[cm]?ts$/.test(p)],
  ["lockfile", (p) => LOCKFILES.has(p.slice(p.lastIndexOf("/") + 1))],
  ["e2e", (p) => /(^|\/)e2e[^/]*\//.test(p)],
  ["fixture", (p) => /(^|\/)fixtures?[^/]*\//.test(p)],
  ["benches", (p) => /(^|\/)benches\//.test(p)],
  [
    "test",
    (p) =>
      /(^|\/)(test|tests|__tests__)\//.test(p) ||
      /\.(test|spec)\.[^/]+$/.test(p) ||
      /(^|\/)test_[^/]*\.py$/.test(p) ||
      /_test\.py$/.test(p),
  ],
  ["generated", (p) => /(^|\/)(generated[^/]*|__generated__)\//.test(p) || /\.generated\.[^/]+$/.test(p)],
  ["stories", (p) => /\.stories\.[^/]+$/.test(p)],
  ["docs", (p) => p.startsWith("docs/") || /\.(md|mdx|json)$/.test(p)],
]

const LANGUAGE = { ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript", py: "Python", rs: "Rust" }

/** Classify one site path (a `file::unit` site is judged by its file). */
export function classify(sitePath) {
  const file = sitePath.split("::")[0]
  const ext = /\.([^./]+)$/.exec(file)?.[1] ?? ""
  const language = LANGUAGE[ext] ?? "other"
  const excluded = CLASSES.find(([, test]) => test(file))?.[0]
  if (excluded !== undefined) return { language, class: excluded, handWritten: false }
  if (language === "other") return { language, class: "not source", handWritten: false }
  return { language, class: "source", handWritten: true }
}

/** Parse a frontier TSV into rank-ordered paths. */
export function parseFrontier(tsv) {
  return tsv
    .split("\n")
    .slice(1)
    .filter((l) => l.trim().length > 0)
    .map((l) => {
      const [rank, , , path] = l.split("\t")
      return { rank: Number(rank), path: path ?? "" }
    })
    .sort((a, b) => a.rank - b.rank)
    .map((s) => s.path)
}

/**
 * Evaluate every arm. `arms` is `[{ arm, tsv }]`. Returns whether the gate passed, the Markdown for the job
 * summary, and the warning/error lines (plain text; the CLI prefixes the workflow commands).
 */
export function evaluate(arms) {
  const errors = []
  const warnings = []
  const md = ["### Frontier gate", ""]
  const languages = { TypeScript: 0, Python: 0, Rust: 0, other: 0 }
  if (arms.length === 0) errors.push("no frontier file was written: no arm ran, or summary.mjs did not run")

  const rows = arms.map(({ arm, tsv }) => {
    const top = parseFrontier(tsv).slice(0, TOP).map(classify)
    for (const c of top) languages[c.language] += 1
    if (top.length === 0) {
      errors.push(`arm ${arm}: empty frontier — on this repository that means indexing or the site filter broke`)
      return `| ${arm} | 0 | — | FAIL (empty) |`
    }
    const share = top.filter((c) => c.handWritten).length / top.length
    if (share < THRESHOLD) {
      const byClass = new Map()
      parseFrontier(tsv)
        .slice(0, TOP)
        .forEach((path) => {
          const c = classify(path)
          if (c.handWritten) return
          byClass.set(c.class, [...(byClass.get(c.class) ?? []), path])
        })
      const offenders = [...byClass]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([cls, paths]) => `${cls} ${paths.length} (e.g. ${paths.slice(0, 5).join(", ")})`)
      errors.push(
        `arm ${arm}: ${(share * 100).toFixed(1)}% of the top ${top.length} sites are hand-written source ` +
          `(needs ${THRESHOLD * 100}%). Offending classes: ${offenders.join("; ")}`,
      )
    }
    return `| ${arm} | ${top.length} | ${(share * 100).toFixed(1)}% | ${share < THRESHOLD ? "FAIL" : "pass"} |`
  })

  md.push("| arm | top sites | hand-written | gate |", "| --- | --------- | ------------ | ---- |", ...rows, "")
  const total = Object.values(languages).reduce((a, b) => a + b, 0)
  const pct = (n) => (total === 0 ? "0.0%" : `${((n / total) * 100).toFixed(1)}%`)
  md.push(
    "| language | top sites | share |",
    "| -------- | --------- | ----- |",
    ...Object.entries(languages).map(([lang, n]) => `| ${lang} | ${n} | ${pct(n)} |`),
    "",
  )
  for (const lang of ["Python", "Rust"])
    if (total > 0 && languages[lang] === 0) warnings.push(`no ${lang} site reached any arm's top ${TOP}`)
  md.push(...errors.map((e) => `- **FAIL** ${e}`), ...warnings.map((w) => `- warning: ${w}`))
  return { ok: errors.length === 0, markdown: md.join("\n"), warnings, errors }
}

function main(argv) {
  const dir = argv[0]
  if (dir === undefined) {
    console.error("usage: frontier-gate.mjs <out-dir> [--summary <file>]")
    return 1
  }
  const summaryAt = argv.indexOf("--summary")
  const summary = summaryAt >= 0 ? argv[summaryAt + 1] : undefined
  const arms = (existsSync(dir) ? readdirSync(dir) : [])
    .flatMap((f) => {
      const m = /^frontier-(.+)\.tsv$/.exec(f)
      return m === null ? [] : [{ arm: m[1], tsv: readFileSync(join(dir, f), "utf8") }]
    })
    .sort((a, b) => (a.arm < b.arm ? -1 : 1))
  const result = evaluate(arms)
  if (summary !== undefined) appendFileSync(summary, `${result.markdown}\n`)
  else console.log(result.markdown)
  for (const w of result.warnings) console.log(`::warning::frontier gate: ${w}`)
  for (const e of result.errors) console.log(`::error::frontier gate: ${e}`)
  return result.ok ? 0 : 1
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2))
}
