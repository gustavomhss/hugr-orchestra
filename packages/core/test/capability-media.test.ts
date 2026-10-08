import { describe, expect } from "bun:test"
import { Buffer } from "node:buffer"
import { join } from "node:path"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { CapabilityConnections } from "@orchestra/core/capability/connection/index"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityMedia } from "@orchestra/core/capability/media/index"
import { ImageInput, VideoInput } from "@orchestra/core/capability/media/schema"
import { CapabilityArtifactTable, CapabilityJobTable } from "@orchestra/core/capability/sql"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { PermissionV2 } from "@orchestra/core/permission"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionStore } from "@orchestra/core/session/store"
import { Tool } from "@orchestra/core/tool/tool"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { IntegrationMethodID } from "@orchestra/schema/integration-id"
import { eq } from "drizzle-orm"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const host = Layer.unwrap(Effect.acquireRelease(Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]())).pipe(Effect.map((tmp) => Global.layerWith({
    data: join(tmp.path, "data"), home: tmp.path, config: join(tmp.path, "config"), state: join(tmp.path, "state"),
    cache: join(tmp.path, "cache"), tmp: join(tmp.path, "tmp"), bin: join(tmp.path, "bin"), log: join(tmp.path, "log"), repos: join(tmp.path, "repos"),
  }))))
const it = testEffect(AppNodeBuilder.build(LayerNode.group([
  Database.node, EventV2.node, SessionProjector.node, SessionStore.node, PermissionV2.node,
  AgentV2.node, Location.node, PermissionSaved.node, FSUtil.node, Global.node, Credential.node,
]), [[Location.node, Layer.succeed(Location.Service, CapabilityPolicyFixture.placement)], [Global.node, host],
  [Credential.node, Credential.layerFrom(undefined)]]))
const rules: PermissionV2.Ruleset = [{ action: "*", resource: "*", effect: "allow" }]
const secret = "media-fixture-selected-token"
const otherSecret = "media-fixture-newest-token"
// Two-frame H.264 fixture from OpenClaw 2a305612 extensions/moonshot/moonshot.live.test.ts (MIT).
const mp4 = new Uint8Array(Buffer.from([
  "AAAAJGZ0eXBpc29tAAACAGlzb21pc282aXNvMmF2YzFtcDQxAAAC5m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAA",
  "AAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "AAAAAAAAAAIAAAHodHJhawAAAFx0a2hkAAAAAwAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAA",
  "AAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAABAAAAAQAAAAAABhG1kaWEAAAAgbWRoZAAAAAAAAAAAAAAAAAAAQAAAAAAA",
  "VcQAAAAAAC1oZGxyAAAAAAAAAAB2aWRlAAAAAAAAAAAAAAAAVmlkZW9IYW5kbGVyAAAAAS9taW5mAAAAFHZtaGQAAAABAAAA",
  "AAAAAAAAAAAkZGluZgAAABxkcmVmAAAAAAAAAAEAAAAMdXJsIAAAAAEAAADvc3RibAAAAKNzdHNkAAAAAAAAAAEAAACTYXZj",
  "MQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAABAAEAASAAAAEgAAAAAAAAAARVMYXZjNjIuMjguMTAyIGxpYngyNjQAAAAAAAAA",
  "AAAAABj//wAAAC1hdmNDAULACv/hABZnQsAK2hCbARAAAAMAEAAAAwAo8SJqAQAEaM4PyAAAABBwYXNwAAAAAQAAAAEAAAAQ",
  "c3R0cwAAAAAAAAAAAAAAEHN0c2MAAAAAAAAAAAAAABRzdHN6AAAAAAAAAAAAAAAAAAAAEHN0Y28AAAAAAAAAAAAAAChtdmV4",
  "AAAAIHRyZXgAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGly",
  "YXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYyLjEyLjEwMgAAAHhtb29mAAAAEG1m",
  "aGQAAAAAAAAAAQAAAGB0cmFmAAAAJHRmaGQAAAA5AAAAAQAAAAAAAAMKAABAAAAAACMBAQAAAAAAFHRmZHQBAAAAAAAAAAAA",
  "AAAAAAAgdHJ1bgAAAgUAAAACAAAAgAIAAAAAAAAjAAAACgAAADVtZGF0AAAAH2WIhDoRigACGPHAAED2OAAIeUnJyddddddd",
  "dddddeAAAAAGQZogF6CMAAAAQ21mcmEAAAArdGZyYQEAAAAAAAABAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAMKAQEBAAAAEG1m",
  "cm8AAAAAAAAAQw==",
].join(""), "base64"))
type Captured = { path: string; method: string; authorization: string | null; body: unknown }

