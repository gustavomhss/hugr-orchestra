export * as ReviewOsvFacts from "./osv-facts"

import path from "path"
import { stat } from "fs/promises"
import { Effect } from "effect"
import { Global } from "../global"

// Design §7.3 and D7. The review argv and the host-refresh argv are both closed at tag v2.7.1.
// The review never downloads. The refresh is a different command, against a host directory, not the review copy.

export const DATABASE_ABSENT = "not run: osv advisory database absent"
export const DATABASE_AGE = "osv database age: "

const LOCKFILE = {
  "bun.lock": "npm",
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "npm",
  "yarn.lock": "npm",
  "Cargo.lock": "crates.io",
  "uv.lock": "PyPI",
  "poetry.lock": "PyPI",
  "pylock.toml": "PyPI",
  "go.sum": "Go",
} as const

/** Closed review argv. No `fix`, no download flag. */
export function argv(bin: string, root: string) {
  return [bin, "scan", "source", "-r", root, "--offline"]
}

/**
 * Closed host-refresh argv from the v2.7.1 offline-mode page.
 * The path is a host directory, never the review copy. `fix` is never included.
 */
export function refreshArgv(bin: string, dir: string) {
  return [bin, "--offline-vulnerabilities", "--download-offline-databases", dir]
}

export function databaseDir() {
  return path.join(Global.Path.cache, "osv-scanner")
}

export function refreshTarget() {
  return path.join(Global.Path.cache, "osv-scanner-refresh")
}

export function lockfiles(changed: readonly string[]) {
  return changed.filter(lockfile).sort()
}

export function ecosystems(changed: readonly string[]) {
  return [...new Set(lockfiles(changed).map((file) => LOCKFILE[path.posix.basename(file) as keyof typeof LOCKFILE]))].sort()
}

export function cardReason(reason: string | undefined, age: string | undefined) {
  if (age === undefined || reason === DATABASE_ABSENT) return reason
  const stamp = `${DATABASE_AGE}${age}`
  return reason === undefined ? stamp : `${reason}; ${stamp}`
}

export function databaseAgeIso(mtimes: readonly number[]) {
  if (mtimes.length === 0) return undefined
  return new Date(Math.min(...mtimes)).toISOString()
}

export const databaseReady = Effect.fn("ReviewOsvFacts.databaseReady")(function* (dir: string, required: readonly string[]) {
  if (required.length === 0) return false
  const hits = yield* Effect.promise(() => Promise.all(required.map((name) => zip(dir, name).then(Boolean))))
  return hits.every(Boolean)
})

export const databaseAge = Effect.fn("ReviewOsvFacts.databaseAge")(function* (dir: string, required: readonly string[]) {
  const times = yield* Effect.promise(() => Promise.all(required.map((name) => zip(dir, name))))
  return databaseAgeIso(times.filter((time): time is number => time !== undefined))
})

function lockfile(file: string) {
  return !file.split("/").includes("..") && !file.includes("\0") && path.posix.basename(file) in LOCKFILE
}

async function zip(dir: string, ecosystem: string) {
  if (!ecosystem || ecosystem.includes("/") || ecosystem.includes("\0")) return undefined
  const file = path.join(dir, "osv-scalibr", ecosystem, "all.zip")
  const info = await stat(file).catch(() => undefined)
  return info?.isFile() ? info.mtimeMs : undefined
}
