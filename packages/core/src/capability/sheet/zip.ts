import { inflateRawSync } from "node:zlib"
import { DocumentWork } from "../document/work"
import { coordinate } from "./formula"

/** Decode ZIP entries under aggregate inflation limits before ExcelJS can allocate the workbook model. */
export async function requirePackage(data: Uint8Array, editable: boolean) {
  const { Parser } = await import("htmlparser2")
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let end = data.length - 22
  while (end >= Math.max(0, data.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0 || end < data.length - 65557 || end + 22 + view.getUint16(end + 20, true) !== data.length)
    throw DocumentWork.failure("unsupported_schema")
  const count = view.getUint16(end + 10, true)
  if (count > 1024) throw DocumentWork.failure("quota_exceeded")
  const budget = { offset: view.getUint32(end + 16, true), inflated: 0, cells: 0, sheets: 0, names: 0, namedCells: 0 }
  const seen = new Set<string>()
  for (let i = 0; i < count; i++) {
    const offset = budget.offset
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw DocumentWork.failure("unsupported_schema")
    const size = view.getUint32(offset + 24, true)
    const compressed = view.getUint32(offset + 20, true)
    const length = view.getUint16(offset + 28, true)
    const next = offset + 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    if (next > end || local + 30 > offset || view.getUint32(local, true) !== 0x04034b50) throw DocumentWork.failure("unsupported_schema")
    const name = new TextDecoder("utf-8", { fatal: true }).decode(data.subarray(offset + 46, offset + 46 + length))
    if (seen.has(name) || name.includes("..") || name.startsWith("/") || (view.getUint16(offset + 8, true) & 1))
      throw DocumentWork.failure("unsupported_schema")
    seen.add(name)
    if (/(?:vba|macros?|externalLinks|connections|queryTables|embeddings|activeX)/i.test(name)) throw DocumentWork.failure()
    if (editable && /(?:drawings|charts|pivot|slicer|tables|printerSettings|customXml)/i.test(name)) throw DocumentWork.failure()
    budget.inflated += size
    if (budget.inflated > DocumentWork.limits.inflated) throw DocumentWork.failure("quota_exceeded")
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    if (start + compressed > offset) throw DocumentWork.failure("unsupported_schema")
    const method = view.getUint16(offset + 10, true)
    const content = method === 0 ? data.subarray(start, start + compressed) : method === 8
      ? inflateRawSync(data.subarray(start, start + compressed), { maxOutputLength: Math.max(1, size) }) : undefined
    if (!content || content.length !== size) throw DocumentWork.failure("unsupported_schema")
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(content)
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw DocumentWork.failure()
      const worksheet = name.startsWith("xl/worksheets/") && name.endsWith(".xml")
      if (worksheet && ++budget.sheets > DocumentWork.limits.sheets) throw DocumentWork.failure("quota_exceeded")
      const named = { active: false, text: "" }
      const parser = new Parser({ onopentag: (tag, attrs) => {
        const localTag = tag.split(":").at(-1)
        if (localTag === "Relationship" && attrs.TargetMode === "External") throw DocumentWork.failure()
        if (worksheet && localTag === "c") {
          coordinate(attrs.r)
          if (++budget.cells > DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
        }
        if (worksheet && localTag === "row" && (!/^[1-9][0-9]*$/.test(attrs.r) || Number(attrs.r) > 10000))
          throw DocumentWork.failure("quota_exceeded")
        if (worksheet && localTag === "col" && (![attrs.min, attrs.max].every((n) => /^[1-9][0-9]*$/.test(n) && Number(n) <= 256)))
          throw DocumentWork.failure("quota_exceeded")
        if (worksheet && ["dimension", "mergeCell"].includes(localTag ?? "")) {
          const range = attrs.ref.split(":").map(coordinate)
          if (range.length > 2 || range.length === 2 && (range[1].row - range[0].row + 1) * (range[1].column - range[0].column + 1) > DocumentWork.limits.cells)
            throw DocumentWork.failure("quota_exceeded")
        }
        if (name === "xl/workbook.xml" && localTag === "definedName") {
          if (++budget.names > 100) throw DocumentWork.failure("quota_exceeded")
          named.active = true
          named.text = ""
        }
        if (editable && (name === "xl/workbook.xml" || name.startsWith("xl/worksheets/")) &&
          ["extLst", "tableParts", "drawing", "legacyDrawing", "oleObjects", "controls", "dataValidations", "conditionalFormatting"].includes(localTag ?? ""))
          throw DocumentWork.failure()
      }, ontext: (text) => {
        if (!named.active) return
        named.text += text
        if (named.text.length > 4096) throw DocumentWork.failure("quota_exceeded")
      }, onclosetag: (tag) => {
        if (!named.active || tag.split(":").at(-1) !== "definedName") return
        named.active = false
        // ExcelJS expands named ranges into a cell matrix. Bound them before its decoder sees the bytes.
        named.text.split(",").forEach((range) => {
          const match = /^(?:'(?:[^']|'')+'|[^!']+)!([\$A-Z0-9]+)(?::([\$A-Z0-9]+))?$/.exec(range)
          if (!match) throw DocumentWork.failure()
          const start = coordinate(match[1])
          const end = coordinate(match[2] ?? match[1])
          const cells = (end.row - start.row + 1) * (end.column - start.column + 1)
          if (cells < 1 || (budget.namedCells += cells) > DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
        })
      } }, { xmlMode: true, decodeEntities: true })
      parser.end(xml)
    }
    budget.offset = next
  }
  if (budget.offset !== end || !seen.has("xl/workbook.xml") || !seen.has("[Content_Types].xml"))
    throw DocumentWork.failure("unsupported_schema")
}
