// External, two-claim syntax experiment only. No model, subprocess, network, or persistable Check.
import { createHash } from "node:crypto"
import { readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { isDeepStrictEqual } from "node:util"

const SOURCE = "modules/atlas/packages/adapter-io/src/llm.ts"
const TOOL = { package: "@ast-grep/cli", version: "0.51.1" }
const VARIANTS = ["baseline", "control", "stdio-mutant", "splice-mutant"]
const STDIO = 'stdio: ["pipe", "pipe", "pipe"]'
const SPLICE = 'if (blocks.length > 1) return { claim: null, abstainReason: "answer-malformed:multi-response" }'
const CALL = "execFileSync(command.cmd, command.args as string[], {"
const QUERIES = [
  { id: "stdio", lang: "ts", pattern: 'execFileSync($CMD,$ARGS,{ $$$BEFORE,stdio:["pipe","pipe","pipe"],$$$AFTER });',
    expected: { baseline: 1, control: 1, "stdio-mutant": 0, "splice-mutant": 1 } },
  { id: "splice", lang: "ts", pattern: "if($BLOCKS.length>1) return {claim:null,abstainReason:'answer-malformed:multi-response'}",
    expected: { baseline: 1, control: 1, "stdio-mutant": 1, "splice-mutant": 0 } },
]

function expect(condition, code, detail) {
  if (condition) return
  const error = new Error(`${code}: ${detail}`)
  error.code = code
  throw error
}

function replaceOnce(source, before, after, label) {
  expect(source.split(before).length === 2, "target-cardinality", label)
  return source.replace(before, after)
}

// These exact-text substitutions build fixtures of the pinned source, not a general TS detector.
// Only the external AST tool is asked whether the resulting syntax matches either claim.
export function variantSources(source) {
  replaceOnce(source, CALL, CALL, "execFileSync")
  const stdio = replaceOnce(source, STDIO, 'stdio: ["pipe", "pipe", "inherit"]', "stdio")
  const splice = replaceOnce(source, SPLICE, SPLICE.replace("> 1", "> 2"), "splice")
  const call = targetSpan(source, "stdio")
  const property = Buffer.byteLength(source.slice(0, source.indexOf(STDIO)))
  expect(property > call.start && property + Buffer.byteLength(STDIO) < call.end, "target-location", "stdio inside execFileSync")
  const control = "// ast-utility formatting/comment control; no behavior change\n" + source
    .replace(STDIO, 'stdio: [\n            "pipe",  "pipe",\n            "pipe"\n          ]')
    .replace(SPLICE, SPLICE.replace("> 1", ">\n    1"))
  return { baseline: source, control, "stdio-mutant": stdio, "splice-mutant": splice }
}

function manifestFor(sources) {
  return { schema: 1, source: SOURCE, tool: { ...TOOL }, queries: structuredClone(QUERIES),
    variants: VARIANTS.map((id) => ({ id, file: `${id}.ts`, sha256: createHash("sha256").update(sources[id].text).digest("hex") })) }
}

function outsideCheckout(directory) {
  const out = realpathSync(directory)
  const root = fileURLToPath(new URL("../../", import.meta.url))
  const local = relative(realpathSync(root), out)
  expect(isAbsolute(local) || local.startsWith(`..${sep}`), "output-inside-checkout", out)
  return out
}

function actualVariants() {
  return variantSources(readFileSync(new URL(`../../${SOURCE}`, import.meta.url), "utf8"))
}

export function prepare(directory) {
  const out = outsideCheckout(directory)
  expect(readdirSync(out).length === 0, "output-not-empty", out)
  const sources = Object.fromEntries(Object.entries(actualVariants()).map(([id, text]) => [id, { file: join(out, `${id}.ts`), text }]))
  const manifest = manifestFor(sources)
  for (const source of Object.values(sources)) writeFileSync(source.file, source.text, { flag: "wx" })
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" })
  return manifest
}

function readRequired(file, kind = "output") {
  try {
    return readFileSync(file, "utf8")
  } catch (error) {
    expect(false, error.code === "ENOENT" ? `missing-${kind}` : "read-error", file)
  }
}

function parseJSON(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    expect(false, "invalid-json", label)
  }
}

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
const natural = (value) => Number.isSafeInteger(value) && value >= 0
const position = (prefix) => ({ line: prefix.split("\n").length - 1, column: [...prefix.split("\n").at(-1)].length })

function targetSpan(text, query) {
  const start = text.indexOf(query === "stdio" ? CALL : "if (blocks.length >")
  const ending = query === "stdio" ? "\n        })" : 'abstainReason: "answer-malformed:multi-response" }'
  const close = text.indexOf(ending, start)
  expect(start >= 0 && close >= start, "target-range", query)
  return { start: Buffer.byteLength(text.slice(0, start)), end: Buffer.byteLength(text.slice(0, close + ending.length)) }
}

