import { execFileSync } from "node:child_process"
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { parseBinary, parsePatch, parseRaw } from "../../../script/guards/diff"
import { evaluate } from "../../../script/guards/engine"
import { expandSets, parseRule, selfCheck, type Rule } from "../../../script/guards/rule"
import { annotation, exitCode, format, runGuards } from "../../../script/guards/run"

// Each runGuards test builds a temp git repo and spawns git several times; a loaded CI host needs more than 5s.
setDefaultTimeout(30_000)

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
    removed: counts(removed),
  }
}

const config = { generated: ["src/gen/**"], exclude: [] as string[], sets: {} as Record<string, string[]> }

function counts(lines: string[]) {
  return lines.reduce((map, line) => map.set(line, (map.get(line) ?? 0) + 1), new Map<string, number>())
}

describe("guard rules", () => {
  test("every shipped rule loads and passes its own samples", () => {
    const loaded = rules()
    expect(loaded.length).toBeGreaterThanOrEqual(7)
    for (const entry of loaded) expect(typeof entry).not.toBe("string")
    const parsed = loaded.filter((entry): entry is Rule => typeof entry !== "string")
    const sets = (Bun.TOML.parse(readFileSync(join(guardsDir, "config.toml"), "utf8")) as { sets: Record<string, string[]> }).sets
    const expanded = parsed.map((entry) => expandSets(entry, sets))
    for (const entry of expanded) expect(typeof entry).not.toBe("string")
    expect(expanded.flatMap((entry) => (typeof entry === "string" ? [] : selfCheck(entry)))).toEqual([])
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
  test("parseRaw reads modes and shas and pairs renames and copies", () => {
    const sha = (letter: string) => letter.repeat(40)
    const output = [
      `:100644 100755 ${sha("a")} ${sha("b")} M`,
      "tool.sh",
      `:100644 100644 ${sha("c")} ${sha("d")} R100`,
      "old.ts",
      "new.ts",
      `:100644 000000 ${sha("e")} ${"0".repeat(40)} D`,
      "gone.ts",
      "",
    ].join("\0")
    expect(parseRaw(output)).toEqual([
      { status: "M", path: "tool.sh", from: undefined, mode: "100755", sha: sha("b") },
      { status: "R", path: "new.ts", from: "old.ts", mode: "100644", sha: sha("d") },
      { status: "D", path: "gone.ts", from: undefined, mode: "000000", sha: "0".repeat(40) },
    ])
  })

  test("parseBinary finds files git reports without line counts, including renamed ones", () => {
    const output = ["1\t2\ta.ts", "-\t-\tlogo.png", "-\t-\t", "old.bin", "new.bin", "3\t0\tb.ts", ""].join("\0")
    expect([...parseBinary(output)].sort()).toEqual(["logo.png", "new.bin"])
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
    expect([...parsed.removed.keys()].sort()).toEqual(["old line", "removed"])
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

  test("each removed line excuses one identical added line, not every one", () => {
    expect(run(diff("src/a.ts", ["FORBIDDEN", "FORBIDDEN"], ["FORBIDDEN"]))).toHaveLength(1)
    expect(run(diff("src/a.ts", ["FORBIDDEN", "FORBIDDEN"], ["FORBIDDEN", "FORBIDDEN"]))).toEqual([])
  })

  test("flags = i matches case-insensitively and skip_comments hides comment lines", () => {
    const loose = rule(SAMPLE.replace("match = 'FORBIDDEN'", "flags = \"i\"\nskip_comments = [\"//\", \"#\"]\nmatch = 'FORBIDDEN'").replace('negative = ["fine"]', 'negative = ["fine", "  // forbidden here"]'))
    const lines = ["forbidden", "  // FORBIDDEN in a comment", "# forbidden", "x = FORBIDDEN"]
    const found = evaluate({ rules: [loose], config, diff: diff("src/a.ts", lines), approved: [] })
    expect(found.map((finding) => finding.line)).toEqual([1, 4])
    expect(parseRule("sample.toml", SAMPLE.replace("match = 'FORBIDDEN'", "flags = \"g\"\nmatch = 'FORBIDDEN'"))).toContain("flags")
  })

  test("a $name in paths expands to its [sets] list, and an unknown name is an error", () => {
    const named = rule(SAMPLE.replace('paths = ["src/**/*.ts"]', 'paths = ["$code"]').replace('positive = ["FORBIDDEN"]', 'positive = ["FORBIDDEN"]'))
    expect(expandSets(named, {})).toContain("$code")
    const expanded = expandSets(named, { code: ["src/**/*.ts", "lib/**/*.ts"] })
    if (typeof expanded === "string") throw new Error(expanded)
    expect(expanded.paths).toEqual(["src/**/*.ts", "lib/**/*.ts"])
    expect(evaluate({ rules: [expanded], config, diff: diff("lib/a.ts", ["FORBIDDEN"]), approved: [] })).toHaveLength(1)
  })

  test("the config's own exclude list hides a path from added-lines rules", () => {
    const found = evaluate({
      rules: [sample],
      config: { generated: [], exclude: ["src/self/**"], sets: {} },
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
      removed: new Map<string, number>(),
    }
    expect(evaluate({ rules: [protectedPaths], config, diff: changes, approved: [] }).map((f) => f.path)).toEqual([
      "locked/a",
      "open/b",
    ])
    expect(evaluate({ rules: [protectedPaths], config, diff: changes, approved: ["sample"] })).toEqual([])
  })
})

describe("warn mode", () => {
  const gate = { rule: "r", severity: "gate" as const, path: "a.ts", line: 3, message: "bad\nthing 100%" }
  const report = { base: "abc", bootstrap: false, rules: 1, files: 1, findings: [gate], errors: [] as string[] }

  test("a gate finding fails the run, and only warn mode lets it pass", () => {
    expect(exitCode(report, false)).toBe(1)
    expect(exitCode(report, true)).toBe(0)
  })

  test("a setup error fails even in warn mode", () => {
    expect(exitCode({ ...report, findings: [], errors: ["no rules"] }, true)).toBe(1)
  })

  test("the annotation names the file and line and cannot break out of the command", () => {
    expect(annotation(gate)).toBe("::warning file=a.ts,line=3,title=guard r::bad%0Athing 100%25")
    expect(annotation({ ...gate, line: undefined })).toBe("::warning file=a.ts,title=guard r::bad%0Athing 100%25")
  })

  test("the CLI honours --cwd and --warn", () => {
    const cwd = guarded()
    write(cwd, "src/a.ts", "EOF\n")
    commit(cwd, "change")
    const run = (...flags: string[]) =>
      Bun.spawnSync(["bun", join(guardsDir, "run.ts"), "--cwd", cwd, "--base", "main", ...flags])
    const strict = run()
    expect(strict.exitCode).toBe(1)
    expect(strict.stdout.toString()).toContain("GATE src/a.ts:1 [heredoc-residue]")
    expect(run("--warn").exitCode).toBe(0)
  })
})

describe("runGuards", () => {
  test("flags a focused test with its line, and the AGENTS.md edit as protected", () => {
    const cwd = guarded()
    write(cwd, "src/a.test.ts", 'import { it } from "bun:test"\nit.only("x", () => {})\n')
    write(cwd, "AGENTS.md", "rules\n")
    commit(cwd, "change")
    const report = runGuards({ cwd, baseRef: "main", approved: [] })
    expect(report.errors).toEqual([])
    expect(report.bootstrap).toBe(false)
    expect(report.findings.map((finding) => `${finding.rule} ${finding.path}:${finding.line ?? "-"}`).sort()).toEqual([
      "js-test-focused src/a.test.ts:2",
      "protected-paths AGENTS.md:-",
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

  // Golden: one planted defect per suppression and debug rule across TypeScript, Python, Rust, env files and scripts,
  // next to look-alike files that must stay clean.
  test("the suppression and debug pack flags every planted defect and nothing in the look-alikes", () => {
    const cwd = guarded()
    write(
      cwd,
      "lib/bad.ts",
      [
        "const a: any = 1",
        "const b = value as unknown as Foo",
        "debugger",
        "console.log(a)",
        "try { run() } catch (e) {}",
        "// WIP: finish this",
        "",
      ].join("\n"),
    )
    write(
      cwd,
      "lib/bad.py",
      ["x = f(y)  # type: ignore", "import os  # noqa", "    pass  # pragma: no cover", "    except:", "    breakpoint()", ""].join("\n"),
    )
    write(
      cwd,
      "lib/bad.rs",
      ["#[allow(dead_code)]", "let v = m.get(&k).unwrap();", "    todo!()", "    dbg!(x);", ""].join("\n"),
    )
    write(cwd, "web/.env.local.example", "VITE_API_TOKEN=abc\n")
    write(cwd, "scripts/clean.sh", "git push --force origin dev\n")
    write(
      cwd,
      "lib/good.ts",
      [
        "const x: unknown = 1",
        "// catch {} is banned",
        "console.error(e)",
        "const s = value as Session",
        "// the cast is not as unknown as it looks",
        "",
      ].join("\n"),
    )
    write(cwd, "lib/good.py", ["x = f(y)  # type: ignore[arg-type]", "import os  # noqa: F401", "    except OSError:", ""].join("\n"))
    write(cwd, "lib/good.rs", ['#[expect(dead_code, reason = "used by tests")]', "let v = m.get(&k)?;", ""].join("\n"))
    write(cwd, "web/good.env", "NEXT_PUBLIC_SUPABASE_ANON_KEY=x\n")
    commit(cwd, "pack")
    const findings = runGuards({ cwd, baseRef: "main", approved: [] }).findings
    expect(findings.filter((finding) => finding.path.includes("good"))).toEqual([])
    expect(findings.map((finding) => finding.rule).sort()).toEqual([
      "client-env-secret",
      "destructive-shell",
      "js-console-log",
      "js-debugger",
      "js-empty-catch",
      "py-bare-except",
      "py-breakpoint",
      "py-no-cover",
      "py-noqa-blanket",
      "py-type-ignore",
      "rs-dbg-macro",
      "rs-todo-macros",
      "ts-any-added",
      "ts-double-cast",
      "wip-marker",
    ])
  })

  // Golden: a base with tests, then a change that deletes one, guts one, skips and weakens others, plus look-alikes.
  test("the test pack flags every planted weakening and nothing in the look-alikes", () => {
    const cwd = repo()
    cpSync(guardsDir, join(cwd, "script/guards"), { recursive: true })
    write(cwd, "src/gone.test.ts", 'it("a", () => {})\n')
    write(cwd, "src/moved.test.ts", 'it("m", () => {\n  expect(m).toBe(1)\n})\n')
    write(
      cwd,
      "src/weak.test.ts",
      ["a", "b", "c", "d"].map((name) => `it("${name}", () => { expect(${name}).toBe(1) })`).join("\n") + "\n",
    )
    commit(cwd, "base")
    git(cwd, "checkout", "--quiet", "-b", "change")
    git(cwd, "rm", "--quiet", "src/gone.test.ts")
    git(cwd, "mv", "src/moved.test.ts", "src/renamed.test.ts")
    write(cwd, "src/weak.test.ts", 'it("a", () => { expect(a).toBe(1) })\n')
    write(cwd, "tests/test_a.py", "@pytest.mark.skip\ndef test_a():\n    assert True\n")
    write(cwd, "crates/x/tests/t.rs", "#[ignore]\n#[should_panic]\nfn t() {}\n")
    write(cwd, "src/loose.test.ts", "expect(true).toBe(true)\njest.retryTimes(3)\n")
    // Look-alikes that must stay quiet.
    write(
      cwd,
      "tests/test_ok.py",
      '@pytest.mark.skipif(sys.platform == "win32", reason="posix only")\ndef test_ok():\n    assert x == 1\n',
    )
    write(cwd, "crates/x/tests/ok.rs", '#[ignore = "needs a display"]\nfn ok() {}\n')
    write(cwd, "src/ok.test.ts", "expect(result).toBe(1)\nexpect(map.get(k)).toBeDefined()\n")
    commit(cwd, "weaken")
    const findings = runGuards({ cwd, baseRef: "main", approved: [] }).findings
    expect(findings.map((finding) => `${finding.rule} ${finding.path}`).sort()).toEqual([
      "js-loose-assertion src/loose.test.ts",
      "py-assert-trivial tests/test_a.py",
      "py-test-skipped tests/test_a.py",
      "rs-should-panic-bare crates/x/tests/t.rs",
      "rs-test-ignored crates/x/tests/t.rs",
      "test-assertions-removed src/weak.test.ts",
      "test-declaration-removed src/weak.test.ts",
      "test-file-deleted src/gone.test.ts",
      "test-retry-added src/loose.test.ts",
    ])
  })

  // Golden: dependency edits with and without their lockfile, and metadata-only edits that need none.
  test("the dependency pack flags planted edits, and the lockfile rules stand down once the lockfile moves", () => {
    const cwd = repo()
    cpSync(guardsDir, join(cwd, "script/guards"), { recursive: true })
    write(cwd, "pkgs/a/package.json", '{\n  "name": "a",\n  "dependencies": {\n    "x": "1.0.0"\n  }\n}\n')
    write(cwd, "pkgs/exp/package.json", '{\n  "name": "exp",\n  "exports": {\n    "./a": "./src/a.ts"\n  }\n}\n')
    write(cwd, "crates/c/Cargo.toml", '[package]\nname = "c"\n\n[dependencies]\n')
    write(cwd, "bun.lock", "{}\n")
    commit(cwd, "base")
    git(cwd, "checkout", "--quiet", "-b", "change")
    write(
      cwd,
      "pkgs/a/package.json",
      [
        "{",
        '  "name": "a",',
        '  "scripts": {',
        '    "postinstall": "node setup.js"',
        "  },",
        '  "dependencies": {',
        '    "x": "1.0.0",',
        '    "y": "github:org/y",',
        '    "z": "2.0.0"',
        "  }",
        "}",
        "",
      ].join("\n"),
    )
    write(
      cwd,
      "pkgs/exp/package.json",
      '{\n  "name": "exp",\n  "exports": {\n    "./a": "./src/a.ts",\n    "./b": "./src/b.ts"\n  }\n}\n',
    )
    write(cwd, "crates/c/Cargo.toml", '[package]\nname = "c"\n\n[dependencies]\nserde = "1.0"\nfoo = { git = "https://github.com/x/y" }\n')
    write(cwd, ".npmrc", "registry=https://npm.pkg.github.com\n")
    commit(cwd, "dependencies")
    const ids = () =>
      runGuards({ cwd, baseRef: "main", approved: [] })
        .findings.map((finding) => `${finding.rule} ${finding.path}`)
        .sort()
    expect(ids()).toEqual([
      "cargo-lockfile-stale crates/c/Cargo.toml",
      "dep-git-source crates/c/Cargo.toml",
      "dep-git-source pkgs/a/package.json",
      "dep-lifecycle-script pkgs/a/package.json",
      "dep-registry-override .npmrc",
      "lockfile-stale pkgs/a/package.json",
    ])
    write(cwd, "bun.lock", '{ "lockfileVersion": 1 }\n')
    write(cwd, "crates/c/Cargo.lock", "# lock\n")
    commit(cwd, "lockfiles")
    expect(ids()).toEqual([
      "dep-git-source crates/c/Cargo.toml",
      "dep-git-source pkgs/a/package.json",
      "dep-lifecycle-script pkgs/a/package.json",
      "dep-registry-override .npmrc",
    ])
  })

  // Golden: a shipped migration is immutable, a new one may be added, and destructive or required-column SQL is flagged.
  test("the migration pack flags edits to shipped migrations and destructive SQL, and accepts a new safe migration", () => {
    const cwd = repo()
    cpSync(guardsDir, join(cwd, "script/guards"), { recursive: true })
    const old = "apps/orchestra/migration/20260101000000_first/migration.sql"
    write(cwd, old, "CREATE TABLE `a` (`id` text);\n")
    write(cwd, "packages/core/src/database/migration/20260101000001_second.ts", "export default {}\n")
    commit(cwd, "base")
    git(cwd, "checkout", "--quiet", "-b", "change")
    const ids = () =>
      runGuards({ cwd, baseRef: "main", approved: [] })
        .findings.map((finding) => `${finding.rule} ${finding.path}`)
        .sort()
    write(cwd, "apps/orchestra/migration/20260201000000_safe/migration.sql", "ALTER TABLE `a` ADD `b` text;\nDROP INDEX `a_idx`;\n")
    commit(cwd, "safe")
    expect(ids()).toEqual([])
    write(cwd, old, "CREATE TABLE `a` (`id` text, `c` text);\n")
    write(cwd, "apps/orchestra/migration/20260301000000_bad/migration.sql", "ALTER TABLE `a` DROP COLUMN `b`;\nALTER TABLE `a` ADD `d` text NOT NULL;\n")
    commit(cwd, "bad")
    expect(ids()).toEqual([
      "migration-add-required-column apps/orchestra/migration/20260301000000_bad/migration.sql",
      "migration-destructive apps/orchestra/migration/20260301000000_bad/migration.sql",
      "migration-edited " + old,
    ])
  })

  // Golden: the agent-mistake rules fire on planted lines and stay quiet on the look-alikes beside them.
  test("the agent-mistake pack flags planted lines and nothing in the look-alikes", () => {
    const cwd = repo()
    cpSync(guardsDir, join(cwd, "script/guards"), { recursive: true })
    write(cwd, "README.md", "base\n")
    commit(cwd, "base")
    git(cwd, "checkout", "--quiet", "-b", "change")
    write(cwd, "src/bad.ts", ['const key = "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789"', 'const dir = "/Users/alice/work"', "  // ... existing code ...", "const agent = { rejectUnauthorized: false }", ""].join("\n"))
    write(cwd, "src/ok.ts", ['const key = process.env.TOKEN', 'const dir = path.join(os.homedir(), "work")', "const rest = items.slice(1)", "const agent = { rejectUnauthorized: true }", "// /Users/alice/work in a comment", ""].join("\n"))
    write(cwd, "tsconfig.json", '{\n  "compilerOptions": {\n    "strict": false,\n    "noUncheckedIndexedAccess": false\n  }\n}\n')
    write(cwd, "src/slow.test.ts", ["setDefaultTimeout(30_000)", "globalThis.fetch = fake", "const t = globalThis.setTimeout", ""].join("\n"))
    write(cwd, "ci.sh", "ORCHESTRA_LOCAL_TESTS=1 bun test\n")
    commit(cwd, "mistakes")
    const found = runGuards({ cwd, baseRef: "main", approved: [] })
      .findings.filter((finding) => finding.rule !== "protected-paths")
      .map((finding) => `${finding.rule} ${finding.path}:${finding.line}`)
      .sort()
    expect(found).toEqual([
      "llm-elision src/bad.ts:3",
      "local-abs-path src/bad.ts:2",
      "local-tests-escape ci.sh:1",
      "secret-token src/bad.ts:1",
      "test-globalthis src/slow.test.ts:2",
      "test-timeout-raised src/slow.test.ts:1",
      "tls-verify-off src/bad.ts:4",
      "ts-strict-relaxed tsconfig.json:3",
    ])
  })

  // Golden: real git modes, sizes and binary detection, so the file filters (modes, min_bytes, binary, no_shebang) run
  // against what git reports. Clean look-alikes sit beside the defects.
  test("the hygiene pack flags every planted file and nothing in the look-alikes", () => {
    const cwd = guarded()
    write(cwd, "web/.env", "A=1\n")
    write(cwd, "web/.env.example", "A=\n")
    write(cwd, "web/.DS_Store", "x")
    write(cwd, "src/a.ts.orig", "x")
    write(cwd, "scratch/a.ts", "x")
    write(cwd, "pkg/dist/index.js", "x")
    write(cwd, "data/big.json", "x".repeat(1_100_000))
    write(cwd, "tools/blob.bin", "a\0b")
    write(cwd, "lib/key.ts", "-----BEGIN RSA PRIVATE KEY-----\n")
    write(cwd, "docs/tool.md", "hi\n")
    chmodSync(join(cwd, "docs/tool.md"), 0o755)
    symlinkSync("../README.md", join(cwd, "docs/current"))
    // Look-alikes that must stay quiet: executable script with a shebang, media under public/, a small text file.
    write(cwd, "bin/run", "#!/bin/sh\n")
    chmodSync(join(cwd, "bin/run"), 0o755)
    write(cwd, "public/logo.png", "a\0b")
    write(cwd, "docs/readme.md", "hi\n")
    git(cwd, "add", ".")
    // A checkout leaves an empty directory where a submodule is; without it `git diff <base>` omits the gitlink.
    mkdirSync(join(cwd, "vendor/lib"), { recursive: true })
    git(cwd, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},vendor/lib`)
    git(cwd, "commit", "--quiet", "-m", "hygiene")
    const findings = runGuards({ cwd, baseRef: "main", approved: [] }).findings
    expect(findings.map((finding) => `${finding.rule} ${finding.path}`).sort()).toEqual([
      "agent-scratch scratch/a.ts",
      "binary-added tools/blob.bin",
      "build-output pkg/dist/index.js",
      "env-file web/.env",
      "exec-bit docs/tool.md",
      "large-file data/big.json",
      "merge-artifacts src/a.ts.orig",
      "os-junk web/.DS_Store",
      "private-key lib/key.ts",
      "submodule-added vendor/lib",
      "symlink-added docs/current",
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
