#!/usr/bin/env bun

import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

export const TARGET_LOC = 500
export const HARD_LIMIT_LOC = 750

const SOURCE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"])
const IGNORED_SEGMENTS = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".sst", ".turbo"])
const EXCLUDED_PREFIXES = ["foundation/atlas/"]

export type Finding = {
  file: string
  lines: number
  baseLines?: number
  kind: "target" | "legacy" | "waiver"
  reason?: string
}

export type Report = {
  checked: number
  warnings: Finding[]
  errors: string[]
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
}

function sourceFile(file: string) {
  if (EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))) return false
  if (file.split("/").some((segment) => IGNORED_SEGMENTS.has(segment))) return false
  return SOURCE_EXTENSIONS.has(file.split(".").at(-1) ?? "")
}

export function countLoc(text: string) {
  return text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0).length
}

function baseFileLoc(cwd: string, base: string, file: string) {
  try {
    git(cwd, ["cat-file", "-e", `${base}:${file}`])
    return countLoc(git(cwd, ["show", `${base}:${file}`]))
  } catch {
    return undefined
  }
}

function mergeBase(cwd: string, baseRef: string) {
  try {
    return git(cwd, ["merge-base", baseRef, "HEAD"]).trim()
  } catch {
    return undefined
  }
}

function resolveBase(cwd: string, baseRef: string) {
  const base = mergeBase(cwd, baseRef)
  if (base) return base
  try {
    return git(cwd, ["rev-parse", "--verify", `${baseRef}^{commit}`]).trim()
  } catch {
    return undefined
  }
}

type Waiver = {
  maximumLines: number
  reason: string
  authorizedBy: string
  authorizedAt: string
}

function waivers(cwd: string): { entries: Record<string, Waiver>; errors: string[] } {
  const file = resolve(cwd, "godfile-waivers.json")
  if (!existsSync(file)) return { entries: {}, errors: [] }
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as { waivers?: unknown }
    if (
      !value.waivers ||
      typeof value.waivers !== "object" ||
      Array.isArray(value.waivers) ||
      Object.keys(value.waivers).length === 0
    ) {
      return { entries: {}, errors: ["godfile-waivers.json: expected non-empty waivers object"] }
    }
    const entries = value.waivers as Record<string, Waiver>
    const errors = Object.entries(entries).flatMap(([path, entry]) => {
      if (
        !entry ||
        !Number.isSafeInteger(entry.maximumLines) ||
        entry.maximumLines <= HARD_LIMIT_LOC ||
        !entry.reason?.trim() ||
        !entry.authorizedBy?.trim() ||
        !entry.authorizedAt?.trim()
      ) {
        return [`godfile-waivers.json: invalid waiver for ${path}`]
      }
      return []
    })
    return { entries, errors }
  } catch {
    return { entries: {}, errors: ["godfile-waivers.json: invalid JSON"] }
  }
}

export function runGodfileGate(input: { cwd: string; baseRef: string }): Report {
  const base = resolveBase(input.cwd, input.baseRef)
  if (!base) {
    return {
      checked: 0,
      warnings: [],
      errors: [`Cannot resolve merge-base for ${input.baseRef}. Set GODFILE_BASE_REF to fetched target branch.`],
    }
  }

  const files = git(input.cwd, ["ls-files", "-co", "--exclude-standard", "-z"])
    .split("\0")
    .filter((file) => existsSync(resolve(input.cwd, file)))
    .filter(sourceFile)

  if (files.length === 0) {
    return { checked: 0, warnings: [], errors: ["Godfile gate discovered zero source files; refusing vacuous pass."] }
  }

  const warnings: Finding[] = []
  const errors: string[] = []
  const waiverLedger = waivers(input.cwd)
  errors.push(...waiverLedger.errors)
  const seenWaivers = new Set<string>()

  for (const file of files) {
    const lines = countLoc(readFileSync(resolve(input.cwd, file), "utf8"))
    if (lines <= TARGET_LOC) continue

    if (lines <= HARD_LIMIT_LOC) {
      warnings.push({ file, lines, kind: "target" })
      continue
    }

    const baseLines = baseFileLoc(input.cwd, base, file)
    const waiver = waiverLedger.entries[file]
    if (waiver && baseLines !== undefined) seenWaivers.add(file)
    if (baseLines !== undefined && lines <= baseLines) {
      warnings.push({ file, lines, baseLines, kind: "legacy" })
      continue
    }

    if (waiver && baseLines !== undefined) {
      if (lines <= waiver.maximumLines) {
        warnings.push({ file, lines, baseLines, kind: "waiver", reason: waiver.reason })
        continue
      }
      errors.push(`${file}: ${lines} LOC exceeds approved waiver maximum ${waiver.maximumLines}.`)
      continue
    }

    const baseline = baseLines === undefined ? "new file" : `base ${baseLines} LOC`
    errors.push(`${file}: ${lines} LOC exceeds ${HARD_LIMIT_LOC} (${baseline}). Split file or reduce it.`)
  }

  for (const file of Object.keys(waiverLedger.entries)) {
    if (seenWaivers.has(file)) continue
    errors.push(`godfile-waivers.json: stale waiver for ${file}; reduce/remove it or restore the named legacy file.`)
  }

  return { checked: files.length, warnings, errors }
}

export function formatGodfileReport(report: Report) {
  const lines = [
    `Godfile: ${report.checked} source files, ${report.warnings.length} warnings, ${report.errors.length} errors.`,
  ]

  for (const finding of report.warnings) {
    if (finding.kind === "target")
      lines.push(`WARN ${finding.file}: ${finding.lines} LOC exceeds target ${TARGET_LOC}.`)
    if (finding.kind === "legacy") {
      lines.push(
        `WARN ${finding.file}: ${finding.lines} LOC exceeds hard limit ${HARD_LIMIT_LOC}; legacy base ${finding.baseLines} LOC did not grow.`,
      )
    }
    if (finding.kind === "waiver") {
      lines.push(
        `WARN ${finding.file}: ${finding.lines} LOC under approved waiver maximum; ${finding.reason ?? "no reason"}.`,
      )
    }
  }
  for (const error of report.errors) lines.push(`ERROR ${error}`)
  return lines.join("\n")
}

function parseArgs(args: string[]) {
  const base = args.indexOf("--base")
  if (base === -1) return { baseRef: process.env.GODFILE_BASE_REF ?? "origin/dev" }
  if (!args[base + 1] || args.length !== 2) throw new Error("Usage: bun run script/godfile.ts [--base <git-ref>]")
  return { baseRef: args[base + 1] }
}

if (import.meta.main) {
  const { baseRef } = parseArgs(Bun.argv.slice(2))
  const report = runGodfileGate({ cwd: resolve(import.meta.dir, ".."), baseRef })
  console.log(formatGodfileReport(report))
  if (report.errors.length > 0) process.exitCode = 1
}
