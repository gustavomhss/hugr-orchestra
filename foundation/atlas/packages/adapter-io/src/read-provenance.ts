// @atlas/adapter-io — src/read-provenance.ts  (the PROVENANCE tripwire's READ-side refusal)
//
// `store-provenance.ts` decides the QUESTION — "did this durable store arrive through a door, or by a
// COMMIT" — and `sidecar.ts` acts on it: a tripped wire makes `readSidecarSet` resolve `projection` to
// `undefined` and makes every write take the `settled:false` / `untrusted` refusal path.
//
// ── WHAT WAS MISSING, AND WHY IT IS THE SAME DISEASE THE TRIPWIRE EXISTS TO CURE ─────────────────────────
// The WRITE side got a refusal with a NAME (`CommitRefusal = 'untrusted'`). The READ side got silence.
// `loadProjection()` resolved to `undefined`, `rehydrateProjection` folded that to `emptyStore()`, and
// `atlas query` answered `ok:true` with an EMPTY pack — byte-indistinguishable from "this repo has no
// knowledge yet". A user who runs `git add -A` after an emit therefore turns Atlas OFF and is told nothing
// at all; the product's single most important failure mode (a fact that stops appearing, with no refusal on
// any transport) was re-introduced by the very control written to prevent it.
//
// So the refusal is made LEGIBLE on the read doors, with the same discipline the write doors already use:
// one NAMED reason whose text is the user's remediation, and a machine-readable DISCRIMINANT on the thrown
// value so a test can say WHICH gate refused without matching a substring of prose (the vacuous-assertion
// class ADR-0007 §"A VACUOUS-ASSERTION CLASS" and `test/door-regression-support.ts` `reasonOf` record).
//
// ── WHY A THROW ──────────────────────────────────────────────────────────────────────────────────────────
// The frozen `ToolLeg` returns `ToolData` — a pack envelope with no refusal channel — and `createHandler`
// converts a leg throw into a structured rejected `Verdict` on EVERY transport (TOOLS-2). A returned empty
// pack is exactly the silence being fixed. The throw is caught one frame up, so nothing escapes to a user.
//
// FIXED, and this note is kept as the record rather than deleted: `handler.handle` USED TO label every
// caught leg throw `malformed args — fail-closed: <message>`, which for this refusal was flatly wrong — the
// args were fine, the STORE was untrusted — and it mislabelled every other leg throw the same way (the
// `--by dependency` no-axes refusal, and an internal crash). `packages/tools/src/fault.ts` now separates the
// three classes and passes a refusal's reason through VERBATIM, so this discriminant survives to every
// transport intact and `faultOf(v)` answers `refused` rather than `malformed-args`.

import type { SidecarTrust } from "./store-provenance.js"

/** The refusal's machine-readable DISCRIMINANT. One member today; a union so a second read-side provenance
 *  refusal cannot be added as a bare string. Asserted on for EQUALITY — never a substring of the prose. */
export type ReadProvenanceReason = "untrusted-store"

/** THE read-side provenance refusal. The text before the first `:` is the discriminant `reasonOf` compares,
 *  and it is deliberately NOT a name any other refusal constant in this package mentions. */
export const REJECTED_UNTRUSTED_STORE =
  "untrusted-store: the durable Atlas store under `.atlas/` is TRACKED BY GIT, so it arrived by COMMIT " +
  "rather than through a governed door. Nothing in it can be shown to have passed the truth gate, the " +
  "authz gate or the ratification gate, so NOTHING is served and NOTHING is written — refusing is the only " +
  "honest answer, because content-addressing authenticates integrity and says nothing about provenance. " +
  "This is almost always an accident: a `git add -A` after an emit. To repair it, stop tracking the store " +
  "and keep it out of the index — `git rm -r --cached .atlas/projection*.json .atlas/staging*.json " +
  ".atlas/cas` then commit, and add `.atlas/` (with a `!.atlas/policy.json` exception) to `.gitignore`; " +
  "`atlas init` writes that rule for you. `.atlas/policy.json` is admin-owned source and SHOULD stay tracked"

/**
 * The read-door refusal, as a THROWN value carrying the {@link ReadProvenanceReason} discriminant.
 *
 * Same shape and same reason as `@atlas/knowledge`'s `GovernanceAuthorityError`: a named class a composed
 * door converts into a structured fail-closed verdict, never a bare `Error` and never a raw `TypeError`.
 */
export class UntrustedStoreError extends Error {
  readonly reason: ReadProvenanceReason = "untrusted-store"
  constructor() {
    super(REJECTED_UNTRUSTED_STORE)
    this.name = "UntrustedStoreError"
  }
}

/**
 * Is the durable store behind this seam COMMITTED (i.e. the tripwire is tripped)?
 *
 * IT TAKES THE SEAM, NOT THE STORE, and that is a decision worth recording. Asking `store.untrusted()` reads
 * better and was the first shape here — but `DiskStore`'s member set is itself a pinned surface
 * (`cli/test/mine-projection-surface.test.ts` asserts the live key set EQUALS the enumerated projection /
 * staging / CAS families, so the ADR-0008 fixture trap cannot be outgrown silently), and a read-provenance
 * predicate is not a fourth door family. Threading the seam matches how the seam already travels — injected
 * by the composition root, never imported, because `store.ts` is deliberately git-ignorant.
 *
 * TOTAL, and ABSENT ⇒ `false`: a runtime built without the seam (every unit test, every non-git tree)
 * behaves exactly as it did before, which is the property that keeps all of this additive.
 */
export function isUntrustedStore(trusted: SidecarTrust | undefined): boolean {
  return trusted !== undefined && !trusted()
}

/** Refuse a READ over a committed store. Throws {@link UntrustedStoreError}; otherwise returns. */
export function refuseUntrustedRead(trusted: SidecarTrust | undefined): void {
  if (isUntrustedStore(trusted)) throw new UntrustedStoreError()
}

/** The refusal a CLI-level door renders BEFORE dispatching, or `undefined` when the store is trustworthy.
 *  Returned rather than thrown because the CLI's contract is a structured verdict, never an exception. */
export function readProvenanceRefusal(trusted: SidecarTrust | undefined): string | undefined {
  return isUntrustedStore(trusted) ? REJECTED_UNTRUSTED_STORE : undefined
}
