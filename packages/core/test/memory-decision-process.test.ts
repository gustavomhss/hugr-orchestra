import { afterAll, beforeAll, expect } from "bun:test"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Effect, Fiber } from "effect"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { testEffect } from "./lib/effect"
import { expectSpawn } from "./fixture/omni-expect"
import { MemoryDecisionProcess } from "./fixture/memory-decision-process"

const it = testEffect(LayerNode.compile(AppProcess.node))
let harness: Awaited<ReturnType<typeof MemoryDecisionProcess.make>>
beforeAll(async () => { harness = await MemoryDecisionProcess.make() })
afterAll(() => harness?.dispose())
const rule = { rule: "independent processes must agree on one receipt", scope: "src" }
const at = "2026-11-12T12:00:00.000Z"

it.live("CONTROL L11 process: actual actor and Git complete through AppProcess before race assertions", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const proc = yield* AppProcess.Service
  const f = yield* Effect.promise(() => harness.fresh())
  const proposed = harness.api.proposeProjectRule(f.binding, rule, at)
  expect(proposed.ok).toBe(true)
  if (!proposed.ok) return yield* Effect.die(new Error(proposed.reason))
  const actor = yield* Effect.promise(() => harness.participant(f, "control", {
    proposalId: proposed.proposalId, verdict: "indexed", by: "owner",
  }, false))
  const run = yield* proc.run(actor.command, { timeout: "20 seconds" })
  expect(run.exitCode, run.stderr.toString()).toBe(0)
  const observed = harness.result(actor.input.result)
  expect(observed.pid).not.toBe(process.pid)
  expect(observed.result.ok).toBe(true)
  expect(observed.review.rejected).toBe(0)
  expect(observed.memory.rejected).toBe(0)
  expect(observed.memory.store).toEqual([{ owner: "backend", kind: "project", entry: { ...rule, frecency: 1 } }])
  expect(harness.api.foldReview(observed.review.records).memoryDecisions).toHaveLength(1)
  expect(readFileSync(actor.reached, "utf8")).toBe("actual scan completed")
  const initialized = yield* MemoryDecisionProcess.git(proc, f.repo, ["init", "--initial-branch=base"])
  expect(initialized.exitCode, initialized.stderr.toString()).toBe(0)
  const root = yield* MemoryDecisionProcess.git(proc, f.repo, ["rev-parse", "--show-toplevel"])
  expect(root.exitCode, root.stderr.toString()).toBe(0)
  expect(root.stdout.toString().trim()).toBe(f.repo)
}))

for (const contender of ["indexed", "discarded"] as const) {
  it.live(`L11 process: indexed/${contender} contenders publish one winner and reopen consistently`, Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const proc = yield* AppProcess.Service
    const f = yield* Effect.promise(() => harness.fresh())
    const proposed = harness.api.proposeProjectRule(f.binding, rule, at)
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return yield* Effect.die(new Error(proposed.reason))
    const proposalId = proposed.proposalId
    yield* Effect.gen(function* () {
      const a = yield* Effect.promise(() => harness.participant(f, "left", {
        proposalId, verdict: "indexed", by: "left-owner", rule: "left process effective rule",
      }, true))
      const b = yield* Effect.promise(() => harness.participant(f, "right", {
        proposalId, verdict: contender, by: "right-owner", ...(contender === "indexed" ? { rule: "right process effective rule" } : {}),
      }, contender === "indexed"))
      const left = yield* proc.run(a.command, { timeout: "30 seconds" }).pipe(Effect.forkChild)
      // Actual scanner input/output proves the left process reached preparation, without instrumenting policy.
      yield* MemoryDecisionProcess.waitForFile(a.reached)
      const right = yield* proc.run(b.command, { timeout: "30 seconds" }).pipe(Effect.forkChild)
      yield* (contender === "indexed" ? MemoryDecisionProcess.waitForFile(b.reached) : MemoryDecisionProcess.waitForFile(b.input.result))
      expect(existsSync(a.input.result)).toBe(false)
      expect(readFileSync(path.join(f.control, "left.payload"), "utf8")).toContain("left process effective rule")
      yield* Effect.sync(() => writeFileSync(f.release, "release both real preparations"))
      const exits = yield* Effect.all([Fiber.join(left), Fiber.join(right)])
      exits.forEach((result) => expect(result.exitCode, result.stderr.toString()).toBe(0))
      const results = [harness.result(a.input.result), harness.result(b.input.result)]
      expect(results[0]!.pid).not.toBe(results[1]!.pid)
      const winners = results.filter((result) => result.result.ok)
      expect(winners).toHaveLength(1)
      const loser = results.find((result) => !result.result.ok)!
      expect(loser.result).toMatchObject({ ok: false, refusal: "proposal-not-open" })
      const review = harness.api.readReview(f.repo)
      const folded = harness.api.foldReview(review.records)
      const memory = harness.api.createDurableMemory(f.repo).read()
      expect(review.rejected).toBe(0)
      expect(memory.rejected).toBe(0)
      results.forEach((result) => {
        expect(result.review.rejected).toBe(0)
        expect(result.memory.rejected).toBe(0)
        expect(harness.api.foldReview(result.review.records).memoryDecisions).toHaveLength(1)
        expect(result.memory.store).toEqual(memory.store)
      })
      expect(folded.openMemoryProposals).toHaveLength(0)
      expect(folded.memoryDecisions).toHaveLength(1)
      const winner = winners[0]!
      if (!winner.result.ok) return yield* Effect.die(new Error("Expected actual winning result"))
      expect(folded.memoryDecisions[0]?.id).toBe(winner.result.decisionId)
      const winnerInput = winner.pid === results[0]!.pid ? a.input : b.input
      expect(folded.memoryDecisions[0]?.verdict).toBe(winnerInput.decision.verdict)
      expect(memory.store).toHaveLength(winnerInput.decision.verdict === "indexed" ? 1 : 0)
      if (winnerInput.decision.verdict === "indexed") {
        expect(memory.store[0]).toMatchObject({ owner: "backend", kind: "project", entry: {
          rule: winnerInput.decision.rule, scope: rule.scope, frecency: 1,
        } })
        expect(winner.result.ref).toBeDefined()
        expect(memory.log.get(winner.result.ref!.eventId)).toMatchObject({
          contentHash: winner.result.ref!.contentHash, payload: memory.store[0],
        })
      }
      expect(readdirSync(path.join(f.repo, ".atlas/project/memory-decisions")).filter((name) => name.endsWith(".jsonl")))
        .toEqual([`${proposalId}.jsonl`])
      // A third independent process is the restart/retry oracle, using only the persisted winner.
      const retry = yield* Effect.promise(() => harness.participant(f, "retry", winnerInput.decision, false))
      const reopened = yield* proc.run(retry.command, { timeout: "20 seconds" })
      expect(reopened.exitCode, reopened.stderr.toString()).toBe(0)
      expect(harness.result(retry.input.result).result).toEqual(winner.result)
      expect(harness.result(retry.input.result).memory.store).toEqual(memory.store)
      expect(harness.api.foldReview(harness.result(retry.input.result).review.records).memoryDecisions).toEqual(folded.memoryDecisions)
      expect(existsSync(retry.reached)).toBe(false)
    }).pipe(Effect.ensuring(Effect.sync(() => writeFileSync(f.release, "release held scanner during owned cleanup"))))
  }).pipe(Effect.scoped))
}

