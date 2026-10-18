// Opt-in guard for the omni positive control: a test file that drives omni's spawn surface directly must declare,
// with expectSpawn() from test/fixture/omni-expect.ts, which of its tests spawn through omni. Otherwise a focused
// run of it reports "not applicable" instead of holding it to a spawn. A file that cannot declare goes in the ledger
// below with its reason.
//
// What "drives omni's spawn surface directly" means, exactly:
// - The packages are the ones whose bunfig.toml preloads script/test-omni-control.ts, read from the files.
// - The surface is packages/core/src/omni.ts (the counter) plus every tracked source module that calls
//   Omni.count("spawns"). Both are read from the source with the TypeScript parser, not listed here.
// - A test file (*.test.ts, *.test.tsx) in those packages is flagged when one of its value imports (static, re-export or
//   literal dynamic import; `import type` excluded) resolves to the surface, or to a test helper (a non-test file outside
//   any src/ directory) that is itself flagged by the same rule, transitively. Specifiers resolve as relative paths,
//   @orchestra/core/*, and orchestra's @/* and @test/*; anything else is a package and is not followed.
// - It declares when its AST contains a call to an identifier or property named expectSpawn.
//
// Not covered, said plainly: tests that reach omni through general modules (AppProcess, Process, the spawner layer,
// the shell tool). Those are judged by the full suite's control, which every test.yml lane applies.
import { expect, test } from "bun:test"
import { TOML } from "bun"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import ts from "typescript"
import { preloadsControl } from "../../../script/test-ci-request"

const root = path.resolve(import.meta.dir, "../../..")

// Files that drive the surface but declare no spawn, each with its reason. Shrink-only: a stale entry fails.
const ledger: Record<string, string> = {
  "packages/core/test/omni-campaign-inventory.test.ts":
    "tests the omni campaign's process inventory; it reaches the surface only through native/omni/campaign helpers, and its own processes start through node:child_process",
  "packages/core/test/omni-loader.test.ts":
    "unit tests of the loader, the counters (which it takes back) and the verdict; its process-tree case spawns through node:child_process on purpose",
  "apps/desktop/src/main/omni-appcontainer.test.ts":
    "builds the AppContainer command for the supervisor and asserts its arguments; it spawns nothing",
}

