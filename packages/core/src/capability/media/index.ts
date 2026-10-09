export * as CapabilityMedia from "./index"

import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import { Capability } from "@orchestra/schema/capability"
import { Permission } from "@orchestra/schema/permission"
import { and, eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { AgentV2 } from "../../agent"
import { Credential } from "../../credential"
import { Database } from "../../database/database"
import { Location } from "../../location"
import { PermissionV2 } from "../../permission"
import { Tool } from "../../tool/tool"
import { CapabilityArtifacts } from "../artifact"
import { CapabilityConnections } from "../connection"
import { CapabilityInvocation } from "../invocation"
import { CapabilityJobs } from "../job"
import { CapabilityPolicy } from "../policy"
import { CapabilityBindingTable, CapabilityConnectionTable, CapabilityJobTable, CapabilityTargetTable } from "../sql"
import { base64, dataURL, defaults, image, json, jsonBody, multipart, request, type Budgets } from "./http"
import { failure, ImageInput, ObserveInput, TargetResource, validateImage, validateVideo, VideoInput } from "./schema"

export { ImageInput, VideoInput, TargetResource }

export type Options = {
  /** Trusted host override of transport ONLY. Stored connections still require fixed production endpoint. */
  fixtureOrigin?: string
  budgets?: Partial<Budgets>
  artifacts?: CapabilityArtifacts.Options
}
export type Observe = {
  proof: CapabilityJobs.ProducerProof
  jobRef: Capability.JobRef
  operation: "observe" | "materialize" | "cancel"
  /** Actual active invocation, with its host-issued frame in scope; never a synthesized producer Context. */
  liveRoot?: Tool.Context
}

const endpoints = { openai: "https://api.openai.com/v1", runway: "https://api.dev.runwayml.com" }
const Submitted = Schema.Struct({ id: Schema.String.check(Schema.isPattern(/^[0-9A-Za-z][0-9A-Za-z._:-]{0,255}(?![\s\S])/)) })
const Images = Schema.Struct({ data: Schema.Array(Schema.Struct({ b64_json: Schema.String })).check(Schema.isMinLength(1), Schema.isMaxLength(4)) })
const Task = Schema.Struct({ id: Schema.String, status: Schema.Literals(["PENDING", "RUNNING", "THROTTLED", "SUCCEEDED", "FAILED", "CANCELLED"]),
  output: Schema.optionalKey(Schema.Array(Schema.String).check(Schema.isMaxLength(1))) })
const StoredPolicy = Schema.Struct({ effectiveRules: Permission.Ruleset, nativeDenyFloor: Permission.Ruleset })
const observationRoots = Object.freeze(["image_create", "video_create"])

/** Captures existing Location services; registration belongs to host/lead. Construction performs no vendor I/O. */
export const make = (options: Options = {}) => Effect.gen(function* () {
  const database = yield* Database.Service
  const location = yield* Location.Service
  const credentials = yield* Credential.Service
  const permissions = yield* PermissionV2.Service
  const agents = yield* AgentV2.Service
  const connections = yield* CapabilityConnections.make
  const jobs = yield* CapabilityJobs.make
  const policy = yield* CapabilityPolicy.make
  const artifacts = yield* CapabilityArtifacts.make(options.artifacts)
  const budgets = Object.freeze({ ...defaults, ...options.budgets })
  const fixtureOrigin = options.fixtureOrigin
  if (Object.values(budgets).some((n) => !Number.isSafeInteger(n) || n <= 0) ||
    budgets.responseBytes > defaults.responseBytes || budgets.downloadBytes > defaults.downloadBytes ||
    budgets.requestBytes > defaults.requestBytes || budgets.pixels > defaults.pixels || budgets.timeoutMillis > defaults.timeoutMillis)
    return yield* failure("unsupported_schema")
  if (fixtureOrigin !== undefined && (!URL.canParse(fixtureOrigin) || new URL(fixtureOrigin).origin !== fixtureOrigin ||
    new URL(fixtureOrigin).protocol !== "http:" || new URL(fixtureOrigin).hostname !== "127.0.0.1"))
    return yield* failure("target_denied")
  const placement = { projectID: location.project.id,
    location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) }
  const apiURL = (provider: "openai" | "runway", path: string) =>
    `${fixtureOrigin ? `${fixtureOrigin}${provider === "openai" ? "/v1" : ""}` : endpoints[provider]}${path}`
  const headers = (token: string, provider: "openai" | "runway") => ({ Authorization: `Bearer ${token}`,
    ...(provider === "runway" ? { "X-Runway-Version": "2024-11-06" } : {}) })

  const select = Effect.fn("CapabilityMedia.select")(function* (
    context: Tool.Context, input: ImageInput | VideoInput, action: string,
  ) {
    yield* policy.assert(context, { action, resources: [input.provider, input.connection.id, input.target.id, `purpose:${input.purpose}`] })
    const resolved = yield* connections.resolve(context, { provider: input.provider,
      connectionID: input.connection.id, targetID: input.target.id, action }).pipe(
        Effect.mapError((error) => error instanceof Capability.Failure ? error : failure("target_denied")))
    if (resolved.connection.generation !== input.connection.generation || resolved.target.generation !== input.target.generation ||
      resolved.target.environment !== input.target.environment) return yield* failure("stale_descriptor")
    if (resolved.endpoint.replace(/\/$/, "") !== endpoints[input.provider]) return yield* failure("unsupported_operation")
    const resource = Schema.decodeUnknownOption(TargetResource)(resolved.resource)
    if (Option.isNone(resource) || resource.value.purpose !== input.purpose) return yield* failure("target_denied")
    const credential = yield* connections.loadCredential(context, resolved, action)
    yield* accessToken(credential)
    return resolved
  })

  const producer = Effect.fn("CapabilityMedia.producer")(function* (context: Tool.Context, expected?: string) {
    const binding = yield* CapabilityInvocation.require(context, placement)
    if (!observationRoots.includes(binding.rootToolName) || (expected !== undefined && binding.rootToolName !== expected))
      return yield* failure("invocation_binding_mismatch")
    return { owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName } satisfies CapabilityJobs.ProducerProof
  })
  const record = (ref: Capability.JobRef) => database.db.select().from(CapabilityJobTable)
    .where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)

  const submitToken = Effect.fn("CapabilityMedia.submitToken")(function* (
    context: Tool.Context, resolved: CapabilityConnections.Resolution, action: string, purpose: string,
  ) {
    yield* policy.assert(context, { action, resources: [resolved.connection.provider, resolved.connection.id, resolved.target.id, `purpose:${purpose}`] })
    const credential = yield* connections.loadCredential(context, resolved, action)
    return yield* accessToken(credential)
  })

  // HTTP stays interruptible. Once bytes arrive, parsing and durable ACK form one protected handoff.
  const acknowledge = <A>(proof: CapabilityJobs.ProducerProof, submitting: CapabilityJobs.Receipt,
    io: Effect.Effect<Uint8Array, Capability.Failure>, schema: Schema.Codec<A>,
    completed: (value: A) => Pick<CapabilityJobs.TransitionInput, "state" | "providerID" | "observation">,
  ) => Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
    const response = yield* restore(io).pipe(Effect.result,
      Effect.onInterrupt(() => jobs.observeHost(proof, submitting.ref,
        { expectedGeneration: submitting.generation, state: "unknown", observation: {} }).pipe(Effect.asVoid)))
    const parsed = response._tag === "Success" ? yield* json(response.success, schema).pipe(Effect.result) : response
    const receipt = yield* jobs.observeHost(proof, submitting.ref, { expectedGeneration: submitting.generation,
      ...(parsed._tag === "Success" ? completed(parsed.success) : { state: "unknown" as const, observation: {} }) })
    return { parsed, receipt }
  }))

  // Separate trusted-host authorization. Proof establishes provenance, never grants polling/download authority.
  const hostCredential = Effect.fn("CapabilityMedia.hostCredential")(function* (
    proof: CapabilityJobs.ProducerProof, ref: Capability.JobRef, action: string,
  ) {
    if (proof.rootToolName !== "video_create") return yield* failure("target_denied")
    yield* jobs.readHost(proof, ref)
    return yield* agents.withPermissions(proof.owner.agentID, () => database.db.transaction((tx) => Effect.gen(function* () {
      const row = yield* tx.select().from(CapabilityJobTable).where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
      if (!row?.connection || !row.target || row.operation !== "video_create" || row.connection.provider !== "runway")
        return yield* failure("target_denied")
      const connection = yield* tx.select().from(CapabilityConnectionTable)
        .where(eq(CapabilityConnectionTable.id, row.connection.id)).get().pipe(Effect.orDie)
      const target = yield* tx.select().from(CapabilityTargetTable).where(eq(CapabilityTargetTable.id, row.target.id)).get().pipe(Effect.orDie)
      const bound = yield* tx.select().from(CapabilityBindingTable).where(and(
        eq(CapabilityBindingTable.target_id, row.target.id), eq(CapabilityBindingTable.session_id, proof.owner.sessionID),
        eq(CapabilityBindingTable.agent_id, proof.owner.agentID),
      )).get().pipe(Effect.orDie)
      if (!connection || !target || connection.state !== "active" || connection.provider !== "runway" ||
        connection.generation !== row.connection.generation || target.generation !== row.target.generation ||
        target.environment !== row.target.environment || row.target.connectionID !== connection.id || target.connection_id !== connection.id ||
        connection.project_id !== proof.owner.projectID || connection.directory !== proof.owner.location.directory ||
        (connection.workspace_id ?? undefined) !== proof.owner.location.workspaceID ||
        connection.endpoint.replace(/\/$/, "") !== endpoints.runway || !bound ||
        ![row.operation, action].every((value) => bound.actions.includes(value) || bound.actions.includes("*")))
        return yield* failure("target_denied")
      const stored = yield* Schema.decodeUnknownEffect(StoredPolicy)(row.observation).pipe(Effect.orDie)
      const resource = Schema.decodeUnknownOption(TargetResource)(target.resource)
      if (Option.isNone(resource)) return yield* failure("target_denied")
      const resources = ["runway", connection.id, target.id, `purpose:${resource.value.purpose}`]
      if (resources.some((resource) =>
        PermissionV2.evaluate(action, resource, stored.nativeDenyFloor.filter((rule) => rule.effect === "deny")).effect === "deny" ||
        PermissionV2.evaluate(action, resource, stored.effectiveRules).effect !== "allow")) return yield* failure("target_denied")
      if ((yield* permissions.evaluate({ sessionID: proof.owner.sessionID, agent: proof.owner.agentID, action, resources })) !== "allow")
        return yield* failure("target_denied")
      if (!connection.credential_id) return yield* failure("authentication_required")
      const saved = yield* credentials.get(connection.credential_id)
      if (!saved || saved.id !== connection.credential_id || saved.integrationID !== connection.integration_id)
        return yield* failure("authentication_revoked")
      const token = yield* accessToken(saved.value)
      return { token, purpose: resource.value.purpose }
    }), { behavior: "immediate" })).pipe(Effect.catchTag("SqlError", Effect.die),
      Effect.catchTag("Session.NotFoundError", () => Effect.fail(failure("target_denied"))))
  })

  const observeHost = Effect.fn("CapabilityMedia.observeHost")(function* (supplied: Observe): Effect.fn.Return<Capability.Result,
    Capability.Failure | CapabilityArtifacts.Failure> {
    // Snapshot caller-owned proof before waits; host inputs never contain a credential or claim URL.
    const proof = structuredClone(supplied.proof)
    if (proof.rootToolName !== "video_create") return yield* failure("target_denied")
    const ref = { ...supplied.jobRef }
    const operation = supplied.operation
    const liveRoot = supplied.liveRoot ? { ...supplied.liveRoot } : undefined
    if (!["observe", "materialize", "cancel"].includes(operation)) return yield* failure("unsupported_operation")
    const read = yield* jobs.readHost(proof, ref)
    const row = yield* record(ref)
    if (!row || row.operation !== "video_create" || !read.providerID) return yield* failure("unsupported_operation")
    if (liveRoot) {
      const active = yield* producer(liveRoot)
      if (active.owner.projectID !== proof.owner.projectID || active.owner.sessionID !== proof.owner.sessionID ||
        active.owner.agentID !== proof.owner.agentID || active.owner.location.directory !== proof.owner.location.directory ||
        active.owner.location.workspaceID !== proof.owner.location.workspaceID) return yield* failure("target_denied")
      // Full policy/persisted-root checks via read, not an invented producer Tool.Context.
      yield* jobs.read(liveRoot, ref)
    }
    if (["failed", "cancelled", "lost"].includes(read.receipt.state) || read.receipt.observation.materialization === "complete")
      return project(read.receipt)
    const action = `video_create.${operation === "cancel" ? "cancel" : "observe"}`
    const authorized = yield* hostCredential(proof, ref, action)
    if (liveRoot) yield* policy.assert(liveRoot, { action, resources: ["runway", ...(row.connection ? [row.connection.id] : []),
      ...(row.target ? [row.target.id] : []), `purpose:${authorized.purpose}`] })
    const current = yield* hostCredential(proof, ref, action)
    if (current.purpose !== authorized.purpose) return yield* failure("target_denied")
    if (operation === "cancel") {
      // Pinned provider declares no cancel endpoint: no DELETE guess and no fabricated confirmation.
      const next = yield* jobs.observeHost(proof, ref, { expectedGeneration: read.receipt.generation,
        state: read.receipt.state, observation: { ...read.receipt.observation, cancellation: "unsupported" } })
      return { status: "partial", receipt: ref.id, summary: "Provider cancellation unsupported",
        completedEffects: [], unresolvedEffects: ["provider-cancellation-unsupported"], artifactRefs: next.observation.artifactRefs ?? [] }
    }
    const observed = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const response = yield* restore(request(apiURL("runway", `/v1/tasks/${read.providerID}`),
        { headers: headers(current.token, "runway") }, Math.min(budgets.responseBytes, 64 * 1024), budgets.timeoutMillis))
      const task = yield* json(response, Task)
      if (task.id !== read.providerID) return yield* failure("outcome_unknown")
      if (task.status === "FAILED" || task.status === "CANCELLED") {
        // Remote cancellation ends generation; never invent a local cancellation request or acknowledgement.
        const receipt = yield* jobs.observeHost(proof, ref, { expectedGeneration: read.receipt.generation,
          state: "failed", observation: { remoteOutcome: "failed" } })
        return { task, receipt }
      }
      if (task.status !== "SUCCEEDED") {
        if (read.receipt.state === "completed") return yield* failure("outcome_unknown")
        const receipt = yield* jobs.observeHost(proof, ref, { expectedGeneration: read.receipt.generation,
          state: task.status === "RUNNING" ? "running" : read.receipt.state, observation: read.receipt.observation })
        return { task, receipt }
      }
      const receipt = read.receipt.state === "completed" ? read.receipt : yield* jobs.observeHost(proof, ref,
        { expectedGeneration: read.receipt.generation, state: "completed", observation: { remoteOutcome: "completed", materialization: "pending" } })
      return { task, receipt }
    }))
    const task = observed.task
    const completed = observed.receipt
    if (task.status === "CANCELLED") return { status: "partial", receipt: ref.id, summary: "Remote cancellation observed",
      completedEffects: ["remote-cancellation-observed"], unresolvedEffects: [], artifactRefs: [] }
    if (task.status !== "SUCCEEDED") return project(completed)
    if (operation !== "materialize" || !liveRoot) return project(completed)
    const materialized = yield* Effect.gen(function* () {
      if (!task.output || task.output.length !== 1) return yield* failure("acquisition_failed")
      const url = yield* downloadURL(task.output[0], fixtureOrigin)
      const download = yield* hostCredential(proof, ref, "video_create.download")
      yield* policy.assert(liveRoot, { action: "video_create.download", resources: ["runway", ...(row.connection ? [row.connection.id] : []),
        ...(row.target ? [row.target.id] : []), `purpose:${download.purpose}`] })
      const current = yield* hostCredential(proof, ref, "video_create.download")
      if (current.purpose !== download.purpose) return yield* failure("target_denied")
      const data = yield* request(url, { headers: new URL(url).origin === new URL(endpoints.runway).origin
        ? headers(current.token, "runway") : {} }, budgets.downloadBytes, budgets.timeoutMillis)
      // Artifact store is authoritative. Until lead adds structural MP4 support this fails explicitly.
      return yield* artifacts.publish(liveRoot, { data, mime: "video/mp4", kind: "video", verification: "observed",
        metadata: { provider: "runway" } }, [{ action: "video_create.download", resources: ["runway", ...(row.connection ? [row.connection.id] : []),
          ...(row.target ? [row.target.id] : []), `purpose:${current.purpose}`] }])
    }).pipe(Effect.result, Effect.onInterrupt(() => jobs.observeHost(proof, ref,
      { expectedGeneration: completed.generation, state: "completed", observation: { remoteOutcome: "completed", materialization: "failed" } }).pipe(Effect.asVoid)))
    const published = yield* jobs.observeHost(proof, ref, { expectedGeneration: completed.generation, state: "completed",
      observation: { remoteOutcome: "completed", materialization: materialized._tag === "Success" ? "complete" : "failed",
        ...(materialized._tag === "Success" ? { artifactRefs: [materialized.success] } : {}) } })
    return project(published)
  })

  const createImage = Effect.fn("CapabilityMedia.createImage")(function* (supplied: ImageInput, context: Tool.Context) {
    const input = snapshotRequest(supplied)
    const proof = yield* producer(context, "image_create")
    const invalid = validateImage(input)
    if (invalid) return yield* invalid
    const resolved = yield* select(context, input, "image_create")
    const admitted = yield* jobs.admit(context, { kind: "worker", operation: "image_create", requestHash: requestHash(input, proof),
      connection: resolved.connection, target: resolved.target })
    const ref = admitted.ref
    const current = yield* jobs.read(context, ref)
    if (admitted.reused || current.state !== "intent") return project(current)
    const mime = input.options.format === "png" ? "image/png" : "image/jpeg"
    const captured = { bytes: 0 }
    const inputs = yield* Effect.forEach(input.inputArtifactRefs, (ref) => Effect.gen(function* () {
      const source = yield* artifacts.read(context, ref)
      captured.bytes += source.data.byteLength
      if (captured.bytes > budgets.downloadBytes) return yield* failure("quota_exceeded")
      yield* image(source.data, source.metadata.mime, budgets)
      return source
    }))
    const body = { model: input.model, prompt: input.prompt, n: input.options.count, size: input.options.size,
      quality: input.options.quality, output_format: input.options.format, background: input.options.background }
    const payload = input.operation === "edit" ? yield* multipart(body, inputs.map((source, index) => ({
      name: "image[]", filename: `input-${index}.${source.metadata.mime === "image/png" ? "png" : "jpeg"}`,
      mime: source.metadata.mime, data: source.data,
    })), budgets.requestBytes) : yield* jsonBody(body, budgets.requestBytes)
    const submitting = yield* jobs.transition(context, ref, { expectedGeneration: current.generation, state: "submitting", observation: {} })
    const token = yield* submitToken(context, resolved, "image_create", input.purpose)
    const handoff = yield* acknowledge(proof, submitting, request(apiURL("openai", `/images/${input.operation === "edit" ? "edits" : "generations"}`),
      { method: "POST", headers: { ...headers(token, "openai"), ...(input.operation === "edit" ? {} : { "Content-Type": "application/json" }) },
        body: payload }, budgets.responseBytes, budgets.timeoutMillis, budgets.requestBytes), Images,
      () => ({ state: "completed", observation: { remoteOutcome: "completed", materialization: "pending" } }))
    if (handoff.parsed._tag === "Failure") return project(handoff.receipt)
    const submitted = handoff.parsed.success
    const completed = handoff.receipt
    const retained: Capability.ArtifactRef[] = []
    const publication = yield* Effect.gen(function* () {
      if (submitted.data.length !== input.options.count) return yield* failure("acquisition_failed")
      yield* Effect.forEach(submitted.data, (value) => Effect.gen(function* () {
        const data = yield* base64(value.b64_json, budgets.downloadBytes)
        const dimensions = yield* image(data, mime, budgets)
        const ref = yield* artifacts.publish(context, { data, mime, kind: "image", verification: "observed",
          metadata: { provider: "openai", model: input.model, ...dimensions } }, [{ action: "image_create",
            resources: ["openai", resolved.connection.id, resolved.target.id, `purpose:${input.purpose}`] }])
        retained.push(ref)
      }))
    }).pipe(Effect.result, Effect.onInterrupt(() => jobs.observeHost(proof, ref, { expectedGeneration: completed.generation,
      state: "completed", observation: { remoteOutcome: "completed", materialization: "failed", artifactRefs: retained } }).pipe(Effect.asVoid)))
    const published = yield* jobs.observeHost(proof, ref, { expectedGeneration: completed.generation, state: "completed",
      observation: { remoteOutcome: "completed", materialization: publication._tag === "Success" ? "complete" : "failed", artifactRefs: retained } })
    return project(published)
  })

  const createVideo = Effect.fn("CapabilityMedia.createVideo")(function* (supplied: VideoInput, context: Tool.Context) {
    const input = snapshotRequest(supplied)
    const proof = yield* producer(context, "video_create")
    const invalid = validateVideo(input)
    if (invalid) return yield* invalid
    const resolved = yield* select(context, input, "video_create")
    const admitted = yield* jobs.admit(context, { kind: "provider", operation: "video_create", requestHash: requestHash(input, proof),
      connection: resolved.connection, target: resolved.target })
    const ref = admitted.ref
    const current = yield* jobs.read(context, ref)
    if (admitted.reused || current.state !== "intent") return project(current)
    const source = input.inputArtifactRefs[0] ? yield* artifacts.read(context, input.inputArtifactRefs[0]) : undefined
    if (source && input.operation === "image-to-video") yield* image(source.data, source.metadata.mime, budgets)
    if (source && input.operation === "edit" && source.metadata.mime !== "video/mp4") return yield* failure("unsupported_operation")
    if (source && source.data.byteLength > budgets.downloadBytes) return yield* failure("quota_exceeded")
    const body = { model: input.model, promptText: input.prompt, ratio: input.options.ratio,
      ...(input.operation === "edit" ? {} : { duration: input.options.duration }) }
    const field = input.operation === "edit" ? "videoUri" : "promptImage"
    const envelope = yield* jsonBody({ ...body, ...(source ? { [field]: "" } : {}) }, budgets.requestBytes)
    const payload = source ? yield* Effect.gen(function* () {
      const uri = yield* dataURL(source.data, source.metadata.mime, budgets.requestBytes - Buffer.byteLength(envelope))
      return yield* jsonBody({ ...body, [field]: uri }, budgets.requestBytes)
    }) : envelope
    const submitting = yield* jobs.transition(context, ref, { expectedGeneration: current.generation, state: "submitting", observation: {} })
    const token = yield* submitToken(context, resolved, "video_create", input.purpose)
    const path = input.operation === "generate" ? "/v1/text_to_video" : input.operation === "edit" ? "/v1/video_to_video" : "/v1/image_to_video"
    const handoff = yield* acknowledge(proof, submitting, request(apiURL("runway", path), { method: "POST", headers: { ...headers(token, "runway"),
      "Content-Type": "application/json" }, body: payload }, Math.min(budgets.responseBytes, 64 * 1024), budgets.timeoutMillis, budgets.requestBytes),
      Submitted, (value) => ({ state: "submitted", providerID: value.id, observation: {} }))
    return project(handoff.receipt)
  })

  const liveObserve = Effect.fn("CapabilityMedia.liveObserve")(function* (
    input: typeof ObserveInput.Type, context: Tool.Context,
  ) {
    yield* producer(context, "video_create")
    yield* jobs.read(context, input.jobRef)
    const row = yield* record(input.jobRef)
    if (!row) return yield* failure("stale_descriptor")
    const stored = yield* Schema.decodeUnknownEffect(Schema.Struct({ rootToolName: Schema.String }))(row.observation).pipe(Effect.orDie)
    return yield* observeHost({ proof: { owner: row.owner, producer: row.invocation, rootToolName: stored.rootToolName },
      jobRef: input.jobRef, operation: input.operation, liveRoot: context })
  })
  const tools = {
    image_create: Tool.make({ description: "Generate/edit OpenAI images using explicit bound connection and authorized Artifact inputs. Returns immutable Artifacts; uncertain paid submissions never retry.",
      input: ImageInput, output: Capability.Result, execute: (input, context) => createImage(input, context).pipe(toolErrors),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }] }),
    video_create: Tool.make({ description: "Submit Runway video generation/edit and return durable Job immediately. Observe/materialize known Job without resubmitting. Cancellation unsupported by pinned provider contract.",
      input: Schema.Union([VideoInput, ObserveInput]), output: Capability.Result,
      execute: (input, context) => ("jobRef" in input ? liveObserve(input, context) : createVideo(input, context)).pipe(toolErrors),
      toModelOutput: ({ output }) => [{ type: "text", text: JSON.stringify(output) }] }),
  }
  return { tools, observeHost }
})
export type Interface = Effect.Success<ReturnType<typeof make>>

