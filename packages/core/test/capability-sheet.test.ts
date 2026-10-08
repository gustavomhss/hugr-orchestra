import { describe, expect } from "bun:test"
import { ToolCall } from "@orchestra/llm"
import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Effect, Fiber, Layer, Schema } from "effect"
import { join } from "node:path"
import { Workbook } from "exceljs"
import { AgentV2 } from "../src/agent"
import { CapabilityArtifacts } from "../src/capability/artifact"
import { Output } from "../src/capability/document/schema"
import { DocumentWork } from "../src/capability/document/work"
import { CapabilityInvocation } from "../src/capability/invocation"
import { CapabilitySheets } from "../src/capability/sheet"
import { mime } from "../src/capability/sheet/schema"
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
  { action: "sheet_*", resource: "*", effect: "allow" }]
function fixture(rootToolName = "sheet_edit") {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture({ name: rootToolName })
    const placement = yield* Location.Service
    yield* f.database.db.update(SessionTable).set({ directory: placement.directory }).where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding = { ...f.binding, rootToolName, effectiveRules: allow,
      owner: { ...f.binding.owner, location: { directory: placement.directory } } }
    const options = { root: join(placement.directory, "artifacts") }
    const tools = yield* CapabilitySheets.make(options)
    const artifacts = yield* CapabilityArtifacts.make(options)
    const invoke = (tool: Tool.AnyTool, input: unknown) => CapabilityInvocation.withContext(binding,
      Tool.settle(tool, ToolCall.make({ type: "tool-call", id: f.context.toolCallID, name: rootToolName, input }), f.context)
        .pipe(Effect.flatMap((out) => Schema.decodeUnknownEffect(Output)(out.structured))))
    const read = (ref: Capability.ArtifactRef) => CapabilityInvocation.withContext(binding, artifacts.read(f.context, ref))
    return { ...f, binding, tools, artifacts, invoke, read }
  })
}
function ref(output: typeof Output.Type) {
  if (!("artifactRefs" in output.result) || !output.result.artifactRefs[0]) throw new Error("Expected immutable artifact ref")
  return output.result.artifactRefs[0]
}
const tiny = { format: "xlsx", operation: "create", worksheets: [{ name: "Data", cells: [
  { address: "A1", value: { kind: "literal", value: "Label" }, style: { bold: true, fontSize: 14, color: "FF123456" } },
  { address: "A2", value: { kind: "literal", value: "00123" } },
  { address: "B1", value: { kind: "literal", value: "=1+2" } },
  { address: "B2", value: { kind: "formula", formula: "SUM(1,2)" } },
] }] }

