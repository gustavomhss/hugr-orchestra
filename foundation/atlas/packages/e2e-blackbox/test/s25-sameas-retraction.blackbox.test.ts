// @atlas/e2e-blackbox — test/s25-sameas-retraction.blackbox.test.ts  (S25 — sameAs RETRACTION, A-D3 / #83)
//
// NARRATIVE: a human retracts a `sameAs` equivalence they should never have asserted. Before this, a wrong
// link was PERMANENT and — because the fold is a union-find — transitively contagious on every read forever
// (A-D3). Retraction is a MODE of the EXISTING governed door (`atlas link <a> <b> --retract` / MCP
// `atlas-link {a,b,retract:true}`); `GOVERNANCE_SURFACE`/`WRITE_PATHS` are untouched by THIS mode.
//
// Driven ONLY through the real doors — the `atlas` CLI subprocess and the real `atlas-mcp` stdio server —
// because the property that matters here is END-TO-END: the retraction must travel the marshaller, the
// published schema, the door, the atomic commit, the durable sidecar AND the read fold. A unit test over the
// reducer proves none of that.
//
// The teeth:
//   T1 — THE SPLIT, end to end. Chain A≡B≡C; retract B—C; `atlas query` then derives {A,B} and {C} — the
//        transitive A≡C edge is GONE and A≡B survives. This is the tooth the whole task exists for: a
//        retraction door that leaves the class merged retracts nothing.
//   T2 — APPEND, NEVER DELETE. The retraction is recorded on disk ALONGSIDE the assertion, so the store can
//        still say the equivalence was once asserted.
//   T3 — TRANSPORT PARITY. The same retraction is refused on CLI and on MCP with the SAME discriminant, and
//        the refusal is fail-closed-VISIBLE on both (CLI exit 2 + `status: rejected`, MCP `isError`).
//   T4 — the refusal vocabulary over the real doors: `not-linked`, `already-retracted`, `retracted-pair`.
//   T5 — MCP advertises the mode: the published `atlas-link` schema declares `retract`, and a NON-boolean
//        `retract` is `malformed-args` (the caller's fault) rather than a silently-ignored assertion.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"
import { draftFact } from "./support.js"

const SRC = {
  "src/a.ts": "export const a = 1;\n",
  "src/b.ts": "export const b = 2;\n",
  "src/c.ts": "export const c = 3;\n",
}

/** The rendered `  sameAs <a> ≡ <b>` lines of a query verdict. */
const sameAsLines = (stdout: string): string[] => stdout.split("\n").filter((l) => l.trimStart().startsWith("sameAs "))

/** Does the rendered edge set contain the pair {x,y}? (canonical a<b, so order-independent). */
const hasPair = (lines: readonly string[], x: string, y: string): boolean =>
  lines.some((l) => l.includes(x) && l.includes(y))

interface McpBody {
  readonly rejected?: string
  readonly fault?: string
  readonly data?: { readonly retracted?: boolean; readonly linked?: boolean }
}
const bodyOf = (r: { content: Array<{ text?: string }> }): McpBody => JSON.parse(r.content[0]?.text ?? "{}") as McpBody

/** THE DISCRIMINANT of a refusal — everything before the first `:`. The SAME rule `@atlas/tools` `fault.ts`
 *  and `adapter-io/test/door-regression-support.ts` use, and it is compared by EQUALITY here for the reason
 *  recorded there: these refusal texts quote one another's concepts, so a substring assertion is vacuous in
 *  one direction and cannot see a mutant that swaps one refusal for another. */
const discriminantOf = (s: string): string => s.split(":")[0]!.trim()

/** The `reason: <…>` line the CLI renders for a rejected verdict, discriminant only. */
function cliDiscriminant(stdout: string): string {
  const line = stdout.split("\n").find((l) => l.trimStart().startsWith("reason:")) ?? ""
  return discriminantOf(line.replace(/^\s*reason:\s*/, ""))
}

let splitRepo: FixtureRepo //  T1/T2 — the chain that must split
let refuseRepo: FixtureRepo // T3/T4/T5 — the refusal vocabulary
let priorActor: string | undefined
let priorRatify: string | undefined

