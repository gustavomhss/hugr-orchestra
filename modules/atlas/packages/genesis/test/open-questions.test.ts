import { describe, it, expect } from "vitest"
import { asSubtreeHash, id } from "@atlas/kernel"
import { nodeHashOfPath } from "@atlas/index"
import { deriveOpenQuestions, unitOfFile } from "../src/open-questions.js"
import type { QuestionFact, QuestionInput } from "../src/open-questions.js"

const FACTS: QuestionFact[] = [
  { nodeKey: "k1", file: "packages/a/src/x.ts", slot: "invariant", tier: "T2", claim: "x holds" },
  { nodeKey: "k2", file: "packages/a/src/x.ts", slot: "invariant", tier: "T1", claim: "x also holds" },
  { nodeKey: "k3", file: "packages/b/src/y.ts", slot: "rationale", tier: "T2", claim: "b exists to serve y" },
  { nodeKey: "k4", file: "README.md", slot: "gotcha", tier: "T2", claim: "root fact" },
]
const BLAST: Record<string, number> = { "packages/a/src/x.ts": 4, "packages/b/src/y.ts": 1 }
const input = (answered: ReadonlySet<string> = new Set()): QuestionInput => ({
  facts: FACTS,
  ownerOf: (unit) => (unit === "packages/b" ? "alice" : ""),
  blast: (file) => BLAST[file] ?? 0,
  answered,
})

describe("open-questions", () => {
  it("derives and ranks", () => {
    expect(deriveOpenQuestions(input()).map((q) => [q.kind, q.subject, q.rank])).toEqual([
      ["tier", "k1", 12],
      ["contested", "packages/a/src/x.ts|invariant", 8],
      ["owner", "packages/a", 4],
      ["intent", "packages/a", 4],
    ])
  })

  it("tier question details", () => {
    const q = deriveOpenQuestions(input()).find((q) => q.kind === "tier")!
    expect(q.ask).toBe('Make this a rule? “x holds”')
    expect(q.options).toEqual(["Rule · T1", "Core · T0", "Keep as a hint"])
    expect(q.rankReason).toBe("invariant, 4 files depend on its file")
    expect(q.nodeKey).toBe("k1")
    expect(q.site).toEqual({ kind: "file", qualifiedPath: "packages/a/src/x.ts", subtreeHash: asSubtreeHash(nodeHashOfPath("packages/a/src/x.ts")) })
    expect(q.id).toBe(String(id({ kind: "tier", subject: "k1" })))
  })

  it("contested question details", () => {
    const q = deriveOpenQuestions(input()).find((q) => q.kind === "contested")!
    expect(q.ask).toBe("Two invariant claims on x.ts: which holds?")
    expect(q.options![0]).toBe("“x holds…”")
    expect(q.options![2]).toBe("Both")
    expect(q.rankReason).toBe("2 claims share one slot")
  })

  it("owner and intent details", () => {
    const owner = deriveOpenQuestions(input()).find((q) => q.kind === "owner")!
    const intent = deriveOpenQuestions(input()).find((q) => q.kind === "intent")!
    expect(owner.ask).toBe("Who owns packages/a?")
    expect(owner.rankReason).toBe("2 facts, 4 files depend on it, no owner named")
    expect(owner.site.kind).toBe("directory")
    expect(intent.ask).toBe("What is packages/a for?")
    expect(intent.rankReason).toBe("no rationale among its 2 facts")
    expect("options" in intent).toBe(false)
  })

  it("answered drop out", () => {
    const tierId = deriveOpenQuestions(input()).find((q) => q.kind === "tier")!.id
    const res = deriveOpenQuestions(input(new Set([tierId])))
    expect(res).toHaveLength(3)
    expect(res.some((q) => q.kind === "tier")).toBe(false)
  })

  it("long claim truncates", () => {
    const claim = "a".repeat(250)
    const facts: QuestionFact[] = [{ nodeKey: "k", file: "packages/a/src/x.ts", slot: "invariant", tier: "T2", claim }]
    const inp: QuestionInput = { facts, ownerOf: () => "", blast: () => 1, answered: new Set() }
    const q = deriveOpenQuestions(inp).find((q) => q.kind === "tier")!
    expect(q.ask).toBe(`Make this a rule? “${claim.slice(0, 199)}…”`)
  })

  it("unitOfFile", () => {
    expect(unitOfFile("packages/a/src/x.ts")).toBe("packages/a")
    expect(unitOfFile("docs/guide/x.md")).toBe("docs/guide")
    expect(unitOfFile("packages/a")).toBe("(root)")
    expect(unitOfFile("src/x.ts")).toBe("(root)")
  })

  it("no facts", () => {
    expect(deriveOpenQuestions({ ...input(), facts: [] })).toEqual([])
  })
})
