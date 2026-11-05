import { expect, test } from "bun:test"
import path from "path"
import { mkdir, readFile, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewPackAstGrep } from "../../src/review-toolkit/packs/ast-grep"
import { ReviewSarif } from "../../src/review-toolkit/sarif"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const fixtureRoot = path.join(import.meta.dir, "../fixture/lucy-astgrep")
const missing = `conformance-missing: ast-grep ${ReviewPackAstGrep.manifest.version} is not installed; a review does not install it`

const held = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (made) => Effect.promise(() => made[Symbol.asyncDispose]()),
)

test("normalizes ast-grep JSON to one-based rule, path and message", () => {
  const text = JSON.stringify([{
    text: "eval(input)",
    range: {
      byteOffset: { start: 14, end: 25 },
      start: { line: 1, column: 0 },
      end: { line: 1, column: 11 },
    },
    file: "/repo/src/match.js",
    lines: "eval(input)",
    charCount: { leading: 0, trailing: 0 },
    language: "JavaScript",
    ruleId: "lucy-js-eval",
    severity: "info",
    note: null,
    message: "direct eval",
  }])
  const parsed = ReviewSarif.parseJson(ReviewPackAstGrep.parserId, text, { pack: "ast-grep", root: "/repo" })
  expect(parsed).toEqual({
    status: "ok",
    results: [{
      pack: "ast-grep",
      rule: "lucy-js-eval",
      path: "src/match.js",
      line: 2,
      endLine: 2,
      snippet: "eval(input)",
      message: "direct eval",
      suppressions: [],
    }],
    excluded: [],
  })
})

test("an unreadable ast-grep report is an acquisition error, never a pass", () => {
  expect(ReviewSarif.parseJson(ReviewPackAstGrep.parserId, "not json", { pack: "ast-grep" })).toEqual({
    status: "acquisition-error",
    reason: "malformed-json",
  })
  expect(ReviewSarif.parseJson(ReviewPackAstGrep.parserId, JSON.stringify({ matches: [] }), { pack: "ast-grep" })).toEqual({
    status: "acquisition-error",
    reason: "not-ast-grep-json",
  })
  expect(ReviewSarif.parseJson(ReviewPackAstGrep.parserId, "[]", { pack: "ast-grep" })).toEqual({
    status: "ok",
    results: [],
    excluded: [],
  })
  const emptyRule = ReviewSarif.parseJson(ReviewPackAstGrep.parserId, JSON.stringify([{
    ruleId: "",
    file: "a.js",
    range: { start: { line: 0 } },
  }]), { pack: "ast-grep" })
  expect(emptyRule).toEqual({ status: "ok", results: [], excluded: [{ reason: "no-rule", count: 1 }] })
})

test("the host template scans with host rules and does not rewrite", () => {
  const argv = ReviewPackAstGrep.templates[ReviewPackAstGrep.templateId]({
    executable: "/host/ast-grep",
    root: "/scratch/snapshot",
    report: "/scratch/reports/ast-grep.json",
  })
  expect(argv[0]).toBe("/host/ast-grep")
  expect(argv[1]).toBe("scan")
  expect(argv.at(-1)).toBe("/scratch/snapshot")
  expect(argv).toContain("--json=compact")
  expect(argv).toContain("--config")
  expect(argv).toContain("--rule")
  expect(argv).toContain("--no-ignore")
  expect(argv).not.toContain("--update-all")
  expect(argv).not.toContain("-U")
  expect(argv).not.toContain("--interactive")
  expect(argv).not.toContain("run")
  const config = argv[argv.indexOf("--config") + 1]
  const rule = argv[argv.indexOf("--rule") + 1]
  expect(config).toBe("/scratch/reports/sgconfig.yml")
  expect(rule).toBe("/scratch/reports/lucy-rules.yml")
  expect(config.includes("/scratch/snapshot")).toBe(false)
})

