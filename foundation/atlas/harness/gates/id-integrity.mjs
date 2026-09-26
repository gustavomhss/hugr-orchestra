#!/usr/bin/env node
// harness/gates/id-integrity.mjs — the ID-GRAPH FITNESS FUNCTION for the decomposition corpus.
//
// The docs carry a dense identifier graph (REQ / SCN / INV / PROP / WP) wired together by ~2.3k relative
// citations. Before this gate exactly ONE mechanical pin protected any of it (a whole-file sha256 between
// method-tags-authoring.md and properties-authoring.md); everything else was review-only, and four wrong
// counts shipped in four rounds. This gate makes the graph checkable:
//
//   ID-1  UNIQUENESS  — every id is DEFINED exactly once, inside its owner file family.
//   ID-2  RESOLUTION  — every `<relpath>.md#<ID>` citation resolves to a definition IN THE CITED FILE.
//                       This is the renumbering check: renaming REQ-AUTH-3f breaks every pointer at once.
//   ID-3  ORPHAN      — every REQ, and every non-`held-out` SCN, is SCHEDULED by ≥1 WP card, where
//                       "scheduled" means a structured `source_reqs:` / `acceptance:` pointer. Prose does
//                       not schedule work.
//   ID-4  ANCHOR      — every `#author-*` / `#entry-*` citation lands on a real `<a id=…>` in its target.
//   ID-5  LINK        — every relative `.md` link/citation names a file that exists.
//
// NOTHING here is a transcribed count. Every set is recomputed from the corpus on each run and compared
// against the corpus, so the gate keeps working when 73 legitimately becomes 74.
//
// ── SCOPE ────────────────────────────────────────────────────────────────────────────────────────────
// `docs/**/*.md` MINUS `docs/method/**` — 113 of the 130 files. `docs/method/` is the METHOD (the S0–S4
// prompts and the WP/properties templates), not the corpus: it carries PLACEHOLDER ids (`REQ-<MODULE>-<n>`)
// and deliberately restates real ids as worked examples (`### REQ-KERNEL-1a` appears in S1.md purely to show
// the shape). Scanning it would manufacture ~8 phantom duplicate definitions. The exclusion is applied
// UNIFORMLY to all five checks — a per-check carve-out is how a gate gets silently weakened.
//
// ── WHAT THIS GATE CANNOT SEE (stated so it cannot be mistaken for coverage) ──────────────────────────
//  a) FREE-FORM SLUG/LABEL ANCHORS. ~341 citations point at prose labels rather than ids or `<a id=>`:
//     `atlas-kernel.md#kernel-1` (a bold list item), `fspec-merge.md#head-tiebreak` (a labelled spec line),
//     `roadmap.md#epic-18`, `surface-map.md#knw`. These are a documented LOGICAL convention with no markup
//     to land on. Resolving them would mean teaching this gate a dozen bespoke prose shapes, and every such
//     rule widens what counts as "resolved" — i.e. weakens ID-2. They are COUNTED and DECLARED, not checked.
//  b) BARE PROSE MENTIONS. `REQ-GEN-1` in a goldens grouping header is a REQ *family* (its members are
//     REQ-GEN-1a/1b/1c); 157 such mentions resolve to no definition and are not defects. Only `file#id`
//     citations are treated as references — which is also why generic prose ("every REQ-…") never fires.
//  c) SEMANTICS. That a citation points at the RIGHT id, that a WP's REQ set is the correct one, that an
//     `up-property` faithfully renders its invariant — all invisible here. This gate checks wiring, not truth.
//  d) THE S0 REGISTER RECONCILIATION. `invariant-register.md` keys its rows `| PERSIST-1 …` while the KERNEL
//     block uses `| **KERNEL-1** …` and the adapters/authoring registers use `### INV-…` headings. That
//     format is too heterogeneous to reconcile against the method-tags INV set without guessing, so the
//     register↔method-tags count agreement is NOT verified.
//  e) NON-MARKDOWN CARRIERS. Ids referenced from `packages/**` source, tests, or skills are out of scope.
//
// ── RATCHET ──────────────────────────────────────────────────────────────────────────────────────────
// 1453 pre-existing violations exist on the corpus TODAY (see static ledger module below). They are recorded
// rather than fixed — and recorded LOUDLY: the gate prints them on every successful run, fails on any NEW
// violation, and fails when a KNOWN entry stops violating (so the ledger can only shrink and cannot rot into
// a permanent exemption).

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname, normalize, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { KNOWN_ENTRIES } from "./id-integrity-known.mjs"

