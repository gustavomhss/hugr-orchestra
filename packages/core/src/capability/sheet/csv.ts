import { DocumentWork } from "../document/work"

/** RFC 4180 quoting with an explicit UTF-8 delimiter; no type inference or spreadsheet evaluation. */
export function parse(data: Uint8Array, delimiter: string) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data)
  const rows: string[][] = []
  const state = { field: "", row: [] as string[], quoted: false, closed: false, cells: 0 }
  const field = () => {
    if (++state.cells > DocumentWork.limits.cells || state.field.length > 4096 || state.row.length >= 256)
      throw DocumentWork.failure("quota_exceeded")
    state.row.push(state.field)
    state.field = ""
    state.closed = false
  }
  const row = () => { field(); rows.push(state.row); state.row = [] }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (state.quoted) {
      if (char === '"' && text[i + 1] === '"') { state.field += '"'; i++; continue }
      if (char === '"') { state.quoted = false; state.closed = true; continue }
      state.field += char
      if (state.field.length > 4096) throw DocumentWork.failure("quota_exceeded")
      continue
    }
    if (char === delimiter) { field(); continue }
    if (char === "\r" || char === "\n") { row(); if (char === "\r" && text[i + 1] === "\n") i++; continue }
    if (state.closed) throw DocumentWork.failure("unsupported_schema")
    if (char === '"') {
      if (state.field.length) throw DocumentWork.failure("unsupported_schema")
      state.quoted = true
      continue
    }
    state.field += char
    if (state.field.length > 4096) throw DocumentWork.failure("quota_exceeded")
  }
  if (state.quoted) throw DocumentWork.failure("unsupported_schema")
  if (state.field.length || state.row.length || state.closed) row()
  return rows
}

export function encode(rows: readonly (readonly string[])[], delimiter: string) {
  if (rows.reduce((n, row) => n + row.length, 0) > DocumentWork.limits.cells) throw DocumentWork.failure("quota_exceeded")
  const data = new TextEncoder().encode(rows.map((row) => row.map((cell) =>
    cell.includes(delimiter) || /["\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell).join(delimiter)).join("\r\n") + (rows.length ? "\r\n" : ""))
  if (data.byteLength > DocumentWork.limits.bytes || JSON.stringify(parse(data, delimiter)) !== JSON.stringify(rows))
    throw DocumentWork.failure("outcome_unknown")
  return data
}
