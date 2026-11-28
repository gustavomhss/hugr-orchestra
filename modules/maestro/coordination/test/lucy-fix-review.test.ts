import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import { eq } from "drizzle-orm"
import { Context, Effect } from "effect"
import { Board } from "@orchestra/schema/board"
import { AgentV2 } from "@orchestra/core/agent"
import { BoardProjectTable } from "@orchestra/core/board/sql"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, sourceText } from "./fixture/lucy-engagement"
import { cache, canonical, decoded, reader, receipt, refused, request } from "./fixture/lucy-engagement-artifacts"
import { commit } from "./fixture/lucy-engagement-artifact-limits"
import { completedPrior, decodedFix, defaultVerdict, fixedText, fixInputs, fixRequest, fixScript } from "./fixture/lucy-fix-review"
import { fixReceipt, saved, stateV4, stoppedFix } from "./fixture/lucy-fix-review-evidence"

test("F1 public fix retests a captured quote in an independent native Session and replays its closed evidence after reopen", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    let gitCalls = 0
    const provider = fixScript()
    const original = yield* root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host)
      const old = yield* saved(host, prior.report.sessionID)
      expect(old.raw.schema).toBe("review-engagement-state-v3")
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const input = fixRequest(prior.report, "quote-fix", revision)
      const output = yield* host.invoke(input)
      const result = decodedFix(output)
      expect(result.status).toBe("completed")
      expect(result.dispositions.map((item) => item.disposition)).toEqual(["resolved"])
      expect(result.source?.commit).toBe(revision)
      expect(result.source?.files.map((file) => file.path)).toEqual([sourcePath])
      expect(result.citations.map((item) => item.text)).toContain(fixedText.trimEnd())
      expect(result.budget.deadlineAt - result.budget.startedAt).toBe(300_000)
      const started = provider.turns.filter((turn) => turn.index === 0)
      expect(started).toHaveLength(1)
      expect(started[0].sessionID).not.toBe(prior.report.sessionID)
      expect(started[0].sessionID).not.toBe(result.sessionID)
      expect((yield* fixInputs(host, started[0])).map((call) => [call.name, call.status, call.providerExecuted]))
        .toEqual([["code_search", "completed", false]])
      const evidence = yield* fixReceipt(host, result)
      expect(evidence.priorOutput).toBe(prior.output.text)
      expect(canonical(evidence.priorReceipt)).toBe(canonical(prior.evidence.value))
      for (const [id, bytes] of prior.evidence.bodies) expect(evidence.bodies.get(id)).toEqual(bytes)
      expect(evidence.value.examinations).toHaveLength(1)
      expect(evidence.value.replies).toHaveLength(1)
      const state = yield* stateV4(host, result.sessionID)
      expect(state.value.fix.prior).toEqual(result.prior)
      expect(state.value.children.filter((child) => child.role === "verifier")).toHaveLength(1)
      expect(state.raw).not.toHaveProperty("variants")
      expect(canonical((yield* saved(host, prior.report.sessionID)).row.metadata)).toBe(canonical(old.row.metadata))
      expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
      yield* Effect.promise(() => fs.rm(cache(host, input), { recursive: true, force: true }))
      return { input, output, result, evidence, prior, state: canonical(state.row.metadata), calls: root.requests.length }
    }), { stream: provider.stream, onGit: () => { gitCalls++ } })
    yield* commit(root, { [sourcePath]: 'export const sharedValue = "AFTER-COMPLETION"\n', "README.md": "HEAD moved\n" })
    yield* root.open((host) => Effect.gen(function* () {
      const inputs = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const before = gitCalls
      const prior = yield* saved(host, original.prior.report.sessionID)
      const { lucyEngagementV1, ...withoutPrior } = prior.row.metadata ?? {}
      expect(lucyEngagementV1).toBeDefined()
      yield* Effect.gen(function* () {
        yield* host.db.update(SessionTable).set({ metadata: withoutPrior })
          .where(eq(SessionTable.id, original.prior.report.sessionID)).run().pipe(Effect.orDie)
        yield* Effect.promise(() => fs.rm(cache(host, original.prior.input), { recursive: true, force: true }))
        const output = yield* host.invoke(original.input)
        expect(output.text).toBe(original.output.text)
        expect(decodedFix(output)).toEqual(original.result)
        expect(root.requests.length).toBe(original.calls)
        expect(gitCalls).toBe(before)
        expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(inputs)
        const evidence = yield* fixReceipt(host, original.result)
        expect(evidence.bytes).toEqual(original.evidence.bytes)
        expect([...evidence.bodies]).toEqual([...original.evidence.bodies])
        expect(canonical((yield* stateV4(host, original.result.sessionID)).row.metadata)).toBe(original.state)
      }).pipe(Effect.ensuring(host.db.update(SessionTable).set({ metadata: prior.row.metadata })
        .where(eq(SessionTable.id, original.prior.report.sessionID)).run().pipe(Effect.orDie)))
      expect((yield* host.invoke(original.prior.input)).text).toBe(original.prior.output.text)
      expect((yield* host.execution.active).size).toBe(0)
    }), { stream: provider.stream, onGit: () => { gitCalls++ } })
  })))
}, 180_000)

