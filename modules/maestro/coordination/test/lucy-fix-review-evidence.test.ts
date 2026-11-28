import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, stage, type Controls } from "./fixture/lucy-engagement"
import { blobRoot, cache, canonical, decoded, digest, nativeCode, reader, receipt, refused, required, request } from "./fixture/lucy-engagement-artifacts"
import { calls, commit } from "./fixture/lucy-engagement-artifact-limits"
import { completedPrior, decodedFix, fixedText, fixRequest, fixScript } from "./fixture/lucy-fix-review"
import { fixReceipt, historical, publish, saved, stateV4, stoppedFix } from "./fixture/lucy-fix-review-evidence"
import { FixReceipt, FixResult, StateV4 } from "./fixture/lucy-fix-review-schema"
import { strict } from "./fixture/lucy-variant-schema"
import { variantScript } from "./fixture/lucy-variants"

test("F4 canonical rehash cannot make a forged fix disposition agree with the independently retained native reply", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    let gitCalls = 0
    const provider = fixScript()
    return root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "semantic-prior")
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const input = fixRequest(prior.report, "semantic-fix", revision)
      const output = yield* host.invoke(input)
      const report = decodedFix(output)
      expect(report.dispositions.map((entry) => entry.disposition)).toEqual(["resolved"])
      const evidence = yield* fixReceipt(host, report)
      const held = yield* stateV4(host, report.sessionID)
      const examination = evidence.value.examinations[0]
      if (!examination) return yield* Effect.die("real examination missing")
      const native = evidence.value.replies.find((entry) => entry.replyID === examination.replyID)
      if (!native) return yield* Effect.die("real native reply missing")
      expect(native.text).toContain('"disposition":"resolved"')
      const { examinationID, ...payload } = examination
      const changedPayload = { ...payload, rawReturn: { ...examination.rawReturn, disposition: "question" as const,
        reason: "FORGED-SEMANTIC-RETURN" } }
      const changed = { ...changedPayload, examinationID: digest(canonical({ schema: "review-fix-examination-v1",
        inputHash: report.inputHash, ...changedPayload })) }
      const { reportID, ...reportPayload } = report
      const nextPayload = { ...reportPayload, dispositions: report.dispositions.map((item) =>
        item.disposition !== "not-examined" && item.examinationID === examinationID ? { ...item, examinationID: changed.examinationID } : item) }
      const next = Schema.decodeUnknownSync(FixResult)({ ...nextPayload, reportID: digest(canonical(nextPayload)) }, strict)
      expect(next.reportID).not.toBe(reportID)
      const forged = Schema.decodeUnknownSync(FixReceipt)({ ...evidence.value, reportID: next.reportID,
        examinations: [changed] }, strict)
      const reference = yield* publish(root, host, Buffer.from(canonical(forged)))
      const altered = Schema.decodeUnknownSync(StateV4)({ ...held.value, output: canonical(next),
        evidence: { policy: "required-completed-v1", ...reference } }, strict)
      const metadata = { ...held.row.metadata, lucyEngagementV1: altered }
      const before = root.requests.length
      const git = gitCalls
      const inputs = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      yield* Effect.gen(function* () {
        yield* host.db.update(SessionTable).set({ metadata }).where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)
        refused(yield* host.call(reader, { op: "manifest", reportID: next.reportID }), "engagement-evidence-corrupt")
        refused(yield* host.invoke(input), "engagement-evidence-corrupt")
        expect(canonical((yield* saved(host, report.sessionID)).row.metadata)).toBe(canonical(metadata))
        expect(root.requests.length).toBe(before)
        expect(gitCalls).toBe(git)
        expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(inputs)
      }).pipe(Effect.ensuring(host.db.update(SessionTable).set({ metadata: held.row.metadata })
        .where(eq(SessionTable.id, report.sessionID)).run().pipe(Effect.orDie)))
      expect((yield* host.invoke(input)).text).toBe(output.text)
      expect((yield* fixReceipt(host, report)).bytes).toEqual(evidence.bytes)
      expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
    }), { stream: provider.stream, onGit: () => { gitCalls++ } })
  }))
}, 150_000)

