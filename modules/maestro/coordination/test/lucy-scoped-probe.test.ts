import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "@orchestra/core/tool-safety-sandbox-runtime"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewFanoutV2 } from "../src/v2/workflow/review-fanout"
import { fence, run, text } from "./fixture/lucy-engagement"
import { decoded, digest, receipt, request } from "./fixture/lucy-engagement-artifacts"
import { commit } from "./fixture/lucy-engagement-artifact-limits"
import { completedPrior, decodedFix, defaultVerdict, fixRequest, fixScript } from "./fixture/lucy-fix-review"
import { fixReceipt } from "./fixture/lucy-fix-review-evidence"
import { data, variantScript } from "./fixture/lucy-variants"

const qualified = process.platform === "linux" && process.arch === "x64"
const sourcePath = "src/probe.ts"
const brokenSource = "export const sharedValue: string = 42\n"
const fixedSource = 'export const sharedValue: string = "42"\n'

test(qualified
  ? "A04 public review offers and retains a scoped TypeScript failure, then binds same-recipe fix proof and exact replay"
  : "A04 portable public review keeps the quote control and makes no scoped native qualification", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const sourceRevision = yield* commit(root, { [sourcePath]: brokenSource })
    const turns = variantScript({ override: (turn) => {
      if (turn.kind === "lens") {
        const lens = /Stage: hunt, lens ([^,]+),/.exec(turn.log.text)?.[1]
        if (!lens) throw new Error("real candidate lens missing")
        return text(fence(ReviewFanoutV2.TAGS.lens, { lens, candidates: lens === "correctness-logic" ? [{
          path: sourcePath, line: 1, endLine: 1, severity: "P1", confidence: "high", class: "logic.contract",
          lens, node: "lucy-lens-correctness-logic-invariants", rule: "logic.contract",
          quote: brokenSource.trimEnd(),
          trigger: "The exported string contract accepts a numeric value.",
        }] : [], observations: [], hunks: [], items: [] }))
      }
      if (turn.kind !== "verify") return undefined
      const offered = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({
        id: Schema.String, class: Schema.String, path: Schema.String, line: Schema.Number,
        options: Schema.Array(Schema.Struct({ id: Schema.String })),
      })))(data(turn.log.text, "candidates"))
      const witnesses = data(turn.log.text, "scoped probe evidence") as ReadonlyArray<{
        candidate: string; uri: string; command: string; status: "fail" | "pass";
        diagnostics: ReadonlyArray<{ line: number; column: number; code: string }>
      }>
      const results = offered.map((candidate) => {
        expect(candidate.class).toBe("logic.contract")
        const witness = witnesses.find((entry) => entry.candidate === candidate.id && entry.status === "fail")
        if (!qualified || !witness) return {
          candidate: candidate.id, state: "confirmed", rung: "quote",
          history: [{ option: "quote", outcome: "settled" }],
          evidence: { kind: "quote", path: sourcePath, startLine: 1, endLine: 1 },
        }
        expect(candidate.options.some((option) => option.id === "probe:typecheck")).toBe(true)
        expect(witness.command).toBe("tsc --noEmit (scoped)")
        expect(witness.diagnostics).toContainEqual({ line: 1, column: expect.any(Number), code: "TS2322" })
        return { candidate: candidate.id, state: "confirmed", rung: "probe:typecheck",
          history: [{ option: "probe:typecheck", outcome: "settled" }],
          evidence: { kind: "probe", option: "probe:typecheck", command: witness.command,
            result: "fail", uri: witness.uri } }
      })
      return text(fence(ReviewFanoutV2.TAGS.verify, { class: "logic.contract", results }))
    } })
    const provider = fixScript({ prior: turns.stream, verdict: (_turn, basis) => {
      const observation = basis.observations.find((entry) => "kind" in entry && entry.kind === "scoped-typecheck")
      if (!observation || !("observationID" in observation)) throw new Error("real scoped typecheck observation missing")
      return { ...defaultVerdict(basis), supporting: [{ kind: "tool", observationID: observation.observationID }] }
    } })
    yield* root.open((host) => Effect.gen(function* () {
      if (qualified) {
        yield* ResearchToolkit.ensure("typescript").pipe(
          Effect.catch((error) => Effect.die(new Error(`conformance-missing: TypeScript ${error.reason}`))),
        )
        yield* ToolSafetySandboxRuntime.ready()
        expect((yield* ToolSafetySandbox.status()).shellWrites).toBe("enforced")
      }
      const prior = yield* completedPrior(host, qualified ? "scoped-probe-prior" : "scoped-probe-portable")
      const finding = prior.report.report?.findings[0]
      expect(finding).toBeDefined()
      if (!finding) return yield* Effect.die("registered public request_review omitted the accepted finding")
      const original = yield* receipt(host, prior.report)
      if (!qualified) {
        expect(finding.evidence.kind).toBe("quote")
        expect(original.value).not.toHaveProperty("scopedProbes")
        return
      }
      expect(finding).toMatchObject({ path: sourcePath, line: 1, class: "logic.contract", rule: "logic.contract",
        evidence: { kind: "probe" } })
      const probeRows = (original.value as typeof original.value & { scopedProbes?: ReadonlyArray<{ proofID: string; artifactID: string }> }).scopedProbes
      expect(probeRows).toHaveLength(1)
      if (!probeRows?.[0]) return yield* Effect.die("public prior receipt omitted scoped probe proof")
      const probeBody = original.bodies.get(probeRows[0].artifactID)
      expect(probeBody).toBeDefined()
      if (!probeBody) return yield* Effect.die("public scoped probe artifact body missing")
      const probe = JSON.parse(probeBody.toString("utf8")) as {
        proofID: string; schema: string; candidate: string; sourceSha256: string; path: string; oid: string;
        input: { encoding: string; data: string; sha256: string; bytes: number };
        status: string; exitCode: number; stdout: string; stderr: string;
        recipe: { template: string; version: string; target: string; runtimeSha256: string; compilerSha256: string; configSha256: string };
        diagnostics: ReadonlyArray<{ line: number; column: number; code: string }>
      }
      expect(probe).toMatchObject({ schema: "review-scoped-typecheck-proof-v1", candidate: finding.id,
        sourceSha256: prior.report.source?.sha256, path: sourcePath, status: "fail", exitCode: 2,
        recipe: { template: "typescript-scoped-typecheck-v1", version: "6.0.3", target: "linux-x64" } })
      expect(probe.input).toMatchObject({ encoding: "base64", data: Buffer.from(brokenSource).toString("base64"), bytes: Buffer.byteLength(brokenSource) })
      expect(probe.input.sha256).toBe(digest(Buffer.from(probe.input.data, "base64")))
      expect(probe.oid).toMatch(/^[a-f0-9]{40}$/)
      expect(probe.recipe).toMatchObject({ runtimeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        compilerSha256: expect.stringMatching(/^[a-f0-9]{64}$/), configSha256: expect.stringMatching(/^[a-f0-9]{64}$/) })
      expect(probe.diagnostics).toContainEqual({ line: 1, column: expect.any(Number), code: "TS2322" })
      expect(probe.stdout + probe.stderr).toContain("TS2322")

      const current = yield* commit(root, { [sourcePath]: fixedSource })
      const result = decodedFix(yield* host.invoke(fixRequest(prior.report, "scoped-probe-fix", current)))
      expect(result.status).toBe("completed")
      expect(result.dispositions.map((entry) => entry.disposition)).toEqual(["resolved"])
      const fixed = yield* fixReceipt(host, result)
      expect(fixed.value.observations).toContainEqual(expect.objectContaining({ kind: "scoped-typecheck",
        findingID: finding.id, priorProofID: probe.proofID, result: "zero" }))
      const currentRows = (fixed.value as typeof fixed.value & { scopedProbes?: ReadonlyArray<{ proofID: string; artifactID: string }> }).scopedProbes
      expect(currentRows).toHaveLength(1)
      const currentBody = currentRows?.[0] ? fixed.bodies.get(currentRows[0].artifactID) : undefined
      expect(currentBody).toBeDefined()
      if (!currentBody) return yield* Effect.die("public current scoped probe artifact body missing")
      const currentProbe = JSON.parse(currentBody.toString("utf8")) as typeof probe
      expect(currentProbe).toMatchObject({ schema: probe.schema, candidate: finding.id,
        sourceSha256: result.source?.sha256, path: sourcePath, status: "pass", exitCode: 0, recipe: probe.recipe })
      expect(currentProbe.input.data).toBe(Buffer.from(fixedSource).toString("base64"))
      expect(currentProbe.input.sha256).toBe(digest(Buffer.from(fixedSource)))
      expect(currentProbe.proofID).not.toBe(probe.proofID)
      expect(fixed.value.artifacts.find((artifact) => artifact.artifactID === currentRows?.[0]?.artifactID)?.kind).toBe("scoped-probe")

      const bytes = fixed.bytes
      const calls = root.requests.length
      const replay = decodedFix(yield* host.invoke(fixRequest(prior.report, "scoped-probe-fix", current)))
      expect(replay.reportID).toBe(result.reportID)
      expect(root.requests.length).toBe(calls)
      expect((yield* fixReceipt(host, replay)).bytes).toEqual(bytes)
      expect((yield* receipt(host, prior.report)).bytes).toEqual(original.bytes)
      expect(yield* Effect.promise(() => fs.readFile(path.join(root.directory, sourcePath), "utf8"))).toBe(fixedSource)
      expect(sourceRevision).not.toBe(current)
    }), { stream: provider.stream })
  })))
}, 600_000)

