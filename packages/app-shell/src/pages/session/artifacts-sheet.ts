const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const ODS = "application/vnd.oasis.opendocument.spreadsheet"
// Workbooks pad sheets with huge repeated empty ranges; nothing past this many columns reaches the preview.
const COLUMNS = 256

/**
 * The first sheet of a delimited file or workbook as rows of display text, at most `limit` rows. Workbooks are read
 * with the platform's own inflate, so cells show their stored values: dates stay serial numbers and formulas show
 * their last result.
 */
export async function sheetRows(mime: string, blob: Blob, limit: number) {
  const type = mime.split(";")[0].trim().toLowerCase()
  if (type === "text/csv" || type === "text/tab-separated-values")
    return delimitedRows(await blob.text(), type === "text/csv" ? "," : "\t").slice(0, limit)
  if (type !== XLSX && type !== ODS) return
  const files = await unzip(new Uint8Array(await blob.arrayBuffer()))
  const rows = type === XLSX ? await workbookRows(files, limit) : await opendocumentRows(files, limit)
  return rows?.map((row) => trimEnd(row)).filter((row) => row.some((value) => value !== ""))
}

function delimitedRows(text: string, delimiter: string) {
  // A field is either quoted (doubled quotes escape a quote) or runs to the next delimiter or line break.
  const field = new RegExp(`(?:"((?:[^"]|"")*)"|([^"${delimiter}\\n]*))(${delimiter}|\\n|$)`, "g")
  const rows: string[][] = [[]]
  for (const match of text.replace(/\r\n?/g, "\n").matchAll(field)) {
    rows[rows.length - 1].push(match[1] === undefined ? match[2] : match[1].replaceAll('""', '"'))
    if (match[3] === "") break
    if (match[3] === "\n") rows.push([])
  }
  return rows.filter((row) => row.some((value) => value !== ""))
}

async function workbookRows(files: Zip, limit: number) {
  const workbook = await files.xml("xl/workbook.xml")
  const relations = await files.xml("xl/_rels/workbook.xml.rels")
  const id = workbook && named(workbook.documentElement, "sheet")[0]?.getAttribute("r:id")
  const target = relations && named(relations.documentElement, "Relationship").find((item) => item.getAttribute("Id") === id)
    ?.getAttribute("Target")
  if (!target) return
  const sheet = await files.xml(target.startsWith("/") ? target.slice(1) : `xl/${target}`)
  if (!sheet) return
  const strings = await files.xml("xl/sharedStrings.xml")
  const shared = strings ? named(strings.documentElement, "si").map((item) => text(item, "t")) : []
  return named(sheet.documentElement, "row").slice(0, limit).map((row) => {
    const cells: string[] = []
    named(row, "c").forEach((cell) => {
      const letters = cell.getAttribute("r")?.match(/^[A-Z]+/)?.[0]
      const column = letters ? [...letters].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1 : cells.length
      if (column >= COLUMNS) return
      const value = named(cell, "v")[0]?.textContent ?? ""
      const kind = cell.getAttribute("t")
      cells[column] = kind === "s" ? shared[Number(value)] ?? "" : kind === "inlineStr" ? text(cell, "t")
        : kind === "b" ? (value === "1" ? "TRUE" : "FALSE") : value
    })
    return Array.from(cells, (value) => value ?? "")
  })
}

async function opendocumentRows(files: Zip, limit: number) {
  const content = await files.xml("content.xml")
  const table = content && named(content.documentElement, "table")[0]
  if (!table) return
  const rows: string[][] = []
  for (const row of named(table, "table-row")) {
    const cells = [...row.children].filter((cell) => cell.localName === "table-cell" || cell.localName === "covered-table-cell")
      .flatMap((cell) => {
        const value = named(cell, "p").map((item) => item.textContent ?? "").join("\n")
        return Array<string>(Math.min(Number(cell.getAttribute("table:number-columns-repeated") ?? 1), COLUMNS)).fill(value)
      }).slice(0, COLUMNS)
    const repeat = Math.min(Number(row.getAttribute("table:number-rows-repeated") ?? 1), limit - rows.length)
    // Trailing filler rows repeat an empty row up to the sheet's size; they add nothing to the preview.
    if (cells.some((value) => value !== "")) rows.push(...Array.from({ length: repeat }, () => cells))
    if (rows.length >= limit) break
  }
  return rows
}

type Zip = Awaited<ReturnType<typeof unzip>>

/** Reads entries through the zip central directory: stored and deflated entries, no encryption or zip64. */
async function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = Array.from({ length: Math.min(bytes.length - 21, 65557) }, (_, back) => bytes.length - 22 - back)
    .find((offset) => offset >= 0 && view.getUint32(offset, true) === 0x06054b50)
  if (end === undefined) throw new Error("not a zip archive")
  const entries = new Map<string, { method: number; size: number; local: number }>()
  Array.from({ length: view.getUint16(end + 10, true) }).reduce<number>((offset) => {
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + view.getUint16(offset + 28, true)))
    entries.set(name, { method: view.getUint16(offset + 10, true), size: view.getUint32(offset + 20, true),
      local: view.getUint32(offset + 42, true) })
    return offset + 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }, view.getUint32(end + 16, true))
  const read = async (name: string) => {
    const entry = entries.get(name)
    if (!entry) return
    const start = entry.local + 30 + view.getUint16(entry.local + 26, true) + view.getUint16(entry.local + 28, true)
    const data = bytes.slice(start, start + entry.size)
    if (entry.method === 0) return new TextDecoder().decode(data)
    if (entry.method !== 8) throw new Error(`unsupported zip method ${entry.method}`)
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text()
  }
  return {
    xml: async (name: string) => {
      const source = await read(name)
      return source === undefined ? undefined : new DOMParser().parseFromString(source, "application/xml")
    },
  }
}

/** Descendants by local name, so namespace prefixes in workbook XML do not matter. */
function named(root: Element, name: string) {
  return [...root.getElementsByTagName("*")].filter((item) => item.localName === name)
}

function text(root: Element, name: string) {
  return named(root, name).map((item) => item.textContent ?? "").join("")
}

function trimEnd(row: string[]) {
  const last = row.findLastIndex((value) => value !== "")
  return row.slice(0, last + 1)
}
