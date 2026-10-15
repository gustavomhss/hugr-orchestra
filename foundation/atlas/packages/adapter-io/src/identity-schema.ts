// @atlas/adapter-io — src/identity-schema.ts  (#112: WHICH hash function wrote this store?)
//
// `store-provenance.ts` asks where the durable store CAME FROM. This module asks a question that is just as
// unanswerable from the bytes and had never been asked at all: WHICH IDENTITY SCHEMA minted the hashes and
// the anchor keys inside it.
//
// ── THE DEFECT, AS MEASURED ──────────────────────────────────────────────────────────────────────────────
// The identity schema — the rules that decide what digest a given piece of source produces — moved TWICE in
// one working session, and nothing recorded which one a store was written under:
//
//   0b65b42  the two Merkle rollups became ONE fold that commits to a node's own content AND to its child
//            NAMES. Every branch subtreeHash in the repository moved. (build vs subtreeHash: 1787db7c /
//            758027f2 → both 1e3204d0, from that commit's own message.)
//   f2a8659  the anchor mint changed. Unit LEAF hashes held, but every ANCESTOR of a parsed unit moved and
//            every sub-file anchor's `qualifiedPath` changed FORMAT — `<parent>::<start>:<kind>:<name>`
//            became `<parent>::<kind>:<ordinal>[:<name>]`.
//
// So after an upgrade, a user's existing `.atlas` store reports DRIFTED on every symbol-anchored fact. That
// verdict is FAIL-CLOSED and, taken alone, correct: an anchor this build cannot resolve must never certify
// FRESH. What it is not is LEGIBLE. There is nothing anywhere that lets a user separate "my code changed"
// from "the hash function changed", and those two call for opposite actions (re-ground the fact vs re-derive
// the store). That is the same disease as the silent read refusal fixed in `a587182`, and this module cures
// it the same way `read-provenance.ts` did: one NAMED reason whose text is the remediation, plus a
// machine-readable DISCRIMINANT so a test can say WHICH gate spoke without matching a substring of prose.
//
// ── REFUSE-AND-RE-DERIVE, NOT AUTO-MIGRATE. The alternative was considered and it is IMPOSSIBLE, not merely
//    expensive, and the distinction matters because "we could migrate later" would be a lie in a comment. ──
// To migrate a stored anchor you must recompute it, and the inputs are not in the store:
//   1. The anchor is `{qualifiedPath, subtreeHash}` at the revision the fact was GROUNDED at. Re-minting it
//      under the new schema needs that revision's SOURCE BYTES. The CAS holds the `GroundedFact`; it does
//      not hold the tree the fact was grounded against. `builtAt` (N11) records at most a HEAD sha for the
//      WHOLE projection, is optional, and is not per-fact.
//   2. Even with the bytes, the old `qualifiedPath` would have to be PARSED — which requires knowing which
//      of the untagged past schemas wrote it. `::0:function_declaration:isAdmin` and
//      `::function_declaration:0:isAdmin` are transpositions of one another; both parse cleanly under either
//      reading, and picking wrong re-anchors the fact at a DIFFERENT symbol. A migration that silently
//      re-points a fact at the wrong code is strictly worse than one that refuses.
//   3. There is no implementation of any past schema in this tree to migrate FROM. They were deleted, not
//      versioned. Reconstructing them from git history and shipping N parsers to guess between is a large,
//      permanently-growing machine whose failure mode is a wrong answer.
// Re-deriving is cheap, exact, and needs no guess: the source is right there. So the honest answer is
// re-derive, and {@link identitySchemaText} says exactly that in the user's own words.
//
// ── WHAT AN UNTAGGED STORE MEANS, STATED WITHOUT INVENTING A HISTORY ─────────────────────────────────────
// No previous Atlas stamped anything. There is therefore NO version-number line to place a past store on,
// and this module does not pretend otherwise: an absent stamp is `unstamped`, which means UNKNOWN — not
// "version 0", not "the previous version". A store written five minutes before this commit and a store
// written before `0b65b42` are byte-indistinguishable on this question, so both get the same answer. That
// costs the one population that is already on the current schema a re-derive it did not strictly need. It is
// the only fail-closed reading available, and the alternative (assume-current) IS the silent mis-read.
//
// ── WHY THE READ IS FLAGGED AND NOT EMPTIED, unlike the provenance tripwire ──────────────────────────────
// `store-provenance.ts` forces a committed store to read as NOTHING, and it must: those rows are somebody
// else's content and serving them is serving an attacker. A foreign-schema store is the opposite — it is the
// user's OWN governed knowledge, and the drift oracle ALREADY refuses it fact-by-fact (every unresolvable
// anchor is DRIFTED, and `buildGate` collapses a DRIFTED node to `NA`). Emptying the read would buy no
// safety the DRIFTED verdict does not already provide, and would cost the user the ability to SEE the
// knowledge they are being asked to re-derive — replacing "everything drifted, with no explanation" with
// "there is nothing here, with no explanation", which is a strictly worse silence.
//
// So the teeth go where a wrong answer is DESTRUCTIVE rather than merely confusing: the WRITE doors. A
// governed write over a foreign-schema store publishes a new generation stamped with the CURRENT schema and
// carrying only the rows this pass knew about — the user's whole store, silently replaced. That refuses,
// loudly, and leaves the old bytes exactly where they are so "re-derive" is advice about data that still
// exists. The read carries the verdict alongside the rows ({@link identitySchemaRefusal}) so an entrypoint
// can render the reason; see the RESIDUAL note on that function.

