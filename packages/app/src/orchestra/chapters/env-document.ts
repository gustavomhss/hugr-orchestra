export type EnvLine = {
  raw: string
  assignment?: { key: string; value: string; prefix: string; suffix: string; eol: string }
}

export function parseEnv(source: string): EnvLine[] {
  const lines: EnvLine[] = []
  // Retain a UTF-8 BOM as its own source segment, including after all keys are removed.
  const start = source.startsWith("\uFEFF") ? 1 : 0
  if (start) lines.push({ raw: "\uFEFF" })
  for (let offset = start; offset < source.length; ) {
    const end = source.indexOf("\n", offset)
    const stop = end < 0 ? source.length : end + 1
    const match = /^([ \t]*(?:export[ \t]+)?)([A-Za-z_][A-Za-z0-9_]*)([ \t]*=[ \t]*)/.exec(source.slice(offset, stop))
    if (!match) {
      lines.push({ raw: source.slice(offset, stop) })
      offset = stop
      continue
    }
    const begin = offset + match[0].length
    const quote = source[begin]
    const quoted = quote === '"' || quote === "'"
    let close = begin
    if (quoted) {
      close++
      while (close < source.length) {
        if (quote === '"' && source[close] === "\\") {
          close += 2
          continue
        }
        if (source[close] === quote) break
        if (quote === "'" && /[\r\n]/.test(source[close]!)) break
        close++
      }
    }
    const finish =
      quoted && source[close] === quote
        ? source.indexOf("\n", close)
        : quote === '"' && close >= source.length
          ? -1
          : end
    const limit = finish < 0 ? source.length : finish + 1
    const raw = source.slice(offset, limit)
    const eol = raw.endsWith("\r\n") ? "\r\n" : raw.endsWith("\n") ? "\n" : ""
    const tail = source.slice(quoted ? close + 1 : begin, limit - eol.length)
    const valid = !quoted || (source[close] === quote && /^[ \t]*(?:#.*)?$/.test(tail))
    // Unknown syntax remains opaque; never reinterpret or drop it.
    if (!valid) {
      lines.push({ raw })
      offset = limit
      continue
    }
    const unquoted = quoted ? undefined : /^([^#]*?)([ \t]*(?:#.*)?)$/.exec(tail)
    if (!quoted && !unquoted) {
      lines.push({ raw })
      offset = limit
      continue
    }
    const value = quoted
      ? quote === "'"
        ? source.slice(begin + 1, close)
        : source
            .slice(begin + 1, close)
            .replace(/\\([nrt"\\])/g, (_, char: string) => ({ n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" })[char]!)
      : unquoted![1]!
    lines.push({
      raw,
      assignment: {
        key: match[2]!,
        value,
        prefix: match[1]!,
        suffix: quoted ? tail : unquoted![2]!,
        eol,
      },
    })
    offset = limit
  }
  return lines
}

export function serializeEnv(lines: EnvLine[]) {
  return lines.map((line) => line.raw).join("")
}

export function envEntries(lines: EnvLine[]) {
  return {
    rows: lines.flatMap((line, index) => (line.assignment ? [{ index, assignment: line.assignment }] : [])),
    preserved: lines
      .filter((line) => !line.assignment && line.raw.trim() && !line.raw.trimStart().startsWith("#"))
      .reduce((count, line) => count + line.raw.split("\n").length - Number(line.raw.endsWith("\n")), 0),
  }
}

export function writeEnv(
  lines: EnvLine[],
  index: number | undefined,
  key: string,
  value: string,
): { error: "invalid" | "duplicate" | "readonly" } | { lines: EnvLine[] } {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return { error: "invalid" }
  const previous = index === undefined ? undefined : lines[index]?.assignment
  if (previous?.key !== key && lines.some((line, i) => i !== index && line.assignment?.key === key))
    return { error: "duplicate" }
  if (index !== undefined && !previous) return { error: "readonly" }
  if (previous?.key === key && previous.value === value) return { lines }
  const encoded =
    '"' +
    value.replace(
      /[\\"\n\r\t]/g,
      (char) => ({ "\\": "\\\\", '"': '\\"', "\n": "\\n", "\r": "\\r", "\t": "\\t" })[char]!,
    ) +
    '"'
  const eol = previous?.eol ?? lines.find((line) => line.raw.endsWith("\n"))?.raw.match(/\r?\n$/)?.[0] ?? "\n"
  const replacement = parseEnv(`${previous?.prefix ?? ""}${key}=${encoded}${previous?.suffix ?? ""}${eol}`)[0]!
  if (index !== undefined) return { lines: lines.map((line, i) => (i === index ? replacement : line)) }
  const separator =
    lines.length && !serializeEnv(lines).endsWith("\n") && serializeEnv(lines) !== "\uFEFF" ? [{ raw: eol }] : []
  return { lines: [...lines, ...separator, replacement] }
}

export function removeEnv(lines: EnvLine[], index: number) {
  return lines.filter((line, i) => i !== index || !line.assignment)
}
