// @atlas/cli — src/mine-claim-scrub.ts  (T0 — the mined CLAIM's own scrub-before-hash, sibling of mine-answer.ts)
//
// #195(b) scrubbed the ANSWER bytes (`mine-answer.ts` → `answerRef`) but left the SEPARATE text that becomes
// the fact's `claimNorm` untouched — and `claimNorm` is not a transport field like `rawAnswer`: it is the
// identity-bearing claim body itself (KNOW-4c dedup ingredient), stamped straight onto the fact object that
// `mine-decide.ts` hashes into CAS (`id(f)`) and onto the `WriteRequest.claimNorm` carrier. A model answer
// that contains a credential shape therefore still reached CAS raw, through the CLAIM, even though the
// separately-stored answer copy was already scrubbed — same class as #207 / #118 / #121.
//
// SCRUB, THEN HASH (KNOW-11) — same order and the SAME `@atlas/persist` primitive `mine-answer.ts` uses,
// applied to the ADVISORY claim body before anything derives identity or bytes from it. `mine-decide.ts`
// calls this ONCE, before `id(f)` / `nodeKey` / `WriteRequest.claimNorm` are computed, so every downstream
// consumer of the claim text sees the same (scrubbed) bytes — there is no separate raw copy anywhere.
//
// WHY THE SCRUBBED TEXT BECOMES THE ONE CLAIM, RATHER THAN A SEPARATE STORED COPY (unlike the answer
// receipt): `claimNorm` for an ADVISORY fact does not feed `nodeKey` at all (`nodeKey` = `hash(primaryAnchor
// ‖ slot)`, body-wording independent — knowledge/src/write/router.ts `nodeKey`), so scrubbing it changes
// WHAT is claimed but never WHICH node claims it: no advisory nodeKey can collide or relocate because of
// this scrub. It only narrows `contentHash` (`id(f)`), which is a CAS dedup key — two claims that scrub to
// the same bytes really are the same public claim, and content-address dedup collapsing them is correct,
// not a defect (`mine-claim-scrub.test.ts` pins that two DISTINCT non-secret claims still diverge).
//
// THE TWO LEGS — advisory `claimNorm` (below) AND predicate `check` (`scrubCheck`, WP-219). The advisory leg
// was closed by #207; the PREDICATE leg was the second, then-unmeasured gap this module's header flagged and
// WP-219 now measures + closes. A predicate fact's identity-bearing claim body is `normalizeCheck(f.check)`
// (mine-decide.ts `claimNormOf`), and — UNLIKE advisory `claimNorm` — `f.check` also folds into the predicate
// `nodeKey` (KNOW-15c: "a distinct check ⇒ a distinct node"; router.ts preimage `{a, c: normalizeCheck(check),
// s}`). So a credential shape in a synthesized `check` reached CAS raw through `id(f)` AND polluted node
// identity through the nodeKey preimage — a DOUBLE-leg leak, same class as #207 / #118 / #121, latent only
// because mine-gate.ts hardcodes kind:'advisory' today (#96 is about to make it emit predicates).
//
// IDENTITY-CONSISTENCY, THE DESIGN CONSTRAINT THAT MAKES THE PREDICATE LEG DIFFERENT FROM THE ADVISORY ONE:
// because `check` feeds `nodeKey`, this CANNOT be a CAS-only redaction. `mine-decide.ts` scrubs `f.check` ONCE,
// before `f` is built (exactly as it scrubs `claimNorm` before building `f`), so the SAME scrubbed check bytes
// feed `id(f)`/`contentHash` AND the nodeKey preimage (`view` is spread from `f`, so `nodeKey(view)` reads the
// scrubbed `check`). A scrub-for-storage / raw-for-identity split would (a) re-open the leak on the identity
// leg and (b) relocate two scrub-equal predicates to DIFFERENT addresses; scrubbing the one `check` at source
// forecloses both. It only narrows `contentHash`/`nodeKey` where the raw bytes differ ONLY in a credential
// shape — two predicates whose checks scrub-equal really are the same public predicate, so collapsing them is
// correct (`mine-predicate-check-scrub.test.ts` pins that two DISTINCT non-secret checks still diverge).

import { scrub } from "@atlas/persist"
import type { Check } from "@atlas/knowledge"
// `FactGrounding = AdvisoryNode['grounding']` — the SAME `Grounding` type, re-exported by @atlas/genesis (an
// already-declared @atlas/cli edge). Imported from here rather than @atlas/grounding directly so this leg adds
// no new architecture edge (ARCH-1): mine-gate.ts uses the identical alias for exactly this reason.
import type { FactGrounding } from "@atlas/genesis"

/** The one whole-buffer scrub both legs share — `@atlas/persist` `scrub` (the same `mine-answer.ts` uses for
 *  the answer), which redacts credential SHAPES to an ASCII placeholder and preserves valid UTF-8, so the
 *  result round-trips losslessly through the CAS object `mine-decide.ts` hashes. */
