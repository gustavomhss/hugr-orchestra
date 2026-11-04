// Synthetic CLI receipts test the checker, not ast-grep. The real binary is a separate remote proof.
import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { prepare, check, evaluate, variantSources } from "./ast-utility.mjs"

const source = readFileSync(new URL("../../modules/atlas/packages/adapter-io/src/llm.ts", import.meta.url), "utf8")
const matrix = { stdio: [1, 1, 0, 1], splice: [1, 1, 1, 0] }
const variants = ["baseline", "control", "stdio-mutant", "splice-mutant"]
const position = (text) => ({ line: text.split("\n").length - 1, column: [...text.split("\n").at(-1)].length })

function match(text, file, query) {
  const start = text.indexOf(query === "stdio" ? "execFileSync(command.cmd, command.args as string[], {" : "if (blocks.length >")
  const ending = query === "stdio" ? "\n        })" : 'abstainReason: "answer-malformed:multi-response" } // ≥2 = splice'
  const end = text.indexOf(ending, start) + ending.length
  assert(start >= 0 && end > start, "synthetic receipt target exists")
  const body = text.slice(start, end)
  const leading = text.slice(text.lastIndexOf("\n", start - 1) + 1, start)
  const lineEnd = text.indexOf("\n", end)
  const trailing = text.slice(end, lineEnd < 0 ? text.length : lineEnd)
  return { file, text: body, language: "TypeScript", lines: leading + body + trailing,
    charCount: { leading: [...leading].length, trailing: [...trailing].length },
    range: { byteOffset: { start: Buffer.byteLength(text.slice(0, start)), end: Buffer.byteLength(text.slice(0, end)) },
      start: position(text.slice(0, start)), end: position(text.slice(0, end)) } }
}

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "atlas-ast-utility-")))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const manifest = prepare(dir)
  const sources = Object.fromEntries(variants.map((id) => [id, { file: join(dir, `${id}.ts`), text: readFileSync(join(dir, `${id}.ts`), "utf8") }]))
  const outputs = {}
  for (const query of Object.keys(matrix)) for (const [index, variant] of variants.entries()) {
    const rows = matrix[query][index] ? [match(sources[variant].text, sources[variant].file, query)] : []
    outputs[`${query}.${variant}`] = { code: rows.length ? "0\n" : "1\n", json: JSON.stringify(rows) }
  }
  const save = () => {
    writeFileSync(join(dir, "version.txt"), "ast-grep 0.51.1\n")
    writeFileSync(join(dir, "version.code"), "0\n")
    for (const [key, output] of Object.entries(outputs)) {
      writeFileSync(join(dir, `${key}.json`), output.json)
      writeFileSync(join(dir, `${key}.code`), output.code)
    }
  }
  save()
  return { dir, manifest, sources, outputs, save }
}

test("prepare copies real llm.ts; only designated mutations change its expressions; synthetic clean matrix passes", (t) => {
  const f = fixture(t)
  assert.equal(f.sources.baseline.text, source)
  assert.equal(f.sources["stdio-mutant"].text, source.replace('stdio: ["pipe", "pipe", "pipe"]', 'stdio: ["pipe", "pipe", "inherit"]'))
  assert.equal(f.sources["splice-mutant"].text, source.replace("if (blocks.length > 1)", "if (blocks.length > 2)"))
  assert.notEqual(f.sources.control.text, source)
  assert.deepEqual(f.manifest.queries.map((q) => variants.map((v) => q.expected[v])), Object.values(matrix))
  assert.deepEqual(check(f.dir), { ok: true, queries: 2, variants: 4 })
  assert.throws(() => prepare(f.dir), /output-not-empty/)
})

test("prepare target-cardinality refuses missing and duplicate target expressions", () => {
  assert.throws(() => variantSources(source.replace('stdio: ["pipe", "pipe", "pipe"]', "stdio: undefined")), /target-cardinality: stdio/)
  assert.throws(() => variantSources(source + '\nstdio: ["pipe", "pipe", "pipe"]'), /target-cardinality: stdio/)
  assert.throws(() => variantSources(source.replace("if (blocks.length > 1)", "if (blocks.length > 2)")), /target-cardinality: splice/)
  assert.throws(() => variantSources(source + '\nif (blocks.length > 1) return { claim: null, abstainReason: "answer-malformed:multi-response" }'), /target-cardinality: splice/)
})

for (const name of ["stdio.baseline.json", "splice.splice-mutant.code", "version.txt", "version.code", "manifest.json", "control.ts"]) {
  test(`missing evidence fails named: ${name}`, (t) => {
    const f = fixture(t)
    unlinkSync(join(f.dir, name))
    assert.throws(() => check(f.dir), /missing-(output|manifest|variant)/)
  })
}

test("swapped outputs belong to a different variant, even when both have one match", (t) => {
  const f = fixture(t)
  f.outputs["stdio.baseline"].json = f.outputs["stdio.control"].json
  f.save()
  assert.throws(() => check(f.dir), /match-file/)
})

