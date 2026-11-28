import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { Board } from "@orchestra/schema/board"
import { BoardProjectTable } from "@orchestra/core/board/sql"
import { ReviewTools } from "@orchestra/core/review/tools"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, type Ctx } from "./fixture/lucy-engagement"
import { cache, decoded, digest, receipt, request } from "./fixture/lucy-engagement-artifacts"
import { accepted, observedVariants } from "./fixture/lucy-variants-assertions"
import { data, fullSearch, nativeCalls, nativeSearches, nativeSearchResult, variantScript, type VariantTurn } from "./fixture/lucy-variants"
import { candidate, hiddenPath, installSources, lineagePath, lineageSource, liveMarker, outsideMarker, pairSource } from "./fixture/lucy-variants-source"

test("three native generations preserve one deterministic lineage, distinct quote regions and captured authority through durable replay", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const source = yield* lineageSource(root)
    const input = { ...request("variant-three-generations"), revision: source.revision }
    let current: Ctx | undefined
    let copied: string | undefined
    const controls = [
      { pattern: "VARIANT_(SEED|G[1-3])", mode: "regex" as const, offset: 0, limit: 200, context: 0 },
      fullSearch("VARIANT_(SEED|G[1-3])"),
    ]
    const provider = variantScript({ initial: source.initial, generations: source.generations,
      override: (turn) => turn.kind === "entry" && turn.index === 0 ? nativeCalls(controls.map((search, index) => ({
        name: "code_search", input: search, id: `source_control_${index}`,
      }))) : undefined,
      onTurn: (turn) => turn.kind !== "entry" || turn.index !== 0 ? Effect.void : Effect.scoped(Effect.gen(function* () {
        if (!current) return yield* Effect.die("native graph was not installed before the provider")
        const held = yield* ReviewTools.readCode(turn.sessionID)
        copied = held.source.directory
        expect(copied).not.toBe(root.directory)
        expect(held.source.commit).toBe(source.revision)
        // Mutate both mutable views after capture, before either actual lexical control.
        for (const directory of [root.directory, copied]) for (const file of Object.keys(source.files)) {
          yield* Effect.promise(async () => {
            const target = path.join(directory, file)
            await fs.chmod(target, 0o600)
            await fs.writeFile(target, `export const replaced = "${liveMarker}";\n`)
          })
        }
      })).pipe(Effect.orDie),
    })
    const original = yield* root.open((host) => Effect.gen(function* () {
      current = host
      const output = yield* host.invoke(input)
      const report = decoded(output)
      expect(report.status).toBe("completed")
      expect(report.source?.commit).toBe(source.revision)
      expect(report.report?.findings.filter((finding) => finding.path === lineagePath)).toHaveLength(2)
      expect(report.citations).toContainEqual(expect.objectContaining({ path: lineagePath, startLine: 3, endLine: 3, text: source.support }))
      const native = yield* nativeSearches(host, report.sessionID)
      expect(native).toHaveLength(2)
      const ignored = nativeSearchResult(native[0]).result
      const explicit = nativeSearchResult(native[1]).result
      expect(ignored.matches).toHaveLength(10)
      expect(ignored.matches.some((match) => match.path === hiddenPath)).toBe(false)
      expect(explicit.matches).toHaveLength(11)
      expect(explicit.matches).toContainEqual(expect.objectContaining({ path: hiddenPath, line: 1 }))
      expect(JSON.stringify(explicit)).not.toContain(outsideMarker)
      expect(JSON.stringify(explicit)).not.toContain(liveMarker)
      expect(provider.turns.some((turn) => turn.kind === "verify")).toBe(true)
      // All predecessor controls above remain genuine; this is the missing behavior on the baseline.
      expect(provider.proposals).toHaveLength(3)
      expect(provider.verifiers).toHaveLength(3)
      expect(new Set([...provider.proposals, ...provider.verifiers].map((turn) => turn.sessionID)).size).toBe(6)
      const evidence = yield* receipt(host, report)
      const checked = yield* observedVariants(host, input, evidence)
      expect(checked.variants.limit).toBe(3)
      expect(checked.variants.stop).toBe("generation-limit")
      expect(checked.variants.initialSeedIDs).toHaveLength(2)
      expect(checked.variants.unexpandedInitialSeedIDs).toEqual(checked.variants.initialSeedIDs.slice(1))
      const first = checked.variants.seeds.find((seed) => seed.seedID === checked.variants.initialSeedIDs[0])
      expect(first?.finding).toMatchObject({ path: lineagePath, line: 1, severity: "P1" })
      expect(first?.examination.quoteRegionID).not.toBe(first?.examination.regionID)
      for (const seed of checked.variants.seeds) expect(seed.finding).toMatchObject({ class: "logic.invariant",
        node: "lucy-lens-correctness-logic-invariants", lens: "correctness-logic", rule: "logic.invariant" })
      for (const region of checked.variants.regions) {
        const original = source.files[region.path]
        if (original === undefined) return yield* Effect.die("a captured region escaped the fixture's original source files")
        expect(region.blobSha256).toBe(digest(original))
        expect(region.oid).toBe(report.source?.files.find((file) => file.path === region.path)?.oid)
      }
      for (const ordinal of [1, 2, 3]) {
        const { generation, search } = accepted(checked.value, ordinal)
        expect(search.counts).toEqual({ matches: 3, confirmed: 2, noise: 1, questions: 0, notExamined: 0 })
        expect(search.rawMatches).toBe(2 + ordinal * 3)
        expect(search.distinctMatches).toBe(search.rawMatches)
        expect(search.excluded).toHaveLength(2 + (ordinal - 1) * 3)
        const expected = source.generations[ordinal - 1].candidates.map((item) => `${item.path}:${item.line}`).sort()
        expect(search.matches.map((item) => `${item.path}:${item.line}`).sort()).toEqual(expected)
        expect(search.excluded.filter((item) => item.reason === "seed")).toHaveLength(1)
        expect(search.control).toEqual(ordinal === 1 ? { path: lineagePath, line: 1 }
          : { path: `src/generation-${ordinal - 1}.ts`, line: 1 })
        if (ordinal < 3) {
          expect(generation.decision.type).toBe("continue")
          if (generation.decision.type !== "continue") return yield* Effect.die("continuing generation unexpectedly stopped")
          expect(checked.variants.generations[ordinal].seed).toEqual(generation.decision.nextSeed)
        } else expect(generation.decision).toEqual({ type: "stop", reason: "generation-limit" })
      }
      expect(report.report?.findings).toHaveLength(8)
      expect(new Set(report.report?.findings.map((finding) => finding.id)).size).toBe(8)
      expect(report.report).not.toHaveProperty("verdict")
      expect(report.notExamined).toContainEqual({ item: "audit:variants", reason: "generation-limit" })
      expect(report.notExamined).not.toContainEqual({ item: "audit:variants", reason: "not-built" })
      expect(JSON.stringify(report.citations)).not.toContain(liveMarker)
      expect(JSON.stringify(checked.variants)).not.toContain(outsideMarker)
      expect(JSON.stringify(checked.variants)).not.toContain(liveMarker)
      expect((yield* host.execution.active).size).toBe(0)
      return { output, report, evidence, cache: cache(host, input), calls: root.requests.length }
    }), { stream: provider.stream })
    const capturedCopy = copied
    if (!capturedCopy) return yield* Effect.die("actual captured copy was not observed")
    expect(yield* Effect.promise(() => fs.access(capturedCopy).then(() => true, () => false))).toBe(false)
    yield* Effect.promise(() => fs.rm(original.cache, { recursive: true, force: true }))
    yield* root.git("add", "-A")
    yield* root.git("commit", "-q", "-m", "move-live-head-after-variant-report")
    expect(yield* root.git("rev-parse", "HEAD")).not.toBe(source.revision)
    const gitReads: string[][] = []
    yield* root.open((host) => Effect.gen(function* () {
      yield* host.db.insert(BoardProjectTable).values({ id: Board.ProjectID.create(), key: "VARIANTS", name: "Variants",
        goal: "Changed after the original report", status: "active", github_state: "off", next_issue_number: 1,
        next_epic_number: 1, repo_project_id: host.parent.projectID, review_tier: "quick" }).run().pipe(Effect.orDie)
      const before = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const reads = gitReads.length
      const output = yield* host.invoke(input)
      expect(output.text).toBe(original.output.text)
      const evidence = yield* receipt(host, decoded(output))
      expect(evidence.index).toEqual(original.evidence.index)
      expect(evidence.bytes).toEqual(original.evidence.bytes)
      expect([...evidence.bodies]).toEqual([...original.evidence.bodies])
      expect(gitReads.length).toBe(reads)
      expect(root.requests.length).toBe(original.calls)
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(before)
    }), { onGit: (args) => { gitReads.push([...args]) }, stream: provider.stream })
  })))
}, 180_000)

