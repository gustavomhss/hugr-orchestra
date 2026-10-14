// @atlas/cli — src/anchors.ts  (WP-10.A1.CLI — the `atlas anchors <path>` read/planner verdict builder)
//
// RELOCATED (WP-10.A5.MCP): `anchorsVerdict` now LIVES in @atlas/adapter-io (`author-verdicts.ts`), because
// the MCP transport must drive the SAME shared body for byte-identical SCHEMA + VERDICT parity and the MCP
// server cannot import @atlas/cli (the ring forbids that layer). This module re-exports it so the CLI's own
// dispatch (`cli.ts`) is byte-unchanged. The builder is a READ-ONLY DISCOVERY PLANNER (ADR-0004, AUTHOR-2/3/4):
// it lists the groundable units under `path` and persists NOTHING; TOTAL — a missing/empty `path` fails CLOSED.

export { anchorsVerdict } from "@atlas/adapter-io"
