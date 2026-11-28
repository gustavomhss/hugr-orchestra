import { expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { SessionScope } from "@orchestra/core/session/scope"
import { SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, text } from "./fixture/lucy-engagement"
import { decoded, reader, receipt, refused, request } from "./fixture/lucy-engagement-artifacts"
import { observedVariants } from "./fixture/lucy-variants-assertions"
import { data, fullSearch, nativeCalls, nativeSearches, nativeSearchResult, proposalReply, variantScript } from "./fixture/lucy-variants"
import { installSources, pairSource } from "./fixture/lucy-variants-source"

for (const scenario of ["missing-seed", "only-lead", "multiple", "unavailable", "input-scope", "invalid-proposal"] as const) {
  test(`native variant witness ${scenario} cannot become an independently verified continuing generation`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const source = yield* pairSource(root)
      const input = { ...request(`variant-witness-${scenario}`), revision: source.revision }
      const invalidPattern = fullSearch("(")
      const provider = variantScript({ generations: [{ search: source.search, candidates: source.candidates }],
        override: (turn) => {
          if (turn.kind === "entry" && turn.index === 0)
            return nativeCalls([{ name: "code_search", input: source.search, id: "real_lead_control" }])
          if (turn.kind !== "variant-proposal") return undefined
          if (scenario === "only-lead") return text(proposalReply(turn, []))
          if (turn.index === 0) {
            const { paths, ...withoutPaths } = source.search
            void paths
            const search = scenario === "missing-seed" ? fullSearch("PAIR_VARIANT")
              : scenario === "unavailable" ? invalidPattern : scenario === "input-scope" ? withoutPaths : source.search
            return nativeCalls((scenario === "multiple" ? [1, 2] : [1]).map((id) => ({
              name: "code_search", input: search, id: `actual_variant_attempt_${id}`,
            })))
          }
          if (scenario === "invalid-proposal") {
            const seed = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(data(turn.log.text, "seed"))
            return text(proposalReply(turn, source.candidates, {
              seedFindingID: seed.id + "-foreign", patternChange: "Actual full search, invalid proposal identity.",
              candidates: source.candidates,
            }))
          }
          return undefined
        },
      })
      yield* root.open((host) => Effect.gen(function* () {
        const output = yield* host.invoke(input)
        const report = decoded(output)
        expect(report.status).toBe("completed")
        expect(report.report?.findings).toHaveLength(1)
        expect(provider.turns.some((turn) => turn.kind === "verify")).toBe(true)
        const lead = yield* nativeSearches(host, report.sessionID)
        expect(lead).toHaveLength(1)
        expect(nativeSearchResult(lead[0]).result.matches).toHaveLength(3)
        expect(provider.proposals).toHaveLength(1)
        expect(provider.verifiers).toHaveLength(0)
        const actual = yield* nativeSearches(host, provider.proposals[0].sessionID)
        expect(actual).toHaveLength(scenario === "only-lead" ? 0 : scenario === "multiple" ? 2 : 1)
        expect(actual.map((call) => call.status)).toEqual(actual.map(() => scenario === "unavailable" ? "error" : "completed"))
        expect(actual.every((call) => call.providerExecuted === false)).toBe(true)
        if (scenario === "missing-seed") {
          const result = nativeSearchResult(actual[0]).result
          expect(result.matches).toHaveLength(2)
          expect(result.matches.some((match) => match.path === "src/a.ts")).toBe(false)
          expect(result.basis.coverage.complete).toBe(true)
        }
        const evidence = yield* receipt(host, report)
        const checked = yield* observedVariants(host, input, evidence)
        const generation = checked.variants.generations[0]
        expect(generation.attempts).toHaveLength(actual.length)
        const reason = scenario === "missing-seed" ? "seed-not-matched" : scenario === "unavailable" ? "search-unavailable" : "stage-invalid"
        const detail = scenario === "only-lead" || scenario === "multiple" ? "search-attempt-count"
          : scenario === "input-scope" ? "search-input-scope" : scenario === "invalid-proposal" ? "proposal-seed" : undefined
        expect(checked.variants.stop).toBe(reason)
        expect(generation.decision).toEqual({ type: "stop", reason, ...(detail ? { detail } : {}) })
        if (scenario === "invalid-proposal") {
          expect(generation.search.status).toBe("accepted")
          if (generation.search.status !== "accepted") return yield* Effect.die("invalid proposal erased an actual valid search")
          expect(generation.search.rawMatches).toBe(3)
          expect(generation.search.counts).toEqual({ matches: 2, confirmed: 0, noise: 0, questions: 0, notExamined: 2 })
          expect(generation.search.matches.map((match) => ({ state: match.state,
            reason: match.state === "not-examined" ? match.reason : undefined }))).toEqual([
            { state: "not-examined", reason: "stage-invalid" }, { state: "not-examined", reason: "stage-invalid" },
          ])
        } else {
          expect(generation.search.status).toBe("rejected")
          expect(generation.search).not.toHaveProperty("counts")
          expect(generation.search).toMatchObject({ reason, ...(detail ? { detail } : {}) })
        }
        if (scenario === "unavailable") expect(generation.attempts[0].operationID).toBeUndefined()
        const before = root.requests.length
        expect((yield* host.invoke(input)).text).toBe(output.text)
        expect(root.requests.length).toBe(before)
      }), { stream: provider.stream })
    })))
  }, 120_000)
}

