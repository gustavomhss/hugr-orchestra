import { isDeepStrictEqual } from "node:util"
import { Schema } from "effect"
import type { Cell, CellValue, Workbook, Worksheet } from "exceljs"
import { DocumentWork } from "../document/work"
import { parse, encode } from "./csv"
import { columnName, coordinate, formula, requireName, shift, shiftedIndex } from "./formula"
import { Edit, Range, Read, mime } from "./schema"
import { requirePackage, number } from "./zip"
import type { Evidence, SheetEvidence } from "./zip"

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
        while (rows.length < cell.row) rows.push([""])
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
  const evidence = "operation" in input && input.operation === "create" ? undefined
    : await requirePackage(requireBytes(bytes), "operation" in input && input.operation !== "export")
  if (evidence) {
    const data = requireBytes(bytes)
    // ExcelJS declares its own Buffer interface as extending ArrayBuffer (not node:buffer.Buffer).
    await workbook.xlsx.load(new Uint8Array(data).buffer)
    requireBounded(workbook)
    normalizeStoredNumbers(workbook, evidence)
  }
  if (!("operation" in input)) {
    requireBounded(workbook)
    const sheet = input.sheet ? requireSheet(workbook, input.sheet) : workbook.worksheets[0]
    if (!sheet) throw DocumentWork.failure("unsupported_schema")
    const range = requireRange(input.range ?? defaultRange(sheet))
    const cells = rangeCells(sheet, range, evidence?.sheets.get(sheet.name))
    const captured = cells.slice(0, 100)
    return { status: "ok", files: [], incomplete: [...(cells.length > captured.length ? ["Cell capture truncated"] : []),
      ...(hasFormulas(workbook) ? ["Cached formula results were not recalculated; calculation engine unavailable"] : []),
      ...(evidence?.names.some((n) => n.localSheetId !== null) ? ["Worksheet-local defined names are unsupported for mutation; raw scope is preserved"] : []),
      ...(evidence && [...evidence.sheets.values()].some((s) => s.structure.has("unsupported formula representation"))
        ? ["Array or other unsupported formula representations are observations only; mutation is unsupported"] : [])],
      metadata: { format: "xlsx", sheets: workbook.worksheets.map((s) => ({ name: s.name, rows: s.rowCount, columns: s.columnCount })),
        sheet: sheet.name, range, cells: captured, names: evidence?.names.map((n) => ({ name: n.name, value: n.value,
          localSheetId: n.localSheetId, scope: n.localSheetId === null ? "workbook" : "worksheet" })) ?? [],
        dateSystem: workbook.properties.date1904 ? "1904" : "1900", calculation: "not-performed" } }
  }
  if (input.operation !== "export") workbook.eachSheet((s) => s.eachRow((row) => row.eachCell((cell) => {
    if (cell.formula) formula(cell.formula)
  })))
  if (input.operation === "create") {
    if (new Set(input.worksheets.map((s) => s.name.toLowerCase())).size !== input.worksheets.length) throw DocumentWork.failure("unsupported_schema")
    input.worksheets.forEach((s) => preflightCells(s.cells))
    if (input.names) preflightNames(workbook, input.names, input.worksheets.map((s) => s.name))
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
      s.autoFilter || (s.views ?? []).some((view) => view.state !== "normal")) ||
      evidence?.names.length || evidence && [...evidence.sheets.values()].some((s) => s.structure.size))
      throw DocumentWork.failure()
    const max = input.axis === "rows" ? 10000 : 256
    if (input.index > max || input.index + input.count - 1 > max ||
      input.action === "insert" && (input.axis === "rows" ? sheet.rowCount : sheet.columnCount) + input.count > max)
      throw DocumentWork.failure("quota_exceeded")
    // Build the oracle from ORIGINAL addresses/values/layout before any mutation. ExcelJS terminal spliceRows can be a no-op.
    const expected = expectedMapping(semantic(workbook), input)
    const rebuilt = new Workbook()
    rebuilt.model = { ...structuredClone(workbook.model), worksheets: [] }
    workbook.worksheets.forEach((old) => {
      const target = rebuilt.addWorksheet(old.name, { state: old.state, properties: structuredClone(old.properties),
        pageSetup: structuredClone(old.pageSetup), headerFooter: structuredClone(old.headerFooter), views: structuredClone(old.views ?? []) })
      const mapping = (n: number, axis: "rows" | "columns") => old === sheet && input.axis === axis
        ? shiftedIndex(n, input.index, input.count, input.action) : n
      Array.from({ length: old.columns?.length ?? 0 }, (_, i) => old.getColumn(i + 1)).forEach((column) => {
        const n = mapping(column.number, "columns")
        if (n === undefined) return
        const out = target.getColumn(n)
        out.width = column.width
        out.style = structuredClone(column.style)
        out.hidden = column.hidden
        out.outlineLevel = column.outlineLevel
      })
      old.eachRow({ includeEmpty: true }, (row) => {
        const n = mapping(row.number, "rows")
        if (n === undefined) return
        const out = target.getRow(n)
        out.height = row.height
        Object.assign(out, structuredClone(row.model?.style ?? {}))
        out.hidden = row.hidden
        out.outlineLevel = row.outlineLevel
        row.eachCell({ includeEmpty: true }, (cell) => {
          const col = mapping(Number(cell.col), "columns")
          if (col === undefined) return
          const copied = out.getCell(col)
          copied.style = structuredClone(cell.style)
          copied.value = cell.formula ? { formula: old === sheet
            ? shift(cell.formula, input.axis, input.index, input.count, input.action) : cell.formula } : cell.value
        })
      })
    })
    if (!isDeepStrictEqual(semantic(rebuilt), expected)) throw DocumentWork.failure("outcome_unknown")
    return saveVerified(rebuilt, expected)
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
          const cache = formulaCache(cell, evidence?.sheets.get(sheet.name))
          if (!cache.present) throw DocumentWork.failure("unsupported_operation")
          return display(cache.value)
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
function preflightNames(workbook: Workbook, names: Names, sheets = workbook.worksheets.map((s) => s.name)) {
  const existing = new Set(workbook.definedNames.model.map((n) => n.name.toLowerCase()))
  if (new Set(names.map((n) => n.name.toLowerCase())).size !== names.length) throw DocumentWork.failure("unsupported_schema")
  names.forEach((n) => {
    if (!sheets.includes(n.sheet) || existing.has(n.name.toLowerCase())) throw DocumentWork.failure("unsupported_schema")
    requireRange(n.range)
    requireName(n.name)
  })
}
function applyNames(workbook: Workbook, names: Names) {
  preflightNames(workbook, names)
  names.forEach((n) => {
    workbook.definedNames.add(`'${n.sheet.replaceAll("'", "''")}'!$${columnName(n.range.startColumn)}$${n.range.startRow}:$${columnName(n.range.endColumn)}$${n.range.endRow}`, n.name)
  })
}
function requireBounded(workbook: Workbook) {
  if (!workbook.worksheets.length || workbook.worksheets.length > DocumentWork.limits.sheets ||
    workbook.worksheets.reduce((n, sheet) => n + sheet.rowCount * sheet.columnCount, 0) > DocumentWork.limits.cells ||
    workbook.definedNames.model.length > 100) throw DocumentWork.failure("quota_exceeded")
  workbook.eachSheet((sheet) => {
    if (sheet.rowCount > 10000 || sheet.columnCount > 256) throw DocumentWork.failure("quota_exceeded")
    requireFinite(sheet.pageSetup)
    requireFinite(sheet.properties)
    Array.from({ length: sheet.columns?.length ?? 0 }, (_, i) => sheet.getColumn(i + 1)).forEach((column) => {
      requireFinite(column.width)
      requireFinite(column.style)
    })
    sheet.eachRow({ includeEmpty: true }, (row) => {
      requireFinite(row.height)
      requireFinite(row.outlineLevel)
      requireFinite(row.model?.style)
      row.eachCell({ includeEmpty: true }, (cell) => { requireFinite(cell.value); requireFinite(cell.result); requireFinite(cell.style) })
    })
  })
  requireFinite(workbook.created)
  requireFinite(workbook.modified)
  requireFinite(workbook.lastPrinted)
}
function hasFormulas(workbook: Workbook) {
  return workbook.worksheets.some((sheet) => {
    const found = { value: false }
    sheet.eachRow((row) => row.eachCell((cell) => { if (cell.formula) found.value = true }))
    return found.value
  })
}
function display(value: CellValue | undefined): string {
  requireFinite(value)
  if (value === undefined || value === null) return ""
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== "object") return String(value)
  if ("richText" in value) return value.richText.map((t) => t.text).join("")
  if ("error" in value) return value.error
  if ("text" in value) return value.text
  throw DocumentWork.failure("unsupported_schema")
}
function projection(cell: Cell, evidence?: SheetEvidence): Schema.Json {
  const cache = formulaCache(cell, evidence)
  const raw = evidence?.cells.get(cell.address)
  return cell.formula ? { address: cell.address, kind: "formula", formula: cell.formula, cached: display(cache.value),
    cachePresent: cache.present, cacheType: raw?.type ?? typeof cache.value, formulaType: raw?.formula?.type ?? "normal",
    formulaRange: raw?.formula?.ref ?? null, calculation: "not-performed" }
    : { address: cell.address, kind: "literal", value: display(cell.value), valueType: cell.value instanceof Date ? "date" : typeof cell.value,
      numberFormat: cell.numFmt ?? "General", datePresentation: evidence?.datePresentation.get(cell.address) ?? null }
}
function rangeCells(sheet: Worksheet, range: typeof Range.Type, evidence?: SheetEvidence) {
  return Array.from({ length: range.endRow - range.startRow + 1 }, (_, i) =>
    Array.from({ length: range.endColumn - range.startColumn + 1 }, (_, j) => projection(sheet.getCell(i + range.startRow, j + range.startColumn), evidence))).flat()
}
function semantic(workbook: Workbook) {
  return { date1904: workbook.properties.date1904 ?? false, names: workbook.definedNames.model, sheets: workbook.worksheets.map((sheet) => {
    const cells: { address: string; value: CellValue; style: Cell["style"] }[] = []
    const rows: { number: number; height: number | null; hidden: boolean; outlineLevel: number; style: Cell["style"] }[] = []
    sheet.eachRow({ includeEmpty: true }, (row) => {
      if (row.hasValues || row.height !== undefined || row.hidden || row.outlineLevel || Object.keys(row.model?.style ?? {}).length)
        rows.push({ number: row.number, height: row.height ?? null, hidden: !!row.hidden, outlineLevel: row.outlineLevel ?? 0, style: normalizedStyle(row.model?.style ?? {}) })
      row.eachCell({ includeEmpty: true }, (cell) => {
        const style = normalizedStyle(cell.style)
        if (cell.value === null && !Object.values(style).some((v) => v !== undefined)) return
        cells.push({ address: cell.address, value: cell.formula ? { formula: cell.formula, result: cell.result } : cell.value, style })
      })
    })
    return { name: sheet.name, state: sheet.state, cells, rows, merges: sheet.model.merges,
      columns: Array.from({ length: Math.max(sheet.columnCount, sheet.columns?.length ?? 0) }, (_, i) => {
        const column = sheet.getColumn(i + 1)
        return { number: i + 1, width: column.width ?? 9, hidden: !!column.hidden, outlineLevel: column.outlineLevel ?? 0, style: normalizedStyle(column.style) }
      }),
      properties: Object.fromEntries(Object.entries(sheet.properties).filter(([, v]) => v !== undefined)),
      headerFooter: Object.fromEntries(Object.entries(sheet.headerFooter ?? {}).filter(([, v]) => v)),
      pageSetup: { firstPageNumber: 1, useFirstPageNumber: false, usePrinterDefaults: false, copies: 1,
        showRowColHeaders: false, showGridLines: false, horizontalCentered: false, verticalCentered: false,
        ...Object.fromEntries(Object.entries(sheet.pageSetup).filter(([, v]) => v !== undefined && v !== null && !Array.isArray(v))) },
      rowBreaks: sheet.model.rowBreaks ?? [] }
  }) }
}
async function saveVerified(workbook: Workbook, before?: ReturnType<typeof semantic>): Promise<DocumentWork.Success> {
  requireBounded(workbook)
  workbook.calcProperties.fullCalcOnLoad = true
  const expected = before ?? structuredClone(semantic(workbook))
  const data = new Uint8Array(await workbook.xlsx.writeBuffer())
  if (data.byteLength > DocumentWork.limits.bytes) throw DocumentWork.failure("quota_exceeded")
  const evidence = await requirePackage(data, false)
  const { Workbook } = await import("exceljs")
  const reopened = new Workbook()
  await reopened.xlsx.load(new Uint8Array(data).buffer)
  requireBounded(reopened)
  normalizeStoredNumbers(reopened, evidence)
  if (!isDeepStrictEqual(semantic(reopened), expected)) throw DocumentWork.failure("outcome_unknown")
  const incomplete = hasFormulas(reopened) ? ["Formula bytes verified; calculation engine unavailable; results uncalculated"] : []
  const metadata = { format: "xlsx", worksheets: reopened.worksheets.map((s) => ({ name: s.name, rows: s.rowCount, columns: s.columnCount })),
    calculation: "not-performed", semanticReadback: true }
  return { status: "ok", files: [{ data, mime, metadata }], metadata, incomplete }
}