describe("native XLSX/CSV canonical tools", () => {
  it.live("create, style, formula, name and immutable cell CAS independently reopen actual XLSX", () => Effect.gen(function* () {
    const f = yield* fixture()
    const created = yield* f.invoke(f.tools.sheet_edit, { ...tiny, names: [{ name: "Inputs", sheet: "Data", range: { startRow: 1, endRow: 2, startColumn: 1, endColumn: 1 } }] })
    expect(created.result.status).toBe("partial")
    expect(JSON.stringify(created.result)).toContain("calculation engine unavailable")
    const original = yield* f.read(ref(created))
    const workbook = new Workbook()
    yield* Effect.promise(() => workbook.xlsx.load(new Uint8Array(original.data).buffer))
    const sheet = workbook.getWorksheet("Data")
    expect(sheet?.getCell("A1").font).toMatchObject({ bold: true, size: 14, color: { argb: "FF123456" } })
    expect(sheet?.getCell("A2").value).toBe("00123")
    expect(sheet?.getCell("B1").value).toBe("=1+2")
    expect(sheet?.getCell("B1").formula).toBeUndefined()
    expect(sheet?.getCell("B2").formula).toBe("SUM(1,2)")
    expect(sheet?.getCell("B2").result).toBeUndefined()
    expect(workbook.definedNames.getRanges("Inputs").ranges).toEqual(["Data!$A$1:$A$2"])
    const edited = yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "edit", artifact: ref(created), expectedRevision: 0,
      sheet: "Data", cells: [{ address: "A2", value: { kind: "literal", value: "2026-10-08" } }] })
    const updated = new Workbook()
    const editedBytes = yield* f.read(ref(edited))
    yield* Effect.promise(() => updated.xlsx.load(new Uint8Array(editedBytes.data).buffer))
    expect(updated.getWorksheet("Data")?.getCell("A2").value).toBe("2026-10-08")
    expect((yield* f.read(ref(created))).data).toEqual(original.data)
    expect(ref(edited)).toEqual({ id: ref(created).id, revision: 1 })
    expect((yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "restructure", artifact: ref(edited), expectedRevision: 1,
      sheet: "Data", axis: "rows", action: "insert", index: 2, count: 1 }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    expect((yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "edit", artifact: ref(created), expectedRevision: 0, sheet: "Data", cells: [] }).pipe(Effect.flip)).message).toContain("revision_conflict")
  }), 30000)

  it.live("UTF-8 CSV quotes/newlines/delimiters survive import and export; formulas stay opt-in", () => Effect.gen(function* () {
    const f = yield* fixture()
    const rows = [["Name", "Code", "Text"], ["José", "00123", "=1+2"], ["Line\nBreak", "2026-10-08", 'a;"b"']]
    const csv = yield* f.invoke(f.tools.sheet_edit, { format: "csv", operation: "create", rows, delimiter: ";", header: true })
    const imported = yield* f.invoke(f.tools.sheet_edit, { format: "csv", operation: "import", artifact: ref(csv), sheet: "Import", delimiter: ";", header: true })
    expect(imported.result.status).toBe("completed")
    const bytes = yield* f.read(ref(imported))
    const workbook = new Workbook()
    yield* Effect.promise(() => workbook.xlsx.load(new Uint8Array(bytes.data).buffer))
    const sheet = workbook.getWorksheet("Import")
    expect(sheet?.getCell("B2").value).toBe("00123")
    expect(sheet?.getCell("B3").value).toBe("2026-10-08")
    expect(sheet?.getCell("C2").value).toBe("=1+2")
    expect(sheet?.getCell("C2").formula).toBeUndefined()
    const exported = yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "export", artifact: ref(imported), sheet: "Import", delimiter: ";" })
    expect((yield* f.read(ref(exported))).data).toEqual((yield* f.read(ref(csv))).data)
    const opted = yield* f.invoke(f.tools.sheet_edit, { format: "csv", operation: "import", artifact: ref(csv), sheet: "Import", delimiter: ";", formulas: true })
    expect(opted.result.status).toBe("partial")
    const optedBytes = yield* f.read(ref(opted))
    const formulaBook = new Workbook()
    yield* Effect.promise(() => formulaBook.xlsx.load(new Uint8Array(optedBytes.data).buffer))
    expect(formulaBook.getWorksheet("Import")?.getCell("C2").formula).toBe("1+2")
    expect((yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "export", artifact: ref(opted), sheet: "Import" }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    const explicit = yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "export", artifact: ref(opted), sheet: "Import", formulas: true, delimiter: ";" })
    expect((yield* f.read(ref(explicit))).data).toEqual((yield* f.read(ref(csv))).data)
  }), 60000)

  it.live("read distinguishes literal/formula/cache and enforces exact native root plus Session scope", () => Effect.gen(function* () {
    const f = yield* fixture("sheet_read")
    const source = new Workbook()
    const sheet = source.addWorksheet("Data")
    sheet.getCell("A1").value = "=1+2"
    sheet.getCell("B1").value = { formula: "1+2", result: 3 }
    const data = new Uint8Array(yield* Effect.promise(() => source.xlsx.writeBuffer()))
    const artifact = yield* CapabilityInvocation.withContext(f.binding, f.artifacts.publish(f.context,
      { data, mime, kind: "sheet", verification: "observed", metadata: { secret: "private metadata" } }))
    const output = yield* f.invoke(f.tools.sheet_read, { format: "xlsx", artifact, sheet: "Data" })
    expect(output.metadata).toMatchObject({ cells: [{ address: "A1", kind: "literal", value: "=1+2" },
      { address: "B1", kind: "formula", formula: "1+2", cached: "3", cachePresent: true, calculation: "not-performed" }] })
    expect(output.result.status).toBe("partial")
    expect(JSON.stringify(output)).not.toContain("private metadata")
    expect((yield* f.invoke(f.tools.sheet_edit, tiny).pipe(Effect.flip)).message).toContain("invocation_binding_mismatch")
    const foreign = yield* fixture("sheet_read")
    expect((yield* foreign.invoke(foreign.tools.sheet_read, { format: "xlsx", artifact }).pipe(Effect.flip)).message).toContain("artifact_not_found")
    expect((yield* f.invoke(f.tools.sheet_read, { format: "xlsx", artifact, range: { startRow: 1, endRow: 10000, startColumn: 1, endColumn: 256 } }).pipe(Effect.flip)).message).toContain("quota_exceeded")
  }), 30000)

  it.live("limited A1 restructure rewrites absolute refs; unsupported grammar and names reject without mutation", () => Effect.gen(function* () {
    const f = yield* fixture()
    const created = yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "create", worksheets: [{ name: "Data", cells: [
      { address: "A1", value: { kind: "literal", value: 1 } }, { address: "A2", value: { kind: "literal", value: 2 } },
      { address: "B2", value: { kind: "formula", formula: "SUM($A$1:A2)" } },
      { address: "B5", value: { kind: "formula", formula: "SUM(A1:A2)" } },
    ] }] })
    const shifted = yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "restructure", artifact: ref(created), expectedRevision: 0,
      sheet: "Data", axis: "rows", action: "insert", index: 2, count: 1 })
    const workbook = new Workbook()
    const bytes = yield* f.read(ref(shifted))
    yield* Effect.promise(() => workbook.xlsx.load(new Uint8Array(bytes.data).buffer))
    expect(workbook.getWorksheet("Data")?.getCell("A3").value).toBe(2)
    expect(workbook.getWorksheet("Data")?.getCell("B3").formula).toBe("SUM($A$1:A3)")
    const deleted = yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "restructure", artifact: ref(shifted), expectedRevision: 1,
      sheet: "Data", axis: "rows", action: "delete", index: 1, count: 3 })
    const deletedBytes = yield* f.read(ref(deleted))
    const deletedBook = new Workbook()
    yield* Effect.promise(() => deletedBook.xlsx.load(new Uint8Array(deletedBytes.data).buffer))
    expect(deletedBook.getWorksheet("Data")?.getCell("B3").formula).toBe("SUM(#REF!)")
    const before = yield* f.database.db.select().from(CapabilityArtifactTable)
    const unsupported = { ...tiny, worksheets: [{ name: "Data", cells: [{ address: "A1", value: { kind: "formula", formula: 'WEBSERVICE("https://secret")' } }] }] }
    expect((yield* f.invoke(f.tools.sheet_edit, unsupported).pipe(Effect.flip)).message).toContain("unsupported_schema")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(before)
    expect((yield* f.invoke(f.tools.sheet_edit, { format: "xlsx", operation: "recalculate", artifact: ref(shifted) }).pipe(Effect.flip)).message).toContain("unsupported_operation")
  }), 30000)

  it.live("worker byte bounds and interruption have no publication", () => Effect.gen(function* () {
    const tooBig = yield* DocumentWork.run("sheet", {}, [new Uint8Array(DocumentWork.limits.bytes + 1)]).pipe(Effect.flip)
    expect(tooBig.code).toBe("quota_exceeded")
    const f = yield* fixture()
    const fiber = yield* f.invoke(f.tools.sheet_edit, tiny).pipe(Effect.forkChild)
    yield* Effect.sleep("20 millis")
    yield* Fiber.interrupt(fiber)
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toHaveLength(0)
  }), 30000)

  it.live("real external relationship and out-of-scope cell XML are rejected before workbook decoding", () => Effect.gen(function* () {
    const f = yield* fixture("sheet_read")
    const publish = (data: Uint8Array) => CapabilityInvocation.withContext(f.binding, f.artifacts.publish(f.context,
      { data, mime, kind: "sheet", verification: "observed", metadata: {} }))
    const external = new Workbook()
    external.addWorksheet("Data").getCell("A1").value = { text: "External", hyperlink: "https://example.invalid/no-fetch" }
    const externalRef = yield* publish(new Uint8Array(yield* Effect.promise(() => external.xlsx.writeBuffer())))
    expect((yield* f.invoke(f.tools.sheet_read, { format: "xlsx", artifact: externalRef }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    const large = new Workbook()
    large.addWorksheet("Data").getCell("A10001").value = "Outside bound"
    const largeRef = yield* publish(new Uint8Array(yield* Effect.promise(() => large.xlsx.writeBuffer())))
    expect((yield* f.invoke(f.tools.sheet_read, { format: "xlsx", artifact: largeRef }).pipe(Effect.flip)).message).toContain("quota_exceeded")
  }), 30000)
})
