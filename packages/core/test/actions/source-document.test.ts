import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { ActionsGraph } from "../../src/actions/source/graph"
import { diagnostics, limits, read } from "../../src/actions/source/document"

const source = (text: string) => Actions.Source.make({
  bindingID: Actions.BindingID.make("ab_source"), path: ".github/workflows/source.yml",
  ref: "immutable-ref", version: "immutable-blob", text, editable: false,
})

describe("bounded authoritative YAML source", () => {
  test("CRLF comments and unknown native keys remain byte-identical through parse", () => {
    const text = "# literal comment\r\non: push\r\njobs:\r\n  job:\r\n    unknown: {still: native}\r\n    steps: []\r\n"
    const input = Object.freeze(source(text))
    const graph = ActionsGraph.parse("github", input)
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(text)
    expect(graph.jobs[0].configuration).toMatchObject({ unknown: { still: "native" } })
  })

  test.each([
    ["duplicate keys", "on: push\njobs:\n  same: {steps: []}\n  same: {steps: []}\n", "yaml_DUPLICATE_KEY"],
    ["multiple documents", "on: push\njobs: {a: {steps: []}}\n---\njobs: {b: {steps: []}}\n", "yaml_MULTIPLE_DOCS"],
    ["malformed YAML", "jobs: [broken\n", "yaml_"],
    ["unresolved alias", "on: push\njobs: {a: *missing}\n", "yaml_alias"],
    ["prototype key", "on: push\njobs: {a: {__proto__: {polluted: true}}}\n", "unsafe_key"],
    ["constructor key", "on: push\njobs: {a: {env: {constructor: bad}}}\n", "unsafe_key"],
    ["collection key", "on: push\njobs: {a: { ? [a, b] : 1 }}\n", "yaml_KEY_TYPE"],
    ["unsafe scalar tag", "on: push\njobs: {a: {run: !!js/function 'function(){}'}}\n", "unsafe_tag"],
    ["unsafe collection tag", "on: push\njobs: {a: {env: !!set {x: null}}}\n", "unsafe_tag"],
    ["cyclic alias", "on: push\njobs: &jobs {a: {env: *jobs}}\n", "structure_limit"],
    ["nonfinite scalar", "on: push\njobs: {a: {timeout-minutes: .inf}}\n", "unsafe_document"],
    ["nonmapping document", "[one, two]\n", "unsafe_document"],
    ["YAML 1.1 override", "%YAML 1.1\n---\non: push\njobs: {a: {steps: []}}\n", "yaml_version"],
  ])("%s becomes named unresolved Graph, never opaque throw", (_, text, named) => {
    const input = Object.freeze(source(text))
    const graph = ActionsGraph.parse("github", input)
    expect(Schema.is(Actions.Graph)(graph)).toBe(true)
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(text)
    expect(graph.state).toBe("unresolved")
    expect(graph.diagnostics.some((message) => message.startsWith("source_unresolved:") && message.includes(named))).toBe(true)
  })

  test("99 repeated aliases permitted; weighted expansion and 101-alias syntax bounded", () => {
    const text = (aliases: number) => `on: push\nx: &x value\njobs:\n  a:\n    env:\n${Array.from({ length: aliases }, (_, i) => `      A${i}: *x`).join("\n")}\n    steps: []\n`
    expect(ActionsGraph.parse("github", source(text(limits.aliases - 1))).state).toBe("complete")
    expect(ActionsGraph.parse("github", source(text(limits.aliases))).diagnostics).toContain("source_unresolved:yaml_alias:unresolved or excessive alias expansion")
    const excess = ActionsGraph.parse("github", source(text(limits.aliases + 1)))
    expect(excess.state).toBe("unresolved")
    expect(excess.diagnostics).toContain("source_unresolved:alias_limit:maximum 100 aliases")
    const bomb = ActionsGraph.parse("github", source("on: push\na: &a [one, two]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]\njobs: {a: {env: [*c, *c]}}\n"))
    expect(bomb.state).toBe("unresolved")
    expect(bomb.diagnostics).toContain("source_unresolved:alias_limit:maximum 100 aliases")
  })

  test("source limit counts UTF-8 bytes and accepts exact 1 MiB comment-preserving input", () => {
    const base = "on: push\njobs: {a: {steps: []}}\n#"
    const exact = base + "x".repeat(limits.sourceBytes - new TextEncoder().encode(base).length)
    expect(ActionsGraph.parse("github", source(exact)).state).toBe("complete")
    const oversized = ActionsGraph.parse("github", source(exact + "x"))
    expect(oversized.state).toBe("unresolved")
    expect(oversized.source.text).toBe(exact + "x")
    expect(oversized.diagnostics).toContain("source_unresolved:source_limit:maximum 1048576 UTF-8 bytes")
    expect(ActionsGraph.parse("github", source(base + "é".repeat(limits.sourceBytes / 2))).state).toBe("unresolved")
  })

  test("nesting and node limits reject before JSON-schema recursion or expansion", () => {
    const deep = ActionsGraph.parse("github", source(`on: push\njobs: {a: {env: ${"[".repeat(70)}1${"]".repeat(70)}}}\n`))
    expect(deep.state).toBe("unresolved")
    expect(deep.diagnostics.some((message) => message.includes("precomposition_limit"))).toBe(true)
    const wide = ActionsGraph.parse("github", source(`on: push\njobs: {a: {env: [${"0,".repeat(50_001)}]}}\n`))
    expect(wide.state).toBe("unresolved")
    expect(wide.diagnostics).toContain("source_unresolved:precomposition_limit:maximum depth 64 and 50000 CST nodes")
  })

  test("diagnostics bounded in count and length, severity retained after truncation", () => {
    const graph = ActionsGraph.parse("github", source(`on: push\njobs:\n${Array.from({ length: 80 }, (_, i) => `  job${i}: {needs: missing${"x".repeat(500)}}`).join("\n")}\n`))
    expect(graph.state).toBe("unresolved")
    expect(graph.jobs).toHaveLength(80)
    expect(graph.diagnostics).toHaveLength(limits.diagnostics)
    expect(graph.diagnostics.every((message) => message.length <= limits.diagnosticLength)).toBe(true)
    expect(graph.diagnostics.at(-1)).toBe("source_partial:diagnostics_truncated")
  })

  test("upstream unresolved-source diagnostics/includes propagate without mutating caller metadata", () => {
    const input = Object.freeze({ ...source("on: push\njobs: {a: {steps: []}}\n"), diagnostics: Object.freeze(["external configuration missing"]), includes: Object.freeze(["remote.yml"]) })
    const graph = ActionsGraph.parse("github", input)
    expect(graph.source).toBe(input)
    expect(graph.state).toBe("partial")
    expect(graph.jobs.map((job) => job.id)).toEqual(["a"])
    expect(input.diagnostics).toEqual(["external configuration missing"])
    expect(graph.diagnostics).toContain("source_partial:source_diagnostic:external configuration missing")
  })

  test.each(["", "on: push\njobs:\n  job:\n    env:\n"])("wide mapping %s exhausts CST budget before composition", (prefix) => {
    const padding = prefix ? "      " : ""
    const text = prefix + Array.from({ length: 22_000 }, (_, index) => `${padding}key${index}: value`).join("\n")
    const report = diagnostics()
    expect(new TextEncoder().encode(text).length).toBeLessThan(limits.sourceBytes)
    expect(read(text, "github", report)).toBeUndefined()
    expect(report.work.cstNodes).toBe(limits.nodes + 1)
    expect(report.work.compositions).toBe(0)
    expect(report.items).toContain("source_unresolved:precomposition_limit:maximum depth 64 and 50000 CST nodes")
  })

  test("lexical budget stops a wide nested mapping before CST composition", () => {
    const text = "on: push\njobs:\n  job:\n    env:\n" + Array.from({ length: 26_000 }, (_, index) => `      key${index}: value`).join("\n")
    const report = diagnostics()
    expect(read(text, "github", report)).toBeUndefined()
    expect(report.work.lexemes).toBe(limits.lexemes + 1)
    expect(report.work.cstNodes).toBe(0)
    expect(report.work.compositions).toBe(0)
    expect(report.items).toContain("source_unresolved:precomposition_limit:maximum 200000 lexemes and depth 64")
  })

  test("ten thousand distinct mapping keys compose once with linear decoded-key validation", () => {
    const text = "on: push\njobs: {job: {steps: []}}\n" + Array.from({ length: 10_000 }, (_, index) => `key${index}: value`).join("\n")
    const report = diagnostics()
    const document = read(text, "github", report)
    expect(document?.value.key9999).toBe("value")
    expect(report.state()).toBe("complete")
    expect(report.work.compositions).toBe(1)
    expect(report.work.cstNodes).toBeLessThan(limits.nodes)
    expect(ActionsGraph.parse("github", source(text)).jobs.map((job) => job.id)).toEqual(["job"])
  })

  test.each([
    ["sequence key", "on: push\njobs: { ? [bad, key] : {steps: []}}\n", "yaml_KEY_TYPE"],
    ["alias key", "on: push\nx: &key job\njobs: {*key: {steps: []}}\n", "yaml_KEY_TYPE"],
    ["aliases", "on: push\nx: &x value\nvalues: [" + Array.from({ length: 101 }, () => "*x").join(",") + "]\n", "alias_limit"],
    ["nested collections", "on: push\nx: " + "[".repeat(70) + "0" + "]".repeat(70) + "\n", "precomposition_limit"],
  ])("%s rejected structurally before costly composition", (_, text, named) => {
    const report = diagnostics()
    expect(read(text, "github", report)).toBeUndefined()
    expect(report.work.compositions).toBe(0)
    expect(report.items.some((message) => message.includes(named))).toBe(true)
  })

  test("scalar numeric-looking keys retain spelling; quoted and escaped equivalents reject as duplicates", () => {
    const graph = ActionsGraph.parse("github", source("on: push\njobs:\n  1: {steps: []}\n  01: {steps: []}\n  true: {steps: []}\n"))
    expect(graph.state).toBe("complete")
    expect(graph.jobs.map((job) => job.id)).toEqual(["1", "01", "true"])
    const duplicate = ActionsGraph.parse("github", source('on: push\njobs:\n  1: {steps: []}\n  "\\u0031": {steps: []}\n'))
    expect(duplicate.state).toBe("unresolved")
    expect(duplicate.diagnostics.some((message) => message.includes("yaml_DUPLICATE_KEY"))).toBe(true)
    const nested = ActionsGraph.parse("github", source('on: push\njobs: {job: {env: {foo: first, "\\u0066oo": second}}}\n'))
    expect(nested.state).toBe("unresolved")
    expect(nested.diagnostics.some((message) => message.includes("yaml_DUPLICATE_KEY"))).toBe(true)
  })

  test("20k blank plus 20k indented-comment witness rejects before any Parser.next/end or composition", () => {
    const text = "on: push" + "\n".repeat(20_000) + "# unindented comment\n" + "  # indented comment\n".repeat(20_000)
      + "jobs: {job: {steps: []}}\n"
    const report = diagnostics()
    expect(new TextEncoder().encode(text).length).toBeLessThan(limits.sourceBytes)
    expect(read(text, "github", report)).toBeUndefined()
    expect(report.work.triviaPeak).toBe(limits.trivia + 1)
    expect(report.work.lexemes).toBeLessThan(limits.lexemes)
    expect(report.work.parserNext).toBe(0)
    expect(report.work.parserEnd).toBe(0)
    expect(report.work.cstNodes).toBe(0)
    expect(report.work.compositions).toBe(0)
    expect(report.items).toEqual([`source_unresolved:trivia_limit:maximum 1024 consecutive trivia lexemes; offset ${8 + limits.trivia}`])
    const input = Object.freeze(source(text))
    const graph = ActionsGraph.parse("github", input)
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(text)
    expect(graph.state).toBe("unresolved")
    expect(graph.diagnostics).toEqual(report.items)
  })

  test("trivia boundary permits 1024 lexemes; first excess stops all parser calls", () => {
    const text = "on: push" + "\n".repeat(limits.trivia) + "jobs: {job: {steps: []}}\n"
    const accepted = diagnostics()
    expect(read(text, "github", accepted)?.value.on).toBe("push")
    expect(accepted.work.triviaPeak).toBe(limits.trivia)
    expect(accepted.work.parserNext).toBe(accepted.work.lexemes)
    expect(accepted.work.parserNext).toBeGreaterThan(0)
    expect(accepted.work.parserEnd).toBe(1)
    expect(accepted.work.compositions).toBe(1)
    expect(accepted.state()).toBe("complete")
    const rejected = diagnostics()
    expect(read("on: push" + "\n".repeat(limits.trivia + 1) + "jobs: {job: {steps: []}}\n", "github", rejected)).toBeUndefined()
    expect(rejected.work.parserNext).toBe(0)
    expect(rejected.work.parserEnd).toBe(0)
    expect(rejected.work.compositions).toBe(0)
    expect(rejected.items.some((message) => message.includes("trivia_limit"))).toBe(true)
  })

  test("legitimate comments, hash strings and CRLF retain raw source and actual parsing calls", () => {
    const text = "# workflow comment\r\non: push\r\njobs:\r\n" + "  # indented job comment\r\n".repeat(80)
      + "  job:\r\n    env: {HASH: '# literal hash', URL: 'https://example.test/#fragment'}\r\n    steps:\r\n      - run: 'echo # literal script'\r\n"
    const report = diagnostics()
    expect(read(text, "github", report)?.value.jobs).toMatchObject({ job: {
      env: { HASH: "# literal hash", URL: "https://example.test/#fragment" }, steps: [{ run: "echo # literal script" }],
    } })
    expect(report.work.parserNext).toBe(report.work.lexemes)
    expect(report.work.parserEnd).toBe(1)
    expect(report.work.compositions).toBe(1)
    expect(report.work.triviaPeak).toBeLessThan(limits.trivia)
    const input = Object.freeze(source(text))
    const graph = ActionsGraph.parse("github", input)
    expect(graph.state).toBe("complete")
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(text)
  })

  test("block scalar contents exceed trivia cap as data, not comment/whitespace tokens", () => {
    const script = "# literal script data\n".repeat(limits.trivia + 1) + "\n".repeat(limits.trivia + 1) + "done\n"
    const text = "on: push\njobs:\n  job:\n    steps:\n      - run: |+\n"
      + script.split("\n").slice(0, -1).map((line) => `          ${line}`).join("\n") + "\n"
    const report = diagnostics()
    expect(read(text, "github", report)?.value.jobs).toMatchObject({ job: { steps: [{ run: script }] } })
    expect(report.state()).toBe("complete")
    expect(report.work.parserNext).toBe(report.work.lexemes)
    expect(report.work.compositions).toBe(1)
    expect(report.work.triviaPeak).toBeLessThan(limits.trivia)
    expect(ActionsGraph.parse("github", source(text)).source.text).toBe(text)
  })

  test("multiline quoted scalar comments remain scalar data despite more than 1024 hash lines", () => {
    const text = "on: push\njobs:\n  job:\n    env:\n      HASH: 'start\n" + "        # quoted data\n".repeat(limits.trivia + 1)
      + "        end'\n    steps: []\n"
    const report = diagnostics()
    expect(read(text, "github", report)?.value.jobs).toMatchObject({ job: { steps: [] } })
    expect(report.state()).toBe("complete")
    expect(report.work.parserNext).toBe(report.work.lexemes)
    expect(report.work.compositions).toBe(1)
    expect(report.work.triviaPeak).toBeLessThan(limits.trivia)
    expect(ActionsGraph.parse("github", source(text)).source.text).toBe(text)
  })

  test("comments and CRLF preserve duplicate-key offset in original source", () => {
    const text = "# Unicode provenance 🌍\r\non: push\r\njobs:\r\n  job:\r\n    env:\r\n      KEY: first\r\n"
      + "      # retained comment\r\n".repeat(20) + "      KEY: second\r\n    steps: []\r\n"
    const input = Object.freeze(source(text))
    const graph = ActionsGraph.parse("github", input)
    expect(graph.source).toBe(input)
    expect(graph.source.text).toBe(text)
    expect(graph.state).toBe("unresolved")
    expect(graph.diagnostics).toEqual([`source_unresolved:yaml_DUPLICATE_KEY:offset ${text.indexOf("KEY: second")}`])
  })
})