function snapshotRequest<A extends ImageInput | VideoInput>(supplied: A) {
  const input = structuredClone(supplied)
  Object.freeze(input.connection)
  Object.freeze(input.target)
  Object.freeze(input.options)
  input.inputArtifactRefs.forEach((ref) => Object.freeze(ref))
  Object.freeze(input.inputArtifactRefs)
  return Object.freeze(input)
}

/** Fixed-position canonical payload: property insertion order cannot alter identity; Artifact revisions stay exact. */
function requestHash(input: ImageInput | VideoInput, proof: CapabilityJobs.ProducerProof) {
  return createHash("sha256").update(JSON.stringify([
    "media-request-v1", proof.rootToolName, input.provider, input.model, input.operation, input.prompt,
    input.provider === "openai" ? [input.options.size, input.options.quality, input.options.format, input.options.background, input.options.count]
      : [input.options.ratio, input.options.duration],
    input.inputArtifactRefs.map((ref) => [ref.id, ref.revision]), input.purpose,
    [input.connection.id, input.connection.provider, input.connection.generation],
    [input.target.id, input.target.connectionID, input.target.generation, input.target.environment],
    [proof.owner.projectID, proof.owner.location.directory, proof.owner.location.workspaceID ?? null, proof.owner.sessionID, proof.owner.agentID],
  ])).digest("hex")
}

