#!/usr/bin/env bun
// Dev tool: treats every tracked file as newly added and lists what the rules would flag in the code that exists
// today. Run it before adding or tightening a rule; every hit is a real defect or a false positive that belongs in
// the rule's negative samples. Not a gate: old code is allowed to hit.
//
// Usage: bun run script/guards/baseline.ts [rule-id ...]

import { closeSync, openSync, readSync, readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import type { Change } from "./diff"
import { evaluate, type Finding } from "./engine"
import { expandSets, parseRule, type Rule } from "./rule"

const root = path.resolve(import.meta.dir, "..", "..")
const only = process.argv.slice(2)
const MAX_TEXT_BYTES = 1_000_000
const SHOWN = Number(process.env.SHOWN ?? 5)

const config = (() => {
  const raw = Bun.TOML.parse(readFileSync(path.join(import.meta.dir, "config.toml"), "utf8")) as {
    generated: string[]
    exclude: string[]
    sets?: Record<string, string[]>
  }
  return { generated: raw.generated, exclude: raw.exclude, sets: raw.sets ?? {} }
})()

const dir = path.join(import.meta.dir, "rules")
const rules = readdirSync(dir)
  .map((file) => parseRule(file, readFileSync(path.join(dir, file), "utf8")))
  .filter((rule): rule is Rule => typeof rule !== "string")
  .map((rule) => expandSets(rule, config.sets))
  .filter((rule): rule is Rule => typeof rule !== "string")
  .filter((rule) => only.length === 0 || only.includes(rule.id))

// `git ls-files -s -z`: `<mode> <sha> <stage>\t<path>` per tracked file.
const changes = Bun.spawnSync(["git", "-C", root, "ls-files", "-s", "-z"])
  .stdout.toString()
  .split("\0")
  .filter((entry) => entry.length > 0)
  .flatMap((entry): Change[] => {
    const tab = entry.indexOf("\t")
    const mode = entry.slice(0, entry.indexOf(" "))
    const file = entry.slice(tab + 1)
    if (mode === "160000") return [{ path: file, status: "A", from: undefined, added: [], mode }]
    const stat = statSync(path.join(root, file), { throwIfNoEntry: false })
    if (!stat?.isFile()) return [{ path: file, status: "A", from: undefined, added: [], mode, binary: false }]
    const head = firstBytes(path.join(root, file))
    const binary = head.includes(0)
    const text = !binary && stat.size <= MAX_TEXT_BYTES ? readFileSync(path.join(root, file), "utf8") : undefined
    return [
      {
        path: file,
        status: "A",
        from: undefined,
        added: text === undefined ? [] : text.split("\n").map((content, index) => ({ line: index + 1, text: content })),
        mode,
        size: stat.size,
        binary,
        shebang: head.subarray(0, 2).toString() === "#!",
      },
    ]
  })

const found = evaluate({ rules, config, diff: { changes, removed: new Map() }, approved: [] })
const byRule = Map.groupBy(found, (finding: Finding) => finding.rule)
for (const rule of rules) {
  const hits = byRule.get(rule.id) ?? []
  console.log(`${rule.id}: ${hits.length}`)
  for (const hit of hits.slice(0, SHOWN)) console.log(`  ${hit.line === undefined ? hit.path : `${hit.path}:${hit.line}`}`)
}
console.log(`scanned ${changes.length} files with ${rules.length} rules`)

function firstBytes(file: string) {
  const buffer = Buffer.alloc(8000)
  const fd = openSync(file, "r")
  const read = readSync(fd, buffer, 0, buffer.length, 0)
  closeSync(fd)
  return buffer.subarray(0, read)
}