/**
 * THE identity schema this build speaks — the FIRST one that was ever tagged.
 *
 * It is a DATE, not a sequence number, and that is deliberate: a `1` would imply a `0` that never existed.
 * Everything written before this constant carries no stamp at all and is `unstamped` (⇒ unknown), which is
 * the honest description of a past nobody labelled.
 *
 * WHAT IT COVERS — every rule that decides what digest a piece of source produces. Changing ANY of these is
 * a MIGRATION EVENT and MUST bump this constant:
 *   · the node fold preimage — `@atlas/index` src/rollup.ts `foldNodeHash` (`FOLD_DOMAIN`, the sorted
 *     name→hash child entries, `childName`, the absent-vs-empty `content` distinction).
 *   · the state root preimage — same file, `stateRoot` (`STATE_DOMAIN`, the `stateStatus`/`stateFreshness`
 *     key names that keep them out of the KERNEL-8 side-index sweep).
 *   · the node-key mint — `@atlas/index` src/build.ts `mintKey`/`escapeKeyComponent`, and
 *     `@atlas/knowledge` src/write/router.ts `nodeKey`/`primaryAnchorId`.
 *   · the sub-file anchor mint — `@atlas/adapter-io` src/ast.ts `unitPath` (the `::<kind>:<ordinal>[:<name>]`
 *     format and the ordinal's definition).
 *   · the canonical preimage and the digest itself — `@atlas/kernel` src/canonical.ts (`canonicalForm`, NFC,
 *     the KERNEL-8 side-index exclusion set) and src/encoder.ts.
 *
 * THAT LIST IS PROSE AND PROSE ROTS, so it is not the control. The control is the pinned-hash goldens
 * (`packages/index/test/identity-goldens.test.ts`, `packages/kernel/test/identity-goldens.test.ts`), which
 * hold hash LITERALS produced by the real production path. Move any rule above and they go red with a
 * message naming this constant. That pairing is the whole mechanism: the goldens NOTICE, this constant
 * RECORDS, and the refusal below EXPLAINS.
 */
export const IDENTITY_SCHEMA = "atlas-identity-2026-08-02"

