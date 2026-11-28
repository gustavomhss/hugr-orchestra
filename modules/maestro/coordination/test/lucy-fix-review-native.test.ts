import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { ReviewItem } from "@orchestra/core/review-toolkit/item"
import { ReviewOxlintInput, ReviewPackOxlint } from "@orchestra/core/review-toolkit/index"
import { SessionTable } from "@orchestra/core/session/sql"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { ReviewEvidenceSchemaV2 } from "../src/v2/workflow/review-engagement-artifact-schema"
import { fence, run, sourcePath, text, type Ctx, type Fixture } from "./fixture/lucy-engagement"
import { cache, canonical, decoded, digest, reader, receipt, refused, request, required } from "./fixture/lucy-engagement-artifacts"
import { commit } from "./fixture/lucy-engagement-artifact-limits"
import { decodedFix, fixedText, fixRequest, fixScript } from "./fixture/lucy-fix-review"
import { fixReceipt, publish, stateV4, stoppedFix } from "./fixture/lucy-fix-review-evidence"
import { AnalyzerEvidence, FixReceipt, FixResult, StateV4 } from "./fixture/lucy-fix-review-schema"
import { data, variantScript } from "./fixture/lucy-variants"
import { strict } from "./fixture/lucy-variant-schema"

const qualified = process.platform === "linux" && process.arch === "x64"
const broken = "src/broken.ts"
const fixed = 'export const guarded = "FIXED-GUARD"\n'
const nonzero = 'export const unchecked: any = "DIFFERENT-NATIVE-RULE"\n'

