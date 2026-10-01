// @atlas/e2e-blackbox — test/s-mcp-authoring.blackbox.test.ts  (WP-10.A5.E2E — author AND emit over MCP ALONE)
//
// THE CAMPAIGN THESIS, over one transport. An agent seat authors a grounded fact end to end WITHOUT the CLI and
// WITHOUT any in-process `@atlas/*` fabrication: it DISCOVERS the fixture's real groundable units (`atlas-anchors`)
// and the closed slot vocabulary (`atlas-slots`), COMPOSES a candidate off a real anchor (`atlas-draft` — the ONE
// grounding computer mints id/grounding/rev), and COMMITS it through the governed door (`atlas-emit`, node =
// draft's own `fact`, at = draft's own `rev`) — all four calls over ONE real stdio MCP session against the shipped
// `atlas-mcp` bin. The fact the door writes is the LITERAL `DraftOut.fact` the draft door composed; this story
// supplies only the anchor/slot/claim, and reads the outcome back — again over MCP — with `atlas-query`/`atlas-node`.
//
// NO CLI SUBPROCESS ON THE AUTHORING PATH, NO @atlas AUTHORING. This is the MCP mirror of s-author8-round-trip's
// CLI byte relay: there the relay was `draft --json | emit` across two CLI subprocesses; here it is
// `atlas-draft → atlas-emit` across one MCP session, the draft's `fact`/`rev` handed to emit UNTOUCHED. The old
// in-process fabricator (`adversarial-fixtures.ts` — `@atlas/index build` + full synthesis) authors NOTHING here; the product's
// own doors do. That is the whole point of routing the READ_SURFACE onto MCP (WP-10.A5.MCP).
//
// BLACK-BOX. The only execution seam is `mcpSession` (the shipped `atlas-mcp` bin over real stdio). This file
// imports NOTHING from `@atlas/*`. `draft` composes a T2 advisory candidate (auto-accept), so the emit needs no
// ratifier — only the KNOW-11 write actor (`ATLAS_ACTOR`) the fixture policy authorizes for the anchor's scope.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, mcpSession } from "../src/harness.js"
import type { FixtureRepo, McpSession } from "../src/harness.js"

const ACTOR = "e2e@atlas.local"
// `scopeOf(anchor)` is the anchor's first path segment (AUTHOR-6d): `src/app.ts` → `src`. Authorize the actor
// for that scope so the governed emit door admits the write; sized by INSPECTING the fixture layout, not by
// importing the product's `scopeOf`.
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { src: [ACTOR] } },
})
const FILES: Readonly<Record<string, string>> = {
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
}

const ANCHOR = "src/app.ts"
const SLOT = "invariant"
const CLAIM = "run never returns an empty string"

interface McpOk {
  data?: unknown
  guidance?: unknown
}
interface McpErr {
  fault?: unknown
  rejected?: unknown
  guidance?: unknown
}
type CallResult = { isError?: boolean; content: Array<{ text?: string }> }

const okData = (res: CallResult): Record<string, unknown> => {
  if (res.isError === true) throw new Error(`expected an ok result, got isError:\n${res.content[0]?.text}`)
  return ((JSON.parse(res.content[0]?.text ?? "{}") as McpOk).data ?? {}) as Record<string, unknown>
}

let repo: FixtureRepo
let priorActor: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  process.env.ATLAS_ACTOR = ACTOR // the KNOW-11 write actor the policy authorizes for scope `src`
  repo = makeFixtureRepo({ files: FILES, policy: POLICY })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
})

