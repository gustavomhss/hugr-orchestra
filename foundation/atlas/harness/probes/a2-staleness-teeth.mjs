#!/usr/bin/env node
// harness/probes/a2-staleness-teeth.mjs — MUTATION TEETH for the A2 corpus: is `true_stale_caught=6/6`
// a real measurement of drift detection, or a tautology any dumb verdict function would also pass?
//
// WHAT. Scores `a2-corpus/index.mjs`'s own labeled `base`/`mutated` byte pairs (the SAME ten entries
// `a2-staleness.mjs` drives through the real product oracle) against five deliberately DUMB, hand-written
// verdict functions below, plus the real oracle (reused via `scoreCorpus` from `./a2-staleness.mjs`, never
// reimplemented). Every dumb verdict function is a PURE function of an entry's own `base`/`mutated`
// strings — no product import, no parsing library, no `@atlas/*` — because the question this file answers
// is "how much of the corpus's signal survives if the checker does nothing intelligent at all", and that
// question is only honest if the dumb checkers really are dumb. See `docs/design/95b-staleness-a2-methodology.md`
// §6 for what the resulting matrix means (the tautology finding: every `invalidating` row is won by
// `always-DRIFTED` too, because a byte edit inside the hashed extent making the hash change is a theorem,
// not a finding; all the corpus's real discriminating power lives in the four `preserving` rows).
//
// Run it standalone (from repo root, after `npm run build` so the real-oracle row can resolve dist/):
//
//   node harness/probes/a2-staleness-teeth.mjs

import { fileURLToPath } from "node:url"
import { CORPUS } from "./a2-corpus/index.mjs"
import { scoreCorpus } from "./a2-staleness.mjs"

// ── dumb mutant #1 — "any byte in the anchor file changed" (whole-file byte equality, no unit awareness) ──
function verdictAnyByteChanged(entry) {
  return entry.base === entry.mutated ? "FRESH" : "DRIFTED"
}

// ── dumb mutant #2/#3 — trivial constants ───────────────────────────────────────────────────────────────
function verdictAlwaysDrifted(_entry) {
  return "DRIFTED"
}
function verdictAlwaysFresh(_entry) {
  return "FRESH"
}

// ── dumb mutant #4 — line-range oracle: DRIFTED iff the file's total LINE COUNT changed, else FRESH,
//    regardless of what the content on those lines says. The classic naive positional tracker: it notices
//    lines being inserted/deleted, never a same-line content edit. ─────────────────────────────────────
function verdictLineRangeOracle(entry) {
  const lines = (s) => s.split("\n").length
  return lines(entry.base) === lines(entry.mutated) ? "FRESH" : "DRIFTED"
}

// ── dumb mutant #5 — naive declaration-slice: locate the anchor's OWN declaration line by a bare
//    `needle(` regex (no AST, no doc-comment binding — deliberately does NOT walk upward past the
//    declaration's own line), take the brace-balanced slice from there, compare LITERAL bytes (no NFC
//    normalization). Unresolvable in the mutated text (e.g. the cited name was renamed) is fail-closed
//    DRIFTED, matching the real oracle's own fail-closed convention (GROUND-3) — the one piece of
//    sophistication this mutant is given, because without it every rename case would trivially score FRESH
//    for a reason that has nothing to do with rename detection. ────────────────────────────────────────
function declSlice(text, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = new RegExp(`\\b${escaped}\\s*\\(`).exec(text)
  if (match === null) return undefined
  const lineStart = text.lastIndexOf("\n", match.index) + 1
  const braceStart = text.indexOf("{", match.index)
  if (braceStart === -1) return undefined
  let depth = 0
  let i = braceStart
  for (; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1
    else if (text[i] === "}") {
      depth -= 1
      if (depth === 0) {
        i += 1
        break
      }
    }
  }
  return text.slice(lineStart, i)
}
function verdictNaiveDeclSlice(entry) {
  if (entry.anchor.file === true) return entry.base === entry.mutated ? "FRESH" : "DRIFTED"
  const before = declSlice(entry.base, entry.anchor.needle)
  const after = declSlice(entry.mutated, entry.anchor.needle)
  if (before === undefined || after === undefined) return "DRIFTED" // fail-closed, unresolved
  return before === after ? "FRESH" : "DRIFTED"
}

const MUTANTS = [
  ["naive any-byte-in-file-changed", verdictAnyByteChanged],
  ["always-DRIFTED (trivial constant)", verdictAlwaysDrifted],
  ["always-FRESH (trivial constant)", verdictAlwaysFresh],
  ["naive declaration-slice (no NFC, no doc-comment binding)", verdictNaiveDeclSlice],
  ["line-range oracle (line-count-changed heuristic)", verdictLineRangeOracle],
]

/** Score one verdict function against the corpus. Same confusion-matrix shape as `scoreCorpus`'s, so a
 *  reader can diff this against the real oracle's row directly. */
function scoreVerdictFn(fn, corpus) {
  const matrix = { true_stale_caught: 0, true_stale_missed: 0, correct_fresh: 0, false_stale: 0 }
  for (const entry of corpus) {
    const actual = fn(entry)
    if (entry.class === "invalidating") {
      if (actual === entry.expected) matrix.true_stale_caught += 1
      else matrix.true_stale_missed += 1
    } else {
      if (actual === entry.expected) matrix.correct_fresh += 1
      else matrix.false_stale += 1
    }
  }
  return matrix
}

function fmtRow(label, m) {
  const invTotal = m.true_stale_caught + m.true_stale_missed
  const preTotal = m.correct_fresh + m.false_stale
  const total = m.true_stale_caught + m.correct_fresh
  const totalOf = invTotal + preTotal
  return `${label.padEnd(58)} ${String(m.true_stale_caught).padStart(2)}/${invTotal}   ${String(m.correct_fresh).padStart(2)}/${preTotal}   ${total}/${totalOf}`
}

function main() {
  const real = scoreCorpus(CORPUS)
  const lines = []
  lines.push("A2 mutation-teeth matrix — real oracle vs. deliberately dumb mutants, same 10-entry corpus")
  lines.push("")
  lines.push(`${"checker".padEnd(58)} stale   fresh   total`)
  lines.push(fmtRow("real oracle (reDerives, subtree hash)", real.matrix))
  for (const [label, fn] of MUTANTS) {
    lines.push(fmtRow(label, scoreVerdictFn(fn, CORPUS)))
  }
  lines.push("")
  lines.push("stale = true_stale_caught / invalidating-total   fresh = correct_fresh / preserving-total")
  lines.push("Read: every `invalidating` row a dumb mutant wins is a THEOREM (byte edit inside the hashed")
  lines.push("extent flips the hash), not a discriminating measurement — see 95b-staleness-a2-methodology.md §6.")
  console.log(lines.join("\n"))
}

// Exported for `a2-staleness-teeth.test.mjs`, which pins the dumb-mutant rows WITHOUT paying the real
// oracle's throwaway-git-repo cost a second time (that cost is already paid once by `a2-staleness.test.mjs`).
export { MUTANTS, scoreVerdictFn, fmtRow }

// ── CLI entrypoint ──────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
