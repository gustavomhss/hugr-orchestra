// The publish plan for an Atlas genesis run (genesis-hardening S12): which staged candidates are held, which are
// promoted, which Own units the promoted facts touch, and the negative check that none of the excluded facts
// reached the materialized Own snapshot. Like judge.mjs it never spawns a process; the workflow runs `atlas`.
//
//   node publish-plan.mjs plan <out-dir> --repo <repo> --judge-dir <dir>
//       refuses unless <dir> holds a passing judge-verdict.json, sample.json and one judge.jsonl record per
//       sampled fact; writes plan.json, promote.txt, held.txt, units.txt (one entry per line)
//   node publish-plan.mjs check-promote <promote-stdout-file> --planned <n>
//       exit 0 iff promote read staging, every planned key was staged, and all <n> promoted with no refusal
//   node publish-plan.mjs leaks <plan.json> <file-or-dir>...
//       exit 1 iff any file names an excluded fact (quarantined, held, or judged false) as an exact id token
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { score, stagedFacts } from "./judge.mjs"

/** The repo-relative file a fact is about (its first grounding entry), or undefined. */
export function subjectFile(fact) {
  const entry = fact.grounding?.entries?.[0]
  const file = entry?.path ?? entry?.anchor?.qualifiedPath?.split(/::|#/)[0]
  return typeof file === "string" && file.length > 0 ? file : undefined
}

/** The Own unit for a file: its parent directory (`.` for a file at the repository root). */
export const unitOf = (file) => (dirname(file) === "." ? "." : dirname(file))

/**
 * The judge's evidence a publish depends on, as a list of problems (empty ⇒ usable). Without it nothing would be
 * held, so a missing, failing or incomplete judge must stop the publish rather than promote everything.
 * `files` is `{ jsonl, verdict, sample }`, each the file's text or `undefined` when absent.
 */
export function judgeEvidenceProblems(files) {
  if (files.jsonl === undefined) return ["judge.jsonl is missing: the judge's verdicts did not reach this job"]
  if (files.verdict === undefined) return ["judge-verdict.json is missing"]
  if (files.sample === undefined) return ["sample.json is missing"]
  try {
    const problems = []
    const verdict = JSON.parse(files.verdict)
    const sample = JSON.parse(files.sample)
    const records = files.jsonl.split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line))
    if (verdict.pass !== true) problems.push("judge-verdict.json does not record a pass")
    if (!Array.isArray(sample.facts) || sample.facts.length === 0) return [...problems, "sample.json has no sampled claims"]
    if (records.length !== sample.facts.length) problems.push(`judge.jsonl has ${records.length} record(s) for ${sample.facts.length} sampled fact(s)`)
    if (!/^[0-9a-f]{64}$/.test(sample.promptHash) || verdict.promptHash !== sample.promptHash)
      problems.push("judge and sample prompt hashes do not match")
    const sampled = new Map(sample.facts.map((fact) => [fact.id, fact]))
    if (sampled.size !== sample.facts.length || new Set(records.map((record) => record.id)).size !== records.length)
      problems.push("judge/sample contains duplicate claim IDs")
    for (const record of records) {
      const fact = sampled.get(record.id)
      if (fact === undefined) { problems.push("judge contains an unsampled claim"); continue }
      if (record.arm !== fact.arm || record.nodeKey !== fact.nodeKey || record.contentHash !== fact.contentHash)
        problems.push("judge claim metadata does not match the sample")
      if (!/^[0-9a-f]{64}$/.test(fact.nodeKey) || !/^[0-9a-f]{64}$/.test(fact.contentHash) ||
        (fact.id !== fact.nodeKey && fact.id !== `${fact.nodeKey}:${fact.contentHash}`))
        problems.push("sample claim identity is not bound to its parent and CAS fact")
      if (!["true", "false", "unverifiable"].includes(record.verdict) || typeof record.nonObvious !== "boolean" ||
        typeof record.failed !== "boolean" || typeof record.reason !== "string" ||
        (record.failed && record.verdict !== "unverifiable"))
        problems.push("judge contains an invalid verdict record")
    }
    const actual = score(records, sample.promptHash)
    if (Object.keys(actual).some((key) => actual[key] !== verdict[key])) problems.push("judge summary does not match the actual scored claims")
    if (!actual.pass && verdict.pass === true) problems.push("actual sampled claims do not meet the publication bar")
    return problems
  } catch {
    return ["judge evidence is not valid JSON"]
  }
}

