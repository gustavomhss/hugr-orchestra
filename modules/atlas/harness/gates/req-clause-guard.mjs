#!/usr/bin/env node
// req-clause-guard — a REQ's `normative-clause` must still exist in the invariant it cites.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
// Every requirement in this corpus carries the invariant clause it realizes, VERBATIM:
//
//     source: INV-TOOLS-6 @ reference/atlas-tools.md#tools-6
//     normative-clause: "return a `≤ ~2K` **governing** pack of `tier≥T1` invariants"
//
// Nothing resolved that pointer. The *satisfies* trace this repo is built on was unverified at exactly the
// link where it rots: amend an invariant, and every REQ quoting it keeps asserting the retired text with no
// gate noticing. It had already happened — ADR-0013 (owner-ratified 2026-08-03) gave the query pack a second
// ADVISORY band while `INV-TOOLS-6` still described a single `≤ ~2K` pack of `tier≥T1` invariants, and six
// requirements cited that invariant as their source.
//
// `spec-conformance-guard`'s check (4) is the sibling of this one and cannot see it: it enforces that an
// amendment was VISITED in every restatement, keying on the word `AMENDED`. It never reads what the
// restatement SAYS. This gate is separate rather than a fifth check there for one measured reason — the
// check plus its ledger puts that file at 433 lines, over the repo's 400-LOC cap (`godfile-guard`).
//
// ── THE CORPUS ───────────────────────────────────────────────────────────────────────────────────────
// Every `### REQ-…` block in the REQ-OWNER FAMILY: `req-<m>.md` AND `requirements-<m>.md`, which is the
// family `id-integrity.mjs` calls `OWNER.REQ`. Keying on `req-*.md` alone — the obvious reading — silently
// drops the 142 REQs of `requirements-adapters.md` + `requirements-authoring.md`, 22% of the corpus.
//
// ── THE COMPARISON, AND EVERY DEVIATION FROM RAW BYTES ───────────────────────────────────────────────
// Containment of the quote in the cited invariant's own block, with exactly four rules, each measured:
//
//   1. WHITESPACE COLLAPSED. Byte-exact containment holds for 281/636 evaluable rows; collapsing runs of
//      whitespace to one space raises it to 570. The whole gap is line WRAPPING — the reference docs
//      hard-wrap invariant prose at ~110 columns and the REQ quotes it on one line. The amendment that
//      shipped with this gate wraps mid-clause itself.
//   2. `\"` UNESCAPED. The corpus escapes a quote INSIDE the quoted span (`"never as \"the claim is
//      true.\""` ← GROUND-11's own inner quotation). Nothing else is unescaped.
//   3. `…` (U+2026) IS ELISION. 30 clauses quote with it: `"MUST return exactly the groundable units the
//      built index carries under `path` … MUST NOT invent, omit"`. An elided quote is a SEQUENCE of
//      fragments, so every fragment must occur verbatim, IN ORDER, left to right. ASCII `...` is NOT
//      treated as elision — it appears literally in quoted code and prose.
//   4. HTML COMMENTS STRIPPED from the invariant side. This is the sharpest edge here. The house records an
//      amendment as `<!-- AMENDED <date>: was "<the retired sentence>" -->` INSIDE the amended block — a
//      tombstone quoting the old text verbatim. MEASURED while building this gate: with comments included,
//      amending `INV-TOOLS-6` and adding its house-form amendment note left `REQ-TOOLS-6b`'s stale quote
//      still resolving — into the tombstone. The gate reported OK on the exact edit it exists to catch. A
//      guard a correctly-written amendment note switches off is worse than no guard.
//
// NOTHING ELSE is normalised. No case folding (`MUST` ≠ `must`), no markdown stripping (the amendment above
// turns "pack" into "**governing** pack" — a gate blind to `**` could not see it), no punctuation folding.
// Each would let a genuine rewording pass, which is the hole this closes.
//
// ── WHAT IT CANNOT DO, stated rather than implied ────────────────────────────────────────────────────
//   • It proves the quote still EXISTS upstream, never that the REQ's prose is a faithful reading of it.
//     That is semantics and it stays with the reviewer.
//   • It cannot tell an authored clause from a rotted one. 50 rows quote text their invariant never
//     contained; only a human can say which was a lift that rotted and which was never a lift. They are in
//     the LEDGER, one reason each, printed on every run.
//   • ANCHOR PRECISION IS ONE-DEEP. 339 of the 636 evaluable rows cite an id with MORE THAN ONE carrier in
//     its file (the `## Invariants` bullet AND the numbered `## Acceptance` restatement of the same id).
//     The verdict is taken at the FIRST carrier — the invariant statement, since bullets precede the
//     acceptance list in every reference doc here — and when that misses, a later hit is REPORTED, never
//     silently accepted. On this corpus it decides exactly one row (`REQ-TOOLS-9b`).

