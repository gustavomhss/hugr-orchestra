import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { decideProjectRule, proposeProjectRule, type AtlasBinding } from "../src/native-memory.js"
import { appendReview, foldReview, readReview, reviewLogPath } from "../src/review-log.js"
import { createDurableMemory } from "../src/memory-store.js"

let root: string
let bin: string

function scanner(name: string, exit: number): string {
  const path = join(bin, name)
  writeFileSync(path, `#!/bin/sh\n/bin/cat >/dev/null\nexit ${exit}\n`)
  chmodSync(path, 0o755)
  return path
}

function binding(over: Partial<AtlasBinding> = {}): AtlasBinding {
  return {
    storage: { projectID: "proj", root },
    source: { worktree: root, revision: "deadbeef" },
    memoryOwner: "backend",
    execution: { actor: { memberId: "backend", projectId: "proj", sessionId: "ses_1" }, executionSessionID: "ses_1" },
    scanner: { name: "gitleaks", command: scanner("clean-gitleaks", 0) },
    ...over,
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "atlas-proposal-"))
  bin = mkdtempSync(join(tmpdir(), "atlas-proposal-bin-"))
  vi.stubEnv("PATH", "")
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
  rmSync(bin, { recursive: true, force: true })
})

const T1 = "2026-10-18T10:00:00.000Z"
const T2 = "2026-10-18T11:00:00.000Z"
const RULE = { rule: "run go vet before the handler tests", scope: "packages/api" }

describe("proposeProjectRule", () => {
  it("proposes once and writes nothing to the memory store", () => {
    const v = proposeProjectRule(binding(), RULE, T1)
    if (!v.ok) throw new Error(v.reason)
    expect(readReview(root).records).toEqual([
      { kind: "memory-proposal", member: "backend", rule: RULE.rule, scope: RULE.scope, at: T1, by: "backend", id: v.proposalId },
    ])
    expect(createDurableMemory(root).read().store).toHaveLength(0)
  })

  it("reconciles an identical open proposal", () => {
    const first = proposeProjectRule(binding(), RULE, T1)
    if (!first.ok) throw new Error(first.reason)
    const second = proposeProjectRule(binding(), RULE, T2)
    expect(second).toEqual({ ok: true, proposalId: first.proposalId, reconciled: true })
    expect(readReview(root).records).toHaveLength(1)
  })

  it("a discarded proposal is not open, so a fresh one is minted", () => {
    const first = proposeProjectRule(binding(), RULE, T1)
    if (!first.ok) throw new Error(first.reason)
    appendReview(root, { kind: "memory-decision", proposalId: first.proposalId, verdict: "discarded", at: T2, by: "gus" })
    const second = proposeProjectRule(binding(), RULE, T2)
    if (!second.ok) throw new Error(second.reason)
    expect(second.reconciled).toBeUndefined()
    expect(second.proposalId).not.toBe(first.proposalId)
    expect(readReview(root).records).toHaveLength(3)
  })

  it("a different owner does not reconcile", () => {
    proposeProjectRule(binding(), RULE, T1)
    const v = proposeProjectRule(binding({ memoryOwner: "jimmy" }), RULE, T2)
    if (!v.ok) throw new Error(v.reason)
    expect(v.reconciled).toBeUndefined()
    const records = readReview(root).records
    const proposal = records[1]
    expect(proposal?.kind === "memory-proposal" ? proposal.member : undefined).toBe("jimmy")
  })

  it("rejects an extra field", () => {
    const v = proposeProjectRule(binding(), { ...RULE, grounding: "packages/api@abc" }, T1)
    expect(v).toMatchObject({ ok: false, refusal: "template-invalid" })
    if (v.ok) throw new Error("expected refusal")
    expect(v.reason).toContain("unexpected: grounding")
    expect(existsSync(reviewLogPath(root))).toBe(false)
  })

  it("rejects a supplied frecency", () => {
    const v = proposeProjectRule(binding(), { ...RULE, frecency: 5 }, T1)
    expect(v).toMatchObject({ ok: false, refusal: "template-invalid" })
    if (v.ok) throw new Error("expected refusal")
    expect(v.reason).toContain("`frecency` is assigned by Atlas policy")
  })

  it("rejects empty rule and non-object entry", () => {
    const a = proposeProjectRule(binding(), { rule: "", scope: "packages/api" }, T1)
    expect(a).toMatchObject({ ok: false, refusal: "template-invalid" })
    if (a.ok) throw new Error("expected refusal")
    expect(a.reason).toContain("non-empty")
    const b = proposeProjectRule(binding(), "not an object" as never, T1)
    expect(b).toMatchObject({ ok: false, refusal: "template-invalid" })
    if (b.ok) throw new Error("expected refusal")
    expect(b.reason).toContain("is an object")
  })

  it("blocks on a scanner hit", () => {
    const v = proposeProjectRule(binding({ scanner: { name: "gitleaks", command: scanner("hit", 1) } }), RULE, T1)
    expect(v).toMatchObject({ ok: false, refusal: "scanner-blocked", scanner: "gitleaks" })
    expect(existsSync(reviewLogPath(root))).toBe(false)
  })

  it("refuses when no scanner", () => {
    const v = proposeProjectRule(binding({ scanner: undefined } as never), RULE, T1)
    expect(v).toMatchObject({ ok: false, refusal: "scanner-unavailable" })
    expect(existsSync(reviewLogPath(root))).toBe(false)
  })

  it("refuses on a torn review log", () => {
    proposeProjectRule(binding(), RULE, T1)
    appendFileSync(reviewLogPath(root), "{torn\n")
    const v = proposeProjectRule(binding(), { rule: "another rule", scope: "packages/api" }, T2)
    expect(v).toMatchObject({ ok: false, refusal: "store-partial" })
  })

  it("throws when at is empty", () => {
    expect(() => proposeProjectRule(binding(), RULE, "")).toThrow("proposeProjectRule needs the host's ISO time")
  })
})


