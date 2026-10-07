export * as Patch from "./patch"

export type Hunk =
  | { readonly type: "add"; readonly path: string; readonly contents: string }
  | { readonly type: "delete"; readonly path: string }
  | {
      readonly type: "update"
      readonly path: string
      readonly movePath?: string
      readonly chunks: ReadonlyArray<UpdateFileChunk>
    }

export interface UpdateFileChunk {
  readonly oldLines: ReadonlyArray<string>
  readonly newLines: ReadonlyArray<string>
  readonly changeContext?: string
  readonly endOfFile?: boolean
}

export interface FileUpdate {
  readonly content: string
  readonly bom: boolean
}

/**
 * The one apply_patch grammar. The apply_patch tools apply the hunks it returns and ToolSafety checks their paths,
 * so a patch either reaches the files exactly as it was checked or is rejected by both. Every line between the
 * markers is read: a line that fits nowhere fails the patch instead of being skipped.
 */
export function parse(patchText: string): ReadonlyArray<Hunk> {
  const lines = stripHeredoc(patchText.trim()).split("\n")
  // The last end marker closes the patch, so a context line that reads `*** End Patch` cannot cut it short
  const begin = lines.findIndex((line) => line.trim() === "*** Begin Patch")
  const end = lines.findLastIndex((line) => line.trim() === "*** End Patch")
  if (begin === -1 || end === -1 || begin >= end) throw new Error("Invalid patch format: missing Begin/End markers")

  const body = lines.slice(begin + 1, end)
  const hunks: Hunk[] = []
  let index = 0
  while (index < body.length) {
    const line = body[index]
    // Empty lines between file sections only separate them
    if (blank(line)) {
      index++
      continue
    }
    if (line.startsWith("*** Add File:")) {
      const path = target(line, "*** Add File:")
      const parsed = parseAdd(body, index + 1, path)
      hunks.push({ type: "add", path, contents: parsed.contents })
      index = parsed.next
      continue
    }
    if (line.startsWith("*** Delete File:")) {
      hunks.push({ type: "delete", path: target(line, "*** Delete File:") })
      index++
      continue
    }
    if (line.startsWith("*** Update File:")) {
      const path = target(line, "*** Update File:")
      const movePath = body[index + 1]?.startsWith("*** Move to:") ? target(body[index + 1], "*** Move to:") : undefined
      const parsed = parseUpdate(body, movePath === undefined ? index + 1 : index + 2, path)
      // Without hunk lines the file would be rewritten unchanged and still reported as modified; a bare Move to renames
      if (!movePath && parsed.chunks.every((chunk) => chunk.oldLines.length === 0 && chunk.newLines.length === 0))
        throw new Error(`*** Update File: ${path} has no hunk lines, so it would change nothing`)
      hunks.push({ type: "update", path, movePath, chunks: parsed.chunks })
      index = parsed.next
      continue
    }
    throw new Error(
      `Unexpected line '${line}': each file in a patch starts with *** Add File:, *** Update File: or *** Delete File:`,
    )
  }
  return hunks
}

export function derive(path: string, chunks: ReadonlyArray<UpdateFileChunk>, original: string): FileUpdate {
  const source = splitBom(original)
  const lines = source.text.split("\n")
  // Drop the empty element after the final newline so the array holds the file's lines
  if (lines.at(-1) === "") lines.pop()
  const replacements = computeReplacements(lines, path, chunks)
  const updated = [...lines]
  for (const [start, remove, insert] of replacements.toReversed()) updated.splice(start, remove, ...insert)
  if (updated.at(-1) !== "") updated.push("")
  const next = splitBom(updated.join("\n"))
  return { content: next.text, bom: source.bom || next.bom }
}

export function joinBom(text: string, bom: boolean) {
  const stripped = splitBom(text).text
  return bom ? `\uFEFF${stripped}` : stripped
}

function target(line: string, marker: string) {
  const path = line.slice(marker.length).trim()
  if (!path) throw new Error(`${marker} needs a path`)
  return path
}

function parseAdd(lines: ReadonlyArray<string>, start: number, path: string) {
  let next = start
  while (next < lines.length && !lines[next].startsWith("***")) next++
  // An empty line between `+` lines is an empty line of the new file; empty lines around them only separate sections
  const contents = trimEdges(lines.slice(start, next), blank).map((line) => {
    if (line.startsWith("+")) return line.slice(1)
    if (blank(line)) return ""
    throw new Error(`Unexpected line '${line}' in *** Add File: ${path}: every line of a new file starts with +`)
  })
  return { contents: contents.join("\n"), next }
}

function parseUpdate(lines: ReadonlyArray<string>, start: number, path: string) {
  const chunks: UpdateFileChunk[] = []
  let index = start
  while (index < lines.length && !lines[index].startsWith("***")) {
    // Empty lines before a hunk only separate it. A lone space is a blank context line that starts a hunk without
    // `@@`, but after `*** End of File` only an `@@` line can start one, so there it separates too.
    if (chunks.length > 0 ? blank(lines[index]) : bare(lines[index])) {
      index++
      continue
    }
    // Patches often leave out the first hunk's `@@` line, so those lines form a hunk without context.
    // Any later hunk starts here only after `*** End of File`, and it needs its own `@@` line.
    const header = lines[index].startsWith("@@")
    if (!header && chunks.length > 0)
      throw new Error(`Unexpected line '${lines[index]}' after *** End of File in ${path}: start the next hunk with @@`)
    const first = header ? index + 1 : index
    let next = first
    while (next < lines.length && !lines[next].startsWith("@@") && !lines[next].startsWith("***")) next++
    // `*** End of File` closes the hunk and anchors it to the end of the file
    const endOfFile = lines[next]?.trimEnd() === "*** End of File"
    chunks.push({
      ...parseHunk(lines.slice(first, next), path),
      changeContext: header ? lines[index].slice(2).trim() || undefined : undefined,
      endOfFile: endOfFile || undefined,
    })
    index = endOfFile ? next + 1 : next
  }
  return { chunks, next: index }
}