//
// ── THE SECOND LEG: WAIVER COVERAGE (issue #199) ─────────────────────────────────────────────────────
// Everything above is PER-REQ, and that is precisely how the hole opened. A ledgered row is a WAIVED
// quote. Waive the LAST REQ citing an invariant and there is no live quote left to break, so the check
// above has nothing to say about that invariant — its whole normative text can be replaced by its own
// negation with every gate still green. It was reproduced on `INV-TOOLS-1`, the constitutional write-door
// invariant. So this gate also asks a PER-INVARIANT question: is anything still holding this text?
//
// An invariant whose every citing REQ diverges must carry a TEXT PIN in `harness/inv-text-pins.json`, and
// that pin must still match the tree. The pinned set is DERIVED from this run, never authored: a pin for
// an invariant that has a live quote again is STALE and fails, exactly as a stale ledger row does. The
// design, the reproduction, and why "require one live quote" was tested and REJECTED as the fix are in
// `harness/lib/inv-text-pin.mjs`.
//
// NO COUNT IS TRANSCRIBED HERE. The unprotected set, the near-misses and their members are DERIVED and
// PRINTED on every run, pass or fail, under `WAIVER COVERAGE` — a number in a comment rots away from the
// tree it described, and this repo has been bitten by exactly that.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { classifyCoverage, pinProblems, uncoveredCarriers } from "../lib/inv-text-pin.mjs"
import { holds as containsQuote } from "../lib/quote-coverage.mjs"

// Repo root, OVERRIDABLE so the gate's own test can point it at a fixture tree — the same seam
// `id-integrity.mjs` and `godfile-guard.mjs` use. Without it the ratchet below is a branch no test can
// reach, and a ledger nobody can falsify is not a ratchet.
const ROOT = process.env.REQ_CLAUSE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const DOCS = join(ROOT, "docs")
const REQ_DIR = join(DOCS, "requirements")

/**
 * Pre-existing divergences, by stable key. SHRINK-ONLY: a stale entry FAILS this gate, exactly as in
 * `id-integrity.mjs`, so the ledger can never rot into a permanent exemption.
 *
 * Keyed `<REQ id> @ <sha256(quote)[:8]>` — re-wording a quote changes its key, so an edit cannot hide
 * behind an old entry; it must be fixed or re-ledgered deliberately.
 *
 * IT IS A SIDECAR FILE AND THAT IS A CHOICE WITH A COST, stated rather than hidden: `.json` is outside
 * `godfile-guard`'s `.mjs` scope, so externalising 52 lines of table does duck the LOC cap for them. It
 * sits at `harness/` root rather than in `gates/` ("files that CAN FAIL, run by name in CI") or `lib/`
 * ("everything a gate imports") because it is neither. The cap exists against complex modules and a flat
 * key→reason table is not one — but it is READ as part of this gate, so it is printed in full on every run.
 */