/**
 * The plan. `staged` is `[{ id, contentHash, fact }]` (judge.mjs `stagedFacts`), `judged` the judge.jsonl records.
 * A fact the judge marked false or unverifiable is held; a quarantined fact is never promoted; everything else
 * staged is promoted. Excluded = quarantined ∪ held, each with every id an Own snapshot could name it by: the
 * staging row key, the fact's own `id` (the nodeKey the snapshot's `facts[].id`/`invariants[].nodeId` carry)
 * and its CAS address.
 */
export function computePlan(staged, judged) {
  const parentOf = (entry) => entry.nodeKey ?? entry.id
  const byClaim = new Map(staged.map((entry) => [entry.id, entry]))
  const groups = new Map()
  for (const entry of staged) {
    const parent = parentOf(entry)
    groups.set(parent, [...(groups.get(parent) ?? []), entry])
  }
  const heldIds = new Set(judged.filter((record) => record.verdict === "false" || record.verdict === "unverifiable")
    .flatMap((record) => byClaim.has(record.id) ? [parentOf(byClaim.get(record.id))] : []))
  const falseIds = new Set(judged.filter((record) => record.verdict === "false")
    .flatMap((record) => byClaim.has(record.id) ? [parentOf(byClaim.get(record.id))] : []))
  const quarantined = new Set(staged.filter((entry) => entry.fact.quarantine !== undefined).map(parentOf))
  const held = [...heldIds].sort()
  const promotable = staged.filter((entry) => !quarantined.has(parentOf(entry)) && !heldIds.has(parentOf(entry)))
  const units = [
    ...new Set(promotable.flatMap((s) => (subjectFile(s.fact) === undefined ? [] : [unitOf(subjectFile(s.fact))]))),
  ].sort()
  const excluded = [...groups]
    .filter(([parent]) => quarantined.has(parent) || heldIds.has(parent))
    .map(([parent, entries]) => ({
      id: parent,
      ids: [...new Set([parent, ...entries.flatMap((entry) => [entry.id, entry.fact.id, entry.contentHash])]
        .filter((value) => typeof value === "string" && value.length > 0))],
      why: quarantined.has(parent) ? "quarantined" : falseIds.has(parent) ? "judged false" : "held",
    }))
  return {
    promote: [...new Set(promotable.map(parentOf))].sort(),
    held,
    quarantined: [...quarantined].sort(),
    units,
    excluded,
  }
}

/**
 * What is wrong with an `atlas promote` output for a plan of `planned` keys (empty ⇒ every planned key settled).
 * The plan already leaves out quarantined and held keys, so a clean publish refuses NOTHING: any refusal, a
 * staging read that refused ("promote read nothing"), a planned key that is not staged, or a settled count other
 * than `planned` is a problem.
 */
export function promoteProblems(stdout, planned) {
  const problems = []
  if (/promote read nothing/.test(stdout)) problems.push("promote read nothing: the staging read refused")
  for (const m of stdout.matchAll(/^\s*not staged (\S+)/gm)) problems.push(`planned key ${m[1]} is not staged`)
  for (const m of stdout.matchAll(/^\s*refused (.+?): (.*)$/gm)) problems.push(`refused ${m[1]}: ${m[2]}`)
  const summary = /^promote: (\d+) of (\d+) staged candidate\(s\) promoted; (\d+) refused$/m.exec(stdout)
  if (summary === null) {
    if (problems.length === 0) problems.push("no `promote:` summary line in the output")
    return problems
  }
  const [promoted, , refused] = [Number(summary[1]), Number(summary[2]), Number(summary[3])]
  if (refused !== 0 && !problems.some((p) => p.startsWith("refused "))) problems.push(`${refused} refused, no row named`)
  if (promoted !== planned) problems.push(`${promoted} promoted, ${planned} planned`)
  return problems
}

