// @atlas/cli — src/draft.ts  (WP-10.A2-a.CLI — the `atlas draft <anchor> <slot> <claim>` verdict builder)
//
// RELOCATED (WP-10.A5.MCP): `draftVerdict` now LIVES in @atlas/adapter-io (`author-verdicts.ts`), because the
// MCP transport must drive the SAME shared body for byte-identical SCHEMA + VERDICT parity and the MCP server
// cannot import @atlas/cli (the ring forbids that layer). This module re-exports it so the CLI's own dispatch
// (`cli.ts`) is byte-unchanged. The builder is a READ-ONLY COMPOSITION PLANNER (ADR-0004, AUTHOR-6/7): it
// composes a candidate `GroundedFact` from the three author-supplied fields and persists NOTHING; TOTAL — a
// missing/empty positional or an out-of-vocabulary slot fails CLOSED, never a throw.

export { draftVerdict } from "@atlas/adapter-io"
