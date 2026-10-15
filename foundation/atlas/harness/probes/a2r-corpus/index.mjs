// harness/probes/a2r-corpus/index.mjs — the labeled RE-PROOF (A2r) staleness perturbation corpus.
//
// Each entry names a `dependency`-slot witness — `{ slot, target, scope }`, the SAME shape
// `reverify-store.ts` replays (`reqOf`) — over a REAL symbol in THIS repo's own source, a `primaryAnchor`
// file the witness's `scope` covers, and a set of MECHANICAL, literal find/replace edits applied to real
// repo files in a scratch worktree. `harness/probes/a2r-reproof.mjs` applies the edits, rebuilds (`tsc -b`
// incremental + a fresh `scip-typescript index`), and drives the REAL `reverifyFact`/`createVerifyFactLeg`
// oracle (`@atlas/adapter-io`) over a hand-built `GroundedFact`/`CurrentNode` pair carrying the witness —
// exactly the fixture shape `packages/adapter-io/test/reverify-store.test.ts`'s `wellFormed()`/`node()`
// helpers use, restated here as portable DATA (no `@atlas/*` import — see harness/README.md's invariant).
//
// WHY EVERY ENTRY IS REAL, NOT SYNTHETIC. The 17 `seal:'proven'` facts this repo's own `.atlas/` durable
// store carries today are all `dependency`-slot witnesses over real cross-package symbol references — see
// docs/design/95c-reproof-staleness-methodology.md. Four of those symbols (chosen for a SELF-CONTAINED
// reference site — the edits below never touch more files than the technique needs) anchor this corpus:
// `defaultEncoder` (@atlas/kernel), `VersionDelta` (@atlas/persist, cited from @atlas/tools), `isWeakerTier`
// (@atlas/knowledge/ratify, cited from @atlas/knowledge/write) and `Mechanism` (@atlas/genesis). Real data
// SUPPLIES both classes for all four — no synthetic entry was needed and none is included (a synthetic
// entry, were one required, would carry `real: false` and a `syntheticReason`; see the methodology doc §3
// for why the corpus turned out not to need one).
//
// TWO disjoint classes:
//   - 'invalidating' — the edit removes/renames the witness's OWN reference; expected 'broken'. A miss here
//     (oracle still says 're-proven') is the dangerous direction — a fact whose code moved keeps reading as
//     re-proved.
//   - 'preserving'   — the edit touches code the witness does NOT depend on (an unrelated file, or the SAME
//     file reformatted without touching the reference); expected 're-proven'. A false 'broken' here is a
//     false alarm that would make every unrelated commit look like it broke the store.
//
// FOUR TECHNIQUES (WP #245's suggested list, all four used at least once):
//   'remove-reference'   — delete the witness's own import+usage from its (single) citing file, replacing
//                           it with a behavior-preserving inline equivalent so the build still succeeds.
//   'rename-target'      — rename the witness's TARGET symbol consistently across every file that uses it;
//                           the OLD scip descriptor the witness names no longer exists anywhere post-rename.
//   'reformat-citing-file' — add whitespace/comments to the SAME file that carries the reference, never
//                           touching the reference's own line.
//   'unrelated-file-edit' — edit a DIFFERENT file in the same package, one that never mentions the target.
//   'comment-only-mention' — drop the target's short NAME from a COMMENT under the witness scope, never
//                           touching the real reference line. A DISCRIMINATOR the pure-string `name-vanish`
//                           teeth mutant provably gets WRONG (it reads 'broken' off the vanished word) while
//                           the real scip oracle reads 're-proven' off the surviving reference edge — added
//                           because the first 8 entries were, measured, all tied by that dumb heuristic
//                           (a2r-reproof-teeth.mjs). TWO independent instances on DIFFERENT witnesses/packages
//                           (PR-W4b: Mechanism @atlas/genesis; PR-W3b: isWeakerTier @atlas/knowledge) so the
//                           not-string-solvable property does not rest on a single-entry margin (lucy #204).
//
// Every `edits` entry is a LITERAL, unique find/replace pair (never a regex) — reviewable by eye, and the
// runner throws if `find` is not found EXACTLY once (a corpus entry that stops matching the real file is a
// corpus bug, reported loudly, never silently skipped — see `a2-staleness.mjs`'s `unresolved` precedent).