test("one actual refutation among two fresh matches stops at exactly half without letting the known seed dilute noise", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const source = yield* pairSource(root)
    const input = { ...request("variant-half-noise"), revision: source.revision }
    const provider = variantScript({ generations: [{ search: source.search, candidates: source.candidates,
      dispositions: [{ path: source.candidates[1].path, line: source.candidates[1].line, state: "noise" }] }],
      override: leadControl(source.search) })
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(input))
      expect(report.status).toBe("completed")
      const control = yield* nativeSearches(host, report.sessionID)
      expect(control).toHaveLength(1)
      expect(nativeSearchResult(control[0]).result.matches).toHaveLength(3)
      expect(provider.turns.some((turn) => turn.kind === "verify")).toBe(true)
      expect(provider.proposals).toHaveLength(1)
      expect(provider.verifiers).toHaveLength(1)
      const checked = yield* observedVariants(host, input, yield* receipt(host, report))
      const { generation, search } = accepted(checked.value)
      expect(search.rawMatches).toBe(3)
      expect(search.excluded).toHaveLength(1)
      expect(search.counts).toEqual({ matches: 2, confirmed: 1, noise: 1, questions: 0, notExamined: 0 })
      expect(generation.decision).toEqual({ type: "stop", reason: "half-noise" })
      expect(checked.variants.stop).toBe("half-noise")
      expect(report.report?.findings).toHaveLength(2)
      expect(report.report?.questions).toEqual([])
      expect(report.notExamined).toContainEqual({ item: "audit:variants", reason: "half-noise" })
    }), { stream: provider.stream })
  })))
}, 120_000)

