export * as ReviewBuildLane from "./build-lane"

import path from "path"
import { lstat } from "fs/promises"
import { Effect, Option, Schema } from "effect"
import { ProbeAssets, ProbeError } from "../research-toolkit/probe/assets"
import { ProbeTypecheck } from "../research-toolkit/probe/typecheck"
import { Probe } from "../research-toolkit/probe/types"
import { ResearchProcess } from "../research-toolkit/process"
import type { ReviewAnalyze } from "./analyze"

// Plan 5.1, the first build-lane pack. One closed argv: the project's own tsc, never a fetched binary and never a
// model-supplied flag. Writes stay in the scratch copy. This repository's base cites typecheck.yml instead (R19);
// the marker is read from the base copy so the change under review cannot add it.

const TEMPLATE = "tsc-noemit"
const TIMEOUT_MS = 10 * 60_000
const OUTPUT_BYTES = 16 * 1024 * 1024
const REPO_NAME = "orchestra"
const TEST_GUARD = "do not run tests from root"

export const TYPECHECK_CI = "cites typecheck.yml (R19)"

type Confine = ReviewAnalyze.Confine

export const run = Effect.fn("ReviewBuildLane.run")(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine,
) {
  if (context.input.lane !== "build") return refused(pack, `lane: build is above ${context.input.lane}`)
  if (!context.input.trusted) return refused(pack, "build lane off (D6)")
  if (pack.template !== TEMPLATE) return refused(pack, "not-built")
  if (pack.status === "dropped") return refused(pack, "dropped")
  const base = yield* context.base
  if ("failed" in base) return refused(pack, base.failed)
  // R19 is a property of this repository, not of the diff. A head that adds the marker does not turn the lane off.
  if (yield* citesTypecheckCi(base.snapshot.root)) return refused(pack, TYPECHECK_CI)
  const head = yield* context.head
  if ("failed" in head) return refused(pack, head.failed)
  const root = head.snapshot.root
  const tsconfig = yield* Effect.promise(() => tsconfigRefusal(root))
  if (tsconfig) return refused(pack, tsconfig)
  const located = yield* ProbeAssets.project("typescript", root, root).pipe(
    Effect.catchTag("Probe.Error", (error) => Effect.succeed(error)),
  )
  if (!located) return refused(pack, "tsc absent")
  if (located instanceof ProbeError) return refused(pack, located.reason)
  const env = ResearchProcess.environment()
  const node = Bun.which("node", { PATH: env.PATH ?? "" })
  if (!node) return refused(pack, "node absent", located.version)
  const argv = ProbeTypecheck.argv({
    node,
    tsc: located.entry,
    project: "tsconfig.json",
    heapMiB: Probe.Limits.heapMiB,
  })
  // R8: analyze already runs packs one at a time. The rss cap and this timeout are the rest of the host cap.
  const ran = yield* confine({
    argv,
    cwd: root,
    write: [root],
    env,
    timeoutMs: TIMEOUT_MS,
    maxBytes: OUTPUT_BYTES,
    tailBytes: Probe.Limits.outputBytes,
  })
  if ("denied" in ran) return refused(pack, ran.denied, located.version)
  const stdout = ran.outcome.stdout.data.toString("utf8")
  const stderr = ran.outcome.stderr.data.toString("utf8")
  const text = [`$ ${argv.join(" ")}`, "stdout:", stdout, "stderr:", stderr].join("\n")
  const uri = yield* context.write("raw/tsc.log", text)
  const unsettled = settle(ran.outcome)
  if (unsettled) return finished(pack, unsettled.status, located.version, true, unsettled.reason, uri)
  if (ran.outcome.exitCode === 127) return finished(pack, "not-run", located.version, true, "tsc absent", uri)
  if (ran.outcome.exitCode === 0) return finished(pack, "pass", located.version, true, undefined, uri)
  return finished(pack, "fail", located.version, true, `exit ${ran.outcome.exitCode}`, uri)
})

/** True when `root` is this repository's tree: the card cites `typecheck.yml` instead of running tsc. */
export const citesTypecheckCi = Effect.fn("ReviewBuildLane.citesTypecheckCi")(function* (root: string) {
  const text = yield* Effect.promise(() => Bun.file(path.join(root, "package.json")).text().catch(() => undefined))
  if (!text || !orchestraTestGuard(text)) return false
  const info = yield* Effect.promise(() =>
    lstat(path.join(root, ".github", "workflows", "typecheck.yml")).catch(() => undefined),
  )
  return info?.isFile() === true
})

function orchestraTestGuard(text: string) {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) return false
  const body = json.value
  if (!body || typeof body !== "object") return false
  if (!("name" in body) || body.name !== REPO_NAME) return false
  if (!("scripts" in body) || !body.scripts || typeof body.scripts !== "object") return false
  if (!("test" in body.scripts) || typeof body.scripts.test !== "string") return false
  return body.scripts.test.includes(TEST_GUARD)
}

/** A root tsconfig the host may pass to tsc, or the refusal reason. A symlink is not followed. */
async function tsconfigRefusal(root: string) {
  const file = path.join(root, "tsconfig.json")
  const info = await lstat(file).catch(() => undefined)
  if (!info) return "typecheck-no-tsconfig"
  if (info.isSymbolicLink()) return "symlink"
  if (!info.isFile()) return "typecheck-no-tsconfig"
  return undefined
}

function settle(outcome: ResearchProcess.Outcome) {
  if (outcome.timedOut) return { status: "not-run" as const, reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run" as const, reason: "memory cap" }
  if (outcome.overflow) return { status: "acquisition-error" as const, reason: "output cap" }
  if (outcome.failure !== undefined) return { status: "acquisition-error" as const, reason: outcome.failure }
  return undefined
}

function refused(pack: ReviewAnalyze.Pack, reason: string, version = pack.version) {
  return finished(pack, "not-run", version, false, reason)
}

function finished(
  pack: ReviewAnalyze.Pack,
  status: ReviewAnalyze.Status,
  version: string,
  workspaceExecuted: boolean,
  reason?: string,
  uri?: string,
): ReviewAnalyze.Outcome {
  return {
    checks: [{
      id: pack.id,
      pack: pack.id,
      version,
      lane: pack.lane,
      status,
      ...(reason === undefined ? {} : { reason }),
      workspaceExecuted,
      ...(uri === undefined ? {} : { uri }),
    }],
    head: [],
    base: [],
  }
}
