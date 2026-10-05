#!/usr/bin/env node
// adr-citation-guard — every ADR this corpus CITES must be an ADR this corpus CONTAINS.
//
// ── THE DEFECT THIS EXISTS TO STOP RETURNING ─────────────────────────────────────────────────────────
// `ADR-0013` was cited by name in 24 places under `docs/` — including two RATIFIED rows of
// `requirements/invariant-register.md`, five clauses of `requirements/req-tls.md`, and ADR-0002 itself
// ("the consumer has arrived: ADR-0013's advisory band") — while `docs/adr/` ran `0001..0012` and stopped.
// Two PRs that IMPLEMENT the decision were merged; the document carrying the measurement they rest on sat
// on an unmerged branch and was very nearly deleted as debris. The repository is public, so for that whole
// window every one of those 24 pointers was an invitation to read a file that was not there.
//
// Nothing caught it. `id-integrity` is the corpus's id-graph gate and it does not see this: its ID-2/ID-5
// legs check `<relpath>.md#<ID>` POINTERS, and the corpus overwhelmingly cites ADRs the way prose does —
// the bare token `ADR-0013`, in a sentence, with no path beside it. `ADR-` appears in that gate's source
// only inside waiver strings. The citation form the corpus actually uses was the one form nothing checked.
//
// ── WHAT IT CHECKS ───────────────────────────────────────────────────────────────────────────────────
// Every `ADR-<NNNN>` token occurring anywhere in TWO corpora MUST resolve to a file matching
// `docs/adr/ADR-<NNNN>-*.md`:
//
//   · `docs/**/*.md`        — prose, requirements, ADRs themselves.
//   · `packages/**/*.ts`    — SOURCE AND TESTS (`.d.ts` excluded: generated, and it carries no prose).
//
// On failure it names `citing file:line → missing id` for EVERY occurrence, not the first: one missing ADR
// strands pointers in many files at once, and reporting only the first citer trains the reader to fix one
// line and re-run.
//
// ── WHY `packages/**` WAS ADDED (#192) ───────────────────────────────────────────────────────────────
// This gate shipped walking `docs/` alone, and its own header declared the code carriers out of scope "by
// construction". That declaration was the blind spot, not a boundary. RE-DERIVED with this gate's own regex
// over the tree at master `e4882a3` (the commit this extension was written against): of 520 `.ts` files
// under `packages/**`, **123 cite an ADR by name and 26 of those cite `ADR-0013`**, naming 12 distinct ADR
// ids — a larger citing population than the `docs/` tree that motivated the gate. Atlas's modules explain
// themselves in prose comments that reference decisions by id, so a deleted-or-renamed ADR strands more
// pointers in the code than in the documentation. Nothing about "the repo cites an ADR it does not contain"
// is less true one directory over, and the previous scope meant the gate could report OK over the majority
// of the citations.
//
// THOSE FIGURES ARE A DATED SNAPSHOT OF ONE NAMED TREE, not a live invariant — every commit can move them,
// and the gate asserts nothing about them. They are pinned to `e4882a3` for exactly the reason the previous
// header is quoted above: it carried "25 files" as a bare present-tense number, which was wrong by one and
// had no tree attached, so nobody could tell whether it was stale or simply mistaken. A count in a comment
// must name the tree it was measured on or it decays into a claim no reader can check. (The branch that
// introduced this extension adds one more citer of each — its own new blackbox story — which is precisely
// how easy it is to make the pair disagree if the two halves are read off different trees.)
//
// ── THE FIXTURE EXCLUSION, STATED EXACTLY (A4 — lead-ratified) ───────────────────────────────────────
// A test fixture may legitimately name an ADR that does not exist, in order to exercise this gate's own
// refusal. Exactly ONE path shape is excluded from the `packages/**` corpus:
//
//     packages/<pkg>/test/fixtures/**
//
// BOTH `test` and `fixtures` are matched as WHOLE PATH SEGMENTS, `fixtures` sits directly under the
// package's `test/` root, and `<pkg>` is a single segment. It is deliberately NOT a substring rule:
//   · `packages/cli/src/latest.ts` is scanned — `test` as a substring of a name excludes nothing.
//   · `packages/cli/test/mine-fixtures.ts` is scanned — `fixtures` in a FILE name excludes nothing, and
//     that file plus `packages/adapter-io/test/harness/governed-fixtures.ts` carry REAL `ADR-0008`
//     citations today, which a name-based rule would have silently dropped.
//   · `packages/*/src/**` can never be excluded, at any depth: the rule requires a `test` segment.
// The excluded set is PRINTED on every run, pass or fail. An exclusion nobody can see is a hiding place,
// and this one currently matches ZERO files — the gate says so rather than implying it swept them.
//
// The synthetic ids that motivated A4 (`ADR-0042`, `ADR-0043`, `ADR-0077`, `ADR-0099`) live in this gate's
// OWN twin, `harness/gates/adr-citation-guard.test.mjs`. `harness/` is in NEITHER corpus, so they are out of
// scope by the walk and not by the exclusion — the exclusion is a reserved, empty, declared door.
//
// The token is matched EVERYWHERE in the file — inside fenced blocks, inside tables, inside HTML comments.
// A reader following `ADR-0013` does not care that it was written inside a fence, and an illustrative
// placeholder ADR id is a shape this corpus does not use. Widening the gate later to exempt fences would
// mean a citation can be hidden from it by indenting four spaces.
//
// ── ANTI-VACUITY: EVERY WAY OF CHECKING NOTHING IS AN EXPLICIT FAILURE ───────────────────────────────
// The worst outcome for this gate is not a false alarm — it is a green run over an empty corpus. "All
// citations resolve" and "the walk found nothing" print the same word. This repo has already shipped two
// files that sat in `harness/gates/`, ran to completion and exited 0 having asserted nothing (#172), so
// each of these is a NAMED refusal rather than a vacuous pass:
//
//   A-0  `docs/` does not exist.
//   A-1  the `docs/**/*.md` walk resolves EMPTY — nothing scanned is not a clean scan.
//   A-2  `docs/adr/` does not exist — an absent ADR directory satisfies every citation by making the
//        index empty, which is precisely the state that produced the defect above, inverted.
//   A-3  `docs/adr/` contains ZERO files matching `ADR-<NNNN>-*.md` — an empty index is not "all
//        citations satisfied", and a corpus that cites ADRs while owning none is not a state this
//        repository can reach by accident.
//   A-4  `packages/` does not exist. Added with the second corpus and for the same reason as A-0: a gate
//        that widened its success line to name `packages/**` must not print it over a directory it never
//        opened.
//   A-5  the `packages/**/*.ts` walk resolves EMPTY. This is the branch that would have made #192's fix
//        cosmetic — a widened banner over a walk that found nothing reads exactly like a widened sweep.
//        NOT satisfied by the fixture exclusion emptying the corpus: A-5 is checked on the POST-exclusion
//        list, so excluding every file in `packages/**` is a refusal, never a silent pass.
//
// ── WHAT IT DELIBERATELY DOES NOT CHECK (stated so it cannot be mistaken for coverage) ───────────────
//  a) CONTENT. That `ADR-0013.md` says what its citer claims it says. Existence and numbering only. A gate
//     that grades an ADR's prose becomes an editor, and an editor nobody elected gets worked around.
//  b) THE REVERSE LEG. An ADR file nobody cites is NOT reported. `command-doc-guard` checks its
//     correspondence both ways because an orphan command page documents a door that does not open; an
//     uncited ADR is a decision nobody had occasion to reference, which is normal and not a defect.
//  c) DUPLICATE / AMBIGUOUS IDS. Two files both matching `ADR-0007-*.md` would both satisfy a citation.
//     That is a defect, and it is not this gate's: it is one branch away from ID-1 uniqueness, and adding
//     an ownership rule here would put a second id-uniqueness authority in the tree.
//  d) CARRIERS OUTSIDE THE TWO CORPORA. `harness/**` (`.mjs`), `scripts/`, `.github/`, `ref/`, root-level
//     `*.md` (`README.md`, `ARCHITECTURE.md`) and every non-`.ts` file under `packages/**` (`.json`, the
//     one `.md`) are NOT read. This is a statement of scope, not of safety: a dangling citation in any of
//     them is invisible here. `harness/**` is the deliberate one — it holds this gate's own twin and the
//     synthetic ids that twin needs.
//  e) DIRECTORIES SKIPPED BY NAME inside `packages/**`: `dist` and `node_modules`. Generated output and
//     vendored code are not this repo's prose. A `.ts` file parked inside either is not read.
//
// Run: `node harness/gates/adr-citation-guard.mjs` (reads markdown + TypeScript — no build, no git).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, dirname, relative } from "node:path"
import { fileURLToPath } from "node:url"