const LEDGER = new Map(
  Object.entries(
    process.env.REQ_CLAUSE_ROOT !== undefined
      ? JSON.parse(process.env.REQ_CLAUSE_LEDGER ?? "{}")
      : JSON.parse(readFileSync(join(ROOT, "harness/req-clause-ledger.json"), "utf8")),
  ),
)

/**
 * Text pins for the invariants NOTHING else holds. Same seam and same shrink-only discipline as the
 * ledger above; see `harness/lib/inv-text-pin.mjs` for the reproduction that made this necessary and for
 * why "at least one live quote" was tested and rejected as the fix. The pinned SET is derived from this
 * run, never authored: an entry for an invariant that has a live quote again FAILS as stale.
 */
const PIN_FILE = "harness/inv-text-pins.json"
const PINS =
  process.env.REQ_CLAUSE_ROOT !== undefined
    ? JSON.parse(process.env.REQ_CLAUSE_PINS ?? "{}")
    : JSON.parse(readFileSync(join(ROOT, PIN_FILE), "utf8"))

if (!existsSync(REQ_DIR)) {
  // A gate that cannot build its corpus has checked NOTHING and must say so rather than exit 0.
  console.error(`req-clause-guard: FAIL\n\n  ✗ requirement corpus missing: ${REQ_DIR}`)
  process.exit(1)
}

const norm = (s) => s.replace(/\s+/g, " ").trim()
const key8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8)

/** A field value: the `name:` line plus its indented continuation, ending at a blank line, the next field,
 *  an HTML comment or a blockquote — the corpus's own block shape. Clauses wrap across lines (7 do). */