function validateMatch(match, source, query, key) {
  expect(record(match) && match.language === "TypeScript" && typeof match.file === "string" &&
    typeof match.text === "string" && match.text.length > 0 && record(match.range) &&
    record(match.range.byteOffset) && record(match.range.start) && record(match.range.end) &&
    typeof match.lines === "string" && record(match.charCount) &&
    natural(match.charCount.leading) && natural(match.charCount.trailing), "invalid-schema", key)
  expect(match.file === source.file, "match-file", key)
  const range = match.range.byteOffset
  const bytes = Buffer.from(source.text, "utf8")
  expect(natural(range.start) && natural(range.end) && range.start < range.end && range.end <= bytes.length &&
    isDeepStrictEqual(range, targetSpan(source.text, query)), "match-range", key)
  expect(match.text === bytes.subarray(range.start, range.end).toString("utf8"), "match-text", key)
  expect(isDeepStrictEqual(match.range.start, position(bytes.subarray(0, range.start).toString("utf8"))) &&
    isDeepStrictEqual(match.range.end, position(bytes.subarray(0, range.end).toString("utf8"))), "match-position", key)
  const chars = [...match.lines]
  expect(chars.length === match.charCount.leading + [...match.text].length + match.charCount.trailing &&
    chars.slice(match.charCount.leading, chars.length - match.charCount.trailing).join("") === match.text, "match-context", key)
}

// In-memory receipt evaluation is independently mutation-probed in the test file; it never runs ast-grep.
export function evaluate(manifest, outputs, sources) {
  expect(Array.isArray(manifest?.queries) && manifest.queries.length > 0, "empty-expected", "queries")
  expect(Array.isArray(manifest.variants) && isDeepStrictEqual(manifest.variants.map((v) => v?.id), VARIANTS), "missing-variant", "manifest")
  expect(record(sources) && isDeepStrictEqual(Object.keys(sources), VARIANTS), "missing-variant", "sources")
  for (const id of VARIANTS) expect(record(sources[id]) && typeof sources[id].text === "string" &&
    typeof sources[id].file === "string" && isAbsolute(sources[id].file) && basename(sources[id].file) === `${id}.ts` &&
    dirname(sources[id].file) === dirname(sources.baseline.file), "invalid-source", id)
  expect(isDeepStrictEqual(manifest, manifestFor(sources)), "manifest-mismatch", "frozen queries/expected matrix/source hashes")
  expect(record(outputs), "missing-output", "results")
  for (const query of QUERIES) for (const variant of VARIANTS) {
    const key = `${query.id}.${variant}`
    const output = outputs[key]
    expect(record(output) && typeof output.code === "string" && typeof output.json === "string", "missing-output", key)
    const code = output.code.trim()
    expect(code === "0" || code === "1", "tool-error", key)
    const rows = parseJSON(output.json, key)
    expect(Array.isArray(rows), "invalid-schema", key)
    expect((code === "0") === (rows.length > 0), "status-mismatch", key)
    const expected = query.expected[variant]
    expect(rows.length === expected, "matrix-mismatch", key)
    for (const row of rows) validateMatch(row, sources[variant], query.id, key)
  }
  return { ok: true, queries: QUERIES.length, variants: VARIANTS.length }
}

export function check(directory) {
  const out = outsideCheckout(directory)
  const manifest = parseJSON(readRequired(join(out, "manifest.json"), "manifest"), "manifest")
  expect(readRequired(join(out, "version.code")).trim() === "0", "tool-error", "version")
  expect(readRequired(join(out, "version.txt")).trim() === `ast-grep ${TOOL.version}`, "tool-version", TOOL.version)
  const variants = actualVariants()
  const sources = Object.fromEntries(VARIANTS.map((id) => {
    const file = join(out, `${id}.ts`)
    const text = readRequired(file, "variant")
    expect(text === variants[id], "variant-drift", id)
    return [id, { file, text }]
  }))
  const outputs = Object.fromEntries(QUERIES.flatMap((q) => VARIANTS.map((v) => {
    const key = `${q.id}.${v}`
    return [key, { code: readRequired(join(out, `${key}.code`)), json: readRequired(join(out, `${key}.json`)) }]
  })))
  return evaluate(manifest, outputs, sources)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    expect(process.argv.length === 4 && ["prepare", "check"].includes(process.argv[2]), "usage", "ast-utility.mjs prepare|check <existing-empty-external-dir>")
    console.log(JSON.stringify(process.argv[2] === "prepare" ? prepare(process.argv[3]) : check(process.argv[3])))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
