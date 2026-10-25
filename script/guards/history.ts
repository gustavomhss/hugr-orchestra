#!/usr/bin/env bun
// Dev tool: runs the rules over each of the last N commits of a ref, one commit at a time, and lists every hit with
// its commit. This is the check for rules that need a diff (line balance, lockfile, deletions), which the snapshot scan
// in baseline.ts cannot judge. Read the hits: each is a real catch or a false positive to fix.
//
// Usage: bun run script/guards/history.ts [-n 300] [--ref origin/dev] [rule-id ...]

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { git, readDiff } from "./diff"
import { evaluate } from "./engine"
import { parseRule, type Rule } from "./rule"

const root = path.resolve(import.meta.dir, "..", "..")
const args = process.argv.slice(2)
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const count = Number(flag("-n") ?? 300)
const ref = flag("--ref") ?? "origin/dev"
const only = args.filter((arg, index) => !arg.startsWith("-") && !["-n", "--ref"].includes(args[index - 1] ?? ""))
const SHOWN = 6

const dir = path.join(import.meta.dir, "rules")
const rules = readdirSync(dir)
  .map((file) => parseRule(file, readFileSync(path.join(dir, file), "utf8")))
  .filter((rule): rule is Rule => typeof rule !== "string")
  .filter((rule) => only.length === 0 || only.includes(rule.id))
const config = Bun.TOML.parse(readFileSync(path.join(import.meta.dir, "config.toml"), "utf8")) as {
  generated: string[]
  exclude: string[]
}

// Merge commits are skipped: their first-parent diff is the whole merged branch, already seen commit by commit.
const commits = git(root, ["rev-list", "--no-merges", `-n${count}`, ref]).split("\n").filter((sha) => sha.length > 0)
const hits = new Map<string, string[]>()
for (const sha of commits) {
  const diff = readDiff(root, `${sha}^`, sha)
  for (const finding of evaluate({ rules, config, diff, approved: [] })) {
    const where = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`
    hits.set(finding.rule, [...(hits.get(finding.rule) ?? []), `${sha.slice(0, 10)} ${where}`])
  }
}
for (const rule of rules) {
  const list = hits.get(rule.id) ?? []
  console.log(`${rule.id}: ${list.length}`)
  for (const hit of list.slice(0, SHOWN)) console.log(`  ${hit}`)
}
console.log(`scanned ${commits.length} commits of ${ref} with ${rules.length} rules`)
