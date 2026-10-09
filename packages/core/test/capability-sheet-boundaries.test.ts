import { describe, expect } from "bun:test"
import { ToolCall } from "@orchestra/llm"
import { Capability } from "@orchestra/schema/capability"
import { eq } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { join } from "node:path"
import { inflateRawSync } from "node:zlib"
import { Workbook } from "exceljs"
import { AgentV2 } from "../src/agent"
import { CapabilityArtifacts } from "../src/capability/artifact"
import { Output } from "../src/capability/document/schema"
import { CapabilityInvocation } from "../src/capability/invocation"
import { CapabilitySheets } from "../src/capability/sheet"
import { mime } from "../src/capability/sheet/schema"
import { requirePackage } from "../src/capability/sheet/zip"
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
  [Database.node, Layer.unwrap(Effect.map(Location.Service, (l) => Database.layerFromPath(join(l.directory, "sheet.sqlite")))).pipe(Layer.provide(host))],
  [Location.node, host], [Global.node, host],
]))
const allow: PermissionV2.Ruleset = [{ action: "artifact.*", resource: "*", effect: "allow" }, { action: "sheet_*", resource: "*", effect: "allow" }]
function fixture(rootToolName = "sheet_edit") {
  return Effect.gen(function* () {
    const f = yield* CapabilityPolicyFixture.fixture({ name: rootToolName })
    const placement = yield* Location.Service
    yield* f.database.db.update(SessionTable).set({ directory: placement.directory }).where(eq(SessionTable.id, f.context.sessionID)).run()
    yield* CapabilityPolicyFixture.setRules(allow)
    const binding = { ...f.binding, rootToolName, effectiveRules: allow, owner: { ...f.binding.owner, location: { directory: placement.directory } } }
    const tools = yield* CapabilitySheets.make({ root: join(placement.directory, "artifacts") })
    const artifacts = yield* CapabilityArtifacts.make({ root: join(placement.directory, "artifacts") })
    const invoke = (input: unknown) => CapabilityInvocation.withContext(binding,
      Tool.settle(rootToolName === "sheet_read" ? tools.sheet_read : tools.sheet_edit,
        ToolCall.make({ type: "tool-call", id: f.context.toolCallID, name: rootToolName, input }), f.context)
        .pipe(Effect.flatMap((output) => Schema.decodeUnknownEffect(Output)(output.structured))))
    const publish = (data: Uint8Array) => CapabilityInvocation.withContext(binding, artifacts.publish(f.context,
      { data, mime, kind: "sheet", verification: "observed", metadata: {} }))
    const read = (ref: Capability.ArtifactRef) => CapabilityInvocation.withContext(binding, artifacts.read(f.context, ref))
    return { ...f, binding, artifacts, invoke, publish, read }
  })
}
function ref(output: typeof Output.Type) {
  if (!("artifactRefs" in output.result) || !output.result.artifactRefs[0]) throw new Error("Expected artifact ref")
  return output.result.artifactRefs[0]
}
async function reopen(data: Uint8Array) {
  const workbook = new Workbook()
  await workbook.xlsx.load(new Uint8Array(data).buffer)
  return workbook
}

