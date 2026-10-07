#!/usr/bin/env bun
// Wave 3 of the opencode -> Orchestra rename as one deterministic, re-runnable codemod.
//
//   bun run script/rename-codemod.ts [--dry-run] [--skip-regen] [--allow-dirty] [--report <file>]
//
// 1. Moves every tracked path whose name carries the old name (`git mv`), directories first.
// 2. Rewrites tracked text files with the ordered rules below. Kept paths and protected strings come from
//    script/rename-ledger.ts, the same ledger the repo-wide guard (packages/core/test/rename-guard.test.ts) reads.
// 3. Regenerates what is generated: bun.lock, the v2 SDK, packages/sdk/openapi.json, the client and the Atlas bundles.
// 4. Prints counts per rule and fails when a protected string changed or an unprotected old name is left.
//
// Running it again on its own output changes nothing. Running it on a branch that predates the rename renames that
// branch's work the same way, so merging the renamed dev afterwards leaves mostly mechanical conflicts.

import { existsSync } from "node:fs"
import path from "node:path"
import { kept, OLD_NAME, oldNames, protectedStrings } from "./rename-ledger"

type Rule = { name: string; pattern: RegExp; replace: string; paths?: RegExp }

// Order matters: specific identities first, then the case-preserving fallbacks.
const rules: Rule[] = [
  {
    name: "desktop-product-name",
    paths:
      /^packages\/desktop\/(?:electron-builder\.config\.ts|src\/main\/(?:index|windows)\.ts|scripts\/copy-metainfo\.ts)$|^nix\/desktop\.nix$/,
    pattern: /(?<=["`]|Applications\/|MacOS\/)OpenCode(?=(?: Dev| Beta)?["`]| \$\{|\.app\/)/g,
    replace: "HuGR Orchestra",
  },
  { name: "desktop-app-id", pattern: /\bai\.opencode\.desktop\b/g, replace: "ai.hugr.orchestra" },
  { name: "managed-config-domain", pattern: /\bai\.opencode\.managed\b/g, replace: "ai.hugr.orchestra.managed" },
  { name: "brand-pair", pattern: /\bOpenCode\s*\/\s*Orchestra\b/g, replace: "Orchestra" },
  { name: "storage-prefix-pair", pattern: /\bopencode\.orchestra\./g, replace: "orchestra." },
  { name: "package-scope", pattern: /@opencode-ai\b/g, replace: "@orchestra" },
  { name: "effect-tag-prefix", pattern: /([@~])opencode\//g, replace: "$1orchestra/" },
  { name: "package-directory", pattern: /\bpackages\/opencode\b/g, replace: "packages/orchestra" },
  { name: "test-ci-selector", pattern: /\btest:ci opencode\b/g, replace: "test:ci orchestra" },
  { name: "url-scheme", pattern: /\bopencode:\/\//g, replace: "orchestra://" },
  { name: "internal-headers", pattern: /\bx-opencode-(?=[a-z])/g, replace: "x-orchestra-" },
  { name: "server-handshake", pattern: /\bopencode server listening\b/g, replace: "orchestra server listening" },
  {
    name: "server-auth-username",
    pattern: /(?<=(?:username|USERNAME)[^\n]{0,80}?["'`])opencode(?=["'`])|(?<=withDefault\(")opencode(?=")/g,
    replace: "orchestra",
  },
  { name: "mdns-name", pattern: /\bopencode(?=\.local\b|-\$\{port\})/g, replace: "orchestra" },
  { name: "app-data-dir", pattern: /(?<=const app = ")opencode(?=")/g, replace: "orchestra" },
  { name: "data-db-file", pattern: /\bopencode(?=(?:-\$\{[^}]+\})?\.db\b)/g, replace: "orchestra" },
  { name: "project-dir", pattern: /(?<![\w-])\.opencode\b/g, replace: ".orchestra" },
  { name: "config-file", pattern: /\bopencode(?=\.jsonc?\b)/g, replace: "orchestra" },
  { name: "env-prefix", pattern: /OPENCODE_/g, replace: "ORCHESTRA_" },
  { name: "fallback-upper", pattern: /OPENCODE/g, replace: "ORCHESTRA" },
  { name: "fallback-title", pattern: /OpenCode|Opencode/g, replace: "Orchestra" },
  { name: "fallback-camel", pattern: /openCode/g, replace: "orchestra" },
  { name: "fallback-lower", pattern: /opencode/g, replace: "orchestra" },
]

// Rewritten by their generators, never by rules.
const GENERATED =
  /^packages\/sdk\/js\/src\/v2\/gen\/|^packages\/sdk\/openapi\.json$|^packages\/client\/src\/generated(?:-effect)?\/|^packages\/atlas-boundary\/src\/generated\//
// yargs right-aligns the type column, so a longer name must eat the padding to keep the line width.
const RIGHT_ALIGNED =
  /^packages\/(?:opencode|orchestra)\/test\/cli\/help\/__snapshots__\/help-snapshots\.test\.ts\.snap$/

const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const skipRegen = args.includes("--skip-regen")
const allowDirty = args.includes("--allow-dirty")
const reportFile = args.includes("--report") ? args[args.indexOf("--report") + 1] : undefined
const root = git(process.cwd(), "rev-parse", "--show-toplevel").trim()
const counts = new Map<string, number>(rules.map((rule) => [rule.name, 0]))
const report: string[] = []

if (!allowDirty && !dryRun && git(root, "status", "--porcelain").trim())
  fail("The working tree is not clean. Commit or set aside your changes first, or pass --allow-dirty.")

progress("census of protected strings")
const before = await protectedCensus(await textFiles())
progress("moving paths")
const moves = movePaths()
progress("rewriting files")
const rewritten = await rewriteFiles()
if (!dryRun && !skipRegen) regenerate()
progress("checking the result")
const after = await protectedCensus(await textFiles())
const residue = await residualOldNames()

console.log(`rename-codemod${dryRun ? " (dry run)" : ""}: ${moves.length} paths moved, ${rewritten} files rewritten`)
for (const [name, count] of counts) console.log(`  ${name.padEnd(26)} ${count}`)
const changedProtection = [...new Set([...before.keys(), ...after.keys()])].filter(
  (key) => (before.get(key) ?? 0) !== (after.get(key) ?? 0),
)
console.log(
  `protected strings: ${[...before.values()].reduce((sum, n) => sum + n, 0)} before, ${[...after.values()].reduce((sum, n) => sum + n, 0)} after, ${changedProtection.length} changed`,
)
for (const key of changedProtection) console.log(`  CHANGED ${key}: ${before.get(key) ?? 0} -> ${after.get(key) ?? 0}`)
if (reportFile) await Bun.write(reportFile, report.join("\n") + "\n")
if (!dryRun && residue.length) {
  console.log(`unprotected old names left: ${residue.length}`)
  for (const line of residue.slice(0, 200)) console.log(`  ${line}`)
}
if (changedProtection.length) fail("A protected string changed.")
if (!dryRun && residue.length) fail("Old names remain outside the ledger.")

function tracked() {
  return git(root, "ls-files", "-z").split("\0").filter(Boolean)
}

async function textFiles() {
  const files = tracked()
  const result: { file: string; text: string }[] = []
  for (const file of files) {
    if (kept(file)) continue
    const bytes = await Bun.file(path.join(root, file))
      .bytes()
      .catch(() => undefined)
    if (!bytes || bytes.subarray(0, 8000).includes(0)) continue
    result.push({ file, text: new TextDecoder().decode(bytes) })
  }
  return result
}

// Protected matches per ledger entry, summed over files (paths move, so files are not matched by path).
// Generated files and bun.lock are rebuilt by their tools, which may legitimately reshape what they hold.
async function protectedCensus(files: { file: string; text: string }[]) {
  const census = new Map<string, number>()
  for (const entry of files) {
    if (GENERATED.test(entry.file) || entry.file === "bun.lock") continue
    const renamed = rename(entry.file)
    for (const [index, item] of protectedStrings.entries()) {
      if (item.paths && !item.paths.test(entry.file) && !item.paths.test(renamed)) continue
      const count = [...entry.text.matchAll(item.pattern)].length
      if (count) census.set(`#${index} ${item.reason}`, (census.get(`#${index} ${item.reason}`) ?? 0) + count)
    }
  }
  return census
}

function apply(text: string, file: string, count: boolean) {
  const masks: string[] = []
  const masked = protectedStrings.reduce(
    (current, item) =>
      item.paths && !item.paths.test(file)
        ? current
        : current.replace(item.pattern, (match) => `\u0000${masks.push(match) - 1}\u0000`),
    text,
  )
  const replaced = rules.reduce((current, rule) => {
    if (rule.paths && !rule.paths.test(file)) return current
    return current.replace(rule.pattern, (...match) => {
      if (count) counts.set(rule.name, (counts.get(rule.name) ?? 0) + 1)
      const groups = match.slice(1, -2) as (string | undefined)[]
      return rule.replace.replace(/\$(\d)/g, (_, n: string) => groups[Number(n) - 1] ?? "")
    })
  }, masked)
  return replaced.replace(/\u0000(\d+)\u0000/g, (_, index: string) => masks[Number(index)]!)
}

// The new path of a file: the whole path renamed, except a kept file's own name.
function rename(file: string) {
  if (!kept(file)) return apply(file, file, false)
  const directory = path.posix.dirname(file)
  return directory === "." ? file : `${apply(directory, file, false)}/${path.posix.basename(file)}`
}

function movePaths() {
  const files = tracked()
  const planned = files.map((file) => ({ from: file, to: rename(file) })).filter((move) => move.from !== move.to)
  // Move whole directories when the directory itself is renamed, then the remaining files.
  const directories = new Map<string, string>()
  for (const move of planned) {
    const from = move.from.split("/")
    const to = move.to.split("/")
    const index = from.findIndex((segment, i) => segment !== to[i])
    if (index < from.length - 1) directories.set(from.slice(0, index + 1).join("/"), to.slice(0, index + 1).join("/"))
  }
  const done: string[] = []
  for (const [from, to] of [...directories].sort(([a], [b]) => a.length - b.length)) {
    if ([...directories.keys()].some((other) => other !== from && from.startsWith(`${other}/`))) continue
    if (existsSync(path.join(root, to))) fail(`Cannot move ${from}: ${to} already exists.`)
    if (!dryRun) git(root, "mv", from, to)
    done.push(`${from} -> ${to}`)
  }
  const remaining = (dryRun ? files : tracked())
    .map((file) => ({ from: file, to: rename(file) }))
    .filter((move) => move.from !== move.to)
    .filter((move) => !dryRun || !done.some((entry) => move.from.startsWith(`${entry.split(" -> ")[0]}/`)))
  for (const move of remaining) {
    if (existsSync(path.join(root, move.to))) fail(`Cannot move ${move.from}: ${move.to} already exists.`)
    if (!dryRun) git(root, "mv", move.from, move.to)
    done.push(`${move.from} -> ${move.to}`)
  }
  report.push("## moves", ...done)
  return done
}

async function rewriteFiles() {
  let rewritten = 0
  report.push("## rewritten lines")
  for (const entry of await textFiles()) {
    if (GENERATED.test(entry.file) || !OLD_NAME.test(entry.text)) continue
    const next = RIGHT_ALIGNED.test(entry.file)
      ? keepWidth(entry.text, apply(entry.text, entry.file, true))
      : apply(entry.text, entry.file, true)
    if (next === entry.text) continue
    rewritten++
    const oldLines = entry.text.split("\n")
    const newLines = next.split("\n")
    newLines.forEach((line, index) => {
      if (line !== oldLines[index])
        report.push(`${entry.file}:${index + 1}: ${oldLines[index]!.trim()}\n    => ${line.trim()}`)
    })
    if (!dryRun) await Bun.write(path.join(root, entry.file), next)
  }
  return rewritten
}

// Keep right-aligned help lines at their width: a renamed word that grew eats padding before the aligned column.
function keepWidth(previous: string, next: string) {
  const oldLines = previous.split("\n")
  return next
    .split("\n")
    .map((line, index) => {
      const old = oldLines[index] ?? line
      const grown = line.length - old.length
      if (grown <= 0 || !old.endsWith("]")) return line
      const runs = [...line.matchAll(/ {2,}/g)].filter((run) => run[0].length > grown)
      const run = runs.at(-1)
      if (!run || run.index === undefined) return line
      return line.slice(0, run.index) + line.slice(run.index + grown)
    })
    .join("\n")
}

function regenerate() {
  const step = (name: string, directory: string, command: string[], output?: string) => {
    const start = Date.now()
    progress(`regenerating ${name}`)
    const cwd = path.join(root, directory)
    const result = Bun.spawnSync(command, {
      cwd,
      stdout: output ? Bun.file(path.join(cwd, output)) : "pipe",
      stderr: "pipe",
    })
    if (result.exitCode !== 0)
      fail(
        `${command.join(" ")} in ${directory} failed:\n${result.stdout?.toString() ?? ""}${result.stderr.toString()}`,
      )
    progress(`regenerated ${name} in ${((Date.now() - start) / 1000).toFixed(0)}s`)
  }
  // --ignore-scripts: `prepare` would run husky, which rewrites the shared core.hooksPath.
  step("bun.lock", ".", ["bun", "install", "--ignore-scripts"])
  step("the v2 SDK", ".", ["bun", "./packages/sdk/js/script/build.ts"])
  step("packages/sdk/openapi.json", "packages/orchestra", ["bun", "dev", "generate"], "../sdk/openapi.json")
  step("the client", "packages/client", ["bun", "run", "generate"])
  step("the Atlas bundles", "packages/atlas-boundary", ["bun", "run", "generate"])
}

// Same rule as the guard: what is left after kept paths and protected strings must not name the old product.
async function residualOldNames() {
  return (await textFiles()).flatMap((entry) => oldNames(entry.file, entry.text))
}

function git(cwd: string, ...command: string[]) {
  const result = Bun.spawnSync(["git", ...command], { cwd, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) fail(`git ${command.join(" ")} failed: ${result.stderr.toString().trim()}`)
  return result.stdout.toString()
}

function progress(message: string) {
  console.log(`rename-codemod: ${message}`)
}

function fail(message: string): never {
  console.error(`rename-codemod: ${message}`)
  process.exit(1)
}
