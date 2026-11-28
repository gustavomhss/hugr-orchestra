import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardProjectTable } from "@orchestra/core/board/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewResultV2 } from "../src/v2/governance/review-result"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { fence, reply, run, sourcePath, sourceText, text, type Controls } from "./fixture/lucy-engagement"
import { nativeCode } from "./fixture/lucy-engagement-artifacts"
import { commit } from "./fixture/lucy-engagement-artifact-limits"
import { completedPrior, decodedFix, fixedText, fixRequest, fixScript } from "./fixture/lucy-fix-review"
import { fixReceipt, stoppedFix } from "./fixture/lucy-fix-review-evidence"
import { data, initialCandidate, nativeCalls, variantScript, type VariantCandidate } from "./fixture/lucy-variants"

test("F9 fix authority is the exact old finding/quote file union, even after live neighbor and HEAD changes", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const guard = "src/guard.ts"
    const neighbor = "src/neighbor.ts"
    yield* commit(root, { [guard]: 'export const guard = "OLD-GUARD"\n', [neighbor]: 'export const neighbor = "OUT-OF-FIX"\n' })
    const old = variantScript({ initial: [{ ...initialCandidate, support: { path: guard, startLine: 1, endLine: 1 } }] })
    let mutated = false
    const provider = fixScript({ prior: old.stream, onTurn: (turn) => turn.index !== 0 ? Effect.void : Effect.gen(function* () {
      expect(mutated).toBe(false)
      mutated = true
      yield* commit(root, { [sourcePath]: 'export const sharedValue = "LIVE-POISON"\n',
        [guard]: 'export const guard = "LIVE-GUARD-POISON"\n', "src/new-neighbor.ts": 'export const later = "OUT-OF-FIX-LATER"\n' })
    }), override: (turn) => turn.index === 0 ? nativeCalls([
      { id: "fix_all", name: "code_search", input: { pattern: ".", mode: "regex", paths: ["**"], limit: 200 } },
      { id: "fix_excluded", name: "code_search", input: { pattern: "OUT-OF-FIX", paths: ["**"], limit: 200 } },
    ]) : undefined })
    yield* root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "exact-prior")
      expect(prior.report.source.files.map((file) => file.path)).toContain(neighbor)
      expect(prior.report.report.findings[0].evidence).toEqual({ kind: "quote", path: guard, startLine: 1, endLine: 1 })
      const revision = yield* commit(root, { [sourcePath]: fixedText, [guard]: 'export const guard = "FIXED-GUARD"\n',
        "src/new.ts": 'export const added = "OUT-OF-FIX-NEW"\n' })
      const result = decodedFix(yield* host.invoke(fixRequest(prior.report, "exact-fix", revision)))
      expect(result.status).toBe("completed")
      expect(result.source?.commit).toBe(revision)
      expect(result.source?.files.map((file) => file.path)).toEqual([sourcePath, guard])
      expect(result.prior?.requiredFiles).toEqual([sourcePath, guard])
      expect(mutated).toBe(true)
      const turn = provider.turns.find((entry) => entry.index === 0)
      if (!turn) return yield* Effect.die("actual fix verifier never started")
      const calls = yield* nativeCode(host, turn.sessionID)
      expect(calls).toHaveLength(2)
      expect(calls.every((call) => call.status === "completed")).toBe(true)
      expect(calls[0].body).toContain("FIXED-GUARD")
      for (const call of calls) {
        expect(call.body).not.toContain("LIVE-POISON")
        expect(call.body).not.toContain("LIVE-GUARD-POISON")
        expect(call.body).not.toContain("OUT-OF-FIX-NEW")
        expect(call.body).not.toContain("OUT-OF-FIX-LATER")
        expect(call.body).not.toContain(neighbor)
      }
      const evidence = yield* fixReceipt(host, result)
      expect(evidence.value.operations.filter((operation) => operation.kind === "code")).toHaveLength(2)
      expect(evidence.value.regions.every((region) => region.sourceSha256 === result.source?.sha256)).toBe(true)
      expect(evidence.value.regions.map((region) => region.text).join("\n")).not.toContain("LIVE-")
    }), { stream: provider.stream })
  })))
}, 150_000)

