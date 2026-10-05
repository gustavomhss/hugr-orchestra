import { describe, expect, it } from "vitest"
import type { OwnPackPlus } from "../src/own-model.js"
import type { OwnUnit } from "../src/types.js"
import {
  materializeStaticOwn,
  parseStaticOwnReceipt,
  staticOwnArtifactPath,
  staticOwnSkillName,
  verifyStaticOwn,
  verifyStaticOwnFreshness,
  verifyStaticOwnFreshnessSet,
  verifyStaticOwnSet,
} from "../src/own-artifact.js"
import {
  materializeStaticOwnCoverage,
  OWN_COVERAGE_PATH,
  parseStaticOwnCoverage,
  verifyStaticOwnCoverageSet,
} from "../src/own-coverage.js"

const billing: OwnUnit = { level: "module", id: "crates/billing", grounding: null }
const source: OwnUnit = { level: "module", id: "src/billing", grounding: null }

function pack(over: Partial<OwnPackPlus> = {}): OwnPackPlus {
  return {
    unit: "billing owns charges",
    invariants: [{ nodeId: "inv-1" as never, tier: "T1", claim: "charge amount is positive", freshness: "FRESH" }],
    shape: { contents: ["crates/billing/src/lib.ts" as never], owner: "payments", tier: "T1" },
    edges: { dependents: [], dependencies: [] },
    gotchas: [],
    memory: null,
    drill: { finer: [source], refresh: { pull: "poke:own_billing" }, complement: { pull: "relate:crates/billing" } },
    grounding: { source: "tree" },
    tokenEstimate: 42,
    manifest: { pointers: [], truncated: false },
    pullReachable: [],
    advisory: [],
    advisoryDropped: 0,
    ...over,
  }
}

function input(over: Partial<Parameters<typeof materializeStaticOwn>[0]> = {}) {
  return {
    unit: billing,
    snapshot: "snapshot-head",
    sourceRevision: "abc123",
    graphCoverage: "COMPLETE" as const,
    sourceBlobs: { "crates/billing/src/lib.ts": "0123456789abcdef0123456789abcdef01234567" },
    pack: pack(),
    ...over,
  }
}

