import { expect, test } from "bun:test"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewLocalCheckEvidence } from "../../src/review-toolkit/local-check-evidence"
import { ReviewLocalCheckScope } from "../../src/review-toolkit/local-check-scope"
import { ReviewLocalCheckTypes } from "../../src/review-toolkit/local-check-types"
import { ReviewLocalTools } from "../../src/review-toolkit/local-tools"
import { ReviewScanProjection } from "../../src/review-toolkit/scan-projection"
import { ResearchProcess } from "../../src/research-toolkit/process"

const requestInput = (files: ReadonlyArray<string>) => ({ scope: "diff" as const, lane: "no-build" as const, trusted: false, tier: "standard", files })
const base: ReviewScanProjection.Projection = { root: "/scratch/base", source: { digest: "b".repeat(64), revision: "1".repeat(40), kind: "commit" }, digest: "c".repeat(64), excluded: ["target"], files: [{ path: ".orchestra/lucy-local-checks.json", bytes: 88, sha256: "d".repeat(64) }, { path: "src/base.rs", bytes: 3, sha256: "e".repeat(64) }] }
const head: ReviewScanProjection.Projection = { root: "/scratch/head", source: { digest: "f".repeat(64), revision: "2".repeat(40), kind: "worktree" }, digest: "a".repeat(64), excluded: ["node_modules"], files: [{ path: "src/a.sh", bytes: 12, sha256: "9".repeat(64) }, { path: "README.md", bytes: 4, sha256: "8".repeat(64) }] }
const identity: ReviewLocalTools.Identity = { id: "shfmt", version: "3.14.1", target: "linux-x64", executable: "/cache/shfmt", integrity: "sha256-pin", proof: "version-probe" }
const selection: ReviewLocalCheckScope.Selection = { ok: true, files: ["src/a.sh"], flags: ["-d", "-i", "2", "-ln", "bash", "--"], coverage: "changed-files", policySha256: "7".repeat(64), projectionDigest: head.digest }
const configured: ReviewLocalCheckScope.Configured = { value: { version: 1, shfmt: { indent: 2, language: "bash" } }, sha256: selection.policySha256, projectionDigest: base.digest }
const adapterInput: ReviewLocalCheckTypes.Input = { projection: head, configured, baseProjectionDigest: base.digest, scope: "diff", files: ["src/a.sh", "README.md"] }
const captured = (data: Buffer, bytes = data.length, truncated = bytes > data.length): ResearchProcess.Captured => ({ data, bytes, truncated })
const outcome = (stdout = captured(Buffer.alloc(0)), stderr = captured(Buffer.alloc(0)), fields: Partial<ResearchProcess.Outcome> = {}): ResearchProcess.Outcome =>
  ({ exitCode: 0, durationMs: 9, timedOut: false, overflow: false, memoryExceeded: false, stdout, stderr, ...fields })
const settled = (status: ReviewAnalyze.Status, run = outcome(), reason = status === "pass" ? "native-clean" : status === "fail" ? "native-format-difference" : "local-check-process-failed"): ReviewLocalCheckTypes.Result =>
  ({ status, reason, identity, selection, outcome: run })
const request = ReviewLocalCheckEvidence.request(requestInput(adapterInput.files))

test("request captures only declared fields and enforces exact UTF-8 path-byte and entry limits", () => {
  const maxBytes = ReviewScanProjection.DEFAULTS.maxPathBytes
  const exactPath = "é".repeat(maxBytes / 2)
  const runInput = { ...requestInput([exactPath]), worktree: "/ignored", store: "/ignored", changed: {} }
  const exact = ReviewLocalCheckEvidence.request(runInput)
  expect(exact).toEqual({ ...requestInput([exactPath]), count: 1, omitted: 0, budgetExceeded: false })
  expect(Buffer.byteLength(exact.files[0]!)).toBe(maxBytes)
  const atEntryLimit = Array.from({ length: ReviewScanProjection.DEFAULTS.maxEntries }, (_, index) => String(index))
  const exactCount = ReviewLocalCheckEvidence.request(requestInput(atEntryLimit))
  atEntryLimit[0] = "caller-mutated"
  expect(exactCount.files).toHaveLength(ReviewScanProjection.DEFAULTS.maxEntries)
  expect(exactCount.files[0]).toBe("0")
  const byteOverflow = ReviewLocalCheckEvidence.request(requestInput([exactPath + "x"]))
  expect(byteOverflow).toMatchObject({ files: [], count: 1, omitted: 1, budgetExceeded: true })
  const countOverflow = ReviewLocalCheckEvidence.request(requestInput(Array.from({ length: ReviewScanProjection.DEFAULTS.maxEntries + 1 }, (_, index) => String(index))))
  expect(countOverflow).toMatchObject({ files: [], count: ReviewScanProjection.DEFAULTS.maxEntries + 1, omitted: ReviewScanProjection.DEFAULTS.maxEntries + 1, budgetExceeded: true })
  const budget = ReviewLocalCheckEvidence.build({ tool: "shfmt", request: countOverflow, result: { status: "not-run", reason: "local-check-input-budget" } })
  expect(budget.reason).toBe("local-check-input-budget")
  expect(budget.execution.adapterInvoked).toBe(false)
})