for (const scenario of ["no-confirmed-seed", "quick", "diligence", "artifact", "no-new-matches"] as const) {
  test(`public variant eligibility ${scenario} retains an explicit durable zero-work or known-instance outcome`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => {
      const profile = scenario === "diligence" || scenario === "artifact" ? scenario : "audit"
      const input = request(`variant-zero-${scenario}`, profile)
      const provider = variantScript({ ...(scenario === "no-confirmed-seed" ? { initial: [] } : {}), override: leadControl(fullSearch()) })
      return root.open((host) => Effect.gen(function* () {
        if (scenario === "quick") yield* host.db.insert(BoardProjectTable).values({ id: Board.ProjectID.create(), key: "QUICK",
          name: "Quick", goal: "Use the actual pinned Quick execution tier", status: "active", github_state: "off",
          next_issue_number: 1, next_epic_number: 1, repo_project_id: host.parent.projectID, review_tier: "quick" }).run().pipe(Effect.orDie)
        const report = decoded(yield* host.invoke(input))
        expect(report.status).toBe("completed")
        expect(report.report).not.toHaveProperty("verdict")
        if (scenario !== "quick") {
          const control = yield* nativeSearches(host, report.sessionID)
          expect(control).toHaveLength(1)
          expect(nativeSearchResult(control[0]).result.matches).toMatchObject([{ path: "src/a.ts", line: 1 }])
        }
        const expected = scenario === "no-new-matches" ? 1 : 0
        expect(provider.proposals).toHaveLength(expected)
        expect(provider.verifiers).toHaveLength(0)
        const checked = yield* observedVariants(host, input, yield* receipt(host, report))
        expect(checked.variants.generations).toHaveLength(expected)
        const reasons = { "no-confirmed-seed": "no-confirmed-seed", quick: "independent-verification-unavailable",
          diligence: "not-applicable", artifact: "not-applicable", "no-new-matches": "no-new-matches" } as const
        const reason = reasons[scenario]
        expect(checked.variants.stop).toBe(reason)
        expect(checked.variants.limit).toBe(profile === "audit" ? 3 : 0)
        if (profile !== "audit") {
          expect(report.report?.findings).toHaveLength(1)
          expect(provider.turns.some((turn) => turn.kind === "verify")).toBe(true)
          expect(checked.variants.seeds).toEqual([])
          expect(checked.variants.replies).toEqual([])
          expect(checked.variants.regions).toEqual([])
        }
        if (scenario === "quick") {
          expect(report.report?.tier).toBe("quick")
          expect(provider.turns.filter((turn) => turn.kind === "verify")).toEqual([])
        }
        if (scenario === "artifact") expect(report.notExamined).toContainEqual({ item: "artifact:behavioral-eval", reason: "owner-permission" })
        if (scenario === "no-new-matches") {
          const { search } = accepted(checked.value)
          expect(search.rawMatches).toBe(1)
          expect(search.counts).toEqual({ matches: 0, confirmed: 0, noise: 0, questions: 0, notExamined: 0 })
          expect(search.excluded).toMatchObject([{ path: "src/a.ts", line: 1, reason: "seed" }])
        }
      }), { stream: provider.stream })
    }))
  }, 120_000)
}

