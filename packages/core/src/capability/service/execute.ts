export * as CapabilityServiceExecution from "./execute"

import { Capability } from "@orchestra/schema/capability"
import { Cause, Effect, Exit } from "effect"
import { Location } from "../../location"
import { ToolRegistry } from "../../tool/registry"
import { CapabilityVendorSchema } from "../catalog/schema"
import { CapabilityPolicy } from "../policy"
import type { CapabilityServiceContract } from "./contract"
import { CapabilityServiceData } from "./execution/data"
import { CapabilityServiceProjection } from "./execution/projection"

/** One canonical platform leaf's business function. Registry remains the only tool settlement boundary. */
export const make = (options: CapabilityServiceContract.Options) => Effect.gen(function* () {
  const location = yield* Location.Service
  const policy = yield* CapabilityPolicy.make
  const registry = yield* ToolRegistry.Service

  const execute: CapabilityServiceContract.Execute = (provider, supplied, suppliedContext) => Effect.gen(function* () {
    // Includes descriptor and actual Tool.Context. No caller accessor executes before the first yield.
    const fixed = CapabilityServiceData.input({ provider, input: supplied, context: suppliedContext })
    if (fixed instanceof Capability.Failure) return yield* fixed
    const context = fixed.context
    const ref = fixed.input.descriptor
    const binding = yield* policy.binding(context)
    const canonicalName = `platform_${fixed.provider}`
    if ((binding.lineage.at(-1)?.toolName ?? binding.rootToolName) !== canonicalName ||
      binding.owner.projectID !== location.project.id || binding.owner.location.directory !== location.directory ||
      binding.owner.location.workspaceID !== location.workspaceID) return yield* CapabilityServiceData.failure("target_denied")
    const captured = yield* ToolRegistry.captured
    const identity = captured?.registrationIdentity(canonicalName)
    const current = () => identity !== undefined && registry.currentRegistrationIdentity(canonicalName) === identity
    if (!captured || !current()) return yield* CapabilityServiceData.failure("stale_descriptor")
    yield* policy.assert(context, { action: "service_call", resources: ["service_call", fixed.provider, ref.connectionID, ref.targetID] })
    const description = yield* options.discovery.describe(context, ref, captured)
    const resolution = yield* options.connections.resolve(context, { provider: fixed.provider,
      connectionID: ref.connectionID, targetID: ref.targetID, action: "service_call" })
    if (resolution.connection.provider !== fixed.provider || resolution.connection.id !== ref.connectionID ||
      resolution.target.id !== ref.targetID || resolution.target.connectionID !== ref.connectionID)
      return yield* CapabilityServiceData.failure("target_denied")
    const resources = [fixed.provider, ref.connectionID, ref.targetID, `${fixed.provider}:${description.name}`]
    yield* policy.assert(context, { action: "service_call", resources })
    const args = CapabilityServiceData.argumentsFor(fixed.input.input, resolution.resource)
    if (args instanceof Capability.Failure) return yield* args
    const validator = yield* CapabilityVendorSchema.compile(description.inputSchema, description.outputSchema)
    if (validator.schemaHash !== ref.schemaHash) return yield* CapabilityServiceData.failure("stale_descriptor")
    const validated = validator.validateInput(args)
    if (!validated.valid) return yield* validated.failure
    const credential = yield* options.connections.loadCredential(context, resolution, "service_call")
    const proof = { owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName }
    const revalidate = Effect.gen(function* () {
      const permit = yield* policy.authorize(context, { action: "service_call", resources })
      const fresh = yield* options.connections.loadCredential(context, resolution, "service_call")
      if (CapabilityServiceData.credentialIdentity(fresh) !== CapabilityServiceData.credentialIdentity(credential))
        return yield* CapabilityServiceData.failure("authentication_revoked")
      if ((yield* policy.binding(context)) !== binding) return yield* CapabilityServiceData.failure("invocation_binding_mismatch")
      yield* policy.commit(permit, () => Effect.void)
      if (!current()) return yield* CapabilityServiceData.failure("stale_descriptor")
    }).pipe(Effect.catchTag("SqlError", () => Effect.fail(CapabilityServiceData.failure("connection_unavailable"))))
    return yield* Effect.scoped(Effect.gen(function* () {
      const session = yield* options.transport.open({ ...resolution, owner: binding.owner, credential })
      const catalog = options.filterCatalog(fixed.provider, yield* session.listTools)
      const tools = catalog.tools.filter((tool) => tool.name === description.name)
      const tool = tools[0]
      if (catalog.catalogGeneration !== ref.catalogGeneration || tools.length !== 1 || !tool ||
        tool.summary !== description.summary) return yield* CapabilityServiceData.failure("stale_descriptor")
      const fresh = yield* CapabilityVendorSchema.compile(tool.inputSchema, tool.outputSchema)
      if (fresh.schemaHash !== ref.schemaHash) return yield* CapabilityServiceData.failure("stale_descriptor")
      const admitted = yield* options.jobs.admit(context, { kind: "worker", operation: "service_call",
        connection: resolution.connection, target: resolution.target,
        requestHash: CapabilityVendorSchema.hash({ provider: fixed.provider, operation: description.name, descriptor: ref,
          input: validated.value, owner: binding.owner, purpose: "service_call", selection: {
            connection: resolution.connection, target: resolution.target, resource: resolution.resource,
            credentialID: resolution.credentialID, endpoint: resolution.endpoint,
          } }),
      })
      if (admitted.reused) return CapabilityServiceProjection.replay(yield* options.jobs.read(context, admitted.ref))
      const submitting = yield* options.jobs.transition(context, admitted.ref, {
        expectedGeneration: 0, state: "submitting", observation: {},
      })
      // Approval/admission can wait. Refresh the allocator's expiry, generation and schema proof again.
      yield* options.discovery.describe(context, ref, captured)
      yield* revalidate
      if (!current()) return yield* CapabilityServiceData.failure("stale_descriptor")
      const acknowledged = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
        const exit = yield* restore(Effect.suspend(() => current()
          ? session.callTool(description.name, validated.value)
          : Effect.fail(CapabilityServiceData.failure("stale_descriptor")))).pipe(Effect.exit)
        const receipt = yield* options.jobs.observeHost(proof, submitting.ref, {
          expectedGeneration: submitting.generation,
          state: Exit.isSuccess(exit) ? exit.value.isError ? "failed" : "completed" : "unknown",
          observation: Exit.isSuccess(exit) ? exit.value.isError ? { remoteOutcome: "failed" }
            : { remoteOutcome: "completed", materialization: "pending" } : {},
        }).pipe(Effect.exit)
        if (Exit.isFailure(receipt)) return yield* Effect.failCause(Exit.isFailure(exit)
          ? Cause.combine(exit.cause, receipt.cause) : receipt.cause)
        if (Exit.isFailure(exit)) {
          if (Cause.hasDies(exit.cause) || Cause.hasInterrupts(exit.cause)) return yield* Effect.failCause(exit.cause)
          return { receipt: receipt.value }
        }
        return { receipt: receipt.value, response: exit.value }
      }))
      if (!acknowledged.response) return CapabilityServiceProjection.replay(acknowledged.receipt)
      return yield* CapabilityServiceProjection.project({ options, context, proof, receipt: acknowledged.receipt,
        response: acknowledged.response, validator, credential, endpoint: resolution.endpoint, resources, revalidate })
    }))
  })
  return execute
})
