// @atlas/e2e-blackbox — test/s5-mcp-parity.blackbox.test.ts  (S5 — the agent journey over real MCP stdio)
//
// NARRATIVE: an agent connects to the real `atlas-mcp` server over real MCP stdio, lists the tools, runs an
// `atlas-query` (against a repo the CLI already wrote a grounded fact into), and attempts a fail-closed
// `atlas-emit`. Drives the REAL server subprocess through the SDK `Client` — highest agent fidelity.
//
// SOTA invariants pinned: TRANSPORT PARITY (one governed core, two doors — the MCP `atlas-query` verdict is
// SEMANTICALLY identical to the CLI's for the same input), and FAIL-CLOSED SURVIVES stdio (a rejected emit
// carries `emitted:false` + the rejection reason + guidance through the transport — never a silent success).
//
// F2 (REMEDIATED): a rejected `atlas-emit` over MCP now sets `isError:true` — the handler maps a fail-closed
// `EmitOut{emitted:false}` to an `ok:false` verdict, which the server renders as an error result carrying
// `rejected` + `guidance`. A naive agent can no longer read the fail-closed emit as success. Uniform with the
// CLI's exit 2 for the SAME verdict: the governed refusal is legible on BOTH doors, never a silent success.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { ungroundedFact } from "./adversarial-fixtures.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"
import { draftFact } from "./support.js"

// The CLOSED governance surface (TOOLS-1) — the six GOVERNED write/read doors, each routed through the one
// wired handler (WP-SAMEAS added `atlas-link`; WP-11.W8 added `atlas-memory-emit` — a genuinely new door,
// not a fold into an existing one). Growth is licensed by ADR-0006 Decision 2 (derived + budgeted, ≤30).
const GOVERNANCE_TOOLS = [
  "atlas-init",
  "atlas-query",
  "atlas-emit",
  "atlas-reconcile",
  "atlas-link",
  "atlas-memory-emit",
]
// The FULL advertised surface the SHIPPED composition root exposes over MCP: the governance surface PLUS the
// `atlas-relations` (#99a / ADR-0015 D2) and `atlas-negations` (#99b / ADR-0015 D3) READ tools. Neither is a
// governed `Tool` — each is served directly from its injected leg through the same shared verdict builder the
// CLI drives, so it opens no governed token and leaves `GOVERNANCE_SURFACE` byte-for-byte closed at its own
// size (the honest divergence stated in mcp-server/src/server.ts).
// WP-10.A5.MCP added the six pre-existing READ_SURFACE authoring/read doors (anchors, slots, draft, check,
// doctor, node); WP-11.W8 added the four CAMPAIGN-11 memory READ_SURFACE doors (recall, header, awareness,
// orientation) — all served DIRECTLY from an injected leg through the SAME shared verdict builder the CLI
// drives, so none opens a governed token. Production therefore advertises EIGHTEEN (6 governance + 2
// relations/negations + 6 authoring + 4 memory reads); a build with no read leg falls back to the closed
// governance surface alone (asserted by the mcp-server unit test).
const AUTHORING_TOOLS = ["atlas-anchors", "atlas-slots", "atlas-draft", "atlas-check", "atlas-doctor", "atlas-node"]
const MEMORY_READ_TOOLS = [
  "atlas-memory-recall",
  "atlas-memory-header",
  "atlas-memory-awareness",
  "atlas-memory-orientation",
]
const ADVERTISED_TOOLS = [
  ...GOVERNANCE_TOOLS,
  "atlas-relations",
  "atlas-negations",
  ...AUTHORING_TOOLS,
  ...MEMORY_READ_TOOLS,
]
const REQUIRED: Record<string, string[] | undefined> = {
  "atlas-init": ["path"],
  "atlas-query": ["scope"],
  "atlas-emit": ["node", "at"],
  "atlas-reconcile": ["mergeBase"],
  "atlas-link": ["a", "b"], // WP-SAMEAS — the governed sameAs door's two nodeKeys
  "atlas-memory-emit": ["entry"], // WP-11.W8 — the governed MEMORY write door's one required field
  "atlas-relations": ["unit"], // #99a — the grounded-relation read tool; unit is the required nodeKey
  "atlas-negations": ["scope"], // #99b — the grounded-negation + abstention read tool; scope is required
  // WP-10.A5.MCP READ_SURFACE — the six authoring/read doors' documented input schemas (server-read-tools.ts).
  "atlas-anchors": ["path"],
  "atlas-slots": undefined, // no required arg — the closed-vocabulary listing takes no input
  "atlas-draft": ["anchor", "slot", "claim"],
  "atlas-check": ["fact", "at"],
  "atlas-doctor": ["sub"],
  "atlas-node": ["node"],
  // WP-11.W8 memory READ_SURFACE — none takes a required field (server-memory-tools.ts).
  "atlas-memory-recall": undefined,
  "atlas-memory-header": undefined,
  "atlas-memory-awareness": undefined,
  "atlas-memory-orientation": undefined,
}

