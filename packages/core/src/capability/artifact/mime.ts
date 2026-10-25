import { Buffer, isUtf8 } from "node:buffer"
import { Option, Schema } from "effect"

// XML 1.0 name ranges; qualified names have at most one colon, with a legal name on each side.
const xmlStart = String.raw`[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\u{10000}-\u{EFFFF}]`
const xmlChar = xmlStart.slice(0, -1) + String.raw`\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]`
const xmlName = `${xmlStart}${xmlChar}*(?::${xmlStart}${xmlChar}*)?`

export function validMime(mime: string) {
  return typeof mime === "string" && mime.length <= 256 &&
    /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:; charset=utf-8)?(?![\s\S])/.test(mime)
}

/** Structural format checks only. Producers still need decoder/operation-specific verification. */
export function matchesMime(data: Uint8Array, mime: string) {
  if (!validMime(mime)) return false
  const type = mime.split(";")[0]
  if (type === "application/octet-stream") return mime === type
  if (["text/plain", "text/markdown", "text/html", "text/csv", "text/tab-separated-values",
    "text/css", "text/javascript", "application/javascript"].includes(type)) return isUtf8(data)
  if (["application/json", "application/ld+json", "application/problem+json"].includes(type))
    return isUtf8(data) && Option.isSome(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(new TextDecoder().decode(data)))
  if (["application/xml", "text/xml", "image/svg+xml"].includes(type)) {
    if (!isUtf8(data)) return false
    const text = new TextDecoder().decode(data).trim()
    const root = xmlRoot(text)
    return root !== undefined && (type !== "image/svg+xml" || root === "svg")
  }
  if (mime !== type) return false
  if (type === "application/pdf") {
    const header = Buffer.from(data.subarray(0, 16)).toString("latin1")
    const tail = Buffer.from(data.subarray(Math.max(0, data.length - 1024))).toString("latin1")
    return /^%PDF-[12]\.[0-9](?:\r\n|\r|\n)/.test(header) &&
      /startxref[ \t\r\n]+[0-9]+[ \t\r\n]+%%EOF[ \t\r\n\f]*(?![\s\S])/.test(tail)
  }
  if (type === "image/png") return png(data)
  if (type === "image/jpeg") return data.length >= 4 && starts(data, [255, 216, 255]) &&
    data[data.length - 2] === 255 && data[data.length - 1] === 217
  if (type === "image/gif") return data.length >= 14 && ["GIF87a", "GIF89a"].includes(ascii(data, 0, 6)) &&
    view(data).getUint16(6, true) > 0 && view(data).getUint16(8, true) > 0 &&
    data.length > 13 + ((data[10] & 128) ? 3 * 2 ** ((data[10] & 7) + 1) : 0) && data[data.length - 1] === 59
  if (type === "image/webp") return data.length >= 20 && ascii(data, 0, 4) === "RIFF" &&
    view(data).getUint32(4, true) + 8 === data.length && ascii(data, 8, 4) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(ascii(data, 12, 4)) &&
    view(data).getUint32(16, true) > 0 && view(data).getUint32(16, true) + 20 <= data.length
  if (["application/zip", "application/x-zip-compressed",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(type)) {
    const names = zipEntries(data)
    if (!names) return false
    if (type === "application/zip" || type === "application/x-zip-compressed") return true
    const document = type.endsWith("spreadsheetml.sheet") ? "xl/workbook.xml"
      : type.endsWith("wordprocessingml.document") ? "word/document.xml" : "ppt/presentation.xml"
    return names.includes("[Content_Types].xml") && names.includes(document)
  }
  return false
}

/** Bounded root lexical check, not a tree/decoder oracle. No DTD, custom entities or external resource resolution. */
function xmlRoot(input: string) {
  if (/<!(?:DOCTYPE|ENTITY)\b/i.test(input) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/u.test(input) ||
    /&(?!(?:amp|lt|gt|apos|quot|#[0-9]+|#x[0-9A-Fa-f]+);)/.test(input)) return undefined
  const declaration = input.startsWith("<?xml") ? input.indexOf("?>") : -1
  if (input.startsWith("<?xml") && (declaration < 0 || declaration > 1024 ||
    !/^<\?xml[ \t\r\n]+version=(["'])1\.[01]\1(?:[ \t\r\n]+encoding=(["'])(?:UTF-8|utf-8)\2)?(?:[ \t\r\n]+standalone=(["'])(?:yes|no)\3)?[ \t\r\n]*\?>(?![\s\S])/.test(input.slice(0, declaration + 2)))) return undefined
  const text = declaration < 0 ? input : input.slice(declaration + 2).trimStart()
  const header = text.slice(0, 64 * 1024)
  const root = new RegExp(`^<(${xmlName})(?=[ \\t\\r\\n/>])`, "u").exec(header)
  if (!root) return undefined
  const attribute = new RegExp(String.raw`[ \t\r\n]+(${xmlName})[ \t\r\n]*=[ \t\r\n]*(?:"[^"<]*"|'[^'<]*')`, "uy")
  const names = new Set<string>()
  let offset = root[0].length
  while (offset < header.length) {
    if (/^[ \t\r\n]*(?:\/>|>)/.test(header.slice(offset))) {
      const end = header.indexOf(">", offset)
      if (header[end - 1] === "/") return end + 1 === text.length ? root[1] : undefined
      const closing = text.lastIndexOf("</")
      return closing > end && text.slice(closing + 2).startsWith(root[1]) &&
        /^[ \t\r\n]*>(?![\s\S])/.test(text.slice(closing + 2 + root[1].length)) ? root[1] : undefined
    }
    attribute.lastIndex = offset
    const value = attribute.exec(header)
    if (!value || names.has(value[1])) return undefined
    names.add(value[1])
    offset = attribute.lastIndex
  }
  return undefined
}

function png(data: Uint8Array) {
  if (data.length < 45 || !starts(data, [137, 80, 78, 71, 13, 10, 26, 10]) ||
    view(data).getUint32(8) !== 13 || ascii(data, 12, 4) !== "IHDR") return false
  const bits = data[24]
  const color = data[25]
  if (!view(data).getUint32(16) || !view(data).getUint32(20) || data[26] !== 0 || data[27] !== 0 || data[28] > 1 ||
    !([0, 2, 3, 4, 6].includes(color)) ||
    !(color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [8, 16]).includes(bits)) return false
  let offset = 33
  let image = false
  while (offset + 12 <= data.length) {
    const size = view(data).getUint32(offset)
    const type = ascii(data, offset + 4, 4)
    if (size > data.length - offset - 12 || type === "IHDR") return false
    if (type === "IDAT" && size > 0) image = true
    if (type === "IEND") return image && size === 0 && offset + 12 === data.length
    offset += size + 12
  }
  return false
}

function zipEntries(data: Uint8Array) {
  if (data.length < 22 || !(starts(data, [80, 75, 3, 4]) || starts(data, [80, 75, 5, 6]))) return undefined
  const bytes = view(data)
  let end = data.length - 22
  while (end >= Math.max(0, data.length - 65557) && bytes.getUint32(end, true) !== 0x06054b50) end--
  if (end < Math.max(0, data.length - 65557) || end + 22 + bytes.getUint16(end + 20, true) !== data.length ||
    bytes.getUint16(end + 4, true) !== 0 || bytes.getUint16(end + 6, true) !== 0 ||
    bytes.getUint16(end + 8, true) !== bytes.getUint16(end + 10, true)) return undefined
  let offset = bytes.getUint32(end + 16, true)
  if (offset + bytes.getUint32(end + 12, true) !== end) return undefined
  const names: string[] = []
  for (let i = 0; i < bytes.getUint16(end + 10, true); i++) {
    if (offset + 46 > end || bytes.getUint32(offset, true) !== 0x02014b50) return undefined
    const length = bytes.getUint16(offset + 28, true)
    const next = offset + 46 + length + bytes.getUint16(offset + 30, true) + bytes.getUint16(offset + 32, true)
    const local = bytes.getUint32(offset + 42, true)
    if (next > end || local + 30 > offset || bytes.getUint32(local, true) !== 0x04034b50 ||
      bytes.getUint16(local + 26, true) !== length ||
      local + 30 + length + bytes.getUint16(local + 28, true) + bytes.getUint32(offset + 20, true) > offset) return undefined
    const name = data.subarray(offset + 46, offset + 46 + length)
    if (!isUtf8(name) || !name.every((byte, index) => byte === data[local + 30 + index])) return undefined
    names.push(new TextDecoder().decode(name))
    offset = next
  }
  return offset === end ? names : undefined
}

function view(data: Uint8Array) {
  return new DataView(data.buffer, data.byteOffset, data.byteLength)
}

function ascii(data: Uint8Array, offset: number, size: number) {
  return new TextDecoder().decode(data.subarray(offset, offset + size))
}

function starts(data: Uint8Array, signature: readonly number[]) {
  return signature.length <= data.length && signature.every((byte, index) => data[index] === byte)
}
