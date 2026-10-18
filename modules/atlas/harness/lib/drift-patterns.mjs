// harness/lib/drift-patterns.mjs — the governance-count DRIFT vocabulary, extracted so it can be TESTED.
//
// These patterns are the whole of `spec-conformance-guard`'s check (2). They live in their own module for
// one reason: a regex nobody can falsify is not a gate. Kept here they are importable by
// `drift-patterns.test.mjs` without importing the guard's top-level work (dist import, repo-wide sweep,
// `process.exit`), so the corpus below is exercised on every `npm test` instead of in someone's shell.
//
// The corpus that motivated each entry is recorded in the test, not paraphrased here.

/** Pre-amendment governance-count forms. A line matching any of these is drift unless {@link ALLOW} clears it. */
export const STALE = [
  /\b(4|four)[ -]?(governance|governed|legs?|tools?|write)\b/i,
  /\bfour-leg\b/i,
  /\b4-leg\b/i,
  /\b4-tool\b/i,
  /\bno fifth\b/i,
  /\bfifth (governance|write) tool\b/i,
  /writePaths ?== ?1\b/i,
  /write-?[sS]urface ?== ?4\b/i,
  /cardinality ?== ?4\b/i,
  /\bthe closed four\b/i,
  /\bthe four governed tools\b/i,
  /\bexactly four\b/i,
  // The SINGULAR-write-door form. Previously unmatched by ANY pattern — which is how `handler.ts` shipped
  // "the single fail-closed write door" as the MCP-published description of `atlas-emit`, telling every
  // agent seat there is one write door, for four days after the amendment.
  //
  // Matched on the CONCEPT rather than a literal phrase (a literal `/single[ -]write[ -]door/` misses
  // "single **fail-closed** write door"). A plain `.{0,24}` gap false-fired on "…the one question a write
  // door must ask", where `one` quantifies `question`, not `write door` — the ARTICLE is the tell, so the
  // gap forbids one rather than restricting what else may appear.
  //
  // The gap is a CHARACTER class, not `\s`-separated word tokens. A word-token gap silently lost the very
  // form the paragraph above claims to catch: markdown bold, a comma, or backticks between "single" and
  // "write door" are punctuation, not word characters, so `single **fail-closed** write door`,
  // `single, fail-closed write door` and ``a single `fail-closed` write door`` all escaped it. That is
  // strictly weaker than the regex this module was extracted from, in a commit that called itself an
  // extraction — a gate quietly losing teeth is worse than a gate that never had them.
  /\b(?:single|one)\b(?:(?!\b(?:an?|the)\b)[^.\n]){0,26}\bwrite doors?\b/i,
  /\bthe only write door\b/i,

  // ── UNENFORCED-CONTROL claims ─────────────────────────────────────────────────────────────────────
  // A SECOND class of overclaim, and the one this guard was blind to. Every pattern above is about a
  // COUNT; none of them is about whether a described control actually exists. So three copies of
  // "`.atlas/policy.json` is locked via CODEOWNERS + branch protection" sailed through — including the
  // one inside `.atlas/policy.json` itself, the authorization source of truth, where a reader is being
  // handed a guarantee at the exact moment they most need it to be true.
  //
  // It was never in force: GitHub rejects the CODEOWNERS line as an unknown owner (the team exists in no
  // org, and `git log --follow` shows it never did), and branch protection is unavailable on this repo's
  // plan entirely — 403 "Upgrade to GitHub Pro or make this repository public", for rules AND rulesets.
  // A guard that stops a doc from overstating a NUMBER but lets it invent an ENFORCEMENT MECHANISM is
  // guarding the cheap half.
  /\block(?:ed|s)?\b[^.\n]{0,20}\bvia\b[^.\n]{0,20}\bCODEOWNERS\b/i,
  /\badmin-locked\b/i,
  /\bonly\b[^.\n]{0,20}\badmins?\b[^.\n]{0,12}\bratif/i,
  /\brequires? a review from\b/i,

  // ── the FIVE→UNION amendment (ADR-0006) ───────────────────────────────────────────────────────────
  // A THIRD amendment, and the third time the same meta-lesson landed: ADR-0006 killed "the MCP server
  // publishes EXACTLY five tools" (the surface is now the closed `Tool` union, and it grows by progressive
  // disclosure). The amendment ran through S0, S1, the reference and the S3 goldens — and stopped one spec
  // layer short. `method-tags-adapters.md` kept the pre-amendment text verbatim for days, and a sweep found
  // four further residues in the roadmap, the goldens summary and a WP card.
  //
  // Every one of them was invisible HERE, because this file had a pattern for `four`→`five` and a pattern
  // for unenforced controls, and none for `five`→union. THE RULE THIS ENCODES: an amendment that is not
  // given its own drift pattern will leave residue, every time — three for three so far. `GOVERNANCE_SURFACE`
  // really is 5 today; what was killed is the claim that it is exactly and PERMANENTLY five.
  // NARROWED, and the near-miss is worth recording: the first draft matched `exactly five` outright and
  // flagged twelve sites that are TRUE. `GOVERNANCE_SURFACE` IS exactly five (INV-TOOLS-1 / ADR-0003, pinned
  // by check (1) of this guard) — what ADR-0006 killed is the claim about the set the MCP server PUBLISHES,
  // which is now `GOVERNANCE_SURFACE ∪ READ_SURFACE`. A guard broad enough to force true statements to be
  // weakened is worse than no guard, so these match the PUBLISHED/ADVERTISED/REGISTERED surface only.
  /\b(?:publishe?s?|advertis\w+|registers?|registered)\b[^.\n]{0,60}\bexactly (?:the )?five\b/i,
  /\bexactly (?:the )?five\b[^.\n]{0,60}\b(?:publishe?d|advertised|registered)\b/i,
  /\bno sixth tool\b[^.\n]{0,30}\b(?:registered|published|advertised)\b/i,
  /\bclosed five-tool\b/i,

  // ── the OBVIOUSNESS-IS-SCORED amendment (ADR-0012) ────────────────────────────────────────────────
  // The FOURTH amendment, and this file's own rule — "an amendment that is not given its own drift
  // pattern will leave residue, every time — three for three so far" — is why this block exists BEFORE
  // the residue does, instead of after a sweep finds it. Four for four would have been the alternative.
  //
  // ADR-0012 killed one sentence that ran through three ratified invariant families in three layers:
  // "a true-but-obvious fact is rejected". Obviousness is now SCORED and stored; the only surviving
  // rejection is HARMFUL-TO-STORE (secret / PII, where storing IS the harm). `nonObvious` kept its
  // predicate and lost its authority to reject, so a doc re-asserting the door is describing a call site
  // that no longer exists.
  //
  // NARROW on purpose, and the near-misses are named because a broad `/two-door/` flags two TRUE things:
  // `goldens-tls.md`'s "two-door WRITE_PATHS" (the two governed WRITE doors — a different pair entirely)
  // and `design/structure.md`'s one-door/two-door K/M partition (unrelated to admission). Both are
  // allow-listed below rather than left to luck, since a guard broad enough to force true statements to
  // be weakened is worse than no guard — the lesson the `exactly five` draft already paid for above.
  // THE BAR IS STILL TWO DOORS. The first draft of this block matched `(?:2|two)-door … (bar|admission)`
  // outright and flagged twelve sites that are TRUE — including `README.md` and `ARCHITECTURE.md`. The
  // amendment SWAPPED the second door (obviousness → harmful-to-store); it did not remove the structure.
  // So "clears the 2-door bar" stays true and must not be pressured into being softened. What is dead is
  // the second door being OBVIOUSNESS, and obviousness REJECTING — these match that and nothing else.
  /\btrue-but-obvious\b[^.\n]{0,40}\b(?:reject|blocked|noise|dropped|refused)/i,
  /\bnon-?obviousness door\b/i,
  /\bfails the (?:2|two)-door\b/i,
  /\b(?:2|two)-door\b[^.\n]{0,40}\b(?:non-?obvious|usefulness)\b/i,
  /\b(?:non-?obvious|usefulness)\b[^.\n]{0,40}\b(?:2|two)-door\b/i,
  /\bobvious\b[^.\n]{0,24}\bseed is rejected\b/i,
]