// Repo root, OVERRIDABLE so the gate's own twin can point it at fixture trees. Without this the anti-vacuity
// branches above could only ever be exercised by hand — which is the same "trust me" the gate exists to end.
const ROOT = process.env.ADR_CITATION_GUARD_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const DOCS = join(ROOT, "docs")
const ADR_DIR = join(DOCS, "adr")
const PKGS = join(ROOT, "packages")

/** The citation token, as prose writes it. Four digits, and `\b` on both sides so `ADR-00131` is not a hit. */
const CITATION = /\bADR-(\d{4})\b/g
/** The filename convention `docs/adr/` is written in: the id, a hyphen, a slug, `.md`. */
const ADR_FILE = /^ADR-(\d{4})-.+\.md$/

/** THE fixture exclusion (A4), as a whole-SEGMENT path shape — see the header for why it is not a substring
 *  rule. Anchored at `packages/`; `<pkg>` is exactly one segment; `test` and `fixtures` are exact segments
 *  in that order. `packages/cli/test/mine-fixtures.ts` does NOT match (a filename is not a segment), and
 *  nothing under any `src/` can match at any depth. */
const FIXTURE_PATH = /^packages\/[^/]+\/test\/fixtures\//

/** Directory NAMES never descended inside `packages/**` — generated output and vendored code. */
const SKIP_DIRS = new Set(["dist", "node_modules"])