it.live("host rules are the frozen eval patterns and carry no rewrite", () =>
  Effect.gen(function* () {
    const made = yield* held
    yield* ReviewPackAstGrep.prepare(made.path)
    const rules = yield* Effect.promise(() => readFile(path.join(made.path, ReviewPackAstGrep.rulesName), "utf8"))
    expect(rules).toContain("id: lucy-js-eval")
    expect(rules).toContain("language: JavaScript")
    expect(rules).toContain("id: lucy-ts-eval")
    expect(rules).toContain("language: TypeScript")
    expect(rules).toContain(`pattern: '${ReviewPackAstGrep.pattern}'`)
    expect(rules).toContain("severity: info")
    expect(rules).not.toContain("fix:")
    expect(yield* Effect.promise(() => readFile(path.join(made.path, ReviewPackAstGrep.configName), "utf8"))).toBe("ruleDirs: []\n")
  }),
)

it.live("conformance: the pinned binary matches eval, not lookalikes, and ignores repository config", () =>
  Effect.gen(function* () {
    const executable = yield* requireBinary()
    if (!executable) return
    expectSpawn(import.meta.path)
    const made = yield* held
    const version = yield* run([executable, "--version"], made.path)
    expect(`${version.stdout.data.toString("utf8")}${version.stderr.data.toString("utf8")}`).toContain(ReviewPackAstGrep.manifest.version)
    const host = path.join(made.path, "host")
    yield* ReviewPackAstGrep.prepare(host)
    const tree = path.join(made.path, "tree")
    yield* Effect.promise(() => materialize(tree, {
      "match.js": "match.js",
      "match.ts": "match.ts",
      "benign.js": "benign.js",
      "lookalike.js": "lookalike.js",
      "sgconfig.yml": "hostile/sgconfig.yml",
      "rules/catch.yml": "hostile/rules/catch.yml",
    }))
    const discovered = yield* run([
      executable, "scan", "--json=compact", "--color", "never", "--threads", "1", tree,
    ], tree)
    const discoveredIds = ids(discovered, tree)
    expect(discoveredIds, "positive control: a repo sgconfig must be visible when --config is omitted").toContain("hostile-const")
    const before = yield* Effect.promise(() => readFile(path.join(tree, "match.js"), "utf8"))
    const product = yield* run(template(executable, tree, host), tree)
    expect(product.exitCode, stderr(product)).toBe(0)
    const parsed = read(product, tree)
    const js = parsed.results.find((result) => result.rule === "lucy-js-eval" && result.path.replaceAll("\\", "/").endsWith("match.js"))
    const ts = parsed.results.find((result) => result.rule === "lucy-ts-eval" && result.path.replaceAll("\\", "/").endsWith("match.ts"))
    expect(js).toMatchObject({ line: 2, endLine: 2, message: "direct eval", snippet: "eval(input)" })
    expect(parsed.results.some((result) => result.rule === "lucy-js-eval" && result.snippet === "eval()")).toBe(true)
    expect(ts).toMatchObject({ line: 2, message: "direct eval", snippet: "eval(input)" })
    expect(parsed.results.map((result) => result.rule)).not.toContain("hostile-const")
    expect(parsed.results.some((result) => result.path.replaceAll("\\", "/").endsWith("lookalike.js"))).toBe(false)
    expect(parsed.results.some((result) => result.path.replaceAll("\\", "/").endsWith("benign.js"))).toBe(false)
    expect(yield* Effect.promise(() => readFile(path.join(tree, "match.js"), "utf8"))).toBe(before)
  }), 120_000,
)

it.live("conformance: a broken repository config is ignored, and an invalid host rule is refused", () =>
  Effect.gen(function* () {
    const executable = yield* requireBinary()
    if (!executable) return
    expectSpawn(import.meta.path)
    const made = yield* held
    const host = path.join(made.path, "host")
    yield* ReviewPackAstGrep.prepare(host)
    const tree = path.join(made.path, "broken")
    yield* Effect.promise(() => materialize(tree, { "match.js": "match.js", "sgconfig.yml": "broken/sgconfig.yml" }))
    const discovered = yield* run([
      executable, "scan", "--json=compact", "--color", "never", "--threads", "1", tree,
    ], tree)
    expect(discovered.exitCode, "positive control: a broken sgconfig must fail discovery").toBe(8)
    expect(stderr(discovered)).toContain("Cannot parse configuration")
    const product = yield* run(template(executable, tree, host), tree)
    expect(product.exitCode, stderr(product)).toBe(0)
    expect(ids(product, tree)).toContain("lucy-js-eval")
    const invalid = template(executable, tree, host).map((arg, index, argv) =>
      argv[index - 1] === "--rule" ? path.join(fixtureRoot, "invalid-rule.yml") : arg)
    const refused = yield* run(invalid, tree)
    expect(refused.exitCode, stderr(refused)).toBe(8)
    expect(stderr(refused)).toContain("Cannot parse rule")
  }), 120_000,
)

