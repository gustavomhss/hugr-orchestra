// harness/lib/ears-coamend.mjs — the pure core of the EARS co-amendment check (issue #198).
//
// ── THE DEFECT THIS EXISTS TO STOP RETURNING ─────────────────────────────────────────────────────────
// Every `### REQ-…` block states its normative content TWICE, one line apart:
//
//     The `atlas-query` tool shall return a `≤ ~2K` **governing** pack of `tier≥T1` invariants, beside…   ← EARS
//     normative-clause: "return a `≤ ~2K` **governing** pack of `tier≥T1` invariants"                       ← quote
//
// The EARS sentence is a RESTATEMENT of the clause in the requirement's own voice ("The … tool SHALL …"),
// deliberately NON-VERBATIM. `req-clause-guard` proves the `normative-clause` quote still exists upstream
// in the invariant it cites; it says nothing about whether the EARS prose beside it still reads the same
// thing. Found at cold review of `fix/inv-trace-guard` (B-F3, 2026-08-04): REQ-TOOLS-6b's EARS still said
// a single `≤ ~2K` band while the `normative-clause:` one line below had already become two bands. Every
// gate green.
//
// ── WHY THIS IS A DELTA CHECK, NOT A CONTAINMENT ONE ─────────────────────────────────────────────────
// The EARS is a legitimate paraphrase, so no static same-file rule can hold: a containment loose enough to
// accept the honest re-voicing accepts a silent rewrite too — the exact hole `req-clause-guard` closes by
// being verbatim. The only mechanical thing that IS true is co-amendment: when the clause's meaning
// CHANGES, the prose restating it must change in the SAME commit (or say why not). That is a property of
// the DIFF, not of the file — so this core takes two snapshots (base, head) and never judges one alone.
// It is the sibling of `spec-conformance-guard` check (4), keyed on the diff rather than on the corpus.
//
// ── WHAT IT CANNOT DO, stated rather than implied ────────────────────────────────────────────────────
//   • It cannot tell a CORRECT co-amendment from a token edit to the EARS — it enforces that the prose was
//     VISITED when the clause changed, not that the visit was faithful. Semantics stays with the reviewer.
//   • It cannot catch a block authored inconsistently FROM THE START (no clause change to trigger it). It
//     is a drift-on-amendment guard, exactly as B-F3 was an amendment that drifted.

/** The REQ-owner corpus: `req-<m>.md` AND `requirements-<m>.md` — the family `id-integrity` calls
 *  OWNER.REQ. Keying on `req-*.md` alone silently drops `requirements-adapters/authoring.md` (22%). */
export const REQ_FILE_RE = /^(?:req|requirements)-[a-z]+\.md$/

/** A change is judged on MEANING, not bytes: HTML comments stripped (amendment tombstones + scope notes
 *  are not the clause), whitespace runs collapsed (the reference docs hard-wrap and the REQ does not, so a
 *  pure re-wrap must read as UNCHANGED and raise no co-amend demand). Nothing else is folded — no case, no
 *  markdown: `pack` → `**governing** pack` is a real edit and must count as one. */
