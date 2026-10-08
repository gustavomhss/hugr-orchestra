import { isDeepStrictEqual } from "node:util"
import { Schema } from "effect"
import type { Cell, CellValue, Workbook, Worksheet } from "exceljs"
import { DocumentWork } from "../document/work"
import { parse, encode } from "./csv"
import { columnName, coordinate, formula, shift } from "./formula"
import { Edit, Range, Read, mime } from "./schema"
import { requirePackage } from "./zip"

export async function operate(supplied: unknown, bytes: readonly Uint8Array[]): Promise<DocumentWork.Success> {
  const input = Schema.decodeUnknownSync(Schema.Union([Read, Edit]))(supplied)
  const delimiter = "delimiter" in input ? input.delimiter ?? "," : ","
  if (input.format === "csv") {
    const rows = "operation" in input && input.operation === "create" ? input.rows.map((row) => [...row])
      : parse(requireBytes(bytes), delimiter)
    if (!("operation" in input)) {
      const selected = csvRange(rows, input.range)
      const body = input.header ? selected.slice(1) : selected
      const captured = body.slice(0, 100)
      return { status: "ok", files: [], incomplete: captured.length < body.length ? ["CSV row capture truncated"] : [],
        metadata: { format: "csv", rowCount: rows.length, delimiter, header: input.header ? selected[0] ?? [] : null, rows: captured, literal: true } }
    }
    if (input.operation === "edit") {
      input.cells.forEach((cell) => {
        while (rows.length < cell.row) rows.push([])
        const row = rows[cell.row - 1]
        while (row.length < cell.column) row.push("")
        row[cell.column - 1] = cell.value
      })
    }
    if (input.operation !== "import") {
      const data = encode(rows, delimiter)
      const metadata = { format: "csv", rowCount: rows.length, delimiter, literal: true, header: input.header ?? false }
      return { status: "ok", files: [{ data, mime: "text/csv; charset=utf-8", metadata }], metadata, incomplete: [] }
    }
    const { Workbook } = await import("exceljs")
    const workbook = new Workbook()
    const selected = csvRange(rows, input.range)
    // Formula opt-in is validated before constructing worksheet cells. Numeric/date strings stay strings.
    if (input.formulas) selected.flat().filter((value) => value.startsWith("=")).forEach(formula)
    const sheet = workbook.addWorksheet(input.sheet)
    selected.forEach((row, i) => row.forEach((value, j) => {
      sheet.getCell(i + 1, j + 1).value = input.formulas && value.startsWith("=") ? { formula: value.slice(1) } : value
    }))
    if (input.header && selected.length) {
      sheet.getRow(1).font = { name: "Arial", bold: true }
      sheet.views = [{ state: "frozen", ySplit: 1 }]
    }
    return saveVerified(workbook)
  }

  if ("operation" in input && input.operation === "recalculate") throw DocumentWork.failure()
  const { Workbook } = await import("exceljs")
  const workbook = new Workbook()
  if (!("operation" in input && input.operation === "create")) {
    const data = requireBytes(bytes)
    await requirePackage(data, "operation" in input && input.operation !== "export")
    // ExcelJS declares its own Buffer interface as extending ArrayBuffer (not node:buffer.Buffer).
    await workbook.xlsx.load(new Uint8Array(data).buffer)
  }
  if (!("operation" in input)) {
    requireBounded(workbook)
    const sheet = input.sheet ? requireSheet(workbook, input.sheet) : workbook.worksheets[0]
    if (!sheet) throw DocumentWork.failure("unsupported_schema")
    const range = requireRange(input.range ?? defaultRange(sheet))
    const cells = rangeCells(sheet, range)
    const captured = cells.slice(0, 100)
    return { status: "ok", files: [], incomplete: [...(cells.length > captured.length ? ["Cell capture truncated"] : []),
      ...(hasFormulas(workbook) ? ["Cached formula results were not recalculated; calculation engine unavailable"] : [])],
      metadata: { format: "xlsx", sheets: workbook.worksheets.map((s) => ({ name: s.name, rows: s.rowCount, columns: s.columnCount })),
        sheet: sheet.name, range, cells: captured, names: workbook.definedNames.model.map((n) => ({ name: n.name, ranges: n.ranges })), calculation: "not-performed" } }
  }
  if (input.operation === "create") {
    if (new Set(input.worksheets.map((s) => s.name.toLowerCase())).size !== input.worksheets.length) throw DocumentWork.failure("unsupported_schema")
    input.worksheets.forEach((s) => preflightCells(s.cells))
    input.worksheets.forEach((s) => applyCells(workbook.addWorksheet(s.name), s.cells))
    if (input.names) applyNames(workbook, input.names)
  }
  if (input.operation === "edit") {
    requireBounded(workbook)
    preflightCells(input.cells)
    const sheet = requireSheet(workbook, input.sheet)
    if (input.names) preflightNames(workbook, input.names)
    applyCells(sheet, input.cells)
    if (input.names) applyNames(workbook, input.names)
  }
  if (input.operation === "restructure") {
    requireBounded(workbook)
    const sheet = requireSheet(workbook, input.sheet)
    // Whole-workbook validation precedes mutation. Unsupported reference-bearing features are rejected, not silently left behind.
    if (workbook.definedNames.model.length || workbook.worksheets.some((s) => s.model.merges.length || s.getImages().length ||
      s.autoFilter || (s.views ?? []).some((view) => view.state !== "normal")))
      throw DocumentWork.failure()
    const max = input.axis === "rows" ? 10000 : 256
    if (input.index > max || input.index + input.count - 1 > max ||
      input.action === "insert" && (input.axis === "rows" ? sheet.rowCount : sheet.columnCount) + input.count > max)
      throw DocumentWork.failure("quota_exceeded")
    const rewrites: { cell: Cell; formula: string }[] = []
    workbook.eachSheet((s) => s.eachRow((row) => row.eachCell((cell) => {
      if (!cell.formula) return
      formula(cell.formula)
      if (s === sheet) rewrites.push({ cell, formula: shift(cell.formula, input.axis, input.index, input.count, input.action) })
    })))
    rewrites.forEach((change) => { change.cell.value = { formula: change.formula } })
    if (input.axis === "rows") sheet.spliceRows(input.index, input.action === "delete" ? input.count : 0,
      ...Array.from({ length: input.action === "insert" ? input.count : 0 }, () => []))
    if (input.axis === "columns") sheet.spliceColumns(input.index, input.action === "delete" ? input.count : 0,
      ...Array.from({ length: input.action === "insert" ? input.count : 0 }, () => []))
  }
  if (input.operation === "export") {
    requireBounded(workbook)
    const sheet = requireSheet(workbook, input.sheet)
    const range = requireRange(input.range ?? defaultRange(sheet))
    const unresolved = new Set<string>()
    const rows = Array.from({ length: range.endRow - range.startRow + 1 }, (_, i) =>
      Array.from({ length: range.endColumn - range.startColumn + 1 }, (_, j) => {
        const cell = sheet.getCell(i + range.startRow, j + range.startColumn)
        if (cell.formula) {
          if (input.formulas) return `=${cell.formula}`
          unresolved.add("Formula caches exported without recalculation; calculation engine unavailable")
          if (cell.result === undefined) throw DocumentWork.failure("unsupported_operation")
          return display(cell.result)
        }
        return display(cell.value)
      }))
    const selected = input.header === false ? rows.slice(1) : rows
    const data = encode(selected, delimiter)
    const metadata = { format: "csv", sheet: sheet.name, range, rowCount: selected.length, delimiter, formulas: input.formulas ?? false }
    return { status: "ok", files: [{ data, mime: "text/csv; charset=utf-8", metadata }], metadata, incomplete: [...unresolved] }
  }
  // Any edit invalidates ALL cached formula results. This adapter never fabricates calculation evidence.
  workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
    if (cell.formula) cell.value = { formula: cell.formula }
  })))
  return saveVerified(workbook)
}