function fixture(provider: "openai" | "runway" = "openai", options: CapabilityMedia.Options = {}) {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture({ name: `${provider === "openai" ? "image" : "video"}_create` })
    yield* CapabilityPolicyFixture.setRules(rules)
    const binding = { ...f.binding, rootToolName: provider === "openai" ? "image_create" : "video_create", effectiveRules: rules }
    const credentials = yield* Credential.Service
    const integrationID = Integration.ID.make(provider)
    const selected = yield* credentials.create({ integrationID, value: { type: "key", key: secret } })
    yield* credentials.create({ integrationID, value: { type: "key", key: otherSecret } })
    const connections = yield* CapabilityConnections.make
    const connection = yield* connections.create({ provider, integrationID, credentialID: selected.id, subjectID: "qualified-fixture-account",
      endpoint: provider === "openai" ? "https://api.openai.com/v1" : "https://api.dev.runwayml.com", scopeHash: "a".repeat(64) })
    const target = yield* connections.createTarget(connection, { environment: "fixture", resource: { account: "fixture", purpose: "fixture-render" } })
    yield* connections.bind({ target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["*"] })
    const { PhotonImage } = yield* Effect.promise(() => import("@silvia-odwyer/photon-node"))
    const image = new PhotonImage(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]), 2, 1)
    const png = image.get_bytes()
    const jpeg = image.get_bytes_jpeg(90)
    image.free()
    const state = { requests: [] as Captured[], response: "ok", format: "png", imageBytes: png, count: 1,
      status: "RUNNING", output: "", submitID: "remote-task-1", download: mp4, downloadFail: false,
      pollWrongID: false, pollFail: false, redirect: false, delayed: false }
    const reached = yield* Deferred.make<void>()
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      async fetch(req) {
        const path = new URL(req.url).pathname
        const body = req.method === "POST" ? req.headers.get("content-type")?.startsWith("multipart/")
          ? await req.formData() : await req.json() : undefined
        state.requests.push({ path, method: req.method, authorization: req.headers.get("authorization"), body })
        if (req.method === "POST") Deferred.doneUnsafe(reached, Effect.void)
        if (state.delayed && req.method === "POST") await new Promise((resolve) => setTimeout(resolve, 500))
        if (state.redirect) return Response.redirect(`${req.url}/redirected`, 302)
        if (state.response === "unknown" && req.method === "POST") return new Response("secret-provider-detail", { status: 500 })
        if (state.response === "stream" && req.method === "POST") return new Response(new ReadableStream({ start(controller) {
          Array.from({ length: 8 }).forEach(() => controller.enqueue(new Uint8Array(64).fill(65)))
          controller.close()
        } }))
        if (path.startsWith("/v1/images/")) return Response.json({ data: Array.from({ length: state.count }, () => ({
          b64_json: Buffer.from(state.format === "jpeg" ? jpeg : state.imageBytes).toString("base64"),
          revised_prompt: `${secret}:https://signed.example.test?claim=secret`,
        })) })
        if (req.method === "POST") return Response.json({ id: state.submitID })
        if (path.startsWith("/v1/tasks/") && state.pollFail) return new Response(secret, { status: 500 })
        if (path.startsWith("/v1/tasks/")) return Response.json({ id: state.pollWrongID ? "wrong-task" : state.submitID,
          status: state.status, output: [state.output], failure: `${secret} secret-provider-feedback` })
        return new Response(state.download, { status: state.downloadFail ? 500 : 200, headers: { "Content-Type": "video/mp4" } })
      },
    })), (server) => Effect.sync(() => server.stop(true)))
    const origin = `http://127.0.0.1:${server.port}`
    state.output = `${origin}/asset.mp4?claim=host-only-signed-secret`
    const media = yield* CapabilityMedia.make({ ...options, fixtureOrigin: origin })
    const store = yield* CapabilityArtifacts.make(options.artifacts)
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) => CapabilityInvocation.withContext(binding, effect)
    const input: ImageInput = { provider: "openai", connection, target, purpose: "fixture-render", operation: "generate",
      model: "gpt-image-1", prompt: "Two distinct pixels", options: { size: "1024x1024", quality: "low", format: "png", background: "opaque", count: 1 }, inputArtifactRefs: [] }
    const video: VideoInput = { provider: "runway", connection, target, purpose: "fixture-render", operation: "generate", model: "gen4.5",
      prompt: "Short camera move", options: { ratio: "1280:720", duration: 5 }, inputArtifactRefs: [] }
    const settle = (value: unknown = provider === "openai" ? input : video) => run(Tool.settle(provider === "openai" ? media.tools.image_create : media.tools.video_create,
      { type: "tool-call", name: binding.rootToolName, id: f.context.toolCallID, input: value }, f.context))
    const result = (value: unknown = provider === "openai" ? input : video) => settle(value).pipe(Effect.map((out) => Schema.decodeUnknownSync(Capability.Result)(out.structured)))
    const proof = { owner: binding.owner, producer: binding.invocation, rootToolName: binding.rootToolName }
    return { ...f, binding, connections, connection, target, credentials, selected, media, store, state, png, jpeg, origin,
      input, video, run, settle, result, proof, reached }
  })
}