const scrubUtf8 = (s: string): string => Buffer.from(scrub(Buffer.from(s, "utf8"))).toString("utf8")

/**
 * Scrub a mined ADVISORY claim's body — applied BEFORE the claim becomes part of any hashed/stored bytes.
 */
export function scrubClaimNorm(claimNorm: string): string {
  return scrubUtf8(claimNorm)
}

/**
 * Scrub a mined PREDICATE fact's `check` body — the `expr` (assertion) or `query` (index-query) leg of the
 * `Check` tagged union — BEFORE `f` is built, so the ONE scrubbed check feeds `id(f)`/`contentHash` AND the
 * `nodeKey` preimage (`normalizeCheck(check)`) identically. Returns a NEW `Check` of the same kind with the
 * scrubbed body; the kind tag itself carries no secret and is preserved so `normalizeCheck` and the evaluator
 * still discriminate the leg. See the identity-consistency note in this module's header for why this must be
 * the single source of the check bytes rather than a CAS-only redaction.
 */
export function scrubCheck(check: Check): Check {
  return check.kind === "index-query"
    ? { kind: "index-query", query: scrubUtf8(check.query) }
    : { kind: "assertion", expr: scrubUtf8(check.expr) }
}

/**
 * Scrub ONE model-controlled identity-leg string — a relation endpoint (`endpointA`/`endpointB`) or a negation
 * `target`/`scope` — BEFORE `f` is built (billy #96-wave Finding 2). THE ONE helper both new families share
 * (the brief's "one helper" reusing the SAME `@atlas/persist` `scrub` primitive as the answer/claim/check legs).
 *
 * WHY THESE FIELDS AND NOT `relationKind`: `endpointA`/`endpointB` (relation) and `target`/`scope` (negation)
 * are FREE model-emitted strings the seed carries — the exact #207/#219 leak surface. `relationKind` is a CLOSED
 * enum (`RELATION_KINDS`), so it carries no credential shape and scrubbing it is meaningless (left raw).
 *
 * IDENTITY-CONSISTENCY (same law as `scrubCheck`, #219): unlike the advisory `claimNorm` (body-wording only),
 * these fields FEED THE IDENTITY KEY — `endpointA`/`endpointB` fold into `relationKey`, `target`/`scope` into
 * `negationKey`, and `endpointA`/`scope` are also the `primaryAnchor` — AND the `claimNorm` set-union element.
 * So this MUST be applied at source, on the fact `mintIdentity`/`id(f)`/`claimNormOf` all read from: `mine-decide.ts`
 * scrubs each leg ONCE, before `f` is built, so the SINGLE scrubbed value reaches CAS bytes (`id(f)`), the
 * identity key (`relationKey`/`negationKey`), the anchor AND `claimNorm` identically — never a scrub-CAS-but-
 * raw-identity split (which would re-open the leak on the key leg and relocate two scrub-equal facts to
 * different addresses). A secret-shaped endpoint/target/scope scrubs to `[REDACTED]` on ALL of them at once.
 */
export function scrubUnit(s: string): string {
  return scrubUtf8(s)
}

/**
 * Scrub a mined fact's GROUNDING before `f` is built (#222 — defense-in-depth, the shared CAS surface every
 * family's `id(f)` carries). A mined advisory/predicate/relation fact carries `grounding: reground(cand.site)`
 * (mine-gate.ts), and `mine-decide.ts` PUTs the whole fact — grounding included — into CAS, so the two free-text
 * legs of each entry reach CAS raw unless scrubbed here: `anchor.qualifiedPath` (the axes resolution key) and the
 * human `path`. Both are DERIVED FROM THE STRUCTURAL FRONTIER (`cand.site`), NOT from model output, so this is
 * NOT a measured live leak — it is the KNOW-11 "nothing credential-shaped reaches CAS raw" invariant applied to
 * the ONE fact leg the endpoint/target/scope scrubs (scrubUnit) did not yet cover, so a repo whose own path text
 * happened to carry a credential shape cannot smuggle it into CAS through the grounding.
 *
 * DELIBERATELY LEFT RAW: `anchor.subtreeHash` (the GROUND-1 drift oracle — a structural hash, never a credential,
 * and load-bearing for freshness), `anchor.kind` (a closed enum), `displayLines`/`span` (a nav hint / a
 * content-addressed offset range, neither free credential text). `scrub` is a no-op on any string with no
 * credential shape, so a normal path passes through byte-identical and `id(f)` is UNCHANGED for every non-secret
 * fact — this narrows CAS bytes ONLY where a credential shape was present, exactly as the other legs do. Total.
 */
export function scrubGrounding(g: FactGrounding): FactGrounding {
  return {
    entries: g.entries.map((e) => ({
      ...e,
      anchor: { ...e.anchor, qualifiedPath: scrubUtf8(e.anchor.qualifiedPath) },
      path: scrubUtf8(e.path),
    })),
  }
}
