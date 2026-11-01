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
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { stagedFacts } from "./judge.mjs"

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
  const problems = []
  const verdict = JSON.parse(files.verdict)
  if (verdict.pass !== true) problems.push("judge-verdict.json does not record a pass")
  const records = files.jsonl.split("\n").filter((l) => l.trim().length > 0).length
  const sampled = JSON.parse(files.sample).facts?.length ?? -1
  if (records !== sampled) problems.push(`judge.jsonl has ${records} record(s) for ${sampled} sampled fact(s)`)
  return problems
}

/**
 * The plan. `staged` is `[{ id, contentHash, fact }]` (judge.mjs `stagedFacts`), `judged` the judge.jsonl records.
 * A fact the judge marked false or unverifiable is held; a quarantined fact is never promoted; everything else
 * staged is promoted. Excluded = quarantined ∪ held, each with every id an Own snapshot could name it by: the
 * staging row key, the fact's own `id` (the nodeKey the snapshot's `facts[].id`/`invariants[].nodeId` carry)
 * and its CAS address.
 */
export function computePlan(staged, judged) {
  const heldIds = new Set(judged.filter((r) => r.verdict === "false" || r.verdict === "unverifiable").map((r) => r.id))
  const falseIds = new Set(judged.filter((r) => r.verdict === "false").map((r) => r.id))
  const stagedIds = new Set(staged.map((s) => s.id))
  const quarantined = staged.filter((s) => s.fact.quarantine !== undefined)
  const held = [...heldIds].filter((id) => stagedIds.has(id)).sort()
  const promotable = staged.filter((s) => s.fact.quarantine === undefined && !heldIds.has(s.id))
  const units = [
    ...new Set(promotable.flatMap((s) => (subjectFile(s.fact) === undefined ? [] : [unitOf(subjectFile(s.fact))]))),
  ].sort()
  const excluded = staged
    .filter((s) => s.fact.quarantine !== undefined || heldIds.has(s.id))
    .map((s) => ({
      id: s.id,
      ids: [...new Set([s.id, s.fact.id, s.contentHash].filter((x) => typeof x === "string" && x.length > 0))],
      why: s.fact.quarantine !== undefined ? "quarantined" : falseIds.has(s.id) ? "judged false" : "held",
    }))
  return {
    promote: promotable.map((s) => s.id).sort(),
    held,
    quarantined: quarantined.map((s) => s.id).sort(),
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
  if (!existsSync(path)) return []
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
    const plan = computePlan(await stagedFacts(flag(rest, "--repo") ?? "."), judged)
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
    const found = leaks(
      plan.excluded,
      rest
        .slice(1)
        .flatMap(filesOf)
        .map((path) => ({ path, text: readFileSync(path, "utf8") })),
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