// An empty line between hunk lines is a blank context line whose leading space was lost, as Codex reads it.
// Empty lines before a hunk's first line or after its last one only separate it from its neighbours.
function parseHunk(run: ReadonlyArray<string>, path: string) {
  const lines = trimEdges(run, bare)
  const unexpected = lines.find((line) => !bare(line) && !/^[ +-]/.test(line))
  if (unexpected !== undefined)
    throw new Error(
      `Unexpected line '${unexpected}' in *** Update File: ${path}: hunk lines start with ' ' (context), '-' (remove) or '+' (add)`,
    )
  // With no context or removed line, an empty line would pin the hunk to a blank line of the file instead of
  // appending it, so the patch has to say whether the line is added or context
  if (lines.some(bare) && !lines.some((line) => line.startsWith(" ") || line.startsWith("-")))
    throw new Error(`Empty line between + lines in *** Update File: ${path}: write an added blank line as +`)
  const text = (line: string) => (bare(line) ? "" : line.slice(1))
  return {
    oldLines: lines.filter((line) => !line.startsWith("+")).map(text),
    newLines: lines.filter((line) => !line.startsWith("-")).map(text),
  }
}

function computeReplacements(lines: ReadonlyArray<string>, path: string, chunks: ReadonlyArray<UpdateFileChunk>) {
  const replacements: Array<readonly [start: number, remove: number, insert: ReadonlyArray<string>]> = []
  let lineIndex = 0
  for (const chunk of chunks) {
    if (chunk.changeContext) {
      const context = seek(lines, [chunk.changeContext], lineIndex)
      if (context === -1) throw new Error(`Failed to find context '${chunk.changeContext}' in ${path}`)
      lineIndex = context + 1
    }
    // A hunk with only `+` lines goes at the end of the file, before a final empty line
    if (chunk.oldLines.length === 0) {
      replacements.push([lines.at(-1) === "" ? lines.length - 1 : lines.length, 0, chunk.newLines])
      continue
    }
    let oldLines = chunk.oldLines
    let newLines = chunk.newLines
    let found = seek(lines, oldLines, lineIndex, chunk.endOfFile)
    // Retry without a trailing empty line, which may stand for the file's final newline
    if (found === -1 && oldLines.at(-1) === "") {
      oldLines = oldLines.slice(0, -1)
      if (newLines.at(-1) === "") newLines = newLines.slice(0, -1)
      found = seek(lines, oldLines, lineIndex, chunk.endOfFile)
    }
    if (found === -1) {
      const where = chunk.endOfFile ? "at the end of" : "in"
      throw new Error(`Failed to find expected lines ${where} ${path}:\n${chunk.oldLines.join("\n")}`)
    }
    replacements.push([found, oldLines.length, newLines])
    lineIndex = found + oldLines.length
  }
  return replacements.toSorted((left, right) => left[0] - right[0])
}

function seek(lines: ReadonlyArray<string>, pattern: ReadonlyArray<string>, start: number, eof = false) {
  if (pattern.length === 0) return -1
  for (const compare of [exact, rstrip, trim, normalized]) {
    // `*** End of File` anchors the hunk: it may only match the last lines of the file
    if (eof) {
      const offset = lines.length - pattern.length
      if (offset >= start && matches(lines, pattern, offset, compare)) return offset
      continue
    }
    for (let offset = start; offset <= lines.length - pattern.length; offset++) {
      if (matches(lines, pattern, offset, compare)) return offset
    }
  }
  return -1
}

function matches(
  lines: ReadonlyArray<string>,
  pattern: ReadonlyArray<string>,
  offset: number,
  compare: (left: string, right: string) => boolean,
) {
  return pattern.every((line, index) => compare(lines[offset + index], line))
}

const blank = (line: string) => line.trim() === ""
// A blank line without the context prefix; a lone space is a blank context line written out
const bare = (line: string) => blank(line) && !line.startsWith(" ")
const trimEdges = (lines: ReadonlyArray<string>, edge: (line: string) => boolean) => {
  const first = lines.findIndex((line) => !edge(line))
  return first === -1 ? [] : lines.slice(first, lines.findLastIndex((line) => !edge(line)) + 1)
}
const exact = (left: string, right: string) => left === right
const rstrip = (left: string, right: string) => left.trimEnd() === right.trimEnd()
const trim = (left: string, right: string) => left.trim() === right.trim()
const normalized = (left: string, right: string) => normalize(left.trim()) === normalize(right.trim())
const normalize = (value: string) =>
  value
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/\u00A0/g, " ")
const splitBom = (text: string) =>
  text.startsWith("\uFEFF") ? { bom: true, text: text.slice(1) } : { bom: false, text }
const stripHeredoc = (input: string) =>
  input.match(/^(?:cat\s+)?<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/)?.[2] ?? input
