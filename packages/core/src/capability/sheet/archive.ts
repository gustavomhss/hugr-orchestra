import { inflateRawSync } from "node:zlib"
import { DocumentWork } from "../document/work"

/** ZIP identity/integrity admission, before any XML or workbook interpretation. No ZIP64, multi-disk or name overrides. */
export function* entries(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let end = data.length - 22
  while (end >= Math.max(0, data.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0 || end < data.length - 65557 || end + 22 + view.getUint16(end + 20, true) !== data.length ||
    view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== view.getUint16(end + 10, true))
    throw DocumentWork.failure("unsupported_schema")
  const count = view.getUint16(end + 10, true)
  if (count > 1024) throw DocumentWork.failure("quota_exceeded")
  const directory = view.getUint32(end + 16, true)
  if (directory + view.getUint32(end + 12, true) !== end) throw DocumentWork.failure("unsupported_schema")
  const budget = { offset: directory, inflated: 0 }
  const seen = new Set<string>()
  const records: { name: string; local: number; start: number; end: number; compressed: number; size: number; method: number; crc: number }[] = []
  for (let i = 0; i < count; i++) {
    const offset = budget.offset
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw DocumentWork.failure("unsupported_schema")
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const length = view.getUint16(offset + 28, true)
    const extra = view.getUint16(offset + 30, true)
    const next = offset + 46 + length + extra + view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    const crc = view.getUint32(offset + 16, true)
    if (next > end || local + 30 > directory || view.getUint32(local, true) !== 0x04034b50 || view.getUint16(offset + 34, true))
      throw DocumentWork.failure("unsupported_schema")
    if (flags & ~0x0808 || ![0, 8].includes(method) || compressed === 0xffffffff || size === 0xffffffff)
      throw DocumentWork.failure("unsupported_operation")
    if (view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || view.getUint16(local + 26, true) !== length)
      throw DocumentWork.failure("unsupported_schema")
    const localExtra = view.getUint16(local + 28, true)
    const start = local + 30 + length + localExtra
    if (start + compressed > directory) throw DocumentWork.failure("unsupported_schema")
    const encoded = data.subarray(offset + 46, offset + 46 + length)
    if (!encoded.every((byte, index) => byte === data[local + 30 + index])) throw DocumentWork.failure("unsupported_schema")
    const name = new TextDecoder("utf-8", { fatal: true }).decode(encoded)
    // JSZip adds a slash for the DOS directory attribute. Require that effective spelling already be canonical.
    if ((view.getUint32(offset + 38, true) & 0x10) && !name.endsWith("/")) throw DocumentWork.failure("unsupported_schema")
    const segments = (name.endsWith("/") ? name.slice(0, -1) : name).split("/")
    if (!name || name.includes("\\") || name.includes("\0") || name.includes(":") || segments.some((part) => !part || part === "." || part === "..") || seen.has(name))
      throw DocumentWork.failure("unsupported_schema")
    seen.add(name)
    requireExtras(view, offset + 46 + length, extra)
    requireExtras(view, local + 30 + length, localExtra)
    const localCRC = view.getUint32(local + 14, true)
    const localCompressed = view.getUint32(local + 18, true)
    const localSize = view.getUint32(local + 22, true)
    const descriptor = !!(flags & 8)
    if (descriptor ? localCRC !== 0 && localCRC !== crc || localCompressed !== 0 && localCompressed !== compressed || localSize !== 0 && localSize !== size
      : localCRC !== crc || localCompressed !== compressed || localSize !== size) throw DocumentWork.failure("unsupported_schema")
    const payloadEnd = start + compressed
    const descriptorBytes = descriptor ? descriptorSize(view, payloadEnd, directory, crc, compressed, size) : 0
    budget.inflated += size
    if (budget.inflated > DocumentWork.limits.inflated) throw DocumentWork.failure("quota_exceeded")
    records.push({ name, local, start, end: payloadEnd + descriptorBytes, compressed, size, method, crc })
    budget.offset = next
  }
  if (budget.offset !== end) throw DocumentWork.failure("unsupported_schema")
  const sorted = [...records].sort((a, b) => a.local - b.local)
  if (sorted.some((record, index) => index > 0 && sorted[index - 1].end > record.local)) throw DocumentWork.failure("unsupported_schema")
  for (const record of records) {
    const raw = data.subarray(record.start, record.start + record.compressed)
    const content = record.method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: Math.max(1, record.size) })
    if (content.length !== record.size || Bun.hash.crc32(content) !== record.crc) throw DocumentWork.failure("unsupported_schema")
    yield { name: record.name, data: content }
  }
}

function requireExtras(view: DataView, start: number, length: number) {
  const end = start + length
  let offset = start
  while (offset < end) {
    if (offset + 4 > end) throw DocumentWork.failure("unsupported_schema")
    const id = view.getUint16(offset, true)
    const size = view.getUint16(offset + 2, true)
    if (offset + 4 + size > end) throw DocumentWork.failure("unsupported_schema")
    if (id === 0x7075 || id === 0x0001) throw DocumentWork.failure("unsupported_operation")
    offset += 4 + size
  }
}

function descriptorSize(view: DataView, start: number, limit: number, crc: number, compressed: number, size: number) {
  if (start + 16 <= limit && view.getUint32(start, true) === 0x08074b50 && view.getUint32(start + 4, true) === crc &&
    view.getUint32(start + 8, true) === compressed && view.getUint32(start + 12, true) === size) return 16
  if (start + 12 <= limit && view.getUint32(start, true) === crc && view.getUint32(start + 4, true) === compressed &&
    view.getUint32(start + 8, true) === size) return 12
  throw DocumentWork.failure("unsupported_schema")
}