interface McpText {
  data?: unknown
  rejected?: unknown
  guidance?: { next?: string; invariant?: string }
}
const textOf = (r: { content: Array<{ text?: string }> }): McpText => JSON.parse(r.content[0]?.text ?? "{}") as McpText

let repo: FixtureRepo
let fact: GroundedFact
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // KNOW-8 ratifier — T1 fact routes to full-ratify
  repo = makeFixtureRepo({ files: { "src/foo.ts": "export const foo = 1;\n" }, policy: scopedPolicy("src") })
  fact = draftFact(repo, "src/foo.ts", "invariant", "foo is 1").fact
  const e = emitFact(repo, fact) // persist ONE grounded fact via the CLI door — both transports read it back
  if (e.exitCode !== 0) throw new Error(`S5 setup: grounded emit failed:\n${e.stdout}`)
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S5 — MCP stdio parity with the CLI over the one governed core", () => {
  it(
    "listTools() advertises the 6 governance tools PLUS the 2 relations/negations + 6 authoring + 4 memory READ_SURFACE tools, each with an object input schema + required args",
    { timeout: 20000 },
    async () => {
      const session = await mcpSession(repo.repoPath)
      try {
        const { tools } = await session.client.listTools()
        // The shipped composition root injects the relation (#99a) + negation (#99b) read legs AND the full
        // READ_SURFACE bundle (WP-10.A5.MCP's six + WP-11.W8's four memory doors), so production advertises
        // EIGHTEEN: the closed governance surface + `atlas-relations` + `atlas-negations` + the 6 authoring
        // doors + the 4 memory doors. The governance six are still all present and unchanged, and none of the
        // 12 read/authoring doors opens a governed token.
        expect(tools.map((t) => t.name)).toEqual(ADVERTISED_TOOLS)
        for (const t of tools) {
          expect(t.inputSchema).toMatchObject({ type: "object" })
          expect(t.inputSchema.required).toEqual(REQUIRED[t.name])
        }
      } finally {
        await session.close()
      }
    },
  )

  it(
    "SOTA transport parity: MCP `atlas-query` returns the SAME governed verdict the CLI does",
    { timeout: 20000 },
    async () => {
      // the CLI verdict for the same input (rendered rows).
      const cli = runAtlas(repo.repoPath, ["query", "src"])
      expect(invLines(cli.stdout)).toEqual([`  inv T1 ${fact.id} [FRESH]: foo is 1`])

      const session = await mcpSession(repo.repoPath)
      try {
        const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
        expect(res.isError).toBeFalsy()
        const body = textOf(res as { content: Array<{ text?: string }> })
        const pack = (body.data as { pack?: { invariants?: unknown } }).pack
        // the SAME semantic invariant (nodeId/tier/claim/freshness) the CLI rendered — parity across the two
        // doors. [ADR-0013] `freshness` is part of that parity: MCP JSON-stringifies the live `Pack`, so the
        // per-row verdict crosses stdio exactly as it reaches the CLI row (unlike the content-addressed poke
        // file, where KERNEL-8 strips it — see adapter-io/test/poke-file.test.ts).
        expect(pack?.invariants).toEqual([{ nodeId: fact.id, tier: "T1", claim: "foo is 1", freshness: "FRESH" }])
      } finally {
        await session.close()
      }
    },
  )

  it(
    "SOTA fail-closed survives stdio: a rejected MCP `atlas-emit` sets isError:true + carries the reason + guidance",
    { timeout: 20000 },
    async () => {
      const session = await mcpSession(repo.repoPath)
      try {
        const res = await session.client.callTool({
          name: "atlas-emit",
          arguments: { node: ungroundedFact("bad over mcp"), at: repo.sha() },
        })
        // F2 (FLIPPED): a fail-closed emit is now an ERROR result over MCP — a naive agent CANNOT read it as a
        // success. `isError:true` is the governed-refusal signal, uniform with the CLI's exit 2 for the SAME
        // verdict (was a silent non-error before remediation — the finding this story documented).
        expect(res.isError).toBe(true)
        const body = textOf(res as { content: Array<{ text?: string }> })
        // the reason + guidance ride the error channel (the server maps an ok:false verdict → {rejected, guidance}).
        expect(String(body.rejected)).toContain("ungrounded")
        expect(body.guidance?.next).toBeTruthy()
        expect(body.guidance?.invariant).toContain("TOOLS-1/7")
      } finally {
        await session.close()
      }
    },
  )

  it("fail-closed did not persist: a subsequent CLI query still shows only the ONE grounded fact", () => {
    const r = runAtlas(repo.repoPath, ["query", "src"])
    expect(invLines(r.stdout)).toEqual([`  inv T1 ${fact.id} [FRESH]: foo is 1`]) // the bad MCP emit left nothing
  })
})
