#!/usr/bin/env bun
// Spawn-import gate. Orchestra code spawns only through ChildProcessSpawner, Process or Process.interactive, and only
// packages/core/src/omni.ts imports hugr-omni (AGENTS.md, "Spawning processes"). This gate fails when a file imports
// a spawning module (cross-spawn, bun-pty, @lydell/node-pty, child_process, hugr-omni) or names StdioClientTransport,
// unless
// script/spawn-allowlist.json lists that file with that hit. A listed hit the file no longer has is stale and fails
// too, so the list only shrinks.
//
// Reach: tracked and untracked-but-not-ignored TS/JS files. Not checked: packages/omni (its own gate), tests and
// fixtures (test/, tests/, fixture(s)/, e2e/, __tests__/, *.test.*, *.spec.*), and spellings other than a string
// literal in import/export-from/import()/require().
//
// Usage: bun run script/check-spawn-imports.ts

import { readFileSync } from "node:fs"
import path from "node:path"

const MODULES: Record<string, string> = {
  "cross-spawn": "cross-spawn",
  "bun-pty": "bun-pty",
  "@lydell/node-pty": "@lydell/node-pty",
  child_process: "child_process",
  "node:child_process": "child_process",
  "hugr-omni": "hugr-omni",
}
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const SKIPPED = /^packages\/omni\/|(^|\/)(test|tests|fixture|fixtures|e2e|__tests__)\/|\.(test|spec)\.[^/]+$/
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g

const root = path.resolve(import.meta.dir, "..")
const errors = check()
if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`)
  process.exit(1)
}

function check() {
  const listing = Bun.spawnSync(["git", "ls-files", "-co", "--exclude-standard", "-z"], { cwd: root })
  if (listing.exitCode !== 0) return [`git ls-files failed: ${listing.stderr.toString()}`]
  const files = listing.stdout
    .toString()
    .split("\0")
    .filter((file) => SOURCE.test(file) && !SKIPPED.test(file))
  // A gate that read nothing proves nothing.
  if (files.length === 0) return ["zero source files found; refusing to pass"]
  const allowed = readAllowlist()
  if (typeof allowed === "string") return [allowed]
  const found = new Map(files.map((file) => [file, hits(file)] as const).filter((entry) => entry[1].length > 0))
  const unlisted = [...found].flatMap(([file, list]) =>
    list
      .filter((hit) => !allowed[file]?.includes(hit))
      .map((hit) => `${file}: ${hit} outside the spawn allow-list; spawn through ChildProcessSpawner or Process`),
  )
  const stale = Object.entries(allowed).flatMap(([file, list]) =>
    list
      .filter((hit) => !found.get(file)?.includes(hit))
      .map((hit) => `script/spawn-allowlist.json: stale entry ${file}: ${hit}; remove it`),
  )
  console.log(`spawn-imports: ${files.length} files checked, ${found.size} allow-listed sites`)
  return [...unlisted, ...stale]
}

function hits(file: string) {
  const text = readFileSync(path.join(root, file), "utf8")
  const modules = [...text.matchAll(SPECIFIER)].map((match) => MODULES[match[1]]).filter((hit) => hit !== undefined)
  return [...new Set([...modules, ...(/\bStdioClientTransport\b/.test(text) ? ["StdioClientTransport"] : [])])].sort(
    (a, b) => a.localeCompare(b),
  )
}

function readAllowlist(): Record<string, string[]> | string {
  const file = path.join(root, "script", "spawn-allowlist.json")
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as { sites?: Record<string, string[]> }
    if (!value.sites || typeof value.sites !== "object") return "script/spawn-allowlist.json: expected a sites object"
    return value.sites
  } catch (error) {
    return `script/spawn-allowlist.json: unreadable (${String(error)})`
  }
}
