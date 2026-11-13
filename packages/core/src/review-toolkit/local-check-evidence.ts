export * as ReviewLocalCheckEvidence from "./local-check-evidence"

import type { ReviewAnalyze } from "./analyze"
import type { ReviewLocalTools } from "./local-tools"
import type { ReviewLocalCheckTypes } from "./local-check-types"
import { ReviewLocalCheckScope } from "./local-check-scope"
import { ReviewScanProjection } from "./scan-projection"

export type Request = { readonly scope: "diff" | "files"; readonly lane: ReviewAnalyze.Lane; readonly trusted: boolean; readonly tier: string; readonly files: ReadonlyArray<string>; readonly count: number; readonly omitted: number; readonly budgetExceeded: boolean }
export type Proof = Omit<ReviewScanProjection.Projection, "files"> & { readonly files: number }
export type Capture = { readonly encoding: "base64"; readonly data: string; readonly observedBytes: number; readonly retainedBytes: number; readonly truncated: boolean; readonly utf8Valid: boolean }
export type Evidence = {
  readonly version: 1
  readonly tool: ReviewLocalTools.Tool
  readonly status: ReviewAnalyze.Status
  readonly reason?: string
  readonly request: Request
  readonly base?: Proof
  readonly head?: Proof
  readonly policy?: { readonly path: string; readonly sha256: string; readonly baseProjectionDigest: string }
  readonly identity?: ReviewLocalTools.Identity
  readonly selection?: ReviewLocalCheckScope.Selection
  readonly coverage: { readonly kind: ReviewLocalCheckScope.Selection["coverage"] | "unavailable"; readonly planned: ReadonlyArray<string>; readonly omitted: ReadonlyArray<string>; readonly perFileCompletion: "not-established"; readonly newOnly: false; readonly caveats: ReadonlyArray<string> }
  readonly execution: { readonly adapterInvoked: boolean; readonly nativeOutcomePresent: boolean; readonly checkCompleted: boolean }
  readonly native?: { readonly exitCode: number | null; readonly durationMs: number; readonly timedOut: boolean; readonly overflow: boolean; readonly memoryExceeded: boolean; readonly failure?: string; readonly failureTruncated: boolean; readonly stdout: Capture; readonly stderr: Capture }
}

type Build = { readonly tool: ReviewLocalTools.Tool; readonly request: Request; readonly result: ReviewLocalCheckTypes.Result; readonly base?: ReviewScanProjection.Projection; readonly head?: ReviewScanProjection.Projection; readonly input?: ReviewLocalCheckTypes.Input }

const FAILURE_LIMIT = 8192

export function request(input: Pick<ReviewAnalyze.RunInput, "scope" | "lane" | "trusted" | "tier"> & { readonly files: ReadonlyArray<string> }): Request {
  const retained = withinBudget(input.files)
  return {
    scope: input.scope,
    lane: input.lane,
    trusted: input.trusted,
    tier: input.tier,
    files: retained ? input.files.slice() : [],
    count: input.files.length,
    omitted: retained ? 0 : input.files.length,
    budgetExceeded: !retained,
  }
}

export function build(input: Build): Evidence {
  const outcome = input.result.outcome
  return {
    version: 1,
    tool: input.tool,
    status: input.result.status,
    reason: input.result.reason,
    request: snapshotRequest(input.request),
    ...(input.base ? { base: proof(input.base) } : {}),
    ...(input.head ? { head: proof(input.head) } : {}),
    ...(input.input ? { policy: policy(input.input) } : {}),
    ...(input.result.identity ? { identity: snapshotIdentity(input.result.identity) } : {}),
    ...(input.result.selection ? { selection: snapshotSelection(input.result.selection) } : {}),
    coverage: coverage(input.tool, input.request, input.result.selection),
    execution: {
      adapterInvoked: Boolean(input.input),
      nativeOutcomePresent: Boolean(outcome),
      checkCompleted: input.result.status === "pass" || input.result.status === "fail",
    },
    ...(outcome ? { native: native(outcome) } : {}),
  }
}