export function norm(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** A deliberate "the clause changed but the EARS did not, and here is why" marker, mirroring the house
 *  `<!-- AMENDED <date>: … -->` tombstone. It only earns an exemption when its TEXT is co-amended in the
 *  same commit as the clause (see `coamendViolations`); a marker left untouched from a prior commit gives
 *  no cover, so it cannot silently exempt a REQ from every future clause change. */
const EXEMPT_RE = /<!--\s*COAMEND-EXEMPT\b[\s\S]*?-->/

/** A metadata FIELD line inside a block — `source:`, `amendment:`, `note:`, `normative-clause:`. The EARS
 *  restatement is a normative sentence ("Genesis shall …" / "The `atlas-query` tool shall …" / "If a seed
 *  …"); it never takes this `lowercase-word:` shape, so excluding field lines isolates the prose exactly.
 *  MEASURED across the corpus: 6 blocks carry an `amendment:`/`note:` tombstone between `source:` and
 *  `normative-clause:`; folding those into the EARS let a tombstone bump (the house action when amending a
 *  clause) satisfy `earsChanged` while the real restatement stayed stale — the exact class this gate exists
 *  to catch, defeated on its own target path (found at cold review). Keying on prose alone closes it. */
const FIELD_LINE_RE = /^[a-z][a-z0-9-]*:/

/**
 * Parse every `### REQ-…` block in one file's text into `{ ears, clause, exempt }`, keyed by REQ id.
 *
 * The block model matches the corpus, proven unanimous across 637 blocks: a `### REQ-<id>` heading owns
 * every line down to the next `### ` or `## `; inside it a `source:` line, then EARS restatement prose,
 * then a `normative-clause:` line — and between them the block MAY carry metadata FIELD lines (`amendment:`,
 * `note:`). The EARS phrase is the prose alone: non-blank, non-comment, and NOT a `lowercase-word:` field
 * line. Folding the field lines in would let a tombstone bump satisfy the co-amend demand while the real
 * restatement stayed stale (the exact hole this gate targets — see `FIELD_LINE_RE`). A block missing either
 * delimiter yields no clause/ears and is simply not judged — this core reports co-amendment drift, not
 * corpus shape (that is `id-integrity`'s job).
 */
export function parseReqBlocks(text) {
  const out = new Map()
  const lines = text.split("\n")
  let id = null
  let buf = []
  const flush = () => {
    if (id === null) return
    const srcIdx = buf.findIndex((l) => /^source:/.test(l.trim()))
    const clsIdx = buf.findIndex((l) => /^normative-clause:/.test(l.trim()))
    if (srcIdx >= 0 && clsIdx > srcIdx) {
      const earsLines = buf
        .slice(srcIdx + 1, clsIdx)
        .filter((l) => l.trim() !== "" && !l.trim().startsWith("<!--") && !FIELD_LINE_RE.test(l.trim()))
      const exemptMatch = buf.map((l) => EXEMPT_RE.exec(l)).find((m) => m !== null)
      out.set(id, {
        ears: earsLines.join(" "),
        clause: buf[clsIdx].replace(/^normative-clause:/, "").trim(),
        exempt: exemptMatch === undefined ? null : exemptMatch[0],
      })
    }
    id = null
    buf = []
  }
  for (const l of lines) {
    const h = /^###\s+(REQ-[A-Z]+-[0-9A-Za-z-]+)/.exec(l)
    if (h !== null) {
      flush()
      id = h[1]
      continue
    }
    if (/^##\s/.test(l)) {
      flush()
      continue
    }
    if (id !== null) buf.push(l)
  }
  flush()
  return out
}

/**
 * The property, over two whole-corpus snapshots keyed by REQ id.
 *
 * For every REQ present in BOTH base and head: if the clause's MEANING changed and the EARS's did NOT, that
 * REQ is a violation — the clause was amended and its restatement left stale. An exemption suppresses it
 * ONLY when its `COAMEND-EXEMPT` justification was itself co-amended in this commit (added, or its text
 * changed): a marker left untouched from an earlier commit gives no cover, so one cannot silently exempt a
 * REQ from every future clause change — the freshness of the exemption is a diff property exactly as the
 * co-amendment is. A REQ only in head (newly added) or only in base (removed) has no delta to co-amend and
 * is skipped. Returns the violations, sorted, each with the before/after clause so the failure names what moved.
 */
export function coamendViolations(baseById, headById) {
  const violations = []
  for (const [id, head] of [...headById].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const base = baseById.get(id)
    if (base === undefined) continue // new REQ — nothing amended
    const clauseChanged = norm(base.clause) !== norm(head.clause)
    const earsChanged = norm(base.ears) !== norm(head.ears)
    // The exemption is itself an HTML comment, so `norm` (which STRIPS comments) would collapse every
    // marker to '' and defeat the freshness test — compare the marker's own text, whitespace-collapsed.
    const marker = (b) => (b?.exempt == null ? null : b.exempt.replace(/\s+/g, " ").trim())
    const exemptFresh = marker(head) !== null && marker(head) !== marker(base)
    if (clauseChanged && !earsChanged && !exemptFresh) {
      violations.push({ id, clauseBefore: base.clause, clauseAfter: head.clause })
    }
  }
  return violations
}