for (const mode of ["zero", "nonzero"] as const) {
  test(qualified ? `F5/F6 actual public oxlint predecessor and same-recipe ${mode} fix proof`
    : `F5/F6 ${mode} case actively reports native-unqualified and retests only a genuine quote`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => Effect.gen(function* () {
      const revision = yield* commit(root, { [broken]: "debugger;\n",
        ".oxlintrc.json": '{"rules":{"no-debugger":"off"}}\n',
        "src/.oxlintrc.json": '{"rules":{"no-debugger":"off"}}\n' })
      const input = { ...request(`native-prior-${mode}`, "diligence"), revision }
      const priorProvider = nativePrior()
      const provider = fixScript({ prior: qualified ? priorProvider.stream : variantScript().stream })
      const toolkit = path.join(root.global.cache, `fix-native-${mode}`)
      const copied: { readonly path: string; readonly text: string }[] = []
      yield* root.open((host) => Effect.gen(function* () {
        const runtime = qualified ? yield* BackendToolkit.ensure<string>("oxlint").pipe(
          Effect.provideService(BackendToolkit.Manifest, { oxlint: ReviewPackOxlint.manifest }),
          Effect.catch((error) => Effect.die(new Error(`conformance-missing: oxlint ${error.reason}`))),
        ) : undefined
        if (qualified) {
          yield* ToolSafetySandboxRuntime.ready()
          expect((yield* ToolSafetySandbox.status()).shellWrites, "conformance-missing: Linux native confinement").toBe("enforced")
        }
        const oldOutput = yield* host.invoke(input)
        const prior = decoded(oldOutput)
        expect(prior.status).toBe("completed")
        const oldEvidence = yield* receipt(host, prior)
        const oldCard = prior.report
        if (!oldCard || !prior.source) return yield* Effect.die("actual prior card/source missing")
        const check = oldCard.checks.find((entry) => entry.pack === "oxlint")
        if (!qualified) {
          expect(check).toMatchObject({ status: "check-unavailable", reason: "oxlint unsupported: native-runtime-unqualified",
            workspaceExecuted: false, version: "1.91.0" })
          expect(oldEvidence.value.hostProofs).toEqual([])
          expect(copied).toEqual([])
          expect(oldCard.findings[0].evidence.kind).toBe("quote")
          expect(yield* Effect.promise(() => fs.readdir(toolkit).catch((error: unknown) => {
            if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return []
            throw error
          }))).toEqual([])
          const current = yield* commit(root, { [sourcePath]: fixedText })
          const result = decodedFix(yield* host.invoke(fixRequest(prior, `native-unqualified-fix-${mode}`, current)))
          expect(result.dispositions.map((entry) => entry.disposition)).toEqual(["resolved"])
          const evidence = yield* fixReceipt(host, result)
          expect(evidence.value.hostProofs).toEqual([])
          expect(evidence.value.observations).toEqual([])
          return
        }
        if (!runtime) return yield* Effect.die("qualified runtime was not prepared")
        expect(check).toMatchObject({ status: "fail", version: "1.91.0", workspaceExecuted: false })
        expect(oldEvidence.value.hostProofs).toHaveLength(2)
        expect(copied.map((file) => file.path).sort()).toEqual([sourcePath, sourcePath, broken, broken].sort())
        expect(copied.filter((file) => file.path === broken).map((file) => file.text)).toEqual(["debugger;\n", "debugger;\n"])
        const executableSha256 = digest(yield* Effect.promise(() => fs.readFile(runtime.executable)))
        const oldHead = oldEvidence.value.hostProofs.find((proof) => proof.side === "head")
        if (!oldHead) return yield* Effect.die("actual previous head invocation missing")
        const oldRaw = required(oldEvidence.bodies, oldHead.stdoutArtifactID)
        expect(nativeRows(oldRaw).map((row) => row.ruleId)).toEqual(["eslint(no-debugger)"])
        // Read real producer output only as a compare oracle. It never supplies a URI to the scripted verifier.
        const raw = yield* rawControl(host, input)
        expect(raw).toEqual(Buffer.from(oldRaw))
        expect(oldHead.runtime.executableSha256).toBe(executableSha256)
        expect(oldHead.outcome).toMatchObject({ exitCode: 1, timedOut: false, overflow: false, memoryExceeded: false })
        expect(oldHead.outcome.stdout.truncated).toBe(false)
        expect(oldCard.findings).toHaveLength(1)
        const finding = oldCard.findings[0]
        if (priorProvider.witnesses.length === 0)
          expect(finding.evidence.kind, "public tool predecessor not reached: only the legitimate quote control completed").toBe("quote")
        // First Linux RED target: delivered public prompts lack this source-bound analyzer witness.
        expect(priorProvider.witnesses.length, "public-analyzer-evidence-unavailable").toBeGreaterThan(0)
        expect(finding.evidence.kind).toBe("tool")
        if (finding.evidence.kind !== "tool") return yield* Effect.die("qualified public tool predecessor missing")
        const toolEvidence = finding.evidence
        expect(toolEvidence).toMatchObject({ pack: "oxlint", rule: "eslint(no-debugger)", version: "1.91.0" })
        expect(priorProvider.witnesses.every((entry) => entry.check.uri === toolEvidence.uri)).toBe(true)
        expect(oldEvidence.value.artifacts.find((artifact) => artifact.artifactID === oldHead.stdoutArtifactID)?.uri).toBe(toolEvidence.uri)
        const current = yield* commit(root, { [broken]: mode === "zero" ? fixed : nonzero })
        const fixInput = fixRequest(prior, `native-fix-${mode}`, current)
        const output = yield* host.invoke(fixInput)
        const result = decodedFix(output)
        expect(result.status).toBe("completed")
        if (!result.source) return yield* Effect.die("completed native fix source missing")
        const source = result.source
        expect(source.files.map((file) => file.path)).toEqual([sourcePath, broken].sort())
        expect(result.prior?.requiredFiles).toEqual([sourcePath, broken].sort())
        const evidence = yield* fixReceipt(host, result)
        expect(evidence.value.hostProofs).toHaveLength(2)
        expect(evidence.value.observations).toHaveLength(1)
        const observation = evidence.value.observations[0]
        expect(observation).toMatchObject({ findingID: finding.id, priorProofID: oldHead.proofID, result: mode })
        const oldRecipe = recipe(oldEvidence.bodies, oldHead)
        for (const proof of evidence.value.hostProofs) {
          expect(proof.runtime.executableSha256).toBe(executableSha256)
          expect(proof.sourceSha256).toBe(source.sha256)
          expect(proof.invocationID).not.toBe(oldHead.invocationID)
          expect(proof.outcome).toMatchObject({ exitCode: mode === "zero" ? 0 : 1,
            timedOut: false, overflow: false, memoryExceeded: false })
          expect(proof.outcome.failure).toBeUndefined()
          const stdout = required(evidence.bodies, proof.stdoutArtifactID)
          expect(proof.outcome.stdout).toEqual({ bytes: stdout.length, retainedBytes: stdout.length, truncated: false })
          expect(required(evidence.bodies, proof.stderrArtifactID).length).toBe(0)
          const rows = nativeRows(stdout)
          expect(rows.map((row) => row.ruleId)).toEqual(mode === "zero" ? [] : ["typescript(no-explicit-any)"])
          expect(recipeProjection(recipe(evidence.bodies, proof))).toEqual(recipeProjection(oldRecipe))
          expect(observation.recipeSha256).toBe(digest(canonical(recipeProjection(oldRecipe))))
        }
        expect(result.dispositions.map((entry) => entry.disposition)).toEqual(mode === "zero" ? ["resolved"] : ["question"])
        if (mode === "nonzero") {
          expect(result.dispositions[0].reason).toBe("native-results-remain")
          expect(evidence.value.examinations[0].rawReturn.disposition).toBe("resolved")
          expect(result.questions.map((entry) => entry.findingID)).toEqual([finding.id])
          const calls = root.requests.length
          const copies = copied.length
          const narrowing = { ...fixRequest(prior, "native-recipe-omitted-file", current), paths: [broken] }
          yield* stoppedFix(root, host, narrowing, yield* host.invoke(narrowing), "engagement-fix-scope-invalid")
          expect(root.requests.length).toBe(calls)
          expect(copied.length).toBe(copies)
        } else yield* forgedZero(root, host, fixInput, result, evidence, oldRaw)
        expect((yield* host.invoke(input)).text).toBe(oldOutput.text)
        expect((yield* receipt(host, prior)).bytes).toEqual(oldEvidence.bytes)
      }), { stream: provider.stream }).pipe(
        Effect.provideService(BackendToolkit.Root, toolkit),
        Effect.provideService(ReviewOxlintInput.Copied, (file) => Effect.promise(async () => {
          copied.push({ path: path.relative(file.root, file.file).split(path.sep).join("/"), text: await fs.readFile(file.file, "utf8") })
          expect(await fs.readdir(file.root)).not.toContain(".oxlintrc.json")
          expect(await fs.readdir(path.join(file.root, "src"))).not.toContain(".oxlintrc.json")
        })),
      )
    })))
  }, 600_000)
}

