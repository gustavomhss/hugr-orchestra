export * as CapabilityServiceExecution from "./execute"

import { Capability } from "@orchestra/schema/capability"
import { Cause, Effect, Exit } from "effect"
import { and, eq } from "drizzle-orm"
import { Credential } from "../../credential"
import { Location } from "../../location"
import { ToolRegistry } from "../../tool/registry"
import { CapabilityVendorSchema } from "../catalog/schema"
import { CapabilityPolicy } from "../policy"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityTargetTable } from "../sql"
import type { CapabilityServiceContract } from "./contract"
import { CapabilityServiceData } from "./execution/data"
import { CapabilityServiceProjection } from "./execution/projection"

/** One canonical platform leaf's business function. Registry remains the only tool settlement boundary. */
export const make = (options: CapabilityServiceContract.Options) => Effect.gen(function* () {
  const location = yield* Location.Service
  const policy = yield* CapabilityPolicy.make
  const registry = yield* ToolRegistry.Service
  const credentials = yield* Credential.Service

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
    const invalidCredential = CapabilityServiceData.credentialFailure(credential)
    if (invalidCredential) return yield* invalidCredential
    const proof = { owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName }
    // Consume an approved permit with the exact selected rows in the same writer. No approval or network here.
    const gate = (permit: CapabilityPolicy.Permit) => policy.commit(permit, (tx) => Effect.gen(function* () {
      if (permit.binding !== binding) return yield* CapabilityServiceData.failure("invocation_binding_mismatch")
      const connection = yield* tx.select().from(CapabilityConnectionTable).where(eq(CapabilityConnectionTable.id, resolution.connection.id)).get()
      const target = yield* tx.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, resolution.target.id)).get()
      const selected = yield* tx.select().from(CapabilityBindingTable).where(and(
        eq(CapabilityBindingTable.target_id, resolution.target.id), eq(CapabilityBindingTable.session_id, context.sessionID),
        eq(CapabilityBindingTable.agent_id, context.agent),
      )).get()
      if (!connection || !target || !selected || connection.state !== "active" ||
        connection.project_id !== binding.owner.projectID || connection.directory !== binding.owner.location.directory ||
        (connection.workspace_id ?? undefined) !== binding.owner.location.workspaceID ||
        connection.provider !== fixed.provider || connection.generation !== resolution.connection.generation ||
        connection.endpoint !== resolution.endpoint || connection.credential_id !== resolution.credentialID ||
        target.connection_id !== connection.id || target.generation !== resolution.target.generation ||
        target.environment !== resolution.target.environment ||
        CapabilityVendorSchema.hash(target.resource) !== CapabilityVendorSchema.hash(resolution.resource) ||
        (!selected.actions.includes("service_call") && !selected.actions.includes("*")))
        return yield* CapabilityServiceData.failure("stale_descriptor")
      const fresh = yield* credentials.get(resolution.credentialID)
      if (!fresh || fresh.id !== resolution.credentialID || fresh.integrationID !== connection.integration_id ||
        CapabilityServiceData.credentialFailure(fresh.value) ||
        CapabilityServiceData.credentialIdentity(fresh.value) !== CapabilityServiceData.credentialIdentity(credential))
        return yield* CapabilityServiceData.failure("authentication_revoked")
    })).pipe(Effect.mapError((error) => error instanceof Capability.Failure ? error : CapabilityServiceData.failure("connection_unavailable")),
      Effect.andThen(Effect.suspend(() => current() ? Effect.void : Effect.fail(CapabilityServiceData.failure("stale_descriptor")))))
    const revalidate = Effect.gen(function* () {
      const permit = yield* policy.authorize(context, { action: "service_call", resources })
      yield* gate(permit)
      return permit
    })
    const acquired = yield* Effect.scoped(Effect.gen(function* () {
      const session = yield* options.transport.open({ ...resolution, owner: binding.owner, credential })
      const checkCatalog = Effect.gen(function* () {
        const catalog = options.filterCatalog(fixed.provider, yield* session.listTools)
        const tools = catalog.tools.filter((tool) => tool.name === description.name)
        const tool = tools[0]
        if (catalog.catalogGeneration !== ref.catalogGeneration || tools.length !== 1 || !tool ||
          tool.summary !== description.summary) return yield* CapabilityServiceData.failure("stale_descriptor")
        const fresh = yield* CapabilityVendorSchema.compile(tool.inputSchema, tool.outputSchema)
        if (fresh.schemaHash !== ref.schemaHash) return yield* CapabilityServiceData.failure("stale_descriptor")
      })
      yield* checkCatalog
      const admitted = yield* options.jobs.admit(context, { kind: "worker", operation: "service_call",
        connection: resolution.connection, target: resolution.target,
        requestHash: CapabilityVendorSchema.hash({ provider: fixed.provider, operation: description.name, descriptor: ref,
          input: validated.value, owner: binding.owner, purpose: "service_call", selection: {
            connection: resolution.connection, target: resolution.target, resource: resolution.resource,
            credentialID: resolution.credentialID, endpoint: resolution.endpoint,
          } }),
      })
      if (admitted.reused) return { kind: "replay" as const, output: CapabilityServiceProjection.replay(yield* options.jobs.read(context, admitted.ref)) }
      const submitting = yield* options.jobs.transition(context, admitted.ref, {
        expectedGeneration: 0, state: "submitting", observation: {},
      })
      // Approval/admission can wait. Refresh the allocator's expiry, generation and schema proof again.
      yield* options.discovery.describe(context, ref, captured)
      const permit = yield* revalidate
      // Last network read uses the very session that will call the operation, after every approval.
      yield* checkCatalog
      yield* gate(permit)
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
      return { kind: "acknowledged" as const, acknowledged }
    }))
    // Session disposal may wait. It must finish before the final release of provider data.
    if (acquired.kind === "replay") return acquired.output
    const acknowledged = acquired.acknowledged
    if (!acknowledged.response) return CapabilityServiceProjection.replay(acknowledged.receipt)
    return yield* CapabilityServiceProjection.project({ options, context, proof, receipt: acknowledged.receipt,
      response: acknowledged.response, validator, credential, endpoint: resolution.endpoint, resources,
      revalidate: revalidate.pipe(Effect.asVoid), disclose: revalidate.pipe(Effect.asVoid) })
  })
  return execute
})
