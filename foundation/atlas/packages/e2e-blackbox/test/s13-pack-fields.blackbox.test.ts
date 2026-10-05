// @atlas/e2e-blackbox — test/s13-pack-fields.blackbox.test.ts  (S13 — query PACK envelope fields WAVE-COV-1)
//
// NARRATIVE: black-box coverage of the fields riding the `atlas query <scope>` pack envelope that the other
// stories touch only in passing — `stale`, the advisory `tokenEstimate`, the `underScope` segment boundary,
// and the cover-miss (unknown-scope) totality corner. Driven ONLY through the real doors: the `atlas` CLI
// subprocess + the real `atlas-mcp` stdio server (both doors render `tokenEstimate` — CLI/MCP parity, N12 — see S13b).
//
// SOTA invariants pinned:
//   - `stale` is a PURE function of the CURRENT persisted fact set's `freshness` (projection-query-index.ts
//     ~48-67): ANY under-scope current fact `freshness === 'DRIFTED'` flips the WHOLE pack stale.
//   - `tokenEstimate` (tools/src/query.ts ~50-51) is an ADVISORY char-count proxy — `atlas query` NEVER
//     truncates on it. The hard ~2K budget belongs to a DIFFERENT, unit-owned consumer (the retrieval
//     Packer, `packages/retrieval/src/pack.ts` `PACK_CAP=2000`) that `atlas query` never reaches.
//   - `underScope` (projection-query-index.ts ~27-34) is a SEGMENT-WISE prefix test on the anchor's file-path
//     portion, NOT a raw `startsWith` — a real sibling territory whose name is a substring prefix of another
//     (`sr` vs `src`) must NOT leak the other's facts.
//   - a cover-miss (unknown scope) is a `error` (exit 1), NOT a governed `rejected` (exit 2) — `rejected` is
//     reserved for governed refusals (ungrounded/unauthorized/unratified/semantic-drift), never a bad scope
//     string (map.ts `deriveStatus` ~60-66).

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"

const SRC = "export const foo = 1;\n"
const SRC2 = "export const bar = 2;\n"

/** One MCP `atlas-query` invariant row, structurally (mirrors `PackInvariant`). */
interface McpInv {
  readonly nodeId: string
  readonly tier: string
  readonly claim: string
}
/** The JSON body an `ok` MCP `atlas-query` result carries (`{data:{pack,subsumes}, guidance}`). */
interface McpText {
  data?: { pack?: { invariants?: readonly McpInv[]; tokenEstimate?: number; stale?: boolean } }
}
const textOf = (r: { content: Array<{ text?: string }> }): McpText => JSON.parse(r.content[0]?.text ?? "{}") as McpText

/** A raw Node crash signature on stderr — "graceful" means NEITHER banner nor stack frame escaped. */
function hasCrashTrace(stderr: string): boolean {
  return /\bError:/.test(stderr) || /\n\s+at\s.+:\d+:\d+/.test(stderr) || /Node\.js v\d/.test(stderr)
}

let staleRepo: FixtureRepo //  isolates the `stale` story
let tokenRepo: FixtureRepo //  isolates the `tokenEstimate` story
let scopeRepo: FixtureRepo //  TWO real top-level territories (`src` + `sr`) — underScope + cover-miss
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // KNOW-8 ratifier — T1 facts route to full-ratify

  staleRepo = makeFixtureRepo({ files: { "src/foo.ts": SRC }, policy: scopedPolicy("src") })
  tokenRepo = makeFixtureRepo({ files: { "src/foo.ts": SRC }, policy: scopedPolicy("src") })
  // `sr/` is a REAL sibling top-level dir of `src/` — a substring PREFIX of `src`'s name, not a sub-path of
  // it — so it resolves as its OWN covering territory (never a cover-miss), letting S13c prove the exclusion
  // is `underScope`'s segment-wise filter, not a resolve failure.
  scopeRepo = makeFixtureRepo({ files: { "src/foo.ts": SRC, "sr/other.ts": SRC2 }, policy: scopedPolicy("src") })
})

