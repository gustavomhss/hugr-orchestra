#!/usr/bin/env node
// godfile-guard — the standing LOC ceiling. A source file over CAP lines is a "godfile": it hides
// coupling, defeats review, and is the #1 correlate of drift. The bar Orchestra enforces on seats is
// enforced on Orchestra itself (same doctrine as ci.yml). A file over the TARGET is WARNED; a file over
// the HARD ceiling fails the build with the offending list (owner-set two-tier policy, see below).
//
// ── SCOPE, AND THE TWO HOLES THAT USED TO BE IN IT ───────────────────────────────────────────────────
// Product code under `packages/**` (`.ts`, excluding `.d.ts`) AND the harness itself under `harness/**`
// (`.mjs`). Docs (`docs/**`, `*.md`) and generated output (`dist/`, `*.d.ts`) are exempt — long specs are
// legitimate, long modules are not. The two ceilings are single tunable constants (TARGET, HARD).
//
//   UNTRACKED. The file list was `git ls-files packages`, which lists only what git has ALREADY RECORDED.
//   A brand-new 900-line module, written and never `git add`ed, was invisible: the guard printed OK, and
//   the author saw a green gate for a file the gate had not read. That is the worst direction for this
//   check to fail in, because the moment a file is most likely to be oversized is the moment it is first
//   written. `--others --exclude-standard` adds exactly the untracked-and-not-ignored set (so `dist/` and
//   `node_modules/` stay out, by .gitignore, rather than by a denylist here that would drift from it).
//
//   HARNESS. The guard walked `packages` only, so every gate in this directory — the files that enforce
//   the repo's standing bars — was itself unbarred. `layer-guard.mjs` sat at exactly 400 of 400 the day
//   this was widened. The bar the harness enforces on the product is now enforced on the harness.
//
// Both holes are one walk, and both are pinned by fixture in `godfile-guard.test.mjs`.
//
// ── WHAT IT STILL CANNOT SEE (stated so it is not mistaken for coverage) ─────────────────────────────
// Files ignored by `.gitignore` are out of scope by construction: that is how `dist/` is excluded, and it
// means an oversized module parked behind an ignore rule is not read. `scripts/`, `.github/` and `ref/`
// are outside both scope roots. And a "line" here is a `\n` split, so a file of 400 lines with a trailing
// newline measures 401 characters' worth of nothing as its 401st element — the count is INCLUSIVE of that
// empty tail, which is why a `wc -l` of 399 is a guard count of 400. That is the pre-existing convention
// and it is left alone: retuning the measurement and widening the walk in one change would make it
// impossible to say which one moved a file across the line.

import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

// Two-tier ceiling (owner-set 2026-08-12): TARGET is the bar we ASK for; HARD is the bar we ENFORCE.
// A file in (TARGET, HARD] is WARNED — over the target, still allowed — so the 400-line discipline stays
// visible without blocking work on a module that legitimately needs the slack. A file over HARD FAILS the
// build. `> TARGET` / `> HARD` are both exclusive (a file measuring exactly the number is under it).
const TARGET = 400 // the requested ceiling — exceeding it warns, never fails.
const HARD = 600 // the enforced ceiling — exceeding it fails the build.
const AUTHORIZED_WAIVER_CAPS = {
  "packages/adapter-io/src/reverify-store.ts": 705,
  "packages/cli/src/cli.ts": 625,
  "packages/genesis/src/admit-harness.ts": 660,
}

// Repo root, OVERRIDABLE so the gate's own test can point it at a fixture repo. Without this the untracked
// and harness legs could only be checked by hand against the live tree — precisely the "trust me" the gate
// exists to abolish. It also makes the root independent of CWD, which the `git ls-files` form was not.
const ROOT = process.env.GODFILE_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const WAIVERS_PATH = join(ROOT, "harness/gates/godfile-waivers.json")

let waivers
try {
  waivers = JSON.parse(readFileSync(WAIVERS_PATH, "utf8"))
  if (waivers === null || Array.isArray(waivers) || typeof waivers !== "object")
    throw new Error("top level must be an object")
} catch (e) {
  console.error(`godfile-guard: FAIL\n\n  ✗ could not read waiver ledger ${WAIVERS_PATH}: ${e.message.split("\n")[0]}`)
  process.exit(1)
}