// Tiny fixture-only ZIP writer. Parts originate from real ExcelJS; decoder readback checks generated ZIP/CRC correctness.
async function xmlFixture(sheetData: string, names = "", dateFormat = false, date1904?: "true" | "1") {
  const workbook = new Workbook()
  const sheet = workbook.addWorksheet("Data")
  sheet.getCell("A1").value = 1
  if (dateFormat) sheet.getCell("A1").numFmt = "yyyy-mm-dd"
  const data = new Uint8Array(await workbook.xlsx.writeBuffer())
  const view = new DataView(data.buffer)
  const end = data.length - 22
  const state = { offset: view.getUint32(end + 16, true) }
  const parts: { name: string; data: Uint8Array }[] = []
  Array.from({ length: view.getUint16(end + 10, true) }, () => {
    const offset = state.offset
    const length = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + length))
    const local = view.getUint32(offset + 42, true)
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const raw = data.subarray(start, start + view.getUint32(offset + 20, true))
    const content = view.getUint16(offset + 10, true) === 8 ? inflateRawSync(raw) : raw
    const xml = new TextDecoder().decode(content)
    const replacement = name === "xl/worksheets/sheet1.xml"
      ? xml.slice(0, xml.indexOf("<sheetData>")) + `<sheetData>${sheetData}</sheetData>` + xml.slice(xml.indexOf("</sheetData>") + 12)
      : name === "xl/workbook.xml" ? (names ? xml.replace("</workbook>", `<definedNames>${names}</definedNames></workbook>`) : xml)
        .replace("<workbookPr ", date1904 ? `<workbookPr date1904="${date1904}" ` : "<workbookPr ") : undefined
    parts.push({ name, data: replacement === undefined ? new Uint8Array(content) : new TextEncoder().encode(replacement) })
    state.offset += 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  })
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  const size = { offset: 0 }
  parts.forEach((part) => {
    const name = new TextEncoder().encode(part.name)
    const checksum = { value: 0xffffffff }
    part.data.forEach((byte) => {
      checksum.value ^= byte
      Array.from({ length: 8 }, () => { checksum.value = checksum.value >>> 1 ^ (checksum.value & 1 ? 0xedb88320 : 0) })
    })
    const crc = (checksum.value ^ 0xffffffff) >>> 0
    const local = new Uint8Array(30 + name.length)
    const header = new DataView(local.buffer)
    header.setUint32(0, 0x04034b50, true); header.setUint16(4, 20, true)
    header.setUint32(14, crc, true); header.setUint32(18, part.data.length, true); header.setUint32(22, part.data.length, true)
    header.setUint16(26, name.length, true); local.set(name, 30)
    const directory = new Uint8Array(46 + name.length)
    const record = new DataView(directory.buffer)
    record.setUint32(0, 0x02014b50, true); record.setUint16(4, 20, true); record.setUint16(6, 20, true)
    record.setUint32(16, crc, true); record.setUint32(20, part.data.length, true); record.setUint32(24, part.data.length, true)
    record.setUint16(28, name.length, true); record.setUint32(42, size.offset, true); directory.set(name, 46)
    chunks.push(local, part.data); central.push(directory); size.offset += local.length + part.data.length
  })
  const footer = new Uint8Array(22)
  const record = new DataView(footer.buffer)
  record.setUint32(0, 0x06054b50, true); record.setUint16(8, parts.length, true); record.setUint16(10, parts.length, true)
  record.setUint32(12, central.reduce((n, data) => n + data.length, 0), true); record.setUint32(16, size.offset, true)
  const all = [...chunks, ...central, footer]
  const output = new Uint8Array(all.reduce((n, data) => n + data.length, 0))
  const position = { offset: 0 }
  all.forEach((data) => { output.set(data, position.offset); position.offset += data.length })
  return output
}

