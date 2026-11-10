import { expect } from "bun:test"
import path from "path"
import { mkdir, readFile, writeFile } from "fs/promises"
import { Effect, Option, Schema } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewPackAstGrep } from "../../src/review-toolkit/packs/ast-grep"
import { ReviewSarif } from "../../src/review-toolkit/sarif"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { provision } from "../fixture/lucy-astgrep/host"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const fixtureRoot = path.join(import.meta.dir, "../fixture/lucy-astgrep")
const held = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (made) => Effect.promise(() => made[Symbol.asyncDispose]()),
)

it.live("conformance: the pinned binary matches eval, not lookalikes, and ignores repository config", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held
    const installed = yield* provision(path.join(made.path, "toolkit"))
    const version = yield* run([installed.executable, "--version"], made.path)
    expect(`${version.stdout.data.toString("utf8")}${version.stderr.data.toString("utf8")}`).toContain(installed.version)
    const rules = path.join(made.path, "rules")
    yield* ReviewPackAstGrep.prepare(rules)
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
      installed.executable, "scan", "--json=compact", "--color", "never", "--threads", "1", tree,
    ], tree)
    expect(nativeRuleIds(discovered), "positive control: a repo sgconfig must be visible when --config is omitted").toContain("hostile-const")
    const before = yield* Effect.promise(() => readFile(path.join(tree, "match.js"), "utf8"))
    const product = yield* run(template(installed.executable, tree, rules), tree)
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
  }), 600_000,
)

it.live("conformance: a broken repository config is ignored, and an invalid host rule is refused", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held
    const installed = yield* provision(path.join(made.path, "toolkit"))
    const rules = path.join(made.path, "rules")
    yield* ReviewPackAstGrep.prepare(rules)
    const tree = path.join(made.path, "broken")
    yield* Effect.promise(() => materialize(tree, { "match.js": "match.js", "sgconfig.yml": "broken/sgconfig.yml" }))
    const discovered = yield* run([
      installed.executable, "scan", "--json=compact", "--color", "never", "--threads", "1", tree,
    ], tree)
    expect(discovered.exitCode, "positive control: a broken sgconfig must fail discovery").toBe(8)
    expect(stderr(discovered)).toContain("Cannot parse configuration")
    const product = yield* run(template(installed.executable, tree, rules), tree)
    expect(product.exitCode, stderr(product)).toBe(0)
    expect(ids(product, tree)).toContain("lucy-js-eval")
    const invalid = template(installed.executable, tree, rules).map((arg, index, argv) =>
      argv[index - 1] === "--rule" ? path.join(fixtureRoot, "invalid-rule.yml") : arg)
    const refused = yield* run(invalid, tree)
    expect(refused.exitCode, stderr(refused)).toBe(8)
    expect(stderr(refused)).toContain("Cannot parse rule")
  }), 600_000,
)

it.live("conformance: repository ignore files do not hide a match, and error severity exits 1 with JSON", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* held
    const installed = yield* provision(path.join(made.path, "toolkit"))
    const rules = path.join(made.path, "rules")
    yield* ReviewPackAstGrep.prepare(rules)
    const tree = path.join(made.path, "ignored")
    yield* Effect.promise(async () => {
      await materialize(tree, { "match.js": "match.js", ".gitignore": "hostile/.gitignore" })
      await git(tree, "init", "-q")
      await git(tree, "add", "-f", "match.js", ".gitignore")
    })
    const hidden = template(installed.executable, tree, rules).filter((arg, index, argv) => arg !== "--no-ignore" && argv[index - 1] !== "--no-ignore")
    const concealed = yield* run(hidden, tree)
    expect(ids(concealed, tree), "positive control: .gitignore must hide match.js when --no-ignore is omitted").not.toContain("lucy-js-eval")
    const shown = yield* run(template(installed.executable, tree, rules), tree)
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
      installed.executable, "scan", "--config", path.join(rules, ReviewPackAstGrep.configName), "--rule", rule,
      "--json=compact", "--color", "never", "--threads", "1", "--no-ignore", "vcs", tree,
    ], tree)
    expect(diagnostic.exitCode, stderr(diagnostic)).toBe(1)
    expect(stderr(diagnostic)).toContain("error(s) found in code")
    expect(nativeRuleIds(diagnostic)).toContain("error-eval")
  }), 600_000,
)

function template(executable: string, root: string, rules: string) {
  return ReviewPackAstGrep.templates[ReviewPackAstGrep.templateId]({
    executable, root, report: path.join(rules, "ast-grep.json"),
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

// Control ids are not host rules. Read the CLI array; do not send them through the production known-id parser.
const NativeRows = Schema.Array(Schema.Struct({ ruleId: Schema.optionalKey(Schema.String) }))

function nativeRuleIds(outcome: ResearchProcess.Outcome) {
  const text = outcome.stdout.data.toString("utf8")
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json)) throw new Error(`control: not json: ${text.slice(0, 400)}`)
  const rows = Schema.decodeUnknownOption(NativeRows)(json.value)
  if (Option.isNone(rows)) throw new Error(`control: not an ast-grep array: ${text.slice(0, 400)}`)
  return rows.value.flatMap((row) => row.ruleId ? [row.ruleId] : [])
}

async function materialize(root: string, files: Record<string, string>) {
  await Promise.all(Object.entries(files).map(async ([name, source]) => {
    const target = path.join(root, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, await readFile(path.join(fixtureRoot, source)))
  }))
}
