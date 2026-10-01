// @atlas/cli — src/slots.ts  (WP-10.A2-a.CLI — the `atlas slots` read/planner verdict builder)
//
// RELOCATED (WP-10.A5.MCP): `slotsVerdict` now LIVES in @atlas/adapter-io (`author-verdicts.ts`), because the
// MCP transport must drive the SAME shared body for byte-identical SCHEMA + VERDICT parity and the MCP server
// cannot import @atlas/cli (the ring forbids that layer). This module re-exports it so the CLI's own dispatch
// (`cli.ts`) is byte-unchanged. The builder is a READ-ONLY DISCOVERY PLANNER (ADR-0004, AUTHOR-5): it returns
// EXACTLY the closed `PredicateSlot` vocabulary and persists NOTHING; TOTAL — no input, never a throw.

export { slotsVerdict } from "@atlas/adapter-io"