for (const change of ["removed", "renamed", "nonregular"] as const) {
  test(`F9 a ${change} required source fails the whole fix with no receipt or verifier`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => {
      const provider = fixScript()
      return root.open((host) => Effect.gen(function* () {
        const prior = yield* completedPrior(host, `required-${change}`)
        if (change === "removed") {
          yield* Effect.promise(() => fs.rm(path.join(root.directory, sourcePath)))
          yield* root.git("add", "-A")
        } else if (change === "renamed") yield* root.git("mv", sourcePath, "src/renamed.ts")
        else {
          const oid = yield* root.git("rev-parse", `HEAD:${sourcePath}`)
          yield* root.git("update-index", "--cacheinfo", `120000,${oid},${sourcePath}`)
        }
        yield* root.git("commit", "-q", "-m", `real-${change}-required-source`)
        const revision = yield* root.git("rev-parse", "HEAD")
        if (change === "nonregular") expect(yield* root.git("ls-tree", revision, "--", sourcePath)).toContain("120000")
        else expect(yield* root.git("ls-tree", revision, "--", sourcePath)).toBe("")
        const input = fixRequest(prior.report, `fix-${change}`, revision)
        const before = root.requests.length
        const failed = yield* stoppedFix(root, host, input, yield* host.invoke(input), "engagement-fix-source-unavailable")
        expect(failed.result.source).toBeUndefined()
        expect(failed.result.notExamined).toContainEqual({ item: sourcePath,
          reason: change === "nonregular" ? "required-file-nonregular" : "required-file-missing" })
        expect(root.requests.length).toBe(before)
        expect(provider.turns).toEqual([])
        expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
      }), { stream: provider.stream })
    }))
  }, 120_000)
}

test("F9 paths cannot omit a required file after the real predecessor closure has been validated", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = fixScript()
    return root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "scope-prior")
      const input = { ...fixRequest(prior.report, "scope-invalid", root.head), paths: ["outside"] }
      const before = root.requests.length
      yield* stoppedFix(root, host, input, yield* host.invoke(input), "engagement-fix-scope-invalid")
      expect(root.requests.length).toBe(before)
      expect(provider.turns).toEqual([])
    }), { stream: provider.stream })
  }))
}, 120_000)

test("F9 verification cap is selected before current region reads, never refilled, and retains artifact R20", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const candidates = Array.from({ length: 6 }, (_, index) => ({
      path: `src/finding-${index}.txt`, line: index === 0 ? 2 : 1, severity: index === 0 ? "P0" as const : "P1" as const,
      quote: `CAPTURED-FINDING-${index}`, trigger: `The retained invariant ${index} is violated.`,
      class: index < 3 ? "logic.invariant" : "logic.error-path",
    }))
    yield* commit(root, Object.fromEntries(candidates.map((candidate, index) => [candidate.path,
      (index === 0 ? "context\n" : "") + candidate.quote + "\n"])))
    const provider = fixScript({ prior: multipleQuotes(candidates) })
    yield* root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "cap-prior", "artifact")
      expect(prior.report.report.tier).toBe("standard")
      expect(prior.report.report.findings).toHaveLength(6)
      expect(prior.report.report.coverage.notExamined).toContainEqual({ item: "artifact:behavioral-eval", reason: "owner-permission" })
      const revision = yield* commit(root, Object.fromEntries(candidates.map((candidate) => [candidate.path, "FIXED-GUARD\n"])))
      const result = decodedFix(yield* host.invoke(fixRequest(prior.report, "cap-fix", revision)))
      expect(result.status).toBe("completed")
      expect(result.prior?.executionTier).toBe("standard")
      const severity = { P0: 0, P1: 1, P2: 2, P3: 3 } as const
      const sorted = [...prior.report.report.findings].sort((left, right) =>
        severity[left.severity] - severity[right.severity] || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      expect(result.dispositions.filter((item) => item.disposition === "not-examined").map((item) => [item.findingID, item.reason]))
        .toEqual([[sorted[0].id, "region-unavailable"], [sorted[4].id, "verification-budget"], [sorted[5].id, "verification-budget"]])
      expect(provider.turns.filter((turn) => turn.index === 0).map((turn) => turn.findingID).sort())
        .toEqual(sorted.slice(1, 4).map((finding) => finding.id).sort())
      expect(result.dispositions.filter((item) => item.disposition === "resolved")).toHaveLength(3)
      expect(result.notExamined).toContainEqual({ item: "artifact:behavioral-eval", reason: "owner-permission" })
      expect(result).not.toHaveProperty("verdict")
      yield* fixReceipt(host, result)
    }), { stream: provider.stream })
  })))
}, 180_000)

