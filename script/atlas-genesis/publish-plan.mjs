// The publish plan for an Atlas genesis run (genesis-hardening S12): which staged candidates are held, which are
// promoted, which Own units the promoted facts touch, and the negative check that none of the excluded facts
// reached the materialized Own snapshot. Like judge.mjs it never spawns a process; the workflow runs `atlas`.
//
//   node publish-plan.mjs plan <out-dir> --repo <repo> --judge <judge.jsonl>
//       writes plan.json, promote.txt, held.txt, units.txt (one entry per line)
//   node publish-plan.mjs refusals <promote-stdout-file>
//       exit 0 iff every `refused` row's reason is `quarantined`
//   node publish-plan.mjs leaks <plan.json> <file-or-dir>...
//       exit 1 iff any file names an excluded fact (quarantined, held, or judged false), by nodeKey or contentHash
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
 * The plan. `staged` is `[{ id, contentHash, fact }]` (judge.mjs `stagedFacts`), `judged` the judge.jsonl records.
 * A fact the judge marked false or unverifiable is held; a quarantined fact is never promoted; everything else
 * staged is promoted. Excluded = quarantined ∪ held, each with the identities a leak check looks for.
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
      contentHash: s.contentHash,
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

/** The refused rows of an `atlas promote` output whose reason is not `quarantined`. Held rows are skipped by
 *  promote (printed `held <key>`), never refused, so they need no allowance here. */
export function unexpectedRefusals(promoteStdout) {
  return promoteStdout
    .split("\n")
    .map((l) => /^\s*refused (\S+): (.*)$/.exec(l))
    .filter((m) => m !== null && !m[2].startsWith("quarantined"))
    .map((m) => `${m[1]}: ${m[2]}`)
}

/** Which excluded facts a text names, by nodeKey or contentHash: `[{ id, why, at }]`. */
export function leaks(excluded, files) {
  return files.flatMap(({ path, text }) =>
    excluded
      .filter((e) => text.includes(e.id) || (e.contentHash !== undefined && text.includes(e.contentHash)))
      .map((e) => ({ id: e.id, why: e.why, at: path })),
  )
}

const flag = (argv, name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined)
const filesOf = (path) => {
  if (!existsSync(path)) return []
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((entry) => filesOf(join(path, entry)))
}

async function main(argv) {
  const [command, ...rest] = argv
  if (command === "plan") {
    const out = rest[0]
    const judgePath = flag(rest, "--judge")
    const judged =
      judgePath !== undefined && existsSync(judgePath)
        ? readFileSync(judgePath, "utf8")
            .split("\n")
            .filter((l) => l.trim().length > 0)
            .map((l) => JSON.parse(l))
        : []
    const plan = computePlan(await stagedFacts(flag(rest, "--repo") ?? "."), judged)
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, "plan.json"), JSON.stringify(plan, null, 2) + "\n")
    for (const key of ["promote", "held", "units"]) writeFileSync(join(out, `${key}.txt`), plan[key].map((x) => `${x}\n`).join(""))
    console.log(
      `publish plan: promote ${plan.promote.length}, held ${plan.held.length}, quarantined ${plan.quarantined.length}, units ${plan.units.length}`,
    )
    return 0
  }
  if (command === "refusals") {
    const bad = unexpectedRefusals(readFileSync(rest[0], "utf8"))
    for (const line of bad) console.log(`::error::promote refused a candidate for a reason other than quarantine: ${line}`)
    return bad.length === 0 ? 0 : 1
  }
  if (command === "leaks") {
    const plan = JSON.parse(readFileSync(rest[0], "utf8"))
    const found = leaks(
      plan.excluded,
      rest.slice(1).flatMap(filesOf).map((path) => ({ path, text: readFileSync(path, "utf8") })),
    )
    for (const f of found) console.log(`::error::excluded fact ${f.id} (${f.why}) reached ${f.at}`)
    console.log(`publish leak check: ${found.length === 0 ? "clean" : `${found.length} leak(s)`}`)
    return found.length === 0 ? 0 : 1
  }
  console.error("usage: publish-plan.mjs plan|refusals|leaks …")
  return 1
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2))
}