/** What a stored sidecar's stamp says about the schema its hashes were minted under.
 *  `current`   — the stamp equals {@link IDENTITY_SCHEMA}. Also the verdict for a store that does not exist
 *                yet: there are no hashes to judge, and a fresh install must not be refused.
 *  `unstamped` — the sidecar carries no identity stamp. It was written before stamping existed, so the
 *                schema is UNKNOWN. Never read as "the previous version" — there was no previous version.
 *  `foreign`   — it carries a stamp, and it is not ours (an older tagged schema, or a NEWER Atlas). */
export type IdentityVerdict = "current" | "unstamped" | "foreign"

/** The refusal's machine-readable DISCRIMINANT. One member today; a union so a second identity-level refusal
 *  cannot be added as a bare string. Asserted on for EQUALITY — never as a substring of the prose. */
export type IdentitySchemaReason = "identity-schema"

/**
 * Classify a raw stamp read off a sidecar. TOTAL over `unknown`, because this value comes out of a file
 * anyone with write access can author: a number, an object, `null` and an empty string are all `unstamped`
 * (unknown), never a crash and never accidentally `current`.
 *
 * `===` is byte-exact — no trimming, no case folding, no Unicode normalization — so a near-miss stamp is
 * `foreign` rather than quietly accepted.
 */
export function classifyIdentity(stamp: unknown): IdentityVerdict {
  if (typeof stamp !== "string" || stamp.length === 0) return "unstamped"
  return stamp === IDENTITY_SCHEMA ? "current" : "foreign"
}

/** The shared head of the refusal. The text before the first `:` is the discriminant `reasonOf` compares,
 *  and it is deliberately NOT a name any other refusal constant in this package mentions. */
export const REJECTED_FOREIGN_IDENTITY_SCHEMA =
  "identity-schema: the durable Atlas store under `.atlas/` was written under a DIFFERENT identity schema " +
  "than this build computes. Every stored anchor names a structural unit by a key and a subtree hash, and " +
  "both are produced by rules that have changed: the Merkle fold now commits to a node's own content and " +
  "to its child NAMES, and a sub-file anchor is now keyed `<parent>::<kind>:<ordinal>[:<name>]` instead of " +
  "by the symbol's byte offset. So every fact in that store reads DRIFTED against this build — not because " +
  "the code changed, but because the hash function did, and nothing in the store could tell you which."

/** What to do about it. Separated from the head because it is the half a user actually acts on. */
const REMEDIATION =
  "This CANNOT be migrated automatically and that is a limit, not a shortcut: re-minting an anchor needs " +
  "the SOURCE at the revision the fact was grounded against (which the store does not keep) and needs to " +
  "know which past schema wrote the old key (which nothing recorded) — and the two key formats are " +
  "transpositions of each other, so a wrong guess silently re-anchors a fact at a different symbol. " +
  "RE-DERIVE instead: the source is right here and re-deriving needs no guess. Move the old store aside " +
  "(`mv .atlas/projection*.json .atlas/staging*.json /tmp/`, keeping `.atlas/policy.json` and `.atlas/cas` " +
  "— the CAS blobs are content-addressed and are NOT affected, so nothing you wrote is lost), then re-mine " +
  "and re-emit against the current tree. Nothing was written and nothing was deleted by this refusal. " +
  "The rules that define a schema, and why re-deriving is the only honest answer, are written out in " +
  "packages/adapter-io/src/identity-schema.ts."

/**
 * The FULL refusal for a verdict, or `undefined` when there is nothing to refuse.
 *
 * The two non-current branches get DIFFERENT middle sentences on purpose. `unstamped` must not be described
 * as "an older version": no past Atlas stamped anything, so the only true statement is that the schema is
 * unknown. `foreign` can and does quote the tag it actually found, which is the one case where the store can
 * say something concrete about itself.
 */
export function identitySchemaText(verdict: IdentityVerdict, found?: string | undefined): string | undefined {
  if (verdict === "current") return undefined
  const middle =
    verdict === "unstamped"
      ? "This store carries no identity stamp at all, so the schema it was written under is UNKNOWN — " +
        "stamping did not exist before this build, and no past release was ever tagged, so there is no " +
        "version to name and none is claimed here. It may have been written by any Atlas older than this one."
      : `This store is stamped \`${String(found)}\`, which this build does not speak — it was written by ` +
        "an Atlas with a different (older or newer) identity schema."
  return `${REJECTED_FOREIGN_IDENTITY_SCHEMA} ${middle} This build speaks \`${IDENTITY_SCHEMA}\`. ${REMEDIATION}`
}

