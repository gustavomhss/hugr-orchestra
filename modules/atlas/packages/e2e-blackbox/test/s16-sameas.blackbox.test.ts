// @atlas/e2e-blackbox — test/s16-sameas.blackbox.test.ts  (S16 — the governed sameAs write door, WP-SAMEAS)
//
// NARRATIVE: black-box coverage of `atlas link <a> <b>` — the SECOND governed write door (WP-SAMEAS). A
// HUMAN asserts two grounded facts at unrelated code sites name the SAME fact; the assertion is a governed
// shared-truth mutation (KNOW-11 authz on BOTH endpoints + a non-empty ratifier — v1: NOT the tier-graded
// KNOW-8 gate emit runs; deferred, safe because sameAs is non-destructive, ADR-0003), NON-destructive, and surfaces
// as a symmetric, TRANSITIVE observability edge on `atlas query` (like `subsumes`) — never a merge. Driven
// ONLY through the real doors: the `atlas` CLI subprocess + the real `atlas-mcp` stdio server.
//
// The 5 teeth:
//   T1 — an AUTHORIZED, RATIFIED link surfaces the `a ≡ b` edge on BOTH doors (CLI `sameAs` line + MCP
//        `data.sameAs`), symmetric regardless of query/argument order.
//   T2 — an UNAUTHORIZED actor (outside the nodes' scope) is REJECTED (exit 2), nothing persisted.
//   T3 — a link to an UNKNOWN nodeKey is REJECTED (exit 2), a no-op — in EITHER argument position (T3b: the
//        unknown key FIRST, which no case here reached until it was measured that deleting the door's
//        `a`-side guard left the whole suite green and turned the refusal into an uncaught TypeError).
//        [task #144] The refusal is now `unauthorized`, the SAME one an out-of-scope caller gets: a distinct
//        `unknown node` reason, resolved before authz, let any caller read node EXISTENCE off the write door.
//   T4 — TRANSITIVE fold: link A≡B and B≡C ⇒ `atlas query` also derives A≡C (union-find teeth).
//   T5 — an EMPTY ratifier is REJECTED (exit 2, 'unratified') even for an authorized actor.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"

const A_SRC = "export const a = 1;\n"
const B_SRC = "export const b = 2;\n"
const C_SRC = "export const c = 3;\n"

/** One MCP `atlas-query` sameAs edge, structurally (mirrors the knowledge `SameAs`). */
interface McpSame {
  readonly a: string
  readonly b: string
}
/** The JSON body an `ok` MCP `atlas-query` result carries (`{data:{pack,subsumes,sameAs}, guidance}`). */
interface McpText {
  data?: { sameAs?: readonly McpSame[] }
}
const textOf = (r: { content: Array<{ text?: string }> }): McpText => JSON.parse(r.content[0]?.text ?? "{}") as McpText

/** The rendered `  sameAs <a> ≡ <b>` lines of a query verdict (the observable equivalence rows). */
function sameAsLines(stdout: string): string[] {
  return stdout.split("\n").filter((l) => l.trimStart().startsWith("sameAs "))
}

let t1Repo: FixtureRepo //  T1 — authorized link + both-door parity
let transRepo: FixtureRepo //  T4 — transitive A≡B, B≡C ⇒ A≡C
let rejRepo: FixtureRepo //  T2/T3/T5 — the three rejection teeth (nothing persisted)
let priorActor: string | undefined
let priorRatify: string | undefined

