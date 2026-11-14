// Remote-only: node --test script/atlas-genesis/judge-source.test.mjs
import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { excerpt, safeRepoPath } from "./judge-source.mjs"

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "atlas-judge-source-"))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const repo = join(dir, "repo")
  mkdirSync(join(repo, "src"), { recursive: true })
  return { dir, repo }
}

function completeSourceFixture(t) {
  const fixtureData = fixture(t)
  const lines = [
    "// decisiveFlag appears here first, but this comment proves nothing.",
    ...Array.from({ length: 142 }, (_, i) => `// filler ${i}: ${"x".repeat(110)}`),
    "export function decisiveFlag() {",
    '  return "DECISIVE_FOOTER: enabled only at the tail"',
    "}",
    "",
  ]
  writeFileSync(join(fixtureData.repo, "src/flag.ts"), lines.join("\n"))
  return { ...fixtureData, lines }
}

function assertCompleteSource(extract, fixtureData) {
  const expected = `src/flag.ts (lines 1-147)\n\n\`\`\`\n${fixtureData.lines.map((line, i) => `${i + 1}: ${line}`).join("\n")}\n\`\`\``
  for (const name of [undefined, "decisiveFlag", "notPresent"])
    assert.equal(extract(fixtureData.repo, "src/flag.ts", name), expected, "complete numbered source includes the decisive footer")
}

test("whole-file and named subjects preserve every line beyond both old truncation limits", (t) => {
  assertCompleteSource(excerpt, completeSourceFixture(t))
})

test("production tail-dropping mutation fails the same exact full-source assertion", async (t) => {
  const fixtureData = completeSourceFixture(t)
  assertCompleteSource(excerpt, fixtureData)
  const source = readFileSync(new URL("./judge-source.mjs", import.meta.url), "utf8")
  const target = "const body = lines.map("
  assert.equal(source.split(target).length - 1, 1, "mutation must hit exactly one production expression")
  const mutated = source.replace(target, "const body = lines.slice(0, 41).map(")
  const mutant = await import(`data:text/javascript;base64,${Buffer.from(mutated).toString("base64")}`)
  assert.throws(() => assertCompleteSource(mutant.excerpt, fixtureData), {
    code: "ERR_ASSERTION",
    message: /complete numbered source includes the decisive footer/,
  })
})

test("UTF-8 byte bound accepts exactly 256000 bytes and rejects multilingual excess by named error", (t) => {
  const { repo } = fixture(t)
  const text = "界🙂é".repeat(28444) + "xxxx"
  assert.equal(Buffer.byteLength(text, "utf8"), 256000)
  writeFileSync(join(repo, "src/bound.ts"), text)
  assert.equal(excerpt(repo, "src/bound.ts"), `src/bound.ts (lines 1-1)\n\n\`\`\`\n1: ${text}\n\`\`\``)
  writeFileSync(join(repo, "src/over.ts"), text + "é")
  assert.throws(() => excerpt(repo, "src/over.ts", "界"), {
    name: "JudgeSourceTooLargeError",
    code: "JUDGE_SOURCE_TOO_LARGE",
    message: /src\/over\.ts exceeds 256000 UTF-8 bytes; complete source required/,
  })
})

test("safeRepoPath retains the existing rejection and acceptance contract", () => {
  for (const path of [undefined, null, 7, {}, "", "/tmp/secret", "C:secret", "C:/secret", "\\\\host\\secret", "src\\flag.ts", "src//flag.ts", "src/", "../secret", "src/../secret", ".git", ".git/config", "src/.git/config"])
    assert.equal(safeRepoPath(path), false, String(path))
  for (const path of ["src/flag.ts", "./src/flag.ts", ".", ".atlas/fact.json", "src/not..parent.ts", "src/.github.ts"])
    assert.equal(safeRepoPath(path), true, path)
})

test("missing, unsafe and non-file sources are explicit refusals; clean source is real numbered data", (t) => {
  const { repo } = fixture(t)
  writeFileSync(join(repo, "src/clean.ts"), "first\n最后\n")
  assert.equal(excerpt(repo, "src/clean.ts"), "src/clean.ts (lines 1-3)\n\n```\n1: first\n2: 最后\n3: \n```")
  assert.equal(excerpt(repo, "missing.ts"), "(missing.ts is not in the checkout)")
  assert.equal(excerpt(repo, "src"), "(src is not in the checkout)")
  for (const file of ["../secret", ".git/config", "src/../clean.ts", "/etc/passwd", "src\\clean.ts"])
    assert.equal(excerpt(repo, file), `(${file} refused: not a plain repo-relative path)`)
})

test("realpath containment refuses file and directory escapes, including sibling-prefix and hidden credentials", (t) => {
  const { dir, repo } = fixture(t)
  const outside = join(dir, "repo-sibling")
  mkdirSync(join(outside, ".credentials"), { recursive: true })
  writeFileSync(join(outside, ".credentials/token"), "OUTSIDE_CREDENTIAL_MUST_NOT_APPEAR")
  symlinkSync(join(outside, ".credentials/token"), join(repo, "src/innocent.ts"), "file")
  symlinkSync(outside, join(repo, "src/external"), "dir")
  for (const file of ["src/innocent.ts", "src/external/.credentials/token"])
    assert.equal(excerpt(repo, file), `(${file} refused: resolved source is outside the checkout)`)
  mkdirSync(join(repo, ".credentials"))
  writeFileSync(join(repo, ".credentials/token"), "HIDDEN_CREDENTIAL_MUST_NOT_APPEAR")
  symlinkSync(join(repo, ".credentials/token"), join(repo, "src/hidden.ts"), "file")
  assert.equal(excerpt(repo, "src/hidden.ts"), "(src/hidden.ts refused: symlink resolves to hidden source)")
  mkdirSync(join(repo, ".git"))
  writeFileSync(join(repo, ".git/config"), "GIT_CONFIG_MUST_NOT_APPEAR")
  symlinkSync(join(repo, ".git/config"), join(repo, "src/config.ts"), "file")
  assert.equal(excerpt(repo, "src/config.ts"), "(src/config.ts refused: resolved source is under .git)")
  writeFileSync(join(repo, "src/clean.ts"), "REAL_INREPO_SOURCE")
  symlinkSync(join(repo, "src/clean.ts"), join(repo, "src/alias.ts"), "file")
  assert.equal(excerpt(repo, "src/alias.ts"), "src/alias.ts (lines 1-1)\n\n```\n1: REAL_INREPO_SOURCE\n```")
})