test("the frozen preflight reason ledger survives evidence formatting unchanged", () => {
  const reasons = ["nul", "path-outside", "dropped", "local-check-rules-unsupported", "lane: build is above no-build", "local-check-pack-mismatch", "read-sandbox-unsupported-host", "read-supervisor-unavailable", "local-check-template-unknown", "base:projection-filesystem", "head:projection-source-changed", "policy-invalid", "policy-bytes-changed", "host-runtime-unprepared", "local-check-output-incomplete", "local-check-native-error", "local-check-process-failed"]
  for (const reason of reasons) {
    const status = reason.startsWith("base:") || reason.startsWith("head:") || ["local-check-output-incomplete", "local-check-native-error", "local-check-process-failed"].includes(reason) ? "acquisition-error" : "not-run"
    const evidence = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: { status, reason } })
    expect(evidence.reason).toBe(reason)
    expect(evidence.status).toBe(status)
    expect(evidence.execution.adapterInvoked).toBe(false)
  }
})

test("evidence binds distinct base/head proofs and policy to the exact adapter input", () => {
  const baseExcluded = [...base.excluded]
  const headExcluded = [...head.excluded]
  const selectedFiles = [...selection.files]
  const selectedFlags = [...selection.flags]
  const baseProjection = { ...base, excluded: baseExcluded }
  const headProjection = { ...head, excluded: headExcluded }
  const selected = { ...selection, files: selectedFiles, flags: selectedFlags }
  const evidence = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: { ...settled("pass"), selection: selected }, base: baseProjection, head: headProjection, input: { ...adapterInput, projection: headProjection } })
  baseExcluded.push("caller-base-mutation")
  headExcluded.push("caller-head-mutation")
  selectedFiles.push("caller-selection-mutation")
  selectedFlags.push("caller-flag-mutation")
  expect(evidence).toMatchObject({
    base: { root: base.root, source: base.source, digest: base.digest, files: base.files.length, excluded: base.excluded },
    head: { root: head.root, source: head.source, digest: head.digest, files: head.files.length, excluded: head.excluded },
    policy: { path: ReviewLocalCheckScope.POLICY_PATH, sha256: configured.sha256, baseProjectionDigest: base.digest },
    identity, selection: { files: ["src/a.sh"], flags: selection.flags, coverage: "changed-files" },
    coverage: { kind: "changed-files", planned: ["src/a.sh"], omitted: ["README.md"], perFileCompletion: "not-established", newOnly: false },
    execution: { adapterInvoked: true, nativeOutcomePresent: true, checkCompleted: true },
  })
  expect(evidence.base?.files).toBe(2)
  expect(JSON.stringify(evidence.base)).not.toContain("src/base.rs")
  expect(evidence.base?.excluded).toEqual(["target"])
  expect(evidence.head?.excluded).toEqual(["node_modules"])
  expect(evidence.selection?.files).toEqual(["src/a.sh"])
  expect(evidence.selection?.flags).toEqual(selection.flags)
  expect(evidence.coverage.planned).toEqual(["src/a.sh"])
  const secretRequest = { ...request, secret: "request" }
  const secretResult = { ...settled("pass"), secret: "result" }
  const secretInput = { ...adapterInput, secret: "input" }
  const extraBuildInput = { tool: "shfmt" as const, request: secretRequest, result: secretResult, base, head, input: secretInput, secret: "outer" }
  const withExtras = ReviewLocalCheckEvidence.build(extraBuildInput)
  expect(JSON.stringify(withExtras)).not.toContain("secret")
})

