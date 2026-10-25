import { expect, test } from "bun:test"
import { sheetRows } from "./artifacts-sheet"

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
const ODS = "application/vnd.oasis.opendocument.spreadsheet"

/** A minimal zip writer: each entry is deflated when `deflate` names it and stored otherwise. */
async function zip(files: Record<string, string>, deflate: string[] = []) {
  const entries = await Promise.all(Object.entries(files).map(async ([name, source]) => {
    const raw = new TextEncoder().encode(source)
    const data = deflate.includes(name)
      ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer())
      : raw
    return { name: new TextEncoder().encode(name), data, method: deflate.includes(name) ? 8 : 0, size: raw.length }
  }))
  const header = (size: number, write: (view: DataView) => void) => {
    const bytes = new Uint8Array(size)
    write(new DataView(bytes.buffer))
    return bytes
  }
  const locals = entries.map((entry) => [header(30, (view) => {
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(8, entry.method, true)
    view.setUint32(18, entry.data.length, true)
    view.setUint32(22, entry.size, true)
    view.setUint16(26, entry.name.length, true)
  }), entry.name, entry.data])
  const offsets = locals.map((parts, index) => locals.slice(0, index).flat().reduce((total, part) => total + part.length, 0))
  const central = entries.map((entry, index) => [header(46, (view) => {
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(10, entry.method, true)
    view.setUint32(20, entry.data.length, true)
    view.setUint32(24, entry.size, true)
    view.setUint16(28, entry.name.length, true)
    view.setUint32(42, offsets[index], true)
  }), entry.name])
  const body = locals.flat().reduce((total, part) => total + part.length, 0)
  const directory = central.flat().reduce((total, part) => total + part.length, 0)
  const end = header(22, (view) => {
    view.setUint32(0, 0x06054b50, true)
    view.setUint16(10, entries.length, true)
    view.setUint32(12, directory, true)
    view.setUint32(16, body, true)
  })
  return new Blob([...locals.flat(), ...central.flat(), end])
}

test("an xlsx preview reads the first sheet with shared, inline and boolean cells in their columns", async () => {
  const workbook = await zip({
    "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
      xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
      <sheet name="Data" sheetId="1" r:id="rId2"/><sheet name="Other" sheetId="2" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/>
      </Relationships>`,
    "xl/sharedStrings.xml": `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Name</t></si>
      <si><r><t>Ri</t></r><r><t>ch</t></r></si></sst>`,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row r="1"><c r="A1"><v>wrong sheet</v></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>Inline</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>42.5</v></c><c r="C2" t="b"><v>1</v></c></row>
      <row r="3"><c r="A3"/></row></sheetData></worksheet>`,
  }, ["xl/worksheets/sheet2.xml", "xl/sharedStrings.xml"])
  expect(await sheetRows(XLSX, workbook, 10)).toEqual([["Name", "", "Inline"], ["Rich", "42.5", "TRUE"]])
  expect(await sheetRows(XLSX, workbook, 1)).toEqual([["Name", "", "Inline"]])
})

test("an ods preview expands repeated cells and rows and drops trailing filler", async () => {
  const sheet = await zip({
    "content.xml": `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
      xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
      <office:body><office:spreadsheet><table:table table:name="One">
      <table:table-row><table:table-cell><text:p>a</text:p></table:table-cell>
        <table:table-cell table:number-columns-repeated="2"><text:p>b</text:p></table:table-cell>
        <table:table-cell table:number-columns-repeated="16384"/></table:table-row>
      <table:table-row table:number-rows-repeated="2"><table:table-cell><text:p>x</text:p><text:p>y</text:p></table:table-cell></table:table-row>
      <table:table-row table:number-rows-repeated="1048570"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>
      </table:table><table:table table:name="Two"><table:table-row><table:table-cell><text:p>no</text:p></table:table-cell>
      </table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`,
  }, ["content.xml"])
  expect(await sheetRows(ODS, sheet, 10)).toEqual([["a", "b", "b"], ["x\ny"], ["x\ny"]])
  expect(await sheetRows(ODS, sheet, 2)).toHaveLength(2)
})

test("csv keeps quoted delimiters and unknown or broken workbooks are not read", async () => {
  expect(await sheetRows("text/csv", new Blob(['a,"b,c"\n"say ""hi""",d\n']), 10)).toEqual([["a", "b,c"], ['say "hi"', "d"]])
  expect(await sheetRows("application/vnd.ms-excel", new Blob(["x"]), 10)).toBeUndefined()
  expect(sheetRows(XLSX, new Blob(["not a zip"]), 10)).rejects.toThrow()
  expect(await sheetRows(XLSX, await zip({ "xl/workbook.xml": "<workbook/>" }), 10)).toBeUndefined()
})