function accessToken(value: Credential.Value) {
  if (value.type === "oauth" && (!Number.isSafeInteger(value.expires) || value.expires <= Date.now())) return Effect.fail(failure("authentication_required"))
  const token = value.type === "key" ? value.key : value.access
  return token.length > 0 && token.length <= 16384 && !/[\s\u0000-\u001f\u007f]/.test(token)
    ? Effect.succeed(token) : Effect.fail(failure("authentication_required"))
}

function toolErrors<A>(effect: Effect.Effect<A, Capability.Failure | CapabilityArtifacts.Failure>) {
  return effect.pipe(Effect.mapError((error) => new Tool.Failure({ message: `Media capability failed: ${error.code}` })))
}

function project(receipt: CapabilityJobs.Receipt): Capability.Result {
  const ref = receipt.ref.id
  if (receipt.state === "completed") {
    if (receipt.observation.materialization === "complete" && receipt.observation.artifactRefs?.length)
      return { status: "completed", receipt: ref, summary: "Media artifact published", verification: "observed", artifactRefs: receipt.observation.artifactRefs }
    return { status: "partial", receipt: ref, summary: "Provider completed; artifact materialization incomplete",
      completedEffects: ["provider-completed"], unresolvedEffects: [receipt.observation.materialization === "failed" ? "materialization-failed" : "materialization-pending"],
      artifactRefs: receipt.observation.artifactRefs ?? [] }
  }
  if (["submitting", "unknown", "lost", "intent"].includes(receipt.state)) return { status: "unknown", receipt: ref,
    summary: "Submission outcome uncertain; automatic resubmission disabled", reconciliationRef: ref }
  if (receipt.state === "cancelled" || receipt.state === "failed") return { status: "partial", receipt: ref,
    summary: receipt.state === "cancelled" ? "Provider cancellation observed" : "Provider failure observed",
    completedEffects: [receipt.state === "cancelled" ? "provider-cancelled" : "provider-failed"], unresolvedEffects: [], artifactRefs: [] }
  return { status: "submitted", receipt: ref, summary: "Provider task submitted; artifact not yet published", jobRef: receipt.ref }
}

function downloadURL(value: string, fixtureOrigin: string | undefined) {
  if (value !== value.trim() || !URL.canParse(value)) return Effect.fail(failure("target_denied"))
  const url = new URL(value)
  if (url.username || url.password || url.hash || value.length > 8192) return Effect.fail(failure("target_denied"))
  if (fixtureOrigin !== undefined && url.origin === fixtureOrigin) return Effect.succeed(url.href)
  // Pinned source declares only API host. CDN deployments stay unsupported until independently qualified.
  return url.protocol === "https:" && !url.port && url.hostname === "api.dev.runwayml.com"
    ? Effect.succeed(url.href) : Effect.fail(failure("unsupported_operation"))
}