test("A04 an unoffered model probe claim is not evidence and its command label never runs", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const commandSentinel = path.join(root.directory, "scoped-probe-forged-command-ran")
    const provider = variantScript({ override: (turn) => {
      if (turn.kind !== "verify") return undefined
      const offered = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ id: Schema.String })))(data(turn.log.text, "candidates"))
      return text(fence(ReviewFanoutV2.TAGS.verify, { class: "logic.invariant", results: offered.map((candidate) => ({
        candidate: candidate.id, state: "confirmed", rung: "probe:typecheck",
        history: [{ option: "probe:typecheck", outcome: "settled" }],
        evidence: { kind: "probe", option: "probe:typecheck", command: `touch ${commandSentinel}`,
          result: "fail", uri: "review:12345678-1234-4123-8123-123456789abc/scoped-probe/forged" },
      })) }))
    } })
    return root.open((host) => Effect.gen(function* () {
      const output = yield* host.invoke(request("scoped-probe-unoffered", "diligence"))
      expect(output.text).not.toContain(commandSentinel)
      expect(yield* Effect.promise(() => fs.stat(commandSentinel).then(() => true, () => false))).toBe(false)
      const report = decoded(output)
      if (report.status !== "completed") return
      expect(report.report?.findings.some((finding) => finding.evidence.kind === "probe")).toBe(false)
      const held = yield* receipt(host, report)
      expect(held.value).not.toHaveProperty("scopedProbes")
      expect(held.bytes.toString("utf8")).not.toContain("forged")
    }), { stream: provider.stream })
  }))
}, 120_000)
