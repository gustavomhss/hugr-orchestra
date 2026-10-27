// The omni positive control (script/test-omni-control.ts) as Bun runs it: each case is a real `bun test` over a
// throwaway directory whose bunfig preloads only the control. Omni.count() stands in for a spawn, so no case needs the
// addon. The closed source ledger pins request-selected test:ci scope, suite-scoped distribution qualification,
// and the strict musl guest's declared scope. Native lanes still require their positive spawn controls.
import { expect, test } from "bun:test"
import { YAML } from "bun"
import { mkdtemp, rm } from "node:fs/promises"
import { readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import ts from "typescript"

const root = path.resolve(import.meta.dir, "../../..")
const omni = JSON.stringify(path.join(root, "packages/core/src/omni.ts"))
const expectations = JSON.stringify(path.join(root, "packages/core/test/fixture/omni-expect.ts"))
const head = `import { test } from "bun:test"\nimport { Omni } from ${omni}\nimport { expectSpawn } from ${expectations}\n`
const plain = `${head}test("plain", () => {})\n`
const silent = `${head}test("declares and spawns nothing", () => { expectSpawn(import.meta.path) })\n`
const spawning = `${head}test("declares and spawns", () => { expectSpawn(import.meta.path); Omni.count("spawns") })\n`
const other = `${head}test("spawns without declaring", () => { Omni.count("spawns") })\n`
const delegated = `${head}test("delegates", () => { Omni.count("delegations") })\n`
const mixed = `${head}test("declares and spawns", () => { expectSpawn(import.meta.path); Omni.count("spawns") })\ntest("plain", () => {})\n`
const skipped = `${head}test.skipIf(true)("declares", () => { expectSpawn(import.meta.path) })\ntest("plain", () => {})\n`
const nonce = "0123456789abcdef0123456789abcdef"

async function control(files: Record<string, string>, env: Record<string, string | undefined>, args: string[] = []) {
  const dir = await mkdtemp(path.join(tmpdir(), "omni-control-"))
  try {
    await Bun.write(path.join(dir, "bunfig.toml"),
      `[test]\npreload = [${JSON.stringify(path.join(root, "script/test-omni-control.ts"))}]\n`)
    await Promise.all(Object.entries(files).map(([name, body]) => Bun.write(path.join(dir, name), body)))
    // This run's own preload marked it as the outermost run; the child must be an outermost run of its own.
    const childEnv: Record<string, string | undefined> = { ...process.env, ORCHESTRA_OMNI_CONTROL_RUN: undefined,
      ORCHESTRA_OMNI_CONTROL: undefined, ORCHESTRA_OMNI_CONTROL_NONCE: undefined, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1", ...env }
    const result = Bun.spawnSync([process.execPath, "test", ...Object.keys(files).map((file) => `./${file}`), ...args], {
      cwd: dir, env: Object.fromEntries(Object.entries(childEnv).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    })
    return { code: result.exitCode, output: `${result.stdout.toString()}\n${result.stderr.toString()}` }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const declared = { ORCHESTRA_OMNI_CONTROL: "declared" }

test("declared: a run in which no declaring test ran and nothing spawned is not applicable and passes", async () => {
  const run = await control({ "plain.test.ts": plain }, declared)
  expect(run.output).toContain("omni positive control: not applicable (focused: no declaring test ran)")
  expect(run.code).toBe(0)
}, 60_000)

test("declared: a declaring test that made no omni spawn fails the run and names its file", async () => {
  const run = await control({ "silent.test.ts": silent, "plain.test.ts": plain }, declared)
  // The path is relative to the run's cwd; Windows may spell the temp directory in its short 8.3 form.
  expect(run.output).toMatch(/omni positive control: FAIL \(declared: 1 test\(s\) in [^)]*silent\.test\.ts\)\. [^\n]*silent\.test\.ts: 1 of 1 declaring test\(s\) made no omni spawn of their own/)
  expect(run.code).not.toBe(0)
}, 60_000)

test("declared: another file's spawn does not satisfy a declaring test that made none", async () => {
  // Named files run in the given order: the other file's spawn is counted before the declaring test starts.
  const run = await control({ "other.test.ts": other, "silent.test.ts": silent }, declared)
  expect(run.output).toMatch(/silent\.test\.ts: 1 of 1 declaring test\(s\) made no omni spawn of their own/)
  expect(run.code).not.toBe(0)
}, 60_000)

test("declared: a declaring test that spawned passes", async () => {
  const run = await control({ "spawning.test.ts": spawning }, declared)
  expect(run.output).toMatch(/omni positive control: pass \(declared: 1 test\(s\) in [^)]*spawning\.test\.ts\); 1 omni spawn\(s\), 0 delegated\./)
  expect(run.code).toBe(0)
}, 60_000)

test("declared: a -t filter or skipIf that leaves a file's declaring tests unrun leaves nothing expected", async () => {
  const filtered = await control({ "mixed.test.ts": mixed }, declared, ["-t", "plain"])
  expect(filtered.output).toContain("omni positive control: not applicable (focused: no declaring test ran)")
  expect(filtered.code).toBe(0)
  const skip = await control({ "skipped.test.ts": skipped }, declared)
  expect(skip.output).toContain("omni positive control: not applicable (focused: no declaring test ran)")
  expect(skip.code).toBe(0)
}, 60_000)

test("declared: a delegation without any omni spawn fails even when nothing is declared", async () => {
  const run = await control({ "delegated.test.ts": delegated }, declared)
  expect(run.output).toContain("omni positive control: FAIL (focused: no declaring test ran)")
  expect(run.output).toContain("delegated 1 spawn(s) to legacy")
  expect(run.code).not.toBe(0)
}, 60_000)

test("suite (unset, as in test.yml and whole-package test:ci): a run that made no omni spawn fails", async () => {
  const run = await control({ "plain.test.ts": plain }, {})
  expect(run.output).toContain("omni positive control: FAIL (suite: every run must spawn through omni)")
  expect(run.code).not.toBe(0)
}, 60_000)

test("suite: a declaring test that made no omni spawn fails even though another test spawned", async () => {
  const run = await control({ "other.test.ts": other, "silent.test.ts": silent }, {})
  expect(run.output).toMatch(/omni positive control: FAIL \(suite: every run must spawn through omni\)\. [^\n]*silent\.test\.ts: 1 of 1/)
  expect(run.code).not.toBe(0)
}, 60_000)

test("the nonce tags exactly one verdict line and is gone from the environment before any test loads", async () => {
  const leak = `import { test } from "bun:test"\ntest("leak", () => { console.log("seen nonce: " + String(process.env.ORCHESTRA_OMNI_CONTROL_NONCE)) })\n`
  const passing = await control({ "leak.test.ts": leak, "spawning.test.ts": spawning }, { ...declared, ORCHESTRA_OMNI_CONTROL_NONCE: nonce })
  expect(passing.output).toContain("seen nonce: undefined")
  expect(passing.output.split(`omni positive control [${nonce}]: `).length - 1).toBe(1)
  expect(passing.output).toContain(`omni positive control [${nonce}]: pass (declared`)
  expect(passing.code).toBe(0)
  const failing = await control({ "silent.test.ts": silent }, { ...declared, ORCHESTRA_OMNI_CONTROL_NONCE: nonce })
  expect(failing.output.split(`omni positive control [${nonce}]: `).length - 1).toBe(1)
  expect(failing.output).toContain(`omni positive control [${nonce}]: FAIL (declared`)
  expect(failing.code).not.toBe(0)
}, 60_000)

test("an invalid scope or nonce fails the run before a test starts", async () => {
  const scope = await control({ "plain.test.ts": plain }, { ORCHESTRA_OMNI_CONTROL: "focused" })
  expect(scope.output).toContain('ORCHESTRA_OMNI_CONTROL="focused" is not suite or declared')
  expect(scope.code).not.toBe(0)
  const empty = await control({ "plain.test.ts": plain }, { ORCHESTRA_OMNI_CONTROL: "" })
  expect(empty.output).toContain('ORCHESTRA_OMNI_CONTROL="" is not suite or declared')
  expect(empty.code).not.toBe(0)
  const bad = await control({ "plain.test.ts": plain }, { ...declared, ORCHESTRA_OMNI_CONTROL_NONCE: "fake" })
  expect(bad.output).toContain("ORCHESTRA_OMNI_CONTROL_NONCE is not 32 lowercase hex digits")
  expect(bad.code).not.toBe(0)
  // A typo reads as legacy in core's flag parser, which would turn the control off; it fails instead.
  const typo = await control({ "plain.test.ts": plain }, { ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strick" })
  expect(typo.output).toContain('ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER="strick" is not 0, 1 or strict')
  expect(typo.code).not.toBe(0)
}, 60_000)

test("legacy rollback checks nothing and says so", async () => {
  const run = await control({ "silent.test.ts": silent }, { ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "0" })
  expect(run.output).toContain("omni positive control: off (legacy rollback); nothing checked.")
  expect(run.code).toBe(0)
}, 60_000)

// Raw bytes, not a parser: a mention in a comment is a false alarm cleared by reading it, never a miss. Spelling the
// name in pieces (string concatenation, a computed key) is not detected; that would be deliberate, not an accident.
const scopeVariable = /ORCHESTRA_OMNI_CONTROL(?![A-Z0-9_])/g
const mentions: Record<string, string> = {
  "script/test-omni-control.ts": "the control reads its scope",
  ".github/workflows/test-ci.yml": "the Run tests step sets the scope from the request (pinned below)",
  "turbo.json": "globalEnv keys cached turbo results by the scope (pinned below)",
  ".github/workflows/distribution-bundle.yml": "native qualification requires suite-wide spawns; focused ABI steps declare (pinned below)",
  "apps/cli/test/fixture/distribution-musl/bootstrap.sh": "strict owned musl guest runs its declaring test (pinned below)",
  "packages/core/test/distribution-bundle-workflow.test.ts": "pins the native workflow's positive suite value and declared steps",
  "packages/core/test/fixture/distribution-bundle.ts": "records the scope a bundle run saw in its evidence",
  "packages/core/test/test-omni-control.test.ts": "this guard and its fixtures",
  "native/omni/campaign/package.json": "the campaign package's test script declares the control, as its tests spawn through omni",
  "AGENTS.md": "documents the control",
}

const ALLOWED_ASSIGNMENTS = {
  ".github/workflows/test-ci.yml": { ORCHESTRA_OMNI_CONTROL: "${{ steps.request.outputs.omni_control }}" },
  ".github/workflows/distribution-bundle.yml": { ORCHESTRA_OMNI_CONTROL: "suite" },
  "apps/cli/test/fixture/distribution-musl/bootstrap.sh": {
    ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict",
    ORCHESTRA_OMNI_CONTROL: "declared",
  },
} as const
const bundlePin = "packages/core/test/distribution-bundle-workflow.test.ts"
// Focused qualification steps that run only their own declaring tests; every other step inherits the job's suite scope.
const DECLARED_STEPS = [
  "Prove native POSIX ABI", "Prove source ABI producers", "Prove Desktop ABI consumer",
  "Prove Schema ELF ABI", "Prove packaged parser ABI",
]
const muslGuest = "apps/cli/test/fixture/distribution-musl-guest.test.ts"

test("only the ledgered files mention the control's scope variable, and test-ci.yml sets it only from the request", () => {
  const listing = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root })
  expect(listing.exitCode).toBe(0)
  const tracked = listing.stdout.toString().split("\0").filter(Boolean)
  expect(tracked.length).toBeGreaterThan(1000)
  const sources = scopeSources(tracked)
  const found = inspectScopeSources(sources)
  expect(found[".github/workflows/test-ci.yml"]).toBe(1)
  expect(found["turbo.json"]).toBe(1)
  expect(readFileSync(path.join(root, "turbo.json"), "utf8")).toMatch(/"globalEnv":\s*\[[^\]]*"ORCHESTRA_OMNI_CONTROL"[^\]]*\]/)
  const workflow = YAML.parse(readFileSync(path.join(root, ".github/workflows/test-ci.yml"), "utf8")) as {
    env?: Record<string, string>
    jobs: Record<string, { env?: Record<string, string>; steps: { name: string; id?: string; run?: string; env?: Record<string, string> }[] }>
  }
  const steps = workflow.jobs.test!.steps
  const run = steps.findIndex((step) => step.name === "Run tests")
  expect(steps[run]?.env?.ORCHESTRA_OMNI_CONTROL).toBe(
    ALLOWED_ASSIGNMENTS[".github/workflows/test-ci.yml"].ORCHESTRA_OMNI_CONTROL,
  )
  expect(steps.find((step) => step.id === "request")?.run).toContain("omni_control=${omniControlScope(request)}")
  const nonce = steps.findIndex((step) => step.name === "Omni control nonce")
  expect(nonce).toBeGreaterThan(-1)
  expect(nonce).toBeLessThan(run)
  expect(steps[nonce]?.run).toContain('echo "omni control nonce: $nonce"')
  expect(steps[nonce]?.run).toContain('echo "ORCHESTRA_OMNI_CONTROL_NONCE=$nonce" >> "$GITHUB_ENV"')
  inspectNativeAssignments(sources, readFileSync(path.join(root, muslGuest), "utf8"))
})

test("native scope and strict-mode mutations of real source fail by exact path", () => {
  const sources = Object.fromEntries(Object.keys(mentions).map((file) => [file, readFileSync(path.join(root, file), "utf8")]))
  const guest = readFileSync(path.join(root, muslGuest), "utf8")
  inspectNativeAssignments(sources, guest)
  const workflow = ".github/workflows/distribution-bundle.yml"
  const musl = "apps/cli/test/fixture/distribution-musl/bootstrap.sh"
  const mutations = [
    ...["declared", "off", "0", "1"].map((value) => [workflow, "ORCHESTRA_OMNI_CONTROL: suite", `ORCHESTRA_OMNI_CONTROL: ${value}`, "OMNI_BUNDLE_SCOPE"]),
    ...["suite", "off"].map((value) => [musl, "ORCHESTRA_OMNI_CONTROL=declared", `ORCHESTRA_OMNI_CONTROL=${value}`, "OMNI_MUSL_ASSIGNMENTS"]),
    [musl, "ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict", "ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=1", "OMNI_MUSL_ASSIGNMENTS"],
    [musl, "bun test --preload /proof/source/script/test-omni-control.ts", "bun test", "OMNI_MUSL_COMMAND"],
    [workflow, 'GITHUB_ACTIONS=false ORCHESTRA_OMNI_CONTROL_NONCE="$nonce" bun test', 'GITHUB_ACTIONS=false ORCHESTRA_OMNI_CONTROL_NONCE="$nonce" ORCHESTRA_OMNI_CONTROL=declared bun test', "OMNI_BUNDLE_STEP_SCOPE"],
    [workflow, "ORCHESTRA_OMNI_CONTROL=declared bun test --timeout 120000 ./test/elf.test.ts", "ORCHESTRA_OMNI_CONTROL=off bun test --timeout 120000 ./test/elf.test.ts", "OMNI_BUNDLE_STEP_SCOPE"],
    ...["declared", "off", "0", "1"].map((value) => [bundlePin, 'job.env.ORCHESTRA_OMNI_CONTROL === "suite"', `job.env.ORCHESTRA_OMNI_CONTROL === "${value}"`, "OMNI_BUNDLE_PIN"]),
  ]
  mutations.forEach(([file, before, after, failure]) => {
    expect(sources[file].split(before)).toHaveLength(2)
    expect(() => inspectNativeAssignments({ ...sources, [file]: sources[file].replace(before, after) }, guest)).toThrow(`${failure}: ${file}`)
  })
  expect(guest.split("expectSpawn(import.meta.path)")).toHaveLength(2)
  expect(() => inspectNativeAssignments(sources, guest.replace("expectSpawn(import.meta.path)", "// expectSpawn(import.meta.path)"))).toThrow(`OMNI_MUSL_GUEST_DECLARE: ${muslGuest}`)
  expect(() => inspectNativeAssignments(sources, guest.replace('import { expectSpawn }', 'import type { expectSpawn }'))).toThrow(`OMNI_MUSL_GUEST_IMPORT: ${muslGuest}`)
})

test("scope extraction has known-file controls and rejects empty, missing, unledgered and stale sources", () => {
  expect(() => scopeSources([])).toThrow("OMNI_SCOPE_LIST_EMPTY")
  expect(() => inspectScopeSources({})).toThrow("OMNI_SCOPE_EXTRACTION_EMPTY")
  const sources = Object.fromEntries(Object.keys(mentions).map((file) => [file, readFileSync(path.join(root, file), "utf8")]))
  expect(inspectScopeSources(sources)["script/test-omni-control.ts"]).toBeGreaterThan(0)
  expect(() => inspectScopeSources(Object.fromEntries(Object.keys(sources).map((file) => [file, ""])))).toThrow("OMNI_SCOPE_EXTRACTION_EMPTY")
  const workflow = ".github/workflows/distribution-bundle.yml"
  expect(() => inspectScopeSources(Object.fromEntries(Object.entries(sources).filter(([file]) => file !== workflow)))).toThrow(`OMNI_SCOPE_STALE: ${workflow}`)
  expect(() => inspectScopeSources({ ...sources, "packages/probe/unledgered.ts": "ORCHESTRA_OMNI_CONTROL=declared" })).toThrow("OMNI_SCOPE_UNLEDGERED: packages/probe/unledgered.ts")
  expect(inspectScopeSources({ ...sources, [workflow]: `${sources[workflow]}\n# no-op control\n` })[workflow]).toBe(inspectScopeSources(sources)[workflow])
})

function scopeSources(tracked: readonly string[]) {
  requireScope(tracked.length > 0, "OMNI_SCOPE_LIST_EMPTY")
  return Object.fromEntries(tracked.flatMap((file) => {
    // Submodules and symlinks to directories have no file content of their own.
    if (!statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) return []
    const text = readFileSync(path.join(root, file), "latin1")
    return text.match(scopeVariable)?.length ? [[file, text]] : []
  }))
}

function inspectScopeSources(sources: Record<string, string>) {
  const found = Object.fromEntries(Object.entries(sources).flatMap(([file, text]) => {
    const count = text.match(scopeVariable)?.length ?? 0
    return count > 0 ? [[file, count]] : []
  }))
  requireScope(Object.keys(found).length > 0, "OMNI_SCOPE_EXTRACTION_EMPTY")
  Object.keys(found).forEach((file) => requireScope(Object.hasOwn(mentions, file), `OMNI_SCOPE_UNLEDGERED: ${file}`))
  Object.keys(mentions).forEach((file) => requireScope(Object.hasOwn(found, file), `OMNI_SCOPE_STALE: ${file}`))
  expect(Object.keys(found).toSorted()).toEqual(Object.keys(mentions).toSorted())
  return found
}

function inspectNativeAssignments(sources: Record<string, string>, guest: string) {
  Object.keys(ALLOWED_ASSIGNMENTS).forEach((file) =>
    requireScope(sources[file]?.trim(), `OMNI_ASSIGNMENTS_SOURCE_EMPTY: ${file}`),
  )
  const workflow = ".github/workflows/distribution-bundle.yml"
  const bundle = YAML.parse(sources[workflow]) as {
    jobs?: { qualification?: { env?: Record<string, unknown>; steps?: { name?: string; run?: string }[] } }
  }
  requireScope(
    bundle?.jobs?.qualification?.env?.ORCHESTRA_OMNI_CONTROL === ALLOWED_ASSIGNMENTS[workflow].ORCHESTRA_OMNI_CONTROL,
    `OMNI_BUNDLE_SCOPE: ${workflow}`,
  )
  // Besides the job's suite scope, exactly the named focused steps declare, once each, inline before their bun test.
  const steps = bundle?.jobs?.qualification?.steps ?? []
  requireScope(
    steps.every((step) => {
      const run = step.run ?? ""
      const count = run.match(scopeVariable)?.length ?? 0
      if (!DECLARED_STEPS.includes(step.name ?? "")) return count === 0
      return count === 1 && run.match(/ORCHESTRA_OMNI_CONTROL=declared bun test /g)?.length === 1
    }) &&
      DECLARED_STEPS.every((name) => steps.filter((step) => step.name === name).length === 1) &&
      sources[workflow].match(scopeVariable)?.length === DECLARED_STEPS.length + 1,
    `OMNI_BUNDLE_STEP_SCOPE: ${workflow}`,
  )
  const musl = "apps/cli/test/fixture/distribution-musl/bootstrap.sh"
  requireScope(
    /^[ \t]*ORCHESTRA_MUSL_GUEST=owned ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=strict ORCHESTRA_OMNI_CONTROL=declared \\\r?$/m.test(sources[musl]) &&
      sources[musl].match(scopeVariable)?.length === 1 &&
      sources[musl].match(/ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER(?![A-Z0-9_])/g)?.length === 1,
    `OMNI_MUSL_ASSIGNMENTS: ${musl}`,
  )
  const muslInvocations = sources[musl].match(/^exec env -i(?:[^\n]*\\\r?\n)*[^\n]*/gm) ?? []
  requireScope(
    muslInvocations.length === 1 && muslInvocations[0].replace(/\\\r?\n[ \t]*/g, " ").trim().split(/\s+/).join(" ") === [
      "exec", "env", "-i", "CI=true", "HOME=/proof/home", "TMPDIR=/proof/tmp", 'PATH="$PATH"', "BUN_INSTALL_CACHE_DIR=/proof/bun-cache",
      "ORCHESTRA_MUSL_GUEST=owned", ...Object.entries(ALLOWED_ASSIGNMENTS[musl]).map(([name, value]) => `${name}=${value}`),
      "bun", "test", "--preload", "/proof/source/script/test-omni-control.ts", "--timeout", "3600000",
      "./test/fixture/distribution-musl-guest.test.ts",
    ].join(" "),
    `OMNI_MUSL_COMMAND: ${musl}`,
  )
  const parsed = ts.createSourceFile(bundlePin, sources[bundlePin] ?? "", ts.ScriptTarget.Latest, true)
  const inspect = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "inspect")
  requireScope(inspect && someNode(inspect, (node) => {
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression) || node.expression.text !== "check" ||
      !node.arguments[1] || !ts.isStringLiteral(node.arguments[1]) || node.arguments[1].text !== "BUNDLE_MATRIX_WIRING")
      return false
    return someNode(node.arguments[0], (child) => ts.isBinaryExpression(child) &&
      child.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      child.left.getText(parsed) === "job.env.ORCHESTRA_OMNI_CONTROL" && ts.isStringLiteral(child.right) &&
      child.right.text === ALLOWED_ASSIGNMENTS[workflow].ORCHESTRA_OMNI_CONTROL)
  }), `OMNI_BUNDLE_PIN: ${bundlePin}`)
  // The pin also spells the declared steps it pins; nothing else in it may name the variable.
  requireScope((sources[bundlePin].match(scopeVariable)?.length ?? 0) ===
    (sources[bundlePin].match(/ORCHESTRA_OMNI_CONTROL=declared bun test /g)?.length ?? 0) + 1, `OMNI_BUNDLE_PIN: ${bundlePin}`)
  const source = ts.createSourceFile(muslGuest, guest, ts.ScriptTarget.Latest, true)
  requireScope(source.statements.some((node) => {
    if (!ts.isImportDeclaration(node) || node.importClause?.isTypeOnly || !ts.isStringLiteral(node.moduleSpecifier) ||
      node.moduleSpecifier.text !== "@orchestra/core/test/fixture/omni-expect") return false
    const bindings = node.importClause?.namedBindings
    return bindings && ts.isNamedImports(bindings) && bindings.elements.some((binding) =>
      binding.name.text === "expectSpawn" && !binding.propertyName && !binding.isTypeOnly)
  }), `OMNI_MUSL_GUEST_IMPORT: ${muslGuest}`)
  requireScope(source.statements.some((node) => {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression) || !ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "test") return false
    const callback = node.expression.arguments[1]
    if (!callback || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body)) return false
    const first = callback.body.statements[0]
    return first && ts.isExpressionStatement(first) && ts.isCallExpression(first.expression) && ts.isIdentifier(first.expression.expression) && first.expression.expression.text === "expectSpawn" && first.expression.arguments.length === 1 && first.expression.arguments[0].getText(source) === "import.meta.path"
  }), `OMNI_MUSL_GUEST_DECLARE: ${muslGuest}`)
}

function someNode(node: ts.Node, match: (node: ts.Node) => boolean): boolean {
  return match(node) || ts.forEachChild(node, (child) => someNode(child, match)) === true
}

function requireScope(value: unknown, failure: string): asserts value {
  if (!value) throw new Error(failure)
}