// Facts emitted in setup — their `.id` is the REAL product nodeKey (the projection key `atlas link` equates).
let t1A: GroundedFact
let t1B: GroundedFact
let trA: GroundedFact
let trB: GroundedFact
let trC: GroundedFact
let rejA: GroundedFact
let rejB: GroundedFact

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR //  KNOW-11 write actor authorized on `src`
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER //  ratifier: the KNOW-8 tier gate for emits, a non-empty check for links — both commit

  const files = { "src/a.ts": A_SRC, "src/b.ts": B_SRC }
  t1Repo = makeFixtureRepo({ files, policy: scopedPolicy("src") })
  transRepo = makeFixtureRepo({ files: { ...files, "src/c.ts": C_SRC }, policy: scopedPolicy("src") })
  rejRepo = makeFixtureRepo({ files, policy: scopedPolicy("src") })

  // Emit two DISTINCT grounded facts per repo (distinct file anchors ⇒ distinct nodeKeys).
  const emit = (repo: FixtureRepo, filePath: string, claim: string): GroundedFact => {
    const fact = draftFact(repo, filePath, "invariant", claim).fact
    const e = emitFact(repo, fact)
    if (e.exitCode !== 0) throw new Error(`S16 setup: grounded emit failed for ${filePath}:\n${e.stdout}`)
    return fact
  }
  t1A = emit(t1Repo, "src/a.ts", "fact at a")
  t1B = emit(t1Repo, "src/b.ts", "fact at b")
  trA = emit(transRepo, "src/a.ts", "trans a")
  trB = emit(transRepo, "src/b.ts", "trans b")
  trC = emit(transRepo, "src/c.ts", "trans c")
  rejA = emit(rejRepo, "src/a.ts", "rej a")
  rejB = emit(rejRepo, "src/b.ts", "rej b")
})