const rel = (p) => relative(ROOT, p).split("\\").join("/")

function refuse(code, message) {
  console.error("adr-citation-guard: FAIL\n")
  console.error(`  ✗ ${code} — ${message}\n`)
  console.error(
    "The gate refuses to report on a corpus it could not read. An empty sweep prints the same word as a " +
      "clean one, so it is not allowed to print it. Fix the corpus or the path, never this branch.",
  )
  process.exit(1)
}

/**
 * Every file under `dir` whose NAME satisfies `keep`, recursively, sorted — absolute paths. `skip` holds
 * directory names never descended. Sorting at each level keeps the report order deterministic, which is what
 * lets the twin assert an exact expected list instead of a set.
 */
function walk(dir, keep, skip, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (!skip.has(e.name)) walk(p, keep, skip, out)
    } else if (keep(e.name)) out.push(p)
  }
  return out
}

const IS_MD = (n) => n.endsWith(".md")
/** `.d.ts` is GENERATED and carries no authored prose — excluded, which is also why a descended `dist/`
 *  would contribute nothing even before `SKIP_DIRS` refuses to enter it. */
const IS_TS = (n) => n.endsWith(".ts") && !n.endsWith(".d.ts")

const NO_SKIP = new Set()

// ── A-0 / A-2 — the two directories this gate stands on ──────────────────────────────────────────────
if (!existsSync(DOCS) || !statSync(DOCS).isDirectory()) {
  refuse("A-0 CORPUS MISSING", `${rel(DOCS)} does not exist (or is not a directory). There is nothing to scan.`)
}
if (!existsSync(ADR_DIR) || !statSync(ADR_DIR).isDirectory()) {
  refuse(
    "A-2 ADR DIRECTORY MISSING",
    `${rel(ADR_DIR)} does not exist (or is not a directory). With no index, EVERY citation in the corpus is ` +
      'dangling — reporting "all resolve" here would be the defect this gate exists to catch, inverted.',
  )
}

// ── A-1 — the walk ───────────────────────────────────────────────────────────────────────────────────
// ORDER IS LOAD-BEARING: the walk is checked BEFORE the index. Every ADR file is itself a `.md` under
// `docs/`, so an empty walk implies an empty index — check the index first and A-1 becomes a branch nothing
// can reach, i.e. a guard that is present and unreachable, the same lie one level in. Checked in this order
// both refusals are reachable, and the gate's own twin exercises each with its own fixture.
const docsCorpus = walk(DOCS, IS_MD, NO_SKIP)
if (docsCorpus.length === 0) {
  refuse(
    "A-1 EMPTY WALK",
    `the \`${rel(DOCS)}/**/*.md\` walk resolved to ZERO files. Nothing scanned is not a clean scan — this is ` +
      "the reading of the tree breaking, not a corpus with no prose in it.",
  )
}

// ── A-3 — the index ──────────────────────────────────────────────────────────────────────────────────
/** id → filename, for every `docs/adr/ADR-<NNNN>-*.md`. Flat: a nested file is not an ADR. */
const index = new Map()
for (const e of readdirSync(ADR_DIR, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!e.isFile()) continue
  const m = ADR_FILE.exec(e.name)
  if (m !== null && !index.has(m[1])) index.set(m[1], e.name)
}
if (index.size === 0) {
  refuse(
    "A-3 EMPTY ADR INDEX",
    `${rel(ADR_DIR)} contains no file matching \`ADR-<NNNN>-<slug>.md\`. An empty index satisfies every ` +
      "citation vacuously. A corpus that cites ADRs while owning none is not a state this repo reaches by accident.",
  )
}