// Repo root, OVERRIDABLE so the gate's own test can point it at a fixture tree. Without this the gate could
// only ever be mutation-tested by hand — precisely the "trust me" the gate exists to abolish.
const ROOT = process.env.ID_INTEGRITY_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..")
const DOCS = join(ROOT, "docs")

/**
 * Pre-existing violations, by stable key. Shrink-only: a stale entry FAILS the gate.
 *
 * The keys name real corpus paths and ids, so they are meaningless against a fixture tree. When the root is
 * overridden the ledger comes from `ID_INTEGRITY_KNOWN` (JSON, default empty) instead — which also makes the
 * ratchet itself falsifiable by the test rather than a branch nobody can reach.
 */
const KNOWN = new Map(
  process.env.ID_INTEGRITY_ROOT !== undefined
    ? Object.entries(JSON.parse(process.env.ID_INTEGRITY_KNOWN ?? "{}"))
     : KNOWN_ENTRIES,
)

/**
 * The OWNER FILE FAMILY of each id kind, derived from the corpus's own filename convention.
 *
 * This mapping is what makes ID-1 meaningful. A `### REQ-KERNEL-1a` heading appears in BOTH `req-krn.md`
 * (the S1 definition) and `goldens-krn.md` (an S3 GROUPING header over the scenarios that witness it) —
 * 549 times corpus-wide. Treating every `### <ID>` as a definition would report 389 "duplicates", all false.
 * A definition is a heading in the family that OWNS the kind; the same heading anywhere else is a reference.
 */
const OWNER = {
  REQ: /^requirements\/(req|requirements)-[a-z-]+\.md$/,
  SCN: /^requirements\/goldens-[a-z-]+\.md$/,
  PROP: /^requirements\/properties-[a-z-]+\.md$/,
  WP: /^requirements\/work-packages\/[a-z0-9.-]+\.md$/,
  INV: /^requirements\/method-tags-[a-z-]+\.md$/,
}

const KINDS = "REQ|SCN|PROP|WP|INV"
/** A definition heading: `### <ID>` at the start of a line, id ending at the first whitespace. */
const DEF = new RegExp(`^###\\s+((?:${KINDS})-[A-Za-z0-9][A-Za-z0-9.-]*?)(?=\\s|$)`)
/**
 * A citation is a `.md` path in a POINTER POSITION, with an optional `#anchor`. Pointer position means one
 * of three things, and the restriction is load-bearing:
 *
 *   1. a markdown link       `](../foo.md#bar)`
 *   2. a document-relative   `./` or `../` prefix — prose never writes those
 *   3. a structured field    `source:` / `covers_reqs:` / `witness:` / … (`^ - <field>: …`), which is how the
 *                            `ptr+digest` pointers cite siblings without a prefix (`method-tags-knw.md#INV-KNOW-4`)
 *
 * Matching bare paths ANYWHERE instead reads prose as links: the corpus mentions `reference/atlas-tools.md`
 * in running text ~150 times (a docs-root path, not a link from the citing file), and a first cut of this
 * gate reported every one of them as broken. Prose mentions are therefore NOT checked — see the header.
 */
