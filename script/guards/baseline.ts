#!/usr/bin/env bun
// Dev tool: treats every line of every tracked text file as added and lists what the added-lines rules would flag in
// the code that exists today. Run it before adding or tightening a rule; every hit is a real defect or a false
// positive that belongs in the rule's negative samples. Not a gate: old code is allowed to hit.
//
// Usage: bun run script/guards/baseline.ts [rule-id ...]

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { evaluate, type Finding } from "./engine"
import { parseRule, type Rule } from "./rule"

const root = path.resolve(import.meta.dir, "..", "..")
const only = process.argv.slice(2)
const MAX_BYTES = 1_000_000
const SHOWN = 5

const dir = path.join(import.meta.dir, "rules")
const rules = readdirSync(dir)
  .map((file) => parseRule(file, readFileSync(path.join(dir, file), "utf8")))
  .filter((rule): rule is Rule => typeof rule !== "string")
  .filter((rule) => rule.on === "added-lines" && (only.length === 0 || only.includes(rule.id)))
const config = Bun.TOML.parse(readFileSync(path.join(import.meta.dir, "config.toml"), "utf8")) as {
  generated: string[]
  exclude: string[]
}
const changes = Bun.spawnSync(["git", "-C", root, "ls-files", "-z"])
  .stdout.toString()
  .split("\0")
  .filter((file) => file.length > 0)
  .flatMap((file) => {
    const buffer = readFileSync(path.join(root, file))
    if (buffer.length > MAX_BYTES || buffer.includes(0)) return []
    const added = buffer.toString("utf8").split("\n").map((text, index) => ({ line: index + 1, text }))
    return [{ path: file, status: "M", from: undefined, added }]
  })
const found = evaluate({ rules, config, diff: { changes, removed: new Set() }, approved: [] })
const byRule = Map.groupBy(found, (finding: Finding) => finding.rule)
for (const rule of rules) {
  const hits = byRule.get(rule.id) ?? []
  console.log(`${rule.id}: ${hits.length}`)
  for (const hit of hits.slice(0, SHOWN)) console.log(`  ${hit.path}:${hit.line}`)
}
console.log(`scanned ${changes.length} files with ${rules.length} rules`)
