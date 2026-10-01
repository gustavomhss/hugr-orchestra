// harness/lib/quote-coverage.mjs — how much of a ratified invariant does its live quotes actually hold?
//
// ── THE QUESTION, AND WHY "HAS A LIVE QUOTE" DOES NOT ANSWER IT ──────────────────────────────────────
// `req-clause-guard` + `inv-text-pin` closed the case of an invariant with ZERO live quotes. This file
// measures the band ABOVE that threshold, because it is not safe either. REPRODUCED at master ce91a08
// (WP-GOV-2, issue #208): `INV-PERSIST-14` has 6 citing REQs, 5 ledgered, ONE live — `REQ-PERSIST-14-e`'s
// four words `"byte-identical across runs"`. With those four words untouched, the invariant's block was
// inverted end to end ("MUST partition" -> "MUST NOT partition", "a **PURE READ** (0 mutation)" -> "a
// **WRITE** (mutation REQUIRED)", "**not** a stored/materialized diff" -> "MUST be a stored/materialized
// diff") and ALL NINE gates exited 0. The instrument was not dead: re-spelling the four live words
// `bit-identical` made `req-clause-guard` exit 1 naming `REQ-PERSIST-14-e`. So having a live quote is a
// PRESENCE predicate, not a COVERAGE one.
//
// ── THE MEASURE: SIMULATE THE ATTACK, DO NOT PROXY IT ────────────────────────────────────────────────
// Character/word/sentence/clause coverage are all PROXIES for "could this be inverted unnoticed", and each
// picks a different answer (`byte-identical across runs` is ~4% of PERSIST-14's characters but sits inside
// the sentence carrying two of its three MUSTs, so a sentence-level proxy scores it protected). Rather than
// argue a proxy, `modalFlips` performs the inversion the proxy stands for: every normative modal in the
// block is flipped one at a time (MUST <-> MUST NOT, SHALL <-> SHALL NOT, MAY -> MUST NOT, ...) and the
// invariant's LIVE quotes are re-evaluated with the gate's own `holds`. A flip is DETECTED iff some live
// quote stops holding. That is not a model of the protection, it IS the protection, so it cannot be
// gerrymandered by choosing a unit. The proxies are computed alongside it precisely so the choice can be
// shown to matter (issue #208 rule 1) rather than asserted.
//
// NOTHING here is a threshold. `detected/total` is reported per invariant and the distribution is printed
// with its members, because a bare median has rotted in this repo before.
//
// ── WHY THE NUMBERS ABOVE ARE ALLOWED TO SIT IN A COMMENT ────────────────────────────────────────────
// The house rule is that no committed comment states a bare count. RULED (WP-GOV-3, issue #208): a figure
// bound to a NAMED COMMIT is a dated observation and is re-derivable from it, so it is not what that rule
// targets — the rule targets values presented as CURRENT, which silently rot away from the tree they once
// described. Every number in this header is anchored to `ce91a08` and is a reproduction record. Every
// number that describes THIS tree — the distribution, the medians, the uncaught flips, the unheld
// restatements — is derived and printed by `report` at run time, and none of it appears here.

/** The gate's own containment test, moved here so ONE implementation serves both and no second parser can
 *  disagree with the verdict `req-clause-guard` publishes. Rules 1 + 3 of that gate's header:
 *  whitespace collapsed, `…` (U+2026) is elision so the quote is an ordered sequence of fragments. */
export function holds(quote, invText, norm) {
  const t = norm(invText)
  let at = 0
  for (const frag of quote
    .split("…")
    .map((f) => f.trim())
    .filter((f) => f !== "")) {
    const i = t.indexOf(frag, at)
    if (i < 0) return false
    at = i + frag.length
  }
  return true
}

/**
 * The normative modals this repo actually uses, longest-first so `MUST NOT` is never matched as `MUST`.
 * Each maps to its INVERSION — the edit an attacker (or a careless amendment) would make.
 * Case-sensitive by design: the corpus writes normative force in CAPS and `must` in prose is not a modal.
 */
export const MODALS = [
  ["MUST NOT", "MUST"],
  ["SHALL NOT", "SHALL"],
  ["MAY NOT", "MAY"],
  ["MUST", "MUST NOT"],
  ["SHALL", "SHALL NOT"],
  ["REQUIRED", "FORBIDDEN"],
  ["FORBIDDEN", "REQUIRED"],
  ["NEVER", "ALWAYS"],
  ["ALWAYS", "NEVER"],
]

