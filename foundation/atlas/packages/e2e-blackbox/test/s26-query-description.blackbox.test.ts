// @atlas/e2e-blackbox — test/s26-query-description.blackbox.test.ts  (S26.4 — the atlas-query DESCRIPTION)
//
// NARRATIVE: an agent that has never read this repo meets `atlas-query` exactly once — as the `description`
// string its MCP client renders in the tool list. That string is the whole contract for a caller who cannot
// read the source, and for the entire window after the two-band split shipped (PR #107 / ADR-0013) it said:
//
//   "bounded read projection — resolves a scope to the merged covering pack of tier>=T1 invariants,
//    stale-flagged (TOOLS-6)"
//
// …while the tool ALSO returned an `advisory` band of `T2` machine proposals no ratifier ever saw. The agent
// was told "ratified rows only" and handed unratified ones under the same word. That is precisely what
// ADR-0013 clause 3 exists to prevent, failing at the first place a reader looks. The sibling guidance string
// (`GUIDANCE['atlas-query'].invariant`, ~66 lines above the schema in tools/src/handler.ts) WAS corrected in
// the same PR; the schema `description` was not, and nothing noticed because nothing asserted on it.
//
// WHY THIS STORY IS BLACK-BOX AND WHY IT ASSERTS THE WHOLE STRING:
//   · The unit suite imports `packages/tools/src/**`. The product serves this string from the BUILT
//     `packages/mcp-server/dist/src/bin.js`, through `handler.schema(tool)` → `advertisedTools` → a real
//     `ListTools` response. An in-process assertion cannot tell a fixed source from an unbuilt one; this
//     spawns the real binary and reads the description back off the wire.
//   · It asserts EQUALITY against the frozen text, not `toContain`. A substring assertion is satisfied by a
//     string that has had the honest half deleted — the exact way this description drifted in the first
//     place. The equality leg makes any edit LOUD; the semantic legs below make it MEANINGFUL, so a future
//     author who re-freezes a lie has to delete a named refusal to do it.
//   · The last leg proves the description is TRUE of behaviour, not merely stable: one `T1` fact and one
//     `T2` fact go in, and the pack that comes back off the wire has BOTH bands populated with the field
//     names the description promises. A description pinned only against itself is a tautology.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { mcpSession, makeFixtureRepo } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"

/**
 * THE FROZEN `atlas-query` DESCRIPTION — byte-for-byte what `packages/tools/src/handler.ts` publishes.
 *
 * Changing the product string WITHOUT changing this one is a red test, by construction. Changing BOTH is
 * still gated by the semantic legs in S26.4b, which are stated as properties of the claim rather than as
 * text: whatever this string becomes, it must still name both bands and must still say the advisory one is
 * unratified.
 */
const QUERY_DESCRIPTION =
  "bounded read projection — resolves a scope to a covering pack in TWO bands: `invariants` is GOVERNING " +
  "(tier>=T1, ratified) and `advisory` is ADVISORY (T2 machine proposals NO ratifier saw, separately " +
  "capped, with `advisoryDropped` counting what the cap dropped). Every row carries its own `freshness`; " +
  "the pack-level `stale` flag means re-ground before trusting (TOOLS-6, ADR-0013)"

/** The retired claim, verbatim. Kept as a NAMED constant so the refusal below reads as "never again this",
 *  not as an anonymous regex — and so a reader of a future failure sees the sentence that was the defect. */
const THE_RETIRED_LIE = "the merged covering pack of tier>=T1 invariants"

/** The guidance `invariant` line every `atlas-query` verdict carries (tools/src/handler.ts GUIDANCE). It was
 *  corrected when the schema description was not, so it is pinned here too — the drift is symmetric and the
 *  next omission could just as easily be this one. */
const QUERY_GUIDANCE_INVARIANT =
  "TOOLS-6: bounded read projection, two bands (governing tier>=T1 + separately capped advisory T2), " +
  "every row carrying its own freshness"

interface McpRow {
  readonly nodeId: string
  readonly tier: string
  readonly claim: string
  readonly freshness: string
}
interface McpBody {
  data?: { pack?: { invariants?: readonly McpRow[]; advisory?: readonly McpRow[]; advisoryDropped?: number } }
  guidance?: { next?: string; invariant?: string }
}
const bodyOf = (r: unknown): McpBody =>
  JSON.parse((r as { content: Array<{ text?: string }> }).content[0]?.text ?? "{}") as McpBody