test("F6 importing real predecessor bodies shares the 256-descriptor quota instead of opening a second evidence allowance", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const filename = "src/prior-regions.txt"
    const markers = Array.from({ length: 125 }, (_, index) => `PRIOR_REGION_${String(index + 1).padStart(3, "0")}`)
    const revision = yield* commit(root, { [filename]: markers.map((marker) => marker + "\n\n\n\n\n\n\n").join("") })
    const base = variantScript()
    const started = new Set<string>()
    const lenses: string[] = []
    let lead: string | undefined
    const locates = (first: number, count: number) => Array.from({ length: count }, (_, offset) => ({
      id: `prior_locate_${first + offset}`, name: "code_locate",
      input: { terms: [markers[first + offset - 1]], paths: [filename], limit: 1 },
    }))
    const priorStream: NonNullable<Controls["stream"]> = (log, modelRequest) => {
      const current = stage(log.text)
      if (current === "entry" && !started.has(log.sessionID)) {
        lead = log.sessionID
        started.add(log.sessionID)
        return calls(locates(1, 45))
      }
      if (current === "lens" && !started.has(log.sessionID) && lenses.length < 2) {
        const slot = lenses.length
        lenses.push(log.sessionID)
        started.add(log.sessionID)
        return calls(slot === 0 ? locates(46, 42) : locates(88, 38))
      }
      return base.stream(log, modelRequest)
    }
    const provider = fixScript({ prior: priorStream })
    yield* root.open((host) => Effect.gen(function* () {
      const input = { ...request("quota-prior", "diligence"), revision }
      const output = yield* host.invoke(input)
      const prior = decoded(output)
      expect(prior.status).toBe("completed")
      expect(prior.report?.findings).toHaveLength(1)
      if (!lead || lenses.length !== 2) return yield* Effect.die("three real native CODE producers missing")
      const native = (yield* Effect.forEach([lead, ...lenses], (id) => nativeCode(host, id))).flat()
      expect(native).toHaveLength(125)
      expect(native.every((call) => call.status === "completed" && call.name === "code_locate" && call.providerExecuted !== true)).toBe(true)
      const evidence = yield* receipt(host, prior)
      expect(evidence.value.operations.filter((operation) => operation.kind === "code")).toHaveLength(125)
      expect(evidence.value.operations.filter((operation) => operation.kind === "analysis")).toHaveLength(1)
      expect(evidence.value.artifacts.filter((artifact) => artifact.kind === "code-result")).toHaveLength(125)
      expect(evidence.value.artifacts.filter((artifact) => artifact.kind === "code-snapshot")).toHaveLength(125)
      expect(evidence.value.artifacts).toHaveLength(254)
      expect(evidence.value.hostProofs).toEqual([])
      expect(evidence.value.artifacts.every((artifact) => artifact.bytes < 16 * 1024)).toBe(true)
      expect(evidence.value.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0)).toBeLessThan(1024 * 1024)
      //254 actual old descriptors +3 required wrapper descriptors =257, before any new native CODE or analysis body.
      expect(evidence.value.artifacts.length + 3).toBe(257)
      const changed = yield* commit(root, { [sourcePath]: fixedText })
      const fix = fixRequest(prior, "quota-fix", changed)
      const before = root.requests.length
      yield* stoppedFix(root, host, fix, yield* host.invoke(fix), "engagement-evidence-bound-exceeded")
      expect(root.requests.length).toBe(before)
      expect(provider.turns).toEqual([])
      expect((yield* host.invoke(input)).text).toBe(output.text)
      expect((yield* receipt(host, prior)).bytes).toEqual(evidence.bytes)
    }), { stream: provider.stream }).pipe(
      Effect.provideService(BackendToolkit.Root, path.join(root.global.cache, "fix-prior-empty-toolkit")),
    )
  })))
}, 300_000)

test("F4 missing and corrupt current or imported required bodies fail replay without repair or a new execution", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = fixScript()
    return root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "body-prior")
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const input = fixRequest(prior.report, "body-fix", revision)
      const output = yield* host.invoke(input)
      const report = decodedFix(output)
      const evidence = yield* fixReceipt(host, report)
      const current = evidence.value.citations[0]
      if (!current) return yield* Effect.die("current quote body missing")
      const selected = [current.artifactID, evidence.value.prior.receiptArtifactID,
        prior.evidence.value.artifacts.find((artifact) => artifact.kind === "analysis-debt")?.artifactID]
      for (const id of selected) {
        if (!id) return yield* Effect.die("required selected body missing")
        const artifact = evidence.value.artifacts.find((entry) => entry.artifactID === id)
        if (!artifact) return yield* Effect.die("required selected descriptor missing")
        const filename = path.join(blobRoot(root, host), artifact.sha256)
        const original = required(evidence.bodies, id)
        expect(yield* Effect.promise(() => fs.readFile(filename))).toEqual(original)
        for (const damage of ["missing", "corrupt"] as const) {
          const calls = root.requests.length
          yield* Effect.gen(function* () {
            yield* Effect.promise(async () => {
              await fs.chmod(filename, 0o600)
              if (damage === "missing") await fs.rm(filename)
              else {
                await fs.writeFile(filename, Buffer.from("invalid required evidence"))
                await fs.chmod(filename, 0o400)
              }
            })
            refused(yield* host.call(reader, { op: "read", reportID: report.reportID, artifactID: id }), "engagement-evidence-corrupt")
            refused(yield* host.invoke(input), "engagement-evidence-corrupt")
            expect(root.requests.length).toBe(calls)
            if (damage === "missing") expect(yield* Effect.promise(() => fs.stat(filename).then(() => true, () => false))).toBe(false)
          }).pipe(Effect.ensuring(Effect.promise(async () => {
            await fs.chmod(filename, 0o600).catch((error: unknown) => {
              if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return
              throw error
            })
            await fs.writeFile(filename, original, { mode: 0o600 })
            await fs.chmod(filename, 0o400)
          })))
          expect((yield* host.invoke(input)).text).toBe(output.text)
        }
      }
      expect((yield* fixReceipt(host, report)).bytes).toEqual(evidence.bytes)
    }), { stream: provider.stream })
  }))
}, 180_000)

