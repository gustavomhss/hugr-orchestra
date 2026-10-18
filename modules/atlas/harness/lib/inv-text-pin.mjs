// harness/lib/inv-text-pin.mjs — coverage classification + the CARRIER text pin that backs it.
//
// ── THE HOLE THIS CLOSES (reproduced, not inherited) ─────────────────────────────────────────────────
// `req-clause-guard` protects an invariant TRANSITIVELY: it holds each citing REQ's `normative-clause`
// against the invariant's own block, so amending the invariant breaks the quotes. A row in
// `harness/req-clause-ledger.json` is a WAIVED quote — a divergence a human ruled pre-existing. The
// mechanism is legitimate and stays. What was never checked is what happens when it becomes TOTAL.
//
// MEASURED on this tree: `INV-TOOLS-1` — the constitutional write-door invariant — is cited by five REQs
// and all five are ledgered. No live quote remains to break. The whole normative text of that invariant was
// replaced with its own negation ("There is NO governance surface... writes MUST NOT flow through a
// governed write door... every refusal MUST be SILENT") and EVERY gate in `harness/gates/` exited 0. The
// instrument was not dead: widening the same splice to also swallow `INV-TOOLS-2` made `req-clause-guard`
// exit 1, naming `REQ-TOOLS-2a`/`2b`. So 100% waiver coverage of an invariant = ZERO protection for it.
//
// ── WHY A DIGEST OF THE TEXT, AND NOT "REQUIRE ONE LIVE QUOTE" ───────────────────────────────────────
// The obvious fix is to demand that some citing REQ keep an unwaived quote. It was TESTED and it is not
// protection, because a quote is a FRAGMENT. `INV-PERSIST-14` stands one waiver from this state: its sole
// live quote is `REQ-PERSIST-14-e`'s four words `"byte-identical across runs"`. That invariant's block was
// inverted end to end — "MUST partition" to "MUST NOT partition", "a **PURE READ** (0 mutation)" to "a
// WRITE (mutation REQUIRED)", "**not** a stored/materialized diff" to "MUST be a stored/materialized
// diff" — with those four words left in place, and `req-clause-guard` still scored `REQ-PERSIST-14-e` as
// OK and exited 0. A rule satisfied by four surviving words would have certified that inversion as
// protected. So the pin is over the invariant's OWN text: nothing short of it covers what the citing REQs
// no longer do.
//
// ── WHAT IS PINNED, EXACTLY: THE CARRIER, NOT THE INVARIANT ──────────────────────────────────────────
// MEASURED (WP-GOV-4, issue #208) and it is why this moved down a level. An anchor is carried MORE THAN
// ONCE in these docs: the `## Invariants` bullet states the rule, and a numbered `## Acceptance` entry
// restates it in the indicative. `req-clause-guard` takes its verdict at the FIRST carrier, so a live quote
// can only ever hold there. Every LATER carrier was held by NOTHING, and inverting one — `INDEX-16`'s
// restatement, "crosses 15% fails the standing coverage gate at build time" turned into "PASSES ... and is
// DEFERRED to a later axis, never checked at build time" — left all nine gates at exit 0.
//
// So the pinned unit is the CARRIER. A carrier that no live quote resolves into must carry a digest that
// still matches the tree.
//
// THIS IS A GENERALISATION OF #124, NOT A SECOND MECHANISM, and the reason is exact rather than rhetorical:
// a quote is LIVE precisely when it holds at the FIRST carrier, so "the first carrier is covered by no live
// quote" and "the invariant has zero live quotes" are the SAME predicate — #124's rule is this rule, read at
// ordinal 1. Verified on the real corpus: identical verdict on every cited anchor, zero mismatches. The only
// pins this adds are at ordinals ≥ 2, which #124 could not name at all.
//
//   - The key is `<anchor>@carrier<ordinal>`, 1-based in document order. ORDINAL, never line number: an
//     unrelated edit higher in the file moves every line and would rot a line-keyed pin instantly. Inserting
//     a carrier in the middle shifts ordinals and breaks the digests, which is correct — it FAILS loudly
//     rather than silently re-pointing a pin at text nobody ratified.
//   - The key is hashed WITH the text, so a pin cannot be moved between carriers by copy-paste.
//   - Normalised the way the guard already normalises: whitespace runs collapsed (these docs hard-wrap at
//     ~110 columns, so reflowing a paragraph is not a change of text), and HTML comments already stripped by
//     the caller (the house records an amendment as an `<!-- AMENDED ... -->` tombstone INSIDE the block; a
//     pin that broke on adding one would push authors to skip the tombstone).
// NOT case-folded, NOT markdown-stripped, NOT punctuation-folded: `MUST` is not `must`, and the amendment
// that shipped `req-clause-guard` turned "pack" into "**governing** pack", which a `**`-blind pin cannot see.
//
// ── THE COST, STATED PLAINLY, BECAUSE IT IS NO LONGER SMALL ──────────────────────────────────────────
// #124 pinned 2 invariants. This pins every carrier nothing quotes, and on this corpus that is a much larger
// number — DERIVED and PRINTED by `req-clause-guard` on every run, never transcribed here, because a count in
// a comment rots away from the tree it described.
//
// WHAT IT COSTS YOU, THE NEXT EDITOR: if you amend the ratified text of a pinned carrier — including an
// `## Acceptance` restatement, which is easy to think of as prose and is not — this gate FAILS until you
// update that carrier's digest in the pin file IN THE SAME COMMIT and record who ratified the change. That
// is the entire point of a pin and not a side effect: the pinned set is exactly the set whose ratified text
// nothing else is watching. It is still a real tax, and it is why the set is DERIVED rather than authored —
// a carrier that gains a live quote makes its pin STALE, and a stale pin FAILS, so the set only shrinks.