afterAll(() => {
  staleRepo?.cleanup()
  tokenRepo?.cleanup()
  scopeRepo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S13a — stale: a pure function of the CURRENT fact set (projection-query-index.ts ~48-67)", () => {
  it("baseline: a FRESH grounded fact packs `stale: false`", () => {
    const fact = draftFact(staleRepo, "src/foo.ts", "invariant", "foo baseline").fact
    const e = emitFact(staleRepo, fact)
    if (e.exitCode !== 0) throw new Error(`S13a setup: grounded emit failed:\n${e.stdout}`)

    const r = runAtlas(staleRepo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    expect(invLines(r.stdout)).toEqual([`  inv T1 ${fact.id} [FRESH]: foo baseline`])
    expect(r.stdout).toContain("  stale: false")
  })

  it("a DRIFTED under-scope current fact flips the WHOLE pack `stale: true`", () => {
    // GROUNDED, not assumed: `atlas reconcile` is READ-ONLY (TOOLS-8, "Persists NOTHING") and never rewrites
    // an already-persisted fact's `freshness` field; `atlas query` reads that field VERBATIM off the CAS
    // bytes `governed-emit.ts` put at emit time (the whole submitted `node`, unmodified). There is NO code
    // path where mutating a fixture file AFTER emit flips an already-persisted fact's stale bit — the truth
    // gate (`gateHolds`) re-derives ONLY the grounding citation, never reads `freshness` (TOOLS-7b), so a
    // fact that is STILL grounded but authored with `freshness: 'DRIFTED'` is admitted verbatim. This is the
    // honest way to demonstrate the `stale` fold from the black-box doors — see the ANY-finding note below.
    const base = draftFact(staleRepo, "src/foo.ts", "rationale", "foo drifted-signal").fact
    const drifted: GroundedFact = { ...base, freshness: "DRIFTED" }
    const e = emitFact(staleRepo, drifted)
    expect(e.exitCode).toBe(0) // still grounded (re-derives) ⇒ still admitted — freshness is not a gate input

    const r = runAtlas(staleRepo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    // BOTH facts are present — the prior FRESH baseline (still individually fine) and the new DRIFTED one —
    // but the pack-level flag is an ANY-fold over the whole under-scope set: one drifted fact is enough to
    // flip the WHOLE envelope stale (never a per-invariant flag on the rendered row itself).
    expect(r.stdout).toContain(`inv T1 ${drifted.id} [FRESH]: foo drifted-signal`)
    expect(r.stdout).toContain(": foo baseline") // the prior test's FRESH fact is still served individually
    expect(r.stdout).toContain("  stale: true")
  })
})

describe("S13b — tokenEstimate: an ADVISORY char-sum proxy, NEVER truncated on the query path (tools/src/query.ts ~50-51)", () => {
  it("reports a positive char-sum over the merged claims (rendered on BOTH the CLI and MCP doors)", async () => {
    const claim = "foo is one"
    const fact = draftFact(tokenRepo, "src/foo.ts", "invariant", claim).fact
    const e = emitFact(tokenRepo, fact)
    if (e.exitCode !== 0) throw new Error(`S13b setup: grounded emit failed:\n${e.stdout}`)

    // CLI door: the fact IS visible (inv line) AND `tokenEstimate` now rides the CLI's rendered stdout too —
    // `render.ts`'s query-envelope block emits a `  tokenEstimate: <n>` line (N12 closed: CLI/MCP surface
    // parity; before the fix the CLI omitted it, a real surface gap this story originally documented).
    const cli = runAtlas(tokenRepo.repoPath, ["query", "src"])
    expect(cli.exitCode).toBe(0)
    expect(invLines(cli.stdout)).toEqual([`  inv T1 ${fact.id} [FRESH]: ${claim}`])
    expect(cli.stdout).toContain(`tokenEstimate: ${claim.length}`) // N12 parity: CLI now renders it (= MCP)

    // MCP door: the raw verdict `data.pack` DOES carry `tokenEstimate` (`server.ts` JSON-stringifies the
    // whole `data`) — this is the ONLY black-box door where the field is actually observable.
    const session = await mcpSession(tokenRepo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      expect(res.isError).toBeFalsy()
      const pack = textOf(res as { content: Array<{ text?: string }> }).data?.pack
      expect(pack?.invariants).toEqual([{ nodeId: fact.id, tier: "T1", claim, freshness: "FRESH" }])
      expect(pack?.tokenEstimate).toBe(claim.length) // = sum of invariant claim.length (tools/query.ts:50-51)
      expect(pack?.tokenEstimate).toBeGreaterThan(0)
    } finally {
      await session.close()
    }
  })

  it("NO truncation on the atlas-query path: a claim far past the retrieval Packer's ~2K cap is served WHOLE", async () => {
    // Deliberately exceeds `packages/retrieval/src/pack.ts` `PACK_CAP=2000` — a DIFFERENT, unit-owned
    // consumer `atlas query` never reaches (the memory-injection Packer, not this read door).
    const bigClaim = "x".repeat(2500)
    const fact = draftFact(tokenRepo, "src/foo.ts", "rationale", bigClaim).fact
    const e = emitFact(tokenRepo, fact)
    if (e.exitCode !== 0) throw new Error(`S13b setup: grounded emit failed:\n${e.stdout}`)

    // CLI: the full 2500-char claim rides the rendered inv line byte-for-byte — no ellipsis, no head/tail.
    const cli = runAtlas(tokenRepo.repoPath, ["query", "src"])
    expect(cli.exitCode).toBe(0)
    expect(cli.stdout).toContain(`inv T1 ${fact.id} [FRESH]: ${bigClaim}`)
    expect(cli.stdout).not.toContain("…")

    // MCP: the claim is served whole (length unchanged) and the advisory tokenEstimate now exceeds the ~2K
    // bound the retrieval Packer enforces ELSEWHERE — `atlas query` reports it, never truncates against it.
    const session = await mcpSession(tokenRepo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      const pack = textOf(res as { content: Array<{ text?: string }> }).data?.pack
      const row = pack?.invariants?.find((i) => i.nodeId === fact.id)
      expect(row?.claim.length).toBe(2500) // served WHOLE — not truncated at the query door
      expect(pack?.tokenEstimate).toBeGreaterThan(2000) // exceeds the ~2K bound — no cap applied here
    } finally {
      await session.close()
    }
  })
})

describe("S13c — underScope: a SEGMENT-WISE boundary, NOT raw startsWith (projection-query-index.ts ~27-34)", () => {
  let anchored: GroundedFact

  beforeAll(() => {
    anchored = draftFact(scopeRepo, "src/foo.ts", "invariant", "anchored under src").fact
    const e = emitFact(scopeRepo, anchored)
    if (e.exitCode !== 0) throw new Error(`S13c setup: grounded emit failed:\n${e.stdout}`)
  })

  it("scope `src` covers the `src/foo.ts`-anchored fact (exact segment match)", () => {
    const r = runAtlas(scopeRepo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    expect(invLines(r.stdout)).toEqual([`  inv T1 ${anchored.id} [FRESH]: anchored under src`])
  })

  it("scope `sr` — a REAL sibling territory that is a substring PREFIX of `src` — does NOT leak the src-anchored fact", () => {
    // `sr` resolves to its OWN real territory (the `sr/` fixture dir) — NEVER a cover-miss — so a NON-empty
    // `status: ok` here with an EMPTY pack proves the exclusion is the projection's segment-wise `underScope`
    // filter, not a resolve failure. A raw `'src/foo.ts'.startsWith('sr')` would have WRONGLY included it.
    const r = runAtlas(scopeRepo.repoPath, ["query", "sr"])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("status: ok")
    expect(invLines(r.stdout)).toEqual([]) // excluded by the segment boundary, not a substring prefix
    expect(r.stdout).toContain("  stale: false") // a valid (if empty) pack, not an error envelope
  })
})

describe("S13d — cover-miss: an unknown scope is `error` (exit 1), NOT a governed `rejected` (map.ts ~60-66)", () => {
  it("`atlas query nonesuch-scope` → exit 1, `status: error`, the cover-miss reason verbatim, no crash trace", () => {
    const r = runAtlas(scopeRepo.repoPath, ["query", "nonesuch-scope"])
    // `index-adapter.ts` ~65-79 throws `cover: no covering territory for scope …` when `resolve` misses; the
    // handler catches it (~169-172) into a structured `ok:false` verdict with NO `emitted`/`exitCode` data
    // field, so `map.ts` `deriveStatus` (~60-66) classifies it `error` — `rejected` is reserved for governed
    // refusals (ungrounded / unauthorized / unratified / semantic-drift), never a bad scope string.
    expect(r.exitCode).toBe(1)
    expect(hasCrashTrace(r.stderr)).toBe(false)
    expect(r.stdout).toContain("status: error")
    expect(r.stdout).not.toContain("status: rejected")
    expect(r.stdout).toMatch(/^reason: .+$/m)
    expect(r.stdout).toContain("cover: no covering territory for scope nonesuch-scope") // the thrown reason, verbatim
  })
})