/** The shape this module needs from a sidecar read — structural, so `sidecar.ts` can depend on this module
 *  without this module depending back on it (no import cycle, and no fs in here at all). */
export interface IdentityBearing {
  readonly identity: IdentityVerdict
  readonly identityFound?: string | undefined
}

/**
 * The refusal a door renders, or `undefined` when the store's schema is this build's.
 *
 * RETURNED rather than thrown, mirroring `readProvenanceRefusal`: an entrypoint's contract is a structured
 * verdict, never an exception.
 *
 * RESIDUAL, STATED RATHER THAN GLOSSED. The READ doors do not call this yet, so `atlas query` over a
 * foreign-schema store still answers with the user's facts, every one of them DRIFTED, and no reason —
 * exactly as it does today. That is unchanged rather than regressed, and it is the deliberate half of the
 * design (see this file's header on why the read is flagged rather than emptied); but it is not the finished
 * article. Rendering it costs one line at each of the two places the provenance refusal already uses, and
 * both are outside this seat's ownership:
 *   · `compose.ts` — beside `readRefusal`, add
 *       `schemaRefusal: identitySchemaRefusal(readSidecarSet(join(repoPath, '.atlas'), 'projection'))`
 *     and surface it on `ComposedRuntime`, so `cli.ts` refuses the invocation as it does for provenance.
 *   · `wire.ts` — in the `atlas-query` leg beside `refuseUntrustedRead`, throw on a non-`current` verdict so
 *     the MCP transport gets the same reason (the frozen handler converts a leg throw into a structured
 *     rejected `Verdict`, TOOLS-2).
 */
export function identitySchemaRefusal(read: IdentityBearing): string | undefined {
  return identitySchemaText(read.identity, read.identityFound)
}

/**
 * The identity-schema refusal, as a THROWN value carrying the {@link IdentitySchemaReason} discriminant.
 *
 * Same shape and same reason as `UntrustedStoreError` and `@atlas/knowledge`'s `GovernanceAuthorityError`: a
 * named class a composed door converts into a structured fail-closed verdict, never a bare `Error` and never
 * a raw `TypeError`.
 *
 * A THROW on the write path, and not a fourth `CommitRefusal` member, for two reasons. (1) SEMANTIC: the
 * three refusal members are conditions under which THIS ATTEMPT did not settle over a store that is
 * otherwise usable — retry it, repair the disk, un-track the file. A foreign identity schema is none of
 * those: it is the same answer on every attempt and on every door, a precondition of the whole runtime
 * rather than an outcome of one commit, which is exactly the shape `read-provenance.ts` already chose a
 * throw for. (2) MEASURED: `CommitRefusal` is consumed as `Readonly<Record<CommitRefusal, string>>` in
 * `packages/cli/src/mine-staging.ts`, so adding a member is a type error in a file this seat does not own.
 * Reason (1) is why this is right; reason (2) is why it was not a close call.
 */
export class IdentitySchemaError extends Error {
  readonly reason: IdentitySchemaReason = "identity-schema"
  constructor(
    readonly verdict: Exclude<IdentityVerdict, "current">,
    readonly found: string | undefined,
  ) {
    super(identitySchemaText(verdict, found))
    this.name = "IdentitySchemaError"
  }
}

/** Refuse a WRITE over a store whose schema is not this build's. Throws {@link IdentitySchemaError};
 *  otherwise returns. Total: a `current` verdict (which includes "no store yet") is a no-op. */
export function refuseForeignIdentityWrite(read: IdentityBearing): void {
  if (read.identity === "current") return
  throw new IdentitySchemaError(read.identity, read.identityFound)
}