function withinBudget(files: ReadonlyArray<string>) {
  if (files.length > ReviewScanProjection.DEFAULTS.maxEntries) return false
  return utf8Bytes(files) <= ReviewScanProjection.DEFAULTS.maxPathBytes
}

function utf8Bytes(files: ReadonlyArray<string>) {
  return files.reduce((sum, file) => sum + Buffer.byteLength(file), 0)
}

function snapshotRequest(request: Request): Request {
  return {
    scope: request.scope,
    lane: request.lane,
    trusted: request.trusted,
    tier: request.tier,
    files: request.files.slice(),
    count: request.count,
    omitted: request.omitted,
    budgetExceeded: request.budgetExceeded,
  }
}

function proof(projection: ReviewScanProjection.Projection): Proof {
  return {
    root: projection.root,
    source: { digest: projection.source.digest, revision: projection.source.revision, kind: projection.source.kind },
    digest: projection.digest,
    files: projection.files.length,
    excluded: projection.excluded.slice(),
  }
}

function policy(input: ReviewLocalCheckTypes.Input): NonNullable<Evidence["policy"]> {
  return {
    path: ReviewLocalCheckScope.POLICY_PATH,
    sha256: input.configured.sha256,
    baseProjectionDigest: input.baseProjectionDigest,
  }
}

function snapshotIdentity(identity: ReviewLocalTools.Identity): ReviewLocalTools.Identity {
  return {
    id: identity.id,
    version: identity.version,
    target: identity.target,
    executable: identity.executable,
    integrity: identity.integrity,
    proof: identity.proof,
  }
}

function snapshotSelection(selection: ReviewLocalCheckScope.Selection): ReviewLocalCheckScope.Selection {
  return {
    ok: selection.ok,
    files: selection.files.slice(),
    flags: selection.flags.slice(),
    coverage: selection.coverage,
    policySha256: selection.policySha256,
    projectionDigest: selection.projectionDigest,
  }
}

function coverage(tool: ReviewLocalTools.Tool, request: Request, selection: ReviewLocalCheckScope.Selection | undefined): Evidence["coverage"] {
  const planned = selection ? selection.files.slice() : []
  const selected = new Set(planned)
  return {
    kind: selection?.coverage ?? "unavailable",
    planned,
    omitted: request.files.filter((file) => !selected.has(file)),
    perFileCompletion: "not-established",
    newOnly: false,
    caveats: caveats(tool),
  }
}

function caveats(tool: ReviewLocalTools.Tool) {
  const specific = tool === "shfmt"
    ? "Formatting checks cover whole selected files."
    : "Workspace analysis respects native manifest ignore metadata."
  return [
    "Native coverage is reported at the tool level.",
    specific,
    "Planned targets never mean per-file completion.",
  ]
}

function native(outcome: NonNullable<ReviewLocalCheckTypes.Result["outcome"]>): NonNullable<Evidence["native"]> {
  const failure = boundedFailure(outcome.failure)
  return {
    exitCode: outcome.exitCode,
    durationMs: outcome.durationMs,
    timedOut: outcome.timedOut,
    overflow: outcome.overflow,
    memoryExceeded: outcome.memoryExceeded,
    ...failure,
    stdout: capture(outcome.stdout),
    stderr: capture(outcome.stderr),
  }
}

function boundedFailure(failure: string | undefined) {
  if (failure === undefined) return { failureTruncated: false as const }
  if (failure.length <= FAILURE_LIMIT) return { failure, failureTruncated: false as const }
  return { failure: failure.slice(0, FAILURE_LIMIT), failureTruncated: true as const }
}

function capture(stream: { readonly data: Buffer; readonly bytes: number; readonly truncated: boolean }): Capture {
  const bytes = Buffer.from(stream.data)
  return {
    encoding: "base64",
    data: bytes.toString("base64"),
    observedBytes: stream.bytes,
    retainedBytes: bytes.length,
    truncated: stream.truncated,
    utf8Valid: Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes),
  }
}
