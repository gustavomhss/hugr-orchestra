import { posix } from "node:path"
import { DocumentWork } from "../document/work"
import { coordinate, formula, translate } from "./formula"
import { entries } from "./archive"

export type CellEvidence = {
  type: string
  valuePresent: boolean
  value: string
  formula?: { type: string; ref: string | null; index: string | null; text: string; expanded?: string }
}
export type SheetEvidence = {
  cells: Map<string, CellEvidence>
  structure: Set<string>
  datePresentation: Map<string, string>
}
export type Evidence = {
  date1904: boolean
  names: { name: string; value: string; localSheetId: number | null }[]
  sheets: Map<string, SheetEvidence>
}

/** Narrow raw evidence ExcelJS drops: cache presence/type, formula representation, name scope and structural features. */

/** Decode ZIP entries under aggregate inflation limits before ExcelJS can allocate the workbook model. */
export async function requirePackage(data: Uint8Array, editable: boolean) {
  const { Parser } = await import("htmlparser2")
  const budget = { cells: 0, sheets: 0, names: 0, namedCells: 0, merged: 0, mergeArea: 0, strings: 0 }
  const seen = new Set<string>()
  const evidence: Evidence = { date1904: false, names: [], sheets: new Map() }
  const placements: { name: string; relation: string }[] = []
  const relationships = new Map<string, string>()
  const worksheets = new Map<string, SheetEvidence>()
  const stringIndices: number[] = []
  for (const entry of entries(data)) {
    const name = entry.name
    seen.add(name)
    if (/(?:vba|macros?|externalLinks|connections|queryTables|embeddings|activeX)/i.test(name)) throw DocumentWork.failure()
    if (editable && /(?:drawings|charts|pivot|slicer|tables|printerSettings|customXml)/i.test(name)) throw DocumentWork.failure()
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(entry.data)
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw DocumentWork.failure()
      const worksheet = name.startsWith("xl/worksheets/") && name.endsWith(".xml")
      if (worksheet && ++budget.sheets > DocumentWork.limits.sheets) throw DocumentWork.failure("quota_exceeded")
      const sheet: SheetEvidence = { cells: new Map(), structure: new Set(), datePresentation: new Map() }
      if (worksheet) worksheets.set(name, sheet)
      const named = { active: false, text: "", name: "", scope: null as number | null }
      const cell = { current: undefined as CellEvidence | undefined, address: "" }
      const tags: string[] = []
      const merges: ReturnType<typeof boundedRange>[] = []
      const parser = new Parser({ onopentag: (tag, attrs) => {
        const localTag = tag.split(":").at(-1)
        tags.push(localTag ?? "")
        if (name === "xl/sharedStrings.xml" && localTag === "si" && tags.at(-2) === "sst") {
          if (++budget.strings > DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
        }
        if (localTag === "Relationship" && attrs.TargetMode === "External") throw DocumentWork.failure()
        if (name === "xl/_rels/workbook.xml.rels" && localTag === "Relationship" && attrs.Type?.endsWith("/worksheet")) {
          const target = attrs.Target.startsWith("/") ? posix.normalize(attrs.Target.slice(1)) : posix.normalize(posix.join("xl", attrs.Target))
          if (!target.startsWith("xl/worksheets/") || relationships.has(attrs.Id)) throw DocumentWork.failure("unsupported_schema")
          relationships.set(attrs.Id, target)
        }
        if (name === "xl/workbook.xml" && localTag === "sheet") placements.push({ name: attrs.name, relation: attrs["r:id"] })
        if (name === "xl/workbook.xml" && localTag === "workbookPr") {
          if (attrs.date1904 !== undefined && !["0", "1", "true", "false"].includes(attrs.date1904)) throw DocumentWork.failure("unsupported_schema")
          evidence.date1904 = attrs.date1904 === "1" || attrs.date1904 === "true"
        }
        if (worksheet && localTag === "c") {
          coordinate(attrs.r)
          if (++budget.cells > DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
          if (sheet.cells.has(attrs.r)) throw DocumentWork.failure("unsupported_schema")
          cell.address = attrs.r
          cell.current = { type: attrs.t ?? "n", valuePresent: false, value: "" }
          sheet.cells.set(attrs.r, cell.current)
        }
        if (worksheet && cell.current && localTag === "f") {
          if (cell.current.formula) throw DocumentWork.failure("unsupported_schema")
          cell.current.formula = { type: attrs.t ?? "normal", ref: attrs.ref ?? null, index: attrs.si ?? null, text: "" }
          if (attrs.ref) boundedRange(attrs.ref)
          if (attrs.t && !["shared", "normal"].includes(attrs.t)) {
            sheet.structure.add("unsupported formula representation")
            if (editable) throw DocumentWork.failure()
          }
        }
        if (worksheet && cell.current && localTag === "v") {
          if (cell.current.valuePresent) throw DocumentWork.failure("unsupported_schema")
          cell.current.valuePresent = true
        }
        if (worksheet && localTag === "row" && (!/^[1-9][0-9]*$/.test(attrs.r) || Number(attrs.r) > 10000))
          throw DocumentWork.failure("quota_exceeded")
        if (worksheet && localTag === "col" && (![attrs.min, attrs.max].every((n) => /^[1-9][0-9]*$/.test(n) && Number(n) <= 256)))
          throw DocumentWork.failure("quota_exceeded")
        if (worksheet && ["row", "col"].includes(localTag ?? "")) {
          if (["1", "true"].includes(attrs.hidden) || Number(attrs.outlineLevel ?? 0) !== 0 || attrs.ht === "0") sheet.structure.add("hidden or outlined dimensions")
          if (attrs.ht !== undefined) number(attrs.ht)
          if (attrs.width !== undefined) number(attrs.width)
        }
        if (worksheet && localTag === "pageSetup") {
          const defaults: Record<string, string> = { orientation: "portrait", horizontalDpi: "4294967295", verticalDpi: "4294967295",
            scale: "100", fitToWidth: "1", fitToHeight: "1", pageOrder: "downThenOver", firstPageNumber: "1", copies: "1" }
          if (Object.entries(attrs).some(([key, value]) => defaults[key] !== value)) sheet.structure.add("custom page setup")
        }
        if (worksheet && ["rowBreaks", "colBreaks", "headerFooter", "outlinePr", "pageSetUpPr", "sheetProtection"].includes(localTag ?? ""))
          sheet.structure.add(localTag ?? "")
        if (editable && worksheet && ["rowBreaks", "colBreaks", "sheetProtection"].includes(localTag ?? "")) throw DocumentWork.failure()
        if (worksheet && ["dimension", "mergeCell"].includes(localTag ?? "")) {
          const range = boundedRange(attrs.ref)
          if (localTag === "mergeCell") {
            budget.mergeArea += range.area
            if (budget.mergeArea > 2 * DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
            merges.push(range)
          }
        }
        if (name === "xl/workbook.xml" && localTag === "definedName") {
          if (++budget.names > 100) throw DocumentWork.failure("quota_exceeded")
          if (!attrs.name || attrs.name.length > 256) throw DocumentWork.failure("unsupported_schema")
          named.active = true
          named.text = ""
          named.name = attrs.name
          named.scope = attrs.localSheetId === undefined ? null : number(attrs.localSheetId)
          if (named.scope !== null && (!Number.isSafeInteger(named.scope) || named.scope < 0)) throw DocumentWork.failure("unsupported_schema")
          if (editable && named.scope !== null) throw DocumentWork.failure()
        }
        if (editable && (name === "xl/workbook.xml" || name.startsWith("xl/worksheets/")) &&
          ["extLst", "tableParts", "drawing", "legacyDrawing", "oleObjects", "controls", "dataValidations", "conditionalFormatting"].includes(localTag ?? ""))
          throw DocumentWork.failure()
      }, ontext: (text) => {
        if (named.active) {
          named.text += text
          if (named.text.length > 4096) throw DocumentWork.failure("quota_exceeded")
        }
        if (cell.current && tags.at(-1) === "v") cell.current.value += text
        if (cell.current?.formula && tags.at(-1) === "f") cell.current.formula.text += text
        if ((cell.current?.value.length ?? 0) > 4096 || (cell.current?.formula?.text.length ?? 0) > 4096)
          throw DocumentWork.failure("quota_exceeded")
      }, onclosetag: (tag) => {
        if (tag.split(":").at(-1) === "c" && cell.current) {
          if (cell.current.type === "s") {
            if (!cell.current.valuePresent || !/^(?:0|[1-9][0-9]*)$/.test(cell.current.value) || !Number.isSafeInteger(Number(cell.current.value)))
              throw DocumentWork.failure("unsupported_schema")
            stringIndices.push(Number(cell.current.value))
          }
          if (cell.current.valuePresent) {
            if (cell.current.type === "n") number(cell.current.value)
            if (cell.current.type === "b" && !["0", "1"].includes(cell.current.value)) throw DocumentWork.failure("unsupported_schema")
            if (cell.current.type === "d") throw DocumentWork.failure("unsupported_schema")
            if (cell.current.formula && !["n", "str", "b", "e"].includes(cell.current.type)) throw DocumentWork.failure()
          }
          cell.current = undefined
        }
        tags.pop()
        if (!named.active || tag.split(":").at(-1) !== "definedName") return
        named.active = false
        evidence.names.push({ name: named.name, value: named.text, localSheetId: named.scope })
        // ExcelJS expands named ranges into a cell matrix. Bound them before its decoder sees the bytes.
        namedRanges(named.text).forEach((range) => {
          const match = /^(?:'(?:[^']|'')+'|[^!']+)!([\$A-Z0-9]+)(?::([\$A-Z0-9]+))?$/.exec(range)
          if (!match) throw DocumentWork.failure()
          if (named.name === "_xlnm.Print_Titles") return
          const start = coordinate(match[1])
          const end = coordinate(match[2] ?? match[1])
          const cells = (end.row - start.row + 1) * (end.column - start.column + 1)
          if (cells < 1 || (budget.namedCells += cells) > DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
        })
      } }, { xmlMode: true, decodeEntities: true })
      parser.end(xml)
      if (worksheet) budget.merged += mergeExpansion(merges, sheet.cells)
    }
  }
  if (!seen.has("xl/workbook.xml") || !seen.has("[Content_Types].xml"))
    throw DocumentWork.failure("unsupported_schema")
  if (budget.cells + budget.merged > DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
  if (stringIndices.some((index) => index >= budget.strings)) throw DocumentWork.failure("unsupported_schema")
  if (editable && new Set(evidence.names.map((n) => n.name.toLowerCase())).size !== evidence.names.length) throw DocumentWork.failure()
  placements.forEach((placement) => {
    const path = relationships.get(placement.relation)
    const sheet = path ? worksheets.get(path) : undefined
    if (!sheet || evidence.sheets.has(placement.name)) throw DocumentWork.failure("unsupported_schema")
    const masters = new Map<string, { address: string; text: string; ref: string }>()
    sheet.cells.forEach((cell, address) => {
      if (cell.formula?.type !== "shared" || !cell.formula.text) return
      if (!cell.formula.index || !cell.formula.ref || masters.has(cell.formula.index)) throw DocumentWork.failure("unsupported_schema")
      formula(cell.formula.text)
      masters.set(cell.formula.index, { address, text: cell.formula.text, ref: cell.formula.ref })
    })
    sheet.cells.forEach((cell, address) => {
      if (cell.formula?.type !== "shared") return
      const master = cell.formula.index ? masters.get(cell.formula.index) : undefined
      if (!master) throw DocumentWork.failure("unsupported_schema")
      const range = master.ref.split(":").map(coordinate)
      const start = range[0]
      const end = range[1] ?? start
      const point = coordinate(address)
      if (point.row < start.row || point.row > end.row || point.column < start.column || point.column > end.column)
        throw DocumentWork.failure("unsupported_schema")
      cell.formula.expanded = translate(master.text, master.address, address)
    })
    evidence.sheets.set(placement.name, sheet)
  })
  if (evidence.names.some((n) => n.localSheetId !== null && n.localSheetId >= placements.length)) throw DocumentWork.failure("unsupported_schema")
  return evidence
}

export function number(value: string) {
  if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(value.trim()) || !Number.isFinite(Number(value)))
    throw DocumentWork.failure("unsupported_schema")
  return Number(value)
}