describe("static Own artifact", () => {
  it("uses injective canonical-unit names and OpenCode skill paths", () => {
    expect(staticOwnSkillName(billing.id)).not.toBe(staticOwnSkillName(source.id))
    expect(staticOwnSkillName(billing.id)).toMatch(/^own_[A-Za-z0-9_-]+$/)
    expect(staticOwnArtifactPath(billing.id)).toBe(
      `.opencode/skills/own/${staticOwnSkillName(billing.id).slice(4)}/SKILL.md`,
    )
  })

  it("materializes receipt-bound facts and exact drill skill pointers", () => {
    const artifact = materializeStaticOwn(input())
    expect(artifact.content).toContain("<!-- own-receipt:begin -->")
    expect(artifact.content).toContain("`inv-1`: charge amount is positive")
    expect(artifact.content).toContain(`Load \`${staticOwnSkillName(source.id)}\` for \`${source.id}\`.`)
    expect(parseStaticOwnReceipt(artifact.content)).toEqual(artifact.receipt)
    expect(artifact.receipt.factIds).toEqual(["inv-1"])
    expect(artifact.receipt.drillUnits).toEqual(["src/billing"])
    expect(artifact.receipt.sourceBlobs).toEqual({
      "crates/billing/src/lib.ts": "0123456789abcdef0123456789abcdef01234567",
    })
  })

  it("accepts only independently recomposed complete coverage", () => {
    const artifact = materializeStaticOwn(input())
    const result = verifyStaticOwn(input(), artifact.content)
    expect(result.status).toBe("READY")
  })

  it("holds malformed, altered, and under-approximate artifacts", () => {
    const artifact = materializeStaticOwn(input())
    expect(verifyStaticOwn(input(), artifact.content.replace("billing owns charges", "other owner"))).toEqual({
      status: "HOLD",
      reason: "MISMATCH",
    })
    expect(verifyStaticOwn(input(), artifact.content.replace("<!-- own-receipt:end -->", "<!-- missing -->"))).toEqual({
      status: "HOLD",
      reason: "MALFORMED",
    })
    const uncertain = input({ graphCoverage: "UNDER_APPROX" })
    expect(verifyStaticOwn(uncertain, materializeStaticOwn(uncertain).content)).toEqual({
      status: "HOLD",
      reason: "UNDER_APPROX",
    })
  })

  it("holds an incomplete, stale, or unscoped Own set", () => {
    const artifact = materializeStaticOwn(input())
    expect(
      verifyStaticOwnSet({
        expected: [input()],
        base: [artifact],
        head: [artifact],
        impact: { coverage: "COMPLETE", impactedUnits: ["crates/billing"], removedUnits: [] },
      }),
    ).toEqual({ status: "READY" })
    expect(
      verifyStaticOwnSet({
        expected: [],
        base: [],
        head: [],
        impact: { coverage: "COMPLETE", impactedUnits: [], removedUnits: [] },
      }),
    ).toEqual({ status: "HOLD", issues: ["expected Own coverage is empty"] })
    expect(
      verifyStaticOwnSet({
        expected: [input()],
        base: [artifact],
        head: [{ ...artifact, content: artifact.content.replace("billing owns charges", "altered") }],
        impact: { coverage: "COMPLETE", impactedUnits: [], removedUnits: [] },
      }),
    ).toEqual({
      status: "HOLD",
      issues: ["invalid artifact crates/billing: MISMATCH", "unimpacted artifact changed: crates/billing"],
    })
    const stale = input({
      pack: pack({
        invariants: [
          { nodeId: "inv-1" as never, tier: "T1", claim: "charge amount is positive", freshness: "DRIFTED" },
        ],
      }),
    })
    expect(() => materializeStaticOwn(stale)).toThrow("static Own materialization requires fresh facts: crates/billing")
  })

  it("detects source drift from immutable blob anchors without a historical Knowledge store", () => {
    const artifact = materializeStaticOwn(input())
    expect(verifyStaticOwnFreshness(artifact.content, (path) => artifact.receipt.sourceBlobs[path])).toEqual({
      status: "READY",
    })
    expect(verifyStaticOwnFreshness(artifact.content, () => "abcdefabcdefabcdefabcdefabcdefabcdefabcd")).toEqual({
      status: "HOLD",
      staleSources: ["crates/billing/src/lib.ts"],
    })
  })

  it("allows agent re-authoring only inside graph impact and only while source anchors stay fresh", () => {
    const artifact = materializeStaticOwn(input())
    const rewritten = {
      ...artifact,
      content: artifact.content.replace("billing owns charges", "billing owns current charges"),
    }
    const args = {
      expectedUnits: ["crates/billing"],
      base: [artifact],
      head: [rewritten],
      impact: { coverage: "COMPLETE" as const, impactedUnits: ["crates/billing"], removedUnits: [] },
      currentBlob: (path: string) => artifact.receipt.sourceBlobs[path],
    }
    expect(verifyStaticOwnFreshnessSet(args)).toEqual({ status: "READY" })
    expect(verifyStaticOwnFreshnessSet({ ...args, impact: { ...args.impact, impactedUnits: [] } })).toEqual({
      status: "HOLD",
      issues: ["unimpacted artifact changed: crates/billing"],
    })
    expect(verifyStaticOwnFreshnessSet({ ...args, currentBlob: () => undefined })).toEqual({
      status: "HOLD",
      issues: ["stale artifact crates/billing: crates/billing/src/lib.ts"],
    })
  })

  it("uses a non-vacuous Genesis coverage receipt as CI expected-unit oracle", () => {
    const artifact = materializeStaticOwn(input())
    const coverage = materializeStaticOwnCoverage({
      snapshot: "snapshot-head",
      sourceRevision: "abc123",
      units: ["crates/billing"],
    })
    expect(OWN_COVERAGE_PATH).toBe(".opencode/skills/own/OWN-COVERAGE.json")
    expect(parseStaticOwnCoverage(coverage)?.units).toEqual(["crates/billing"])
    expect(
      verifyStaticOwnCoverageSet({
        coverage,
        expected: [input()],
        base: [artifact],
        head: [artifact],
        impact: { coverage: "COMPLETE", impactedUnits: ["crates/billing"], removedUnits: [] },
      }),
    ).toEqual({ status: "READY" })
    expect(
      verifyStaticOwnCoverageSet({
        coverage: "{}",
        expected: [],
        base: [],
        head: [],
        impact: { coverage: "COMPLETE", impactedUnits: [], removedUnits: [] },
      }),
    ).toEqual({ status: "HOLD", issues: ["malformed Own coverage receipt"] })
  })
})
