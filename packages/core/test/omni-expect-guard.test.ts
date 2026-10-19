// Opt-in guard for the omni positive control: a test file that drives omni's spawn surface directly must declare,
// with expectSpawn() from test/fixture/omni-expect.ts, which of its tests spawn through omni. Otherwise a focused
// run of it reports "not applicable" instead of holding it to a spawn. A file that cannot declare goes in the ledger
// below with its reason.
//
// What "drives omni's spawn surface directly" means, exactly:
// - The packages are the ones whose bunfig.toml preloads script/test-omni-control.ts, read from the files: every
//   package registered in script/module-registry.json (packages/*, apps/*, modules/*, tooling/*), plus every
//   packages/* and apps/* directory, registered or not.
// - The surface is packages/core/src/omni.ts (the counter) plus every tracked source module that calls
//   Omni.count("spawns"), in <package>/src of a registered package or of packages/* and apps/*. Both are read from the
//   source with the TypeScript parser, not listed here.
// - A test file (*.test.ts, *.test.tsx) in those packages is flagged when one of its value imports (static, re-export or
//   literal dynamic import; `import type` excluded) resolves to the surface, or to a test helper (a non-test file outside
//   any src/ directory) that is itself flagged by the same rule, transitively. Specifiers resolve as relative paths,
//   @orchestra/core/*, @orchestra/<registered package>/* through the registry path and that package.json's exports (no
//   node_modules), and orchestra's @/* and @test/*; anything else is a package and is not followed.
// - It declares when its AST contains a call to an identifier or property named expectSpawn.
//
// Not covered, said plainly: tests that reach omni through general modules (AppProcess, Process, the spawner layer,
// the shell tool). Those are judged by the full suite's control, which test.yml applies to every lane of a package that
// preloads it. app-shell preloads it only in its test:browser script, so its test-browser files are outside this guard.
import { expect, test } from "bun:test"
import { TOML } from "bun"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import ts from "typescript"
import { preloadsControl } from "../../../script/test-ci-request"

const root = path.resolve(import.meta.dir, "../../..")

// The CLI's artifact tests reach the surface only through apps/cli/script/artifact-native.ts artifactWindowsFFI(),
// whose omni compile of the native helper runs on win32-arm64 alone and once per process (ArtifactNativeWindows.load()
// caches it), so no single test of theirs owns that spawn. fixture/artifact-native-windows-controls.ts declares it.
const cliArtifactFFI =
  "reaches ArtifactNativeWindows only through script/artifact-native.ts artifactWindowsFFI(): one cached omni compile per process, on win32-arm64 only, declared by fixture/artifact-native-windows-controls.ts"

// Files that drive the surface but declare no spawn, each with its reason. Shrink-only: a stale entry fails.
const ledger: Record<string, string> = {
  "apps/cli/test/artifact-abi.test.ts": cliArtifactFFI,
  "apps/cli/test/artifact-case-alias.test.ts": cliArtifactFFI,
  "apps/cli/test/artifact-fs.test.ts": cliArtifactFFI,
  "apps/cli/test/artifact-posix-race.test.ts": cliArtifactFFI,
  "apps/cli/test/distribution-install-preservation.test.ts": cliArtifactFFI,
  "apps/cli/test/distribution-install.test.ts": cliArtifactFFI,
  "apps/cli/test/distribution-npm.test.ts": cliArtifactFFI,
  "apps/cli/test/distribution-payload-integrity.test.ts": cliArtifactFFI,
  "apps/cli/test/distribution-payload.test.ts":
    "its own Windows ABI test calls ArtifactNativeWindows' pure PE checks and spawns nothing; the spawning Windows controls it imports declare in fixture/artifact-native-windows-controls.ts",
  "apps/cli/test/export-artifacts.test.ts": cliArtifactFFI,
  "packages/core/test/omni-campaign-inventory.test.ts":
    "tests the omni campaign's process inventory; it reaches the surface only through native/omni/campaign helpers, and its own processes start through node:child_process",
  "packages/core/test/omni-loader.test.ts":
    "unit tests of the loader, the counters (which it takes back) and the verdict; its process-tree case spawns through node:child_process on purpose",
  "apps/desktop/src/main/omni-appcontainer.test.ts":
    "builds the AppContainer command for the supervisor and asserts its arguments; it spawns nothing",
}