test("valid Quick findings remain eligible but never acquire an independent fix verifier by hidden promotion", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const priorStream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
      const returned = reply(log, modelRequest)
      if (!log.text.includes("Stage: hunt and finish")) return text(returned)
      const card = ReviewResultV2.parse(returned)
      if (!card) throw new Error("Quick predecessor card did not decode")
      return text(fence(ReviewResultV2.TAG, { ...card, findings: [{ id: "Q1", path: sourcePath, line: 1, endLine: 1,
        severity: "P1", confidence: "high", lens: "correctness-logic", class: "logic.invariant",
        node: "lucy-lens-correctness-logic-invariants", rule: "logic.invariant", trigger: "The captured literal violates the stated invariant.",
        rungs: ["quote"], evidence: { kind: "quote", path: sourcePath, startLine: 1, endLine: 1 }, status: "open" }] }))
    }
    const provider = fixScript({ prior: priorStream })
    return root.open((host) => Effect.gen(function* () {
      yield* host.db.insert(BoardProjectTable).values({ id: Board.ProjectID.create(), key: "QFIX", name: "Quick",
        goal: "Real quick predecessor", status: "active", github_state: "off", next_issue_number: 1, next_epic_number: 1,
        repo_project_id: host.parent.projectID, review_tier: "quick", review_accepted_unavailable: ["no-build"] }).run().pipe(Effect.orDie)
      const prior = yield* completedPrior(host, "quick-prior")
      expect(prior.report.report.tier).toBe("quick")
      expect(prior.report.report.findings.map((finding) => finding.id)).toEqual(["Q1"])
      expect(prior.report.citations[0].text).toBe(sourceText.trimEnd())
      expect(root.requests.some((log) => log.text.includes("Stage: verify"))).toBe(false)
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const result = decodedFix(yield* host.invoke(fixRequest(prior.report, "quick-fix", revision)))
      expect(result.status).toBe("completed")
      expect(result.prior?.executionTier).toBe("quick")
      expect(result.dispositions).toMatchObject([{ findingID: "Q1", disposition: "not-examined", reason: "independent-verification-unavailable" }])
      expect(provider.turns).toEqual([])
      const evidence = yield* fixReceipt(host, result)
      expect(evidence.value.examinations).toEqual([])
      expect(evidence.value.replies).toEqual([])
    }), { stream: provider.stream })
  }))
}, 150_000)

function multipleQuotes(candidates: readonly (VariantCandidate & { readonly class: string })[]): NonNullable<Controls["stream"]> {
  return variantScript({ override: (turn) => {
    if (turn.kind === "lens") {
      const lens = /Stage: hunt, lens ([^,]+),/.exec(turn.log.text)?.[1]
      if (!lens) throw new Error("real lens stage identity missing")
      return text(fence(ReviewFanoutV2.TAGS.lens, { lens, candidates: lens === "correctness-logic"
        ? candidates.map((candidate) => ({ ...candidate, node: "lucy-lens-correctness-logic-invariants" })) : [],
        observations: [], hunks: [], items: [] }))
    }
    if (turn.kind !== "verify") return undefined
    const offered = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ id: Schema.String, class: Schema.String,
      path: Schema.String, line: Schema.Number, endLine: Schema.optional(Schema.Number), region: Schema.String,
      options: Schema.Array(Schema.Struct({ id: Schema.String })) })))(data(turn.log.text, "candidates"))
    if (!offered.length) throw new Error("real prior verifier received no candidates")
    const results = offered.map((item) => {
      const candidate = candidates.find((candidate) => candidate.path === item.path && candidate.line === item.line)
      if (!candidate) throw new Error("prior verifier candidate differs")
      expect(item.region).toContain(candidate.quote)
      expect(item.options.some((option) => option.id === "quote")).toBe(true)
      return { candidate: item.id, state: "confirmed", rung: "quote", history: [{ option: "quote", outcome: "settled" }],
        evidence: { kind: "quote", path: item.path, startLine: item.line, endLine: item.endLine ?? item.line } }
    })
    return text(fence(ReviewFanoutV2.TAGS.verify, { class: offered[0].class, results }))
  } }).stream
}