/** Every modal occurrence in `text`, as {index, word, flip}, non-overlapping, longest-match-first. */
export function modalSites(text) {
  const sites = []
  for (let i = 0; i < text.length; ) {
    let hit = null
    for (const [word, flip] of MODALS) {
      if (!text.startsWith(word, i)) continue
      // A modal is a WORD, not a substring: `MUSTARD` and `SHALLOW` are not obligations.
      if (/[A-Za-z]/.test(text[i - 1] ?? "") || /[A-Za-z]/.test(text[i + word.length] ?? "")) continue
      hit = { index: i, word, flip }
      break
    }
    if (hit !== null) {
      sites.push(hit)
      i += hit.word.length
    } else i++
  }
  return sites
}

/**
 * THE PRIMARY MEASURE. Flip each modal in each carrier, one at a time, and ask whether any LIVE quote of
 * this invariant notices. Returns every site with its verdict so the count can never be a bare number.
 * @param {{line:number,text:string}[]} carriers every carrier of the anchor, as `invCarriers` returns them
 * @param {string[]} liveQuotes the normalised quote text of each REQ whose clause currently resolves
 */
export function modalFlips(carriers, liveQuotes, norm) {
  const sites = []
  carriers.forEach((c, ci) => {
    for (const s of modalSites(c.text)) {
      const mutated = c.text.slice(0, s.index) + s.flip + c.text.slice(s.index + s.word.length)
      // DETECTED iff some live quote that holds on the pristine carrier stops holding on the mutated one.
      const detected = liveQuotes.some((q) => holds(q, c.text, norm) && !holds(q, mutated, norm))
      // The surrounding text is carried so a report can name THIS obligation: an invariant with three
      // MUSTs would otherwise print three identical lines and a reader could not tell which is unheld.
      const context = c.text
        .slice(Math.max(0, s.index - 30), s.index + s.word.length + 45)
        .replace(/\s+/g, " ")
        .trim()
      sites.push({ carrier: c.line, carrierIndex: ci, word: s.word, flip: s.flip, index: s.index, detected, context })
    }
  })
  return sites
}

/**
 * The PROXIES, computed only so rule 1's "the choice changes the answer" is shown rather than asserted.
 * Each returns {covered, total}. The covered SPAN is the union of the live quotes' matched ranges in the
 * normalised carrier text — an elided quote contributes each fragment's range, not the gap between them.
 */
export function quoteSpans(quote, text, norm) {
  const t = norm(text)
  const spans = []
  let at = 0
  for (const frag of quote
    .split("…")
    .map((f) => f.trim())
    .filter((f) => f !== "")) {
    const i = t.indexOf(frag, at)
    if (i < 0) return []
    spans.push([i, i + frag.length])
    at = i + frag.length
  }
  return spans
}

/** Union of every live quote's spans over one carrier, merged, as [start,end) pairs on the normalised text. */
export function coveredSpans(carrier, liveQuotes, norm) {
  const all = liveQuotes.flatMap((q) => quoteSpans(q, carrier.text, norm)).sort((a, b) => a[0] - b[0])
  const out = []
  for (const [s, e] of all) {
    if (out.length > 0 && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e)
    else out.push([s, e])
  }
  return out
}

/** char / word / sentence / modal-clause coverage of one invariant, over all carriers. */
export function proxyMetrics(carriers, liveQuotes, norm) {
  let charCov = 0,
    charTot = 0,
    wordCov = 0,
    wordTot = 0,
    sentCov = 0,
    sentTot = 0,
    clCov = 0,
    clTot = 0
  for (const c of carriers) {
    const t = norm(c.text)
    const spans = coveredSpans(c, liveQuotes, norm)
    const inSpan = (i) => spans.some(([s, e]) => i >= s && i < e)
    charTot += t.length
    for (const [s, e] of spans) charCov += e - s
    // words: a word is covered iff ANY of its characters is inside a live span.
    for (const m of t.matchAll(/\S+/g)) {
      wordTot++
      if ([...Array(m[0].length).keys()].some((k) => inSpan(m.index + k))) wordCov++
    }
    // sentences: split on `. ` / `.$` — the corpus's own prose boundary. Covered iff ANY char is covered.
    let pos = 0
    for (const part of t.split(/(?<=\.)\s+/)) {
      const a = pos,
        b = pos + part.length
      pos = b + 1
      if (part.trim() === "") continue
      sentTot++
      if (spans.some(([s, e]) => s < b && e > a)) sentCov++
    }
    // modal clauses: each modal occurrence owns the text to the next modal or end. Covered iff ANY char is.
    const nsites = modalSites(t)
    nsites.forEach((s, k) => {
      const a = s.index,
        b = k + 1 < nsites.length ? nsites[k + 1].index : t.length
      clTot++
      if (spans.some(([x, y]) => x < b && y > a)) clCov++
    })
  }
  return { charCov, charTot, wordCov, wordTot, sentCov, sentTot, clCov, clTot }
}

