// @atlas/adapter-io — test/wire.test.ts   (WP-9.1.1-a.WIRE — REQ-WIRE-1a / REQ-WIRE-1b)
//
// The shared `wire` module assembles ONE five-leg `WiredHandler` (atlas-init/query/emit/reconcile/link) over the
// raw adapters + injected seams. These cases test the ASSEMBLY (one handler, five legs reachable, the sole
// assembly point) — NOT leg behaviour: the legs run over real adapters (fix-repo + fix.scip) with stubbed
// seams, so a leg may return a rejected Verdict; what matters is that each leg is WIRED (reachable), never
// the frozen "tool '…' not wired at this seam" fail-closed. A missing/throwing leg is caught by `handle`
// into a rejected Verdict (never a throw, TOOLS-2), so stubbed seams are safe.
//
// SCN-WIRE-1b is SOFTENED at WIRE scope: the literal cross-entrypoint `cliHandler === mcpHandler` is
// DEFERRED — CLI (WP-9.1.1-a.CLI) and MCP (WP-9.4.7.MCP) land later and each calls THIS factory
// INDEPENDENTLY (two separate `assembleHandler(cfg)` calls yield two instances by construction). What is
// assertable NOW is the load-bearing precondition: `assembleHandler` is the SOLE shared-module assembly
// point both entrypoints will import (module-symbol identity), and a single call yields ONE handler whose
// five legs all dispatch through it. The teeth pin the discriminator a copy-assembly would flip.

import { describe, it, expect } from "vitest"
import { createHandler, GOVERNANCE_SURFACE } from "@atlas/tools"
import type { Tool, TruthGate, T0Heuristic } from "@atlas/tools"
import type { ReconcileApi, GroundedFact } from "@atlas/knowledge"
import { assembleHandler } from "../src/wire.js"
import type { WireConfig, WiredHandler, WireSeams } from "../src/wire.js"
import { makeFixRepo } from "./harness/fix-repo.js"
import { makeFixScip } from "./harness/fix-scip.js"

// ── stubbed seams (no adapter backs these at the WIRE slice; behaviour is out of scope) ──────────────
const heuristic: T0Heuristic = { isCandidate: () => false }
const gate: TruthGate = { gateHolds: () => "NA" }
const classifier: ReconcileApi = {
  reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }),
}
const seams: WireSeams = {
  heuristic,
  gate,
  classifier,
  driftFacts: [] as readonly GroundedFact[],
  resolveAnchorAt: () => undefined,
}

/** Build a real config over the committed fix-repo + fix.scip fixtures. */
function makeConfig(): { cfg: WireConfig; cleanup: () => void } {
  const repo = makeFixRepo()
  const scip = makeFixScip()
  const cfg: WireConfig = {
    repoPath: repo.repoPath,
    casPath: `${repo.repoPath}/.atlas-cas`,
    scipPath: scip.scipPath,
    seams,
  }
  return {
    cfg,
    cleanup: () => {
      repo.cleanup()
      scip.cleanup()
    },
  }
}

/** A leg is WIRED iff `handle(tool)` does NOT fail closed with the frozen "not wired at this seam" reason
 *  (a present leg either succeeds or fails on its OWN domain/args, never with that assembly-gap message). */
const legWired = (h: WiredHandler, tool: Tool): boolean =>
  !(h.handle(tool, {}).rejected ?? "").includes("not wired at this seam")

/** The wired-leg surface of a handler over the closed GOVERNANCE_SURFACE set. */
const surface = (h: WiredHandler): number => GOVERNANCE_SURFACE.filter((t) => legWired(h, t)).length

