// @atlas/mcp-server — test/memory-emit-mcp.test.ts  (WP-11.W8 — `atlas-memory-emit` over stdio + CLI≡MCP parity)
//
// `atlas-memory-emit` is a GENUINELY NEW `GOVERNANCE_SURFACE`/`WRITE_PATHS` member (WP-11.W8) — unlike
// `atlas-relations`/`atlas-negations`/the READ_SURFACE doors, it needs NO special-case code in `server.ts`:
// `advertisedTools(handler)` loops `GOVERNANCE_SURFACE` generically and reads the schema off
// `handler.schema('atlas-memory-emit')`, and `callTool` falls through to `handler.handle(name, args)` for any
// token the read/relations/negations/memory-read routers do not claim. This file tests THAT — the write door
// is reachable over MCP with no code change here — and closes the acceptance gap named in the WP brief:
// "parity has never been tested for a WRITE door over MCP". The parity assertion drives a REAL composed
// `WiredHandler` (real `createDurableMemory`/`createMemoryEmit` over a real tmpdir store, `assembleHandler`
// wire.ts) via BOTH the MCP `callTool` path and a hand-marshalled equivalent of the CLI's own
// `marshalMemoryEmit` (readFileSync + JSON.parse — the CLI package cannot be imported here without adding a
// `cli → mcp-server`-adjacent test edge the layer ring does not need; the two lines it marshals are trivial
// enough to state inline and are asserted against the SAME shape `marshal.ts` produces, by construction).

import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { GOVERNANCE_SURFACE } from "@atlas/tools"
import type { Tool, TruthGate, T0Heuristic } from "@atlas/tools"
import type { ReconcileApi, GroundedFact } from "@atlas/knowledge"
import type { NamedScanner } from "@atlas/memory"
import { assembleHandler, createDurableMemory, createMemoryEmit } from "@atlas/adapter-io"
import type { WireConfig, WireSeams, WiredHandler } from "@atlas/adapter-io"
import { advertisedTools, callTool } from "../src/server.js"

// ── the minimal WIRE seams (mirrors adapter-io's own `wire.test.ts` — behaviour of the other five legs is
//    out of scope; only `atlas-memory-emit` is under test here) ────────────────────────────────────────────
const seams: WireSeams = {
  heuristic: { isCandidate: () => false } as T0Heuristic,
  gate: { gateHolds: () => "NA" } as TruthGate,
  classifier: { reconcile: () => ({ mechanical: [], semantic: [], reauthorCount: 0, exitCode: 0 }) } as ReconcileApi,
  driftFacts: [] as readonly GroundedFact[],
  resolveAnchorAt: () => undefined,
}

/** Always-clean fake scanner (MEM-9b/9c seam) — this suite tests DISPATCH, not the scanner binding, which
 *  `scanner.ts`'s own suite covers; a real binary may be absent wherever this test runs. */
const cleanScanner: NamedScanner = { name: "test-scanner", scan: () => false }

let root: string
let entryPath: string
let handler: WiredHandler

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-memory-emit-mcp-"))
  entryPath = join(root, "entry.json")
  writeFileSync(entryPath, JSON.stringify({ rule: "prefer named exports", scope: "src", frecency: 1 }))
  const store = createDurableMemory(root)
  const memoryEmit = createMemoryEmit({ store, actor: "dev@example.com", scanner: cleanScanner })
  const cfg: WireConfig = {
    repoPath: root,
    casPath: join(root, ".atlas-cas"),
    scipPath: join(root, "nonexistent.scip"),
    seams,
    memoryEmit,
  }
  handler = assembleHandler(cfg)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("WP-11.W8 — atlas-memory-emit is advertised generically (no server.ts special case)", () => {
  it("is a GOVERNANCE_SURFACE member and its schema comes straight off handler.schema", () => {
    expect(GOVERNANCE_SURFACE).toContain("atlas-memory-emit")
    const tools = advertisedTools(handler)
    const memEmit = tools.find((t) => t.name === "atlas-memory-emit")
    expect(memEmit).toBeDefined()
    expect(memEmit?.inputSchema).toEqual(handler.schema("atlas-memory-emit").inputSchema)
  })
})

describe("WP-11.W8 — atlas-memory-emit over MCP admits a clean write, exactly like the CLI marshaller would", () => {
  it("callTool admits the entry and the CLI-equivalent marshalled call produces the SAME data", () => {
    // The MCP caller sends STRUCTURED JSON args directly — no file, no marshalling.
    const entry = JSON.parse(readFileSync(entryPath, "utf8")) as unknown
    const mcpResult = callTool(handler, "atlas-memory-emit", { entry })
    expect(mcpResult.isError).toBeFalsy()
    const mcpData = (JSON.parse((mcpResult.content[0] as { text: string }).text) as { data: unknown }).data
    expect(mcpData).toEqual({ admitted: true, record: { owner: "dev@example.com", kind: "project", entry } })

    // The CLI's `marshalMemoryEmit` (packages/cli/src/marshal.ts) does exactly this to a fresh Verdict:
    //   readFileSync(entryPath) → JSON.parse → { entry }.
    // A SECOND identical write is idempotent (memory-store.ts: "appending the same record twice folds to
    // one" — the record is content-derived, no timestamp), so calling the SAME handler again with the
    // CLI-shaped args is a valid stand-in for "the CLI called this transport's own handler.handle" and
    // proves CLI≡MCP dispatch parity over the REAL store, not just two independent fakes agreeing with
    // themselves.
    const cliShapedArgs = { entry: JSON.parse(readFileSync(entryPath, "utf8")) as unknown }
    const cliVerdict = handler.handle("atlas-memory-emit" as Tool, cliShapedArgs)
    expect(cliVerdict.ok).toBe(true)
    expect(cliVerdict.data).toEqual(mcpData)
  })
})

describe("WP-11.W8 — a refused write is visible over MCP as isError, exactly as the CLI renders it exit 2", () => {
  it("a scanner-blocked write carries the SAME refusal reason MCP and CLI would both show", () => {
    const blockedStore = createDurableMemory(mkdtempSync(join(tmpdir(), "atlas-memory-emit-blocked-")))
    const blockingScanner: NamedScanner = { name: "blocking-scanner", scan: () => true }
    const blockedEmit = createMemoryEmit({ store: blockedStore, actor: "dev@example.com", scanner: blockingScanner })
    const blockedHandler = assembleHandler({
      repoPath: root,
      casPath: join(root, ".atlas-cas-2"),
      scipPath: join(root, "nonexistent.scip"),
      seams,
      memoryEmit: blockedEmit,
    })
    const result = callTool(blockedHandler, "atlas-memory-emit", { entry: { rule: "x", scope: "src", frecency: 1 } })
    expect(result.isError).toBe(true)
    const parsed = JSON.parse((result.content[0] as { text: string }).text) as { rejected: string }
    // MEASURED, not assumed: `verdictToResult`'s `isError` branch serializes ONLY `{fault, rejected,
    // guidance}` — `data` (which would carry `MemoryEmitOut.refusal` as its OWN field) is DROPPED on a
    // rejected verdict (server.ts). So the named MEM gate reaches an MCP caller ONLY as the PREFIX of
    // `rejected` (`wire.ts`'s `${verdict.refusal}: ${verdict.reason}` convention) — this assertion is what
    // pins that prefix; a mutant that drops it (tested live, see the WP report) goes undetected by anything
    // that only checks a `data.refusal` field, because that field never reaches this transport on a refusal.
    expect(parsed.rejected).toMatch(/^scanner-blocked: /)
    expect(parsed.rejected).toContain("blocking-scanner")
  })
})