for (const mode of ["unchanged", "unsupported", "refuted"] as const) {
  test(`F2 ${mode} quote judgment is independently retained without an equality shortcut`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => {
      const provider = fixScript({ verdict: (_turn, basis) => {
        const actual = defaultVerdict(basis)
        if (mode === "unsupported") return { ...actual, supporting: [], reason: "The claimed guard has no supporting captured range." }
        if (mode === "refuted") return { ...actual, disposition: "dismissed", reason: "The explicit invariant was misread.",
          refutation: "The captured literal is the permitted state; the earlier claimed prohibition contradicts the stated requirement." }
        return actual
      } })
      return root.open((host) => Effect.gen(function* () {
        const prior = yield* completedPrior(host, `prior-${mode}`)
        expect(prior.report.citations[0].text).toBe(sourceText.trimEnd())
        const revision = mode === "unsupported" ? yield* commit(root, { [sourcePath]: fixedText }) : root.head
        const result = decodedFix(yield* host.invoke(fixRequest(prior.report, `fix-${mode}`, revision)))
        expect(result.status).toBe("completed")
        const expected = mode === "unchanged" ? "open" : mode === "unsupported" ? "question" : "dismissed"
        expect(result.dispositions.map((item) => item.disposition)).toEqual([expected])
        expect(provider.turns.filter((turn) => turn.index === 0)).toHaveLength(1)
        const evidence = yield* fixReceipt(host, result)
        const examination = evidence.value.examinations[0]
        expect(examination.rawReturn.disposition).toBe(mode === "refuted" ? "dismissed" : "resolved")
        if (mode === "unchanged") expect(examination.reason).toBe("unchanged-inputs")
        if (mode === "unsupported") expect(result.questions.map((question) => question.findingID)).toEqual(prior.report.report.findings.map((finding) => finding.id))
        if (mode === "refuted") {
          expect(examination.rawReturn.disposition).toBe("dismissed")
          if (examination.rawReturn.disposition !== "dismissed") return yield* Effect.die("dismissed return missing")
          expect(examination.rawReturn.refutation).toContain("permitted state")
          expect(examination.currentRegionIDs.length).toBeGreaterThan(0)
        }
        expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
      }), { stream: provider.stream })
    }))
  }, 120_000)
}

test("F3 ordinary and fix requests share one parent/requestID namespace in both directions", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = fixScript()
    return root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "namespace-prior")
      const occupied = request("occupied-ordinary", "diligence")
      const old = yield* host.invoke(occupied)
      expect(decoded(old).status).toBe("completed")
      const before = root.requests.length
      refused(yield* host.invoke(fixRequest(prior.report, occupied.requestID, root.head)), "engagement-request-conflict")
      expect(root.requests.length).toBe(before)
      expect((yield* host.invoke(occupied)).text).toBe(old.text)
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const input = fixRequest(prior.report, "occupied-fix", revision)
      const fixed = yield* host.invoke(input)
      expect(decodedFix(fixed).status).toBe("completed")
      const calls = root.requests.length
      refused(yield* host.invoke(request(input.requestID, "diligence")), "engagement-request-conflict")
      refused(yield* host.invoke({ ...input, brief: input.brief + " changed" }), "engagement-request-conflict")
      expect(root.requests.length).toBe(calls)
      expect((yield* host.invoke(input)).text).toBe(fixed.text)
    }), { stream: provider.stream })
  }))
}, 150_000)