function nativePrior() {
  const witnesses: AnalyzerEvidence[number][] = []
  const items = new Map<string, ReviewItem.ToolItem>()
  const provider = variantScript({ override: (turn) => {
    if (turn.kind === "lens") {
      const lens = /Stage: hunt, lens ([^,]+),/.exec(turn.log.text)?.[1]
      if (!lens) throw new Error("native predecessor lens identity missing")
      if (lens !== "correctness-logic") return text(fence(ReviewFanoutV2.TAGS.lens,
        { lens, candidates: [], observations: [], hunks: [], items: [] }))
      const label = /<data name="(analyzer items for correctness-logic [^"]+)">/.exec(turn.log.text)?.[1]
      if (!label) throw new Error("real native items were not included in the lens prompt")
      const offered = Schema.decodeUnknownSync(Schema.Array(ReviewItem.ToolItem))(data(turn.log.text, label), strict)
      const item = offered.find((entry) => entry.pack === "oxlint" && entry.rule === "eslint(no-debugger)" && entry.path === broken)
      expect(item, "conformance-missing: real native diagnostic never reached the lens").toBeDefined()
      if (!item) throw new Error("actual native predecessor item missing")
      items.set(item.fingerprint, item)
      return text(fence(ReviewFanoutV2.TAGS.lens, { lens, candidates: [{ class: item.class,
        node: "lucy-lens-correctness-logic-invariants", path: item.path, line: item.line,
        endLine: item.endLine ?? item.line, severity: "P1", trigger: "This reachable debugger statement interrupts the reviewed execution.",
        quote: "debugger;", source: item.fingerprint }], observations: [], hunks: [], items: [] }))
    }
    if (turn.kind !== "verify") return undefined
    const candidates = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ id: Schema.String, class: Schema.String,
      path: Schema.String, line: Schema.Number, endLine: Schema.optional(Schema.Number), region: Schema.String,
      options: Schema.Array(Schema.Struct({ id: Schema.String })) })))(data(turn.log.text, "candidates"))
    expect(candidates).toHaveLength(1)
    const candidate = candidates[0]
    expect(candidate.path).toBe(broken)
    expect(candidate.region).toContain("debugger;")
    expect(candidate.options.some((option) => option.id === "quote")).toBe(true)
    const seen = turn.log.text.includes('<data name="analyzer evidence">')
      ? Schema.decodeUnknownSync(AnalyzerEvidence)(data(turn.log.text, "analyzer evidence"), strict) : []
    const witness = seen.find((entry) => entry.candidate === candidate.id && entry.item.path === candidate.path &&
      entry.item.line === candidate.line && entry.item.rule === "eslint(no-debugger)")
    if (witness) {
      expect(items.get(witness.item.fingerprint)).toEqual(witness.item)
      expect(witness.check).toMatchObject({ pack: "oxlint", version: "1.91.0", status: "fail", workspaceExecuted: false })
      expect(witness.check.uri).toMatch(/^review:[0-9a-f-]{36}\/raw\/oxlint-head\.sarif$/)
      witnesses.push(witness)
    }
    // Missing public witness stays a genuine quote control; it never receives a URI from private fixture IO.
    const evidence = witness ? { kind: "tool", pack: witness.check.pack, rule: witness.item.rule,
      version: witness.check.version, uri: witness.check.uri }
      : { kind: "quote", path: candidate.path, startLine: candidate.line, endLine: candidate.endLine ?? candidate.line }
    return text(fence(ReviewFanoutV2.TAGS.verify, { class: candidate.class, results: [{ candidate: candidate.id,
      state: "confirmed", rung: "quote", history: [{ option: "quote", outcome: "settled" }], evidence }] }))
  } })
  return { ...provider, witnesses }
}

