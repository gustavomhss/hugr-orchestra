import { describe, expect } from "bun:test"
import { ToolCall } from "@orchestra/llm"
import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { join } from "node:path"
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib"
import { AgentV2 } from "../src/agent"
import { CapabilityArtifacts } from "../src/capability/artifact"
import { CapabilityDocuments } from "../src/capability/document"
import { Output } from "../src/capability/document/schema"
import { DocumentWork } from "../src/capability/document/work"
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
function fixture() {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture({ name: "document_edit" })
    const placement = yield* Location.Service
    yield* f.database.db.update(SessionTable).set({ directory: placement.directory }).where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding = { ...f.binding, rootToolName: "document_edit", effectiveRules: allow,
      owner: { ...f.binding.owner, location: { directory: placement.directory } } }
    const options = { root: join(placement.directory, "artifacts") }
    const tools = yield* CapabilityDocuments.make(options)
    const artifacts = yield* CapabilityArtifacts.make(options)
    const invoke = (tool: Tool.AnyTool, input: unknown) => CapabilityInvocation.withContext(binding,
      Tool.settle(tool, ToolCall.make({ type: "tool-call", id: f.context.toolCallID, name: "document_edit", input }), f.context)
        .pipe(Effect.flatMap((out) => Schema.decodeUnknownEffect(Output)(out.structured))))
    const read = (ref: Capability.ArtifactRef) => CapabilityInvocation.withContext(binding, artifacts.read(f.context, ref))
    return { ...f, binding, tools, artifacts, invoke, read }
  })
}
function ref(output: typeof Output.Type, index = 0) {
  if (!("artifactRefs" in output.result) || !output.result.artifactRefs[index]) throw new Error("Expected immutable artifact ref")
  return output.result.artifactRefs[index]
}

describe("native local PDF canonical tools", () => {
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
    expect(stale.message).toContain("Native artifact operation failed")
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