test("F3 fix prior authorization uses the real read permission and actual parent before acquisition", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    let reads = 0
    const provider = fixScript()
    return root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "authorized-prior")
      const other = yield* host.sessions.create({ agent: AgentV2.ID.make("maestro"), location: host.parent.location,
        ...(host.parent.model ? { model: host.parent.model } : {}) })
      const before = root.requests.length
      const git = reads
      refused(yield* host.invoke(fixRequest(prior.report, "foreign-fix", root.head), "maestro", other.id), "engagement-fix-prior-not-found")
      expect(root.requests.length).toBe(before)
      expect(reads).toBe(git)
      const agents = Context.get(host.context, AgentV2.Service)
      yield* agents.transform((draft) => draft.update(AgentV2.ID.make("maestro"), (agent) => {
        agent.permissions.push({ action: reader, resource: "*", effect: "deny" })
      }))
      const direct = yield* host.call(reader, { op: "manifest", reportID: prior.report.reportID })
      expect(direct.type).toBe("error")
      expect(direct.text).toContain("not permitted")
      const inputs = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      refused(yield* host.invoke(fixRequest(prior.report, "denied-fix", root.head)), "engagement-fix-permission-denied")
      expect(root.requests.length).toBe(before)
      expect(reads).toBe(git)
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(inputs)
      expect(provider.turns).toEqual([])
    }), { stream: provider.stream, onGit: () => { reads++ } })
  }))
}, 120_000)

test("F3 fix pins the prior built tier despite changed repository settings", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = fixScript()
    return root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "tier-prior")
      expect(prior.report.report?.tier).toBe("deep")
      const rows = yield* host.db.select().from(SessionTable).all().pipe(Effect.orDie)
      const parent = rows.find((row) => row.id === root.parentID)
      if (!parent) return yield* Effect.die("actual parent row missing")
      yield* host.db.insert(BoardProjectTable).values({ id: Board.ProjectID.create(), key: "FIX", name: "Fix tier",
        goal: "Change board tier after the prior was completed.", status: "active", github_state: "off",
        next_issue_number: 1, next_epic_number: 1, repo_project_id: parent.project_id,
        review_tier: "quick", review_accepted_unavailable: ["no-build"] }).run().pipe(Effect.orDie)
      const quick = decoded(yield* host.invoke(request("changed-setting-control", "diligence")))
      expect(quick.status).toBe("completed")
      expect(quick.report?.tier).toBe("quick")
      expect(quick.report?.findings).toEqual([])
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const result = decodedFix(yield* host.invoke(fixRequest(prior.report, "tier-fix", revision)))
      expect(result.status).toBe("completed")
      expect(result.prior?.executionTier).toBe("deep")
      expect(result.dispositions.map((item) => item.disposition)).toEqual(["resolved"])
      expect(provider.turns.filter((turn) => turn.index === 0)).toHaveLength(1)
      const evidence = yield* fixReceipt(host, result)
      const final = prior.evidence.value.operations.find((operation) => operation.kind === "analysis" &&
        operation.operationID === prior.evidence.value.finalAnalysisOperationID)
      if (!final || final.kind !== "analysis") return yield* Effect.die("real final prior analysis missing")
      expect(result.prior?.catalogDigest).toBe(final.catalogDigest)
      expect(evidence.value.operations.filter((operation) => operation.kind === "analysis").map((operation) => operation.catalogDigest))
        .toEqual([final.catalogDigest])
    }), { stream: provider.stream })
  }))
}, 150_000)

test("F2 a foreign supplied observation is fatal instead of being downgraded to an unsupported question", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = fixScript({ verdict: (_turn, basis) => ({ ...defaultVerdict(basis),
      supporting: [{ kind: "tool", observationID: "0".repeat(64) }] }) })
    return root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "foreign-support-prior")
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const input = fixRequest(prior.report, "foreign-support-fix", revision)
      const first = yield* host.invoke(input)
      yield* stoppedFix(root, host, input, first, "engagement-report-invalid")
      expect(provider.turns.filter((turn) => turn.index === 0)).toHaveLength(1)
      expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
      expect((yield* receipt(host, prior.report)).bytes).toEqual(prior.evidence.bytes)
    }), { stream: provider.stream })
  }))
}, 120_000)
