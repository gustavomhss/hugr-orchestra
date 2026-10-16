export * as Elf from "./elf.ts"

// Pure ELF64 byte admission shared by producers and packaged runtime loaders.
// No filesystem, process, platform detection or module loading at this boundary.
export function inspect(bytes: Uint8Array, label = "ELF bytes") {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const span = (offset: number, size: number) => {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > bytes.length)
      throw new Error(`ELF_TRUNCATED: ${label}`)
    return offset
  }
  span(0, 64)
  if (![127, 69, 76, 70, 2, 1, 1].every((value, i) => bytes[i] === value) || view.getUint16(54, true) !== 56 ||
      ![2, 3].includes(view.getUint16(16, true)) || view.getUint32(20, true) !== 1)
    throw new Error(`ELF64_UNSUPPORTED: ${label}`)
  const count = view.getUint16(56, true)
  if (!count) throw new Error(`ELF_PROGRAM_HEADERS_EMPTY: ${label}`)
  const start = span(Number(view.getBigUint64(32, true)), count * 56)
  const headers = Array.from({ length: count }, (_, i) => start + i * 56)
  const segments = headers.map((h) => {
    const size = view.getBigUint64(h + 32, true)
    const memory = view.getBigUint64(h + 40, true)
    const address = view.getBigUint64(h + 16, true)
    if (size > memory || address + memory > 0xffffffffffffffffn)
      throw new Error(`ELF_SEGMENT_MEMORY_INVALID: ${label}`)
    return { type: view.getUint32(h, true), offset: span(Number(view.getBigUint64(h + 8, true)), Number(size)),
      size: Number(size), memory, address }
  })
  const loads = segments.filter((s) => s.type === 1)
  if (!loads.length) throw new Error(`ELF_LOAD_SEGMENTS_EMPTY: ${label}`)
  if (loads.some((s, i) => loads.slice(i + 1).some((other) => s.memory > 0n && other.memory > 0n &&
      s.address < other.address + other.memory && other.address < s.address + s.memory)))
    throw new Error(`ELF_LOAD_MAPPING_AMBIGUOUS: ${label}`)
  const mapped = (address: bigint, size: bigint) => {
    if (size <= 0n || address + size > 0xffffffffffffffffn) throw new Error(`ELF_MAPPING_RANGE_INVALID: ${label}`)
    const matches = loads.filter((s) => address >= s.address && address + size <= s.address + s.memory)
    if (matches.length !== 1) throw new Error(`ELF_MAPPING_UNMAPPED: ${label}`)
    const load = matches[0]!
    if (address - load.address + size > BigInt(load.size)) throw new Error(`ELF_MAPPING_NOT_FILE_BACKED: ${label}`)
    return span(load.offset + Number(address - load.address), Number(size))
  }
  const strings = (offset: number, size: number) => {
    span(offset, size)
    const end = bytes.indexOf(0, offset)
    if (end < offset || end >= offset + size) throw new Error(`ELF_STRING_UNTERMINATED: ${label}`)
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes.subarray(offset, end))
  }
  const interpreters = segments.filter((s) => s.type === 3)
  if (interpreters.length > 1) throw new Error(`ELF_INTERPRETER_DUPLICATED: ${label}`)
  const interpreter = interpreters[0] ? strings(interpreters[0].offset, interpreters[0].size) : undefined
  const needed: bigint[] = []
  const tables: bigint[] = []
  const sizes: bigint[] = []
  const dynamics = segments.filter((s) => s.type === 2)
  if (dynamics.length > 1) throw new Error(`ELF_DYNAMIC_DUPLICATED: ${label}`)
  dynamics.forEach((s) => {
    if (!s.size || s.size % 16) throw new Error(`ELF_DYNAMIC_TRUNCATED: ${label}`)
    const offset = mapped(s.address, BigInt(s.size))
    if (offset !== s.offset) throw new Error(`ELF_DYNAMIC_OFFSET_MISMATCH: ${label}`)
    if (!loads.some((load) => s.address >= load.address && s.address + s.memory <= load.address + load.memory))
      throw new Error(`ELF_DYNAMIC_MEMORY_UNMAPPED: ${label}`)
    const entries = Array.from({ length: s.size / 16 }, (_, i) => offset + i * 16)
    const end = entries.findIndex((e) => view.getBigInt64(e, true) === 0n)
    if (end < 0) throw new Error(`ELF_DYNAMIC_UNTERMINATED: ${label}`)
    entries.slice(0, end).forEach((e) => {
      const tag = view.getBigInt64(e, true)
      if (tag === 1n) needed.push(view.getBigUint64(e + 8, true))
      if (tag === 5n) tables.push(view.getBigUint64(e + 8, true))
      if (tag === 10n) sizes.push(view.getBigUint64(e + 8, true))
    })
  })
  if ((tables.length || sizes.length || needed.length) && (tables.length !== 1 || sizes.length !== 1))
    throw new Error(`ELF_STRING_TABLE_INVALID: ${label}`)
  const table = tables.length ? mapped(tables[0]!, sizes[0]!) : undefined
  const dependencies = needed.map((n) => {
    if (table === undefined || n >= sizes[0]!) throw new Error(`ELF_STRING_TABLE_INVALID: ${label}`)
    return strings(table + Number(n), Number(sizes[0]! - n))
  })
  return { machine: view.getUint16(18, true), interpreter, needed: dependencies }
}

export function requireLibc(bytes: Uint8Array, expected: "musl" | "glibc", label = "ELF bytes") {
  const elf = inspect(bytes, label)
  const musl = elf.needed.some((name) => /^(?:libc\.musl-(?:x86_64|aarch64)\.so\.1|ld-musl-(?:x86_64|aarch64)\.so\.1|libc\.so)$/.test(name))
  const glibc = elf.needed.includes("libc.so.6")
  if (expected === "musl" ? !musl || glibc : !glibc || musl)
    throw new Error(`ELF_LIBC_MISMATCH: ${label}: expected ${expected}; needed ${JSON.stringify(elf.needed)}`)
  return elf
}
