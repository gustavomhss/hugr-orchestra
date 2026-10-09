export * as CapabilityServiceProjection from "./projection"

import { Capability } from "@orchestra/schema/capability"
import type { Credential } from "@orchestra/schema/credential"
import { Cause, Context, Effect, Exit } from "effect"
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core/errors"
import { SqlError } from "effect/unstable/sql/SqlError"
import { CapabilityArtifacts } from "../../artifact/index"
import type { CapabilityConnections } from "../../connection/index"
import type { Tool } from "../../../tool/tool"
import type { CapabilityVendorSchema } from "../../catalog/schema"
import type { CapabilityJobs } from "../../job/index"
import type { CapabilityMcp } from "../../mcp/index"
import type { CapabilityServiceContract } from "../contract"
import type { CapabilityServiceSchema } from "../schema"
import { CapabilityServiceData } from "./data"

export function partial(receipt: CapabilityJobs.Receipt, output: "validated" | "unvalidated" | "failed", unresolved: string[],
  redacted = false): CapabilityServiceSchema.CallOutput {
  return { result: { status: "partial", receipt: receipt.ref.id, summary: "Service response requires reconciliation",
    completedEffects: receipt.observation.remoteOutcome === "completed" ? ["provider-acknowledged"] : [],
    unresolvedEffects: unresolved, artifactRefs: receipt.observation.artifactRefs ?? [] },
    validation: { input: "validated", output }, redacted }
}

export function replay(receipt: CapabilityJobs.Receipt): CapabilityServiceSchema.CallOutput {
  if (receipt.state === "completed") return partial(receipt, "unvalidated", ["output-unavailable"])
  if (receipt.state === "failed") return partial(receipt, "unvalidated", ["provider-reported-error"])
  return { result: { status: "unknown", receipt: receipt.ref.id, summary: "Service call outcome unknown" },
    validation: { input: "validated", output: "unvalidated" }, redacted: false }
}

/** Known ACK is already durable. Expected validation/publication failures only affect materialization. */
export const project = Effect.fn("CapabilityServiceExecution.project")(function* (input: {
  options: CapabilityServiceContract.Options
  context: Tool.Context
  proof: CapabilityJobs.ProducerProof
  receipt: CapabilityJobs.Receipt
  response: CapabilityMcp.CallResult
  validator: CapabilityVendorSchema.Validator
  credential: Credential.Value
  resolution: CapabilityConnections.Resolution
  endpoint: string
  resources: readonly string[]
  revalidate: Effect.Effect<void, Capability.Failure>
  disclose: Effect.Effect<void, Capability.Failure>
}): Effect.fn.Return<CapabilityServiceSchema.CallOutput, Capability.Failure> {
  const raw = CapabilityServiceData.snapshot(input.response)
  const validation = input.validator.outputSchema === undefined
    ? !(raw instanceof Capability.Failure) : input.response.structuredContent !== undefined &&
      input.validator.validateOutput(input.response.structuredContent).valid
  const output = validation ? input.validator.coverage.output : "failed"
  const observe = (observation: CapabilityJobs.Observation) => input.options.jobs.observeHost(input.proof, input.receipt.ref, {
    expectedGeneration: input.receipt.generation, state: input.receipt.state,
    observation: { remoteOutcome: input.response.isError ? "failed" : "completed", ...observation },
  })
  if (!validation || raw instanceof Capability.Failure) {
    const receipt = yield* observe(input.response.isError ? {} : { materialization: "failed" })
    return partial(receipt, "failed", ["output-validation", ...(input.response.isError ? ["provider-reported-error"] : [])])
  }
  const projected = CapabilityServiceData.redact(raw, input.credential, input.endpoint)
  const serialized = JSON.stringify(projected.data)
  const resource = CapabilityServiceData.snapshot(input.resolution.resource)
  if (resource instanceof Capability.Failure) {
    const receipt = yield* observe(input.response.isError ? {} : { materialization: "failed" })
    return partial(receipt, output, ["output-materialization"], projected.redacted)
  }
  // Host-only condition captured before the publication's approval wait; never part of provider data or metadata.
  const selection = Object.freeze({ resolution: Object.freeze({ ...input.resolution, resource,
    connection: Object.freeze({ ...input.resolution.connection }), target: Object.freeze({ ...input.resolution.target }),
  }), credentialHash: CapabilityArtifacts.selectionCredentialHash(input.credential) })
  const published = yield* Effect.gen(function* () {
    yield* input.revalidate
    if (Buffer.byteLength(serialized) <= 8192) return []
    const ref = yield* input.options.artifacts.publish(input.context, {
      data: new TextEncoder().encode(serialized), mime: "application/json", kind: "service-response",
      verification: "acknowledged", metadata: {},
    }, [{ action: "service_call", resources: input.resources, selection }])
    return [ref]
  }).pipe(Effect.exit)
  if (Exit.isFailure(published)) {
    if (!expected(published.cause)) return yield* fatal(published.cause)
    const receipt = yield* observe(input.response.isError ? {} : { materialization: "failed" })
    return partial(receipt, output, ["output-materialization", ...(input.response.isError ? ["provider-reported-error"] : [])], projected.redacted)
  }
  const receipt = yield* observe({ artifactRefs: published.value,
    ...(input.response.isError ? {} : { materialization: "complete" as const }) })
  const result: Capability.Result = input.response.isError
    ? partial(receipt, output, ["provider-reported-error"], projected.redacted).result
    : { status: "completed", receipt: receipt.ref.id, summary: "Service response acknowledged",
      artifactRefs: published.value, verification: "acknowledged" }
  if (published.value.length > 0) return { result, validation: { input: "validated", output }, redacted: projected.redacted }
  // Persistence and all potential permission waits precede the final inline disclosure fence.
  const disclosed = yield* input.disclose.pipe(Effect.exit)
  if (Exit.isFailure(disclosed)) {
    if (!expected(disclosed.cause)) return yield* fatal(disclosed.cause)
    return partial(receipt, output, ["output-disclosure"], projected.redacted)
  }
  return { result, validation: { input: "validated", output }, redacted: projected.redacted, data: projected.data }
})

function expected(cause: Cause.Cause<unknown>) {
  return cause.reasons.length > 0 && cause.reasons.every((reason) => reason._tag === "Fail" &&
    (reason.error instanceof Capability.Failure || reason.error instanceof CapabilityArtifacts.Failure))
}

/** beta83 typed-error combinators extract one Fail. Promote per reason before leaving the business contract. */
export function fatal(cause: Cause.Cause<unknown>) {
  return Effect.failCause(Cause.fromReasons<never>(cause.reasons.map((reason) => reason._tag === "Fail"
    ? Cause.makeDieReason(reason.error instanceof SqlError || reason.error instanceof EffectDrizzleQueryError
      ? CapabilityServiceData.failure("connection_unavailable") : reason.error)
      .annotate(Context.makeUnsafe(new Map(reason.annotations))) : reason)))
}