function expectedMapping(before: ReturnType<typeof semantic>, input: Extract<Edit, { operation: "restructure" }>) {
  return { ...before, sheets: before.sheets.map((sheet) => {
    const point = (n: number, axis: "rows" | "columns") => sheet.name === input.sheet && axis === input.axis
      ? shiftedIndex(n, input.index, input.count, input.action) : n
    const cells = sheet.cells.flatMap((cell) => {
      const old = coordinate(cell.address)
      const row = point(old.row, "rows")
      const column = point(old.column, "columns")
      if (row === undefined || column === undefined) return []
      const expression = cell.value !== null && typeof cell.value === "object" && "formula" in cell.value ? cell.value.formula : undefined
      const value = typeof expression === "string"
        ? { formula: sheet.name === input.sheet ? shift(expression, input.axis, input.index, input.count, input.action) : expression, result: undefined }
        : cell.value
      return [{ ...cell, address: `${columnName(column)}${row}`, value }]
    })
    const rows = sheet.rows.flatMap((row) => {
      const n = point(row.number, "rows")
      if (n === undefined || row.height === null && !row.hidden && !row.outlineLevel &&
        !Object.values(row.style).some((v) => v !== undefined) && !cells.some((c) => coordinate(c.address).row === n)) return []
      return [{ ...row, number: n }]
    })
    const columns = sheet.columns.flatMap((column) => {
      const n = point(column.number, "columns")
      return n === undefined ? [] : [{ ...column, number: n }]
    })
    if (sheet.name === input.sheet && input.axis === "columns" && input.action === "insert")
      Array.from({ length: input.count }, (_, i) => columns.push({ number: input.index + i, width: 9, hidden: false, outlineLevel: 0, style: normalizedStyle({}) }))
    return { ...sheet, cells, rows, columns: columns.sort((a, b) => a.number - b.number) }
  }) }
}