/** @typedef {{
 *   id: string,
 *   class: 'invalidating' | 'preserving',
 *   real: true,
 *   technique: 'remove-reference' | 'rename-target' | 'reformat-citing-file' | 'unrelated-file-edit' | 'comment-only-mention',
 *   description: string,
 *   witness: { slot: 'dependency', target: string, scope: string },
 *   anchor: string,
 *   edits: readonly { file: string, find: string, replace: string }[],
 *   expected: 're-proven' | 'broken',
 * }} CorpusEntry
 */

const W1_TARGET = "scip-typescript npm @atlas/kernel 0.0.0 src/`encoder.ts`/defaultEncoder."
const W2_TARGET = "scip-typescript npm @atlas/persist 0.0.0 src/`types.ts`/VersionDelta#"
const W3_TARGET = "scip-typescript npm @atlas/knowledge 0.0.0 src/ratify/`tier.ts`/isWeakerTier()."
const W4_TARGET = "scip-typescript npm @atlas/genesis 0.0.0 src/`budget-types.ts`/Mechanism#"

/** @type {CorpusEntry[]} */
export const CORPUS = [
  // ── INVALIDATING — expect 'broken'; a 're-proven' verdict here is a true-stale MISS ────────────────────
  {
    id: "IV-W1-remove-reference-defaultEncoder",
    class: "invalidating",
    real: true,
    technique: "remove-reference",
    description:
      "canonical.ts's ONLY reference to @atlas/kernel's defaultEncoder is replaced by an inline, " +
      "behavior-identical BLAKE3 call — the witness (scope packages/kernel/src) now has nothing under scope citing it",
    witness: { slot: "dependency", target: W1_TARGET, scope: "packages/kernel/src" },
    anchor: "packages/kernel/src/canonical.ts",
    edits: [
      {
        file: "packages/kernel/src/canonical.ts",
        find: "import { defaultEncoder } from './encoder.js';",
        replace:
          "import { blake3 } from '@noble/hashes/blake3';\nimport { bytesToHex } from '@noble/hashes/utils';\nimport { asHash } from './brand.js';",
      },
      {
        file: "packages/kernel/src/canonical.ts",
        find: "return defaultEncoder.hash(canonicalForm(obj));",
        replace: "return asHash(bytesToHex(blake3(canonicalForm(obj))));",
      },
    ],
    expected: "broken",
  },
  {
    id: "IV-W2-remove-reference-VersionDelta",
    class: "invalidating",
    real: true,
    technique: "remove-reference",
    description:
      "tools/src/types.ts's ONLY reference to @atlas/persist's VersionDelta (DiffOut's definition) is " +
      "inlined to an equivalent object shape — the witness (scope packages/tools/src) loses its sole citation",
    witness: { slot: "dependency", target: W2_TARGET, scope: "packages/tools/src" },
    anchor: "packages/tools/src/types.ts",
    edits: [
      {
        file: "packages/tools/src/types.ts",
        find: "import type { VersionDelta } from '@atlas/persist';\n",
        replace: "",
      },
      {
        file: "packages/tools/src/types.ts",
        find: "export type DiffOut = VersionDelta;",
        replace: "export type DiffOut = { added: unknown; edited: unknown; superseded: unknown; decayed: unknown };",
      },
    ],
    expected: "broken",
  },
  {
    id: "IV-W3-remove-reference-isWeakerTier",
    class: "invalidating",
    real: true,
    technique: "remove-reference",
    description:
      "knowledge/write/upsert.ts's two call sites of ratify/tier.ts's isWeakerTier are replaced by an " +
      "inline stub (always false) — the witness (scope packages/knowledge/src/write) loses every citation",
    witness: { slot: "dependency", target: W3_TARGET, scope: "packages/knowledge/src/write" },
    anchor: "packages/knowledge/src/write/upsert.ts",
    edits: [
      {
        file: "packages/knowledge/src/write/upsert.ts",
        find: "import { isTier, isWeakerTier } from '../ratify/tier.js';",
        replace:
          "import { isTier } from '../ratify/tier.js';\nconst isWeakerTierInline = (_declared: unknown, _incumbent: unknown): boolean => false; // A2r IV-W3 mutant: no longer references tier.ts isWeakerTier",
      },
      {
        file: "packages/knowledge/src/write/upsert.ts",
        find: "if (incumbent.tier !== undefined && isWeakerTier(req.tier, incumbent.tier)) return 'governance-downgrade';",
        replace:
          "if (incumbent.tier !== undefined && isWeakerTierInline(req.tier, incumbent.tier)) return 'governance-downgrade';",
      },
      {
        file: "packages/knowledge/src/write/upsert.ts",
        find: "(prior.tier === undefined || isWeakerTier(prior.tier, req.tier));",
        replace: "(prior.tier === undefined || isWeakerTierInline(prior.tier, req.tier));",
      },
    ],
    expected: "broken",
  },
  {
    id: "IV-W4-rename-target-Mechanism",
    class: "invalidating",
    real: true,
    technique: "rename-target",
    description:
      "genesis's Mechanism type is renamed to MechanismKind, consistently, across its definition and every " +
      "citing file (budget-types.ts / cost-policy.ts / types.ts re-export) — the OLD scip descriptor the " +
      "witness names (…Mechanism#) no longer exists anywhere in the fresh index",
    witness: { slot: "dependency", target: W4_TARGET, scope: "packages/genesis/src" },
    anchor: "packages/genesis/src/cost-policy.ts",
    edits: [
      {
        file: "packages/genesis/src/budget-types.ts",
        find: "export type Mechanism = 'self-consistency' | 'refuter' | 'check-synthesis' | 'codeql';",
        replace: "export type MechanismKind = 'self-consistency' | 'refuter' | 'check-synthesis' | 'codeql';",
      },
      {
        file: "packages/genesis/src/budget-types.ts",
        find: "readonly mechanisms: readonly Mechanism[]; // base ⇒ [] (one call); escalated subset otherwise",
        replace: "readonly mechanisms: readonly MechanismKind[]; // base ⇒ [] (one call); escalated subset otherwise",
      },
      {
        file: "packages/genesis/src/cost-policy.ts",
        find: "import type { BudgetApi, Candidate, CostReport, EscalationDecision, GenesisBudget, Mechanism, PipelineStage, StageCost } from './types.js';",
        replace:
          "import type { BudgetApi, Candidate, CostReport, EscalationDecision, GenesisBudget, MechanismKind, PipelineStage, StageCost } from './types.js';",
      },
      {
        file: "packages/genesis/src/cost-policy.ts",
        find: "export function decideMechanisms(sig: CheapSignal): readonly Mechanism[] {",
        replace: "export function decideMechanisms(sig: CheapSignal): readonly MechanismKind[] {",
      },
      {
        file: "packages/genesis/src/cost-policy.ts",
        find: "const mechanisms: Mechanism[] = ['self-consistency'];",
        replace: "const mechanisms: MechanismKind[] = ['self-consistency'];",
      },
      {
        file: "packages/genesis/src/types.ts",
        find: "  Mechanism,",
        replace: "  MechanismKind,",
      },
    ],
    expected: "broken",
  },

  // ── PRESERVING — expect 're-proven'; a 'broken' verdict here is a FALSE STALE (false alarm) ────────────
  {
    id: "PR-W1-reformat-citing-file-canonical",
    class: "preserving",
    real: true,
    technique: "reformat-citing-file",
    description:
      "canonical.ts's import block gets blank lines inserted around it — the defaultEncoder import/usage " +
      "lines themselves are untouched",
    witness: { slot: "dependency", target: W1_TARGET, scope: "packages/kernel/src" },
    anchor: "packages/kernel/src/canonical.ts",
    edits: [
      {
        file: "packages/kernel/src/canonical.ts",
        find: "import type { Hash } from '@atlas/contracts';\nimport type { CasObject } from './types.js';\nimport { defaultEncoder } from './encoder.js';\n",
        replace:
          "import type { Hash } from '@atlas/contracts';\n\nimport type { CasObject } from './types.js';\n\nimport { defaultEncoder } from './encoder.js';\n",
      },
    ],
    expected: "re-proven",
  },
  {
    id: "PR-W2-unrelated-file-edit-tools-bands",
    class: "preserving",
    real: true,
    technique: "unrelated-file-edit",
    description: "a comment is added to tools/src/bands.ts, a SIBLING file that never mentions VersionDelta",
    witness: { slot: "dependency", target: W2_TARGET, scope: "packages/tools/src" },
    anchor: "packages/tools/src/types.ts",
    edits: [
      {
        file: "packages/tools/src/bands.ts",
        find: "// @atlas/tools — src/bands.ts   (TOOLS-6 / ADR-0013 — the ONE two-band split of a Pack)\n",
        replace:
          "// @atlas/tools — src/bands.ts   (TOOLS-6 / ADR-0013 — the ONE two-band split of a Pack)\n// A2r PR-W2 mutation marker: an unrelated comment, no symbol touched.\n",
      },
    ],
    expected: "re-proven",
  },
  {
    id: "PR-W3-reformat-citing-file-upsert",
    class: "preserving",
    real: true,
    technique: "reformat-citing-file",
    description:
      "a comment is added next to the isWeakerTier import in upsert.ts — both call sites below are untouched",
    witness: { slot: "dependency", target: W3_TARGET, scope: "packages/knowledge/src/write" },
    anchor: "packages/knowledge/src/write/upsert.ts",
    edits: [
      {
        file: "packages/knowledge/src/write/upsert.ts",
        find: "import { isTier, isWeakerTier } from '../ratify/tier.js';",
        replace:
          "import { isTier, isWeakerTier } from '../ratify/tier.js';\n// A2r PR-W3 mutation marker: a comment added near the import, both call sites below untouched.",
      },
    ],
    expected: "re-proven",
  },
  {
    id: "PR-W3b-comment-only-mention-isWeakerTier",
    class: "preserving",
    real: true,
    technique: "comment-only-mention",
    description:
      "upsert.ts's JSDoc names `isWeakerTier` while explaining the class-comparison totality; the bare word is " +
      "dropped from that COMMENT while the real import (line 24) and BOTH call sites (lines 151, 284) in the " +
      "same file are left untouched — the witness edge survives (re-proven), but the string-only `name-vanish` " +
      "mutant false-alarms broken off the vanished word. A SECOND independent discriminator on a DIFFERENT " +
      "witness/package than PR-W4b (isWeakerTier @atlas/knowledge, vs Mechanism @atlas/genesis), so the " +
      "corpus's not-string-solvable property no longer rests on a single-entry margin (lucy cold-review, PR #204).",
    witness: { slot: "dependency", target: W3_TARGET, scope: "packages/knowledge/src/write" },
    anchor: "packages/knowledge/src/write/upsert.ts",
    edits: [
      {
        file: "packages/knowledge/src/write/upsert.ts",
        find: "the write must match it: `isWeakerTier` is total over `unknown`",
        replace: "the write must match it: the weaker-tier lattice check is total over `unknown`",
      },
    ],
    expected: "re-proven",
  },
  {
    id: "PR-W4-unrelated-file-edit-genesis-verify-fact",
    class: "preserving",
    real: true,
    technique: "unrelated-file-edit",
    description: "a comment is added to genesis/src/verify-fact.ts, a SIBLING file that never mentions Mechanism",
    witness: { slot: "dependency", target: W4_TARGET, scope: "packages/genesis/src" },
    anchor: "packages/genesis/src/cost-policy.ts",
    edits: [
      {
        file: "packages/genesis/src/verify-fact.ts",
        find: "// @atlas/genesis — src/verify-fact.ts  (spike/verify-fact — the POSITIVE DUAL of the #99b negation door)\n",
        replace:
          "// @atlas/genesis — src/verify-fact.ts  (spike/verify-fact — the POSITIVE DUAL of the #99b negation door)\n// A2r PR-W4 mutation marker: an unrelated comment, no symbol touched.\n",
      },
    ],
    expected: "re-proven",
  },
  {
    id: "PR-W4b-comment-only-mention-Mechanism",
    class: "preserving",
    real: true,
    technique: "comment-only-mention",
    description:
      "types.ts's re-export COMMENT lists `Mechanism` among the types extracted to budget-types.ts; the word " +
      "is dropped from that comment while the real `readonly Mechanism[]` reference in budget-types.ts is left " +
      "untouched — the witness edge survives (re-proven), but the string-only `name-vanish` mutant false-alarms broken",
    witness: { slot: "dependency", target: W4_TARGET, scope: "packages/genesis/src" },
    anchor: "packages/genesis/src/types.ts",
    edits: [
      {
        file: "packages/genesis/src/types.ts",
        find: "/ `GenesisBudget` / `Mechanism` / `EscalationDecision` / `BudgetApi` all now live there and are RE-EXPORTED",
        replace: "/ `GenesisBudget` / `EscalationDecision` / `BudgetApi` all now live there and are RE-EXPORTED",
      },
    ],
    expected: "re-proven",
  },
]
