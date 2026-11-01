// The automated judge for an Atlas genesis run (genesis-hardening S11, owner decision: no human in the volume
// loop). A deterministic sample of the run's staged, non-quarantined candidates is shown to an independent model
// with only the claim and the source it cites; the verdicts decide whether the run may be published.
//
// This script never spawns a process (the repository's spawn gate covers script/). The workflow runs the model
// over the prompt files `prepare` writes, and `check` / `score` read what came back:
//
//   node judge.mjs prepare <dir> --repo <repo> --seed <seed>   sample, write <dir>/<i>.prompt + sample.json
//   node judge.mjs check <file>                                exit 0 iff <file> holds one valid verdict line
//   node judge.mjs score <dir> [--binding] [--summary <file>]   write judge.jsonl + judge-verdict.json
//
// The bar: trueRate ≥ 0.88, trueNonObviousRate ≥ 0.40 (true AND non-obvious, over the sample), failedCalls ≤ 10%
// of the sample. With --binding (a publishing run) a miss exits 1; otherwise it is reported only.
import { createHash, randomBytes } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const BAR = { trueRate: 0.88, trueNonObviousRate: 0.4, failedShare: 0.1 }
const SOUND_ARMS = new Set(["dependency", "count", "definition"])
const WINDOW = 40
const MAX_CHARS = 12000

// ── sampling ─────────────────────────────────────────────────────────────────────────────────────────────

/** The arm a staged fact came from, read off the fact itself: a sound slot names its arm; any other slot is
 *  the semantic arm; no slot is the advisory arm. */
export function armOf(fact) {
  const slot = fact.predicateSlot ?? fact.witness?.slot
  if (slot === undefined) return "advisory"
  return SOUND_ARMS.has(slot) ? slot : "semantic"
}

/** How many facts to judge out of `eligible`: all of them under 20, else 10% bounded to [20, 60]. */
export function sampleSize(eligible) {
  if (eligible < 20) return eligible
  return Math.min(60, Math.max(20, Math.ceil(eligible * 0.1)))
}

/** Per-arm quotas summing to `n`, proportional to `counts` (largest remainder), at least 1 for every arm that
 *  staged anything, never more than an arm staged. Arms are taken in name order, so the split is deterministic. */
export function allocate(counts, n) {
  const arms = Object.keys(counts)
    .filter((a) => counts[a] > 0)
    .sort()
  const total = arms.reduce((s, a) => s + counts[a], 0)
  if (total === 0 || n === 0) return {}
  const exact = Object.fromEntries(arms.map((a) => [a, (n * counts[a]) / total]))
  const quota = Object.fromEntries(arms.map((a) => [a, Math.min(counts[a], Math.max(1, Math.floor(exact[a])))]))
  const sum = () => arms.reduce((s, a) => s + quota[a], 0)
  const byRemainder = [...arms].sort((a, b) => exact[b] - Math.floor(exact[b]) - (exact[a] - Math.floor(exact[a])) || (a < b ? -1 : 1))
  while (sum() < n) {
    const next = byRemainder.find((a) => quota[a] < counts[a] && quota[a] < Math.ceil(exact[a])) ?? arms.find((a) => quota[a] < counts[a])
    if (next === undefined) break
    quota[next] += 1
  }
  while (sum() > n) {
    const largest = [...arms].sort((a, b) => quota[b] - quota[a] || (a < b ? -1 : 1)).find((a) => quota[a] > 1)
    if (largest === undefined) break
    quota[largest] -= 1
  }
  return quota
}

/** A deterministic PRNG (mulberry32) seeded from a string. */
export function prng(seed) {
  let h = 2166136261
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  let s = h >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The sample: `eligible` is `[{ id, arm, ... }]`; same input and seed ⇒ same sample, in id order per arm. */
export function sample(eligible, seed) {
  const n = sampleSize(eligible.length)
  const byArm = new Map()
  for (const e of [...eligible].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)))
    byArm.set(e.arm, [...(byArm.get(e.arm) ?? []), e])
  const quota = allocate(Object.fromEntries([...byArm].map(([a, list]) => [a, list.length])), n)
  return [...byArm.keys()].sort().flatMap((arm) => {
    const rand = prng(`${seed}:${arm}`)
    const shuffled = [...byArm.get(arm)]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, quota[arm] ?? 0).sort((a, b) => (a.id < b.id ? -1 : 1))
  })
}

