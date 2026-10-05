#!/usr/bin/env node
// harness/probes/a2r-reproof-teeth.mjs — MUTATION TEETH for the A2r corpus: which numbers `a2r-reproof.mjs`
// prints are real measurements of `reverifyFact`, and which are theorems any dumb verdict function would
// also pass?
//
// WHAT. Scores `a2r-corpus/index.mjs`'s own entries against FOUR deliberately dumb, hand-written verdict
// functions — never the real oracle, never `@atlas/*` — plus reports where the real oracle's own scored
// rows (from a `scoreCorpus()` run the caller supplies, so this file never re-pays the expensive rebuild
// cost) land relative to them. Mirrors `a2-staleness-teeth.mjs`'s finding almost exactly, restated for this
// axis: **the INVALIDATING half is structurally a theorem** — every entry in that class is LABELED with
// `expected: 'broken'` by construction (a corpus entry is only 'invalidating' because ITS AUTHOR decided
// the edit invalidates the witness), so the trivial constant `always-broken` ties every invalidating row
// for the same reason `always-DRIFTED` ties every A2 invalidating row: the class label already IS the
// answer, checked against nothing. This is not a defect unique to this corpus — it is a structural fact
// about any two-class perturb→detect corpus, named here so a reader of `a2r-reproof.mjs`'s clean-looking
// `true_stale_caught=4/4` never mistakes it for the strong half. **The PRESERVING half is where the real
// discriminating power has to live** — `always-re-proven` ties it just as trivially, but `naive-scope-only`
// (below) does NOT, and that gap is the actual finding.
//
// FOUR MUTANTS:
//   'always-broken' / 'always-re-proven'  — trivial constants; tie their own class by construction (above).
//   'naive-scope-only'  — 'broken' iff ANY edited file sits under the witness's own `scope` directory,
//                         regardless of whether the edit touches the target's name at all. A plausible
//                         first-draft implementation mistake (conflating "something changed near here" with
//                         "the specific reference broke") — and this corpus's whole `preserving` half is
//                         chosen so this mutant FAILS on it (every `preserving` entry edits a file inside
//                         the witness's own scope directory on purpose, `PR-W1`/`PR-W3` even edit the exact
//                         citing file — see the corpus header).
//   'name-vanish'       — 'broken' iff the target's bare short name (e.g. `defaultEncoder`) occurs, as a
//                         WHOLE WORD, in some edit's `find` text but not in that edit's `replace` text (a
//                         decent textual proxy for "the reference disappeared"). Reported, not treated as a
//                         corpus defect if it ties — a corpus small enough to be exhaustively hand-built
//                         from 4 witnesses may not yet contain an entry only a REAL scip-typescript rebuild
//                         (dist-form vs local-form symbol collapse, cross-package `canonicalizeSymbol`
//                         bridging, the four TAMPER bindings) can resolve and a name-continuity heuristic
//                         cannot — see the module's PUBLISHABLE section in the WP return for what this means.
//
// Run standalone: node harness/probes/a2r-reproof-teeth.mjs

import { fileURLToPath } from "node:url"
import { CORPUS } from "./a2r-corpus/index.mjs"

function alwaysBroken(_entry) {
  return "broken"
}
function alwaysReProven(_entry) {
  return "re-proven"
}

/** `scope`-only: ignores WHAT changed, only WHERE. */
function naiveScopeOnly(entry) {
  const touchesScope = entry.edits.some(
    (e) => e.file === entry.witness.scope || e.file.startsWith(`${entry.witness.scope}/`),
  )
  return touchesScope ? "broken" : "re-proven"
}

/** The target's bare identifier — the descriptor's trailing name component, punctuation stripped
 *  (`…/defaultEncoder.` → `defaultEncoder`, `…/VersionDelta#` → `VersionDelta`, `…/isWeakerTier().` →
 *  `isWeakerTier`). Pure string surgery, no SCIP parsing. */
function shortNameOf(target) {
  const last = target.split("/").pop() ?? target
  return last.replace(/[().#]+$/g, "")
}

function nameVanish(entry) {
  const name = shortNameOf(entry.witness.target)
  const wordRe = new RegExp(`\\b${name}\\b`)
  const vanished = entry.edits.some((e) => wordRe.test(e.find) && !wordRe.test(e.replace))
  return vanished ? "broken" : "re-proven"
}

const MUTANTS = [
  ["always-broken (trivial constant)", alwaysBroken],
  ["always-re-proven (trivial constant)", alwaysReProven],
  ["naive scope-only (any edit under witness.scope ⇒ broken)", naiveScopeOnly],
  ["name-vanish (target short name disappears from an edit, word-boundary)", nameVanish],
]

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
  return `${label.padEnd(66)} ${String(m.true_stale_caught).padStart(2)}/${invTotal}   ${String(m.correct_fresh).padStart(2)}/${preTotal}`
}

function main() {
  const lines = []
  lines.push("A2r mutation-teeth matrix — deliberately dumb mutants over the SAME corpus (no oracle run — data-only)")
  lines.push("")
  lines.push(`${"checker".padEnd(66)} invalidating   preserving`)
  for (const [label, fn] of MUTANTS) {
    lines.push(fmtRow(label, scoreVerdictFn(fn, CORPUS)))
  }
  lines.push("")
  lines.push("Read: invalidating = true_stale_caught/total; preserving = correct_fresh/total.")
  lines.push("always-broken ties EVERY invalidating row BY CONSTRUCTION (the class label IS the expected answer) —")
  lines.push("that half of `a2r-reproof.mjs`s matrix is a THEOREM, not a discriminating measurement, exactly the")
  lines.push("same structural fact `a2-staleness-teeth.mjs` found for A2. naive-scope-only ties invalidating (same")
  lines.push("reason: every invalidating edit here happens to land inside the witness scope) but FAILS preserving —")
  lines.push("the preserving half is where this corpus actually discriminates. See the module header for name-vanish.")
  console.log(lines.join("\n"))
}

export { MUTANTS, scoreVerdictFn, shortNameOf, fmtRow }

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