import { createHash } from "node:crypto"

/** The guard's own normalisation: runs of whitespace collapse to one space. */
export const norm = (s) => s.replace(/\s+/g, " ").trim()

/** The stable identity of one carrier: its anchor plus its 1-based ordinal in document order. */
export const carrierKey = (anchorKey, ordinal) => `${anchorKey}@carrier${ordinal}`

/**
 * The pin over ONE carrier: its key hashed together with its normalised text.
 * @param {string} key as `carrierKey` builds it
 * @param {string} text the carrier's raw text, as `req-clause-guard`'s `invCarriers` returns it
 */
export function carrierDigest(key, text) {
  return createHash("sha256").update(key).update(" ").update(norm(text)).digest("hex").slice(0, 32)
}

/**
 * Every carrier that NO live quote resolves into, in anchor then document order. These are the spans whose
 * ratified text nothing mechanical is watching, and so exactly the set that must be pinned.
 *
 * @param {Map<string, {carriers: object[], carrierLive: string[][]}>} coverage anchorKey -> its carriers and,
 *        per carrier, the ids of the live REQ quotes that resolve into THAT carrier (computed by the gate
 *        with the same `holds` it publishes its verdicts with, so no second opinion can exist here).
 */
export function uncoveredCarriers(coverage) {
  const out = []
  for (const [anchor, v] of [...coverage].sort()) {
    v.carriers.forEach((c, i) => {
      if (v.carrierLive[i].length > 0) return
      out.push({
        anchor,
        ordinal: i + 1,
        of: v.carriers.length,
        line: c.line,
        text: c.text,
        key: carrierKey(anchor, i + 1),
        first: i === 0,
      })
    })
  }
  return out
}

/**
 * The refusals, in BOTH directions. A carrier nothing quotes MUST carry a pin and that pin MUST still match;
 * a pin for a carrier that has regained a live quote — or that no longer exists — is STALE and fails, so the
 * pinned set can never rot into a standing exemption list.
 */
export function pinProblems(uncovered, pins, pinFile) {
  const problems = []
  const expected = new Map(uncovered.map((c) => [c.key, c]))
  for (const c of uncovered) {
    const where =
      c.of === 1
        ? `line ${c.line}`
        : `line ${c.line}, carrier ${c.ordinal} of ${c.of}${c.first ? "" : " — an ## Acceptance restatement, which no live quote can ever reach"}`
    const digest = carrierDigest(c.key, c.text)
    const pin = pins[c.key]
    if (pin === undefined) {
      problems.push(
        `UNPROTECTED CARRIER '${c.key}' (${where}): no live REQ quote resolves into this carrier, so NOTHING ` +
          `mechanically holds its ratified text and it could be replaced by its own negation with every gate ` +
          `still green. Restore protection by making a citing REQ lift this carrier verbatim; or PIN it: add ` +
          `"${c.key}": { "digest": "${digest}", "why": "<who ratified this text, and when>" } to ${pinFile}. ` +
          `That digest is computed from the tree as it stands right now.`,
      )
    } else if (pin.digest !== digest) {
      problems.push(
        `PINNED CARRIER '${c.key}' (${where}) HAS CHANGED: no live REQ quote covers this carrier, so its pin is ` +
          `the only thing holding its ratified text, and that text no longer matches. Pinned ` +
          `${JSON.stringify(pin.digest)}, tree is ${JSON.stringify(digest)}. If the edit is ratified, update the ` +
          `digest in ${pinFile} IN THE SAME COMMIT and record who ratified it; otherwise revert the edit. ` +
          `Pinned because: ${JSON.stringify(pin.why ?? "(no reason recorded)")}.`,
      )
    }
  }
  for (const key of Object.keys(pins)) {
    if (expected.has(key)) continue
    problems.push(
      `STALE PIN '${key}' in ${pinFile}: this carrier is no longer in the uncovered set, so the pin would ` +
        `silently outlive the condition that justified it. Either a live REQ quote reaches it again (good — ` +
        `delete the entry, the pinned set only shrinks), or the carrier itself is GONE: the anchor lost a ` +
        `carrier, was renumbered, or no evaluable REQ cites it any more, and deleting ratified text must be ` +
        `said deliberately rather than done by letting a pin dangle.`,
    )
  }
  return problems
}

/**
 * Split the cited invariants by how much LIVE quote coverage each still has.
 *
 * @param {Map<string, { live: string[], waived: string[], carriers: object[] }>} coverage
 *        anchorKey -> the REQ ids whose quote resolves into it, those whose quote diverges, its carriers.
 * @returns unprotected (zero live quotes, so nothing mechanical is left) and nearMiss (exactly one live
 *          quote AND at least one waiver: one more waiver from unprotected, REPORTED so the class is
 *          visible before it bites, never gated on).
 */
export function classifyCoverage(coverage) {
  const unprotected = []
  const nearMiss = []
  for (const [anchor, v] of [...coverage].sort()) {
    const row = { anchor, live: v.live, waived: v.waived, carriers: v.carriers }
    if (v.live.length === 0) unprotected.push(row)
    else if (v.live.length === 1 && v.waived.length > 0) nearMiss.push(row)
  }
  return { unprotected, nearMiss }
}
