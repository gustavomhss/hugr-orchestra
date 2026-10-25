import { execFileSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { parsePatch, parseStatuses } from "../../../script/guards/diff"
import { evaluate } from "../../../script/guards/engine"
import { parseRule, selfCheck, type Rule } from "../../../script/guards/rule"
import { format, runGuards } from "../../../script/guards/run"

const guardsDir = join(import.meta.dir, "../../../script/guards")
const repos: string[] = []

afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true })
})

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" })
}

function repo() {
  const cwd = mkdtempSync(join(tmpdir(), "guards-"))
  repos.push(cwd)
  git(cwd, "init", "--initial-branch=main", "--quiet")
  git(cwd, "config", "user.email", "test@example.com")
  git(cwd, "config", "user.name", "Guards Test")
  return cwd
}

function write(cwd: string, file: string, text: string) {
  mkdirSync(join(cwd, file, ".."), { recursive: true })
  writeFileSync(join(cwd, file), text)
}

function commit(cwd: string, message: string) {
  git(cwd, "add", ".")
  git(cwd, "commit", "--quiet", "-m", message)
}

// A repo whose main branch already carries the real guard rules, then a `change` branch.
function guarded() {
  const cwd = repo()
  cpSync(guardsDir, join(cwd, "script/guards"), { recursive: true })
  write(cwd, "README.md", "base\n")
  commit(cwd, "base")
  git(cwd, "checkout", "--quiet", "-b", "change")
  return cwd
}

function rules() {
  const dir = join(guardsDir, "rules")
  return readdirSync(dir).map((name) => parseRule(name, readFileSync(join(dir, name), "utf8")))
}

function rule(text: string) {
  const parsed = parseRule("sample.toml", text)
  if (typeof parsed === "string") throw new Error(parsed)
  return parsed
}

const SAMPLE = `
id = "sample"
severity = "gate"
on = "added-lines"
paths = ["src/**/*.ts"]
exclude = ["src/skip/**"]
match = 'FORBIDDEN'
message = "no"
positive = ["FORBIDDEN"]
negative = ["fine"]
`

function diff(path: string, lines: string[], removed: string[] = []) {
  return {
    changes: [{ path, status: "M", from: undefined, added: lines.map((text, index) => ({ line: index + 1, text })) }],
    removed: new Set(removed),
  }
}

const config = { generated: ["src/gen/**"], exclude: [] as string[] }

describe("guard rules", () => {
  test("every shipped rule loads and passes its own samples", () => {
    const loaded = rules()
    expect(loaded.length).toBeGreaterThanOrEqual(7)
    for (const entry of loaded) expect(typeof entry).not.toBe("string")
    const parsed = loaded.filter((entry): entry is Rule => typeof entry !== "string")
    expect(parsed.flatMap(selfCheck)).toEqual([])
    expect(new Set(parsed.map((entry) => entry.id)).size).toBe(parsed.length)
  })

  test("a rule without samples, with a mismatched id or with a bad regex does not load", () => {
    expect(parseRule("sample.toml", SAMPLE.replace('negative = ["fine"]', "negative = []"))).toContain("samples")
    expect(parseRule("other.toml", SAMPLE)).toContain("file name")
    expect(parseRule("sample.toml", SAMPLE.replace("'FORBIDDEN'", "'('"))).toContain("regular expression")
    expect(parseRule("sample.toml", SAMPLE.replace("match = 'FORBIDDEN'\n", ""))).toContain("needs a match")
    expect(parseRule("sample.toml", "not = [toml")).toContain("invalid TOML")
  })

  test("selfCheck reports a sample that behaves wrongly", () => {
    const wrong = rule(SAMPLE.replace('positive = ["FORBIDDEN"]', 'positive = ["nothing here"]'))
    expect(selfCheck(wrong)).toEqual(["sample: positive sample does not fire: nothing here"])
  })
})

