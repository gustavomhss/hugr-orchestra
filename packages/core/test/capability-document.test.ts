import { describe, expect } from "bun:test"
import { ToolCall } from "@orchestra/llm"
import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Exit, Fiber, Layer, Schema } from "effect"
import { join } from "node:path"
import { Worker } from "node:worker_threads"
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib"
import { AgentV2 } from "../src/agent"
import { CapabilityArtifacts } from "../src/capability/artifact"
import { CapabilityDocuments } from "../src/capability/document"
import { Output } from "../src/capability/document/schema"
import { DocumentWork } from "../src/capability/document/work"
import { operate } from "../src/capability/document/pdf"
import { CapabilityInvocation } from "../src/capability/invocation"
import { CapabilityArtifactTable } from "../src/capability/sql"
import { Database } from "../src/database/database"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { EventV2 } from "../src/event"
import { FSUtil } from "../src/fs-util"
import { Global } from "../src/global"
import { Location } from "../src/location"
import { PermissionV2 } from "../src/permission"
import { PermissionSaved } from "../src/permission/saved"
import { AbsolutePath } from "../src/schema"
import { SessionProjector } from "../src/session/projector"
import { SessionTable } from "../src/session/sql"
import { SessionStore } from "../src/session/store"
import { Tool } from "../src/tool/tool"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const host = Layer.unwrap(Effect.acquireRelease(Effect.promise(() => tmpdir()),
  (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]())).pipe(Effect.map((tmp) => Layer.mergeAll(
    Layer.succeed(Location.Service, location({ directory: AbsolutePath.make(tmp.path) })),
    Global.layerWith({ data: join(tmp.path, "data"), config: join(tmp.path, "config"), state: join(tmp.path, "state"),
      cache: join(tmp.path, "cache"), tmp: join(tmp.path, "tmp"), home: tmp.path, bin: join(tmp.path, "bin"),
      log: join(tmp.path, "log"), repos: join(tmp.path, "repos") }),
  ))))
const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, SessionProjector.node,
  SessionStore.node, PermissionV2.node, AgentV2.node, Location.node, PermissionSaved.node, FSUtil.node, Global.node]), [
  [Database.node, Layer.unwrap(Effect.map(Location.Service, (l) => Database.layerFromPath(join(l.directory, "native.sqlite")))).pipe(Layer.provide(host))],
  [Location.node, host], [Global.node, host],
]))
const allow: PermissionV2.Ruleset = [{ action: "artifact.*", resource: "*", effect: "allow" },
  { action: "document_*", resource: "*", effect: "allow" }]
function fixture(rootToolName = "document_edit") {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture({ name: rootToolName })
    const placement = yield* Location.Service
    yield* f.database.db.update(SessionTable).set({ directory: placement.directory }).where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding = { ...f.binding, rootToolName, effectiveRules: allow,
      owner: { ...f.binding.owner, location: { directory: placement.directory } } }
    const options = { root: join(placement.directory, "artifacts") }
    const tools = yield* CapabilityDocuments.make(options)
    const artifacts = yield* CapabilityArtifacts.make(options)
    const invoke = (tool: Tool.AnyTool, input: unknown, host = binding) => CapabilityInvocation.withContext(host,
      Tool.settle(tool, ToolCall.make({ type: "tool-call", id: f.context.toolCallID, name: rootToolName, input }), f.context)
        .pipe(Effect.flatMap((out) => Schema.decodeUnknownEffect(Output)(out.structured))))
    const read = (ref: Capability.ArtifactRef) => CapabilityInvocation.withContext(binding, artifacts.read(f.context, ref))
    return { ...f, binding, tools, artifacts, options, invoke, read }
  })
}
function ref(output: typeof Output.Type, index = 0) {
  if (!("artifactRefs" in output.result) || !output.result.artifactRefs[index]) throw new Error("Expected immutable artifact ref")
  return output.result.artifactRefs[index]
}

// Observe the actual private worker reply, before the parent's defensive decoder/budget can hide an egress regression.
function workerReply(input: unknown, data: Uint8Array) {
  return Effect.acquireUseRelease(Effect.sync(() => new Worker(new URL("../src/capability/document/worker.ts", import.meta.url),
    { workerData: { kind: "pdf", input, data: [data] } })),
  (worker) => Effect.callback<unknown, Error>((resume) => {
    worker.once("message", (reply: unknown) => resume(Effect.succeed(reply)))
    worker.once("error", (error: Error) => resume(Effect.fail(error)))
    worker.once("exit", () => resume(Effect.fail(new Error("Worker exited without a reply"))))
  }), (worker) => Effect.promise(() => worker.terminate()).pipe(Effect.asVoid))
}

