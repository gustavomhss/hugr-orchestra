#!/usr/bin/env bun
// Replaces a package's code wildcards in package.json `exports` with explicit keys (D10, D11). Policy `demanded` keeps
// every quoted `<name>/<sub>` literal in tracked files (except *.md, specs/, docs/, bun.lock) that resolves through a code
// wildcard to a tracked file, plus registry `entries`; policy `full` also adds one key per non-test file a wildcard
// reaches. Asset wildcards (registry `assetWildcards`) stay. Every kept literal must resolve to the same file before and
// after, or it exits EXPORTS_RESOLUTION_CHANGED. Resolution reads the working tree only, never node_modules.
//
// Usage: bun run script/explicit-exports.ts <alias> [--write|--check|--count|--verify-resolution <baseRef>]
import { writeFileSync } from "node:fs"
import path from "node:path"
import { exportsObject, isTestFile, loadWorkspace, resolveExport, type Member, type Workspace } from "./module-architecture"

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, "..")
  const args = process.argv.slice(2)
  const alias = args[0]
  if (!alias || alias.startsWith("--")) fail("usage: explicit-exports.ts <alias> [--write|--check|--count|--verify-resolution <baseRef>]")
  const workspace = loadWorkspace(root)
  const base = args.indexOf("--verify-resolution")
  if (base >= 0) verify(workspace, alias, args[base + 1] ?? fail("--verify-resolution needs a base ref"))
  const plan = explicitExports(workspace, alias)
  const member = plan.member
  if (args.includes("--count")) console.log(Object.keys(plan.next).length)
  if (args.includes("--write")) {
    writeFileSync(path.join(root, member.path, "package.json"), JSON.stringify({ ...member.manifest, exports: plan.next }, null, 2) + "\n")
    console.log(`explicit-exports: ${alias} written with ${Object.keys(plan.next).length} keys (${plan.derived} derived)`)
  }
  if (args.includes("--check")) {
    const same = JSON.stringify(plan.next) === JSON.stringify(member.manifest.exports)
    console.log(`explicit-exports: ${alias} ${same ? "is explicit" : `would change (${Object.keys(plan.next).length} keys)`}`)
    if (!same) process.exit(1)
  }
}

export function explicitExports(workspace: Workspace, alias: string) {
  const member = workspace.member(alias) ?? fail(`MODULE_ALIAS_UNKNOWN:${alias}`)
  if (member.spec.exportsPolicy === "none") fail(`EXPORTS_POLICY_NONE:${alias}`)
  if (JSON.stringify(member.manifest, null, 2) + "\n" !== member.manifestText) fail(`EXPORTS_MANIFEST_NOT_CANONICAL:${member.path}/package.json`)
  const old = exportsObject(member.manifest.exports)
  const assets = new Set(member.spec.assetWildcards ?? [])
  // A closed map has no wildcard left, so the registry keeps the former code wildcards (`sourceWildcards`) to resolve
  // a subpath that gains its first consumer; keys already in the map win.
  const before = { ...(member.spec.sourceWildcards ?? {}), ...old }
  const code = new Set(Object.keys(before).filter((key) => key.includes("*") && !assets.has(key)))
  const tracked = new Set(workspace.files)
  const reaches = (subpath: string) => {
    const hit = resolveExport(before, subpath)
    return hit && code.has(hit.key) && tracked.has(path.posix.join(member.path, hit.target)) ? hit : undefined
  }
  const demanded = literals(workspace, member).filter((subpath) => reaches(subpath))
  const full = member.spec.exportsPolicy !== "full" ? [] : [...code].flatMap((key) => inverse(workspace, member.path, key, before[key]))
  const derived = [...new Set([...demanded, ...full.filter((subpath) => reaches(subpath))])].filter((key) => !(key in old)).sort()
  const next = Object.fromEntries([
    ...Object.entries(old).filter(([key]) => !code.has(key)),
    ...derived.map((key) => [key, reaches(key)?.target ?? fail(`EXPORTS_RESOLUTION_CHANGED:${key}`)]),
  ])
  ;[...demanded, ...derived].forEach((subpath) => {
    if (resolveExport(next, subpath)?.target !== resolveExport(before, subpath)?.target) fail(`EXPORTS_RESOLUTION_CHANGED:${subpath}`)
  })
  return { member, next, derived: derived.length }
}

/** Quoted `<name>/<sub>` literals plus registry entries, as `./<sub>` subpaths. */
export function literals(workspace: Workspace, member: Member) {
  const name = member.name
  const escaped = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
  const result = Bun.spawnSync(
    ["git", "grep", "-hoE", `["'\`]${escaped}/[^"'\`$[:space:]]+["'\`]`, "--", ".", ":(exclude)*.md", ":(exclude,glob)**/specs/**", ":(exclude,glob)**/docs/**", ":(exclude)bun.lock"],
    { cwd: workspace.root },
  )
  // git grep exits 1 when nothing matches; anything else is a failed scan, not an empty one.
  if (result.exitCode !== 0 && result.exitCode !== 1) fail(`EXPORTS_LITERAL_SCAN_FAILED: ${result.stderr.toString().trim()}`)
  const found = result.stdout
    .toString()
    .split("\n")
    .filter((literal) => literal.length > 2 && literal[0] === literal[literal.length - 1])
    .map((literal) => `./${literal.slice(name.length + 2, -1)}`)
  return [...new Set([...found, ...(member.spec.entries ?? []).map((entry) => `./${entry}`)])]
}

function inverse(workspace: Workspace, packagePath: string, key: string, value: unknown) {
  // A NUL placeholder for the wildcard shows where the matched text lands in the target.
  const target = resolveExport({ [key]: value }, key.replace("*", "\0"))?.target
  if (!target) return []
  const head = target.slice(0, target.indexOf("\0"))
  const tail = target.slice(target.indexOf("\0") + 1)
  const prefix = path.posix.join(packagePath, head)
  const star = key.indexOf("*")
  return workspace.files
    .filter((file) => file.startsWith(prefix) && file.endsWith(tail) && !file.endsWith(".d.ts") && !isTestFile(file.slice(packagePath.length + 1)))
    .map((file) => `${key.slice(0, star)}${file.slice(prefix.length, file.length - tail.length)}${key.slice(star + 1)}`)
}

function verify(workspace: Workspace, alias: string, baseRef: string): never {
  const member = workspace.member(alias) ?? fail(`MODULE_ALIAS_UNKNOWN:${alias}`)
  const shown = Bun.spawnSync(["git", "show", `${baseRef}:${member.path}/package.json`], { cwd: workspace.root })
  if (shown.exitCode !== 0) fail(`EXPORTS_BASE_UNREADABLE:${baseRef}: ${shown.stderr.toString().trim()}`)
  const before = exportsObject((JSON.parse(shown.stdout.toString()) as { exports?: unknown }).exports)
  const tracked = new Set(workspace.files)
  const results = literals(workspace, member).map((subpath) => {
    const old = resolveExport(before, subpath)
    if (!old || !tracked.has(path.posix.join(member.path, old.target))) return "ignored"
    const now = resolveExport(member.manifest.exports, subpath)
    if (!now) return "lost"
    return now.target === old.target ? "same" : "changed"
  })
  const count = (kind: string) => results.filter((result) => result === kind).length
  const checked = results.length - count("ignored")
  console.log(`checked=${checked} same=${count("same")} changed=${count("changed")} lost=${count("lost")} ignored=${count("ignored")}`)
  // A verification that checked nothing proves nothing.
  process.exit(checked === 0 || count("changed") + count("lost") > 0 ? 1 : 0)
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