let sA: GroundedFact
let sB: GroundedFact
let sC: GroundedFact
let rA: GroundedFact
let rB: GroundedFact

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER

  splitRepo = makeFixtureRepo({ files: SRC, policy: scopedPolicy("src") })
  refuseRepo = makeFixtureRepo({ files: SRC, policy: scopedPolicy("src") })

  const emit = (repo: FixtureRepo, filePath: string, claim: string): GroundedFact => {
    const fact = draftFact(repo, filePath, "invariant", claim).fact
    const e = emitFact(repo, fact)
    if (e.exitCode !== 0) throw new Error(`S25 setup: grounded emit failed for ${filePath}:\n${e.stdout}`)
    return fact
  }
  sA = emit(splitRepo, "src/a.ts", "split a")
  sB = emit(splitRepo, "src/b.ts", "split b")
  sC = emit(splitRepo, "src/c.ts", "split c")
  rA = emit(refuseRepo, "src/a.ts", "refuse a")
  rB = emit(refuseRepo, "src/b.ts", "refuse b")
})

afterAll(() => {
  splitRepo?.cleanup()
  refuseRepo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S25 — sameAs retraction through the real doors (A-D3 / task #83)", () => {
  it("T1: THE SPLIT — chain A≡B≡C, retract B—C, and `atlas query` derives {A,B} and {C}", () => {
    // Build the chain through the real write door and confirm the CONTAGION first — without this the split
    // assertion below would be satisfiable by a query that simply returns nothing.
    expect(runAtlas(splitRepo.repoPath, ["link", sA.id, sB.id]).exitCode).toBe(0)
    expect(runAtlas(splitRepo.repoPath, ["link", sB.id, sC.id]).exitCode).toBe(0)

    const before = sameAsLines(runAtlas(splitRepo.repoPath, ["query", "src"]).stdout)
    expect(before).toHaveLength(3) // one class of 3 ⇒ all three canonical pairs
    expect(hasPair(before, sA.id, sC.id)).toBe(true) // the TRANSITIVE edge nobody asserted

    // Retract the ONE bridge between {A,B} and {C}.
    const retract = runAtlas(splitRepo.repoPath, ["link", sB.id, sC.id, "--retract"])
    expect(retract.exitCode).toBe(0)
    expect(retract.stdout).toContain("status: ok")
    // The CLI renders a RETRACTION with its own verb + symbol, never the `linked: a ≡ b` line — a human must
    // never read a withdrawal as an assertion.
    expect(retract.stdout).toContain(`retracted: ${sB.id} ≢ ${sC.id}`)
    expect(retract.stdout).not.toContain("linked:")

    const after = sameAsLines(runAtlas(splitRepo.repoPath, ["query", "src"]).stdout)
    expect(after).toHaveLength(1) //                         the class SPLIT
    expect(hasPair(after, sA.id, sB.id)).toBe(true) //        {A,B} survives — retraction removes ONE edge…
    expect(hasPair(after, sB.id, sC.id)).toBe(false) //       …the retracted one…
    expect(hasPair(after, sA.id, sC.id)).toBe(false) //       …and the transitive edge it carried.
  })

  it("T2: APPEND, NEVER DELETE — the durable store still records that the equivalence was asserted", async () => {
    // Read the projection back through a REAL door (MCP `atlas-query`), not by parsing the sidecar by hand:
    // the assertion must survive as product-visible state, and the derived relation must not.
    // (T1 has already retracted B—C in this repo.)
    const session = await mcpSession(splitRepo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      expect(res.isError).toBeFalsy()
      const text = (res as { content: Array<{ text?: string }> }).content[0]?.text ?? ""
      // The withdrawn pair is NOT in the derived relation…
      const edges = (JSON.parse(text) as { data?: { sameAs?: Array<{ a: string; b: string }> } }).data?.sameAs ?? []
      expect(edges.some((e) => new Set([e.a, e.b]).size === 2 && [e.a, e.b].includes(sC.id))).toBe(false)
      expect(edges).toHaveLength(1)
    } finally {
      await session.close()
    }
    // …and the door proves the record survives by REFUSING a second retraction as `already-retracted`
    // rather than as `not-linked`: it can only tell those two apart because the assertion is still on the row.
    const again = runAtlas(splitRepo.repoPath, ["link", sB.id, sC.id, "--retract"])
    expect(again.exitCode).toBe(2)
    expect(cliDiscriminant(again.stdout)).toBe("already-retracted")
  })

  it("T3: TRANSPORT PARITY — CLI and MCP refuse the same retraction with the same discriminant", async () => {
    // `rA ≡ rB` was never asserted in this repo, so both doors must answer `not-linked`.
    const cli = runAtlas(refuseRepo.repoPath, ["link", rA.id, rB.id, "--retract"])
    expect(cli.exitCode).toBe(2) // fail-closed VISIBLE on the CLI
    expect(cli.stdout).toContain("status: rejected")
    const cliReason = cliDiscriminant(cli.stdout)

    const session = await mcpSession(refuseRepo.repoPath)
    try {
      const res = await session.client.callTool({
        name: "atlas-link",
        arguments: { a: rA.id, b: rB.id, retract: true },
      })
      expect(res.isError).toBe(true) // fail-closed VISIBLE on MCP
      const body = bodyOf(res as { content: Array<{ text?: string }> })
      expect(discriminantOf(body.rejected ?? "")).toBe(cliReason) // EQUALITY, not substring
      expect(body.fault).toBe("refused") // a governed refusal, not malformed args and not our crash
    } finally {
      await session.close()
    }
    expect(cliReason).toBe("not-linked")
  })

  it("T4: the refusal vocabulary over the real doors — not-linked / retracted-pair / already-retracted", () => {
    // (T3 has already established `not-linked` for this pair.) Now assert it, retract it, and walk the rest.
    expect(runAtlas(refuseRepo.repoPath, ["link", rA.id, rB.id]).exitCode).toBe(0)
    expect(runAtlas(refuseRepo.repoPath, ["link", rA.id, rB.id, "--retract"]).exitCode).toBe(0)

    // RE-ASSERT a retracted pair — refused. Without this gate the door would report `linked: true` for a
    // structural no-op the read fold goes on ignoring, which is a write door lying about its own effect.
    const reassert = runAtlas(refuseRepo.repoPath, ["link", rA.id, rB.id])
    expect(reassert.exitCode).toBe(2)
    expect(cliDiscriminant(reassert.stdout)).toBe("retracted-pair")

    // …and the read fold agrees: no edge is served for the retracted pair.
    expect(sameAsLines(runAtlas(refuseRepo.repoPath, ["query", "src"]).stdout)).toEqual([])

    // A SECOND retraction — refused, distinctly.
    const again = runAtlas(refuseRepo.repoPath, ["link", rA.id, rB.id, "--retract"])
    expect(again.exitCode).toBe(2)
    expect(cliDiscriminant(again.stdout)).toBe("already-retracted")
  })

  it("T5: MCP advertises the mode, and a NON-boolean `retract` is the caller's malformed input", async () => {
    const session = await mcpSession(refuseRepo.repoPath)
    try {
      const listed = await session.client.listTools()
      const link = listed.tools.find((t) => t.name === "atlas-link")
      const props = (link?.inputSchema as { properties?: Record<string, { type?: string }> } | undefined)?.properties
      expect(props?.retract?.type).toBe("boolean") // the mode is PUBLISHED, not a hidden argument
      // `required` is unchanged — retraction never became a required argument of the assertion path.
      expect((link?.inputSchema as { required?: string[] } | undefined)?.required).toEqual(["a", "b"])

      const res = await session.client.callTool({
        name: "atlas-link",
        arguments: { a: rA.id, b: rB.id, retract: "yes" }, // a STRING where the schema declares a boolean
      })
      expect(res.isError).toBe(true)
      const body = bodyOf(res as { content: Array<{ text?: string }> })
      // ATTRIBUTED as the caller's arguments — NOT silently ignored (which would have run an ASSERTION the
      // caller did not ask for), and NOT filed as a defect of ours.
      expect(body.fault).toBe("malformed-args")
      expect(discriminantOf(body.rejected ?? "")).toBe("malformed-args")
    } finally {
      await session.close()
    }
  })
})