/**
 * THE CARRIER SPLIT, and it is the sharpest result here. `req-clause-guard` takes its verdict at the FIRST
 * carrier of an anchor, so only that carrier can ever be held by a live quote. Every LATER carrier — the
 * `## Acceptance` restatement of the same ratified invariant — is held by nothing at all, and those
 * restatements are written in the indicative ("A T0 territory whose ratio crosses 15% fails the gate"), so
 * they contain no modal for `modalFlips` to flip either. Both facts are DERIVED and printed by `report`
 * below rather than asserted here, because a number in a comment rots away from the tree it described.
 */
export function score(anchor, norm) {
  const live = anchor.quotes.filter((q) => q.live).map((q) => q.q)
  const prim = anchor.carriers.slice(0, 1)
  const sec = anchor.carriers.slice(1)
  const pm = proxyMetrics(prim, live, norm)
  const sm = proxyMetrics(sec, live, norm)
  const flips = modalFlips(prim, live, norm)
  const frac = (a, b) => (b === 0 ? null : a / b)
  return {
    anchor: anchor.anchor,
    carriers: anchor.carriers.length,
    live: live.length,
    waived: anchor.quotes.length - live.length,
    liveQuotes: live,
    flips,
    flipDetected: flips.filter((f) => f.detected).length,
    flipTotal: flips.length,
    mf: frac(flips.filter((f) => f.detected).length, flips.length),
    ch: frac(pm.charCov, pm.charTot),
    wd: frac(pm.wordCov, pm.wordTot),
    se: frac(pm.sentCov, pm.sentTot),
    cl: frac(pm.clCov, pm.clTot),
    secCh: frac(sm.charCov, sm.charTot),
  }
}

/**
 * IS THE `## Acceptance` RESTATEMENT ACTUALLY A DUPLICATE? (issue #208, WP-GOV-4 second deliverable)
 *
 * If these were merely the same rule stated twice, the honest fix would be to delete a copy rather than pin it —
 * this repo has spent a week finding that two statements of one rule is the defect. So this asks, per
 * restatement, what it says that its primary carrier does NOT: identifiers, numeric thresholds and normative
 * modals that appear in the restatement and nowhere in the invariant statement.
 *
 * IT IS A LEXICAL TEST AND THAT IS ITS LIMIT, stated rather than implied. Introducing a token the primary
 * lacks PROVES the restatement carries content the primary does not. The converse does NOT hold: a
 * restatement built entirely from the primary's vocabulary can still negate or re-scope it, so "no new
 * token" means CANDIDATE-equivalent and needs a human read. Semantic equivalence is not decidable here and
 * no model is consulted (A3), so the classes below are evidence for a reviewer, never a verdict.
 */
const STOP = new Set(
  "a an the is are be by of to in on for and or not it its this that as at from with each every any all must shall may only never always no".split(
    " ",
  ),
)
const bare = (t) => t.replace(/\*\*|[*_]/g, "")
const words = (t, norm) =>
  new Set(
    [
      ...bare(norm(t))
        .toLowerCase()
        .matchAll(/[a-z0-9][a-z0-9._/≥≤+-]*/g),
    ]
      .map((m) => m[0])
      .filter((w) => w.length > 1 && !STOP.has(w)),
  )
const idents = (t) => new Set([...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]))
const numerals = (t) => new Set([...bare(t).matchAll(/\d+(?:\.\d+)?%?/g)].map((m) => m[0]))

export function restatementNovelty(anchor, norm) {
  const out = []
  const prim = anchor.carriers[0]
  const pw = words(prim.text, norm),
    pi = idents(prim.text),
    pn = numerals(prim.text)
  const pm = new Set(modalSites(prim.text).map((x) => x.word))
  for (let i = 1; i < anchor.carriers.length; i++) {
    const c = anchor.carriers[i]
    // Drop the "N. **ID** —" label: scaffolding, not content.
    const body = c.text.replace(/^\s*\d+\.\s*\*\*[^*]+\*\*\s*(—|-)?\s*/, "")
    const newIdents = [...idents(body)].filter((x) => !pi.has(x))
    const newNums = [...numerals(body)].filter((x) => !pn.has(x))
    const newModals = [...new Set(modalSites(body).map((x) => x.word))].filter((x) => !pm.has(x))
    const newWords = [...words(body, norm)].filter((x) => !pw.has(x))
    out.push({
      key: `${anchor.anchor}@carrier${i + 1}`,
      line: c.line,
      newIdents,
      newNums,
      newModals,
      newWords,
      adds: newIdents.length > 0 || newNums.length > 0 || newModals.length > 0,
    })
  }
  return out
}