// ── verdicts and the bar ─────────────────────────────────────────────────────────────────────────────────

/** The verdict in a model answer, or `null` when the answer is not exactly one valid verdict line. */
export function parseVerdict(text) {
  const lines = String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length !== 1) return null
  try {
    const v = JSON.parse(lines[0])
    if (v === null || typeof v !== "object") return null
    if (!["true", "false", "unverifiable"].includes(v.verdict)) return null
    if (typeof v.nonObvious !== "boolean" || typeof v.reason !== "string") return null
    return { verdict: v.verdict, nonObvious: v.nonObvious, reason: v.reason.slice(0, 200) }
  } catch {
    return null
  }
}

/** Fold the per-fact records (`{ verdict, nonObvious, failed }`) into the run verdict. */
export function score(records, promptHash) {
  const n = records.length
  const count = (f) => records.filter(f).length
  const t = count((r) => r.verdict === "true")
  const nonObviousTrue = count((r) => r.verdict === "true" && r.nonObvious)
  const failedCalls = count((r) => r.failed)
  const trueRate = n === 0 ? 0 : t / n
  const trueNonObviousRate = n === 0 ? 0 : nonObviousTrue / n
  return {
    n,
    true: t,
    false: count((r) => r.verdict === "false"),
    unverifiable: count((r) => r.verdict === "unverifiable"),
    nonObviousTrue,
    trueRate,
    trueNonObviousRate,
    failedCalls,
    promptHash,
    // An empty sample cannot pass: nothing was judged, so nothing may be published on its strength.
    pass:
      n > 0 &&
      trueRate >= BAR.trueRate &&
      trueNonObviousRate >= BAR.trueNonObviousRate &&
      failedCalls <= BAR.failedShare * n,
  }
}

// ── the prompt ───────────────────────────────────────────────────────────────────────────────────────────

/** The fields that carry text a model or the repository wrote: each is fenced as data (see judge-prompt.md). */
const FENCED = new Set(["SUBJECT", "CLAIM", "SOURCE", "RELATED"])

/**
 * Fill the template. Every untrusted field is wrapped in `<<<DATA <nonce>` … `DATA <nonce>>>>` lines, and the
 * prompt tells the judge that text inside is data, never instructions. The nonce is random per prompt and is
 * re-drawn if any field happens to contain it, so a claim cannot close its own fence.
 */
export function renderPrompt(template, fields, nonce = randomNonce(fields)) {
  return template.replace(/\{\{(NONCE|KIND|SUBJECT|CLAIM|SOURCE|RELATED)\}\}/g, (_, k) => {
    if (k === "NONCE") return nonce
    const value = fields[k.toLowerCase()] ?? ""
    return FENCED.has(k) ? `<<<DATA ${nonce}\n${value}\nDATA ${nonce}>>>` : value
  })
}

function randomNonce(fields) {
  const text = Object.values(fields).join("\n")
  for (;;) {
    const nonce = randomBytes(12).toString("hex")
    if (!text.includes(nonce)) return nonce
  }
}

/** `±WINDOW` numbered lines of `file` around the first line naming `name` (or its head), capped. */
/** A repo-relative path a fact or witness may name without leaving the checkout: not absolute (POSIX, UNC or a
 *  drive), no `..` or empty segment, no backslash, nothing under `.git/`. Fact paths are model-influenced data. */