// ── A-4 / A-5 — the SECOND corpus (#192) ─────────────────────────────────────────────────────────────
// Checked AFTER the docs legs so the four original refusal codes keep firing on the states that produce
// them; a docs-shaped defect is still reported as a docs-shaped defect.
if (!existsSync(PKGS) || !statSync(PKGS).isDirectory()) {
  refuse(
    "A-4 CODE CORPUS MISSING",
    `${rel(PKGS)} does not exist (or is not a directory). This gate's success line names \`packages/**\`, and ` +
      "it is not allowed to name a directory it never opened.",
  )
}

/** The `packages/**` walk, BEFORE the fixture exclusion — kept so the exclusion can be reported honestly
 *  as a difference between two numbers rather than as an assertion about itself. */
const pkgsWalked = walk(PKGS, IS_TS, SKIP_DIRS)
const excluded = pkgsWalked.filter((p) => FIXTURE_PATH.test(rel(p)))
const pkgsCorpus = pkgsWalked.filter((p) => !FIXTURE_PATH.test(rel(p)))

// A-5 is deliberately checked on the POST-exclusion list: if the exclusion ever grows until it swallows the
// corpus, that is the vacuous pass this gate exists to refuse, and it must fail rather than print OK.
if (pkgsCorpus.length === 0) {
  refuse(
    "A-5 EMPTY CODE WALK",
    `the \`${rel(PKGS)}/**/*.ts\` walk resolved to ZERO files to scan (${pkgsWalked.length} found, ` +
      `${excluded.length} excluded as fixtures). A widened banner over a walk that found nothing reads exactly ` +
      "like a widened sweep — which is the whole defect class this gate was extended to close.",
  )
}

// ── the sweep ────────────────────────────────────────────────────────────────────────────────────────
const corpus = [...docsCorpus, ...pkgsCorpus]
const dangling = [] // every OCCURRENCE, not every id — one missing ADR usually strands many lines
const citedIds = new Set()
let nCitations = 0

for (const abs of corpus) {
  const lines = readFileSync(abs, "utf8").split("\n")
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(CITATION)) {
      nCitations++
      citedIds.add(m[1])
      if (!index.has(m[1])) dangling.push({ where: `${rel(abs)}:${i + 1}`, id: `ADR-${m[1]}` })
    }
  }
}

/** What the fixture exclusion skipped, as one line. Printed on BOTH the pass and the fail path: a reader
 *  staring at a dangling-citation report is exactly the reader who needs to know which files were NOT read,
 *  and an exclusion that only shows itself when everything is fine is a hiding place with good manners. */
const exclusionLine =
  `  fixture exclusion \`packages/<pkg>/test/fixtures/**\`: ${excluded.length} file(s) excluded` +
  `${excluded.length > 0 ? ` — ${excluded.map(rel).join(", ")}` : " (the reserved path is currently empty)"}.`

if (dangling.length > 0) {
  const missing = [...new Set(dangling.map((d) => d.id))].sort()
  console.error("adr-citation-guard: FAIL\n")
  for (const d of dangling) console.error(`  ✗ ${d.where} → ${d.id} — cited, and no file matches docs/adr/${d.id}-*.md`)
  console.error(`\n${exclusionLine}`)
  console.error(
    `\n${dangling.length} dangling citation(s) across ${new Set(dangling.map((d) => d.where.split(":")[0])).size} ` +
      `file(s), naming ${missing.length} absent ADR(s): ${missing.join(", ")}.\n` +
      `The index holds ${index.size}: ${[...index.keys()]
        .sort()
        .map((k) => `ADR-${k}`)
        .join(", ")}.\n` +
      "LAND THE DOCUMENT — do not delete the citations. A decision that is implemented, cited and ratified " +
      "but absent from the tree is the exact state this gate was written for; deleting the pointers would " +
      "clear the gate and leave the evidence base unpublished.",
  )
  process.exit(1)
}

// The success line NAMES both corpora and their separate file counts. One merged number would let either
// leg collapse to zero behind a total that still looked healthy — and "it walks packages/** now" is exactly
// the claim a reader of this line is entitled to check.
console.log(
  `adr-citation-guard: OK — ${nCitations} \`ADR-<NNNN>\` citation(s) across ${corpus.length} file(s) ` +
    `(${docsCorpus.length} docs/**/*.md + ${pkgsCorpus.length} packages/**/*.ts), naming ${citedIds.size} ` +
    `distinct ADR(s); all resolve into an index of ${index.size} under ${rel(ADR_DIR)}.\n` +
    `${exclusionLine}\n` +
    "  Existence and numbering only — whether a cited ADR SAYS what its citer claims is a human job and is " +
    "not claimed here, and the reverse leg (an ADR nobody cites) is declared uncovered, not checked.",
)
