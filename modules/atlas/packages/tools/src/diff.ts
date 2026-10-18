// @atlas/tools — src/diff.ts   (WP-7.32.TOOLS — EPIC-32 — TOOLS-16, INV-TOOLS-16)
//
// `atlas-diff` — the read-only PERSIST-14 version-delta projection + the frozen `DiffApi`. It READS the
// injected @atlas/persist `DiffApi` (`persist/ref/diff.ts`) — never computes the fold-diff — and renders
// CLI≡MCP byte-identical (0 write path). A malformed sha fails CLOSED to the SAME rejected `Verdict`.
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// Nothing in `packages/*/src` calls `createAtlasDiff` or reads `DIFF_GUIDANCE`. Verified by probe (stderr
// write at the top of the constructor, rebuilt, 249 real CLI / MCP subprocess runs): every hit came from
// this file's own compile-time witness (`_diffConforms`, bottom) and none from a caller.
//
// That is consistent with what the barrel already says out loud: `atlas-diff` is wired to NEITHER
// transport — there is no `atlas diff` CLI command, and MCP advertises `GOVERNANCE_SURFACE` only, so
// `handle('atlas-diff')` fails closed as off-surface. There is no shipped counterpart because there is no
// shipped feature.
//
// NOTE for anyone grepping: the `DiffApi` this module CONSUMES is `@atlas/persist`'s own `DiffApi`
// (`packages/persist/src/diff.ts`), a DIFFERENT type of the same name — and that one is a reference model
// too. Neither name is evidence about the other.
//
// Declared in the ledger at `harness/gates/reference-model-guard.mjs`.

import type { Hash } from "@atlas/contracts"
import type { DiffOut, Guidance, Transport, Verdict } from "./types.js"

export interface DiffApi {
  /** Read-only fold-diff between two commit states (TOOLS-16). Surfaces the PERSIST-14 delta faithfully;
   *  0 mutation, 0 write path — reads/renders the @atlas/persist `VersionDelta`. The CLI≡MCP determinism
   *  arm is delegated to the TOOLS-3 cross-transport PBT over the one handler (method-tags-tls:135).
   *
   *  [FLAG — `shaA`/`shaB` = `Hash`] atlas-tools:114 names `atlas-diff <shaA> <shaB>`; transcribed as
   *  `Hash` exactly as @atlas/persist `DiffApi.diff(shaA,shaB)` pins them. */
  diff(shaA: Hash, shaB: Hash): DiffOut
}

/** The read-only version-delta source atlas-diff projects — the @atlas/persist `DiffApi`
 *  (`persist/ref/diff.ts`), injected. atlas-diff READS this delta; it does NOT compute the fold-diff (that
 *  is @atlas/persist / WP-7.32.PERSIST). Read-only: it surfaces no store-mutating method. */
export type DiffSource = DiffApi

/** The `next + invariant` guidance every atlas-diff result ships (TOOLS-4) — non-empty on the ok AND the
 *  fail-closed reject paths. The follow-up for any change is ALWAYS a governed write door (`atlas-emit` for facts). */
export const DIFF_GUIDANCE: Guidance = {
  next: "atlas-diff is a read-only version-delta projection — to change a version, emit through atlas-emit",
  invariant: "TOOLS-16: read-only projection of the PERSIST-14 delta, no write path, write surface stays four",
}

/** The fail-closed rejection reason for a malformed sha — identical on every transport (no divergence). */
const REJECT_BAD_SHA = "malformed sha — atlas-diff requires two content-address strings (fail-closed, TOOLS-16)"

/** A sha argument is well-formed iff it is a string (the `Hash` carrier). A number/array/object fails
 *  CLOSED — never coerced (the coercion-vs-reject divergence is exactly what TOOLS-16c forbids). */
const isHash = (v: unknown): v is Hash => typeof v === "string"

/**
 * The `atlas-diff` read-only projection handle. Conforms EXACTLY to the frozen `DiffApi` (`diff`) and adds
 * the transport-parametrized `render` — the byte-identical read across CLI ≡ MCP. It exposes ONLY read
 * methods (`diff` / `render`); it grows NO `write` / `apply` / `applyInto`, so it is structurally incapable
 * of mutating the store (TOOLS-16d) and is NOT a write tool (TOOLS-16e / TOOLS-1).
 */
export interface AtlasDiff extends DiffApi {
  /** The read-only fold-diff between two commit states — surfaces the PERSIST-14 delta faithfully (frozen
   *  `DiffApi`). 0 mutation, 0 write path — it READS the @atlas/persist `VersionDelta`. */
  diff(shaA: Hash, shaB: Hash): DiffOut
  /** Render the delta as a byte-identical read-only `Verdict` over a transport (CLI ≡ MCP, TOOLS-16). The
   *  `transport` records the ROUTE only — it NEVER changes the result. A malformed sha fails CLOSED to the
   *  SAME structured rejected `Verdict` on every transport; a well-formed pair surfaces the raw delta with
   *  NO per-transport envelope (the divergence this seam forbids). */
  render(transport: Transport, shaA: unknown, shaB: unknown): Verdict<DiffOut>
}

/**
 * Build the `atlas-diff` read-only projection over an injected @atlas/persist version-delta `source`. The
 * returned handle conforms EXACTLY to the frozen `DiffApi` and adds the CLI≡MCP `render`. Pure + total and
 * read-only: no clock, no IO, no store mutation, no throw. `render` delegates to the ONE projection core
 * regardless of transport, so the two adapters return a byte-identical `Verdict` — they cannot diverge.
 */
export function createAtlasDiff(source: DiffSource): AtlasDiff {
  const diff = (shaA: Hash, shaB: Hash): DiffOut => source.diff(shaA, shaB)

  const render = (_transport: Transport, shaA: unknown, shaB: unknown): Verdict<DiffOut> => {
    // fail-closed on a malformed sha — the SAME structured rejection on every transport (no coercion).
    if (!isHash(shaA) || !isHash(shaB)) {
      return { ok: false, rejected: REJECT_BAD_SHA, guidance: DIFF_GUIDANCE }
    }
    // read-only: surface the PERSIST-14 delta faithfully — no envelope, no per-transport wrapping.
    return { ok: true, data: source.diff(shaA, shaB), guidance: DIFF_GUIDANCE }
  }

  return { diff, render }
}

// differential-vs-oracle (compile-time): the projection conforms to the co-located frozen `DiffApi` —
// a read-only handle with NO write-returning method (the write surface is the two governed doors atlas-emit + atlas-link, TOOLS-1/16).
const _diffConforms: DiffApi = createAtlasDiff({
  diff: () => ({ added: [], edited: [], superseded: [], decayed: [] }),
})
void _diffConforms
