export * as ReviewLocalChecksAnalyze from "./local-checks-analyze"

import { Context, Effect, Option, Scope } from "effect"
import { LayerNode } from "../effect/layer-node"
import { Flag } from "../flag/flag"
import { FSUtil } from "../fs-util"
import type { AppProcess } from "../process"
import { ReviewLocalCheckCards } from "../review/catalog/local-checks"
import type { ReviewAnalyze } from "./analyze"
import { ReviewLocalCargo } from "./local-cargo"
import { ReviewLocalCheckEvidence } from "./local-check-evidence"
import { ReviewLocalCheckScope } from "./local-check-scope"
import type { ReviewLocalCheckTypes } from "./local-check-types"
import { ReviewLocalShfmt } from "./local-shfmt"
import { ReviewNativeFiles } from "./native-files"
import { ReviewScanProjection } from "./scan-projection"

/** A negative-only test/host restriction; it cannot override an actual legacy-mode refusal. */
export const Supervision = Context.Reference<boolean>("@orchestra/ReviewLocalChecksAnalyze/Supervision", { defaultValue: () => true })
export function supports(template: string): boolean {
  return template === "shfmt-local-check" || template === "cargo-machete-local-check"
}

export function run(pack: ReviewAnalyze.Pack, context: ReviewAnalyze.RunContext): Effect.Effect<ReviewAnalyze.Outcome, never, AppProcess.Service | Scope.Scope> {
  return Effect.gen(function* () {
    if (!supports(pack.template)) return {
      checks: [{ id: pack.id, pack: pack.id, version: pack.version, lane: pack.lane, status: "not-run", reason: "local-check-template-unknown", workspaceExecuted: false }],
      head: [], base: [],
    }
    const tool = pack.template === "shfmt-local-check" ? "shfmt" : "cargo-machete"
    const expected = tool === "shfmt" ? ReviewLocalCheckCards.shfmt.pack : ReviewLocalCheckCards.cargoMachete.pack
    const request = ReviewLocalCheckEvidence.request({ scope: context.input.scope, lane: context.input.lane, trusted: context.input.trusted, tier: context.input.tier,
      files: context.input.scope === "files" ? context.input.files ?? [] : Object.keys(context.input.changed) })
    const finish = (result: ReviewLocalCheckTypes.Result, base?: ReviewScanProjection.Projection, head?: ReviewScanProjection.Projection, input?: ReviewLocalCheckTypes.Input) => Effect.gen(function* () {
      const evidence = ReviewLocalCheckEvidence.build({ tool, request, result, base, head, input })
      const uri = yield* context.write(`raw/${tool}-check.json`, JSON.stringify(evidence))
      return { checks: [{ id: pack.id, pack: pack.id, version: result.identity?.version ?? expected.version, lane: "no-build", status: evidence.status, reason: evidence.reason, workspaceExecuted: false, uri }], head: [], base: [] }
    })
    const refused = preflight(pack, expected, context, request)
    if (refused) return yield* finish({ status: "not-run", reason: refused })
    if (process.platform !== "linux" || process.arch !== "x64") return yield* finish({ status: "not-run", reason: "read-sandbox-unsupported-host" })
    const supervised = yield* Supervision
    if (Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" || !supervised) return yield* finish({ status: "not-run", reason: "read-supervisor-unavailable" })

    // Copies are lazy: all host-only refusals above retain evidence without acquiring either tree.
    const base = yield* context.base
    if ("failed" in base) return yield* finish({ status: "acquisition-error", reason: `base:${base.failed}` })
    const projectedBase = yield* ReviewScanProjection.create({ snapshot: base.snapshot })
    if (!projectedBase.ok) return yield* finish(projectionRefusal("base", projectedBase.reason))
    const configured = yield* ReviewLocalCheckScope.read(projectedBase.projection)
    if (!configured.ok) return yield* finish({ status: "not-run", reason: configured.reason }, projectedBase.projection)
    const head = yield* context.head
    if ("failed" in head) return yield* finish({ status: "acquisition-error", reason: `head:${head.failed}` }, projectedBase.projection)
    const projectedHead = yield* ReviewScanProjection.create({ snapshot: head.snapshot })
    if (!projectedHead.ok) return yield* finish(projectionRefusal("head", projectedHead.reason), projectedBase.projection)
    const admitted: ReviewLocalCheckTypes.Input = { projection: projectedHead.projection, configured: configured.configured, baseProjectionDigest: projectedBase.projection.digest, scope: request.scope, files: request.files }
    const filesystem = yield* Effect.serviceOption(FSUtil.Service)
    const work = tool === "shfmt" ? ReviewLocalShfmt.run(admitted) : ReviewLocalCargo.run(admitted)
    // Preserve a caller's filesystem service; old Analyze callers need no new public environment requirement.
    const result = yield* (Option.isSome(filesystem)
      ? work.pipe(Effect.provideService(FSUtil.Service, filesystem.value))
      : work.pipe(Effect.provide(LayerNode.compile(FSUtil.node))))
    return yield* finish(result, projectedBase.projection, projectedHead.projection, admitted)
  })
}

function preflight(pack: ReviewAnalyze.Pack, expected: ReviewAnalyze.Pack, context: ReviewAnalyze.RunContext, request: ReviewLocalCheckEvidence.Request) {
  if (request.budgetExceeded) return "local-check-input-budget"
  if (request.scope === "files") {
    if (request.files.some((file) => file.includes("\0"))) return "nul"
    if (request.files.some((file) => ReviewNativeFiles.containedPath(context.input.worktree, file) === undefined)) return "path-outside"
  }
  if (pack.status === "dropped") return "dropped"
  if (context.catalog.rules.some((rule) => rule.pack === pack.id)) return "local-check-rules-unsupported"
  if (["no-build", "repo", "build"].indexOf(pack.lane) > ["no-build", "repo", "build"].indexOf(context.input.lane)) return `lane: ${pack.lane} is above ${context.input.lane}`
  if (pack.id !== expected.id || pack.tool !== expected.tool || pack.version !== expected.version || pack.backend !== "pinned"
    || pack.licence !== "pinned" || pack.template !== expected.template || pack.lane !== "no-build" || pack.output.format !== "check"
    || pack.network.kind !== "none" || pack.scratchWrites !== false || pack.pin?.source !== expected.pin?.source
    || Object.keys(pack.pin?.integrity ?? {}).length !== 1 || pack.pin?.integrity["linux-x64"] !== expected.pin?.integrity["linux-x64"]) return "local-check-pack-mismatch"
}

function projectionRefusal(tree: "base" | "head", reason: string): ReviewLocalCheckTypes.Result {
  return { status: reason === "projection-filesystem" || reason === "projection-source-changed" ? "acquisition-error" : "not-run", reason: `${tree}:${reason}` }
}