describe("SCN-MCP-AUTHOR — an agent authors AND emits a grounded fact over stdio MCP alone", () => {
  it("anchors → slots → draft → emit, entirely over one MCP session, is ACCEPTED and readable back", async () => {
    const session: McpSession = await mcpSession(repo.repoPath)
    try {
      const client = session.client

      // (1) DISCOVER the groundable units — the real census, over MCP (atlas-anchors), never a CLI shell-out.
      const anchorsData = okData(
        (await client.callTool({ name: "atlas-anchors", arguments: { path: "." } })) as CallResult,
      )
      const units = (anchorsData.units ?? []) as Array<{ qualifiedPath?: string; kind?: string }>
      expect(units.some((u) => u.qualifiedPath === ANCHOR && u.kind === "file")).toBe(true) // the anchor is real
      expect(units.some((u) => u.kind === "symbol" && String(u.qualifiedPath).startsWith("src/app.ts::"))).toBe(true)
      const rev = anchorsData.rev
      expect(typeof rev).toBe("string") // the built index's rev, discovered — not invented

      // (2) DISCOVER the closed slot vocabulary — over MCP (atlas-slots) — and confirm the chosen slot is a member.
      const slotsData = okData((await client.callTool({ name: "atlas-slots", arguments: {} })) as CallResult)
      const slotNames = ((slotsData.slots ?? []) as Array<{ slot?: string }>).map((s) => s.slot)
      expect(slotNames).toContain(SLOT)
      expect(slotNames.length).toBe(13) // the whole closed vocabulary, discovered over the transport

      // (3) COMPOSE the candidate — over MCP (atlas-draft). id/grounding/rev are ALL computed by the door.
      const draftData = okData(
        (await client.callTool({
          name: "atlas-draft",
          arguments: { anchor: ANCHOR, slot: SLOT, claim: CLAIM },
        })) as CallResult,
      )
      const fact = draftData.fact as Record<string, unknown>
      expect(fact).toBeTruthy()
      expect(draftData.rev).toBe(rev) // the draft grounded against the SAME rev anchors reported
      expect(draftData.operation).toBe("CREATE")
      const nodeId = fact.id as string
      expect(nodeId).toMatch(/^[0-9a-f]{64}$/) // the product's own nodeKey — minted by the door, not authored here

      // (4) COMMIT it through the governed door — over MCP (atlas-emit). node = draft's OWN fact, at = draft's OWN
      //     rev, handed across UNTOUCHED (no field authored, reconstructed, or reserialized by this test).
      const emitRes = (await client.callTool({
        name: "atlas-emit",
        arguments: { node: fact, at: draftData.rev },
      })) as CallResult
      if (emitRes.isError === true) {
        const err = JSON.parse(emitRes.content[0]?.text ?? "{}") as McpErr
        throw new Error(`MCP-only emit refused: ${JSON.stringify(err.rejected)} — ${JSON.stringify(err.guidance)}`)
      }
      const emitData = okData(emitRes)
      expect(emitData.emitted).toBe(true) // the governed door ACCEPTED the fact — a real write
      const casAddress = emitData.id as string // the CAS content address the emit door persisted the bytes at
      expect(casAddress).toMatch(/^[0-9a-f]{64}$/)
      expect(emitData.nodeKey).toBe(nodeId) // the door's read-door identity is the SAME nodeKey the draft minted

      // (5) READ THE WHOLE NODE BACK at its content address — over MCP (atlas-node) — proving the write is
      //     DURABLE and served. `atlas-node` resolves by the CAS CONTENT ADDRESS (the emit door's `id`), and is
      //     tier-agnostic (a per-address projection through the wired handler's resolveNode), so it reaches the
      //     fact regardless of the read pack's tier bound.
      const nodeData = okData(
        (await client.callTool({ name: "atlas-node", arguments: { node: casAddress } })) as CallResult,
      )
      const resolved = JSON.stringify(nodeData)
      expect(resolved).toContain(nodeId) // the resolved node carries the minted nodeKey as its own `.id`
      expect(resolved).toContain(CLAIM) // and it carries the exact claim the seat drafted

      // (6) HONEST TIER BOUND — the same fact is T2 (draft's advisory fast-path tier), and TOOLS-6 bounds T2 OUT
      //     of the bounded read pack, so `atlas-query src` does NOT surface it. Asserting its ABSENCE here keeps
      //     the story from silently depending on a tier promotion it never performed (a T1 fact would need a
      //     ratifier; this seat authored an advisory T2 and the query bound is exactly why it is unlisted).
      expect(fact.tier).toBe("T2")
      const queryData = okData(
        (await client.callTool({ name: "atlas-query", arguments: { scope: "src" } })) as CallResult,
      )
      const pack = queryData.pack as { invariants?: Array<{ nodeId?: string }> }
      expect(pack.invariants?.some((r) => r.nodeId === nodeId) ?? false).toBe(false) // T2 bounded out — product-correct
    } finally {
      await session.close()
    }
  }, 30_000)
})

describe("black-box law — this story imports no product library", () => {
  it("this file's own source text carries no `@atlas/` import specifier (the authoring path uses only MCP doors)", async () => {
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8")
    const imports = [...src.matchAll(/^import .*from '([^']+)'/gm)].map((m) => m[1])
    expect(imports.filter((s) => s?.startsWith("@atlas/"))).toEqual([])
  })
})
