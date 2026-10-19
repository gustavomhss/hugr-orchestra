// @atlas/adapter-io — test/surface-review.test.ts  (D31: the Atlas UI surface's review queue, `review()`)
//
// The review log folded for the screen (held keys, open proposals, open memory proposals), a log with a line that does
// not verify, and the interview batch over a real store (open-questions-source.test.ts's fixture) with a model's
// draft riding along until a person answers.

import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { emptyStore, upsert } from "@atlas/knowledge"
import type { PredicateSlot } from "@atlas/knowledge"
import { appendReview, reviewLogPath } from "../src/review-log.js"
import { createDiskStore } from "../src/store.js"
import { openSurface } from "../src/surface/index.js"
import { makeFixRepo } from "./harness/fix-repo.js"

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const NOW = "2026-10-18T10:00:00.000Z"
const LATER = "2026-10-18T11:00:00.000Z"

/** A temporary directory with an empty `.atlas/`, so the surface answers `ok`. */
function atlasDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "atlas-surface-review-"))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, ".atlas"), { recursive: true })
  return dir
}

/** open-questions-source.test.ts's store: a T2 invariant in packages/a (a tier question, plus the unit's owner and
 *  intent questions) and a rationale in packages/b, whose policy owner is alice. */
function questionRepo(): string {
  const repo = makeFixRepo()
  cleanups.push(repo.cleanup)
  mkdirSync(join(repo.repoPath, ".atlas"), { recursive: true })
  writeFileSync(
    join(repo.repoPath, ".atlas", "policy.json"),
    '{"t0Heuristic":{"keywords":[]},"authz":{"scopes":{"packages/b":["alice"]}}}',
  )
  const store = createDiskStore(join(repo.repoPath, ".atlas", "cas"))
  const rows: readonly { nodeKey: string; claimNorm: string; anchor: string; slot: PredicateSlot }[] = [
    { nodeKey: "k1", claimNorm: "x holds", anchor: "packages/a/src/x.ts::f", slot: "invariant" },
    { nodeKey: "k3", claimNorm: "b is for z", anchor: "packages/b/src/z.ts", slot: "rationale" },
  ]
  let projection = emptyStore()
  for (const row of rows) {
    const contentHash = store.put({ kind: "advisory", tier: "T2", claimNorm: row.claimNorm, authoring: "ADVISORY" } as never) as string
    projection = upsert(projection, {
      nodeKey: row.nodeKey,
      contentHash,
      family: "advisory",
      claimNorm: row.claimNorm,
      primaryAnchor: row.anchor,
      slot: row.slot,
      tier: "T2",
    }).store
  }
  store.persistProjection(projection)
  return repo.repoPath
}

/** Narrow a surface result to its `state: "ok"` member, failing the test on any other state. */
function ok<T extends { readonly state: string }>(value: T): Extract<T, { readonly state: "ok" }> {
  if (value.state !== "ok") throw new Error(`expected state ok, got ${value.state}`)
  return value as Extract<T, { readonly state: "ok" }>
}

describe("openSurface().review — the review queue the screen works through", () => {
  it("answers empty when the repository has no .atlas directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-surface-review-empty-"))
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
    expect(openSurface(dir).review()).toEqual({ state: "empty" })
  })

  it("folds the log: held keys sorted, open proposals and open memory proposals only", () => {
    const dir = atlasDir()
    appendReview(dir, { kind: "hold", nodeKey: "nk-b", at: NOW, by: "alice" })
    appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: NOW, by: "alice" })
    appendReview(dir, { kind: "hold", nodeKey: "nk-z", at: NOW, by: "alice" })
    appendReview(dir, { kind: "release", nodeKey: "nk-z", at: LATER, by: "alice" })
    const open = appendReview(dir, { kind: "proposal", nodeKey: "nk-c", toTier: "T1", reason: "it holds", at: NOW, by: "lucy" })
    const closed = appendReview(dir, { kind: "proposal", nodeKey: "nk-d", toTier: "T0", reason: "core", at: NOW, by: "lucy" })
    appendReview(dir, { kind: "decision", proposalId: closed.id, verdict: "rejected", reason: "no", at: LATER, by: "gus" })
    const rule = appendReview(dir, {
      kind: "memory-proposal",
      member: "backend",
      rule: "run go vet first",
      scope: "packages/api",
      at: NOW,
      by: "backend",
    })
    expect(openSurface(dir).review()).toEqual({
      state: "ok",
      unreadable: false,
      held: ["nk-a", "nk-b"],
      proposals: [{ id: open.id, nodeKey: "nk-c", toTier: "T1", reason: "it holds", by: "lucy", at: NOW }],
      memoryProposals: [{ id: rule.id, member: "backend", rule: "run go vet first", scope: "packages/api", by: "backend", at: NOW }],
      interview: { batch: [], deferred: 0 },
    })
  })

  it("says the log is unreadable when a line does not verify, and still serves what did", () => {
    const dir = atlasDir()
    appendReview(dir, { kind: "hold", nodeKey: "nk-a", at: NOW, by: "alice" })
    appendFileSync(reviewLogPath(dir), "{torn\n")
    const queue = ok(openSurface(dir).review())
    expect([queue.unreadable, queue.held]).toEqual([true, ["nk-a"]])
  })

  it("serves the interview batch with null for absent values, and a model's draft until a person answers", () => {
    const repoPath = questionRepo()
    const surface = openSurface(repoPath)
    const first = ok(surface.review()).interview
    expect(first.deferred).toBe(0)
    expect(first.batch.map((q) => `${q.kind} ${q.subject}`).sort()).toEqual(["intent packages/a", "owner packages/a", "tier k1"])
    const tier = first.batch.find((q) => q.kind === "tier")
    if (tier === undefined) throw new Error("expected a tier question")
    expect(tier).toEqual({
      id: tier.id,
      kind: "tier",
      subject: "k1",
      ask: tier.ask,
      rank: 0,
      site: "packages/a/src/x.ts",
      options: ["Rule · T1", "Core · T0", "Keep as a hint"],
      nodeKey: "k1",
      draft: null,
    })
    expect(first.batch.find((q) => q.kind === "intent")?.options).toBeNull()
    expect(first.batch.find((q) => q.kind === "owner")?.nodeKey).toBeNull()
    const drafted = { model: "anthropic/claude", why: "an invariant on a file many depend on" }
    appendReview(repoPath, { kind: "answer", questionId: tier.id, answer: "T1", drafted, at: NOW, by: "alice" })
    const withDraft = ok(surface.review()).interview.batch.find((q) => q.id === tier.id)
    expect(withDraft?.draft).toEqual({ answer: "T1", model: drafted.model, why: drafted.why, by: "alice", at: NOW })
    appendReview(repoPath, { kind: "answer", questionId: tier.id, answer: "T1", at: LATER, by: "alice" })
    expect(ok(surface.review()).interview.batch.some((q) => q.id === tier.id)).toBe(false)
  })
})