/** Every id token a text carries: maximal runs of `[A-Za-z0-9]` (nodeKeys and CAS addresses are hex). */
const tokens = (text) => new Set(text.split(/[^A-Za-z0-9]+/).filter((t) => t.length > 0))

/** Which excluded facts a file names as an EXACT id token (never a substring of a longer token):
 *  `[{ id, why, at }]`. */
export function leaks(excluded, files) {
  return files.flatMap(({ path, text }) => {
    const present = tokens(text)
    return excluded.filter((e) => e.ids.some((id) => present.has(id))).map((e) => ({ id: e.id, why: e.why, at: path }))
  })
}

const flag = (argv, name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined)
const readIf = (path) => (existsSync(path) ? readFileSync(path, "utf8") : undefined)
const filesOf = (path) => {
  if (!existsSync(path)) throw new Error("publish leak check: requested path is missing")
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((entry) => filesOf(join(path, entry)))
}

async function main(argv) {
  const [command, ...rest] = argv
  if (command === "plan") {
    const out = rest[0]
    const judgeDir = flag(rest, "--judge-dir") ?? "."
    const evidence = {
      jsonl: readIf(join(judgeDir, "judge.jsonl")),
      verdict: readIf(join(judgeDir, "judge-verdict.json")),
      sample: readIf(join(judgeDir, "sample.json")),
    }
    const problems = judgeEvidenceProblems(evidence)
    for (const p of problems) console.log(`::error::publish plan: ${p}`)
    if (problems.length > 0) return 1
    const judged = evidence.jsonl
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l))
    const sampled = JSON.parse(evidence.sample)
    const expectedPrompt = createHash("sha256").update(readFileSync(new URL("./judge-prompt.md", import.meta.url))).digest("hex")
    if (sampled.promptHash !== expectedPrompt) throw new Error("publish plan: judge template identity changed")
    const staged = await stagedFacts(flag(rest, "--repo") ?? ".")
    const indexed = new Map(staged.map((entry) => [entry.id, entry]))
    for (const claim of sampled.facts) {
      const actual = indexed.get(claim.id)
      if (actual === undefined || actual.nodeKey !== claim.nodeKey || actual.contentHash !== claim.contentHash)
        throw new Error("publish plan: sampled claim no longer matches the staged CAS evidence")
    }
    const plan = computePlan(staged, judged)
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, "plan.json"), JSON.stringify(plan, null, 2) + "\n")
    for (const key of ["promote", "held", "units"])
      writeFileSync(join(out, `${key}.txt`), plan[key].map((x) => `${x}\n`).join(""))
    console.log(
      `publish plan: promote ${plan.promote.length}, held ${plan.held.length}, quarantined ${plan.quarantined.length}, units ${plan.units.length}`,
    )
    return 0
  }
  if (command === "check-promote") {
    const problems = promoteProblems(readFileSync(rest[0], "utf8"), Number(flag(rest, "--planned")))
    for (const p of problems) console.log(`::error::promote: ${p}`)
    return problems.length === 0 ? 0 : 1
  }
  if (command === "leaks") {
    const plan = JSON.parse(readFileSync(rest[0], "utf8"))
    const files = rest.slice(1).flatMap(filesOf)
    if (files.length === 0) throw new Error("publish leak check: no files were read")
    const found = leaks(
      plan.excluded,
      files.map((path) => ({ path, text: readFileSync(path, "utf8") })),
    )
    for (const f of found) console.log(`::error::excluded fact ${f.id} (${f.why}) reached ${f.at}`)
    console.log(`publish leak check: ${found.length === 0 ? "clean" : `${found.length} leak(s)`}`)
    return found.length === 0 ? 0 : 1
  }
  console.error("usage: publish-plan.mjs plan|check-promote|leaks …")
  return 1
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2))
}