const PATH = String.raw`((?:\.{1,2}\/)[A-Za-z0-9._/-]*\.md|[A-Za-z0-9._-][A-Za-z0-9._/-]*\.md)(?:#([A-Za-z0-9._-]*[A-Za-z0-9]))?`
const CITE_LINK = new RegExp(String.raw`\]\(${PATH}\)`, "g")
const CITE_REL = new RegExp(
  String.raw`(?:^|[\s(\[\`"|])((?:\.{1,2}\/)[A-Za-z0-9._/-]*\.md)(?:#([A-Za-z0-9._-]*[A-Za-z0-9]))?`,
  "g",
)
const CITE_FIELD = new RegExp(String.raw`(?:^|[\s(\[\`"|,])${PATH}`, "g")
/** `^ - source: …` / `^ covers_reqs: …` — the structured pointer fields. */
const FIELD_LINE = /^\s*(?:-\s*)?[a-z_]+:\s/
/** A trailing ` # …` comment. The corpus annotates pointers with `# ptr+digest` and sometimes restates a
 *  FAMILY pointer there (`# req-idx.md#REQ-INDEX-1`, whose members are 1a/1b/…). Comments are not pointers. */
const TRAILING_COMMENT = /\s{2,}#\s.*$/

const violations = []
const seen = new Set()
const flag = (code, key, msg) => {
  const k = `${code} ${key}`
  if (seen.has(k)) return // the same defect cited twice is one defect
  seen.add(k)
  violations.push({ key: k, msg: `${code} ${msg}` })
}

/** Fenced code blocks are stripped before ANY scan: a `### REQ-FAKE-1` inside ```…``` is an illustration,
 *  not a definition, and a citation inside one is not a live pointer. Verified a no-op on the real corpus
 *  (2371 definitions and 2294 citations both sides), so this is pure hardening, not a behaviour change. */
