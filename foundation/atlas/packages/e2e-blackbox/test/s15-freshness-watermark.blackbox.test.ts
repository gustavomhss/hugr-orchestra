// @atlas/e2e-blackbox — test/s15-freshness-watermark.blackbox.test.ts  (S15 — N11 honest freshness watermark)
//
// NARRATIVE: the honest read-model watermark. `atlas query`'s `stale` flag (TOOLS-6: "MUST mean re-ground
// before trusting") used to fire ONLY on a stored per-fact `freshness === 'DRIFTED'` bit — which nothing on
// the live path writes back — so between a code change at HEAD and the next `atlas reconcile` the read
// SILENTLY claimed `stale: false`. N11 closes that honesty gap: the projection is stamped at persist with the
// HEAD its freshness reflects (`builtAt`), and a query cheaply compares it to LIVE HEAD (`git rev-parse HEAD`,
// NO worktree — never the reconcile oracle's contention surface). When the view is BEHIND HEAD the read is
// honestly `stale`, driving the user to reconcile — without turning every query into a live re-derivation.
//
// TEETH (isolation): ONE repo, ONE fact. The ONLY difference between the `stale: false` read and the
// `stale: true` read is a single commit that advances HEAD past the emit-time watermark. The fact is FRESH
// throughout (freshness never mutated), so the per-fact drift fold contributes `false` at both reads — the
// flip is attributable to the behind-HEAD watermark ALONE. Proven on BOTH doors: the CLI `  stale:` line and
// the MCP `data.pack.stale` boolean (the watermark rides the pack envelope, not just the rendered text).
//
// Driven ONLY through the real doors — the `atlas` CLI subprocess + the real `atlas-mcp` stdio server.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"
import { draftFact } from "./support.js"

const SRC = "export const foo = 1;\n"
const MORE = "export const bar = 2;\n"

/** The `data.pack` an `ok` MCP `atlas-query` result carries (`stale` + the invariant rows). */
interface McpPack {
  readonly stale?: boolean
  readonly invariants?: readonly { readonly nodeId: string }[]
}
const packOf = (r: { content: Array<{ text?: string }> }): McpPack | undefined =>
  (JSON.parse(r.content[0]?.text ?? "{}") as { data?: { pack?: McpPack } }).data?.pack

let repo: FixtureRepo
let priorActor: string | undefined
let priorRatify: string | undefined
let factId: string

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // KNOW-8 ratifier — the T1 fact routes to full-ratify

  repo = makeFixtureRepo({ files: { "src/foo.ts": SRC }, policy: scopedPolicy("src") })
  // Emit ONE FRESH grounded fact at genesis HEAD — the store stamps `builtAt = HEAD-at-persist` (N11).
  const fact = draftFact(repo, "src/foo.ts", "invariant", "foo is one").fact
  factId = fact.id as unknown as string
  const e = emitFact(repo, fact)
  if (e.exitCode !== 0) throw new Error(`S15 setup: grounded emit failed:\n${e.stdout}`)
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S15 — N11 honest freshness watermark (query.stale reflects behind-HEAD, not just stored-drifted)", () => {
  it("AT HEAD: the fact is served and the pack is HONESTLY fresh (builtAt == HEAD ⇒ stale: false)", () => {
    const r = runAtlas(repo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    expect(invLines(r.stdout)).toEqual([`  inv T1 ${factId} [FRESH]: foo is one`]) // the fact IS present
    expect(r.stdout).toContain("  stale: false") // watermark == HEAD ⇒ verified fresh, not a false alarm
  })

  it("AFTER HEAD ADVANCES: the SAME still-FRESH fact packs stale: true (behind-HEAD ⇒ unverified)", () => {
    // The ONLY change vs the read above — one commit that moves HEAD past the emit-time watermark. The fact
    // itself is untouched (still FRESH, still grounded at the unchanged src/foo.ts), so the flip is the
    // behind-HEAD watermark ALONE, never the per-fact drift fold.
    const before = repo.sha()
    const after = repo.commit({ "src/bar.ts": MORE })
    expect(after).not.toBe(before) // HEAD genuinely advanced

    const r = runAtlas(repo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    expect(invLines(r.stdout)).toEqual([`  inv T1 ${factId} [FRESH]: foo is one`]) // STILL served — behind ≠ gone
    expect(r.stdout).toContain("  stale: true") // N11: the view is behind HEAD ⇒ honestly re-ground first
  })

  it("MCP door parity: the behind-HEAD stale rides the pack envelope (data.pack.stale === true), not just CLI text", async () => {
    // HEAD is already past the watermark (previous `it` committed) — the MCP read must agree with the CLI.
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      expect(res.isError).toBeFalsy()
      const pack = packOf(res as { content: Array<{ text?: string }> })
      expect(pack?.invariants?.some((i) => i.nodeId === factId)).toBe(true) // served on the MCP door too
      expect(pack?.stale).toBe(true) // the watermark is a pack field, identical across both doors
    } finally {
      await session.close()
    }
  })
})