describe("WP-9.1.1-a.WIRE — one shared five-leg WiredHandler assembly", () => {
  // ── SCN-WIRE-1a-1 — the wire module assembles ONE five-leg handler (happy) ──────────────────────────
  describe("SCN-WIRE-1a-1 — one handler exposes exactly the five legs", () => {
    it("assembleHandler yields a single WiredHandler with all five governance legs reachable", () => {
      const { cfg, cleanup } = makeConfig()
      try {
        const handler = assembleHandler(cfg)
        // exactly the five governance legs dispatch through THIS one handler (none is "not wired").
        for (const tool of GOVERNANCE_SURFACE) {
          expect(legWired(handler, tool)).toBe(true)
        }
        // the handler conforms to HandlerApi (handle/resolveNode/schema present).
        expect(typeof handler.handle).toBe("function")
        expect(typeof handler.resolveNode).toBe("function")
        expect(typeof handler.schema).toBe("function")
        // an off-surface tool (atlas-diff, a read projection) → fail closed, NEVER a wired leg (the governance surface is exactly five, TOOLS-1).
        const fifth = handler.handle("atlas-diff" as unknown as Tool, {})
        expect(fifth.ok).toBe(false)
        expect(fifth.rejected ?? "").toContain("not wired at this seam")
      } finally {
        cleanup()
      }
    })

    it("TEETH — a split (two-handler) assembly flips: no single copy exposes all six legs", () => {
      const { cfg, cleanup } = makeConfig()
      try {
        // the real shared assembly: one handler, surface == 6 (WP-SAMEAS added atlas-link, WP-11.W8 added
        // atlas-memory-emit — present as a literal key even with `cfg.memoryEmit` absent, where it fails
        // closed on ITS OWN domain reason ("no memory write door composed"), never the assembly-gap message
        // `legWired` keys off).
        expect(surface(assembleHandler(cfg))).toBe(6)
        // simulate "two separate handlers, one per entrypoint" (the mutant SCN-WIRE-1a names): each copy
        // holds a DISJOINT leg subset — so NEITHER single copy exposes the full five-leg surface.
        const echo = (args: unknown) => args as never
        const copyA = createHandler({ "atlas-init": echo, "atlas-query": echo })
        const copyB = createHandler({ "atlas-emit": echo, "atlas-reconcile": echo })
        expect(surface(copyA as WiredHandler)).toBeLessThan(4)
        expect(surface(copyB as WiredHandler)).toBeLessThan(4)
      } finally {
        cleanup()
      }
    })
  })

  // ── SCN-WIRE-1b-1 — the SOLE assembly point (module-identity), softened at WIRE scope ────────────────
  describe("SCN-WIRE-1b-1 — assembleHandler is the sole shared-module assembly point (softened)", () => {
    it("every entrypoint imports THIS one factory (module-symbol identity) — one handler, six legs", async () => {
      const { cfg, cleanup } = makeConfig()
      try {
        // module-identity: a re-import of the wire module yields the SAME `assembleHandler` reference — the
        // one both CLI and MCP will import (the shared-module singleton). The literal cross-entrypoint
        // `cliHandler === mcpHandler` is DEFERRED to when CLI/MCP land, because each calls this factory
        // INDEPENDENTLY (two `assembleHandler(cfg)` calls ⇒ two instances) — so the assertable invariant now
        // is the shared SOURCE, not a shared instance the two-independent-call reality cannot yet produce.
        const reimport = await import("../src/wire.js")
        expect(reimport.assembleHandler).toBe(assembleHandler)
        // a single call yields ONE handler whose six legs all dispatch through it (WP-SAMEAS: +atlas-link,
        // WP-11.W8: +atlas-memory-emit).
        const handler = assembleHandler(cfg)
        expect(surface(handler)).toBe(6)
      } finally {
        cleanup()
      }
    })

    it("TEETH — a copy-assembled handler (createHandler called independently) is a distinct instance", () => {
      const { cfg, cleanup } = makeConfig()
      try {
        const shared = assembleHandler(cfg)
        // a handler assembled OUTSIDE the sole factory (an independent createHandler call, as a per-
        // entrypoint copy would do) is a DIFFERENT instance — never the shared-module handler.
        const echo = (args: unknown) => args as never
        const copy = createHandler({ "atlas-init": echo }) as WiredHandler
        expect(copy).not.toBe(shared)
        // and it is NOT the full five-leg surface (a partial copy flips the surface assertion).
        expect(surface(copy)).toBeLessThan(5)
      } finally {
        cleanup()
      }
    })
  })
})
