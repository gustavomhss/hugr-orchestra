#!/usr/bin/env bun
// Writes the generated "Module contract" block into each package README (D15). The block is rendered from
// script/module-architecture.json only; an existing block is replaced, otherwise one is appended after a blank line.
// It never creates a README: a missing file is an error.
//
// Usage: bun run script/module-readme.ts <alias>... [--write|--check]
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { README_END, README_START, loadWorkspace, renderReadmeBlock, type Workspace } from "./module-architecture"

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, "..")
  const args = process.argv.slice(2)
  const aliases = args.filter((arg) => !arg.startsWith("--"))
  if (aliases.length === 0) fail("usage: module-readme.ts <alias>... [--write|--check]")
  const workspace = loadWorkspace(root)
  const stale = aliases.filter((alias) => {
    const member = workspace.member(alias) ?? fail(`MODULE_ALIAS_UNKNOWN:${alias}`)
    const file = path.join(root, member.path, "README.md")
    if (!existsSync(file)) fail(`README_MISSING:${member.path}/README.md`)
    const text = readFileSync(file, "utf8")
    const next = withBlock(workspace, alias, text)
    if (next === text) return false
    if (args.includes("--write")) writeFileSync(file, next)
    console.log(`module-readme: ${member.path}/README.md ${args.includes("--write") ? "written" : "differs"}`)
    return true
  })
  console.log(`module-readme: ${aliases.length} READMEs checked, ${stale.length} ${args.includes("--write") ? "written" : "differ"}`)
  if (args.includes("--check") && stale.length > 0) process.exit(1)
}

export function withBlock(workspace: Workspace, alias: string, text: string) {
  const block = renderReadmeBlock(workspace, alias)
  const start = text.indexOf(README_START.slice(0, README_START.indexOf(" (")))
  const end = text.indexOf(README_END, start)
  if (start >= 0 && end >= 0) return text.slice(0, start) + block + text.slice(end + README_END.length)
  return `${text.replace(/\s*$/, "")}\n\n${block}\n`
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