let repo: FixtureRepo
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // a T1 fact routes to KNOW-18 full-ratify and needs one
  repo = makeFixtureRepo({ files: { "src/foo.ts": "export const foo = 1;\n" }, policy: scopedPolicy("src") })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S26.4a — the published description, read off the wire from the BUILT server", () => {
  it("`ListTools` serves the frozen `atlas-query` description byte-for-byte", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const { tools } = await session.client.listTools()
      const tool = tools.find((t) => t.name === "atlas-query")
      expect(tool, "atlas-query must be on the advertised surface").toBeDefined()
      // EQUALITY, whole string — a `toContain` here would pass on a description with the advisory half cut.
      expect(tool?.description).toBe(QUERY_DESCRIPTION)
    } finally {
      await session.close()
    }
  }, 20000)

  it("the guidance `invariant` on a real call is the two-band one, verbatim", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      expect(res.isError).toBeFalsy()
      expect(bodyOf(res).guidance?.invariant).toBe(QUERY_GUIDANCE_INVARIANT)
    } finally {
      await session.close()
    }
  }, 20000)
})

describe("S26.4b — the claim itself, stated as properties so re-freezing a lie is not silent", () => {
  it("the retired single-band promise is GONE from the published description", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const { tools } = await session.client.listTools()
      const d = tools.find((t) => t.name === "atlas-query")?.description ?? ""
      expect(d).not.toContain(THE_RETIRED_LIE) // the exact sentence an agent read as "ratified rows only"
    } finally {
      await session.close()
    }
  }, 20000)

  it("it NAMES both bands and says the advisory one passed no ratifier (ADR-0013 clause 3)", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const { tools } = await session.client.listTools()
      const d = tools.find((t) => t.name === "atlas-query")?.description ?? ""
      // the two RETURNED field names, so a caller can find each band in the payload it actually receives
      expect(d).toContain("invariants")
      expect(d).toContain("advisory")
      expect(d).toContain("advisoryDropped") // the truncation ledger — a capped set that says it was capped
      // the governance fact, in both directions: which band is ratified, and that the other is NOT
      expect(d).toMatch(/tier>=T1/)
      expect(d).toMatch(/ratified/)
      expect(d).toMatch(/NO ratifier saw/)
      // and the two freshness signals, which are different questions and both ride out
      expect(d).toContain("freshness")
      expect(d).toContain("stale")
    } finally {
      await session.close()
    }
  }, 20000)
})

describe("S26.4c — the description is TRUE of the payload, not merely pinned against itself", () => {
  it("a T1 and a T2 fact in one scope come back as TWO populated bands with the promised fields", async () => {
    const t1 = draftFact(repo, "src/foo.ts", "invariant", "foo is 1", "T1").fact
    const t2 = draftFact(repo, "src/foo.ts", "rationale", "foo may be one", "T2").fact
    for (const f of [t1, t2]) {
      const e = emitFact(repo, f)
      if (e.exitCode !== 0) throw new Error(`S26.4c setup: emit of ${f.tier} failed:\n${e.stdout}\n${e.stderr}`)
    }

    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      expect(res.isError).toBeFalsy()
      const pack = bodyOf(res).data?.pack

      // NON-VACUITY FIRST: both bands must actually have a row. An all-empty pack satisfies every claim
      // about band membership below and proves nothing — that is the shape this repo has shipped twice.
      expect(pack?.invariants ?? [], "the GOVERNING band must be non-empty").not.toHaveLength(0)
      expect(pack?.advisory ?? [], "the ADVISORY band must be non-empty").not.toHaveLength(0)

      expect(pack?.invariants?.map((r) => r.nodeId)).toContain(t1.id)
      expect(pack?.advisory?.map((r) => r.nodeId)).toContain(t2.id)
      // the bands are DISJOINT and each is exactly its declared tier — never one filtered list
      expect(pack?.invariants?.every((r) => r.tier !== "T2")).toBe(true)
      expect(pack?.advisory?.every((r) => r.tier === "T2")).toBe(true)
      expect(pack?.invariants?.map((r) => r.nodeId)).not.toContain(t2.id)
      // every row carries its OWN freshness, as the description promises (ADR-0013 clause 5)
      for (const r of [...(pack?.invariants ?? []), ...(pack?.advisory ?? [])]) {
        expect(r.freshness, `row ${r.nodeId} must carry its own freshness`).toBeTruthy()
      }
      // the truncation ledger is PRESENT (0 means "nothing dropped", never "we did not look")
      expect(typeof pack?.advisoryDropped).toBe("number")
    } finally {
      await session.close()
    }
  }, 30000)
})
