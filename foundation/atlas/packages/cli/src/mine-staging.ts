// @atlas/cli — src/mine-staging.ts  (the STAGING commit's refusal vocabulary + its thrown discriminant)
//
// EXTRACTED FROM `mine.ts` at the 400-LOC ceiling, along a real seam: everything here is what the driver says
// when the STAGING sidecar refuses to accept a pass, while `mine.ts` is the pass itself. The split was forced
// by wiring the PROVENANCE seam into the driver's own store — and that is the point worth recording, because
// the `untrusted` text below was written, shipped, and then UNREACHABLE: `mine` built its `createDiskStore`
// with the freshness watermark and WITHOUT the provenance seam, so `commitStaging` could never return
// `untrusted` and this branch could never fire. The vocabulary existed; the wire did not.

import type { CommitRefusal } from "@atlas/adapter-io"

/** Why a staging commit did not settle, in the operator's words. Surfaced, never swallowed: `settled: false`
 *  means NOTHING was written, and reporting that as a successful pass would be a fresh instance of the exact
 *  silent-loss defect the commit protocol exists to remove. */
export const STAGING_REFUSAL_TEXT: Readonly<Record<CommitRefusal, string>> = {
  contended:
    "the staging sidecar advanced under this pass more times than the protocol retries, so its candidates were NOT written. The store is alive; this write is not. Re-run the pass",
  unreadable:
    "a staging sidecar EXISTS but no generation of it parses, so this pass refused rather than rebuild staging from empty and erase every candidate already there. Repair or remove `.atlas/staging*.json`",
  untrusted:
    "the durable store is TRACKED BY GIT, so it arrived by commit rather than through a door and nothing in it can be trusted as mined output. Nothing was written, and the committed file was NOT overwritten, so the evidence survives. Run `git rm --cached -r .atlas` and add `.atlas/*` to `.gitignore`",
}

/** The refusal, THROWN, carrying a machine-readable {@link CommitRefusal} discriminant. A throw and not a return:
 *  `ControllerDeps.upsert` returns the grounded set, so "an unchanged set" is indistinguishable from a site that
 *  abstained. `run-controller` catches it (GEN-8c) ⇒ partial + non-zero, and `runMine` names the cause on stdout. */
export class StagingCommitError extends Error {
  constructor(readonly refusal: CommitRefusal) {
    super(`atlas mine: staging commit refused (${refusal}) — ${STAGING_REFUSAL_TEXT[refusal]}`)
    this.name = "StagingCommitError"
  }
}

/**
 * The reserved scope every MINED node carries — PROVENANCE plus a fail-closed default, not the boundary itself
 * (ADR-0008 moved these rows out of the governed projection entirely). Mining has no actor, so a mined node has no
 * owner, and an unowned node is writable not by "anyone" but by NOBODY: no actor belongs to this scope unless
 * `.atlas/policy.json` declares it, so `actorInScope` denies by default (KNOW-11a) and, should a candidate ever be
 * promoted, the emit door refuses any fact declaring a different scope onto a mined row. Granting it appoints a
 * curator — deliberate, NOT protected: the grant lives in `.atlas/policy.json`, which no live mechanism gates.
 */
export const MINED_SCOPE = "atlas:mined"

/** The governance CLASS a mined row lives under: `T2`, the candidate class, always — stamped from this constant,
 *  never forwarded from `f.tier`, so an injected gate cannot mint a staged row DECLARING `T0`. */
export const MINED_TIER = "T2" as const