for (const kind of ["page", "binary"] as const) {
  test(`real registered ${kind} incompleteness stops before any variant verifier or noise ratio`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const name = kind === "page" ? "src/paged-variants.txt" : "src/late-binary.txt"
      const contents = kind === "page"
        ? Array.from({ length: 201 }, (_, index) => `PAGE_VARIANT_${String(index).padStart(3, "0")}\n`).join("")
        : "BINARY_VARIANT\n" + "padding-without-a-match\n".repeat(16_000) + "\0tail\n"
      expect(Buffer.byteLength(contents)).toBeLessThan(4 * 1024 * 1024)
      if (kind === "binary") expect(Buffer.from(contents).indexOf(0)).toBeGreaterThan(256 * 1024)
      const revision = yield* installSources(root, { [name]: contents })
      const search = fullSearch(kind === "page" ? "sharedValue|PAGE_VARIANT" : "sharedValue|BINARY_VARIANT")
      const input = { ...request(`variant-incomplete-${kind}`), revision }
      const provider = variantScript({ generations: [{ search, candidates: [] }], override: (turn) =>
        turn.kind === "entry" && turn.index === 0 ? nativeCalls([
          { name: "code_search", input: fullSearch(), id: "complete_native_control" },
          { name: "code_search", input: search, id: "incomplete_native_control" },
        ]) : undefined })
      yield* root.open((host) => Effect.gen(function* () {
        const report = decoded(yield* host.invoke(input))
        expect(report.status).toBe("completed")
        expect(report.report?.findings).toHaveLength(1)
        const native = yield* nativeSearches(host, report.sessionID)
        expect(native).toHaveLength(2)
        const positive = nativeSearchResult(native[0]).result
        expect(positive.matches).toHaveLength(1)
        expect(positive.basis.coverage.complete).toBe(true)
        expect(positive.basis.coverage.binariesSkipped).toBe(0)
        const control = nativeSearchResult(native[1]).result
        expect(control.basis.coverage.complete).toBe(false)
        if (kind === "page") {
          expect(control.matches).toHaveLength(200)
          expect(control.next).toBe(200)
          expect(control.basis.bounds.truncated).toBe(true)
          expect(control.basis.coverage.binariesSkipped).toBe(0)
        } else {
          expect(control.basis.coverage.binariesSkipped).toBe(1)
          expect(control.matches).toContainEqual(expect.objectContaining({ path: "src/a.ts", line: 1 }))
          expect(control.next).toBeUndefined()
        }
        // Both native engine controls above run in the predecessor before the missing-stage target.
        expect(provider.proposals).toHaveLength(1)
        expect(provider.verifiers).toHaveLength(0)
        const actual = yield* nativeSearches(host, provider.proposals[0].sessionID)
        expect(actual).toHaveLength(1)
        const observed = nativeSearchResult(actual[0]).result
        expect(observed.basis.coverage).toEqual(control.basis.coverage)
        expect(observed.matches).toEqual(control.matches)
        expect(observed.next).toBe(control.next)
        const checked = yield* observedVariants(host, input, yield* receipt(host, report))
        expect(checked.variants.stop).toBe("search-incomplete")
        expect(checked.variants.generations[0].search).toMatchObject({ status: "rejected", reason: "search-incomplete" })
        expect(checked.variants.generations[0].search).not.toHaveProperty("counts")
        expect(report.notExamined).toContainEqual({ item: "audit:variants", reason: "search-incomplete" })
      }), { stream: provider.stream })
    })))
  }, 150_000)
}

test("a forged initial tool URI fails the proof barrier before any variant Session or search; the real positive remains replayable", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const positive = variantScript()
    const original = yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(request("variant-proof-positive")))
      expect(report.status).toBe("completed")
      expect(report.report?.findings).toHaveLength(1)
      expect(report.report?.findings[0].evidence.kind).toBe("quote")
      expect(positive.turns.some((turn) => turn.kind === "verify")).toBe(true)
      return { report, evidence: yield* receipt(host, report) }
    }), { stream: positive.stream })
    const forged = variantScript({ forgeInitialTool: true })
    yield* root.open((host) => Effect.gen(function* () {
      const scopes = () => host.db.select().from(SessionTable).all().pipe(Effect.orDie, Effect.map((rows) => rows.flatMap((row) => {
        const stored = row.metadata?.[SessionScope.KEY]
        return stored ? [Schema.decodeUnknownSync(SessionScope.State)(stored)] : []
      }).filter((state) => state.scope.skills.entry === "lucy-audit-variant")))
      const before = yield* scopes()
      const input = request("variant-proof-forged")
      const output = yield* host.invoke(input)
      expect(forged.turns.some((turn) => turn.kind === "verify")).toBe(true)
      refused(output, "engagement-report-invalid")
      expect(forged.proposals).toEqual([])
      expect(forged.verifiers).toEqual([])
      expect(yield* scopes()).toEqual(before)
      const calls = root.requests.length
      const stopped = yield* host.invoke(input)
      const report = decoded(stopped)
      expect(report.status).toBe("failed")
      expect(report.report).toBeUndefined()
      refused(yield* host.call(reader, { op: "manifest", reportID: report.reportID }), "engagement-evidence-unavailable")
      expect((yield* host.invoke(input)).text).toBe(stopped.text)
      expect(root.requests.length).toBe(calls)
      const evidence = yield* receipt(host, original.report)
      expect(evidence.index).toEqual(original.evidence.index)
      expect(evidence.bytes).toEqual(original.evidence.bytes)
    }), { stream: forged.stream })
  })))
}, 150_000)