test("native captures preserve bytes, observed and retained lengths, status, limits, and bounded failures", () => {
  const exact = Buffer.alloc(256 * 1024, 65)
  const failed = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: settled("fail", outcome(captured(exact), captured(Buffer.alloc(0)), { exitCode: 1, durationMs: 44 })), input: adapterInput })
  expect(failed).toMatchObject({ status: "fail", execution: { adapterInvoked: true, nativeOutcomePresent: true, checkCompleted: true },
    native: { exitCode: 1, durationMs: 44, timedOut: false, overflow: false, memoryExceeded: false,
      stdout: { encoding: "base64", observedBytes: exact.length, retainedBytes: exact.length, truncated: false, utf8Valid: true },
      stderr: { observedBytes: 0, retainedBytes: 0, truncated: false, utf8Valid: true } } })
  expect(Buffer.from(failed.native!.stdout.data, "base64").equals(exact)).toBe(true)
  const invalidUtf8 = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: settled("acquisition-error", outcome(captured(Buffer.from([0xff]))), "local-check-output-encoding"), input: adapterInput })
  expect(invalidUtf8).toMatchObject({ status: "acquisition-error", execution: { adapterInvoked: true, nativeOutcomePresent: true, checkCompleted: false }, native: { stdout: { data: "/w==", utf8Valid: false } } })
  const stderrBytes = Buffer.from([0xff, 0, 97])
  const truncatedStderr = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: settled("acquisition-error", outcome(captured(Buffer.alloc(0)), captured(stderrBytes, 17, true)), "local-check-output-incomplete"), input: adapterInput })
  expect(truncatedStderr.native?.stderr).toMatchObject({ encoding: "base64", observedBytes: 17, retainedBytes: 3, truncated: true, utf8Valid: false })
  expect(Buffer.from(truncatedStderr.native!.stderr.data, "base64").equals(stderrBytes)).toBe(true)
  expect(JSON.stringify(failed)).not.toContain('"type":"Buffer"')
  const capped = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: settled("acquisition-error", outcome(captured(exact), captured(Buffer.alloc(0)), { exitCode: null, overflow: true }), "local-check-output-incomplete"), input: adapterInput })
  expect(capped.native).toMatchObject({ exitCode: null, overflow: true, timedOut: false, memoryExceeded: false })
  const timedOut = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: settled("not-run", outcome(captured(Buffer.alloc(0)), captured(Buffer.alloc(0)), { exitCode: null, timedOut: true }), "local-check-time-limit"), input: adapterInput })
  expect(timedOut).toMatchObject({ execution: { adapterInvoked: true, nativeOutcomePresent: true, checkCompleted: false }, native: { exitCode: null, timedOut: true, overflow: false, memoryExceeded: false } })
  const memoryExceeded = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: settled("not-run", outcome(captured(Buffer.alloc(0)), captured(Buffer.alloc(0)), { exitCode: null, memoryExceeded: true }), "local-check-memory-limit"), input: adapterInput })
  expect(memoryExceeded.native?.memoryExceeded).toBe(true)
  const processFailure = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: settled("acquisition-error", outcome(captured(Buffer.alloc(0)), captured(Buffer.alloc(0)), { exitCode: null, failure: "x".repeat(8193) })), input: adapterInput })
  expect(processFailure.native).toMatchObject({ failure: "x".repeat(8192), failureTruncated: true })
  const trimmed = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result: settled("pass", outcome(captured(Buffer.from("tail"), 19, true))), input: adapterInput })
  expect(trimmed.native?.stdout).toMatchObject({ data: "dGFpbA==", observedBytes: 19, retainedBytes: 4, truncated: true })
})

test("preflight refusal keeps identity and selection without claiming a native result or per-file completion", () => {
  const result: ReviewLocalCheckTypes.Result = { status: "not-run", reason: "read-sandbox-unavailable", identity, selection }
  const evidence = ReviewLocalCheckEvidence.build({ tool: "shfmt", request, result, base, head, input: adapterInput })
  expect(evidence).toMatchObject({ status: "not-run", reason: "read-sandbox-unavailable", identity, selection,
    execution: { adapterInvoked: true, nativeOutcomePresent: false, checkCompleted: false },
    coverage: { perFileCompletion: "not-established", newOnly: false } })
  expect(evidence.native).toBeUndefined()
  const cargo = ReviewLocalCheckEvidence.build({ tool: "cargo-machete", request, result: { ...result, identity: { ...identity, id: "cargo-machete", version: "0.9.2" }, selection: { ...selection, coverage: "workspace" } } })
  expect(cargo.coverage.caveats).toContain("Native coverage is reported at the tool level.")
  expect(cargo.coverage.caveats).toContain("Workspace analysis respects native manifest ignore metadata.")
})

