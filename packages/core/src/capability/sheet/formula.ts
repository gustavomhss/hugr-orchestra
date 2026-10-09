import { DocumentWork } from "../document/work"

export function coordinate(address: string) {
  const match = /^(\$?)([A-Z]{1,3})(\$?)([1-9][0-9]{0,4})$/.exec(address)
  if (!match) throw DocumentWork.failure("unsupported_schema")
  const column = [...match[2]].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0)
  const row = Number(match[4])
  if (column > 256 || row > 10000) throw DocumentWork.failure("quota_exceeded")
  return { column, row, columnAbsolute: match[1], rowAbsolute: match[3] }
}
export function columnName(column: number): string {
  if (column < 1 || column > 256) throw DocumentWork.failure("quota_exceeded")
  return column > 26 ? columnName(Math.floor((column - 1) / 26)) + String.fromCharCode(65 + (column - 1) % 26)
    : String.fromCharCode(64 + column)
}

export function requireName(name: string) {
  if (/^[RC]$/i.test(name) || /^[A-Z]{1,3}[0-9]+$/i.test(name) || /^R(?:[0-9]+)?C(?:[0-9]+)?$/i.test(name))
    throw DocumentWork.failure("unsupported_schema")
}

/** Shared-formula expansion is qualified only for the same closed token grammar as edits. */
export function translate(value: string, master: string, target: string) {
  const from = coordinate(master)
  const to = coordinate(target)
  return formula(value).map((token) => {
    if (!/^\$?[A-Z]{1,3}\$?[1-9][0-9]*$/.test(token)) return token
    const point = coordinate(token)
    const row = point.row + (point.rowAbsolute ? 0 : to.row - from.row)
    const column = point.column + (point.columnAbsolute ? 0 : to.column - from.column)
    if (row < 1 || row > 10000 || column < 1 || column > 256) throw DocumentWork.failure("quota_exceeded")
    return `${point.columnAbsolute}${columnName(column)}${point.rowAbsolute}${row}`
  }).join("")
}

export function shiftedIndex(value: number, index: number, count: number, action: "insert" | "delete") {
  return action === "insert" ? value >= index ? value + count : value
    : value < index ? value : value >= index + count ? value - count : undefined
}

/** Closed grammar: local A1 refs/ranges, decimal numbers, arithmetic and SUM/AVERAGE/MIN/MAX/COUNT.
 * No strings, names, sheet qualifiers, DDE, external refs, dynamic arrays or external-action functions.
 */
export function formula(value: string) {
  const source = value.startsWith("=") ? value.slice(1) : value
  const state = { offset: 0, tokens: [] as string[], index: 0 }
  const token = /\s*(\$?[A-Z]{1,3}\$?[1-9][0-9]{0,4}(?![A-Z0-9_(])|SUM|AVERAGE|MIN|MAX|COUNT|#REF!|(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)|[+\-*/^():,])\s*/y
  while (state.offset < source.length) {
    token.lastIndex = state.offset
    const found = token.exec(source)
    if (!found) throw DocumentWork.failure("unsupported_schema")
    state.tokens.push(found[1])
    state.offset = token.lastIndex
  }
  const ref = (text: string | undefined) => text !== undefined && /^\$?[A-Z]{1,3}\$?[1-9][0-9]*$/.test(text)
  const primary = (depth: number): void => {
    if (depth > 32) throw DocumentWork.failure("quota_exceeded")
    const text = state.tokens[state.index++]
    if (text === "#REF!") return
    if (text === "+" || text === "-") return primary(depth + 1)
    if (text === "(") { expression(depth + 1); expect(")"); return }
    if (["SUM", "AVERAGE", "MIN", "MAX", "COUNT"].includes(text)) {
      expect("(")
      expression(depth + 1)
      while (state.tokens[state.index] === ",") { state.index++; expression(depth + 1) }
      expect(")")
      return
    }
    if (ref(text)) {
      coordinate(text)
      if (state.tokens[state.index] === ":") {
        state.index++
        const end = state.tokens[state.index++]
        if (!ref(end)) throw DocumentWork.failure("unsupported_schema")
        const startPoint = coordinate(text)
        const endPoint = coordinate(end)
        if (endPoint.row < startPoint.row || endPoint.column < startPoint.column) throw DocumentWork.failure("unsupported_schema")
      }
      return
    }
    if (text && /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(text) && Number.isFinite(Number(text))) return
    throw DocumentWork.failure("unsupported_schema")
  }
  const expression = (depth: number) => {
    primary(depth)
    while (["+", "-", "*", "/", "^"].includes(state.tokens[state.index])) { state.index++; primary(depth) }
  }
  const expect = (text: string) => { if (state.tokens[state.index++] !== text) throw DocumentWork.failure("unsupported_schema") }
  expression(0)
  if (state.index !== state.tokens.length) throw DocumentWork.failure("unsupported_schema")
  return state.tokens
}

export function shift(value: string, axis: "rows" | "columns", index: number, count: number, action: "insert" | "delete") {
  const tokens = formula(value)
  const point = (n: number) => shiftedIndex(n, index, count, action)
  const render = (original: string, n: number | undefined) => {
    if (n === undefined) return "#REF!"
    const old = coordinate(original)
    const row = axis === "rows" ? n : old.row
    const col = axis === "columns" ? n : old.column
    if (row > 10000 || col > 256) throw DocumentWork.failure("quota_exceeded")
    return `${old.columnAbsolute}${columnName(col)}${old.rowAbsolute}${row}`
  }
  const skipped = new Set<number>()
  return tokens.flatMap((token, i) => {
    if (skipped.has(i)) return []
    if (!/^\$?[A-Z]{1,3}\$?[1-9][0-9]*$/.test(token)) return [token]
    const old = coordinate(token)
    const n = axis === "rows" ? old.row : old.column
    const partner = tokens[i + 1] === ":" ? tokens[i + 2] : undefined
    if (!partner) return [render(token, point(n))]
    skipped.add(i + 1)
    skipped.add(i + 2)
    const other = coordinate(partner)
    const p = axis === "rows" ? other.row : other.column
    if (action === "insert") return [render(token, point(n)), ":", render(partner, point(p))]
    const start = Math.min(n, p) < index ? Math.min(n, p) : Math.min(n, p) >= index + count ? Math.min(n, p) - count : index
    const end = Math.max(n, p) < index ? Math.max(n, p) : Math.max(n, p) >= index + count ? Math.max(n, p) - count : index - 1
    return start > end ? ["#REF!"] : [render(token, start), ":", render(partner, end)]
  }).join("")
}