export function safeRepoPath(path) {
  if (typeof path !== "string" || path.length === 0) return false
  if (path.includes("\\") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false
  const segments = path.split("/")
  return segments.every((s) => s !== "" && s !== "..") && segments[0] !== ".git" && !segments.includes(".git")
}

export function excerpt(repo, file, name) {
  if (!safeRepoPath(file)) return `(${file} refused: not a plain repo-relative path)`
  const abs = join(repo, file)
  if (!existsSync(abs) || !statSync(abs).isFile()) return `(${file} is not in the checkout)`
  const lines = readFileSync(abs, "utf8").split("\n")
  const hit = name === undefined ? -1 : lines.findIndex((l) => l.includes(name))
  const from = Math.max(0, (hit < 0 ? 0 : hit) - WINDOW)
  const to = Math.min(lines.length, (hit < 0 ? 0 : hit) + WINDOW + 1)
  const body = lines
    .slice(from, to)
    .map((l, i) => `${from + i + 1}: ${l}`)
    .join("\n")
    .slice(0, MAX_CHARS)
  return `${file} (lines ${from + 1}-${to})\n\n\`\`\`\n${body}\n\`\`\``
}

/** The unit name a site path ends in (`file::a.b` ⇒ `b`, `file#x` ⇒ `x`), or undefined for a whole file. */
const unitName = (qualifiedPath) => /(?:::|#)([^:#]+)$/.exec(qualifiedPath)?.[1]?.split(/[./]/).pop()

/** File and name a SCIP symbol points at, best effort: `… src/\`lib.ts\`/Hash#` ⇒ `src/lib.ts`, `Hash`. */
function symbolSite(symbol) {
  const descriptors = String(symbol).split(" ").slice(4).join(" ").replace(/`/g, "")
  const m = /^(.*?\.[A-Za-z]+)\/(.*)$/.exec(descriptors)
  return m === null ? undefined : { file: m[1], name: m[2].replace(/[#.()]+$/, "").split(/[#./]/).pop() }
}

export function filesUnder(root, dir, limit = 5000) {
  if (dir !== "." && !safeRepoPath(dir)) return []
  const out = []
  const walk = (d) => {
    if (out.length >= limit || !existsSync(d)) return
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      const p = join(d, entry.name)
      if (entry.isDirectory()) walk(p)
      else out.push(relative(root, p))
      if (out.length >= limit) return
    }
  }
  walk(join(root, dir))
  return out
}

/** The prompt fields for one fact. Only the claim, its subject and cited source: never the proposer's prompt,
 *  answer or derivation. */
export function factFields(repo, fact) {
  const entry = fact.grounding?.entries?.[0]
  const qualified = entry?.anchor?.qualifiedPath ?? ""
  const file = entry?.path ?? qualified.split(/::|#/)[0]
  const claim = fact.claimNorm ?? (fact.check !== undefined ? JSON.stringify(fact.check) : "")
  const related = []
  const w = fact.witness
  if (w !== undefined && (w.slot === "dependency" || w.slot === "count")) {
    related.push(
      `Proof target: ${w.target} within ${w.scope}${w.atLeast !== undefined ? `, at least ${w.atLeast} caller(s)` : ""}`,
    )
    const site = symbolSite(w.target)
    const match = site === undefined ? undefined : filesUnder(repo, w.scope).find((f) => f.endsWith(site.file))
    if (match !== undefined) related.push(excerpt(repo, match, site.name))
  }
  return {
    kind: `${fact.kind}${fact.predicateSlot !== undefined ? ` (${fact.predicateSlot})` : ""}`,
    subject: qualified || file,
    claim,
    source: file === "" ? "(no cited source)" : excerpt(repo, file, unitName(qualified)),
    related: related.length > 0 ? related.join("\n\n") : "(none)",
  }
}

// ── subcommands ──────────────────────────────────────────────────────────────────────────────────────────

const here = fileURLToPath(new URL(".", import.meta.url))
const template = () => readFileSync(join(here, "judge-prompt.md"), "utf8")
const hashOf = (text) => createHash("sha256").update(text).digest("hex")
const flag = (argv, name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined)

/** Read every staged row and its fact bytes through the BUILT adapter-io (the same door `atlas promote` reads).
 *  Shared with publish-plan.mjs. */
export async function stagedFacts(repo) {
  const { createDiskStore } = await import(
    pathToFileURL(resolve(repo, "modules/atlas/packages/adapter-io/dist/src/index.js")).href
  )
  const store = createDiskStore(join(repo, ".atlas", "cas"))
  const staged = store.commitStaging((p) => ({ out: p }))
  if (!staged.settled) throw new Error(`judge: the staging read refused (${staged.refusal})`)
  return [...staged.out.current.values()].flatMap((row) => {
    const fact = store.get(row.contentHash)
    return fact === undefined ? [] : [{ id: String(row.nodeKey), contentHash: String(row.contentHash), fact }]
  })
}

async function prepare(argv) {
  const dir = argv[0]
  const repo = flag(argv, "--repo") ?? "."
  const seed = flag(argv, "--seed") ?? "0"
  const eligible = (await stagedFacts(repo))
    .filter(({ fact }) => fact.quarantine === undefined)
    .map((e) => ({ ...e, arm: armOf(e.fact) }))
  const chosen = sample(eligible, seed)
  const text = template()
  mkdirSync(dir, { recursive: true })
  chosen.forEach((e, i) => writeFileSync(join(dir, `${String(i).padStart(3, "0")}.prompt`), renderPrompt(text, factFields(repo, e.fact))))
  writeFileSync(
    join(dir, "sample.json"),
    JSON.stringify(
      { seed, eligible: eligible.length, promptHash: hashOf(text), facts: chosen.map((e) => ({ id: e.id, arm: e.arm })) },
      null,
      2,
    ),
  )
  console.log(`judge: ${chosen.length} of ${eligible.length} eligible candidate(s) sampled (seed ${seed})`)
  return 0
}

function scoreDir(argv) {
  const dir = argv[0]
  const binding = argv.includes("--binding")
  const summary = flag(argv, "--summary")
  const meta = JSON.parse(readFileSync(join(dir, "sample.json"), "utf8"))
  const records = meta.facts.map((f, i) => {
    const out = join(dir, `${String(i).padStart(3, "0")}.out`)
    const v = existsSync(out) ? parseVerdict(readFileSync(out, "utf8")) : null
    return v === null
      ? { ...f, verdict: "unverifiable", nonObvious: false, reason: "no valid verdict after one retry", failed: true }
      : { ...f, ...v, failed: false }
  })
  const verdict = score(records, meta.promptHash)
  writeFileSync(join(dir, "judge.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""))
  writeFileSync(join(dir, "judge-verdict.json"), JSON.stringify(verdict, null, 2) + "\n")
  const pct = (x) => `${(x * 100).toFixed(1)}%`
  const md = [
    "### Judge",
    "",
    `Sampled ${verdict.n} of ${meta.eligible} eligible candidate(s) (seed ${meta.seed}); prompt \`${verdict.promptHash.slice(0, 12)}\`.`,
    "",
    "| true | false | unverifiable | true and non-obvious | failed calls | verdict |",
    "| ---- | ----- | ------------ | -------------------- | ------------ | ------- |",
    `| ${verdict.true} (${pct(verdict.trueRate)}) | ${verdict.false} | ${verdict.unverifiable} | ${verdict.nonObviousTrue} (${pct(verdict.trueNonObviousRate)}) | ${verdict.failedCalls} | ${verdict.pass ? "pass" : "FAIL"}${binding ? "" : " (advisory)"} |`,
    "",
    `Bar: true ≥ ${pct(BAR.trueRate)}, true and non-obvious ≥ ${pct(BAR.trueNonObviousRate)}, failed calls ≤ ${pct(BAR.failedShare)}.`,
  ].join("\n")
  if (summary !== undefined) appendFileSync(summary, `${md}\n`)
  else console.log(md)
  if (!verdict.pass) console.log(`::${binding ? "error" : "warning"}::judge: the sample did not meet the bar`)
  return verdict.pass || !binding ? 0 : 1
}

async function main(argv) {
  const [command, ...rest] = argv
  if (command === "prepare") return prepare(rest)
  if (command === "check") return parseVerdict(existsSync(rest[0] ?? "") ? readFileSync(rest[0], "utf8") : "") === null ? 1 : 0
  if (command === "score") return scoreDir(rest)
  console.error("usage: judge.mjs prepare|check|score …")
  return 1
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2))
}