const stripFences = (src) => src.replace(/^ *(```|~~~)[\s\S]*?^ *\1[^\n]*$/gm, "")

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith(".md")) out.push(p)
  }
  return out
}

if (!existsSync(DOCS)) {
  console.error(`id-integrity: FAIL\n\n  ✗ ID-0 corpus missing: ${DOCS}`)
  process.exit(1)
}

// `docs/method/**` is the METHOD, not the corpus — see SCOPE above.
const corpus = walk(DOCS)
  .map((f) => [relative(DOCS, f).split("\\").join("/"), f])
  .filter(([rel]) => !rel.startsWith("method/"))
  .sort(([a], [b]) => a.localeCompare(b))
const text = new Map(corpus.map(([rel, abs]) => [rel, stripFences(readFileSync(abs, "utf8"))]))

// ── ID-1 — definition uniqueness ─────────────────────────────────────────────────────────────────────
/** id → [rel, …] the owner-family files that define it. */
const defs = new Map()
for (const [rel, src] of text) {
  for (const line of src.split("\n")) {
    const m = DEF.exec(line)
    if (m === null) continue
    const kind = m[1].slice(0, m[1].indexOf("-"))
    if (!(OWNER[kind]?.test(rel) ?? false)) continue // a grouping header, not a definition
    if (!defs.has(m[1])) defs.set(m[1], [])
    defs.get(m[1]).push(rel)
  }
}
for (const [id, where] of defs) {
  if (where.length > 1) {
    flag(
      "ID-1",
      id,
      `duplicate definition: '${id}' is defined ${where.length}× (${where.join(", ")}) — an id must have exactly ONE owner, or a citation to it is ambiguous`,
    )
  }
}

// ── the anchor index of a target file (ids it defines-or-restates, and its explicit anchors) ─────────
const anchorCache = new Map()
function anchorsOf(abs, rel) {
  if (anchorCache.has(abs)) return anchorCache.get(abs)
  let src
  try {
    src = stripFences(readFileSync(abs, "utf8"))
  } catch {
    src = ""
  }
  const explicit = new Set()
  const ids = new Set()
  for (const m of src.matchAll(/<a\s+id=["']([^"']+)["']/g)) explicit.add(m[1])
  for (const line of src.split("\n")) {
    const h = /^#{1,6}\s+(.*?)\s*$/.exec(line)
    if (h !== null) {
      const t = new RegExp(`^((?:${KINDS})-[A-Za-z0-9][A-Za-z0-9.-]*?)(?=\\s|$)`).exec(h[1].trim())
      if (t !== null) ids.add(t[1])
    }
    // The S0 register keys its rows by the bare invariant (`| PERSIST-1 …`, `| **KERNEL-1** …`) while
    // citations spell them `#INV-PERSIST-1`. Both row dialects are indexed so ID-2 covers the 108
    // register pointers instead of silently exempting them.
    const tr = /^\|\s*\*{0,2}([A-Z][A-Z0-9]*-\d+[a-z]?)\*{0,2}(?=[\s|])/.exec(line)
    if (tr !== null) ids.add(`INV-${tr[1]}`)
  }
  const idx = { explicit, ids, rel }
  anchorCache.set(abs, idx)
  return idx
}

// ── ID-2 / ID-4 / ID-5 — citations ───────────────────────────────────────────────────────────────────
let nCite = 0
let nId = 0
let nExplicit = 0
let nLoose = 0 // bare-path citations that DID resolve — their anchors are checked, their existence is not
const unchecked = new Map() // free-form slug/label anchors — declared, not checked

/**
 * Every pointer-position citation on one line, deduped, tagged `strict` or `loose`.
 *
 *   strict — a markdown link, or a `./`/`../` path. The target MUST exist (ID-5).
 *   loose  — a bare path in a structured field (`context_refs: [ reference/atlas-authoring.md, … ]`).
 *            The corpus writes these against several different bases: docs-root (`reference/atlas-kernel.md`
 *            from `requirements/req-krn.md`), the block directory (`method-tags-authoring.md` from
 *            `work-packages/`), or the sibling (`req-krn.md` from `requirements/`). That is a NAMING
 *            convention, not a resolvable path, so its EXISTENCE is not asserted — a first cut that did
 *            assert it reported 36 non-defects. When such a path does resolve against one of those bases,
 *            its `#ID` anchor is still checked; when it resolves against none, it is skipped entirely.
 *            A typo in a bare path is therefore INVISIBLE to this gate (stated in the header).
 */
function citationsOn(line) {
  const body = line.replace(TRAILING_COMMENT, "")
  const out = new Map()
  const add = (m, strict) => {
    const k = `${m[1]}#${m[2] ?? ""}`
    if (!out.has(k) || strict) out.set(k, { path: m[1], anchor: m[2], strict })
  }
  for (const m of body.matchAll(CITE_LINK)) add(m, true)
  for (const m of body.matchAll(CITE_REL)) add(m, true)
  if (FIELD_LINE.test(body)) for (const m of body.matchAll(CITE_FIELD)) add(m, false)
  return [...out.values()]
}

for (const [rel, src] of text) {
  const fromDir = dirname(join(DOCS, rel))
  for (const { path, anchor, strict } of src.split("\n").flatMap(citationsOn)) {
    // Bases tried, in order. A path with no `./` prefix may be repo-root-relative — `DECOMPOSITION-PROTOCOL.md`
    // links `.claude/skills/ears/SKILL.md` that way — so both readings are tried before anything is broken.
    const bases = /^\.{1,2}\//.test(path)
      ? [fromDir]
      : strict
        ? [fromDir, ROOT]
        : [fromDir, dirname(fromDir), DOCS, ROOT]
    const target = bases.map((b) => normalize(join(b, path))).find((p) => existsSync(p))
    if (strict) nCite++ // only STRICT citations are subject to ID-5, so only they may be counted as checked
    if (target === undefined) {
      if (!strict) continue // loose naming convention — existence is DECLARED UNCOVERED, not asserted
      flag("ID-5", `${rel} -> ${path}`, `broken relative link: ${rel} cites '${path}', which does not exist`)
      continue
    }
    if (!strict) nLoose++
    if (anchor === undefined) continue
    const idx = anchorsOf(target, relative(DOCS, target))
    if (new RegExp(`^(?:${KINDS})-`).test(anchor)) {
      nId++
      if (!idx.ids.has(anchor)) {
        // Keyed by CITER→target, not by target alone: one renumbering usually strands pointers in several
        // files, and a target-only key would report the first citer and hide the rest.
        flag(
          "ID-2",
          `${rel} -> ${idx.rel}#${anchor}`,
          `dangling id citation: ${rel} cites '${idx.rel}#${anchor}', but '${anchor}' is not defined in that file — a renumbering or a rename left this pointer behind`,
        )
      }
      // NOTE the condition is the anchor's NAMESPACE, not `idx.explicit.size > 0`. Gating on "the target
      // declares some anchors" would make deleting the LAST `<a id=>` from a file silently downgrade all 135
      // of its inbound pointers to unchecked — a gate that switches itself off under the exact edit it exists
      // to catch.
    } else if (/^(author|entry)-/.test(anchor)) {
      nExplicit++
      if (!idx.explicit.has(anchor)) {
        flag(
          "ID-4",
          `${rel} -> ${idx.rel}#${anchor}`,
          `dangling anchor: ${rel} cites '${idx.rel}#${anchor}', but that file declares no <a id="${anchor}">`,
        )
      }
    } else {
      unchecked.set(`${idx.rel}#${anchor}`, (unchecked.get(`${idx.rel}#${anchor}`) ?? 0) + 1)
    }
  }
}

// ── ID-3 — orphans ───────────────────────────────────────────────────────────────────────────────────
/**
 * DIRECTION: definition → WP. A defined REQ/SCN must be SCHEDULED by at least one WP card.
 *
 * That is the direction that catches the failure this corpus actually suffers: S1 defines a requirement (or
 * a late ADR adds one) and S4 never carries it into executable work, so it ships as prose nobody builds. The
 * opposite direction — a WP citing an id that does not exist — is ID-2, enforced separately with no ledger.
 *
 * ── WHAT COUNTS AS SCHEDULING, AND WHY IT IS NARROWER THAN IT WAS ────────────────────────────────────
 * ONLY a structured pointer inside a `source_reqs:` or `acceptance:` block: `- source: <path>#<ID>`. A bare
 * prose mention of the id ANYWHERE in the card used to count, and that made the check silenceable by
 * documentation — write "this does not fix REQ-X" in an intent paragraph and REQ-X stopped being an orphan.
 * A ratchet a sentence can switch off is the same class of defect as a gate that cannot fail.
 *
 * Measured when the narrowing landed: a seat that stripped its structured citations found only 5 of its 10
 * ids went red; the other 5 were held up by prose naming them. Measured on the corpus at the same moment:
 * the narrowing orphans **nothing new** — all 4 ID-3 violations are the same 4 before and after, because
 * every id that any card schedules at all, it schedules structurally. So this is a tightening that costs
 * nothing today and closes the escape for every card written after it. Both numbers are in
 * `work-packages/wp-gates-that-cannot-fail.md`.
 *
 * The two field names are the schema's own (114 cards, 114 `source_reqs:`, 114 `acceptance:`) — not a
 * vocabulary invented here. `source_reqs:` schedules REQs, `acceptance:` schedules the SCNs that witness
 * them; a card whose acceptance is prose (the out-of-band hotfix cards) schedules no SCN, which is true.
 *
 * SCN carries one derived exemption: a scenario whose heading is marked `held-out` is an independent second
 * fixture, deliberately withheld from every WP's acceptance list (citing it would defeat the hold-out). The
 * exemption is read off the heading, not hardcoded — 342 of the 343 uncited SCNs declare it.
 */
/** A block opener at column 0. Continuation lines are indented; the next column-0 token closes the block. */
const SCHEDULING_FIELD = /^(?:source_reqs|acceptance)\s*:/
/** A structured pointer row inside such a block. The id is the ANCHOR of the pointer, so a path alone
 *  schedules nothing and a `# ptr+digest` trailing comment (which sometimes restates a FAMILY id) is cut
 *  first — the same TRAILING_COMMENT rule ID-2 already applies to every other citation. */
const SCHEDULED_PTR = new RegExp(String.raw`^\s*-\s*source:\s*\S*?#((?:${KINDS})-[A-Za-z0-9][A-Za-z0-9.-]*)`)
const wpRefs = new Set()
for (const [rel, src] of text) {
  if (!OWNER.WP.test(rel)) continue
  let inBlock = false
  for (const line of src.split("\n")) {
    if (SCHEDULING_FIELD.test(line)) {
      inBlock = true
      continue
    }
    if (/^\S/.test(line)) {
      inBlock = false
      continue
    } // any column-0 token ends the block
    if (!inBlock) continue
    const m = SCHEDULED_PTR.exec(line.replace(TRAILING_COMMENT, ""))
    if (m !== null) wpRefs.add(m[1].replace(/[.-]+$/, ""))
  }
}
const heldOut = new Set()
for (const [rel, src] of text) {
  if (!OWNER.SCN.test(rel)) continue
  for (const m of src.matchAll(/^###\s+(SCN-[A-Za-z0-9.-]+)([^\n]*)$/gm)) {
    if (/held-out/.test(m[2])) heldOut.add(m[1])
  }
}
for (const id of defs.keys()) {
  if (wpRefs.has(id)) continue
  if (id.startsWith("REQ-")) {
    flag(
      "ID-3",
      id,
      `orphan requirement: '${id}' is defined but no WP card consumes it — it is prose nobody is scheduled to build`,
    )
  } else if (id.startsWith("SCN-") && !heldOut.has(id)) {
    flag(
      "ID-3",
      id,
      `orphan scenario: '${id}' is defined, is not marked 'held-out', and is in no WP's acceptance list — it will never be run`,
    )
  }
}

// ── ratchet + report ─────────────────────────────────────────────────────────────────────────────────
const fresh = violations.filter((v) => !KNOWN.has(v.key))
const stale = [...KNOWN.keys()].filter((k) => !seen.has(k))

if (fresh.length > 0 || stale.length > 0) {
  console.error("id-integrity: FAIL\n")
  for (const v of fresh) console.error(`  ✗ ${v.msg}`)
  for (const k of stale) {
    console.error(
      `  ✗ RATCHET '${k}' is recorded as a known defect but no longer fires — it was fixed. Delete it from KNOWN so the ledger keeps shrinking.`,
    )
  }
  console.error(
    `\n${fresh.length} new violation(s), ${stale.length} stale ledger entr(y/ies). Corpus: docs/ (excluding docs/method/).`,
  )
  process.exit(1)
}

// The success line states ONLY what was checked, and nets out the ratcheted defects rather than rounding
// them away — "all resolve" would be a lie while the ledger is non-empty.
const n = (k) => [...defs.keys()].filter((i) => i.startsWith(`${k}-`)).length
const known = (code, pfx) => [...KNOWN.keys()].filter((k) => k.startsWith(`${code} ${pfx}`)).length
const scnLive = n("SCN") - heldOut.size
console.log(
  `id-integrity: OK — ${corpus.length} corpus files; ` +
    `${defs.size} ids uniquely defined, 0 duplicates (${n("REQ")} REQ, ${n("SCN")} SCN, ${n("INV")} INV, ${n("PROP")} PROP, ${n("WP")} WP); ` +
    `${nCite} strict links resolve (${known("ID-5", "")} ratcheted); ` +
    `${nLoose} bare-path citations resolved but NOT existence-asserted; ` +
    `${nId} id citations + ${nExplicit} <a id> anchors resolve (0 dangling); ` +
    `${n("REQ") - known("ID-3", "REQ-")}/${n("REQ")} REQ and ${scnLive - known("ID-3", "SCN-")}/${scnLive} non-held-out SCN consumed by a WP.`,
)
console.log(
  `  DECLARED UNCOVERED: ${[...unchecked.values()].reduce((a, b) => a + b, 0)} free-form slug/label anchor citations ` +
    `(${unchecked.size} distinct) are COUNTED, NOT CHECKED — see the header. ${heldOut.size} SCNs are held-out by declaration.`,
)
if (KNOWN.size > 0) {
  console.log(`  KNOWN DEFECTS (ratchet — ${KNOWN.size} pre-existing, must shrink, never grow):`)
  for (const [k, why] of KNOWN) console.log(`    · ${k} — ${why}`)
}
