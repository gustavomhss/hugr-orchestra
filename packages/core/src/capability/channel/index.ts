export * as CapabilityChannels from "./index"

import { Capability } from "@orchestra/schema/capability"
import { Effect } from "effect"
import { Location } from "../../location"
import { Tool } from "../../tool/tool"
import { CapabilityArtifacts } from "../artifact"
import { CapabilityConnections } from "../connection"
import { CapabilityInvocation } from "../invocation"
import { CapabilityJobs } from "../job"
import { CapabilityPolicy } from "../policy"
import { CapabilityDiscord } from "../providers/discord"
import { CapabilitySlack } from "../providers/slack"
import { Failure, request, safeText, validateOptions, type Options, type RPC } from "./http"
import { Output, Read, Send, Update, type Acquisition, type Message } from "./schema"

export type MakeOptions = Options & {
  connections: CapabilityConnections.Interface
  jobs: Effect.Success<typeof CapabilityJobs.make>
  artifacts: Effect.Success<ReturnType<typeof CapabilityArtifacts.make>>
}

/** Location producer only. The lead registers these canonical leaves through producedTools. */
export const make = (options: MakeOptions) => Effect.gen(function* () {
  const location = yield* Location.Service
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
      connectionID: input.connectionID, targetID: input.targetID, action: operation }).pipe(
        Effect.catchTag("Session.NotFoundError", () => Effect.fail(failure("invocation_binding_mismatch"))),
      )
    const endpoint = input.provider === "slack" ? CapabilitySlack.endpoint : CapabilityDiscord.endpoint
    if (resolved.endpoint !== endpoint) return yield* failure("target_denied")
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
    const selectedThread = "threadID" in input ? input.threadID : undefined
    const adapter = yield* input.provider === "slack" ? CapabilitySlack.make(rpc, resolved.resource, selectedThread)
      : CapabilityDiscord.make(rpc, resolved.resource, selectedThread)
    const proof: CapabilityJobs.ProducerProof = { owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName }
    const clean = (message: Message): Message => ({ ...message, text: safeText(message.text, secret),
      reactions: message.reactions.map((reaction) => ({ ...reaction, emoji: safeText(reaction.emoji, secret) })) })
    return { adapter, resolved, proof, clean }
  })

  const retain = Effect.fn("CapabilityChannels.retain")(function* (
    context: Tool.Context, provider: "slack" | "discord", acquisition: Acquisition, verification: Capability.Verification,
  ) {
    return yield* artifacts.publish(context, { data: new TextEncoder().encode(JSON.stringify(acquisition)),
      mime: "application/json", kind: "channel-evidence", verification,
      metadata: { provider, channelID: acquisition.channelID },
    })
  })

  const read = Effect.fn("CapabilityChannels.read")(function* (input: Read, context: Tool.Context): Effect.fn.Return<Output,
    Capability.Failure | Failure | CapabilityArtifacts.Failure> {
    const prepared = yield* prepare(context, input, "read", "channel_read")
    const acquired = yield* prepared.adapter.read(input)
    const acquisition = { ...acquired, messages: acquired.messages.map(prepared.clean) }
    const ref = yield* retain(context, input.provider, acquisition, "observed")
    return { provider: input.provider, channelID: acquisition.channelID, acquisition,
      result: { status: "completed", receipt: ref.id, summary: "Bounded channel page acquired and retained",
        artifactRefs: [ref], verification: "observed" } }
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
    if ("messageID" in input && !(yield* prepared.adapter.get(input.messageID))) return yield* failure("target_denied")
    if ("replyTo" in input && input.replyTo && !(yield* prepared.adapter.get(input.replyTo))) return yield* failure("target_denied")
    const ref = yield* jobs.create(context, { kind: "provider", operation,
      connection: prepared.resolved.connection, target: prepared.resolved.target })
    const existing = yield* jobs.read(context, ref)
    if (existing.state !== "intent") return { provider: input.provider, channelID: prepared.adapter.channelID, jobRef: ref,
      result: { status: "unknown", receipt: ref.id, summary: "Existing durable operation requires reconciliation; no retry dispatched",
        reconciliationRef: ref.id } }
    yield* jobs.transition(context, ref, { expectedGeneration: existing.generation, state: "submitting", observation: {} })
    const observe = (generation: number, state: Capability.JobState, providerID?: string, observation: CapabilityJobs.Observation = {}) =>
      jobs.observeHost(prepared.proof, ref, { expectedGeneration: generation, state, providerID, observation })
    // Acceptance and ID persistence are indivisible locally; the HTTP wait itself remains interruptible.
    const submitted = yield* Effect.uninterruptibleMask((restore) => restore(
      "action" in input ? prepared.adapter.update(input) : prepared.adapter.send(input),
    ).pipe(Effect.result, Effect.flatMap((result) => Effect.gen(function* () {
      if (result._tag === "Failure") {
        const error = result.failure
        const rejected = error instanceof Capability.Failure || (error.reason === "http" &&
          (error.status ?? 0) >= 400 && (error.status ?? 0) < 500) || error.reason === "provider"
        yield* observe(1, rejected ? "failed" : "unknown")
        if (rejected) return yield* error
        return undefined
      }
      yield* observe(1, "submitted", result.success)
      return result.success
    }))))
    if (!submitted) return { provider: input.provider, channelID: prepared.adapter.channelID, jobRef: ref,
      result: { status: "unknown", receipt: ref.id, summary: "Provider mutation outcome unknown; automatic retry prohibited",
        reconciliationRef: ref.id } }
    const observed = yield* prepared.adapter.get(submitted).pipe(Effect.result)
    const message = observed._tag === "Success" ? observed.success : undefined
    const verified = observed._tag === "Success" && (
      "action" in input && input.action === "delete" ? !message
        : !!message && ("text" in input ? message.text === input.text : "emoji" in input
          ? message.reactions.some((reaction) => reaction.emoji === input.emoji && reaction.own) === (input.action === "reaction_add") : false) &&
          (!("replyTo" in input) || !input.replyTo || message.replyTo === input.replyTo) &&
          (!("threadID" in input) || !input.threadID || message.threadID === input.threadID)
    )
    const acquisition: Acquisition = { channelID: prepared.adapter.channelID,
      messages: message ? [prepared.clean(message)] : [], hasMore: false }
    const retained = yield* retain(context, input.provider, acquisition, verified ? "verified" : "acknowledged").pipe(Effect.result)
    const artifactRefs = retained._tag === "Success" ? [retained.success] : []
    if (verified) yield* observe(2, "completed", submitted, { remoteOutcome: "completed",
      materialization: retained._tag === "Success" ? "complete" : "failed", artifactRefs })
    if (!verified || retained._tag === "Failure") return { provider: input.provider, channelID: prepared.adapter.channelID,
      messageID: submitted, jobRef: ref, result: { status: "partial", receipt: ref.id,
        summary: "Provider acknowledged mutation; verification or evidence retention unresolved",
        completedEffects: ["provider_acknowledged"], unresolvedEffects: [
          ...(!verified ? ["postcondition_readback"] : []), ...(retained._tag === "Failure" ? ["evidence_retention"] : []),
        ], artifactRefs } }
    return { provider: input.provider, channelID: prepared.adapter.channelID, messageID: submitted, jobRef: ref,
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