describe("native local PDF canonical tools", () => {
  it.live("raw XFA read and edit reject without stripping the source; ordinary PDF is a positive control", () => Effect.gen(function* () {
    const f = yield* fixture()
    const data = yield* Effect.promise(async () => {
      const pdf = await PDFDocument.create()
      pdf.addPage([100, 100])
      pdf.getForm().createTextField("Name").setText("Original")
      const form = pdf.catalog.lookup(PDFName.of("AcroForm"), PDFDict)
      form.set(PDFName.of("XFA"), pdf.context.register(pdf.context.stream("<xdp><template>preserve me</template></xdp>")))
      return pdf.save({ updateFieldAppearances: false })
    })
    const original = yield* Effect.promise(() => PDFDocument.load(data))
    expect(original.catalog.lookup(PDFName.of("AcroForm"), PDFDict).has(PDFName.of("XFA"))).toBe(true)
    const source = yield* CapabilityInvocation.withContext(f.binding, f.artifacts.publish(f.context,
      { data, mime: "application/pdf", kind: "document", verification: "observed", metadata: {} }))
    const before = yield* f.database.db.select().from(CapabilityArtifactTable)
    yield* Effect.forEach([
      { format: "localpdf", operation: "rotate", artifact: source, expectedRevision: 0, pages: [1], degrees: 90 },
      { format: "localpdf", operation: "flatten", artifact: source, expectedRevision: 0 },
      { format: "localpdf", operation: "fill", artifact: source, expectedRevision: 0, fields: [{ name: "Name", value: "Changed" }] },
      { format: "localpdf", operation: "split", artifact: source, groups: [[1]] },
    ], (input) => f.invoke(f.tools.document_edit, input).pipe(Effect.flip,
      Effect.tap((error) => Effect.sync(() => expect(error.message).toContain("unsupported_operation")))))
    const readHost = yield* fixture("document_read")
    yield* CapabilityInvocation.withContext(f.binding, f.artifacts.share(f.context, source, readHost.context.sessionID))
    expect((yield* readHost.invoke(readHost.tools.document_read, { format: "localpdf", artifact: source }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(before)
    const retained = yield* f.read(source)
    expect(retained.data).toEqual(data)
    const reopened = yield* Effect.promise(() => PDFDocument.load(retained.data))
    expect(reopened.catalog.lookup(PDFName.of("AcroForm"), PDFDict).has(PDFName.of("XFA"))).toBe(true)
    const ordinary = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "create", pages: [{ width: 100, height: 100, text: [] }] })
    expect(ordinary.result.status).toBe("completed")
    expect((yield* f.read(ref(ordinary))).metadata.mime).toBe("application/pdf")
  }), 60000)

  it.live("split aggregate bytes fail during creation, before retention and publication", () => Effect.gen(function* () {
    const f = yield* fixture()
    const data = yield* Effect.promise(async () => {
      const pdf = await PDFDocument.create()
      const page = pdf.addPage([100, 100])
      // A valid uncompressed PDF comment makes one small page large enough to exercise the aggregate bound through reuse.
      page.node.set(PDFName.of("Contents"), pdf.context.register(pdf.context.stream(`%${"x".repeat(512 * 1024)}\n`)))
      return pdf.save()
    })
    const source = yield* CapabilityInvocation.withContext(f.binding, f.artifacts.publish(f.context,
      { data, mime: "application/pdf", kind: "document", verification: "observed", metadata: {} }))
    const input = { format: "localpdf", operation: "split", artifact: source, groups: Array.from({ length: 20 }, () => [1]) }
    // Direct operation readback distinguishes the incremental PDF bound from later worker/parent rejection.
    const split = yield* Effect.tryPromise({ try: () => operate(input, [data]), catch: (error) => error }).pipe(Effect.result)
    expect(split._tag).toBe("Failure")
    if (split._tag !== "Failure" || !(split.failure instanceof Capability.Failure)) throw new Error("Expected split budget failure")
    expect(split.failure.code).toBe("quota_exceeded")
    expect((yield* f.invoke(f.tools.document_edit, input).pipe(Effect.flip)).message).toContain("quota_exceeded")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
    expect((yield* f.read(source)).data).toEqual(data)
  }), 60000)

  it.live("worker metadata is bounded before egress, including per-file metadata and result strings", () => Effect.gen(function* () {
    const f = yield* fixture()
    const metadataPDF = yield* Effect.promise(async () => {
      const pdf = await PDFDocument.create()
      pdf.addPage([100, 100])
      Array.from({ length: 15 }, (_, i) => pdf.getForm().createTextField(`Long${i}`).setText("x".repeat(3500)))
      return pdf.save()
    })
    const metadataSource = yield* CapabilityInvocation.withContext(f.binding, f.artifacts.publish(f.context,
      { data: metadataPDF, mime: "application/pdf", kind: "document", verification: "observed", metadata: {} }))
    const reply = yield* workerReply({ format: "localpdf", artifact: metadataSource }, metadataPDF).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DocumentWork.Reply)),
    )
    expect(reply.status).toBe("error")
    if (reply.status !== "error") throw new Error("Worker sent oversized metadata before its egress check")
    expect(reply.code).toBe("quota_exceeded")
    // Per-file metadata and result strings are part of the same aggregate envelope budget.
    expect(() => DocumentWork.requireReply({ status: "ok", files: [{ data: metadataPDF, mime: "application/pdf",
      metadata: "x".repeat(DocumentWork.limits.metadata) }], metadata: {}, incomplete: [] })).toThrow()
  }), 60000)

  it.live("native permission revoked while artifact approval waits fences both publish and update", () => Effect.gen(function* () {
    yield* Effect.forEach(["publish", "update"], (mode) => Effect.gen(function* () {
      const f = yield* fixture()
      const create = { format: "localpdf", operation: "create", pages: [{ width: 100, height: 100, text: [] }] }
      const existing = mode === "update" ? ref(yield* f.invoke(f.tools.document_edit, create)) : undefined
      const before = yield* f.database.db.select().from(CapabilityArtifactTable)
      const ask: PermissionV2.Ruleset = [...allow, { action: "artifact.write", resource: "*", effect: "ask" }]
      yield* CapabilityPolicyFixture.setRules(ask)
      const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
      const input = existing ? { format: "localpdf", operation: "rotate", artifact: existing, expectedRevision: 0, pages: [1], degrees: 90 } : create
      const waiting = yield* f.invoke(f.tools.document_edit, input, { ...f.binding, effectiveRules: ask }).pipe(Effect.result, Effect.forkChild)
      const request = yield* Effect.raceFirst(Deferred.await(observation.first), Fiber.join(waiting).pipe(
        Effect.andThen(Effect.die("Native publication bypassed artifact approval")),
      ))
      expect(request.action).toBe("artifact.write")
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(before)
      yield* CapabilityPolicyFixture.setRules([...ask, { action: "document_edit", resource: "*", effect: "deny" }])
      yield* f.permissions.reply({ requestID: request.id, reply: "once" })
      const outcome = yield* Fiber.join(waiting)
      expect(outcome._tag).toBe("Failure")
      if (outcome._tag !== "Failure") throw new Error("Revoked native permission published an artifact")
      expect(outcome.failure.message).toContain("target_denied")
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(before)
    }))
  }).pipe(Effect.timeout("60 seconds")), 90000)

  it.live("late typed split publication failure returns committed refs and unresolved outputs", () => Effect.gen(function* () {
    const f = yield* fixture()
    const created = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "create",
      pages: [{ width: 100, height: 100, text: [{ text: "One", x: 10, y: 50 }] }, { width: 100, height: 100, text: [{ text: "Two", x: 10, y: 50 }] }] })
    const original = yield* f.read(ref(created))
    const input = { format: "localpdf", operation: "split", artifact: ref(created), groups: [[1], [2]] }
    const staged = yield* DocumentWork.run("pdf", input, [original.data])
    const sizes = staged.files.map((file) => file.data.byteLength + new TextEncoder().encode(JSON.stringify(file.metadata)).byteLength)
    // Creation timestamps can change compressed PDF size between worker runs. Leave slack for one output, never two.
    const quota = original.data.byteLength + new TextEncoder().encode(JSON.stringify(original.metadata.metadata)).byteLength
      + sizes[0] + Math.floor(sizes[1] / 2)
    const limited = yield* CapabilityDocuments.make({ ...f.options, quota })
    const result = yield* f.invoke(limited.document_edit, input)
    expect(result.result.status).toBe("partial")
    if (result.result.status !== "partial") throw new Error("Expected partial publication receipt")
    expect(result.result.artifactRefs).toHaveLength(1)
    expect(result.result.completedEffects[0]).toContain(ref(result).id)
    expect(result.result.unresolvedEffects).toEqual(["Publication stopped: quota_exceeded; 1 output artifacts not published"])
    const committed = yield* f.read(ref(result))
    expect((yield* Effect.promise(() => PDFDocument.load(committed.data))).getPageCount()).toBe(1)
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(2)
    expect((yield* f.read(ref(created))).data).toEqual(original.data)
  }), 60000)

  it.live("interruption after an earlier publication stays interrupted, without a fabricated partial receipt", () => Effect.gen(function* () {
    const f = yield* fixture()
    const source = ref(yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "create",
      pages: [{ width: 100, height: 100, text: [] }, { width: 100, height: 100, text: [] }] }))
    const ask: PermissionV2.Ruleset = [...allow, { action: "artifact.write", resource: "*", effect: "ask" }]
    yield* CapabilityPolicyFixture.setRules(ask)
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const waiting = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "split", artifact: source, groups: [[1], [2]] },
      { ...f.binding, effectiveRules: ask }).pipe(Effect.result, Effect.forkChild)
    const first = yield* Effect.raceFirst(Deferred.await(observation.first), Fiber.await(waiting).pipe(
      Effect.andThen(Effect.die("Split bypassed its first artifact approval")),
    ))
    expect(first.action).toBe("artifact.write")
    yield* f.permissions.reply({ requestID: first.id, reply: "once" })
    yield* Effect.raceFirst(Deferred.await(observation.repeated), Fiber.await(waiting).pipe(
      Effect.andThen(Effect.die("Split did not wait for its second artifact approval")),
    ))
    const committed = yield* f.database.db.select().from(CapabilityArtifactTable)
    expect(committed).toHaveLength(2)
    yield* Fiber.interrupt(waiting)
    expect(Exit.hasInterrupts(yield* Fiber.await(waiting))).toBe(true)
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(committed)
  }).pipe(Effect.timeout("60 seconds")), 90000)

  it.live("read canonical PDF text/geometry/fields and raster artifacts; blank page remains explicitly incomplete", () => Effect.gen(function* () {
    const f = yield* fixture("document_read")
    const data = yield* Effect.promise(async () => {
      const pdf = await PDFDocument.create()
      pdf.setTitle("Read fixture")
      pdf.addPage([300, 300]).drawText("Readable", { x: 20, y: 200 })
      pdf.addPage([200, 100])
      return pdf.save()
    })
    const source = yield* CapabilityInvocation.withContext(f.binding, f.artifacts.publish(f.context,
      { data, mime: "application/pdf", kind: "document", verification: "observed", metadata: { secret: "host-only" } }))
    const output = yield* f.invoke(f.tools.document_read, { format: "localpdf", artifact: source, raster: true })
    expect(output.metadata).toMatchObject({ pageCount: 2, title: "Read fixture", ocr: false,
      pages: [{ page: 1, text: "Readable", width: 300, height: 300, noTextLayer: false }, { page: 2, noTextLayer: true }] })
    expect(output.result.status).toBe("partial")
    expect(JSON.stringify(output.result)).toContain("OCR not performed")
    expect(JSON.stringify(output)).not.toContain("host-only")
    const raster = yield* f.read(ref(output))
    expect(raster.metadata.mime).toBe("image/png")
    expect([...raster.data.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  }), 30000)

  it.live("create, stamp, rotate, merge and split real bytes with immutable CAS readback", () => Effect.gen(function* () {
    const f = yield* fixture()
    const created = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "create", title: "Tiny",
      pages: [{ width: 300, height: 300, text: [{ text: "First page", x: 20, y: 240 }] },
        { width: 300, height: 300, text: [{ text: "Second page", x: 20, y: 240 }] }] })
    expect(created.result.status).toBe("completed")
    const original = yield* f.read(ref(created))
    const pdf = yield* Effect.promise(() => PDFDocument.load(original.data))
    expect(pdf.getPageCount()).toBe(2)
    expect(pdf.getTitle()).toBe("Tiny")
    const stamp = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "stamp", artifact: ref(created),
      expectedRevision: 0, pages: [1], text: { text: "APPROVED", x: 20, y: 100 } })
    expect(ref(stamp)).toEqual({ id: ref(created).id, revision: 1 })
    expect((yield* f.read(ref(created))).data).toEqual(original.data)
    const rotated = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "rotate", artifact: ref(stamp), expectedRevision: 1, pages: [2], degrees: 90 })
    const rotatedBytes = yield* f.read(ref(rotated))
    expect((yield* Effect.promise(() => PDFDocument.load(rotatedBytes.data))).getPage(1).getRotation().angle).toBe(90)
    const stale = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "rotate", artifact: ref(created), expectedRevision: 0, pages: [1], degrees: 90 }).pipe(Effect.flip)
    expect(stale.message).toContain("revision_conflict")
    const merged = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "merge", artifacts: [ref(created), ref(rotated)] })
    const mergedBytes = yield* f.read(ref(merged))
    expect((yield* Effect.promise(() => PDFDocument.load(mergedBytes.data))).getPageCount()).toBe(4)
    const split = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "split", artifact: ref(merged), groups: [[1, 4], [2]] })
    const splitBytes = yield* f.read(ref(split))
    expect((yield* Effect.promise(() => PDFDocument.load(splitBytes.data))).getPageCount()).toBe(2)
  }), 30000)

  it.live("fill actual fields; flatten removes field tree AND widgets while PDFium sees burned text", () => Effect.gen(function* () {
    const f = yield* fixture()
    const data = yield* Effect.promise(async () => {
      const pdf = await PDFDocument.create()
      const page = pdf.addPage([300, 300])
      pdf.getForm().createTextField("Name").addToPage(page, { x: 20, y: 200, width: 180, height: 30 })
      pdf.getForm().createCheckBox("Agree").addToPage(page, { x: 20, y: 150, width: 20, height: 20 })
      return pdf.save()
    })
    const source = yield* CapabilityInvocation.withContext(f.binding, f.artifacts.publish(f.context,
      { data, mime: "application/pdf", kind: "document", verification: "observed", metadata: {} }))
    const control = yield* Effect.promise(() => PDFDocument.load(data))
    expect(control.getForm().getFields()).toHaveLength(2)
    expect(control.getPage(0).node.lookup(PDFName.of("Annots"), PDFArray).size()).toBe(2)
    const filled = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "fill", artifact: source, expectedRevision: 0,
      fields: [{ name: "Name", value: "Ada" }, { name: "Agree", value: true }] })
    const fillBytes = yield* f.read(ref(filled))
    const fillPdf = yield* Effect.promise(() => PDFDocument.load(fillBytes.data))
    expect(fillPdf.getForm().getTextField("Name").getText()).toBe("Ada")
    expect(fillPdf.getForm().getCheckBox("Agree").isChecked()).toBe(true)
    const flattened = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "flatten", artifact: ref(filled), expectedRevision: 1 })
    const flatBytes = yield* f.read(ref(flattened))
    const flatPdf = yield* Effect.promise(() => PDFDocument.load(flatBytes.data))
    expect(flatPdf.getForm().getFields()).toHaveLength(0)
    const fields = flatPdf.catalog.lookup(PDFName.of("AcroForm"), PDFDict).lookup(PDFName.of("Fields"), PDFArray)
    expect(fields.size()).toBe(0)
    flatPdf.getPages().forEach((page) => page.node.lookup(PDFName.of("Annots"), PDFArray).asArray().forEach((entry) => {
      expect(flatPdf.context.lookup(entry, PDFDict).get(PDFName.of("Subtype"))?.toString()).not.toBe("/Widget")
    }))
    const parsed = yield* DocumentWork.run("pdf", { format: "localpdf", artifact: source, raster: true }, [flatBytes.data])
    expect(JSON.stringify(parsed.metadata)).toContain("Ada")
    expect(parsed.files[0]?.mime).toBe("image/png")
    expect((yield* f.read(source)).data).toEqual(data)
  }), 30000)

  it.live("native root, current policy, foreign ref, schema and page bounds fail before publication", () => Effect.gen(function* () {
    const f = yield* fixture()
    const create = { format: "localpdf", operation: "create", pages: [{ width: 100, height: 100, text: [] }] }
    const wrongRoot = yield* f.invoke(f.tools.document_read, { format: "localpdf", artifact: { id: Capability.ArtifactID.create(), revision: 0 } }).pipe(Effect.flip)
    expect(wrongRoot.message).toContain("invocation_binding_mismatch")
    yield* CapabilityPolicyFixture.setRules([...allow, { action: "document_edit", resource: "*", effect: "deny" }])
    const denied = yield* f.invoke(f.tools.document_edit, create).pipe(Effect.flip)
    expect(denied.message).toContain("target_denied")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(0)
    yield* CapabilityPolicyFixture.setRules(allow)
    const created = yield* f.invoke(f.tools.document_edit, create)
    const bad = yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "rotate", artifact: ref(created), expectedRevision: 0, pages: [2], degrees: 90 }).pipe(Effect.flip)
    expect(bad.message).toContain("unsupported_schema")
    expect((yield* f.invoke(f.tools.document_edit, { format: "localpdf", operation: "encrypt", artifact: ref(created) }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    expect((yield* f.invoke(f.tools.document_edit, { ...create, path: "/secret" }).pipe(Effect.flip)).message).toContain("Invalid tool input")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(1)
  }), 30000)
})