describe("git output parsing", () => {
  test("parseStatuses pairs renames and copies", () => {
    const output = ["M", "a.ts", "R100", "old.ts", "new.ts", "D", "gone.ts", ""].join("\0")
    expect(parseStatuses(output)).toEqual([
      { status: "M", path: "a.ts", from: undefined },
      { status: "R", path: "new.ts", from: "old.ts" },
      { status: "D", path: "gone.ts", from: undefined },
    ])
  })

  test("parsePatch numbers added lines and collects removed ones", () => {
    const patch = [
      "diff --git a.ts a.ts",
      "--- a.ts",
      "+++ a.ts",
      "@@ -3 +3,2 @@",
      "-  old line",
      "+  new one",
      "+  new two",
      "@@ -10,0 +12 @@",
      "+--- looks like a header but is an added line",
      "diff --git gone.ts gone.ts",
      "--- gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-removed",
      "",
    ].join("\n")
    const parsed = parsePatch(patch)
    expect(parsed.added.get("a.ts")).toEqual([
      { line: 3, text: "  new one" },
      { line: 4, text: "  new two" },
      { line: 12, text: "--- looks like a header but is an added line" },
    ])
    expect(parsed.added.has("gone.ts")).toBe(false)
    expect([...parsed.removed].sort()).toEqual(["old line", "removed"])
  })
})

describe("evaluate", () => {
  const sample = rule(SAMPLE)
  const run = (input: ReturnType<typeof diff>, approved: string[] = []) =>
    evaluate({ rules: [sample], config, diff: input, approved })

  test("fires on an added line in scope and reports its line number", () => {
    expect(run(diff("src/a.ts", ["ok", "x FORBIDDEN y"])).map((finding) => finding.line)).toEqual([2])
  })

  test("stays quiet outside the rule's paths, in excluded paths and in generated paths", () => {
    expect(run(diff("lib/a.ts", ["FORBIDDEN"]))).toEqual([])
    expect(run(diff("src/skip/a.ts", ["FORBIDDEN"]))).toEqual([])
    expect(run(diff("src/gen/a.ts", ["FORBIDDEN"]))).toEqual([])
  })

  test("generated = include reads generated paths", () => {
    const included = rule(SAMPLE.replace('severity = "gate"', 'severity = "gate"\ngenerated = "include"'))
    const found = evaluate({ rules: [included], config, diff: diff("src/gen/a.ts", ["FORBIDDEN"]), approved: [] })
    expect(found).toHaveLength(1)
  })

  test("an ignore comment needs the rule id and a reason", () => {
    expect(run(diff("src/a.ts", ["FORBIDDEN // guardrail-ignore: sample generated fixture"]))).toEqual([])
    expect(run(diff("src/a.ts", ["FORBIDDEN // guardrail-ignore: sample"]))).toHaveLength(1)
    expect(run(diff("src/a.ts", ["FORBIDDEN // guardrail-ignore: other-rule because"]))).toHaveLength(1)
  })

  test("a line identical to one removed elsewhere in the diff is moved code", () => {
    expect(run(diff("src/a.ts", ["  FORBIDDEN"], ["FORBIDDEN"]))).toEqual([])
  })

  test("the config's own exclude list hides a path from added-lines rules", () => {
    const found = evaluate({
      rules: [sample],
      config: { generated: [], exclude: ["src/self/**"] },
      diff: diff("src/self/a.ts", ["FORBIDDEN"]),
      approved: [],
    })
    expect(found).toEqual([])
  })

  test("a changed-paths rule fires on the path and on a rename's old path, unless approved", () => {
    const protectedPaths = rule(`
id = "sample"
severity = "gate"
on = "changed-paths"
paths = ["locked/**"]
statuses = ["M", "R"]
message = "locked"
positive = ["locked/a"]
negative = ["open/a"]
`)
    const changes = {
      changes: [
        { path: "locked/a", status: "M", from: undefined, added: [] },
        { path: "open/b", status: "R", from: "locked/b", added: [] },
        { path: "locked/c", status: "A", from: undefined, added: [] },
      ],
      removed: new Set<string>(),
    }
    expect(evaluate({ rules: [protectedPaths], config, diff: changes, approved: [] }).map((f) => f.path)).toEqual([
      "locked/a",
      "open/b",
    ])
    expect(evaluate({ rules: [protectedPaths], config, diff: changes, approved: ["sample"] })).toEqual([])
  })
})