function guard(base: string, tracked: string[], exceptions: Record<string, string>) {
  const problems: string[] = []
  const registryFile = "script/module-registry.json"
  if (!tracked.includes(registryFile)) return { problems: [`${registryFile} is not tracked`], flagged: [], checked: 0 }
  const modules = (JSON.parse(readFileSync(path.join(base, registryFile), "utf8")) as { modules?: { name: string; path: string }[] }).modules ?? []
  if (modules.length === 0) return { problems: [`${registryFile} registers no module`], flagged: [], checked: 0 }
  const directories = new Set(modules.map((module) => module.path))
  const packages = tracked.filter((file) => /^(?:packages|apps)\/[^/]+\/bunfig\.toml$/.test(file) || (file.endsWith("/bunfig.toml") && directories.has(path.posix.dirname(file))))
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
  const sources = (file: string) => /^(?:packages|apps)\/[^/]+\/src\/.*\.tsx?$/.test(file) ||
    (/\.tsx?$/.test(file) && modules.some((module) => file.startsWith(`${module.path}/src/`)))
  const surface = new Set([counter, ...tracked.filter((file) => sources(file) &&
    !/\.test\.tsx?$/.test(file) && readFileSync(path.join(base, file), "utf8").includes("Omni.count(") && calls(file, counts))])
  if (surface.size === 1) problems.push("no source module calls Omni.count(\"spawns\"); the surface reading broke")
  const resolve = (from: string, specifier: string) => {
    const pkg = from.split("/").slice(0, 2).join("/")
    const stems = [
      specifier.startsWith(".") ? path.posix.join(path.posix.dirname(from), specifier)
        : specifier.startsWith("@orchestra/core/") ? `packages/core/src/${specifier.slice("@orchestra/core/".length)}`
          : pkg === "apps/orchestra" && specifier.startsWith("@/") ? `apps/orchestra/src/${specifier.slice(2)}`
            : pkg === "apps/orchestra" && specifier.startsWith("@test/") ? `apps/orchestra/test/${specifier.slice(6)}`
              : undefined,
      registered(specifier),
    ].flatMap((stem) => stem ?? [])
    return stems.flatMap((stem) => [stem, `${stem}.ts`, `${stem}.tsx`, `${stem}/index.ts`]).find((candidate) => set.has(candidate))
  }
  // @orchestra/<registered>[/subpath] through the registry's path and that package.json's exports, as node would, but
  // from the tracked files: a registered package needs no node_modules link to be followed.
  const registered = (specifier: string) => {
    const module = modules.find((entry) => entry.name.startsWith("@orchestra/") && (specifier === entry.name || specifier.startsWith(`${entry.name}/`)))
    if (module === undefined || !set.has(`${module.path}/package.json`)) return undefined
    const exported = (JSON.parse(readFileSync(path.join(base, module.path, "package.json"), "utf8")) as { exports?: unknown }).exports
    if (typeof exported !== "object" || exported === null) return undefined
    const subpath = `.${specifier.slice(module.name.length)}`
    const entries = Object.entries(exported)
    const hit = entries.find(([key]) => key === subpath) ?? entries.find(([key]) => {
      const star = key.indexOf("*")
      return star >= 0 && subpath.startsWith(key.slice(0, star)) && subpath.endsWith(key.slice(star + 1))
    })
    if (hit === undefined) return undefined
    const star = hit[0].indexOf("*")
    const target = exportTarget(hit[1])
    if (target === undefined) return undefined
    return path.posix.join(module.path, star < 0 ? target : target.replace("*", subpath.slice(star, subpath.length - (hit[0].length - star - 1))))
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

// A package.json export target: a path, or the first path under a condition (default, import, bun, in that order).
function exportTarget(value: unknown): string | undefined {
  if (typeof value === "string") return value
  if (typeof value !== "object" || value === null) return undefined
  return ["default", "import", "bun"].map((condition) => exportTarget((value as Record<string, unknown>)[condition])).find((target) => target !== undefined)
}

test("every test file that drives omni's spawn surface declares its spawning tests or is in the ledger", () => {
  const listing = Bun.spawnSync(["git", "ls-files"], { cwd: root })
  expect(listing.exitCode).toBe(0)
  const tracked = listing.stdout.toString().split("\n").filter(Boolean)
  const result = guard(root, tracked, ledger)
  expect(result.problems).toEqual([])
  expect(result.checked).toBeGreaterThan(100)
  // The files reached before registered packages were (the declared ones, and every ledger entry, which must be
  // flagged to stand) are still reached: the reading engages the real tree and only ever grew.
  expect(result.flagged).toEqual(expect.arrayContaining([
    "packages/core/test/tcp-proxy.test.ts", "apps/orchestra/test/util/process-omni.test.ts", "apps/cli/test/distribution-process.test.ts",
    "apps/desktop/src/main/omni-process.test.ts", "apps/orchestra/test/mcp/omni-stdio.test.ts", ...Object.keys(ledger),
  ]))
})

test("teeth: undeclared, type-only, helper-reached, declared and stale-ledger files on a planted tree", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "omni-expect-guard-"))
  try {
    const control = '[test]\npreload = ["../../script/test-omni-control.ts"]\n'
    const files: Record<string, string> = {
      "script/module-registry.json": JSON.stringify({ modules: [
        { name: "@orchestra/core", path: "packages/core" }, { name: "@orchestra/probe", path: "modules/probe" },
        { name: "@orchestra/plain", path: "modules/plain" },
      ] }),
      // modules/probe is registered and preloads the control: its src is surface and its tests are held, with its
      // exports (a condition and a wildcard) resolved from package.json. modules/plain is registered without the
      // control, modules/ghost has the control but is not registered: neither is reached.
      "modules/probe/package.json": JSON.stringify({ exports: {
        ".": "./src/index.ts", "./spawn": { types: "./src/spawn.d.ts", default: "./src/spawn.ts" }, "./lib/*": "./src/lib/*.ts",
      } }),
      "modules/probe/bunfig.toml": control,
      "modules/probe/src/index.ts": "export const idle = 1\n",
      "modules/probe/src/spawn.ts": 'export const go = () => Omni.count("spawns")\n',
      "modules/probe/src/lib/count.ts": 'export const again = () => Omni.count("spawns")\n',
      "modules/probe/test/module-own-undeclared.test.ts": 'import { go } from "../src/spawn"\ngo()\n',
      "modules/probe/test/module-core-undeclared.test.ts": 'import { run } from "@orchestra/core/spawner"\nrun()\n',
      "modules/probe/test/module-exports-undeclared.test.ts": 'import { go } from "@orchestra/probe/spawn"\ngo()\n',
      "modules/probe/test/module-wild-undeclared.test.ts": 'import { again } from "@orchestra/probe/lib/count"\nagain()\n',
      "modules/probe/test/module-declared.test.ts": 'import { go } from "@orchestra/probe/spawn"\nimport { expectSpawn } from "x"\nexpectSpawn(import.meta.path)\ngo()\n',
      "modules/probe/test/idle.test.ts": 'import { idle } from "@orchestra/probe"\nidle\n',
      "packages/core/test/cross-undeclared.test.ts": 'import { go } from "@orchestra/probe/spawn"\ngo()\n',
      "modules/plain/package.json": "{}",
      "modules/plain/bunfig.toml": '[test]\npreload = ["./setup.ts"]\n',
      "modules/plain/test/plain.test.ts": 'import { run } from "../../../packages/core/src/spawner"\nrun()\n',
      "modules/ghost/bunfig.toml": control,
      "modules/ghost/test/ghost.test.ts": 'import { run } from "../../../packages/core/src/spawner"\nrun()\n',
      "packages/core/bunfig.toml": control,
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
    const undeclared = (file: string) => `${file} drives omni's spawn surface but no test in it calls expectSpawn(import.meta.path)`
    expect(result.flagged.toSorted()).toEqual([
      "modules/probe/test/module-core-undeclared.test.ts", "modules/probe/test/module-declared.test.ts",
      "modules/probe/test/module-exports-undeclared.test.ts", "modules/probe/test/module-own-undeclared.test.ts",
      "modules/probe/test/module-wild-undeclared.test.ts",
      "packages/core/test/cross-undeclared.test.ts", "packages/core/test/declared.test.ts", "packages/core/test/dynamic.test.ts",
      "packages/core/test/ledgered.test.ts", "packages/core/test/undeclared.test.ts", "packages/core/test/via-helper.test.ts",
    ])
    expect(result.problems.toSorted()).toEqual([
      "ledger entry packages/core/test/declared.test.ts now calls expectSpawn; remove it",
      "ledger entry packages/core/test/router.test.ts no longer drives omni's spawn surface; remove it",
      undeclared("modules/probe/test/module-core-undeclared.test.ts"),
      undeclared("modules/probe/test/module-exports-undeclared.test.ts"),
      undeclared("modules/probe/test/module-own-undeclared.test.ts"),
      undeclared("modules/probe/test/module-wild-undeclared.test.ts"),
      undeclared("packages/core/test/cross-undeclared.test.ts"),
      undeclared("packages/core/test/dynamic.test.ts"),
      undeclared("packages/core/test/undeclared.test.ts"),
      undeclared("packages/core/test/via-helper.test.ts"),
    ].toSorted())
    // A clean tree passes, and a tree with no preloading package or no counting module is a named failure.
    expect(guard(base, tracked.filter((file) => !/(undeclared|dynamic|via-helper|router)\.test/.test(file)),
      { "packages/core/test/ledgered.test.ts": "reason" }).problems).toEqual([])
    expect(guard(base, tracked.filter((file) => !/^(?:packages\/core|modules\/probe|modules\/ghost)\/bunfig\.toml$/.test(file)), {}).problems)
      .toEqual(["no package preloads script/test-omni-control.ts"])
    expect(guard(base, tracked.filter((file) => file !== "script/module-registry.json"), {}).problems)
      .toEqual(["script/module-registry.json is not tracked"])
    expect(guard(base, tracked.filter((file) => file !== "packages/core/src/spawner.ts" && !file.startsWith("modules/probe/src/")), {}).problems)
      .toContain("no source module calls Omni.count(\"spawns\"); the surface reading broke")
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

// The converse leg: a test file that calls expectSpawn is held to it only when the control is loaded, so its package
// must preload script/test-omni-control.ts, in bunfig.toml or in a package.json script whose `bun test` names the
// file's top directory (app-shell's test:browser). Without the control, expectSpawn records into a list nobody reads.
function uncontrolled(base: string, tracked: string[]) {
  const declaring = tracked.filter((file) => /\.test\.tsx?$/.test(file)).filter((file) => {
    const text = readFileSync(path.join(base, file), "utf8")
    if (!text.includes("expectSpawn")) return false
    const visit = (node: ts.Node): boolean => (ts.isCallExpression(node) && (
      (ts.isIdentifier(node.expression) && node.expression.text === "expectSpawn") ||
      (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "expectSpawn"))) ||
      ts.forEachChild(node, visit) === true
    return visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true))
  })
  if (declaring.length === 0) return ["no test file calls expectSpawn; the reading broke"]
  const set = new Set(tracked)
  return declaring.flatMap((file) => {
    const parts = file.split("/")
    const pkg = parts.slice(0, -1).map((_, index) => parts.slice(0, parts.length - 1 - index).join("/") + "/")
      .find((dir) => set.has(`${dir}package.json`))
    if (pkg === undefined) return [`${file} calls expectSpawn outside any package`]
    const bunfig = `${pkg}bunfig.toml`
    if (set.has(bunfig) && preloadsControl(TOML.parse(readFileSync(path.join(base, bunfig), "utf8")) as { test?: { preload?: unknown } }))
      return []
    const top = file.slice(pkg.length).split("/")[0]
    const scripts = Object.values((JSON.parse(readFileSync(path.join(base, `${pkg}package.json`), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {})
    const covered = scripts.some((script) => /\bbun test\b/.test(script) &&
      /--preload\s+(?:\.\.\/)+script\/test-omni-control\.ts(?:\s|$)/.test(script) && script.split(/\s+/).includes(`./${top}`))
    return covered ? [] : [`${file} calls expectSpawn but ${pkg} does not preload script/test-omni-control.ts for it`]
  })
}

test("every test file that calls expectSpawn runs under the omni positive control", () => {
  const listing = Bun.spawnSync(["git", "ls-files"], { cwd: root })
  expect(listing.exitCode).toBe(0)
  expect(uncontrolled(root, listing.stdout.toString().split("\n").filter(Boolean))).toEqual([])
})

test("teeth: a declaring test file in a package without the control fails by name", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "omni-expect-control-"))
  try {
    const declares = 'import { expectSpawn } from "x"\ntest("a", () => { expectSpawn(import.meta.path) })\n'
    const files: Record<string, string> = {
      "packages/a/package.json": "{}",
      "packages/a/bunfig.toml": '[test]\npreload = ["../../script/test-omni-control.ts"]\n',
      "packages/a/test/a.test.ts": declares,
      "packages/b/package.json": '{"scripts":{"test":"bun test --preload ./happydom.ts ./src"}}',
      "packages/b/bunfig.toml": '[test]\npreload = ["../../script/test-guard.ts"]\n',
      "packages/b/test/b.test.ts": declares,
      "packages/c/package.json": '{"scripts":{"test:browser":"bun test --preload ../../script/test-omni-control.ts ./test-browser"}}',
      "packages/c/test-browser/c.test.ts": declares,
      "packages/c/src/c.test.ts": declares,
      "packages/c/test/comment.test.ts": "// expectSpawn(import.meta.path) only in a comment\n",
    }
    await Promise.all(Object.entries(files).map(async ([file, body]) => {
      await mkdir(path.dirname(path.join(base, file)), { recursive: true })
      await Bun.write(path.join(base, file), body)
    }))
    const tracked = Object.keys(files)
    expect(uncontrolled(base, tracked).toSorted()).toEqual([
      "packages/b/test/b.test.ts calls expectSpawn but packages/b/ does not preload script/test-omni-control.ts for it",
      "packages/c/src/c.test.ts calls expectSpawn but packages/c/ does not preload script/test-omni-control.ts for it",
    ])
    expect(uncontrolled(base, tracked.filter((file) => !/[bc]\.test/.test(file) || file.includes("test-browser")))).toEqual([])
    expect(uncontrolled(base, ["packages/c/test/comment.test.ts"])).toEqual(["no test file calls expectSpawn; the reading broke"])
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

test("the ledger's files exist", () => {
  Object.keys(ledger).forEach((file) => expect(existsSync(path.join(root, file))).toBe(true))
})
