#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { randomUUID } from "node:crypto"

const ROOT = process.cwd()
const SNAPSHOT_TARGET = join(ROOT, "OWN-SNAPSHOT.json")
const SKILLS_TARGET = join(ROOT, ".opencode", "skills", "own")
const IMPLEMENTATION =
  process.env.OWN_SNAPSHOT_MATERIALIZE_IMPL ?? join(ROOT, "packages", "retrieval", "dist", "src", "own-snapshot.js")
const OWN_ROOT = ".opencode/skills/own/"

function fail(message) {
  console.error(`materialize-own-snapshot: ${message}`)
  process.exit(1)
}

function hasPath(path, stat = lstatSync) {
  try {
    stat(path)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") return false
    throw error
  }
}

/** Two-path replacement has rollback semantics, but cannot be crash-atomic across both renames. */
export function replaceOwnTargets(paths, operations = {}) {
  const rename = operations.renameSync ?? renameSync
  const remove = operations.rmSync ?? rmSync
  const stat = operations.lstatSync ?? lstatSync
  let snapshotBackedUp = false
  let skillsBackedUp = false
  let snapshotInstalled = false
  let skillsInstalled = false

  try {
    if (hasPath(paths.snapshotTarget, stat)) {
      rename(paths.snapshotTarget, paths.snapshotBackup)
      snapshotBackedUp = true
    }
    if (hasPath(paths.skillsTarget, stat)) {
      rename(paths.skillsTarget, paths.skillsBackup)
      skillsBackedUp = true
    }
    rename(paths.snapshotTemp, paths.snapshotTarget)
    snapshotInstalled = true
    rename(paths.skillsTemp, paths.skillsTarget)
    skillsInstalled = true
  } catch (replacementError) {
    const rollbackIssues = []
    try {
      if (snapshotInstalled) remove(paths.snapshotTarget, { recursive: true, force: true })
      if (snapshotBackedUp) rename(paths.snapshotBackup, paths.snapshotTarget)
    } catch (error) {
      rollbackIssues.push(`snapshot rollback failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      if (skillsInstalled) remove(paths.skillsTarget, { recursive: true, force: true })
      if (skillsBackedUp) rename(paths.skillsBackup, paths.skillsTarget)
    } catch (error) {
      rollbackIssues.push(`skills rollback failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    const detail = replacementError instanceof Error ? replacementError.message : String(replacementError)
    throw new Error(
      `replacement failed: ${detail}${rollbackIssues.length === 0 ? "" : `; ${rollbackIssues.join("; ")}`}`,
    )
  }

  const cleanupWarnings = []
  for (const [backedUp, path, label] of [
    [snapshotBackedUp, paths.snapshotBackup, "snapshot"],
    [skillsBackedUp, paths.skillsBackup, "skills"],
  ]) {
    if (!backedUp) continue
    try {
      remove(path, { recursive: true, force: true })
    } catch (error) {
      cleanupWarnings.push(`${label} backup cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return cleanupWarnings
}

function containsAtlasDirectory(path) {
  return resolve(path).split(sep).includes(".atlas")
}

function git(args) {
  return execFileSync("git", ["-C", ROOT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function revisionBlob(revision, path) {
  try {
    return git(["rev-parse", `${revision}:./${path}`])
  } catch {
    return undefined
  }
}

function currentBlob(path) {
  try {
    return git(["hash-object", "--", path])
  } catch {
    return undefined
  }
}

async function main() {
  if (process.argv.length !== 3) {
    fail("usage: node scripts/materialize-own-snapshot.mjs <reviewed-snapshot.json>")
  }

  const inputArg = process.argv[2]
  const lexicalInput = isAbsolute(inputArg) ? resolve(inputArg) : resolve(ROOT, inputArg)
  if (containsAtlasDirectory(lexicalInput)) fail("refusing snapshot input inside .atlas")

  let input
  try {
    input = realpathSync(lexicalInput)
  } catch (error) {
    fail(`cannot read snapshot input: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (containsAtlasDirectory(input)) fail("refusing snapshot input inside .atlas")

  let contract
  try {
    contract = await import(pathToFileURL(IMPLEMENTATION).href)
  } catch (error) {
    fail(`cannot load compiled Own snapshot contract: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (
    typeof contract.parseOwnSnapshot !== "function" ||
    typeof contract.exportOwnSnapshot !== "function" ||
    typeof contract.materializeStaticOwnSnapshot !== "function"
  ) {
    fail("compiled Own snapshot contract lacks required exports")
  }

  let inputBytes
  try {
    inputBytes = readFileSync(input, "utf8")
  } catch (error) {
    fail(`cannot read snapshot input: ${error instanceof Error ? error.message : String(error)}`)
  }
  const parsed = contract.parseOwnSnapshot(inputBytes)
  if (parsed === undefined) fail("reviewed snapshot is malformed, empty, or has invalid units/source blobs")
  let snapshot
  try {
    snapshot = contract.exportOwnSnapshot({
      snapshot: parsed.snapshot,
      sourceRevision: parsed.sourceRevision,
      units: parsed.units,
    })
  } catch (error) {
    fail(`reviewed snapshot export rejected: ${error instanceof Error ? error.message : String(error)}`)
  }
  const snapshotBytes = `${JSON.stringify(snapshot, null, 2)}\n`

  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(snapshot.sourceRevision)) {
    fail(`sourceRevision is not an immutable lowercase full Git OID: ${snapshot.sourceRevision}`)
  }

  try {
    git(["cat-file", "-e", `${snapshot.sourceRevision}^{commit}`])
    git(["merge-base", "--is-ancestor", snapshot.sourceRevision, "HEAD"])
  } catch {
    fail(`sourceRevision is not a Git commit ancestor of HEAD: ${snapshot.sourceRevision}`)
  }

  const anchorIssues = []
  for (const entry of snapshot.units) {
    for (const [path, blob] of Object.entries(entry.sourceBlobs)) {
      if (path.split("/").includes(".atlas")) {
        anchorIssues.push(`refusing .atlas source anchor: ${entry.unit.id} -> ${path}`)
        continue
      }
      try {
        if (!lstatSync(join(ROOT, path)).isFile()) {
          anchorIssues.push(`source anchor is not a regular file: ${entry.unit.id} -> ${path}`)
          continue
        }
      } catch {
        anchorIssues.push(`source anchor is not a regular file: ${entry.unit.id} -> ${path}`)
        continue
      }
      if (revisionBlob(snapshot.sourceRevision, path) !== blob) {
        anchorIssues.push(`snapshot revision blob mismatch: ${entry.unit.id} -> ${path}`)
      }
      if (currentBlob(path) !== blob) {
        anchorIssues.push(`current source blob mismatch: ${entry.unit.id} -> ${path}`)
      }
    }
  }
  if (anchorIssues.length > 0) fail(anchorIssues.sort().join("\n"))

  let output
  try {
    output = contract.materializeStaticOwnSnapshot(snapshot)
  } catch (error) {
    fail(
      `compiled Own snapshot contract refused materialization: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const files = [...output.skills, output.coverage]
  const seen = new Set()
  for (const file of files) {
    if (typeof file?.path !== "string" || typeof file?.content !== "string" || !file.path.startsWith(OWN_ROOT)) {
      fail("compiled Own snapshot contract produced invalid output path or content")
    }
    const suffix = file.path.slice(OWN_ROOT.length)
    if (suffix.length === 0 || suffix.split("/").some((part) => part === "" || part === "." || part === "..")) {
      fail(`compiled Own snapshot contract produced unsafe output path: ${file.path}`)
    }
    if (seen.has(file.path)) fail(`compiled Own snapshot contract produced duplicate output path: ${file.path}`)
    seen.add(file.path)
  }

  const nonce = `${process.pid}-${randomUUID()}`
  const snapshotTemp = join(dirname(SNAPSHOT_TARGET), `.OWN-SNAPSHOT.json.tmp-${nonce}`)
  const snapshotBackup = join(dirname(SNAPSHOT_TARGET), `.OWN-SNAPSHOT.json.bak-${nonce}`)
  const skillsParent = dirname(SKILLS_TARGET)
  const skillsTemp = join(skillsParent, `.own.tmp-${nonce}`)
  const skillsBackup = join(skillsParent, `.own.bak-${nonce}`)
  let transactionError
  let cleanupWarnings = []

  try {
    mkdirSync(skillsParent, { recursive: true })
    writeFileSync(snapshotTemp, snapshotBytes, { flag: "wx" })
    mkdirSync(skillsTemp)
    for (const file of files) {
      const destination = join(skillsTemp, ...file.path.slice(OWN_ROOT.length).split("/"))
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, file.content, { flag: "wx" })
    }
    cleanupWarnings = replaceOwnTargets({
      snapshotTarget: SNAPSHOT_TARGET,
      skillsTarget: SKILLS_TARGET,
      snapshotTemp,
      skillsTemp,
      snapshotBackup,
      skillsBackup,
    })
  } catch (error) {
    transactionError = error instanceof Error ? error.message : String(error)
  } finally {
    rmSync(snapshotTemp, { recursive: true, force: true })
    rmSync(skillsTemp, { recursive: true, force: true })
  }

  if (transactionError !== undefined) fail(transactionError)
  for (const warning of cleanupWarnings) console.warn(`materialize-own-snapshot: warning: ${warning}`)

  console.log(
    `materialize-own-snapshot: wrote ${relative(ROOT, SNAPSHOT_TARGET)} and ${files.length} file(s) under ${relative(ROOT, SKILLS_TARGET)}; replacement uses transactional rollback, not crash-atomic commit`,
  )
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
