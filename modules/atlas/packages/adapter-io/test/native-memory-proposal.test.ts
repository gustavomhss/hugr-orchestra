import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { proposeProjectRule, type AtlasBinding } from "../src/native-memory.js"
import { appendReview, readReview, reviewLogPath } from "../src/review-log.js"
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
    expect(records[1]?.member).toBe("jimmy")
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