function requireFinite(value: unknown): void {
  if (typeof value === "number" && !Number.isFinite(value) || value instanceof Date && !Number.isFinite(value.getTime()))
    throw DocumentWork.failure("unsupported_schema")
  if (value === null || typeof value !== "object" || value instanceof Date) return
  Object.values(value).forEach(requireFinite)
}

function normalizeStoredNumbers(workbook: Workbook, evidence: Evidence) {
  if (!!workbook.properties.date1904 !== evidence.date1904) throw DocumentWork.failure("unsupported_schema")
  workbook.eachSheet((sheet) => {
    // ExcelJS reads an absent firstPageNumber as 1, then writes it as an explicit numbering override.
    if ("useFirstPageNumber" in sheet.pageSetup && sheet.pageSetup.useFirstPageNumber === false)
      delete sheet.pageSetup.firstPageNumber
    const raw = evidence.sheets.get(sheet.name)
    if (!raw) throw DocumentWork.failure("unsupported_schema")
    raw.cells.forEach((stored, address) => {
      const cell = sheet.getCell(address)
      if (stored.formula?.expanded && formula(cell.formula).join("") !== stored.formula.expanded) throw DocumentWork.failure("unsupported_schema")
      if (cell.value instanceof Date) {
        raw.datePresentation.set(address, cell.value.toISOString())
        if (stored.type !== "n" || !stored.valuePresent) throw DocumentWork.failure("unsupported_schema")
        cell.value = number(stored.value)
      }
      if (cell.result instanceof Date) {
        raw.datePresentation.set(address, cell.result.toISOString())
        if (stored.type !== "n" || !stored.valuePresent || !stored.formula) throw DocumentWork.failure("unsupported_schema")
        const value = cell.value
        if (value === null || typeof value !== "object" || !("formula" in value || "sharedFormula" in value)) throw DocumentWork.failure("unsupported_schema")
        cell.value = { ...value, result: number(stored.value) }
      }
    })
  })
}

function formulaCache(cell: Cell, evidence?: SheetEvidence): { present: boolean; value: CellValue | undefined } {
  const raw = evidence?.cells.get(cell.address)
  if (!raw?.formula) return { present: cell.result !== undefined, value: cell.result }
  if (!raw.valuePresent) return { present: false, value: undefined }
  if (raw.type === "str") return { present: true, value: raw.value }
  if (raw.type === "b") return { present: true, value: raw.value === "1" }
  if (raw.type === "n") return { present: true, value: number(raw.value) }
  if (raw.type === "e") return { present: true, value: cell.result }
  throw DocumentWork.failure("unsupported_schema")
}

function normalizedStyle(style: Cell["style"]): Cell["style"] {
  // ExcelJS materializes these two defaults on reopening a styled cell; they have no visual effect.
  return { ...style, border: style.border && Object.keys(style.border).length ? style.border : undefined,
    fill: style.fill?.type === "pattern" && style.fill.pattern === "none" ? undefined : style.fill }
}