function guard(base: string, tracked: string[], exceptions: Record<string, string>) {
  const problems: string[] = []
  const packages = tracked.filter((file) => /^(?:packages|apps)\/[^/]+\/bunfig\.toml$/.test(file))
    .filter((file) => preloadsControl(TOML.parse(readFileSync(path.join(base, file), "utf8")) as { test?: { preload?: unknown } }))
    .map((file) => path.posix.dirname(file) + "/")
  if (packages.length === 0) return { problems: ["no package preloads script/test-omni-control.ts"], flagged: [], checked: 0 }
  const set = new Set(tracked)
  const parsed = new Map<string, ts.SourceFile>()
  const source = (file: string) => parsed.get(file) ?? parsed.set(file,
    ts.createSourceFile(file, readFileSync(path.join(base, file), "utf8"), ts.ScriptTarget.Latest, true)).get(file)!
  const calls = (file: string, match: (call: ts.CallExpression) => boolean) => {
    const visit = (node: ts.Node): boolean => (ts.isCallExpression(node) && match(node)) || ts.forEachChild(node, visit) === true
    return visit(source(file))
  }
  const counts = (call: ts.CallExpression) => ts.isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === "count" && ts.isIdentifier(call.expression.expression) && call.expression.expression.text === "Omni" &&
    call.arguments.length > 0 && ts.isStringLiteral(call.arguments[0]!) && call.arguments[0].text === "spawns"
  const counter = "packages/core/src/omni.ts"
  if (!set.has(counter)) return { problems: [`${counter} is not tracked`], flagged: [], checked: 0 }
  const surface = new Set([counter, ...tracked.filter((file) => /^(?:packages|apps)\/[^/]+\/src\/.*\.tsx?$/.test(file) &&
    !/\.test\.tsx?$/.test(file) && readFileSync(path.join(base, file), "utf8").includes("Omni.count(") && calls(file, counts))])
  if (surface.size === 1) problems.push("no source module calls Omni.count(\"spawns\"); the surface reading broke")
  const resolve = (from: string, specifier: string) => {
    const pkg = from.split("/").slice(0, 2).join("/")
    const stem = specifier.startsWith(".") ? path.posix.join(path.posix.dirname(from), specifier)
      : specifier.startsWith("@orchestra/core/") ? `packages/core/src/${specifier.slice("@orchestra/core/".length)}`
        : pkg === "apps/orchestra" && specifier.startsWith("@/") ? `apps/orchestra/src/${specifier.slice(2)}`
          : pkg === "apps/orchestra" && specifier.startsWith("@test/") ? `apps/orchestra/test/${specifier.slice(6)}`
            : undefined
    if (stem === undefined) return undefined
    return [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`].find((candidate) => set.has(candidate))
  }
  const imports = (file: string) => {
    const found: string[] = []
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly && ts.isStringLiteral(node.moduleSpecifier))
        found.push(node.moduleSpecifier.text)
      if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
        found.push(node.moduleSpecifier.text)
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]!))
        found.push(node.arguments[0].text)
      ts.forEachChild(node, visit)
    }
    visit(source(file))
    return found.flatMap((specifier) => resolve(file, specifier) ?? [])
  }
  const helper = (file: string) => !/\.test\.tsx?$/.test(file) && !file.split("/").includes("src") && /\.tsx?$/.test(file)
  const memo = new Map<string, boolean>()
  const drives = (file: string, seen: Set<string>): boolean => {
    if (memo.has(file)) return memo.get(file)!
    if (seen.has(file)) return false
    seen.add(file)
    const result = imports(file).some((target) => surface.has(target) || (helper(target) && drives(target, seen)))
    memo.set(file, result)
    return result
  }
  const tests = tracked.filter((file) => packages.some((pkg) => file.startsWith(pkg)) && /\.test\.tsx?$/.test(file))
  if (tests.length === 0) problems.push("no test files in the preloading packages")
  const declares = (file: string) => calls(file, (call) =>
    (ts.isIdentifier(call.expression) && call.expression.text === "expectSpawn") ||
    (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "expectSpawn"))
  const flagged = tests.filter((file) => drives(file, new Set()))
  flagged.filter((file) => !declares(file) && !Object.hasOwn(exceptions, file)).forEach((file) =>
    problems.push(`${file} drives omni's spawn surface but no test in it calls expectSpawn(import.meta.path)`))
  Object.keys(exceptions).forEach((file) => {
    if (!flagged.includes(file)) problems.push(`ledger entry ${file} no longer drives omni's spawn surface; remove it`)
    else if (declares(file)) problems.push(`ledger entry ${file} now calls expectSpawn; remove it`)
  })
  return { problems, flagged, checked: tests.length }
}

test("every test file that drives omni's spawn surface declares its spawning tests or is in the ledger", () => {
  const listing = Bun.spawnSync(["git", "ls-files"], { cwd: root })
  expect(listing.exitCode).toBe(0)
  const tracked = listing.stdout.toString().split("\n").filter(Boolean)
  const result = guard(root, tracked, ledger)
  expect(result.problems).toEqual([])
  expect(result.checked).toBeGreaterThan(100)
  // The files this PR declares are seen as driving the surface: the reading engages the real tree.
  expect(result.flagged).toEqual(expect.arrayContaining([
    "packages/core/test/tcp-proxy.test.ts", "apps/orchestra/test/util/process-omni.test.ts",
    "apps/desktop/src/main/omni-process.test.ts", "apps/orchestra/test/mcp/omni-stdio.test.ts",
  ]))
})

test("teeth: undeclared, type-only, helper-reached, declared and stale-ledger files on a planted tree", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "omni-expect-guard-"))
  try {
    const files: Record<string, string> = {
      "packages/core/bunfig.toml": '[test]\npreload = ["../../script/test-omni-control.ts"]\n',
      "packages/other/bunfig.toml": '[test]\npreload = ["./setup.ts"]\n',
      "packages/core/src/omni.ts": "export function count(kind: string) {}\n",
      "packages/core/src/spawner.ts": 'import { Omni } from "./omni"\nexport const run = () => Omni.count("spawns")\n',
      "packages/core/src/router.ts": '// Omni.count("spawns") only in a comment\nexport const route = () => 1\n',
      "packages/core/test/fixture/helper.ts": 'export { run } from "../../src/spawner"\n',
      "packages/core/test/undeclared.test.ts": 'import { run } from "../src/spawner"\nrun()\n',
      "packages/core/test/declared.test.ts": 'import { run } from "@orchestra/core/spawner"\nimport { expectSpawn } from "./fixture/omni-expect"\nexpectSpawn(import.meta.path)\nrun()\n',
      "packages/core/test/type-only.test.ts": 'import type { run } from "../src/spawner"\n',
      "packages/core/test/via-helper.test.ts": 'import { run } from "./fixture/helper"\nrun()\n',
      "packages/core/test/dynamic.test.ts": 'const { run } = await import("../src/spawner")\n',
      "packages/core/test/router.test.ts": 'import { route } from "../src/router"\nroute()\n',
      "packages/core/test/ledgered.test.ts": 'import { count } from "../src/omni"\ncount("x")\n',
      "packages/other/test/ignored.test.ts": 'import { run } from "../../core/src/spawner"\nrun()\n',
    }
    await Promise.all(Object.entries(files).map(async ([file, body]) => {
      await mkdir(path.dirname(path.join(base, file)), { recursive: true })
      await Bun.write(path.join(base, file), body)
    }))
    const tracked = Object.keys(files)
    const result = guard(base, tracked, {
      "packages/core/test/ledgered.test.ts": "reason",
      "packages/core/test/router.test.ts": "stale: router is not on the surface",
      "packages/core/test/declared.test.ts": "redundant: it declares",
    })
    expect(result.flagged.toSorted()).toEqual([
      "packages/core/test/declared.test.ts", "packages/core/test/dynamic.test.ts", "packages/core/test/ledgered.test.ts",
      "packages/core/test/undeclared.test.ts", "packages/core/test/via-helper.test.ts",
    ])
    expect(result.problems.toSorted()).toEqual([
      "ledger entry packages/core/test/declared.test.ts now calls expectSpawn; remove it",
      "ledger entry packages/core/test/router.test.ts no longer drives omni's spawn surface; remove it",
      "packages/core/test/dynamic.test.ts drives omni's spawn surface but no test in it calls expectSpawn(import.meta.path)",
      "packages/core/test/undeclared.test.ts drives omni's spawn surface but no test in it calls expectSpawn(import.meta.path)",
      "packages/core/test/via-helper.test.ts drives omni's spawn surface but no test in it calls expectSpawn(import.meta.path)",
    ])
    // A clean tree passes, and a tree with no preloading package or no counting module is a named failure.
    expect(guard(base, tracked.filter((file) => !/(undeclared|dynamic|via-helper|router)\.test/.test(file)),
      { "packages/core/test/ledgered.test.ts": "reason" }).problems).toEqual([])
    expect(guard(base, tracked.filter((file) => file !== "packages/core/bunfig.toml"), {}).problems)
      .toEqual(["no package preloads script/test-omni-control.ts"])
    expect(guard(base, tracked.filter((file) => file !== "packages/core/src/spawner.ts"), {}).problems)
      .toContain("no source module calls Omni.count(\"spawns\"); the surface reading broke")
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test("the ledger's files exist", () => {
  Object.keys(ledger).forEach((file) => expect(existsSync(path.join(root, file))).toBe(true))
})
