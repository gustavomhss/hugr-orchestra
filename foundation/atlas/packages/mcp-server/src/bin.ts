#!/usr/bin/env node
// @atlas/mcp-server — src/bin.ts  (MCP entrypoint: the composed runtime, served over stdio)
//
// The thin production entrypoint: `composeRuntime(process.cwd())` reads the repo at the cwd (policy, index
// axes, durable CAS) and returns THE one governed durable `WiredHandler`; `createMcpServer` serves it over
// the SDK stdio transport. No per-entrypoint governance is constructed here — the composition root
// (@atlas/adapter-io) owns the seams (COMPOSE-A), this bin owns nothing but the wiring (WIRE-1: CLI ≡ MCP
// — the SAME composed handler behind both entrypoints, which is NOT the same as the same exposed surface;
// three CLI commands have no MCP tool, see the parity note in server.ts).
import { composeRuntime, initAst } from "@atlas/adapter-io"
import { createMcpServer } from "./server.js"

// Warm up the opt-in AST grammar ONCE before composing (F1) — same rationale as the CLI bin: `foldAstUnits`
// (the sync FileTree refinement `composeRuntime` folds before every `build`) only yields `::` sub-file symbol
// nodes after `initAst()` resolves, so a symbol grounding is groundable and `subsumes` fires over MCP too.
void (async () => {
  await initAst()
  const {
    handler,
    relations,
    negations,
    anchors,
    slots,
    draft,
    check,
    doctorSource,
    memoryRecall,
    memoryHeader,
    memoryAwareness,
    memoryOrientation,
  } = composeRuntime(process.cwd())
  // `relations` (#99a) is the grounded-relation read leg — exposed over MCP as `atlas-relations`, served
  // directly from this leg (it is not a governed `Tool`), so an MCP client reaches the same fold the CLI does.
  // `negations` (#99b) is the grounded-negation + abstention read leg — exposed over MCP as `atlas-negations`
  // the same way, so an MCP client can SEE a fired abstention (the #202 close), never through a governed token.
  // WP-10.A5.MCP — the pre-existing READ_SURFACE six (anchors, slots, draft, check, doctor, node) is exposed
  // over MCP the same way: each rides its SHARED verdict builder (`@atlas/adapter-io`), the SAME body the CLI
  // drives, so an MCP agent seat has the same authoring surface the CLI has. `node` is served by
  // `handler.resolveNode`; the other five ride these injected legs. NONE opens a governed token or a write path.
  const readLegs = { anchors, slots, draft, check, doctorSource }
  // WP-11.W8 / CAMPAIGN-11 — the four memory READ_SURFACE doors, exposed the SAME way over
  // `advertisedMemoryTools`/`callMemoryTool` (server-memory-tools.ts). The write half, `atlas-memory-emit`,
  // needs NO threading here: it is a `GOVERNANCE_SURFACE` member and is already reachable through `handler`
  // the moment `composeRuntime` wires `WireConfig.memoryEmit` — the SAME single-handler property `atlas-emit`
  // and `atlas-link` already have.
  const memoryLegs = { memoryRecall, memoryHeader, memoryAwareness, memoryOrientation }
  await createMcpServer(handler, relations, negations, readLegs, memoryLegs).start()
})()