it.live("conformance: repository ignore files do not hide a match, and error severity exits 1 with JSON", () =>
  Effect.gen(function* () {
    const executable = yield* requireBinary()
    if (!executable) return
    expectSpawn(import.meta.path)
    const made = yield* held
    const host = path.join(made.path, "host")
    yield* ReviewPackAstGrep.prepare(host)
    const tree = path.join(made.path, "ignored")
    yield* Effect.promise(async () => {
      await materialize(tree, { "match.js": "match.js", ".gitignore": "hostile/.gitignore" })
      await git(tree, "init", "-q")
      await git(tree, "add", "-f", "match.js", ".gitignore")
    })
    const hidden = template(executable, tree, host).filter((arg, index, argv) => arg !== "--no-ignore" && argv[index - 1] !== "--no-ignore")
    const concealed = yield* run(hidden, tree)
    expect(ids(concealed, tree), "positive control: .gitignore must hide match.js when --no-ignore is omitted").not.toContain("lucy-js-eval")
    const shown = yield* run(template(executable, tree, host), tree)
    expect(shown.exitCode, stderr(shown)).toBe(0)
    expect(ids(shown, tree)).toContain("lucy-js-eval")
    const rule = path.join(made.path, "error.yml")
    yield* Effect.promise(() => writeFile(rule, [
      "id: error-eval",
      "language: JavaScript",
      "severity: error",
      "message: direct eval",
      "rule:",
      `  pattern: '${ReviewPackAstGrep.pattern}'`,
      "",
    ].join("\n")))
    const diagnostic = yield* run([
      executable, "scan", "--config", path.join(host, ReviewPackAstGrep.configName), "--rule", rule,
      "--json=compact", "--color", "never", "--threads", "1", "--no-ignore", "vcs", tree,
    ], tree)
    expect(diagnostic.exitCode, stderr(diagnostic)).toBe(1)
    expect(stderr(diagnostic)).toContain("error(s) found in code")
    expect(ids(diagnostic, tree)).toContain("error-eval")
  }), 120_000,
)

const requireBinary = Effect.gen(function* () {
  const located = yield* ReviewPackAstGrep.locate()
  expect(located, missing).not.toHaveProperty("absent")
  if (!("executable" in located)) return undefined
  expect(located.executable).toContain(ReviewPackAstGrep.manifest.version)
  return located.executable
})

function template(executable: string, root: string, host: string) {
  return ReviewPackAstGrep.templates[ReviewPackAstGrep.templateId]({
    executable, root, report: path.join(host, "ast-grep.json"),
  })
}

function run(argv: string[], cwd: string) {
  return ResearchProcess.run({
    command: argv[0], args: argv.slice(1), cwd, env: ResearchProcess.environment(),
    timeoutMs: 60_000, maxBytes: 1_048_576,
  })
}

function stderr(outcome: ResearchProcess.Outcome) {
  return outcome.stderr.data.toString("utf8")
}

function read(outcome: ResearchProcess.Outcome, root: string) {
  const text = outcome.stdout.data.toString("utf8")
  const parsed = ReviewSarif.parseJson(ReviewPackAstGrep.parserId, text, { pack: "ast-grep", root })
  if (parsed.status !== "ok") throw new Error(`conformance: report not readable (${parsed.reason}): ${text.slice(0, 400)}`)
  return parsed
}

function ids(outcome: ResearchProcess.Outcome, root: string) {
  return read(outcome, root).results.map((result) => result.rule)
}

async function materialize(root: string, files: Record<string, string>) {
  await Promise.all(Object.entries(files).map(async ([name, source]) => {
    const target = path.join(root, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, await readFile(path.join(fixtureRoot, source)))
  }))
}