const pct = (x) => (x === null ? "  n/a" : `${(100 * x).toFixed(1)}%`)
const median = (xs) => {
  const s = [...xs].filter((x) => x !== null).sort((a, b) => a - b)
  if (s.length === 0) return null
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/**
 * Print the whole distribution WITH ITS MEMBERS. Every count below names what it counted: a bare count has
 * rotted in this repo repeatedly, twice inside the very guard built to stop it (issue #208 I4).
 * @param {object[]} dump `REQ_CLAUSE_DUMP` output of `req-clause-guard`, so the enumeration is the gate's.
 */
export function report(dump, norm, log = console.log) {
  const rows = dump.map((a) => score(a, norm))
  log(
    `quote-coverage — ${rows.length} invariant(s) cited by at least one evaluable REQ, scored from this run of req-clause-guard.`,
  )
  log(`  PRIMARY-CARRIER coverage (the only carrier any live quote can hold), medians:`)
  for (const [k, label] of [
    ["mf", "modal-flip detected"],
    ["cl", "modal-clause"],
    ["se", "sentence"],
    ["wd", "word"],
    ["ch", "character"],
  ])
    log(`    · ${label.padEnd(22)} ${pct(median(rows.map((r) => r[k])))}`)
  const flippable = rows.filter((r) => r.flipTotal > 0)
  const det = flippable.reduce((s, r) => s + r.flipDetected, 0)
  const tot = flippable.reduce((s, r) => s + r.flipTotal, 0)
  log(
    `  MODAL FLIPS — ${tot} normative modal(s) across ${flippable.length} invariant(s); ${det} are caught by a live quote, ${tot - det} are NOT.`,
  )
  for (const r of flippable.filter((x) => x.flipDetected < x.flipTotal))
    for (const f of r.flips.filter((x) => !x.detected))
      log(
        `    · UNCAUGHT FLIP  ${r.anchor}:${f.carrier} "${f.word}" -> "${f.flip}" in …${JSON.stringify(f.context)}… — this obligation can be reversed and NO live quote of the ${r.live} it has would break`,
      )
  const zero = rows.filter((r) => r.flipTotal > 0 && r.flipDetected === 0)
  log(`  ZERO-PROTECTION — ${zero.length} invariant(s) carry a modal and NOT ONE flip is caught:`)
  for (const r of zero)
    log(`    · ${r.anchor} — 0/${r.flipTotal} flips caught, char ${pct(r.ch)}, ${r.live} live / ${r.waived} waived`)
  const noModal = rows.filter((r) => r.flipTotal === 0)
  log(
    `  NO MODAL AT ALL — ${noModal.length} invariant(s) state their force without MUST/SHALL, so the flip test cannot speak for them; judge these on char coverage:`,
  )
  for (const r of noModal) log(`    · ${r.anchor} — char ${pct(r.ch)}, ${r.live} live / ${r.waived} waived`)
  const multi = rows.filter((r) => r.carriers > 1)
  const secZero = multi.filter((r) => r.secCh === 0)
  log(
    `  SECOND CARRIER — ${multi.length} of ${rows.length} invariant(s) are restated at a later carrier that req-clause-guard never judges; ${secZero.length} of those restatements have ZERO character coverage:`,
  )
  for (const r of secZero) log(`    · ${r.anchor} — primary char ${pct(r.ch)}, restatement char ${pct(r.secCh)}`)
  // ── IS THE RESTATEMENT A DUPLICATE WORTH DELETING, OR CONTENT THAT EXISTS ONLY THERE? ──────────────
  const nov = dump.flatMap((a) => restatementNovelty(a, norm))
  const addsContent = nov.filter((r) => r.adds)
  const contained = nov.filter((r) => !r.adds && r.newWords.length === 0)
  log(`  RESTATEMENT NOVELTY — ${nov.length} restatement carrier(s) examined against their own invariant statement.`)
  log(
    `    ${addsContent.length} introduce an identifier, number or modal the statement NEVER contains, so they are not restatements at all — that normative text exists in exactly ONE place and deleting it would delete ratified content:`,
  )
  for (const r of addsContent)
    log(
      `    · ADDS CONTENT  ${r.key} (line ${r.line})` +
        `${r.newIdents.length ? ` identifiers [${r.newIdents.map((x) => "`" + x + "`").join(", ")}]` : ""}` +
        `${r.newNums.length ? ` numbers [${r.newNums.join(", ")}]` : ""}` +
        `${r.newModals.length ? ` modals [${r.newModals.join(", ")}]` : ""}`,
    )
  log(
    `    ${contained.length} are built entirely from the statement's own vocabulary (the only class a de-duplication could safely touch, and LEXICAL evidence only — a human must still read them).`,
  )
  for (const r of contained) log(`    · VOCABULARY-CONTAINED  ${r.key} (line ${r.line})`)
  log(
    `    ${nov.length - addsContent.length - contained.length} add prose words but no identifier, number or modal: CANDIDATE-equivalent, needs a human read.`,
  )
  return rows
}