for (const [name, json] of [["corrupt", "["], ["not-array", "{}"], ["schema", "[null]"]]) {
  test(`invalid JSON/schema fails named: ${name}`, (t) => {
    const f = fixture(t)
    f.outputs["stdio.baseline"].json = json
    f.save()
    assert.throws(() => check(f.dir), /invalid-(json|schema)/)
  })
}

for (const [name, change, reason] of [
  ["range", (m) => { m.range.byteOffset.end += 1 }, "match-range"],
  ["position", (m) => { m.range.start.column += 1 }, "match-position"],
  ["text", (m) => { m.text = "invented" }, "match-text"],
  ["language", (m) => { m.language = "JavaScript" }, "invalid-schema"],
  ["lines", (m) => { m.lines = "invented" }, "match-context"],
]) test(`invalid receipt ${name} fails named`, (t) => {
  const f = fixture(t)
  const rows = JSON.parse(f.outputs["stdio.baseline"].json)
  change(rows[0])
  f.outputs["stdio.baseline"].json = JSON.stringify(rows)
  f.save()
  assert.throws(() => check(f.dir), new RegExp(reason))
})

for (const code of ["2", "127", "-1", "garbage"]) test(`tool-error ${code} is not a failed claim`, (t) => {
  const f = fixture(t)
  f.outputs["stdio.stdio-mutant"].code = code
  f.save()
  assert.throws(() => check(f.dir), /tool-error/)
})

test("status/JSON disagreement, wrong version, and changed variant fail named", (t) => {
  const f = fixture(t)
  f.outputs["stdio.baseline"].code = "1"
  f.save()
  assert.throws(() => check(f.dir), /status-mismatch/)
  f.outputs["stdio.baseline"].code = "0"
  f.outputs["stdio.stdio-mutant"].code = "0"
  f.save()
  assert.throws(() => check(f.dir), /status-mismatch/)
  f.outputs["stdio.stdio-mutant"].code = "1"
  f.save()
  writeFileSync(join(f.dir, "version.txt"), "ast-grep 0.51.0\n")
  assert.throws(() => check(f.dir), /tool-version/)
  f.save()
  writeFileSync(join(f.dir, "version.code"), "2\n")
  assert.throws(() => check(f.dir), /tool-error: version/)
  f.save()
  writeFileSync(join(f.dir, "control.ts"), "const unrelated = true\n")
  assert.throws(() => check(f.dir), /variant-drift/)
})

test("more than one valid match is not the exact-one positive control", (t) => {
  const f = fixture(t)
  const rows = JSON.parse(f.outputs["stdio.baseline"].json)
  f.outputs["stdio.baseline"].json = JSON.stringify([...rows, ...rows])
  f.save()
  assert.throws(() => check(f.dir), /matrix-mismatch/)
})

for (const mode of ["alwaysholds", "neverholds", "cross-query-loss"]) test(`toothless or nonspecific matrix fails: ${mode}`, (t) => {
  const f = fixture(t)
  const variant = mode === "alwaysholds" ? "stdio-mutant" : mode === "neverholds" ? "baseline" : "splice-mutant"
  const rows = mode === "alwaysholds" ? [match(f.sources[variant].text, f.sources[variant].file, "stdio")] : []
  f.outputs[`stdio.${variant}`] = { code: rows.length ? "0" : "1", json: JSON.stringify(rows) }
  f.save()
  assert.throws(() => check(f.dir), /matrix-mismatch/)
})

for (const [name, change, reason] of [
  ["empty expected list", (m) => { m.queries = [] }, "empty-expected"],
  ["missing variant", (m) => { m.variants.pop() }, "missing-variant"],
  ["weakened matrix", (m) => { m.queries[0].expected["stdio-mutant"] = 1 }, "manifest-mismatch"],
]) test(`manifest refuses ${name}`, (t) => {
  const f = fixture(t)
  change(f.manifest)
  writeFileSync(join(f.dir, "manifest.json"), JSON.stringify(f.manifest))
  assert.throws(() => check(f.dir), new RegExp(reason))
})

test("in-memory checker mutation controls: matrix and tool-error checks each have teeth (no subprocess)", async (t) => {
  const f = fixture(t)
  const module = readFileSync(new URL("./ast-utility.mjs", import.meta.url), "utf8")
  for (const [needle, replacement, mutate] of [
    ['expect(rows.length === expected, "matrix-mismatch", key)', 'expect(true, "matrix-mismatch", key)', () => {
      f.outputs["stdio.stdio-mutant"] = { code: "0", json: JSON.stringify([match(f.sources["stdio-mutant"].text, f.sources["stdio-mutant"].file, "stdio")]) }
    }],
    ['expect(code === "0" || code === "1", "tool-error", key)', 'expect(true, "tool-error", key)', () => {
      f.outputs["stdio.stdio-mutant"] = { code: "2", json: "[]" }
    }],
  ]) {
    assert.equal(module.split(needle).length, 2, "checker mutation hits exactly once")
    mutate()
    assert.throws(() => evaluate(f.manifest, f.outputs, f.sources))
    const mutant = await import(`data:text/javascript;base64,${Buffer.from(module.replace(needle, replacement)).toString("base64")}`)
    assert.deepEqual(mutant.evaluate(f.manifest, f.outputs, f.sources), { ok: true, queries: 2, variants: 4 })
  }
})