afterAll(() => {
  t1Repo?.cleanup()
  transRepo?.cleanup()
  rejRepo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S16 — the governed sameAs write door (WP-SAMEAS)", () => {
  it("T1: an authorized, ratified link surfaces the `a ≡ b` edge on BOTH doors, symmetrically", async () => {
    // Link A ≡ B (authorized ACTOR + RATIFIER from beforeAll) — the write door commits, exit 0.
    const link = runAtlas(t1Repo.repoPath, ["link", t1A.id, t1B.id])
    expect(link.exitCode).toBe(0)
    expect(link.stdout).toContain("status: ok")
    expect(link.stdout).toContain(`linked: ${t1A.id} ≡ ${t1B.id}`)

    // CLI query surfaces exactly ONE sameAs edge carrying BOTH endpoints (canonical a<b, so order-independent).
    const q = runAtlas(t1Repo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    const lines = sameAsLines(q.stdout)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain(t1A.id)
    expect(lines[0]).toContain(t1B.id)

    // MCP parity: `atlas-query` data.sameAs carries the SAME pair (symmetric — the set holds both nodeKeys).
    const session = await mcpSession(t1Repo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      expect(res.isError).toBeFalsy()
      const edges = textOf(res as { content: Array<{ text?: string }> }).data?.sameAs ?? []
      expect(edges).toHaveLength(1)
      const pair = new Set([edges[0]!.a, edges[0]!.b])
      expect(pair).toEqual(new Set([t1A.id, t1B.id]))
    } finally {
      await session.close()
    }
  })

  it("T2: an UNAUTHORIZED actor (outside the nodes' scope) is rejected (exit 2), nothing persisted", () => {
    process.env.ATLAS_ACTOR = "intruder@nowhere" // a real, NON-scoped actor id
    try {
      const link = runAtlas(rejRepo.repoPath, ["link", rejA.id, rejB.id])
      expect(link.exitCode).toBe(2)
      expect(link.stdout).toContain("status: rejected")
      expect(link.stdout.toLowerCase()).toContain("unauthorized")
    } finally {
      process.env.ATLAS_ACTOR = ACTOR
    }
    // Nothing persisted: a follow-up query (read-only, unaffected by actor) shows NO sameAs edge.
    const q = runAtlas(rejRepo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    expect(sameAsLines(q.stdout)).toEqual([])
  })

  it("T3: a link to an UNKNOWN nodeKey is rejected (exit 2), a no-op, and does NOT confirm the key is absent", () => {
    // [task #144] This used to assert `unknown node` and that the CLI ECHOED the absent key. Both were the
    // leak: an absent endpoint had its own refusal, resolved BEFORE authz, so any caller could tell "not a
    // node" from "not yours" and read node existence off the write door at keys it can name freely. The two
    // are now one refusal — authority is carried by the row, so a key with no row has no scope and nobody
    // can be authorized over it, which makes `unauthorized` the only computable answer.
    const link = runAtlas(rejRepo.repoPath, ["link", rejA.id, "not-a-real-nodekey"])
    expect(link.exitCode).toBe(2) // a GOVERNED refusal, at the process boundary
    expect(link.stdout).toContain("status: rejected")
    expect(link.stdout.toLowerCase()).toContain("unauthorized")
    expect(link.stdout).not.toContain("unknown node") // the existence discriminant is GONE, not renamed
    expect(link.stdout).not.toContain("not-a-real-nodekey") // …and the probed key is not echoed back
    // Still nothing persisted.
    const q = runAtlas(rejRepo.repoPath, ["query", "src"])
    expect(sameAsLines(q.stdout)).toEqual([])
  })

  it("T3b: the MIRROR — an unknown FIRST endpoint is refused identically, and the CLI does not crash", () => {
    // This position was untested on BOTH doors: the unit case (SCN-GL-2) and T3 above each put the unknown
    // key SECOND, so the door's `a`-side guard was pinned by nothing. Deleting it left 221 files / 1614
    // tests green while turning `atlas link` into an uncaught `TypeError: Cannot read properties of
    // undefined (reading 'contentHash')`. Through the REAL CLI that is the difference between a governed
    // refusal and a stack trace on the operator's terminal, so it is pinned HERE as well as at the unit.
    const link = runAtlas(rejRepo.repoPath, ["link", "not-a-real-nodekey", rejB.id])
    expect(link.exitCode).toBe(2) // a GOVERNED refusal — not the crash exit code, and not 0
    expect(link.stdout).toContain("status: rejected")
    expect(link.stdout.toLowerCase()).toContain("unauthorized") // [task #144] folded; see T3
    expect(link.stdout).not.toContain("unknown node")
    expect(link.stdout).not.toContain("not-a-real-nodekey")

    // TOTALITY at the PROCESS boundary, and this is what the mutant actually does — MEASURED, not imagined.
    // The crash does NOT reach stderr (stderr is empty; an earlier draft asserted on it and that assertion
    // passed under the mutant, i.e. it was vacuous, and was removed). The CLI's outer catch swallows the
    // TypeError and re-labels it:
    //     status: error
    //     reason: malformed args — fail-closed: Cannot read properties of undefined (reading 'contentHash')
    // …at exit 1. So the door's own bug is reported to the operator as THE CALLER'S malformed input, which
    // is worse than a crash: it is a crash wearing a governance verdict. Both assertions below fire on it.
    expect(link.stdout).not.toContain("malformed args")
    expect(link.stdout).not.toContain("Cannot read properties")
    // Still nothing persisted.
    const q = runAtlas(rejRepo.repoPath, ["query", "src"])
    expect(sameAsLines(q.stdout)).toEqual([])
  })

  it("T4: TRANSITIVE fold — link A≡B and B≡C ⇒ `atlas query` also derives A≡C (union-find)", () => {
    const l1 = runAtlas(transRepo.repoPath, ["link", trA.id, trB.id])
    expect(l1.exitCode).toBe(0)
    const l2 = runAtlas(transRepo.repoPath, ["link", trB.id, trC.id])
    expect(l2.exitCode).toBe(0)

    const q = runAtlas(transRepo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    const lines = sameAsLines(q.stdout)
    // A 3-node equivalence class emits ALL three canonical pairs: A≡B, A≡C, B≡C.
    expect(lines).toHaveLength(3)
    const joined = lines.join("\n")
    // The TRANSITIVE edge A≡C — never linked directly — must be present (the union-find teeth).
    const hasPair = (x: string, y: string): boolean => lines.some((l) => l.includes(x) && l.includes(y))
    expect(hasPair(trA.id, trC.id)).toBe(true)
    expect(hasPair(trA.id, trB.id)).toBe(true)
    expect(hasPair(trB.id, trC.id)).toBe(true)
    void joined
  })

  it('T5: an EMPTY ratifier is rejected (exit 2, "unratified") even for an authorized actor', () => {
    process.env.ATLAS_RATIFY_TOKEN = "" // authorized actor, but NO ratifier
    try {
      const link = runAtlas(rejRepo.repoPath, ["link", rejA.id, rejB.id])
      expect(link.exitCode).toBe(2)
      expect(link.stdout).toContain("status: rejected")
      expect(link.stdout).toContain("unratified")
    } finally {
      process.env.ATLAS_RATIFY_TOKEN = RATIFIER
    }
    // Still nothing persisted.
    const q = runAtlas(rejRepo.repoPath, ["query", "src"])
    expect(sameAsLines(q.stdout)).toEqual([])
  })
})
