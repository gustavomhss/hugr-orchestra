// @atlas/cli — test/mine-grounding-scrub.test.ts  (#222 — defense-in-depth: the grounding-anchor CAS surface)
//
// `mine-decide.ts` scrubs a mined fact's identity-bearing legs (claimNorm / check / endpointA·B / target·scope)
// before `id(f)` and PUTs the whole fact into CAS. #222 closes the LAST free-text leg the earlier scrubs did not
// cover: the grounding's `anchor.qualifiedPath` and human `path`. A mined advisory/predicate/relation carries
// `grounding = reground(cand.site)` (mine-gate.ts), so those two strings ride into CAS through `puts.push(f)`.
// They are DERIVED FROM THE STRUCTURAL FRONTIER (`cand.site`), not model output, so this is DEFENSE-IN-DEPTH, not
// a measured live leak — but KNOW-11 ("nothing credential-shaped reaches CAS raw") must hold on every leg.
//
// RUNTIME teeth (probe the behaviour, not the AST): a fact whose grounding qualifiedPath/path carry a github
// token shape stages with the token REDACTED — on the minted fact AND in the CAS `put` bytes — while the
// structural `subtreeHash` (the drift oracle) is left intact.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import { emptyStore } from "@atlas/knowledge"
import type { AdvisoryNode } from "@atlas/knowledge"
import type { Grounding } from "@atlas/grounding"
import type { Fact } from "@atlas/genesis"
import { decideStaging } from "../src/mine-decide.js"
import { scrubGrounding } from "../src/mine-claim-scrub.js"

// A github-token shape (`ghp_` + >= 6 body chars) — `@atlas/persist` `scrub` redacts it to `[REDACTED]`.
const TOKEN = "ghp_deadbeefcafe1234"
const HASH = asSubtreeHash("sh-structural") // the drift oracle — must survive the scrub untouched

/** An advisory fact whose grounding carries the token in BOTH free-text legs (qualifiedPath + human path). */
const poisonedFact = (): Fact =>
  ({
    kind: "advisory",
    id: asNodeKey("SHOULD-BE-REMINTED"),
    tier: "T2",
    claimNorm: "a benign advisory claim with no secret",
    grounding: {
      entries: [
        {
          anchor: { kind: "symbol", qualifiedPath: `src/${TOKEN}/x.ts::f`, subtreeHash: HASH },
          path: `src/${TOKEN}/x.ts`,
        },
      ],
    } satisfies Grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }) satisfies AdvisoryNode as unknown as Fact

describe("scrubGrounding — the grounding free-text legs are redacted, the drift oracle is not (#222)", () => {
  it("redacts anchor.qualifiedPath AND path, and leaves subtreeHash + kind intact", () => {
    const g: Grounding = {
      entries: [{ anchor: { kind: "symbol", qualifiedPath: `a/${TOKEN}/b`, subtreeHash: HASH }, path: `a/${TOKEN}/b` }],
    }
    const out = scrubGrounding(g)
    expect(out.entries[0]!.anchor.qualifiedPath).not.toContain(TOKEN)
    expect(out.entries[0]!.anchor.qualifiedPath).toContain("[REDACTED]")
    expect(out.entries[0]!.path).not.toContain(TOKEN)
    // the structural hash + kind carry no credential shape and are load-bearing — left byte-for-byte.
    expect(String(out.entries[0]!.anchor.subtreeHash)).toBe(String(HASH))
    expect(out.entries[0]!.anchor.kind).toBe("symbol")
  })

  it("a non-secret grounding passes through byte-identical — scrub is a no-op with no credential shape", () => {
    const g: Grounding = {
      entries: [
        { anchor: { kind: "file", qualifiedPath: "src/pay/charge.ts", subtreeHash: HASH }, path: "src/pay/charge.ts" },
      ],
    }
    expect(scrubGrounding(g)).toStrictEqual(g)
  })
})

describe("decideStaging — a poisoned grounding never reaches CAS raw (#222 runtime teeth)", () => {
  it("THE TEETH: the staged fact + its CAS bytes carry NO raw token in the grounding legs", () => {
    const dec = decideStaging(emptyStore(), [poisonedFact()], new Map())

    // the minted fact the report/readback sees.
    const staged = [...dec.out.values()][0]! as unknown as { grounding: Grounding }
    expect(staged.grounding.entries[0]!.anchor.qualifiedPath).not.toContain(TOKEN)
    expect(staged.grounding.entries[0]!.path).not.toContain(TOKEN)
    // the drift oracle survived — grounding still resolves structurally.
    expect(String(staged.grounding.entries[0]!.anchor.subtreeHash)).toBe(String(HASH))

    // the DECISIVE assertion: the raw token is absent from EVERY CAS object this pass makes durable. Without the
    // #222 scrub, `puts.push(f)` would carry `f.grounding` with the raw `ghp_…` token into content-addressed,
    // permanent storage (no delete path — the #97/#118 class).
    const casJson = JSON.stringify(dec.put)
    expect(casJson).not.toContain(TOKEN)
  })
})