function requireBytes(bytes: readonly Uint8Array[]) {
  if (bytes.length !== 1 || !bytes[0]) throw DocumentWork.failure("unsupported_schema")
  return bytes[0]
}
function requireSheet(workbook: Workbook, name: string) {
  const sheet = workbook.getWorksheet(name)
  if (!sheet) throw DocumentWork.failure("unsupported_schema")
  return sheet
}
function requireRange(range: typeof Range.Type) {
  if (range.endRow < range.startRow || range.endColumn < range.startColumn ||
    (range.endRow - range.startRow + 1) * (range.endColumn - range.startColumn + 1) > DocumentWork.limits.cells)
    throw DocumentWork.failure("quota_exceeded")
  return range
}
function defaultRange(sheet: Worksheet) {
  return { startRow: 1, startColumn: 1, endRow: Math.max(1, sheet.rowCount), endColumn: Math.max(1, sheet.columnCount) }
}
function csvRange(rows: readonly (readonly string[])[], supplied?: typeof Range.Type) {
  if (rows.reduce((n, row) => n + row.length, 0) > DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
  if (!supplied) return rows.map((row) => [...row])
  const range = requireRange(supplied)
  return rows.slice(range.startRow - 1, range.endRow).map((row) => row.slice(range.startColumn - 1, range.endColumn))
}
type Cells = Extract<Edit, { operation: "edit"; format: "xlsx" }>["cells"]
type Names = NonNullable<Extract<Edit, { operation: "create"; format: "xlsx" }>["names"]>
function preflightCells(cells: Cells) {
  if (new Set(cells.map((c) => c.address)).size !== cells.length) throw DocumentWork.failure("unsupported_schema")
  cells.forEach((cell) => { coordinate(cell.address); if (cell.value.kind === "formula") formula(cell.value.formula) })
}
function applyCells(sheet: Worksheet, cells: Cells) {
  cells.forEach((spec) => {
    const cell = sheet.getCell(spec.address)
    cell.value = spec.value.kind === "literal" ? spec.value.value : { formula: spec.value.formula.replace(/^=/, "") }
    if (!spec.style) return
    cell.font = { ...cell.font, name: cell.font?.name ?? "Arial",
      ...(spec.style.bold !== undefined ? { bold: spec.style.bold } : {}),
      ...(spec.style.italic !== undefined ? { italic: spec.style.italic } : {}),
      ...(spec.style.fontSize !== undefined ? { size: spec.style.fontSize } : {}),
      ...(spec.style.color !== undefined ? { color: { argb: spec.style.color } } : {}) }
    if (spec.style.numberFormat !== undefined) cell.numFmt = spec.style.numberFormat
  })
}
function preflightNames(workbook: Workbook, names: Names) {
  if (new Set(names.map((n) => n.name)).size !== names.length) throw DocumentWork.failure("unsupported_schema")
  names.forEach((n) => { requireSheet(workbook, n.sheet); requireRange(n.range)
    if (/^[A-Z]{1,3}[0-9]+$/.test(n.name) || /^[Rr][0-9]+[Cc][0-9]+$/.test(n.name)) throw DocumentWork.failure("unsupported_schema") })
}
function applyNames(workbook: Workbook, names: Names) {
  preflightNames(workbook, names)
  names.forEach((n) => {
    if (workbook.definedNames.model.some((old) => old.name === n.name)) throw DocumentWork.failure()
    workbook.definedNames.add(`'${n.sheet.replaceAll("'", "''")}'!$${columnName(n.range.startColumn)}$${n.range.startRow}:$${columnName(n.range.endColumn)}$${n.range.endRow}`, n.name)
  })
}
function requireBounded(workbook: Workbook) {
  if (!workbook.worksheets.length || workbook.worksheets.length > DocumentWork.limits.sheets ||
    workbook.worksheets.reduce((n, sheet) => n + sheet.rowCount * sheet.columnCount, 0) > DocumentWork.limits.cells ||
    workbook.definedNames.model.length > 100) throw DocumentWork.failure("quota_exceeded")
  workbook.eachSheet((sheet) => {
    if (sheet.rowCount > 10000 || sheet.columnCount > 256) throw DocumentWork.failure("quota_exceeded")
  })
}
function hasFormulas(workbook: Workbook) {
  return workbook.worksheets.some((sheet) => {
    const found = { value: false }
    sheet.eachRow((row) => row.eachCell((cell) => { if (cell.formula) found.value = true }))
    return found.value
  })
}
function display(value: CellValue | undefined): string {
  if (value === undefined || value === null) return ""
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== "object") return String(value)
  if ("richText" in value) return value.richText.map((t) => t.text).join("")
  if ("error" in value) return value.error
  if ("text" in value) return value.text
  throw DocumentWork.failure("unsupported_schema")
}
function projection(cell: Cell): Schema.Json {
  return cell.formula ? { address: cell.address, kind: "formula", formula: cell.formula, cached: display(cell.result),
    cachePresent: cell.result !== undefined, calculation: "not-performed" }
    : { address: cell.address, kind: "literal", value: display(cell.value), valueType: cell.value instanceof Date ? "date" : typeof cell.value }
}
function rangeCells(sheet: Worksheet, range: typeof Range.Type) {
  return Array.from({ length: range.endRow - range.startRow + 1 }, (_, i) =>
    Array.from({ length: range.endColumn - range.startColumn + 1 }, (_, j) => projection(sheet.getCell(i + range.startRow, j + range.startColumn)))).flat()
}
function semantic(workbook: Workbook) {
  return { names: workbook.definedNames.model, sheets: workbook.worksheets.map((sheet) => {
    const cells: { address: string; value: CellValue; style: Cell["style"] }[] = []
    sheet.eachRow((row) => row.eachCell((cell) => cells.push({ address: cell.address, value: cell.value, style: normalizedStyle(cell.style) })))
    return { name: sheet.name, cells, merges: sheet.model.merges }
  }) }
}
async function saveVerified(workbook: Workbook): Promise<DocumentWork.Success> {
  requireBounded(workbook)
  workbook.calcProperties.fullCalcOnLoad = true
  const expected = semantic(workbook)
  const data = new Uint8Array(await workbook.xlsx.writeBuffer())
  if (data.byteLength > DocumentWork.limits.bytes) throw DocumentWork.failure("quota_exceeded")
  await requirePackage(data, false)
  const { Workbook } = await import("exceljs")
  const reopened = new Workbook()
  await reopened.xlsx.load(new Uint8Array(data).buffer)
  if (!isDeepStrictEqual(semantic(reopened), expected)) throw DocumentWork.failure("outcome_unknown")
  const incomplete = hasFormulas(reopened) ? ["Formula bytes verified; calculation engine unavailable; results uncalculated"] : []
  const metadata = { format: "xlsx", worksheets: reopened.worksheets.map((s) => ({ name: s.name, rows: s.rowCount, columns: s.columnCount })),
    calculation: "not-performed", semanticReadback: true }
  return { status: "ok", files: [{ data, mime, metadata }], metadata, incomplete }
}

function normalizedStyle(style: Cell["style"]): Cell["style"] {
  // ExcelJS materializes these two defaults on reopening a styled cell; they have no visual effect.
  return { ...style, border: style.border && Object.keys(style.border).length ? style.border : undefined,
    fill: style.fill?.type === "pattern" && style.fill.pattern === "none" ? undefined : style.fill }
}