function rawControl(host: Ctx, input: unknown) {
  return Effect.promise(async () => {
    const directory = cache(host, input)
    const ids = (await fs.readdir(directory)).filter((entry) => /^[0-9a-f-]{36}$/.test(entry))
    expect(ids).toHaveLength(1)
    return fs.readFile(path.join(directory, ids[0], "raw", "oxlint-head.sarif"))
  })
}

const Sarif = Schema.Struct({ version: Schema.Literal("2.1.0"), runs: Schema.Array(Schema.Struct({
  tool: Schema.Struct({ driver: Schema.Struct({ name: Schema.Literal("oxlint"), version: Schema.Literal("1.91.0") }) }),
  results: Schema.Array(Schema.Struct({ ruleId: Schema.String })),
})) })
function nativeRows(bytes: Buffer) {
  const value = Schema.decodeUnknownSync(Sarif)(JSON.parse(bytes.toString("utf8")))
  expect(value.runs).toHaveLength(1)
  return value.runs[0].results
}
function recipe(bodies: ReadonlyMap<string, Buffer>, proof: { readonly recipeArtifactID: string }) {
  return Schema.decodeUnknownSync(ReviewEvidenceSchemaV2.Recipe)(JSON.parse(required(bodies, proof.recipeArtifactID).toString("utf8")), strict)
}
function recipeProjection(value: typeof ReviewEvidenceSchemaV2.Recipe.Type) {
  return { pack: value.pack, template: value.template, runtime: value.runtime, files: value.files.map((file) => file.path),
    rules: value.rules, config: value.config, invocation: value.invocation, limits: value.limits }
}

