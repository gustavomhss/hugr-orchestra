// @atlas/tools — barrel
//
// Layer 7: the PUBLIC tool / OKF surface — the Atlas's whole read/write API. The GOVERNANCE surface is
// EXACTLY five tools — `atlas-init`, `atlas-query`, `atlas-emit`, `atlas-reconcile`, `atlas-link` — and
// every write flows through one of the TWO governed write doors, `atlas-emit` (grounded facts) or
// `atlas-link` (sameAs edges) (TOOLS-1 / ADR-0003; grounded-row integrity structurally enforced by the
// governed-store guard, TOOLS-15). `atlas-diff` (TOOLS-16), `atlas doctor` (TOOLS-12), and the per-node
// projections (TOOLS-10) are READ-ONLY views of the same store, carrying NO write authority — NOT
// governance tools. [WP-10.A5.TOOLS, ADR-0005] `atlas doctor` / the per-node projection, plus the four
// ADR-0004 authoring planners (`atlas-anchors`/`atlas-slots`/`atlas-draft`/`atlas-check`), are the frozen,
// disjoint 6-member `READ_SURFACE` (`handler.ts`) — the set MCP advertises alongside `GOVERNANCE_SURFACE`
// (A5.MCP wires the advertisement; this facet only freezes + pins the constant). `atlas-diff` is NOT a
// member (owner-decided 2026-08-24): it is a declared zero-caller reference model, unwired to any transport
// — see its own note below and `diff.ts`'s header.
// Re-exports the package's FULL public surface so consumers import from the bare package root
// (`import type { Verdict } from '@atlas/tools'`). Each frozen interface is co-located with its impl; the
// shared (handler) and impl-less (node) ones live in types.ts.

// The frozen data model + the co-located API interfaces no single impl owns (ToolData / Transport /
// HandlerApi, consumed by ≥2 src files; NodeApi, which no src file re-exports). Every other frozen
// interface now lives beside its impl and is re-exported by `export *` from the runtime files below.
export type * from "./types.js"

// ── Runtime surface (the governed tool / OKF public surface) ─────────────────────────────────────────
export * from "./emit.js" // WP-4.11-a.TOOLS — atlas-emit re-derives citation at source@sha, fail-closed reject
export * from "./reconcile.js" // WP-4.12-a.TOOLS — atlas-reconcile: classify drift into a reviewable DriftItem[] (exit 2 on semantic)
export * from "./init.js" // WP-8.27.TOOLS — atlas-init move-in: $0-LLM structural skeleton + blast radius + T0-candidate flags
export * from "./anchors.js" // WP-10.A1.TOOLS — GroundingComputer PORT (AUTHOR-1) + the read-only `anchors` DISCOVERY planner (ADR-0004; NOT a governance tool, carries no write authority)
export * from "./slots.js" // WP-10.A2-a.TOOLS — the read-only `slots` DISCOVERY planner (AUTHOR-5, ADR-0004; NOT a governance tool)
export * from "./draft.js" // WP-10.A2-a.TOOLS — the read-only `draft` COMPOSITION planner (AUTHOR-6/7, ADR-0004; NOT a governance tool, persists nothing)
export * from "./check.js" // WP-10.A3.TOOLS — the read-only `check` DRY-RUN planner + GateChainRunner PORT (AUTHOR-11/12, ADR-0004; NOT a governance tool, opens no write path)
export * from "./guard.js" // WP-7.26-a.TOOLS — INV-TOOLS-15 single-write-door structural store guard (store-row medium: emit-only, append-only/permissioned)
export * from "./fault.js" // ERROR ATTRIBUTION — the three fault classes at the one handler (malformed-args / refusal / internal-fault) + faultOf
export * from "./handler.js" // WP-7.26-a/-b/-c.TOOLS — one pure+total handler (GOVERNANCE_SURFACE.length === 5, WRITE_PATHS === ['atlas-emit','atlas-link']) + schema + resolveNode
//                                   [WP-10.A5.TOOLS, ADR-0005] `handler.js` also carries `READ_SURFACE` (length 6) — the
//                                   disjoint planner/read-projection surface `GOVERNANCE_SURFACE` unions with over MCP;
//                                   this WP freezes + pins the constant only, it does NOT wire the MCP advertisement (A5.MCP).
//                                   `atlas-diff` is excluded (owner-decided) — see the `./diff.js` note below.
export * from "./query.js" // WP-7.26-b.TOOLS — atlas-query read projection
export * from "./bands.js" // WP-per-fact-freshness — ADR-0013 two-band pack split + ADVISORY_CAP (the ONE definition; @atlas/adapter-io imports it)
export * from "./doctor.js" // WP-7.26-b.TOOLS — read/advisory-only doctor (persists nothing; reground → plan via atlas-emit)
export * from "./transport.js" // WP-7.26-c.TOOLS — tri-transport addressability + spawn ladder (one contract across MCP/poke/CLI, CLI-floor)
export * from "./diff.js" // WP-7.32.TOOLS — atlas-diff read-only version-delta projection; NOT a member of GOVERNANCE_SURFACE
//                                   (the barrel used to call it "not a 5th tool" — pre-ADR-0003 wording; the surface is 5, so it would
//                                   be a sixth — and it is wired to NEITHER transport today: no `atlas diff` CLI command, and MCP
//                                   advertises GOVERNANCE_SURFACE only, so `handle('atlas-diff')` fails closed as off-surface)
//                                   [WP-10.A5.TOOLS — OWNER-DECIDED 2026-08-24] `atlas-diff` is ALSO NOT a `READ_SURFACE`
//                                   member: ARCH-5 (advertised≡invocable) means an unwired door has no business in an
//                                   ADVERTISED surface. It stays a declared reference model (reference-model-guard.mjs's
//                                   ledger) until it is genuinely wired to a transport, in its own later WP.
export * from "./push.js" // WP-6.22.TOOLS — TOOLS-14 phase-transition auto-inject (push-no-grant, mid-task pull non-load-bearing)