test("a genuine independent question stops continuation without lowering the denominator or becoming a finding", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const source = yield* pairSource(root)
    const input = { ...request("variant-question-stop"), revision: source.revision }
    const provider = variantScript({ generations: [{ search: source.search, candidates: source.candidates,
      dispositions: [{ path: source.candidates[1].path, line: source.candidates[1].line, state: "question" }] }],
      override: leadControl(source.search) })
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(input))
      expect(nativeSearchResult((yield* nativeSearches(host, report.sessionID))[0]).result.matches).toHaveLength(3)
      expect(provider.proposals).toHaveLength(1)
      expect(provider.verifiers).toHaveLength(1)
      const checked = yield* observedVariants(host, input, yield* receipt(host, report))
      const { search } = accepted(checked.value)
      expect(search.counts).toEqual({ matches: 2, confirmed: 1, noise: 0, questions: 1, notExamined: 0 })
      expect(checked.variants.stop).toBe("verification-incomplete")
      expect(report.report?.findings).toHaveLength(2)
      expect(report.report?.questions).toHaveLength(1)
      expect(report.report?.questions[0]).toMatchObject({ path: source.candidates[1].path, line: source.candidates[1].line })
      expect(report.report).not.toHaveProperty("verdict")
    }), { stream: provider.stream })
  })))
}, 120_000)

test("an omitted real match remains candidate-missing in the denominator and stops the generation", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const source = yield* pairSource(root)
    const input = { ...request("variant-omitted-match"), revision: source.revision }
    const provider = variantScript({ generations: [{ search: source.search, candidates: [source.candidates[0]] }],
      override: leadControl(source.search) })
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(input))
      const control = nativeSearchResult((yield* nativeSearches(host, report.sessionID))[0]).result
      expect(control.matches).toHaveLength(3)
      expect(control.matches).toContainEqual(expect.objectContaining({ path: source.candidates[1].path, line: source.candidates[1].line }))
      expect(provider.proposals).toHaveLength(1)
      expect(provider.verifiers).toHaveLength(1)
      const checked = yield* observedVariants(host, input, yield* receipt(host, report))
      const { search } = accepted(checked.value)
      expect(search.counts).toEqual({ matches: 2, confirmed: 1, noise: 0, questions: 0, notExamined: 1 })
      expect(search.matches.find((match) => match.line === source.candidates[1].line)).toMatchObject({
        path: source.candidates[1].path, state: "not-examined", reason: "candidate-missing",
      })
      expect(checked.variants.stop).toBe("verification-incomplete")
      expect(report.report?.findings).toHaveLength(2)
      expect(report.report?.questions).toEqual([])
    }), { stream: provider.stream })
  })))
}, 120_000)

test("five present matches use one severity-ordered verifier budget and never refill an unreadable selected range", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const file = "src/budget-variants.ts"
    const lines = Array.from({ length: 5 }, (_, index) => `export const budget${index + 1} = "BUDGET_VARIANT_${index + 1}";`)
    const candidates = lines.map((line, index) => candidate(file, index + 1, line,
      index === 0 ? "P3" : index === 1 ? "P2" : index === 3 ? "P0" : "P1"))
    const selectedUnreadable = { ...candidates[3], endLine: 8 }
    const adversarial = [candidates[0], candidates[4], candidates[1], selectedUnreadable, candidates[2]]
    const revision = yield* installSources(root, { [file]: lines.join("\n") + "\n" })
    const searchInput = fullSearch("sharedValue|BUDGET_VARIANT")
    const input = { ...request("variant-verifier-budget"), revision }
    const provider = variantScript({ generations: [{ search: searchInput, candidates: adversarial }], override: leadControl(searchInput) })
    yield* root.open((host) => Effect.gen(function* () {
      const report = decoded(yield* host.invoke(input))
      expect(nativeSearchResult((yield* nativeSearches(host, report.sessionID))[0]).result.matches).toHaveLength(6)
      expect(provider.proposals).toHaveLength(1)
      expect(provider.verifiers).toHaveLength(1)
      const offered = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ path: Schema.String, line: Schema.Number })))(
        data(provider.verifiers[0].log.text, "candidates"))
      expect(offered).toEqual([{ path: file, line: 3 }, { path: file, line: 5 }, { path: file, line: 2 }])
      const checked = yield* observedVariants(host, input, yield* receipt(host, report))
      const { search } = accepted(checked.value)
      expect(search.counts).toEqual({ matches: 5, confirmed: 3, noise: 0, questions: 0, notExamined: 2 })
      expect(search.matches.find((match) => match.line === 1)).toMatchObject({ state: "not-examined", reason: "verification-budget" })
      expect(search.matches.find((match) => match.line === 4)).toMatchObject({ state: "not-examined", reason: "region-unavailable" })
      expect(checked.variants.stop).toBe("verification-incomplete")
      expect(report.report?.findings).toHaveLength(4)
      expect(report.report?.questions).toEqual([])
      expect(provider.proposals).toHaveLength(1)
    }), { stream: provider.stream })
  })))
}, 120_000)

function leadControl(search: ReturnType<typeof fullSearch>) {
  return (turn: VariantTurn) => turn.kind === "entry" && turn.index === 0
    ? nativeCalls([{ name: "code_search", input: search, id: "initial_source_control" }]) : undefined
}