describe("decideProjectRule", () => {
  const T3 = "2026-10-18T12:00:00.000Z"
  const proposed = (): string => {
    const v = proposeProjectRule(binding(), RULE, T1)
    if (!v.ok) throw new Error(v.reason)
    return v.proposalId
  }
  const rules = () =>
    createDurableMemory(root)
      .read()
      .store.map((r) => [r.owner, r.kind, (r.entry as { rule: string }).rule, (r.entry as { scope: string }).scope])

  it("indexed writes the rule as the proposing member, then closes the proposal", () => {
    const id = proposed()
    const v = decideProjectRule(binding({ memoryOwner: "steward" }), { proposalId: id, verdict: "indexed", by: "gus" }, T2)
    if (!v.ok) throw new Error(v.reason)
    expect(typeof v.ref?.eventId).toBe("string")
    expect(rules()).toEqual([["backend", "project", RULE.rule, RULE.scope]])
    const fold = foldReview(readReview(root).records)
    expect(fold.openMemoryProposals).toHaveLength(0)
    expect(fold.memoryDecisions).toEqual([
      { kind: "memory-decision", proposalId: id, verdict: "indexed", at: T2, by: "gus", id: v.decisionId },
    ])
  })

  it("an edited rule and scope replace the proposal's text in memory and in the decision", () => {
    const id = proposed()
    const edit = { rule: "run go vet before every handler test", scope: "packages/api/handlers" }
    const v = decideProjectRule(binding(), { proposalId: id, verdict: "indexed", ...edit, by: "gus" }, T2)
    if (!v.ok) throw new Error(v.reason)
    expect(rules()).toEqual([["backend", "project", edit.rule, edit.scope]])
    const decision = foldReview(readReview(root).records).memoryDecisions[0]
    expect([decision?.rule, decision?.scope]).toEqual([edit.rule, edit.scope])
  })

  it("discarded only appends the decision", () => {
    const id = proposed()
    const v = decideProjectRule(binding(), { proposalId: id, verdict: "discarded", by: "gus" }, T2)
    if (!v.ok) throw new Error(v.reason)
    expect(v.ref).toBeUndefined()
    expect(rules()).toEqual([])
    const fold = foldReview(readReview(root).records)
    expect([fold.openMemoryProposals.length, fold.memoryDecisions[0]?.verdict]).toEqual([0, "discarded"])
  })

  it("refuses a proposal that is not open", () => {
    const id = proposed()
    expect(decideProjectRule(binding(), { proposalId: id, verdict: "discarded", by: "gus" }, T2).ok).toBe(true)
    expect(decideProjectRule(binding(), { proposalId: id, verdict: "indexed", by: "gus" }, T3)).toEqual({
      ok: false,
      refusal: "proposal-not-open",
      reason: `no open memory proposal has id '${id}'`,
    })
    expect(rules()).toEqual([])
  })

  it("a refused write appends no decision and keeps the proposal open", () => {
    const id = proposed()
    const hit = binding({ scanner: { name: "gitleaks", command: scanner("hit", 1) } })
    const v = decideProjectRule(hit, { proposalId: id, verdict: "indexed", by: "gus" }, T2)
    expect(v).toMatchObject({ ok: false, refusal: "scanner-blocked" })
    expect(rules()).toEqual([])
    expect(foldReview(readReview(root).records).openMemoryProposals.map((p) => p.id)).toEqual([id])
  })

  it("refuses on a review log with a line that does not verify", () => {
    const id = proposed()
    appendFileSync(reviewLogPath(root), "{torn\n")
    expect(decideProjectRule(binding(), { proposalId: id, verdict: "indexed", by: "gus" }, T2)).toMatchObject({
      ok: false,
      refusal: "store-partial",
    })
    expect(rules()).toEqual([])
  })
})