function forgedZero(root: Fixture, host: Ctx, input: unknown, result: FixResult,
  original: Effect.Success<ReturnType<typeof fixReceipt>>, actualNonzeroBytes: Buffer) {
  return Effect.gen(function* () {
    const held = yield* stateV4(host, result.sessionID)
    const head = original.value.hostProofs.find((proof) => proof.side === "head")
    if (!head) return yield* Effect.die("real new head proof missing")
    const descriptor = original.value.artifacts.find((artifact) => artifact.artifactID === head.stdoutArtifactID)
    if (!descriptor) return yield* Effect.die("real new stdout descriptor missing")
    expect(nativeRows(required(original.bodies, head.stdoutArtifactID))).toEqual([])
    expect(nativeRows(actualNonzeroBytes)).toHaveLength(1)
    const stored = yield* publish(root, host, actualNonzeroBytes)
    const { artifactID, ...descriptorPayload } = descriptor
    const newDescriptorPayload = { ...descriptorPayload, sha256: stored.receiptID, bytes: actualNonzeroBytes.length }
    const newDescriptor = { ...newDescriptorPayload, artifactID: digest(canonical(newDescriptorPayload)) }
    const { proofID, ...proofPayload } = head
    const newProofPayload = { ...proofPayload, stdoutArtifactID: newDescriptor.artifactID,
      outcome: { ...head.outcome, stdout: { bytes: actualNonzeroBytes.length, retainedBytes: actualNonzeroBytes.length, truncated: false } } }
    const newProof = { ...newProofPayload, proofID: digest(canonical(newProofPayload)) }
    let changed = swap(original.value, artifactID, newDescriptor.artifactID)
    changed = swap(changed, proofID, newProof.proofID)
    changed = { ...changed, artifacts: changed.artifacts.map((artifact) => artifact.artifactID === newDescriptor.artifactID ? newDescriptor : artifact),
      hostProofs: changed.hostProofs.map((proof) => proof.proofID === newProof.proofID ? newProof : proof) }
    for (const observation of changed.observations) {
      const { observationID, ...payload } = observation
      const id = digest(canonical({ schema: "review-fix-observation-v1", inputHash: changed.inputHash, ...payload }))
      changed = swap(changed, observationID, id)
    }
    for (const reply of changed.replies) {
      const textSha256 = digest(reply.text)
      const replyID = digest(canonical({ schema: "review-fix-reply-v1", inputHash: changed.inputHash, sessionID: reply.sessionID,
        promptMessageID: reply.promptMessageID, assistantMessageID: reply.assistantMessageID, textPartID: reply.textPartID, textSha256 }))
      changed = swap(changed, reply.replyID, replyID)
      changed = { ...changed, replies: changed.replies.map((entry) => entry.replyID === replyID ? { ...entry, textSha256 } : entry) }
    }
    let updatedResult = result
    for (const examination of changed.examinations) {
      const { examinationID, ...payload } = examination
      const id = digest(canonical({ schema: "review-fix-examination-v1", inputHash: changed.inputHash, ...payload }))
      changed = swap(changed, examinationID, id)
      updatedResult = Schema.decodeUnknownSync(FixResult)(JSON.parse(canonical(updatedResult).replaceAll(examinationID, id)), strict)
    }
    const { reportID, ...payload } = updatedResult
    updatedResult = { ...payload, reportID: digest(canonical(payload)) }
    changed = { ...changed, reportID: updatedResult.reportID,
      artifacts: [...changed.artifacts].sort((left, right) => left.artifactID < right.artifactID ? -1 : left.artifactID > right.artifactID ? 1 : 0) }
    expect(changed.reportID).not.toBe(reportID)
    expect(changed.observations[0].result).toBe("zero")
    const reference = yield* publish(root, host, Buffer.from(canonical(changed)))
    const state = Schema.decodeUnknownSync(StateV4)({ ...held.value, output: canonical(updatedResult),
      evidence: { policy: "required-completed-v1", ...reference } }, strict)
    const before = root.requests.length
    yield* Effect.gen(function* () {
      yield* host.db.update(SessionTable).set({ metadata: { ...held.row.metadata, lucyEngagementV1: state } })
        .where(eq(SessionTable.id, result.sessionID)).run().pipe(Effect.orDie)
      refused(yield* host.call(reader, { op: "manifest", reportID: updatedResult.reportID }), "engagement-evidence-corrupt")
      refused(yield* host.invoke(input), "engagement-evidence-corrupt")
      expect(root.requests.length).toBe(before)
    }).pipe(Effect.ensuring(host.db.update(SessionTable).set({ metadata: held.row.metadata })
      .where(eq(SessionTable.id, result.sessionID)).run().pipe(Effect.orDie)))
    expect((yield* host.invoke(input)).text).toBe(canonical(result))
    expect((yield* fixReceipt(host, result)).bytes).toEqual(original.bytes)
  })
}

function swap(value: FixReceipt, from: string, to: string): FixReceipt {
  // Replace an exact known cryptographic identity, including its occurrence in the retained model JSON text.
  return Schema.decodeUnknownSync(FixReceipt)(JSON.parse(canonical(value).replaceAll(from, to)), strict)
}
