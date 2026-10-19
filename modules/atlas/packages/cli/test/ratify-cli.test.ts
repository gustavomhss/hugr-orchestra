import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readReview, foldReview } from "@atlas/adapter-io"
import type { RatifyPorts } from "../src/ratify-cli.js"
import type { CurrentFact } from "@atlas/adapter-io"
import type { GroundedFact } from "@atlas/knowledge"
import { resolveId } from "../src/review-common.js"
import { REVIEW_COMMANDS } from "../src/review-cli.js"
import { runDecide, runProposals, runPropose } from "../src/ratify-cli.js"

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "atlas-ratify-cli-"))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const NOW = "2026-10-18T10:00:00.000Z"

const fact = (tier: string, authoring = "ADVISORY") =>
  ({ kind: "advisory", id: "nk-a", tier, claimNorm: "a holds", grounding: { entries: [] }, freshness: "FRESH", claims: [], authoring, scope: "core" }) as unknown as GroundedFact

const current = (tier: string, authoring?: string): CurrentFact => ({
  node: { nodeKey: "nk-a", family: "advisory", contentHash: "h-a", claims: ["a holds"] } as unknown as CurrentFact["node"],
  fact: fact(tier, authoring),
})

function ports(opts: { tier?: string; authoring?: string; emit?: RatifyPorts["emit"] } = {}): RatifyPorts & { emitted: { node: GroundedFact; at: string }[] } {
  const emitted: { node: GroundedFact; at: string }[] = []
  return {
    repoPath: tmp,
    now: () => NOW,
    head: () => "headsha",
    factOf: (k) => (k === "nk-a" ? current(opts.tier ?? "T2", opts.authoring) : undefined),
    emit: "emit" in opts ? opts.emit : (node, at) => (emitted.push({ node, at }), { emitted: true, id: "h-new" }),
    emitted,
  }
}

