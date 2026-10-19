#!/usr/bin/env node
// OWN-SNAPSHOT is Genesis-owned source of truth for static Own skills. This gate recomposes every byte;
// receipts never certify themselves. It rejects missing/empty snapshots, output drift, stale source blobs,
// and files outside snapshot projection. It does not judge fact quality.
// `--worklist <file>` (R9, D24) also writes the deterministic stale-source worklist — {units: [{unit, stale: [path]}]},
// sorted — as soon as the snapshot parses, so a repair run (`atlas repair --worklist`) has its input even when the
// gate then fails. The verdict and exit code are the same with or without it.

import { execFileSync } from "node:child_process"
import { existsSync, lstatSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { pathToFileURL, fileURLToPath } from "node:url"
import { atlasRevisionSource } from "../../scripts/git-source-root.mjs"

const ROOT = process.env.OWN_SNAPSHOT_GUARD_ROOT ?? join(fileURLToPath(new URL("../..", import.meta.url)))
const SNAPSHOT_REL = "OWN-SNAPSHOT.json"
const SKILLS_REL = join(".orchestra", "skills", "own")
const SNAPSHOT = join(ROOT, SNAPSHOT_REL)
const SKILLS = join(ROOT, SKILLS_REL)
const IMPLEMENTATION =
  process.env.OWN_SNAPSHOT_GUARD_IMPL ?? join(ROOT, "packages", "retrieval", "dist", "src", "own-snapshot.js")

function files(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const path = join(dir, entry.name)
    const stat = lstatSync(path)
    if (stat.isDirectory()) out.push(...files(path))
    else if (stat.isFile()) out.push({ path: relative(ROOT, path), content: readFileSync(path, "utf8") })
    else fail([`static Own tree contains symlink or special entry: ${relative(ROOT, path)}`])
  }
  return out
}

function git(args) {
  return execFileSync("git", ["--no-replace-objects", "-C", ROOT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

function currentBlob(path) {
  try {
    return git(["hash-object", "--", path]).trim()
  } catch {
    return undefined
  }
}

function revisionBlob(source, path) {
  try {
    return git(["rev-parse", `${source.revision}:${source.prefix ? `${source.prefix}/` : ""}${path}`]).trim()
  } catch {
    return undefined
  }
}

function fail(issues) {
  console.error("own-snapshot-guard: FAIL\n")
  for (const issue of issues) console.error(`  ✗ ${issue}`)
  process.exit(1)
}

// The only argument form: none, or exactly `--worklist <file>`. Anything else is a usage failure, not ignored.
const argv = process.argv.slice(2)
if (!(argv.length === 0 || (argv.length === 2 && argv[0] === "--worklist" && argv[1] !== "" && !argv[1].startsWith("-")))) {
  fail(["usage: own-snapshot-guard [--worklist <file>]"])
}
const WORKLIST = argv.length === 2 ? resolve(process.cwd(), argv[1]) : undefined

function regularFile(path) {
  try {
    return lstatSync(join(ROOT, path)).isFile()
  } catch {
    return false
  }
}

if (!existsSync(SNAPSHOT)) fail([`missing ${SNAPSHOT_REL}; no static Own projection oracle exists`])
if (!existsSync(IMPLEMENTATION))
  fail([
    `missing compiled Own snapshot contract: ${relative(ROOT, IMPLEMENTATION)}; run npm run typecheck before this gate`,
  ])

let contract
try {
  contract = await import(pathToFileURL(IMPLEMENTATION).href)
} catch (error) {
  fail([`cannot load compiled Own snapshot contract: ${error instanceof Error ? error.message : String(error)}`])
}

const snapshot = contract.parseOwnSnapshot(readFileSync(SNAPSHOT, "utf8"))
if (snapshot === undefined) fail([`${SNAPSHOT_REL} is malformed, empty, or has invalid units/source blobs`])
if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.sourceRevision))
  fail([`snapshot sourceRevision is not an immutable lowercase full Git OID: ${snapshot.sourceRevision}`])

if (WORKLIST !== undefined) {
  const units = snapshot.units
    .map((entry) => ({
      unit: entry.unit.id,
      stale: Object.entries(entry.sourceBlobs)
        .filter(([path, blob]) => !regularFile(path) || currentBlob(path) !== blob)
        .map(([path]) => path)
        .sort(),
    }))
    .filter((entry) => entry.stale.length > 0)
    .sort((a, b) => (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0))
  writeFileSync(WORKLIST, `${JSON.stringify({ units }, null, 2)}\n`)
  console.log(`own-snapshot-guard: worklist — ${units.length} stale unit(s) written to ${WORKLIST}`)
}

try {
  execFileSync("git", ["--no-replace-objects", "-C", ROOT, "cat-file", "-e", `${snapshot.sourceRevision}^{commit}`], { stdio: "ignore" })
  execFileSync("git", ["--no-replace-objects", "-C", ROOT, "merge-base", "--is-ancestor", snapshot.sourceRevision, "HEAD"], { stdio: "ignore" })
} catch {
  fail([`snapshot sourceRevision is not a Git commit reachable from HEAD: ${snapshot.sourceRevision}`])
}

const source = atlasRevisionSource(snapshot.sourceRevision, git)
const revisionIssues = []
for (const entry of snapshot.units) {
  for (const [path, blob] of Object.entries(entry.sourceBlobs)) {
    try {
      if (!lstatSync(join(ROOT, path)).isFile()) {
        revisionIssues.push(`source anchor is not a regular file: ${entry.unit.id} -> ${path}`)
        continue
      }
    } catch {
      revisionIssues.push(`source anchor is not a regular file: ${entry.unit.id} -> ${path}`)
      continue
    }
    if (revisionBlob(source, path) !== blob) {
      revisionIssues.push(`snapshot revision blob drift: ${entry.unit.id} -> ${path}`)
    }
  }
}
if (revisionIssues.length > 0) fail(revisionIssues)

const result = contract.verifyStaticOwnSnapshot(snapshot, files(SKILLS), currentBlob)
if (result.status === "HOLD") fail(result.issues)

console.log(
  `own-snapshot-guard: OK — ${snapshot.units.length} Genesis unit(s), ${files(SKILLS).length} static Own file(s), source blobs fresh. Snapshot facts/units/blobs exactly recompose committed skills.`,
)