for (const placement of ["root", "atlas-module"] as const) {
  it.live(`L11 Git: divergent same-proposal receipts conflict at ${placement} and neither projection activates`, Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const proc = yield* AppProcess.Service
    const f = yield* Effect.promise(() => harness.fresh())
    const root = f.repo
    const storage = placement === "root" ? root : path.join(root, "modules/atlas")
    mkdirSync(storage, { recursive: true })
    const binding = { ...f.binding, storage: { ...f.binding.storage, root: storage }, source: { ...f.binding.source, worktree: storage } }
    writeFileSync(path.join(root, ".gitattributes"), readFileSync(path.join(harness.source, ".gitattributes")))
    mkdirSync(path.join(root, "modules/atlas"), { recursive: true })
    writeFileSync(path.join(root, "modules/atlas/.gitattributes"), readFileSync(path.join(harness.source, "modules/atlas/.gitattributes")))
    const git = (args: string[]) => MemoryDecisionProcess.git(proc, root, args).pipe(Effect.tap((result) =>
      Effect.sync(() => expect(result.exitCode, result.stderr.toString()).toBe(0))))
    yield* git(["init", "--initial-branch=base"])
    yield* git(["config", "user.name", "Receipt acceptance"])
    yield* git(["config", "user.email", "receipt-acceptance@example.invalid"])
    const proposed = harness.api.proposeProjectRule(binding, rule, at)
    expect(proposed.ok).toBe(true)
    if (!proposed.ok) return yield* Effect.die(new Error(proposed.reason))
    yield* git(["add", ".gitattributes", "modules/atlas/.gitattributes", path.relative(root, path.join(storage, ".atlas"))])
    yield* git(["commit", "-m", "test: record actual proposal"])
    yield* git(["checkout", "-b", "left"])
    const indexed = harness.api.decideProjectRule(binding, { proposalId: proposed.proposalId, verdict: "indexed", by: "left-owner" }, at)
    expect(indexed.ok).toBe(true)
    const receipt = path.join(storage, ".atlas/project/memory-decisions", `${proposed.proposalId}.jsonl`)
    expect(existsSync(receipt)).toBe(true)
    yield* git(["add", path.relative(root, path.join(storage, ".atlas"))])
    yield* git(["commit", "-m", "test: index actual proposal"])
    yield* git(["checkout", "-b", "right", "base"])
    const discarded = harness.api.decideProjectRule(binding, { proposalId: proposed.proposalId, verdict: "discarded", by: "right-owner" }, at)
    expect(discarded.ok).toBe(true)
    yield* git(["add", path.relative(root, path.join(storage, ".atlas"))])
    yield* git(["commit", "-m", "test: discard actual proposal"])
    yield* git(["checkout", "left"])
    const attribute = yield* git(["check-attr", "merge", "--", path.relative(root, receipt)])
    expect(attribute.stdout.toString()).not.toContain(": merge: union")
    const merged = yield* MemoryDecisionProcess.git(proc, root, ["merge", "--no-edit", "right"])
    expect(merged.exitCode).toBe(1)
    const unmerged = yield* git(["diff", "--name-only", "--diff-filter=U"])
    expect(unmerged.stdout.toString().trim()).toBe(path.relative(root, receipt).split(path.sep).join("/"))
    const bytes = readFileSync(receipt, "utf8")
    expect(bytes).toContain("<<<<<<<")
    expect(bytes).toContain(">>>>>>>")
    const review = harness.api.readReview(storage)
    const memory = harness.api.createDurableMemory(storage).read()
    expect(review.rejected).toBeGreaterThan(0)
    expect(memory.rejected).toBeGreaterThan(0)
    expect(harness.api.foldReview(review.records).memoryDecisions).toHaveLength(0)
    expect(memory.store).toHaveLength(0)
  }).pipe(Effect.scoped))
}
