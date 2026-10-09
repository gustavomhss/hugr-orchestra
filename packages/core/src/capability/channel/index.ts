export * as CapabilityChannels from "./index"

import { Capability } from "@orchestra/schema/capability"
import { and, sql } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { Database } from "../../database/database"
import { Location } from "../../location"
import { Tool } from "../../tool/tool"
import { CapabilityArtifacts } from "../artifact"
import { CapabilityConnections } from "../connection"
import { CapabilityInvocation } from "../invocation"
import { CapabilityJobs } from "../job"
import { CapabilityPolicy } from "../policy"
import { CapabilityArtifactTable, CapabilityJobTable } from "../sql"
import { CapabilityDiscord } from "../providers/discord"
import { CapabilitySlack } from "../providers/slack"
import { Failure, request, safeText, validateOptions, type Options, type RPC } from "./http"
import { Evidence, Output, Read, Send, Update, type Acquisition, type Message } from "./schema"
import { requestHash } from "./request"

export type MakeOptions = Options & {
  connections: CapabilityConnections.Interface
  jobs: Effect.Success<typeof CapabilityJobs.make>
  artifacts: Effect.Success<ReturnType<typeof CapabilityArtifacts.make>>
}

/** Location producer only. The lead registers these canonical leaves through producedTools. */
export const make = (options: MakeOptions) => Effect.gen(function* () {
  const location = yield* Location.Service
  const database = yield* Database.Service
  const policy = yield* CapabilityPolicy.make
  const connections = options.connections
  const jobs = options.jobs
  const artifacts = options.artifacts
  const transport = Object.freeze({ fixtureOrigin: options.fixtureOrigin,
    timeoutMs: options.timeoutMs, maxResponseBytes: options.maxResponseBytes })
  if (!validateOptions(transport)) return yield* failure("unsupported_schema")
  const placement = { projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }

  const prepare = Effect.fn("CapabilityChannels.prepare")(function* (
    context: Tool.Context, input: Read | Send | Update, operation: string, root: string,
  ) {
    const binding = yield* CapabilityInvocation.require(context, placement)
    if (binding.rootToolName !== root) return yield* failure("invocation_binding_mismatch")
    const resolved = yield* connections.resolve(context, { provider: input.provider,
      ...(input.connectionID ? { connectionID: input.connectionID } : {}),
      ...(input.targetID ? { targetID: input.targetID } : {}), action: operation })
    const endpoint = input.provider === "slack" ? CapabilitySlack.endpoint : CapabilityDiscord.endpoint
    if (resolved.endpoint !== endpoint) return yield* failure("target_denied")
    const resource = input.provider === "slack" ? Schema.decodeUnknownOption(CapabilitySlack.Resource)(resolved.resource)
      : Schema.decodeUnknownOption(CapabilityDiscord.Resource)(resolved.resource)
    if (resource._tag === "None") return yield* failure("target_denied")
    const selectedThread = "threadID" in input ? input.threadID : undefined
    if (resource.value.threadID && selectedThread && selectedThread !== resource.value.threadID) return yield* failure("target_denied")
    const threadID = selectedThread ?? resource.value.threadID
    const credential = yield* connections.loadCredential(context, resolved, operation)
    if (credential.type === "oauth" && credential.expires <= Date.now()) return yield* failure("authentication_required")
    const secret = credential.type === "key" ? credential.key : credential.access
    if (!secret || /[\r\n]/.test(secret)) return yield* failure("authentication_required")
    const authorization = `${input.provider === "discord" && credential.type === "key" ? "Bot" : "Bearer"} ${secret}`
    const rpc: RPC = (http) => Effect.gen(function* () {
      // Every actual RPC rechecks exact credential, binding and root policy. No ambient account lookup.
      const current = yield* connections.loadCredential(context, resolved, http.effect ? operation : "read")
      if (current.type === "oauth" && current.expires <= Date.now()) return yield* failure("authentication_required")
      if ((current.type === "key" ? current.key : current.access) !== secret) return yield* failure("authentication_revoked")
      yield* policy.assert(context, { action: http.effect ? "effect" : "read",
        resources: [input.provider, resolved.connection.id, resolved.target.id] })
      return yield* request(endpoint, authorization, http, transport)
    })
    // Vendor membership reads are fresh-dispatch preflight, never durable-retry admission.
    const adapter = input.provider === "slack" ? CapabilitySlack.make(rpc, resolved.resource, selectedThread)
      : CapabilityDiscord.make(rpc, resolved.resource, selectedThread)
    const proof: CapabilityJobs.ProducerProof = { owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName }
    const clean = (message: Message): Message => ({ ...message, text: safeText(message.text, secret),
      reactions: message.reactions.map((reaction) => ({ ...reaction, emoji: safeText(reaction.emoji, secret) })) })
    const safeMetadata = (value: unknown) => !JSON.stringify(value).includes(secret)
    const channelID = input.provider === "discord" ? threadID ?? resource.value.channelID : resource.value.channelID
    if (!safeMetadata({ channelID })) return yield* failure("target_denied")
    return { adapter, resolved, proof, clean, safeMetadata, channelID, threadID }
  })

  const retain = Effect.fn("CapabilityChannels.retain")(function* (
    context: Tool.Context, provider: "slack" | "discord", channelID: string, verification: Capability.Verification,
    acquisition?: Acquisition, acknowledgment?: Schema.Json, jobRef?: Capability.JobRef,
  ) {
    return yield* artifacts.publish(context, { data: new TextEncoder().encode(JSON.stringify(
      acknowledgment === undefined ? acquisition : { acknowledgment, ...(acquisition ? { acquisition } : {}) },
    )),
      mime: "application/json", kind: "channel-evidence", verification,
      metadata: { provider, channelID, ...(jobRef ? { jobID: jobRef.id } : {}) },
    })
  })

  const read = Effect.fn("CapabilityChannels.read")(function* (input: Read, context: Tool.Context): Effect.fn.Return<Output,
    Capability.Failure | Failure | CapabilityArtifacts.Failure> {
    const prepared = yield* prepare(context, input, "read", "channel_read")
    const adapter = yield* prepared.adapter
    const acquired = yield* adapter.read(input)
    const acquisition = { ...acquired, messages: acquired.messages.map(prepared.clean) }
    if (!prepared.safeMetadata(acquisition)) return yield* failure("acquisition_failed")
    const ref = yield* retain(context, input.provider, acquisition.channelID, "observed", acquisition)
    return { provider: input.provider, channelID: acquisition.channelID, acquisition,
      result: { status: "completed", receipt: ref.id, summary: "Bounded channel page acquired and retained",
        artifactRefs: [ref], verification: "observed" } }
  })

  const replay = Effect.fn("CapabilityChannels.replay")(function* (
    input: Send | Update, context: Tool.Context, prepared: Effect.Success<ReturnType<typeof prepare>>, ref: Capability.JobRef,
  ): Effect.fn.Return<Output, Capability.Failure> {
    const saved = yield* jobs.readHost(prepared.proof, ref)
    const receipt = saved.receipt
    // Read-only recovery of this exact producer's published evidence when a job CAS could not attach its refs.
    const refs = receipt.observation.artifactRefs?.length ? receipt.observation.artifactRefs
      : yield* database.db.select({ id: CapabilityArtifactTable.id, revision: CapabilityArtifactTable.revision })
        .from(CapabilityArtifactTable).where(and(
          sql`json_extract(${CapabilityArtifactTable.metadata}, '$.jobID') = ${ref.id}`,
          sql`json_extract(${CapabilityArtifactTable.producer}, '$.sessionID') = ${prepared.proof.producer.sessionID}`,
          sql`json_extract(${CapabilityArtifactTable.producer}, '$.agentID') = ${prepared.proof.producer.agentID}`,
          sql`json_extract(${CapabilityArtifactTable.producer}, '$.assistantMessageID') = ${prepared.proof.producer.assistantMessageID}`,
          sql`json_extract(${CapabilityArtifactTable.producer}, '$.callID') = ${prepared.proof.producer.callID}`,
        )).limit(2).all().pipe(Effect.orDie)
    const retained = yield* Effect.forEach(refs, (artifact) =>
      artifacts.read(context, artifact).pipe(Effect.result))
    const records = retained.flatMap((record) => record._tag === "Success" ? [record.success] : [])
    const evidence = records.flatMap((record) => {
      const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(Evidence))(new TextDecoder().decode(record.data))
      return parsed._tag === "Some" ? [parsed.value] : []
    })
    const unsafeID = !!saved.providerID && (!prepared.safeMetadata({ messageID: saved.providerID }) ||
      evidence.some((item) => item.acknowledgment.providerIDProjection === "omitted"))
    const messageID = saved.providerID && !unsafeID ? saved.providerID : undefined
    const common = { provider: input.provider, channelID: prepared.channelID, jobRef: ref,
      ...(messageID ? { messageID } : {}) }
    const verified = receipt.state === "completed" && receipt.observation.remoteOutcome === "completed"
    const artifactRefs = records.map((record) => ({ id: record.metadata.id, revision: record.metadata.revision }))
    const acquisition = evidence.find((item) => item.acquisition && prepared.safeMetadata(item.acquisition))?.acquisition
    const retainedVerified = records.length > 0 && records.length === retained.length && evidence.length === records.length &&
      records.every((record) => record.metadata.verification === "verified") &&
      evidence.every((item) => item.acknowledgment.postcondition === "verified")
    const unsafeEvidence = evidence.some((item) => !item.acquisition || !prepared.safeMetadata(item.acquisition))
    if (verified && receipt.observation.materialization === "complete" && retainedVerified && !unsafeID && !unsafeEvidence)
      return { ...common, ...(acquisition ? { acquisition } : {}), result: { status: "completed", receipt: ref.id,
        summary: "Provider mutation independently verified and retained", verification: "verified", artifactRefs } }
    const acknowledged = ["submitted", "running", "completed"].includes(receipt.state) || evidence.length > 0
    if (acknowledged) return { ...common, result: { status: "partial", receipt: ref.id,
      summary: "Provider acknowledged mutation; verification or evidence retention unresolved",
      completedEffects: ["provider_acknowledged"], unresolvedEffects: [
        ...(!verified && !retainedVerified ? ["postcondition_readback"] : []),
        ...(receipt.observation.materialization === "failed" || records.length === 0 ? ["evidence_retention"] : []),
        ...(records.length !== retained.length || evidence.length !== records.length ? ["evidence_access"] : []),
        ...(unsafeID ? ["provider_id_projection"] : []),
        ...(!unsafeID && unsafeEvidence ? ["evidence_metadata"] : []),
        ...(!verified && retainedVerified ? ["job-observation"] : []),
      ], artifactRefs } }
    return { ...common, result: { status: "unknown", receipt: ref.id,
      summary: "Existing durable operation requires reconciliation; no retry dispatched", reconciliationRef: ref.id } }
  })

  // Compatibility checkpoint until the shared atomic admit facade is committed.
  const admit = Effect.fn("CapabilityChannels.admit")(function* (context: Tool.Context, input: CapabilityJobs.CreateInput) {
    const existing = yield* database.db.select({ id: CapabilityJobTable.id }).from(CapabilityJobTable).where(and(
      sql`${CapabilityJobTable.operation} = ${input.operation}`,
      sql`json_extract(${CapabilityJobTable.invocation}, '$.sessionID') = ${context.sessionID}`,
      sql`json_extract(${CapabilityJobTable.invocation}, '$.agentID') = ${context.agent}`,
      sql`json_extract(${CapabilityJobTable.invocation}, '$.assistantMessageID') = ${context.assistantMessageID}`,
      sql`json_extract(${CapabilityJobTable.invocation}, '$.callID') = ${context.toolCallID}`,
    )).limit(2).all().pipe(Effect.orDie)
    if (existing.length > 1) return yield* failure("outcome_unknown")
    const ref = yield* jobs.create(context, input)
    return { ref, reused: existing.some((row) => row.id === ref.id) }
  })

  const mutate = Effect.fn("CapabilityChannels.mutate")(function* (
    input: Send | Update, context: Tool.Context, kind: "send" | "update",
  ): Effect.fn.Return<Output, Capability.Failure | Failure | CapabilityArtifacts.Failure> {
    // Unsupported payloads fail before durable intent or HTTP mutation.
    if (input.provider === "slack" && "replyTo" in input && input.replyTo) return yield* failure("unsupported_operation")
    if (input.provider === "slack" && "emoji" in input && !/^[a-z0-9_+-]{1,80}(?![\s\S])/.test(input.emoji))
      return yield* failure("unsupported_schema")
    const operation = `channel.${kind}`
    const prepared = yield* prepare(context, input, operation, `channel_${kind}`)
    const admission = yield* admit(context, { kind: "provider", operation,
      requestHash: requestHash(input, prepared.resolved, prepared.threadID),
      connection: prepared.resolved.connection, target: prepared.resolved.target })
    const ref = admission.ref
    if (admission.reused) return yield* replay(input, context, prepared, ref)
    const adapter = yield* prepared.adapter
    if ("messageID" in input && !(yield* adapter.get(input.messageID))) return yield* failure("target_denied")
    if ("replyTo" in input && input.replyTo && !(yield* adapter.get(input.replyTo))) return yield* failure("target_denied")
    yield* jobs.transition(context, ref, { expectedGeneration: 0, state: "submitting", observation: {},
      ...("messageID" in input ? { providerID: input.messageID } : {}),
    })
    const observe = (generation: number, state: Capability.JobState, providerID?: string, observation: CapabilityJobs.Observation = {}) =>
      jobs.observeHost(prepared.proof, ref, { expectedGeneration: generation, state, providerID, observation }).pipe(
        Effect.catchTag("Capability.Failure", () => Effect.gen(function* () {
          // One current-state reconciliation attempt; expected CAS/policy failures cannot erase known effects.
          const current = yield* jobs.readHost(prepared.proof, ref).pipe(Effect.result)
          if (current._tag === "Failure" || (current.success.providerID && providerID && current.success.providerID !== providerID))
            return undefined
          if (state === "submitted" && current.success.providerID === providerID &&
            ["submitted", "running", "completed"].includes(current.success.receipt.state)) return current.success.receipt
          return yield* jobs.observeHost(prepared.proof, ref, { expectedGeneration: current.success.receipt.generation,
            state, providerID, observation }).pipe(Effect.catchTag("Capability.Failure", () => Effect.succeed(undefined)))
        })),
      )
    // Acceptance and ID persistence are indivisible locally; the HTTP wait itself remains interruptible.
    const submitted = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const result = yield* restore("action" in input ? adapter.update(input) : adapter.send(input)).pipe(
        Effect.onInterrupt(() => observe(1, "unknown").pipe(Effect.orDie)), Effect.result,
      )
      if (result._tag === "Failure") {
        const error = result.failure
        const rejected = error instanceof Capability.Failure || (error.reason === "http" &&
          (error.status ?? 0) >= 400 && (error.status ?? 0) < 500) || (error.reason === "provider" && !error.ambiguous)
        yield* observe(1, rejected ? "failed" : "unknown")
        if (rejected) return yield* error
        return undefined
      }
      // Provider-valid IDs are host facts even when a token happens to be their substring.
      const receipt = yield* observe(1, "submitted", result.success)
      return { id: result.success, receipt }
    }))
    if (!submitted) return { provider: input.provider, channelID: adapter.channelID, jobRef: ref,
      result: { status: "unknown", receipt: ref.id, summary: "Provider mutation outcome unknown; automatic retry prohibited",
        reconciliationRef: ref.id } }
    const observed = yield* ("action" in input ? adapter.observe(input) : adapter.get(submitted.id)).pipe(Effect.result)
    const message = observed._tag === "Success" ? observed.success : undefined
    const verified = observed._tag === "Success" && (
      "action" in input && input.action === "delete" ? !message
        : !!message && ("text" in input ? message.text === input.text : "emoji" in input
          ? message.reactions.some((reaction) => reaction.emoji === input.emoji && reaction.own) === (input.action === "reaction_add") : false) &&
          (!("replyTo" in input) || !input.replyTo || message.replyTo === input.replyTo) &&
          (!("threadID" in input) || !input.threadID || message.threadID === input.threadID)
    )
    const acquisition: Acquisition = { channelID: adapter.channelID,
      messages: message ? [prepared.clean(message)] : [], hasMore: false }
    const safeID = prepared.safeMetadata({ messageID: submitted.id })
    const safeAcquisition = prepared.safeMetadata(acquisition)
    const retained = yield* retain(context, input.provider, adapter.channelID, verified ? "verified" : "acknowledged",
      safeAcquisition ? acquisition : undefined,
      { ...(safeID ? { messageID: submitted.id } : {}), operation, postcondition: verified ? "verified" : "unresolved",
        readback: observed._tag === "Success" ? "acquired" : "failed", providerIDProjection: safeID ? "visible" : "omitted" },
      ref,
    ).pipe(Effect.result)
    const artifactRefs = retained._tag === "Success" ? [retained.success] : []
    const settled = yield* observe(submitted.receipt?.generation ?? 2, verified ? "completed" : "submitted", submitted.id,
      verified ? { remoteOutcome: "completed", materialization: retained._tag === "Success" ? "complete" : "failed", artifactRefs }
        : { artifactRefs })
    const common = { provider: input.provider, channelID: adapter.channelID, jobRef: ref,
      ...(safeID ? { messageID: submitted.id } : {}) }
    if (!verified || retained._tag === "Failure" || !settled || !safeID || !safeAcquisition) return { ...common, result: { status: "partial", receipt: ref.id,
        summary: "Provider acknowledged mutation; verification or evidence retention unresolved",
        completedEffects: ["provider_acknowledged"], unresolvedEffects: [
          ...(!verified ? ["postcondition_readback"] : []), ...(retained._tag === "Failure" ? ["evidence_retention"] : []),
          ...(!settled ? ["job-observation"] : []), ...(!safeID ? ["provider_id_projection"] : []),
          ...(!safeAcquisition && safeID ? ["evidence_metadata"] : []),
        ], artifactRefs } }
    return { ...common,
      acquisition, result: { status: "completed", receipt: ref.id, summary: "Provider mutation independently verified and retained",
        verification: "verified", artifactRefs } }
  })

  const toolFailure = (error: Capability.Failure | Failure | CapabilityArtifacts.Failure) => new Tool.Failure({
    message: error instanceof Failure ? `channel_${error.reason}` : error.code,
  })
  const tools = {
    channel_read: Tool.make({ description: "Read one bounded history, thread, or exact message page from a bound Slack/Discord target.",
      input: Read, output: Output, execute: (input, context) => read(input, context).pipe(Effect.mapError(toolFailure)),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }] }),
    channel_send: Tool.make({ description: "Send text to a bound Slack/Discord target, with explicit thread or Discord reply. Never automatically retry unknown delivery.",
      input: Send, output: Output, execute: (input, context) => mutate(input, context, "send").pipe(Effect.mapError(toolFailure)),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }] }),
    channel_update: Tool.make({ description: "Edit, delete, or add/remove own reaction on a verified message in a bound Slack/Discord target.",
      input: Update, output: Output, execute: (input, context) => mutate(input, context, "update").pipe(Effect.mapError(toolFailure)),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }] }),
  }
  return { tools }
})

function failure(code: Capability.ErrorCode) {
  return new Capability.Failure({ code, message: "Channel operation is unavailable" })
}
