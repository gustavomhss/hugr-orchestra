import { inflateRawSync } from "node:zlib"
import { DocumentWork } from "../document/work"

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
  const budget = { offset: view.getUint32(end + 16, true), inflated: 0 }
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
      const parser = new Parser({ onopentag: (tag, attrs) => {
        if (tag.split(":").at(-1) === "Relationship" && attrs.TargetMode === "External") throw DocumentWork.failure()
        if (editable && (name === "xl/workbook.xml" || name.startsWith("xl/worksheets/")) &&
          ["extLst", "tableParts", "drawing", "legacyDrawing", "oleObjects", "controls", "dataValidations", "conditionalFormatting"].includes(tag.split(":").at(-1) ?? ""))
          throw DocumentWork.failure()
      } }, { xmlMode: true, decodeEntities: true })
      parser.end(xml)
    }
    budget.offset = next
  }
  if (budget.offset !== end || !seen.has("xl/workbook.xml") || !seen.has("[Content_Types].xml"))
    throw DocumentWork.failure("unsupported_schema")
}