describe("runGuards", () => {
  test("flags a focused test with its line, and the workflow edit as protected", () => {
    const cwd = guarded()
    write(cwd, "src/a.test.ts", 'import { it } from "bun:test"\nit.only("x", () => {})\n')
    write(cwd, ".github/workflows/ci.yml", "name: ci\n")
    commit(cwd, "change")
    const report = runGuards({ cwd, baseRef: "main", approved: [] })
    expect(report.errors).toEqual([])
    expect(report.bootstrap).toBe(false)
    expect(report.findings.map((finding) => `${finding.rule} ${finding.path}:${finding.line ?? "-"}`).sort()).toEqual([
      "js-test-focused src/a.test.ts:2",
      "protected-paths .github/workflows/ci.yml:-",
    ])
    expect(format(report).at(-1)).toContain("2 gate")
  })

  // Golden: one workflow with a known defect per workflow rule, one clean workflow. Pins the whole pack end to end.
  test("the workflow pack flags every planted defect and nothing in the clean workflow", () => {
    const cwd = guarded()
    write(
      cwd,
      ".github/workflows/bad.yml",
      [
        "on: [pull_request_target]",
        "permissions: write-all",
        "env:",
        "  ACTIONS_ALLOW_UNSECURE_COMMANDS: true",
        "  ALL: ${{ toJSON(secrets) }}",
        "jobs:",
        "  a:",
        "    if: false",
        "    continue-on-error: true",
        "    secrets: inherit",
        "    steps:",
        "      - uses: actions/checkout@v4",
        '      - run: echo "${{ github.event.pull_request.title }}"',
        "      - run: curl -fsSL https://example.com/i.sh | sh",
        '      - run: echo "X=${{ steps.s.outputs.v }}" >> $GITHUB_ENV',
        '      - run: echo "::set-output name=a::b"',
        "      - run: git commit --no-verify -m x",
        "",
      ].join("\n"),
    )
    write(
      cwd,
      ".github/workflows/good.yml",
      [
        "on: [pull_request]",
        "permissions:",
        "  contents: read",
        "jobs:",
        "  a:",
        "    permissions:",
        "      contents: write",
        "    steps:",
        "      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4",
        "      - uses: ./.github/actions/setup",
        '      - run: echo "$PR_TITLE"',
        "        env:",
        "          PR_TITLE: ${{ github.event.pull_request.title }}",
        "",
      ].join("\n"),
    )
    commit(cwd, "workflows")
    const findings = runGuards({ cwd, baseRef: "main", approved: ["protected-paths"] }).findings
    expect(findings.filter((finding) => finding.path.endsWith("good.yml"))).toEqual([])
    expect(findings.map((finding) => finding.rule).sort()).toEqual([
      "gha-continue-on-error",
      "gha-curl-pipe-sh",
      "gha-deprecated-commands",
      "gha-env-write",
      "gha-insecure-commands",
      "gha-job-disabled",
      "gha-permissions-broad",
      "gha-pull-request-target",
      "gha-secrets-inherit",
      "gha-secrets-tojson",
      "gha-template-injection",
      "gha-unpinned-uses",
      "hook-bypass",
    ])
  })

  test("a change that edits a rule to relax it is still judged by the base rules", () => {
    const cwd = guarded()
    write(cwd, "script/guards/rules/js-test-focused.toml", readFileSync(join(cwd, "script/guards/rules/js-test-focused.toml"), "utf8").replace(/^match = .*$/m, "match = 'never-matches-zzz'"))
    write(cwd, "src/a.test.ts", 'it.only("x", () => {})\n')
    commit(cwd, "relax the rule and add the defect")
    const report = runGuards({ cwd, baseRef: "main", approved: [] })
    expect(report.findings.map((finding) => finding.rule)).toContain("js-test-focused")
    expect(report.findings.map((finding) => finding.rule)).toContain("protected-paths")
  })

  test("reads an untracked file that git does not list in the diff", () => {
    const cwd = guarded()
    write(cwd, "src/new.ts", "const a = 1\n<<<<<<< HEAD\nconst a = 2\n")
    const report = runGuards({ cwd, baseRef: "main", approved: [] })
    expect(report.findings.map((finding) => `${finding.rule}:${finding.line}`)).toEqual(["conflict-markers:2"])
  })

  test("a conflict marker in generated code is still a finding", () => {
    const cwd = guarded()
    write(cwd, "packages/client/src/generated-effect/client.ts", "<<<<<<< HEAD\n")
    commit(cwd, "bad merge")
    expect(runGuards({ cwd, baseRef: "main", approved: [] }).findings.map((finding) => finding.rule)).toEqual(["conflict-markers"])
  })

  test("a moved suppression does not fire, a new one does", () => {
    const cwd = guarded()
    write(cwd, "src/old.ts", "// @ts-ignore legacy\nexport const a = 1\n")
    commit(cwd, "seed")
    git(cwd, "checkout", "--quiet", "main")
    git(cwd, "merge", "--quiet", "change")
    git(cwd, "checkout", "--quiet", "-b", "move")
    git(cwd, "mv", "src/old.ts", "src/moved.ts")
    commit(cwd, "rename")
    expect(runGuards({ cwd, baseRef: "main", approved: [] }).findings).toEqual([])
    write(cwd, "src/moved.ts", "// @ts-ignore legacy\n// @ts-ignore another one\nexport const a = 1\n")
    commit(cwd, "add a second suppression")
    expect(runGuards({ cwd, baseRef: "main", approved: [] }).findings.map((finding) => finding.rule)).toEqual(["ts-ignore"])
  })

  test("with no rules on the base it reads them from the change and says so", () => {
    const cwd = repo()
    write(cwd, "README.md", "base\n")
    commit(cwd, "base")
    git(cwd, "checkout", "--quiet", "-b", "change")
    cpSync(guardsDir, join(cwd, "script/guards"), { recursive: true })
    write(cwd, "src/a.ts", "EOF\n")
    commit(cwd, "introduce the engine")
    const report = runGuards({ cwd, baseRef: "main", approved: [] })
    expect(report.bootstrap).toBe(true)
    expect(report.findings.map((finding) => finding.rule)).toContain("heredoc-residue")
    expect(format(report)[0]).toContain("BOOTSTRAP")
  })

  test("refuses to pass when no rules exist anywhere or the base cannot be resolved", () => {
    const cwd = repo()
    write(cwd, "README.md", "base\n")
    commit(cwd, "base")
    expect(runGuards({ cwd, baseRef: "main", approved: [] }).errors[0]).toContain("refusing to pass")
    expect(runGuards({ cwd, baseRef: "no-such-ref", approved: [] }).errors[0]).toContain("cannot resolve")
  })

  test("a rule on the base that fails its own samples stops the run", () => {
    const cwd = repo()
    cpSync(guardsDir, join(cwd, "script/guards"), { recursive: true })
    const file = join(cwd, "script/guards/rules/heredoc-residue.toml")
    writeFileSync(file, readFileSync(file, "utf8").replace(/^match = .*$/m, () => "match = '^never$'"))
    commit(cwd, "base with a broken rule")
    git(cwd, "checkout", "--quiet", "-b", "change")
    write(cwd, "x.ts", "EOF\n")
    commit(cwd, "change")
    expect(runGuards({ cwd, baseRef: "main", approved: [] }).errors[0]).toContain("positive sample does not fire")
  })
})