describe("ratify-cli", () => {
  it("case 1: propose requires --by", () => {
    const v = runPropose(ports(), ["nk-a", "T1", "it", "holds"], {})
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toContain("propose requires --by <actor>")
    expect(readReview(tmp).records).toHaveLength(0)
  })

  it("case 2: propose target tier must be T1 or T0", () => {
    const v = runPropose(ports(), ["nk-a", "T2", "x"], { by: "lucy" })
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toContain("the target tier must be T1 or T0, got 'T2'")
  })

  it("case 3: propose unknown nodeKey", () => {
    const v = runPropose(ports(), ["nk-zz", "T1", "x"], { by: "lucy" })
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toContain("no current fact has nodeKey 'nk-zz'")
  })

  it("case 4: propose already at target tier", () => {
    const v = runPropose(ports({ tier: "T1" }), ["nk-a", "T1", "x"], { by: "lucy" })
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toContain("is already T1")
  })

  it("case 5: propose retired fact", () => {
    const v = runPropose(ports({ authoring: "SUPERSEDED" }), ["nk-a", "T1", "x"], { by: "lucy" })
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toContain("is retired")
  })

  it("case 6: propose ok", () => {
    const v = runPropose(ports(), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    expect(v.exitCode).toBe(0)
    expect(v.stdout).toContain("proposal: ")
    const fold = foldReview(readReview(tmp).records)
    expect(fold.openProposals).toHaveLength(1)
    expect(fold.openProposals[0]?.nodeKey).toBe("nk-a")
    expect(fold.openProposals[0]?.toTier).toBe("T1")
    expect(fold.openProposals[0]?.reason).toBe("it holds")
    expect(fold.openProposals[0]?.by).toBe("lucy")
  })

  it("case 7: propose duplicate open proposal", () => {
    runPropose(ports(), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    const v = runPropose(ports(), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toContain("already has an open T1 proposal")
  })

  it("case 8: proposals listing", () => {
    const empty = runProposals(ports())
    expect(empty.exitCode).toBe(0)
    expect(empty.stdout).toContain("no open proposals")
    runPropose(ports(), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    const out = runProposals(ports())
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toContain("proposed by lucy")
  })

  it("case 9: decide reject", () => {
    runPropose(ports(), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    const id = readReview(tmp).records.find((r) => r.kind === "proposal")!.id
    const p = ports()
    const v = runDecide(p, [id, "reject", "too", "broad"], { by: "gus" })
    expect(v.exitCode).toBe(0)
    const fold = foldReview(readReview(tmp).records)
    expect(fold.openProposals).toHaveLength(0)
    expect(fold.decisions[0]?.verdict).toBe("rejected")
    expect(fold.decisions[0]?.reason).toBe("too broad")
    expect(fold.decisions[0]?.by).toBe("gus")
    expect(p.emitted).toHaveLength(0)
  })

  it("case 10: decide ratify refused", () => {
    runPropose(ports(), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    const id = readReview(tmp).records.find((r) => r.kind === "proposal")!.id
    const p = ports({ emit: () => ({ emitted: false, rejected: "unratified: needs a ratifier" }) })
    const v = runDecide(p, [id, "ratify", "reviewed"], { by: "gus" })
    expect(v.exitCode).toBe(2)
    expect(v.stdout).toContain("unratified: needs a ratifier")
    expect(v.stdout).toContain("no decision was written")
    const fold = foldReview(readReview(tmp).records)
    expect(fold.decisions).toHaveLength(0)
    expect(fold.openProposals).toHaveLength(1)
  })

  it("case 11: decide ratify ok", () => {
    runPropose(ports(), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    const id = readReview(tmp).records.find((r) => r.kind === "proposal")!.id
    const p = ports()
    const v = runDecide(p, [id, "ratify", "reviewed"], { by: "gus" })
    expect(v.exitCode).toBe(0)
    expect(p.emitted).toHaveLength(1)
    expect(p.emitted[0]?.at).toBe("headsha")
    expect((p.emitted[0]?.node as { tier: string }).tier).toBe("T1")
    const fold = foldReview(readReview(tmp).records)
    expect(fold.decisions[0]?.verdict).toBe("ratified")
    expect(v.stdout).toContain("emitted: h-new")
  })

  it("case 12: decide ratify not composed", () => {
    runPropose(ports({ emit: undefined }), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    const id = readReview(tmp).records.find((r) => r.kind === "proposal")!.id
    const p = ports({ emit: undefined })
    const v = runDecide(p, [id, "ratify", "reviewed"], { by: "gus" })
    expect(v.exitCode).toBe(1)
    expect(v.stdout).toContain("atlas runtime is not composed yet")
  })

  it("case 13: decide prefix resolution", () => {
    runPropose(ports(), ["nk-a", "T1", "it", "holds"], { by: "lucy" })
    const id = readReview(tmp).records.find((r) => r.kind === "proposal")!.id
    const ok = runDecide(ports(), [id.slice(0, 8), "reject", "x"], { by: "gus" })
    expect(ok.exitCode).toBe(0)
    runPropose(ports(), ["nk-a", "T1", "it", "holds2"], { by: "lucy" })
    const id2 = readReview(tmp).records.filter((r) => r.kind === "proposal")[1]!.id
    const bad = runDecide(ports(), [id2.slice(0, 4), "reject", "x"], { by: "gus" })
    expect(bad.exitCode).toBe(1)
    expect(bad.stdout).toContain("no open proposal matches")
  })

  it("case 14: resolveId", () => {
    expect(resolveId(["abcdefgh1", "abcdefgh2"], "abcdefgh")).toBeUndefined()
    expect(resolveId(["abcdefgh1"], "abcdefgh")).toBe("abcdefgh1")
  })

  it("case 15: REVIEW_COMMANDS entries", () => {
    expect(typeof REVIEW_COMMANDS.propose).toBe("function")
    expect(typeof REVIEW_COMMANDS.proposals).toBe("function")
    expect(typeof REVIEW_COMMANDS.decide).toBe("function")
  })
})