/** Scope roots and what counts as a source file in each. */
const SCOPES = [
  { dir: "packages", include: (p) => /\.ts$/.test(p) && !/\.d\.ts$/.test(p) },
  { dir: "harness", include: (p) => /\.mjs$/.test(p) },
]

let listed
try {
  // `--cached` (tracked) ∪ `--others --exclude-standard` (untracked, not ignored). `-z` so a newline in a
  // path cannot split one entry into two.
  listed = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...SCOPES.map((s) => s.dir)],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter((p) => p !== "")
} catch (e) {
  // A gate that cannot build its file list has checked NOTHING, and must say so rather than exit 0.
  console.error(`godfile-guard: FAIL\n\n  ✗ could not list files under ${ROOT}: ${e.message.split("\n")[0]}`)
  process.exit(1)
}

const files = [...new Set(listed)].filter((p) => SCOPES.some((s) => p.startsWith(`${s.dir}/`) && s.include(p))).sort()

const offenders = [] // over HARD — fail the build
const warnings = [] // in (TARGET, HARD] — over the requested bar, allowed
const waiverErrors = []
const fileSet = new Set(files)
for (const path of Object.keys(waivers)) {
  if (!Object.hasOwn(AUTHORIZED_WAIVER_CAPS, path)) waiverErrors.push(`${path}: waiver is not owner-authorized`)
  else if (!fileSet.has(path)) waiverErrors.push(`${path}: waived file is absent or out of scope`)
}

for (const path of files) {
  let lines
  try {
    lines = readFileSync(join(ROOT, path), "utf8").split("\n").length
  } catch {
    continue // deleted-but-staged edge; skip
  }
  const waiver = waivers[path]
  if (waiver !== undefined) {
    if (
      waiver === null ||
      Array.isArray(waiver) ||
      typeof waiver !== "object" ||
      !Number.isInteger(waiver.maxLines) ||
      waiver.maxLines !== AUTHORIZED_WAIVER_CAPS[path] ||
      typeof waiver.reason !== "string" ||
      waiver.reason.trim() === ""
    ) {
      waiverErrors.push(
        `${path}: waiver needs authorized maxLines ${AUTHORIZED_WAIVER_CAPS[path]} and non-empty reason`,
      )
      continue
    }
    if (lines <= HARD) waiverErrors.push(`${path}: waiver is stale; file is now within the ${HARD}-LOC hard ceiling`)
    else if (lines > waiver.maxLines) offenders.push({ path, lines, maxLines: waiver.maxLines })
    else warnings.push({ path, lines })
  } else if (lines > HARD) offenders.push({ path, lines })
  else if (lines > TARGET) warnings.push({ path, lines })
}

if (waiverErrors.length > 0) {
  console.error("godfile-guard: FAIL\n\n  ✗ invalid waiver ledger:")
  for (const error of waiverErrors.sort()) console.error(`  ${error}`)
  process.exit(1)
}

// Warnings are printed on every run, pass or fail: the 400-line discipline stays visible even though
// exceeding it no longer blocks. Printed BEFORE the fail branch so no path reports a result without them.
if (warnings.length > 0) {
  warnings.sort((a, b) => b.lines - a.lines)
  console.log(`godfile-guard: ${warnings.length} file(s) over the ${TARGET}-LOC target (allowed, ≤${HARD}):`)
  for (const { path, lines } of warnings) console.log(`  ${lines}\t${path}`)
  console.log("")
}

if (offenders.length > 0) {
  offenders.sort((a, b) => b.lines - a.lines)
  console.error(`godfile-guard: ${offenders.length} file(s) over the ${HARD}-LOC hard ceiling:`)
  for (const { path, lines, maxLines } of offenders) {
    console.error(`  ${lines}\t${path}${maxLines === undefined ? "" : ` (waived through ${maxLines})`}`)
  }
  console.error(
    `\nSplit each into cohesive units (target ≤${TARGET}, hard limit ${HARD}), or add an owner-authorized bounded waiver ledger entry.`,
  )
  process.exit(1)
}

const per = SCOPES.map((s) => `${files.filter((p) => p.startsWith(`${s.dir}/`)).length} ${s.dir}`).join(" + ")
console.log(
  `godfile-guard: OK — ${files.length} source file(s) (${per}), tracked AND untracked, all within the ${HARD}-LOC hard ceiling or an authorized bounded waiver (target ${TARGET}).`,
)