describe("cold sheet byte/library boundaries", () => {
  it.live("protected workbook rejects restructuring before mutation, including protection on an untouched sheet", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.forEach(["Data", "Other"], (name) => Effect.gen(function* () {
      const workbook = new Workbook()
      workbook.addWorksheet("Data").getCell("A1").value = 7
      workbook.addWorksheet("Other").getCell("A1").value = 8
      const protectedSheet = workbook.getWorksheet(name)
      if (!protectedSheet) throw new Error("Missing protected fixture sheet")
      yield* Effect.promise(() => protectedSheet.protect("fixture", { spinCount: 1 }))
      const data = new Uint8Array(yield* Effect.promise(() => workbook.xlsx.writeBuffer()))
      const raw = yield* Effect.promise(() => requirePackage(data, false))
      expect(raw.sheets.get(name)?.structure.has("sheetProtection")).toBe(true)
      const artifact = yield* f.publish(data)
      const before = yield* f.database.db.select().from(CapabilityArtifactTable)
      expect((yield* f.invoke({ format: "xlsx", operation: "restructure", artifact, expectedRevision: 0,
        sheet: "Data", axis: "rows", action: "insert", index: 1, count: 1 }).pipe(Effect.flip)).message).toContain("unsupported_operation")
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(before)
      expect((yield* f.read(artifact)).data).toEqual(data)
    }))
  }), 30000)

  it.live("implicit trailing default columns do not break insert-after-A1 or deletion of all rows", () => Effect.gen(function* () {
    const f = yield* fixture()
    const source = new Workbook()
    source.addWorksheet("Data").getCell("A1").value = 7
    const data = new Uint8Array(yield* Effect.promise(() => source.xlsx.writeBuffer()))
    const artifact = yield* f.publish(data)
    const inserted = yield* f.invoke({ format: "xlsx", operation: "restructure", artifact, expectedRevision: 0,
      sheet: "Data", axis: "columns", action: "insert", index: 2, count: 1 })
    expect(inserted.result.status).toBe("completed")
    const insertedBytes = yield* f.read(ref(inserted))
    const actual = yield* Effect.promise(() => reopen(insertedBytes.data))
    expect(actual.getWorksheet("Data")?.columnCount).toBe(1)
    expect(actual.getWorksheet("Data")?.getCell("A1").value).toBe(7)
    const deleted = yield* f.invoke({ format: "xlsx", operation: "restructure", artifact: ref(inserted), expectedRevision: 1,
      sheet: "Data", axis: "rows", action: "delete", index: 1, count: 1 })
    expect(deleted.result.status).toBe("completed")
    const deletedBytes = yield* f.read(ref(deleted))
    const empty = yield* Effect.promise(() => reopen(deletedBytes.data))
    expect(empty.getWorksheet("Data")?.rowCount).toBe(0)
    expect(empty.getWorksheet("Data")?.columnCount).toBe(0)
    expect((yield* Effect.promise(() => requirePackage(deletedBytes.data, false))).sheets.get("Data")?.cells.size).toBe(0)
    expect((yield* f.read(artifact)).data).toEqual(data)
  }), 30000)

  it.live("date-formatted formula caches restore exact raw types; 1904 true and 1 share numeric date semantics", () => Effect.gen(function* () {
    const f = yield* fixture("sheet_read")
    const xml = '<row r="1"><c r="A1" s="1" t="b"><f>1+2</f><v>0</v></c></row>'
      + '<row r="2"><c r="A2" s="1" t="e"><f>1+2</f><v>#DIV/0!</v></c></row>'
      + '<row r="3"><c r="A3" s="1" t="str"><f>1+2</f><v>cached text</v></c></row>'
      + '<row r="4"><c r="A4" s="1" t="str"><f>1+2</f><v/></c></row>'
      + '<row r="5"><c r="A5" s="1"><f>1+2</f><v>45292</v></c></row>'
      + '<row r="6"><c r="A6" s="1"><v>45292</v></c></row>'
    yield* Effect.forEach(["true", "1"] as const, (flag) => Effect.gen(function* () {
      const data = yield* Effect.promise(() => xmlFixture(xml, "", true, flag))
      const lib = yield* Effect.promise(() => reopen(data))
      expect(lib.getWorksheet("Data")?.getCell("A1").result).toBeInstanceOf(Date)
      expect(lib.getWorksheet("Data")?.getCell("A2").result).toBeInstanceOf(Date)
      expect(lib.getWorksheet("Data")?.getCell("A3").result).toBeInstanceOf(Date)
      expect(lib.properties.date1904).toBe(flag === "1")
      const artifact = yield* f.publish(data)
      const read = yield* f.invoke({ format: "xlsx", artifact })
      expect(read.result.status).toBe("partial")
      expect(read.metadata).toMatchObject({ dateSystem: "1904", cells: [
        { cached: "false", cachePresent: true, cacheType: "b" },
        { cached: "#DIV/0!", cachePresent: true, cacheType: "e" },
        { cached: "cached text", cachePresent: true, cacheType: "str" },
        { cached: "", cachePresent: true, cacheType: "str" },
        { cached: "45292", cachePresent: true, cacheType: "n" },
        { value: "45292", valueType: "number", datePresentation: "2028-01-02T00:00:00.000Z" },
      ] })
      const edit = yield* fixture()
      yield* CapabilityInvocation.withContext(f.binding, f.artifacts.share(f.context, artifact, edit.context.sessionID))
      const exported = yield* edit.invoke({ format: "xlsx", operation: "export", artifact, sheet: "Data",
        range: { startRow: 1, endRow: 5, startColumn: 1, endColumn: 1 } })
      expect(new TextDecoder().decode((yield* edit.read(ref(exported))).data)).toBe("false\r\n#DIV/0!\r\ncached text\r\n\r\n45292\r\n")
      const updated = yield* edit.invoke({ format: "xlsx", operation: "edit", artifact, expectedRevision: 0, sheet: "Data", cells: [] })
      const updatedBytes = yield* edit.read(ref(updated))
      const raw = yield* Effect.promise(() => requirePackage(updatedBytes.data, false))
      expect(raw.date1904).toBe(true)
      expect(raw.sheets.get("Data")?.cells.get("A6")?.value).toBe("45292")
      expect(raw.sheets.get("Data")?.cells.get("A1")?.valuePresent).toBe(false)
      expect((yield* f.read(artifact)).data).toEqual(data)
    }))
  }), 60000)

  it.live("terminal deletion uses original row mapping and preserves surviving height, style and source bytes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const original = new Workbook()
    const sheet = original.addWorksheet("Data")
    Array.from([10, 20, 30]).forEach((value, i) => { sheet.getCell(`A${i + 1}`).value = value; sheet.getRow(i + 1).height = 21 + i })
    sheet.getCell("A1").font = { name: "Arial", bold: true }
    const data = new Uint8Array(yield* Effect.promise(() => original.xlsx.writeBuffer()))
    const artifact = yield* f.publish(data)
    const result = yield* f.invoke({ format: "xlsx", operation: "restructure", artifact, expectedRevision: 0, sheet: "Data", axis: "rows", action: "delete", index: 2, count: 2 })
    const saved = yield* f.read(ref(result))
    const actual = yield* Effect.promise(() => reopen(saved.data))
    expect(actual.getWorksheet("Data")?.rowCount).toBe(1)
    expect(actual.getWorksheet("Data")?.getCell("A1").value).toBe(10)
    expect(actual.getWorksheet("Data")?.getRow(1).height).toBe(21)
    expect(actual.getWorksheet("Data")?.getCell("A1").font.bold).toBe(true)
    expect(actual.getWorksheet("Data")?.getCell("A2").value).toBeNull()
    expect(actual.getWorksheet("Data")?.getCell("A3").value).toBeNull()
    expect((yield* f.read(artifact)).data).toEqual(data)
    const inserted = yield* f.invoke({ format: "xlsx", operation: "restructure", artifact: ref(result), expectedRevision: 1,
      sheet: "Data", axis: "columns", action: "insert", index: 1, count: 1 })
    const insertedBytes = yield* f.read(ref(inserted))
    const columns = yield* Effect.promise(() => reopen(insertedBytes.data))
    expect(columns.getWorksheet("Data")?.getCell("B1").value).toBe(10)
    expect(columns.getWorksheet("Data")?.getCell("A1").value).toBeNull()
    expect(columns.getWorksheet("Data")?.getRow(1).height).toBe(21)
  }), 30000)

  it.live("array formula XML is rejected before mutation; shared closed formulas expand without changing references", () => Effect.gen(function* () {
    const f = yield* fixture()
    const array = yield* Effect.promise(() => xmlFixture('<row r="1"><c r="A1"><f t="array" ref="A1:A2">1+2</f><v>3</v></c></row><row r="2"><c r="A2"><v>3</v></c></row>'))
    const decoded = yield* Effect.promise(() => reopen(array))
    expect(decoded.getWorksheet("Data")?.getCell("A1").value).toMatchObject({ shareType: "array", ref: "A1:A2" })
    const artifact = yield* f.publish(array)
    const before = yield* f.database.db.select().from(CapabilityArtifactTable)
    expect((yield* f.invoke({ format: "xlsx", operation: "edit", artifact, expectedRevision: 0, sheet: "Data", cells: [] }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(before)
    const observer = yield* fixture("sheet_read")
    yield* CapabilityInvocation.withContext(f.binding, f.artifacts.share(f.context, artifact, observer.context.sessionID))
    const observed = yield* observer.invoke({ format: "xlsx", artifact })
    expect(observed.result.status).toBe("partial")
    expect(observed.metadata).toMatchObject({ cells: [{ formulaType: "array", formulaRange: "A1:A2" }, { value: "3" }] })
    const shared = yield* Effect.promise(() => xmlFixture('<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f t="shared" si="0" ref="B1:B2">A1+$A$1</f><v>2</v></c></row><row r="2"><c r="A2"><v>2</v></c><c r="B2"><f t="shared" si="0"/><v>3</v></c></row>'))
    const sharedRef = yield* f.publish(shared)
    const edited = yield* f.invoke({ format: "xlsx", operation: "edit", artifact: sharedRef, expectedRevision: 0, sheet: "Data", cells: [{ address: "A1", value: { kind: "literal", value: 10 } }] })
    const saved = yield* f.read(ref(edited))
    const actual = yield* Effect.promise(() => reopen(saved.data))
    expect(actual.getWorksheet("Data")?.getCell("B1").formula).toBe("A1+$A$1")
    expect(actual.getWorksheet("Data")?.getCell("B2").formula).toBe("A2+$A$1")
    expect(actual.getWorksheet("Data")?.getCell("B2").result).toBeUndefined()
    expect((yield* Effect.promise(() => requirePackage(saved.data, false))).sheets.get("Data")?.cells.get("B1")?.formula?.type).toBe("normal")
    const unqualified = yield* Effect.promise(() => xmlFixture('<row r="1"><c r="A1"><v>1</v></c><c r="B1"><f t="shared" si="0" ref="B1:B2">INDIRECT(A1)</f></c></row><row r="2"><c r="B2"><f t="shared" si="0"/></c></row>'))
    expect((yield* f.invoke({ format: "xlsx", operation: "edit", artifact: yield* f.publish(unqualified), expectedRevision: 0, sheet: "Data", cells: [] }).pipe(Effect.flip)).message).toContain("unsupported_schema")
  }), 30000)

  it.live("blank string cache differs from missing v, zero and false; value export uses raw evidence", () => Effect.gen(function* () {
    const f = yield* fixture("sheet_read")
    const data = yield* Effect.promise(() => xmlFixture('<row r="1"><c r="A1" t="str"><f>1+2</f><v/></c></row><row r="2"><c r="A2" t="str"><f>1+2</f></c></row><row r="3"><c r="A3"><f>1+2</f><v>0</v></c></row><row r="4"><c r="A4" t="b"><f>1+2</f><v>0</v></c></row>'))
    const decoded = yield* Effect.promise(() => reopen(data))
    expect(decoded.getWorksheet("Data")?.getCell("A1").result).toBeUndefined()
    expect(decoded.getWorksheet("Data")?.getCell("A2").result).toBeUndefined()
    const artifact = yield* f.publish(data)
    expect((yield* f.invoke({ format: "xlsx", artifact })).metadata).toMatchObject({ cells: [
      { cached: "", cachePresent: true, cacheType: "str" }, { cached: "", cachePresent: false },
      { cached: "0", cachePresent: true }, { cached: "false", cachePresent: true },
    ] })
    const edit = yield* fixture()
    yield* CapabilityInvocation.withContext(f.binding, f.artifacts.share(f.context, artifact, edit.context.sessionID))
    const exported = yield* edit.invoke({ format: "xlsx", operation: "export", artifact, sheet: "Data", range: { startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 } })
    expect(new TextDecoder().decode((yield* edit.read(ref(exported))).data)).toBe("\r\n")
    expect((yield* edit.invoke({ format: "xlsx", operation: "export", artifact, sheet: "Data", range: { startRow: 2, endRow: 2, startColumn: 1, endColumn: 1 } }).pipe(Effect.flip)).message).toContain("unsupported_operation")
  }), 30000)

  it.live("local name scope remains raw and unsupported; new global names reject casing collisions and reserved references", () => Effect.gen(function* () {
    const f = yield* fixture("sheet_read")
    const data = yield* Effect.promise(() => xmlFixture('<row r="1"><c r="A1"><v>1</v></c></row>', '<definedName name="Local" localSheetId="0">Data!$A$1</definedName>'))
    const artifact = yield* f.publish(data)
    const read = yield* f.invoke({ format: "xlsx", artifact })
    expect(read.result.status).toBe("partial")
    expect(read.metadata).toMatchObject({ names: [{ name: "Local", value: "Data!$A$1", localSheetId: 0, scope: "worksheet" }] })
    const edit = yield* fixture()
    yield* CapabilityInvocation.withContext(f.binding, f.artifacts.share(f.context, artifact, edit.context.sessionID))
    expect((yield* edit.invoke({ format: "xlsx", operation: "edit", artifact, expectedRevision: 0, sheet: "Data", cells: [] }).pipe(Effect.flip)).message).toContain("unsupported_operation")
    const range = { startRow: 1, endRow: 1, startColumn: 1, endColumn: 1 }
    yield* Effect.forEach(["R", "C", "a1", "A1", "r1c1"], (name) => edit.invoke({ format: "xlsx", operation: "create", worksheets: [{ name: "Data", cells: [] }], names: [{ name, sheet: "Data", range }] }).pipe(Effect.flip,
      Effect.tap((error) => Effect.sync(() => expect(error.message).toContain("unsupported_schema")))))
    expect((yield* edit.invoke({ format: "xlsx", operation: "create", worksheets: [{ name: "Data", cells: [] }], names: [{ name: "Foo", sheet: "Data", range }, { name: "foo", sheet: "Data", range }] }).pipe(Effect.flip)).message).toContain("unsupported_schema")
    const global = yield* Effect.promise(() => xmlFixture('<row r="1"><c r="A1"><v>1</v></c></row>', '<definedName name="Foo">Data!$A$1</definedName>'))
    const globalRef = yield* edit.publish(global)
    expect((yield* edit.invoke({ format: "xlsx", operation: "edit", artifact: globalRef, expectedRevision: 0, sheet: "Data", cells: [{ address: "A1", value: { kind: "literal", value: 2 } }], names: [{ name: "FOO", sheet: "Data", range }] }).pipe(Effect.flip)).message).toContain("unsupported_schema")
    expect((yield* edit.read(globalRef)).data).toEqual(global)
  }), 60000)

  it.live("print ranges, titles, hidden/outlined rows and custom page setup reject before structural mutation", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.forEach(["area", "titles", "hidden", "outline", "setup"], (feature) => Effect.gen(function* () {
      const source = new Workbook()
      const sheet = source.addWorksheet("Data")
      sheet.addRows([[1], [2], [3]])
      if (feature === "area") sheet.pageSetup.printArea = "A1:A3"
      if (feature === "titles") sheet.pageSetup.printTitlesRow = "1:2"
      if (feature === "hidden") sheet.getRow(2).hidden = true
      if (feature === "outline") sheet.getRow(2).outlineLevel = 1
      if (feature === "setup") sheet.pageSetup.orientation = "landscape"
      const data = new Uint8Array(yield* Effect.promise(() => source.xlsx.writeBuffer()))
      const artifact = yield* f.publish(data)
      const before = yield* f.database.db.select().from(CapabilityArtifactTable)
      expect((yield* f.invoke({ format: "xlsx", operation: "restructure", artifact, expectedRevision: 0, sheet: "Data", axis: "rows", action: "delete", index: 2, count: 2 }).pipe(Effect.flip)).message).toContain("unsupported_operation")
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(before)
      expect((yield* f.read(artifact)).data).toEqual(data)
    }))
  }), 60000)

  it.live("numeric date-format readback compares stored serial/date system/format, not ExcelJS's converted Date class", () => Effect.gen(function* () {
    const f = yield* fixture()
    const created = yield* f.invoke({ format: "xlsx", operation: "create", worksheets: [{ name: "Data", cells: [{ address: "A1", value: { kind: "literal", value: 45292 }, style: { numberFormat: "yyyy-mm-dd" } }] }] })
    const bytes = yield* f.read(ref(created))
    expect((yield* Effect.promise(() => reopen(bytes.data))).getWorksheet("Data")?.getCell("A1").value).toBeInstanceOf(Date)
    yield* Effect.forEach([false, true], (date1904) => Effect.gen(function* () {
      const source = new Workbook()
      source.properties.date1904 = date1904
      const sheet = source.addWorksheet("Data")
      sheet.getCell("A1").value = 45292
      sheet.getCell("A1").numFmt = "yyyy-mm-dd"
      const data = new Uint8Array(yield* Effect.promise(() => source.xlsx.writeBuffer()))
      const artifact = yield* f.publish(data)
      const edited = yield* f.invoke({ format: "xlsx", operation: "edit", artifact, expectedRevision: 0, sheet: "Data", cells: [] })
      const saved = yield* f.read(ref(edited))
      const raw = yield* Effect.promise(() => requirePackage(saved.data, false))
      expect(raw.date1904).toBe(date1904)
      expect(raw.sheets.get("Data")?.cells.get("A1")?.value).toBe("45292")
      const read = yield* fixture("sheet_read")
      yield* CapabilityInvocation.withContext(f.binding, f.artifacts.share(f.context, ref(edited), read.context.sessionID))
      expect((yield* read.invoke({ format: "xlsx", artifact: ref(edited) })).metadata).toMatchObject({ dateSystem: date1904 ? "1904" : "1900",
        cells: [{ value: "45292", valueType: "number", numberFormat: "yyyy-mm-dd", datePresentation: expect.any(String) }] })
    }))
  }), 60000)

  it.live("nonfinite literal/cache and invalid loaded Date fail typed before projection or mutation", () => Effect.gen(function* () {
    const f = yield* fixture("sheet_read")
    yield* Effect.forEach([
      { xml: '<row r="1"><c r="A1"><v>NaN</v></c></row>', date: false },
      { xml: '<row r="1"><c r="A1"><f>1+2</f><v>Infinity</v></c></row>', date: false },
      { xml: '<row r="1"><c r="A1"><f>1+2</f><v>1e999</v></c></row>', date: false },
      { xml: '<row r="1"><c r="A1" s="1"><v>1e300</v></c></row>', date: true },
    ], (entry) => Effect.gen(function* () {
      const data = yield* Effect.promise(() => xmlFixture(entry.xml, "", entry.date))
      const artifact = yield* f.publish(data)
      expect((yield* f.invoke({ format: "xlsx", artifact }).pipe(Effect.flip)).message).toContain("unsupported_schema")
      const edit = yield* fixture()
      yield* CapabilityInvocation.withContext(f.binding, f.artifacts.share(f.context, artifact, edit.context.sessionID))
      const before = yield* f.database.db.select().from(CapabilityArtifactTable)
      expect((yield* edit.invoke({ format: "xlsx", operation: "edit", artifact, expectedRevision: 0, sheet: "Data", cells: [] }).pipe(Effect.flip)).message).toContain("unsupported_schema")
      expect(yield* f.database.db.select().from(CapabilityArtifactTable)).toEqual(before)
    }))
    const literal = yield* Effect.promise(() => xmlFixture('<row r="1"><c r="A1" t="str"><v>NaN</v></c></row>'))
    expect((yield* f.invoke({ format: "xlsx", artifact: yield* f.publish(literal) })).metadata).toMatchObject({ cells: [{ value: "NaN", valueType: "string" }] })
  }), 60000)
})