for (const version of ["v1", "v2"] as const) {
  test(`historical ${version} ordinary bytes remain exact while fix eligibility respects its retained evidence`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const provider = fixScript()
      let gitCalls = 0
      const original = yield* root.open((host) => Effect.gen(function* () {
        const prior = yield* completedPrior(host, `history-${version}`)
        const legacy = yield* historical(root, host, prior.report, version)
        expect(legacy.frozenOutput).toBe(prior.output.text)
        expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
        yield* Effect.promise(() => fs.rm(cache(host, prior.input), { recursive: true, force: true }))
        return { prior, legacy }
      }), { stream: provider.stream, onGit: () => { gitCalls++ } })
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      yield* root.open((host) => Effect.gen(function* () {
        const calls = root.requests.length
        const git = gitCalls
        const before = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
        expect((yield* host.invoke(original.prior.input)).text).toBe(original.prior.output.text)
        expect(root.requests.length).toBe(calls)
        expect(gitCalls).toBe(git)
        expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(before)
        const input = fixRequest(original.prior.report, `legacy-fix-${version}`, revision)
        const output = yield* host.invoke(input)
        if (version === "v1") {
          refused(output, "engagement-fix-prior-evidence-unavailable")
          expect(output.text).toContain("legacy-record")
          expect(provider.turns).toEqual([])
          expect(root.requests.length).toBe(calls)
          expect(gitCalls).toBe(git)
          const unavailable = yield* host.call(reader, { op: "manifest", reportID: original.prior.report.reportID })
          refused(unavailable, "engagement-evidence-unavailable")
          expect(unavailable.text).toContain("legacy-record")
        } else {
          const result = decodedFix(output)
          expect(result.status).toBe("completed")
          expect(result.prior?.priorStateSchema).toBe("review-engagement-state-v2")
          const evidence = yield* fixReceipt(host, result)
          expect(required(evidence.bodies, evidence.value.prior.receiptArtifactID)).toEqual(original.legacy.receiptBytes)
          expect(evidence.priorOutput).toBe(original.prior.output.text)
          expect((yield* receipt(host, original.prior.report)).bytes).toEqual(original.legacy.receiptBytes)
        }
        expect(canonical((yield* saved(host, original.prior.report.sessionID)).row.metadata)).toBe(original.legacy.frozenMetadata)
        expect((yield* host.invoke(original.prior.input)).text).toBe(original.prior.output.text)
      }), { stream: provider.stream, onGit: () => { gitCalls++ } })
    })))
  }, 180_000)
}

test("a real audit variant predecessor is imported intact and does not schedule fresh variants during fix", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = fixScript()
    return root.open((host) => Effect.gen(function* () {
      const prior = yield* completedPrior(host, "variant-prior", "audit")
      if (prior.evidence.value.schema !== "review-engagement-evidence-v2") return yield* Effect.die("actual variant receipt missing")
      expect(prior.evidence.value.variants.generations).toHaveLength(1)
      expect(prior.evidence.value.variants.stop).toBe("no-new-matches")
      expect(prior.evidence.value.operations.filter((operation) => operation.kind === "code" && operation.name === "code_search"))
        .toHaveLength(1)
      const before = yield* saved(host, prior.report.sessionID)
      const oldCalls = root.requests.filter((entry) => entry.text.includes("Stage: variant")).length
      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const result = decodedFix(yield* host.invoke(fixRequest(prior.report, "variant-fix", revision)))
      const evidence = yield* fixReceipt(host, result)
      expect(canonical(evidence.priorReceipt)).toBe(canonical(prior.evidence.value))
      expect(required(evidence.bodies, evidence.value.prior.receiptArtifactID)).toEqual(prior.evidence.bytes)
      expect(root.requests.filter((entry) => entry.text.includes("Stage: variant")).length).toBe(oldCalls)
      expect(canonical((yield* saved(host, prior.report.sessionID)).row.metadata)).toBe(canonical(before.row.metadata))
      expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
    }), { stream: provider.stream })
  }))
}, 150_000)