function refs(output: Capability.Result) {
  if (output.status !== "completed") throw new Error(`Expected completed media, got ${output.status}`)
  return output.artifactRefs
}
function job(output: Capability.Result) {
  if (output.status !== "submitted") throw new Error(`Expected submitted job, got ${output.status}`)
  return output.jobRef
}

describe("CapabilityMedia actual HTTP adapters", () => {
  it.live("generates decoded PNG and JPEG immutable artifacts through canonical Tool.make settlement", () => Effect.gen(function* () {
    yield* Effect.forEach(["png", "jpeg"] as const, (format) => Effect.gen(function* () {
      const f = yield* fixture()
      f.state.format = format
      const output = yield* f.result({ ...f.input, options: { ...f.input.options, format } })
      const read = yield* f.run(f.store.read(f.context, refs(output)[0]))
      if (output.status !== "completed") throw new Error("Expected completed result")
      expect(read.data).toEqual(format === "png" ? f.png : f.jpeg)
      expect(read.metadata.mime).toBe(`image/${format}`)
      expect(read.metadata.metadata).toMatchObject({ width: 2, height: 1, provider: "openai", model: "gpt-image-1" })
      expect(output.verification).toBe("observed")
      expect(f.state.requests).toHaveLength(1)
      expect(f.state.requests[0]).toMatchObject({ path: "/v1/images/generations", method: "POST", authorization: `Bearer ${secret}`,
        body: { model: "gpt-image-1", output_format: format, size: "1024x1024", n: 1 } })
      const rows = yield* f.database.db.select().from(CapabilityJobTable).pipe(Effect.orDie)
      expect(rows[0]).toMatchObject({ state: "completed", provider_id: null })
      expect(JSON.stringify({ output, rows, artifact: read.metadata })).not.toContain(secret)
      expect(JSON.stringify({ output, rows })).not.toContain("claim=")
      // Durable retry returns same receipt/ref and cannot charge again.
      expect(yield* f.result({ ...f.input, options: { ...f.input.options, format } })).toEqual(output)
      expect(f.state.requests).toHaveLength(1)
    }))
  }))

  it.live("edits multipart from authorized ArtifactRef bytes and blocks unavailable input before HTTP", () => Effect.gen(function* () {
    const f = yield* fixture()
    const source = yield* f.run(f.store.publish(f.context, { data: f.png, mime: "image/png", kind: "image", verification: "observed", metadata: {} }))
    const output = yield* f.result({ ...f.input, operation: "edit", inputArtifactRefs: [source] })
    expect(refs(output)).toHaveLength(1)
    const captured = f.state.requests[0]
    expect(captured.path).toBe("/v1/images/edits")
    expect(captured.body).toBeInstanceOf(FormData)
    if (!(captured.body instanceof FormData)) throw new Error("Expected multipart fixture capture")
    expect(captured.body.get("model")).toBe("gpt-image-1")
    const upload = captured.body.get("image[]")
    if (!(upload instanceof Blob)) throw new Error("Expected uploaded image blob")
    expect(Buffer.from(yield* Effect.promise(() => upload.arrayBuffer()))).toEqual(Buffer.from(f.png))
    expect(upload.type).toBe("image/png")
    const denied = yield* fixture()
    const error = yield* denied.settle({ ...denied.input, operation: "edit", inputArtifactRefs: [source] }).pipe(Effect.flip)
    expect(error.message).toContain("artifact_not_found")
    expect(denied.state.requests).toHaveLength(0)
  }))

  it.live("rejects undeclared model options, mismatched operations and arbitrary stored endpoint before paid I/O", () => Effect.gen(function* () {
    const f = yield* fixture()
    const bad = [
      { ...f.input, model: "chat-model-guessed" },
      { ...f.input, options: { ...f.input.options, quality: "max" } },
      { ...f.input, options: { ...f.input.options, size: "3840x2160" } },
      { ...f.input, operation: "edit", inputArtifactRefs: [] },
      { ...f.input, options: { ...f.input.options, arbitrary: "guess" } },
    ]
    yield* Effect.forEach(bad, (value) => f.settle(value).pipe(Effect.flip))
    expect(f.state.requests).toHaveLength(0)
    const foreign = yield* f.connections.create({ provider: "openai", integrationID: Integration.ID.make("openai"), credentialID: f.selected.id,
      subjectID: "fixture", endpoint: "https://evil.example.test/v1", scopeHash: "a".repeat(64) })
    const target = yield* f.connections.createTarget(foreign, { environment: "fixture", resource: {} })
    yield* f.connections.bind({ target, sessionID: f.context.sessionID, agentID: f.context.agent, actions: ["*"] })
    expect((yield* f.settle({ ...f.input, connection: foreign, target }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    expect(f.state.requests).toHaveLength(0)
  }))

  it.live("known image completion retains partial published artifacts when later publication exceeds quota", () => Effect.gen(function* () {
    const f = yield* fixture("openai", { artifacts: { quota: 200 } })
    f.state.count = 2
    const output = yield* f.result({ ...f.input, options: { ...f.input.options, count: 2 } })
    expect(output).toMatchObject({ status: "partial", unresolvedEffects: ["materialization-failed"] })
    if (output.status !== "partial") throw new Error("Expected partial publication")
    expect(output.artifactRefs).toHaveLength(1)
    const rows = yield* f.database.db.select().from(CapabilityJobTable).pipe(Effect.orDie)
    expect(rows[0]).toMatchObject({ state: "completed", observation: { data: { remoteOutcome: "completed", materialization: "failed" } } })
    expect((yield* f.result({ ...f.input, options: { ...f.input.options, count: 2 } })).receipt).toBe(output.receipt)
    expect(f.state.requests).toHaveLength(1)
  }))

  it.live("rejects corrupt compressed image and oversized dimensions before Artifact publication", () => Effect.gen(function* () {
    yield* Effect.forEach(["corrupt", "dimensions"] as const, (change) => Effect.gen(function* () {
      const f = yield* fixture()
      const bytes = new Uint8Array(f.png)
      if (change === "corrupt") bytes.fill(0, 33, bytes.length - 12)
      if (change === "dimensions") new DataView(bytes.buffer).setUint32(16, 100000)
      f.state.imageBytes = bytes
      const output = yield* f.result()
      expect(output).toMatchObject({ status: "partial", unresolvedEffects: ["materialization-failed"], artifactRefs: [] })
      expect(yield* f.database.db.select().from(CapabilityArtifactTable).pipe(Effect.orDie)).toHaveLength(0)
      expect(f.state.requests).toHaveLength(1)
    }))
  }))

  it.live("paid submission uncertainty and redirects never resubmit same durable invocation", () => Effect.gen(function* () {
    yield* Effect.forEach(["unknown", "redirect", "malformed"] as const, (mode) => Effect.gen(function* () {
      const f = yield* fixture("runway")
      if (mode === "unknown") f.state.response = "unknown"
      if (mode === "redirect") f.state.redirect = true
      if (mode === "malformed") f.state.submitID = ""
      const output = yield* f.result()
      expect(output.status).toBe("unknown")
      f.state.response = "ok"
      f.state.redirect = false
      f.state.submitID = "remote-task-1"
      expect(yield* f.result()).toEqual(output)
      expect(f.state.requests).toHaveLength(1)
      expect(JSON.stringify(output)).not.toContain(secret)
      expect(JSON.stringify(output)).not.toContain("secret-provider-detail")
    }))
  }))

  it.live("Runway submit returns early, commits known ID, observes through persisted producer after root settles", () => Effect.gen(function* () {
    const f = yield* fixture("runway")
    const output = yield* f.result()
    const ref = job(output)
    expect(f.state.requests).toHaveLength(1)
    expect(f.state.requests[0]).toMatchObject({ path: "/v1/text_to_video", authorization: `Bearer ${secret}`,
      body: { model: "gen4.5", promptText: "Short camera move", ratio: "1280:720", duration: 5 } })
    const persisted = yield* f.database.db.select().from(CapabilityJobTable).where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
    expect(persisted).toMatchObject({ state: "submitted", provider_id: "remote-task-1" })
    yield* f.events.publish(SessionEvent.Tool.Called, { sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
      callID: f.context.toolCallID, tool: "video_create", input: {}, provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp })
    yield* f.events.publish(SessionEvent.Tool.Success, { sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
      callID: f.context.toolCallID, structured: output, content: [], provider: { executed: false }, timestamp: CapabilityPolicyFixture.timestamp })
    const resumed = yield* CapabilityMedia.make({ fixtureOrigin: f.origin })
    const running = yield* resumed.observeHost({ proof: f.proof, jobRef: ref, operation: "observe" })
    expect(running.status).toBe("submitted")
    f.state.status = "SUCCEEDED"
    const known = yield* resumed.observeHost({ proof: f.proof, jobRef: ref, operation: "materialize" })
    expect(known).toMatchObject({ status: "partial", completedEffects: ["provider-completed"], unresolvedEffects: ["materialization-pending"] })
    expect(f.state.requests.filter((req) => req.method === "POST")).toHaveLength(1)
    expect(f.state.requests.filter((req) => req.path === "/asset.mp4")).toHaveLength(0)
    expect(JSON.stringify({ output, running, known })).not.toContain("remote-task-1")
    expect(JSON.stringify({ output, running, known })).not.toContain("claim=")
  }))

  it.live("live-root materialization observes known completion, MP4 publication failure stays known and retry never resubmits", () => Effect.gen(function* () {
    const f = yield* fixture("runway")
    const submitted = yield* f.result()
    const ref = job(submitted)
    f.state.status = "SUCCEEDED"
    const output = yield* f.result({ operation: "materialize", jobRef: ref })
    expect(output).toMatchObject({ status: "partial", completedEffects: ["provider-completed"], unresolvedEffects: ["materialization-failed"], artifactRefs: [] })
    const persisted = yield* f.database.db.select().from(CapabilityJobTable).where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
    expect(persisted).toMatchObject({ state: "completed", provider_id: "remote-task-1", observation: { data: { remoteOutcome: "completed", materialization: "failed" } } })
    expect(f.state.requests.filter((req) => req.path === "/asset.mp4")).toHaveLength(1)
    expect(f.state.requests.find((req) => req.path === "/asset.mp4")?.authorization).toBeNull()
    expect(JSON.stringify({ output, persisted })).not.toContain("host-only-signed-secret")
    expect(JSON.stringify({ output, persisted })).not.toContain(secret)
    yield* f.result({ operation: "materialize", jobRef: ref })
    expect(f.state.requests.filter((req) => req.method === "POST")).toHaveLength(1)
  }))

  it.live("independent host poll/download/cancel authorization and exact credential expiry prevent foreign effects", () => Effect.gen(function* () {
    const f = yield* fixture("runway")
    const submitted = yield* f.result()
    const ref = job(submitted)
    yield* CapabilityPolicyFixture.setRules([...rules, { action: "video_create.observe", resource: f.target.id, effect: "deny" }])
    const denied = yield* f.media.observeHost({ proof: f.proof, jobRef: ref, operation: "observe" }).pipe(Effect.flip)
    expect(denied.code).toBe("target_denied")
    expect(f.state.requests).toHaveLength(1)
    yield* CapabilityPolicyFixture.setRules(rules)
    const cancel = yield* f.media.observeHost({ proof: f.proof, jobRef: ref, operation: "cancel" })
    expect(cancel).toMatchObject({ status: "partial", unresolvedEffects: ["provider-cancellation-unsupported"] })
    expect(f.state.requests).toHaveLength(1)
    yield* f.credentials.update(f.selected.id, { value: { type: "oauth", methodID: IntegrationMethodID.make("fixture-oauth"),
      refresh: "host-only-refresh", access: secret, expires: Date.now() - 1 } })
    expect((yield* f.media.observeHost({ proof: f.proof, jobRef: ref, operation: "observe" }).pipe(Effect.flip)).code).toBe("authentication_required")
    expect(f.state.requests).toHaveLength(1)
    const foreign = { ...f.proof, producer: { ...f.proof.producer, callID: "invented-call" } }
    expect((yield* f.media.observeHost({ proof: foreign, jobRef: ref, operation: "observe" }).pipe(Effect.flip)).code).toBe("target_denied")
    expect(f.state.requests).toHaveLength(1)
  }))

  it.live("download failure/host rejection retain known completion; no paid retry or claim URL leak", () => Effect.gen(function* () {
    yield* Effect.forEach(["download", "host", "deny", "budget"] as const, (mode) => Effect.gen(function* () {
      const f = yield* fixture("runway", mode === "budget" ? { budgets: { downloadBytes: 64 } } : {})
      const submitted = yield* f.result()
      const ref = job(submitted)
      f.state.status = "SUCCEEDED"
      if (mode === "download") f.state.downloadFail = true
      if (mode === "host") f.state.output = "https://arbitrary.example.test/paid.mp4?claim=host-only-signed-secret"
      if (mode === "deny") yield* CapabilityPolicyFixture.setRules([...rules, { action: "video_create.download", resource: f.target.id, effect: "deny" }])
      const output = yield* f.result({ operation: "materialize", jobRef: ref })
      expect(output).toMatchObject({ status: "partial", unresolvedEffects: ["materialization-failed"] })
      expect(f.state.requests.filter((req) => req.method === "POST")).toHaveLength(1)
      expect(f.state.requests.filter((req) => req.path === "/asset.mp4")).toHaveLength(mode === "download" || mode === "budget" ? 1 : 0)
      expect(JSON.stringify(output)).not.toContain("host-only-signed-secret")
    }))
  }))

  it.live("HTTP interruption remains interruption and records unknown intent; replay never charges again", () => Effect.gen(function* () {
    const f = yield* fixture("runway")
    f.state.delayed = true
    const fiber = yield* f.result().pipe(Effect.forkChild)
    yield* Deferred.await(f.reached)
    yield* Fiber.interrupt(fiber)
    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    const rows = yield* f.database.db.select().from(CapabilityJobTable).pipe(Effect.orDie)
    expect(rows[0]?.state).toBe("unknown")
    f.state.delayed = false
    expect((yield* f.result()).status).toBe("unknown")
    expect(f.state.requests).toHaveLength(1)
  }))

  it.live("HTTP declared/streamed response byte caps and deadline fail closed without paid retry", () => Effect.gen(function* () {
    yield* Effect.forEach(["declared", "stream", "deadline"] as const, (mode) => Effect.gen(function* () {
      const f = yield* fixture("openai", { budgets: mode === "deadline" ? { timeoutMillis: 50 } : { responseBytes: 64 } })
      if (mode === "stream") f.state.response = "stream"
      if (mode === "deadline") f.state.delayed = true
      expect((yield* f.result()).status).toBe("unknown")
      f.state.response = "ok"
      f.state.delayed = false
      expect((yield* f.result()).status).toBe("unknown")
      expect(f.state.requests).toHaveLength(1)
      expect(yield* f.database.db.select().from(CapabilityArtifactTable).pipe(Effect.orDie)).toHaveLength(0)
    }))
  }))

  it.live("authorized image-to-video submit uses Artifact bytes and rejects mismatched model/input modality", () => Effect.gen(function* () {
    const f = yield* fixture("runway")
    const source = yield* f.run(f.store.publish(f.context, { data: f.png, mime: "image/png", kind: "image", verification: "observed", metadata: {} }))
    const output = yield* f.result({ ...f.video, operation: "image-to-video", model: "gen4_turbo", inputArtifactRefs: [source] })
    expect(output.status).toBe("submitted")
    expect(f.state.requests[0]).toMatchObject({ path: "/v1/image_to_video", body: { model: "gen4_turbo",
      promptImage: `data:image/png;base64,${Buffer.from(f.png).toString("base64")}` } })
    const denied = yield* fixture("runway")
    expect((yield* denied.settle({ ...denied.video, model: "gen4_turbo" }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    expect((yield* denied.settle({ ...denied.video, operation: "image-to-video", inputArtifactRefs: [source] }).pipe(Effect.flip)).message).toContain("artifact_not_found")
    expect(denied.state.requests).toHaveLength(0)
  }))

  it.live("unexpired selected OAuth works; explicit purpose deny and invocation floor stop HTTP", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.credentials.update(f.selected.id, { value: { type: "oauth", methodID: IntegrationMethodID.make("fixture-oauth"),
      refresh: "host-private-refresh", access: secret, expires: Date.now() + 60000 } })
    expect((yield* f.result()).status).toBe("completed")
    expect(f.state.requests[0].authorization).toBe(`Bearer ${secret}`)
    const denied = yield* fixture()
    const purpose = yield* denied.settle({ ...denied.input, purpose: "other-purpose" }).pipe(Effect.flip)
    expect(purpose.message).toContain("target_denied")
    const floor = { ...denied.binding, nativeDenyFloor: [{ action: "image_create", resource: denied.target.id, effect: "deny" as const }] }
    const blocked = yield* CapabilityInvocation.withContext(floor, Tool.settle(denied.media.tools.image_create,
      { type: "tool-call", name: "image_create", id: denied.context.toolCallID, input: denied.input }, denied.context)).pipe(Effect.flip)
    expect(blocked.message).toContain("target_denied")
    expect(denied.state.requests).toHaveLength(0)
  }))

  it.live("known-ID poll failure/mismatch and retargeted binding cannot downgrade or resubmit", () => Effect.gen(function* () {
    const f = yield* fixture("runway")
    const output = yield* f.result()
    const ref = job(output)
    f.state.pollFail = true
    expect((yield* f.media.observeHost({ proof: f.proof, jobRef: ref, operation: "observe" }).pipe(Effect.flip)).code).toBe("acquisition_failed")
    f.state.pollFail = false
    f.state.pollWrongID = true
    expect((yield* f.media.observeHost({ proof: f.proof, jobRef: ref, operation: "observe" }).pipe(Effect.flip)).code).toBe("outcome_unknown")
    const row = yield* f.database.db.select().from(CapabilityJobTable).where(eq(CapabilityJobTable.id, ref.id)).get().pipe(Effect.orDie)
    expect(row).toMatchObject({ state: "submitted", provider_id: "remote-task-1" })
    f.state.pollWrongID = false
    yield* f.connections.retargetTarget(f.target, { environment: "other", resource: { purpose: "fixture-render" } })
    const before = f.state.requests.length
    expect((yield* f.media.observeHost({ proof: f.proof, jobRef: ref, operation: "observe" }).pipe(Effect.flip)).code).toBe("target_denied")
    expect(f.state.requests).toHaveLength(before)
    expect(f.state.requests.filter((req) => req.method === "POST")).toHaveLength(1)
  }))

  it.live("same-invocation concurrent submits charge once and actual root floor governs later observation", () => Effect.gen(function* () {
    const f = yield* fixture("runway")
    f.state.delayed = true
    const outputs = yield* Effect.all([f.result().pipe(Effect.result), f.result().pipe(Effect.result)], { concurrency: "unbounded" })
    const submitted = outputs.find((output) => output._tag === "Success" && output.success.status === "submitted")
    if (!submitted || submitted._tag !== "Success") throw new Error("Expected one acknowledged durable submission")
    const ref = job(submitted.success)
    expect(f.state.requests).toHaveLength(1)
    const floor = { ...f.binding, nativeDenyFloor: [{ action: "video_create.observe", resource: "purpose:fixture-render", effect: "deny" as const }] }
    const blocked = yield* CapabilityInvocation.withContext(floor, Tool.settle(f.media.tools.video_create,
      { type: "tool-call", name: "video_create", id: f.context.toolCallID, input: { operation: "observe", jobRef: ref } }, f.context)).pipe(Effect.flip)
    expect(blocked.message).toContain("target_denied")
    expect(f.state.requests).toHaveLength(1)
  }))
})