function boundedRange(value: string) {
  const range = value.split(":").map(coordinate)
  if (range.length === 2 && (range[1].row < range[0].row || range[1].column < range[0].column)) throw DocumentWork.failure("unsupported_schema")
  if (range.length > 2 || range.length === 2 && (range[1].row - range[0].row + 1) * (range[1].column - range[0].column + 1) > DocumentWork.limits.cells)
    throw DocumentWork.failure("quota_exceeded")
  const start = range[0]
  const end = range[1] ?? start
  return { startRow: start.row, endRow: end.row, startColumn: start.column, endColumn: end.column,
    area: (end.row - start.row + 1) * (end.column - start.column + 1) }
}

/** Row-sweep interval accounting: at most 256 column slots, no merged-cell grid/Set expansion. */
function mergeExpansion(merges: ReturnType<typeof boundedRange>[], cells: Map<string, CellEvidence>) {
  const sorted = [...merges].sort((a, b) => a.startRow - b.startRow)
  const endRows = Array.from({ length: 256 }, () => 0)
  sorted.forEach((range) => {
    for (let col = range.startColumn; col <= range.endColumn; col++) {
      if (endRows[col - 1] >= range.startRow) throw DocumentWork.failure("unsupported_schema")
      endRows[col - 1] = range.endRow
    }
  })
  endRows.fill(0)
  const cursor = { index: 0, covered: 0 }
  const points = [...cells.keys()].map(coordinate).sort((a, b) => a.row - b.row)
  points.forEach((point) => {
    while (cursor.index < sorted.length && sorted[cursor.index].startRow <= point.row) {
      const range = sorted[cursor.index++]
      for (let col = range.startColumn; col <= range.endColumn; col++) endRows[col - 1] = range.endRow
    }
    if (endRows[point.column - 1] >= point.row) cursor.covered++
  })
  return merges.reduce((n, range) => n + range.area, 0) - cursor.covered
}

function namedRanges(value: string) {
  const state = { quoted: false, text: "" }
  const result: string[] = []
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") {
      if (state.quoted && value[i + 1] === "'") { state.text += "''"; i++; continue }
      state.quoted = !state.quoted
    }
    if (value[i] === "," && !state.quoted) { result.push(state.text); state.text = ""; continue }
    state.text += value[i]
  }
  if (state.quoted) throw DocumentWork.failure("unsupported_schema")
  result.push(state.text)
  return result
}
