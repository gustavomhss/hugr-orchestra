import type { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import type { ReviewItem } from "@orchestra/core/review-toolkit/item"
import { ReviewFanoutV2 } from "../../src/v2/workflow/review-fanout"

// `task` sits in a stage set on purpose: no review scope may carry it.
export const STAGES = {
  lead: ["read", "grep", "glob"],
  lens: ["read", "grep", "glob", "review_analyze"],
  verifier: ["read", "grep", "glob", "review_probe"],
  final: ["read", "grep", "glob", "maestro_record_review", "task"],
}

export const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " export const keep = 0",
  "-export const a = 1",
  "+export const a = 2",
  "+export const b = 3",
  "",
].join("\n")

export const item = (lens: string, index: number): ReviewItem.ToolItem => ({
  fingerprint: `fp-${lens}-${index}`,
  class: lens === "security" ? "security.secret" : "logic.invariant",
  lens,
  pack: "gitleaks",
  rule: "rule",
  ruleStatus: "probation",
  severity: "P2",
  path: "src/a.ts",
  line: 40 + index,
  snippetDigest: "digest",
  sources: [{ pack: "gitleaks", rule: "rule" }],
  triage: "triage",
  onChangedLine: true,
})

export const ANALYSIS: ReviewFanoutV2.Analysis = {
  checks: [{ id: "gitleaks", pack: "gitleaks", version: "pinned", lane: "no-build", status: "pass", workspaceExecuted: false } satisfies ReviewAnalyze.Check],
  items: {
    "correctness-logic": Array.from({ length: 20 }, (_, index) => item("correctness-logic", index)),
    security: [item("security", 0)],
  },
  retained: { uri: "artifact:retained", total: 21, unread: { "correctness-logic": 5 } },
}

export const fenced = (tag: string, value: unknown) => "```" + tag + "\n" + JSON.stringify(value) + "\n```"

export const ENTRY = fenced(ReviewFanoutV2.TAGS.entry, {
  status: "eligible",
  context: {
    intent: [{ text: "Fix the counter", line: "card:2" }],
    acceptance: [{ text: "a is 2", line: "card:3" }],
    invariants: "nothing found",
    assumptions: [{ text: "ASSUMPTION-ONLY-FOR-FINDERS", line: "card:4" }],
  },
  overlays: { confirmed: [], declined: [], added: [] },
  slices: [],
})

export const candidate = (quote: string, line: number, severity: string) => ({
  class: "logic.invariant",
  node: "lucy-lens-correctness-logic-invariants",
  path: "src/a.ts",
  line,
  severity,
  trigger: `trigger for ${quote}`,
  quote,
})

export const lens = (id: string) => {
  if (id === "correctness-logic")
    return fenced(ReviewFanoutV2.TAGS.lens, {
      lens: id,
      candidates: [
        candidate("export const a = 2", 2, "P1"),
        candidate("q2", 3, "P1"),
        candidate("q3", 4, "P2"),
        candidate("q4", 5, "P2"),
        candidate("q5", 6, "P3"),
      ],
      observations: [{ class: "tests.missing", path: "src/a.ts", line: 3, text: "no test pins b" }],
      hunks: [{ path: "src/a.ts", startLine: 1, endLine: 3 }],
      items: [{ fingerprint: "fp-correctness-logic-0", pursued: true }],
    })
  // The same candidate from a second lens merges by fingerprint and counts as agreement.
  if (id === "correctness-edges")
    return fenced(ReviewFanoutV2.TAGS.lens, {
      lens: id,
      candidates: [candidate("export const a = 2", 2, "P2")],
      observations: [],
      hunks: [],
      items: [],
    })
  return fenced(ReviewFanoutV2.TAGS.lens, { lens: id, candidates: [], observations: [], hunks: [], items: [] })
}

export const VERIFY = fenced(ReviewFanoutV2.TAGS.verify, {
  class: "logic.invariant",
  results: [
    {
      candidate: "C1",
      state: "confirmed",
      rung: "quote",
      evidence: { kind: "quote", path: "src/a.ts", startLine: 2, endLine: 2 },
      history: [{ option: "quote", outcome: "settled" }],
    },
    { candidate: "C2", state: "dropped", refutation: "REFUTED-BECAUSE", history: [{ option: "quote", outcome: "settled" }] },
    { candidate: "C3", state: "question", reason: "needs a probe", history: [{ option: "quote", outcome: "unsettled" }] },
  ],
})

export const replies = (key: string) => {
  if (key === "lead") return ENTRY
  if (key.startsWith("lens:")) return lens(key.split(":")[1])
  if (key === "verify:logic.invariant") return VERIFY
  return fenced(ReviewFanoutV2.TAGS.verify, { class: key.slice("verify:".length), results: [] })
}