/** A line matching any of these is a LEGITIMATE use of the words above, not drift. */
export const ALLOW = [
  // NARROW on purpose: `ADR-0003` specifically, not `ADR-\d+`. This clears the ONE amendment whose
  // narrative must quote the pre-amendment count; a general ADR reference would let any future document
  // re-assert a retired count merely by citing an ADR nearby.
  /ADR-0003/,
  /\bformer\b/i,
  /\bamend/i,
  /\baccidental\b/i,
  /\bevolves\b/i,
  /\bwording\b/i, // amendment narrative
  /single-write-door structural/i, // INV-TOOLS-15 term-of-art (store-row medium)
  // Doctor's READ legs. The `DoctorApi` port still has exactly four (`packages/tools/src/doctor.ts`) and
  // saying so is true, so `four read legs` stays. What was REMOVED is the pair that cleared claims about the
  // CLI SUBCOMMAND surface — `the four legs, no more` and `exactly the four legs` — because that surface is
  // five as of `atlas doctor index`, and an allow-list entry that outlives the fact it was written for is a
  // standing licence to re-assert a retired count. `DOCTOR_SUBCOMMANDS` went with them: it was the broadest
  // entry in this list, clearing ANY count claim on any line that merely NAMED the constant, which is how
  // "Exactly four subcommands (`DOCTOR_SUBCOMMANDS`)" sat in the shipped command reference unflagged.
  /four read legs?/i,
  /ALL FOUR legs/i, // doctor read legs (the port, not the CLI surface)
  /GATE's four legs/i,
  /the four legs route/i,
  // Unenforced-control narrative: a line that NAMES the mechanism in order to say it is absent, aspirational
  // or historical is the honest form and must survive. Kept deliberately narrow — these are words that
  // negate or hypothesise, never words that assert.
  /\bNOT IN FORCE\b/i,
  /\bnever in force\b/i,
  /\bnot enforced\b/i,
  /\bby intent\b/i,
  /\bused to claim\b/i,
  /\bis NOT\b/,
  /\bwould require\b/i,
  /\bunavailable\b/i,
  /\baspirational\b/i,
  /\bonce the team exists\b/i,
  /\bUpgrade to GitHub\b/i,
  /\bunknown owner\b/i,
  // five→union narrative. NARROW on purpose — `ADR-0006` specifically, exactly as `ADR-0003` is handled
  // above: a general `ADR-\d+` would let any future doc re-assert a retired claim just by citing an ADR.
  /ADR-0006/,
  /\bprogressive disclosure\b/i,
  /\bpermanent(ly)?\b/i,
  /\bretired\b/i,
  /\bsuperseded\b/i,
  /\bold rule\b/i,
  // `GOVERNANCE_SURFACE` on the line is the tell that "five" qualifies the GOVERNED set — which IS closed at
  // five (INV-TOOLS-1 / ADR-0003) and is pinned by check (1) of this guard. ADR-0006 killed the claim about
  // the set the MCP server ADVERTISES (now `GOVERNANCE_SURFACE ∪ READ_SURFACE`), not this one. Without this
  // allow the guard flags a dozen true statements and pressures a correct invariant into being softened —
  // the failure mode where a gate makes the codebase LESS honest.
  /GOVERNANCE_SURFACE/,
  // ADR-0012 narrative + the two-doors that are NOT the admission bar. `ADR-0012` specifically, never
  // `ADR-\d+`, for the reason stated at the top of this list. `WRITE_PATHS` clears the two GOVERNED WRITE
  // doors (atlas-emit / atlas-link), which ADR-0012 does not touch; `K/M` and `partition` clear the
  // structure doc's one-door/two-door split, which is about module shape, not admission. `harmful to
  // store` is the door that SURVIVED — a line asserting it rejects is stating the amendment, not drifting.
  /ADR-0012/,
  /\bscored\b/i,
  /\bnever gated\b/i,
  /\bnever a veto\b/i,
  /\bharmful to store\b/i,
  /WRITE_PATHS/,
  /\bpartition\b/i,
  // Sibling of `used to claim` above, and needed for the same reason: a comment that QUOTES the killed
  // sentence in order to record that it is dead is the honest form. Without this the guard flags the
  // amendment's own tombstone — measured on `grounding/src/emit-guard.ts`, which does exactly that.
  /\bused to read\b/i,
  // A `teeth:` line that NAMES the mutant is the amendment's enforcement, not its residue. `breaks-on "a
  // resurrected obviousness veto … this true-but-obvious fact is rejected"` describes the SYMPTOM the
  // mutant would produce — flagging it would delete the very assertion that keeps the gate from coming
  // back. Same shape as `retired` / `superseded` in the ADR-0006 block above.
  /\bresurrect\w*/i,
]

/** Is this line a stale governance-count claim? Pure + total — the guard's per-line verdict, verbatim. */
export function isStaleGovernanceClaim(line) {
  return STALE.some((r) => r.test(line)) && !ALLOW.some((r) => r.test(line))
}