function fieldValue(body, name) {
  const i = body.findIndex((l) => l.startsWith(`${name}:`))
  if (i < 0) return null
  const acc = [body[i].slice(name.length + 1).trim()]
  for (let j = i + 1; j < body.length; j++) {
    if (body[j].trim() === "" || /^[a-z_-]+:\s/.test(body[j]) || /^[<>#]/.test(body[j])) break
    acc.push(body[j])
  }
  return acc.join("\n")
}

/** Does the quote still hold in this invariant text? Rules 1 + 3 of the header. The body lives in
 *  `harness/lib/quote-coverage.mjs` so the coverage measurement (issue #208) reuses the EXACT test this
 *  gate publishes its verdicts with; two implementations could disagree and only one of them gates. */
const holds = (quote, invText) => containsQuote(quote, invText, norm)

/**
 * EVERY carrier of an anchor, in document order. Three carrier shapes exist in `docs/reference/**` and all
 * three are resolved: a bullet (`- **TOOLS-6 …`), a TABLE ROW (`| **KNOW-3** …`, how atlas-knowledge and
 * atlas-memory state theirs) and an explicit `<a id="author-1">`. Matching is case-insensitive because the
 * anchor is a slug (`#persist-10a` → `**PERSIST-10a`). A block runs to the next carrier or `---`.
 */
const DEFLINE = /^(?:\s*[-*]\s+(?:<a id="[^"]*"><\/a>)?\*\*|\s*\|\s*\*\*|#{1,6}\s+|\s*\d+\.\s+\*\*)/
const srcCache = new Map()
function invCarriers(path, anchor) {
  const abs = join(DOCS, path)
  if (!srcCache.has(abs)) srcCache.set(abs, existsSync(abs) ? readFileSync(abs, "utf8").split("\n") : null)
  const lines = srcCache.get(abs)
  if (lines === null) return { err: `cited file docs/${path} does not exist` }
  const ID = anchor.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const idRe = new RegExp(`\\*\\*${ID}(?![A-Z0-9-])|^#{1,6}\\s+${ID}(?![A-Z0-9-])`, "i")
  const heads = []
  lines.forEach((l, i) => {
    if (l.includes(`<a id="${anchor}">`) || (DEFLINE.test(l) && idRe.test(l))) heads.push(i)
  })
  if (heads.length === 0)
    return { err: `no invariant block for '#${anchor}' in docs/${path} (no <a id>, no bold/heading '${anchor}')` }
  return {
    carriers: heads.map((h) => {
      let end = lines.length
      for (let j = h + 1; j < lines.length; j++)
        if (DEFLINE.test(lines[j]) || /^---/.test(lines[j])) {
          end = j
          break
        }
      return {
        line: h + 1,
        text: lines
          .slice(h, end)
          .join("\n")
          .replace(/<!--[\s\S]*?-->/g, " "),
      }
    }),
  }
}

/** `### REQ-…` blocks of one requirement document; a block owns every line to the next `### ` or `## `. */
function reqBlocks(name) {
  const out = []
  let cur = null
  readFileSync(join(REQ_DIR, name), "utf8")
    .split("\n")
    .forEach((line, i) => {
      const h = /^###\s+(REQ-[A-Za-z0-9][A-Za-z0-9.-]*?)(?=\s|$)/.exec(line)
      if (h !== null) {
        cur = { id: h[1], line: i + 1, body: [] }
        out.push(cur)
        return
      }
      if (/^##\s/.test(line)) {
        cur = null
        return
      }
      if (cur !== null) cur.body.push(line)
    })
  return out
}

const reqFiles = readdirSync(REQ_DIR)
  .filter((f) => /^(req|requirements)-[a-z-]+\.md$/.test(f))
  .sort()
const problems = []
const unevaluable = []
const diverged = new Map()
const perFile = []
const fired = new Set()
const multiAnchors = new Map()
const coverage = new Map()
const verdicts = []
let total = 0
let checked = 0
let multiCarrier = 0

for (const name of reqFiles) {
  const blocks = reqBlocks(name)
  let ok = 0
  for (const b of blocks) {
    const at = `${name}:${b.line} ${b.id}`
    const src = fieldValue(b.body, "source")
    const clause = fieldValue(b.body, "normative-clause")
    if (src === null) {
      unevaluable.push(`${at} — no 'source:' field`)
      continue
    }
    if (clause === null) {
      unevaluable.push(`${at} — no 'normative-clause:' field`)
      continue
    }
    const ptr = /^(INV-[A-Za-z0-9-]+)\s*@\s*([A-Za-z0-9._/-]+\.md)#([A-Za-z0-9._-]+)/.exec(src)
    if (ptr === null) {
      unevaluable.push(
        `${at} — 'source:' carries no INV@path#anchor pointer: ${JSON.stringify(src.split("\n")[0].slice(0, 90))}`,
      )
      continue
    }
    const a = clause.indexOf('"')
    const z = clause.lastIndexOf('"')
    if (a < 0 || z <= a) {
      unevaluable.push(
        `${at} — 'normative-clause:' carries no quoted span: ${JSON.stringify(clause.split("\n")[0].slice(0, 90))}`,
      )
      continue
    }
    const quote = clause
      .slice(a + 1, z)
      .split('\\"')
      .join('"')
    const inv = invCarriers(ptr[2], ptr[3])
    if (inv.err !== undefined) {
      unevaluable.push(`${at} — ${inv.err}`)
      continue
    }
    checked++
    if (inv.carriers.length > 1) {
      multiCarrier++
      multiAnchors.set(
        `docs/${ptr[2]}#${ptr[3]}`,
        inv.carriers.map((c) => c.line),
      )
    }
    const q = norm(quote)
    const primary = inv.carriers[0]
    const anchorKey = `docs/${ptr[2]}#${ptr[3]}`
    if (!coverage.has(anchorKey)) coverage.set(anchorKey, { live: [], waived: [], carriers: inv.carriers, quotes: [] })
    if (holds(q, primary.text)) {
      ok++
      coverage.get(anchorKey).live.push(b.id)
      coverage.get(anchorKey).quotes.push({ req: b.id, q, live: true })
      verdicts.push(`OK        ${at} → ${anchorKey}:${primary.line}`)
      continue
    }
    coverage.get(anchorKey).waived.push(b.id)
    coverage.get(anchorKey).quotes.push({ req: b.id, q, live: false })
    verdicts.push(`DIVERGED  ${at} → ${anchorKey}:${primary.line}`)
    // The first point of difference, so the refusal is actionable without opening a debugger.
    const t = norm(primary.text)
    let pre = 0
    while (pre < q.length && t.includes(q.slice(0, pre + 1))) pre++
    const elsewhere = inv.carriers
      .slice(1)
      .filter((c) => holds(q, c.text))
      .map((c) => c.line)
    diverged.set(`${b.id} @ ${key8(quote)}`, { at, ptr, q, pre, invLine: primary.line, elsewhere })
  }
  total += blocks.length
  perFile.push({ name, n: blocks.length, ok })
}

for (const [k, d] of diverged) {
  if (LEDGER.has(k)) {
    fired.add(k)
    continue
  }
  problems.push(
    `${d.at} quotes ${d.ptr[1]} (docs/${d.ptr[2]}#${d.ptr[3]}, block at line ${d.invLine}) but that text is NOT in ` +
      `the invariant. Diverges after ${d.pre} char(s): matched ${JSON.stringify(d.q.slice(0, d.pre).slice(-60))} then ` +
      `wanted ${JSON.stringify(d.q.slice(d.pre, d.pre + 60))}. Either the invariant was amended and this quote was not ` +
      `fanned out, or the quote was never a lift — fix one, or ledger it in harness/req-clause-ledger.json under the ` +
      `key "${k}" with a reason.` +
      (d.elsewhere.length > 0
        ? ` NOTE: the text DOES occur at another carrier of the same id (line ${d.elsewhere.join(", ")}) — the CITED anchor's own block does not carry it.`
        : ""),
  )
}
// ── WAIVER COVERAGE ──────────────────────────────────────────────────────────────────────────────────
// Every check above is per-REQ, and that is exactly how the hole opened: waive the last citing REQ and the
// invariant itself has no live quote left to break. This leg is per-INVARIANT.
const { unprotected, nearMiss } = classifyCoverage(coverage)
// Which live quotes reach WHICH carrier. `holds` is the same test the verdicts above were taken with, so
// the pinned set cannot disagree with the pass set. A quote is LIVE iff it holds at carrier 1, which is why
// carrier 1's entry here is empty exactly when the invariant is 100% waived — #124's rule, at ordinal 1.
for (const v of coverage.values()) {
  v.carrierLive = v.carriers.map((c) => v.quotes.filter((q) => q.live && holds(q.q, c.text)).map((q) => q.req))
}
const uncovered = uncoveredCarriers(coverage)
for (const p of pinProblems(uncovered, PINS, PIN_FILE)) problems.push(p)

for (const k of LEDGER.keys()) {
  if (!fired.has(k)) {
    problems.push(
      `RATCHET '${k}' is ledgered as a pre-existing divergence but no longer fires — it was fixed, or its quote was ` +
        `reworded (the key pins the quote's digest). Delete the entry from harness/req-clause-ledger.json so the ledger keeps shrinking.`,
    )
  }
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────────
// I4 — every row this gate CANNOT evaluate is named on EVERY run, pass or fail. A skipped row is the same
// hole with a gate in front of it, so it is never counted as a pass and never silently dropped.
console.log(
  `req-clause-guard: ${checked} of ${total} REQ evaluated across ${reqFiles.length} requirement docs; ` +
    `${checked - diverged.size} quotes resolve into the cited invariant's OWN block, ${diverged.size} diverge ` +
    `(${LEDGER.size} ledgered); ${multiCarrier} cite an id with more than one carrier — judged at the FIRST.`,
)
for (const p of perFile) console.log(`    · ${p.name}: ${p.n} REQ, ${p.ok} clause-in-invariant`)
console.log(
  `  UNEVALUABLE (${unevaluable.length}) — carries no resolvable REQ→INV quote, so NOTHING is asserted about it:`,
)
for (const u of unevaluable) console.log(`    · ${u}`)
console.log(`  LEDGERED (${LEDGER.size}, shrink-only — a stale entry FAILS this gate):`)
for (const [k, why] of LEDGER) console.log(`    · ${k} — ${why}`)
const carrierTotal = [...coverage.values()].reduce((n, v) => n + v.carriers.length, 0)
console.log(
  `  WAIVER COVERAGE — ${coverage.size} invariant(s) cited by at least one evaluable REQ, carried at ` +
    `${carrierTotal} site(s); ${carrierTotal - uncovered.length} carrier(s) are reached by a live quote and ` +
    `${uncovered.length} are reached by NONE, so those are held ONLY by a text pin in ${PIN_FILE}. Of the ` +
    `uncovered, ${uncovered.filter((c) => c.first).length} are the invariant statement itself and ` +
    `${uncovered.filter((c) => !c.first).length} are ## Acceptance restatements. ${unprotected.length} ` +
    `invariant(s) have ZERO live quote anywhere; ${nearMiss.length} are one waiver away.`,
)
// I4/C1 — the pinned set is a LIST, never a number: a declaration whose members are a count cannot be audited.
for (const c of uncovered) {
  console.log(
    `    · HELD ONLY BY A PIN  ${c.key} (line ${c.line}, carrier ${c.ordinal}/${c.of}) — ` +
      `${PINS[c.key] !== undefined ? "PINNED" : "NOT PINNED"}`,
  )
}
for (const i of nearMiss) {
  console.log(
    `    · ONE QUOTE FROM IT     ${i.anchor} — live [${i.live.join(", ")}], waived ${i.waived.length} ` +
      `[${i.waived.join(", ")}]. NOTE: a quote is a FRAGMENT; see harness/lib/inv-text-pin.mjs.`,
  )
}
// The multi-carrier count is a DECLARED limit, so it names its members: a declaration whose members are a
// number and not a list cannot be audited.
console.log(
  `  MULTI-CARRIER ANCHORS (${multiAnchors.size} distinct) — judged at the FIRST carrier, later ones reported on a miss:`,
)
for (const [a, ls] of [...multiAnchors].sort())
  console.log(`    · ${a} → carriers at ${ls.join(", ")} (judged at ${ls[0]})`)
// The 586 clean matches are summarised per file above; `REQ_CLAUSE_LIST=1` prints the per-REQ verdict for
// every evaluated row, so the pass set is inspectable and not merely counted.
if (process.env.REQ_CLAUSE_LIST !== undefined) for (const v of verdicts) console.log(`    ${v}`)
// MACHINE-READABLE DUMP of exactly what this run judged: every cited anchor, its carriers and every citing
// REQ's quote with the gate's OWN live/waived verdict. Off by default and it changes no verdict; it exists so
// the coverage measurement of issue #208 enumerates from THIS run rather than from a second parser that
// could disagree with it. The 12 `ARCH-*` invariants are the standing proof that a second enumerator
// silently misses whole families.
if (process.env.REQ_CLAUSE_DUMP !== undefined) {
  writeFileSync(
    process.env.REQ_CLAUSE_DUMP,
    JSON.stringify([...coverage].map(([anchor, v]) => ({ anchor, carriers: v.carriers, quotes: v.quotes }))),
  )
  console.log(`  DUMP — ${coverage.size} cited anchor(s) written to ${process.env.REQ_CLAUSE_DUMP}`)
}

if (problems.length > 0) {
  console.error(`\nreq-clause-guard: FAIL — ${problems.length} problem(s):`)
  for (const p of problems) console.error("  ✗ " + p)
  process.exit(1)
}
console.log(`req-clause-guard: OK — every evaluable REQ's normative-clause still occurs in the invariant it cites.`)
