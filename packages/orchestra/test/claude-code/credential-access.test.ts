import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import ts from "typescript"

// Repair/extension: JS/TS call names may be identifiers, properties or literal string elements, with parentheses,
// whitespace and comments. Bun receivers are structural identifiers. readFile/readFileSync/createReadStream and
// Bun.file inspect only argument 0: string literals (including no-substitution templates), or join/resolve calls
// named directly or on path/path.posix/path.win32, recursively through those builders' path arguments only.
// Node spawn/spawnSync/execFile/execFileSync inspect executable argument 0 and literal argv argument 1;
// Bun spawn/spawnSync inspect argument 0's literal command array or object-literal cmd array. Exec/execSync inspect
// only literal command argument 0 for security password-lookup indicators, not shell semantics. Literal argv elements
// and executable paths use the same parenthesis handling. .claudeAiOauth / ["claudeAiOauth"] access is also guarded.
// It does not resolve symbols/import aliases, nonliteral member keys, other path computations, data flow or arbitrary
// shell/wrapper execution. Python/shell retain conservative raw credential indicators, not a parsed read audit.
// This is not proof of every possible read.
// Claude Code signs in from its own store; Orchestra learns status from the SDK (specs/claude-code-engine.md, "Auth").

const ROOT = path.resolve(import.meta.dir, "../../../..")
const SCOPE = [
  "packages/*/{src,script}/**/*.{ts,tsx,js,mjs,cjs,py,sh}",
  "modules/*/{src,script}/**/*.{ts,tsx,js,mjs,cjs,py,sh}",
  "modules/*/*/{src,script}/**/*.{ts,tsx,js,mjs,cjs,py,sh}",
]
const READS = [/find-(generic|internet)-password/, /\.credentials\.json/, /Claude Code-credentials/, /claudeAiOauth/]

function hits(file: string, text: string) {
  if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file))
    return text.split("\n").flatMap((line, index) => READS.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  function visit(node: ts.Node) {
    const name = ts.isCallExpression(node) ? callName(node.expression) : undefined
    const read = ts.isCallExpression(node) && name !== undefined &&
      (["readFile", "readFileSync", "createReadStream"].includes(name) || name === "file" && bunReceiver(node.expression)) &&
      pathLiterals(node.arguments[0]).some((value) => value.includes(".credentials.json"))
    const lookup = ts.isCallExpression(node) && passwordLookup(node)
    const record = ts.isPropertyAccessExpression(node) && node.name.text === "claudeAiOauth" ||
      ts.isElementAccessExpression(node) && literal(node.argumentExpression) === "claudeAiOauth"
    if (read || lookup || record)
      found.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${node.getText(source)}`)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function unwrap(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node
}

function literal(node: ts.Expression | undefined) {
  if (!node) return undefined
  const expression = unwrap(node)
  return ts.isStringLiteralLike(expression) ? expression.text : undefined
}

function callName(node: ts.Expression) {
  const expression = unwrap(node)
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  if (ts.isElementAccessExpression(expression)) return literal(expression.argumentExpression)
  return undefined
}

function bunReceiver(node: ts.Expression) {
  const expression = unwrap(node)
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return false
  const receiver = unwrap(expression.expression)
  return ts.isIdentifier(receiver) && receiver.text === "Bun"
}

function pathLiterals(node: ts.Expression | undefined): string[] {
  if (!node) return []
  const expression = unwrap(node)
  if (ts.isStringLiteralLike(expression)) return [expression.text]
  if (!ts.isCallExpression(expression) || !["join", "resolve"].includes(callName(expression.expression) ?? "")) return []
  const builder = unwrap(expression.expression)
  const receiver = ts.isPropertyAccessExpression(builder) || ts.isElementAccessExpression(builder)
    ? unwrap(builder.expression) : undefined
  const namespace = receiver && (ts.isPropertyAccessExpression(receiver) || ts.isElementAccessExpression(receiver))
    ? unwrap(receiver.expression) : undefined
  if (!ts.isIdentifier(builder) && !(receiver && ts.isIdentifier(receiver) && receiver.text === "path") &&
    !(receiver && namespace && ts.isIdentifier(namespace) && namespace.text === "path" && ["posix", "win32"].includes(callName(receiver) ?? ""))) return []
  return expression.arguments.flatMap(pathLiterals)
}

function passwordLookup(node: ts.CallExpression) {
  const name = callName(node.expression)
  if (name === "exec" || name === "execSync") {
    const command = literal(node.arguments[0]) ?? ""
    return /(?:^|[\/\s])security(?:\s|$)/.test(command) && /find-(generic|internet)-password/.test(command)
  }
  if (name === undefined || !["spawn", "spawnSync", "execFile", "execFileSync"].includes(name)) return false
  if (!node.arguments[0]) return false
  const first = unwrap(node.arguments[0])
  const command = bunReceiver(node.expression) && (name === "spawn" || name === "spawnSync")
    ? ts.isObjectLiteralExpression(first)
      ? first.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) ? property.name.text : ts.isComputedPropertyName(property.name)
          ? literal(property.name.expression) : property.name.text) === "cmd")?.initializer
      : first
    : undefined
  const argv = command ? unwrap(command) : node.arguments[1] ? unwrap(node.arguments[1]) : undefined
  if (!argv || !ts.isArrayLiteralExpression(argv)) return false
  const executable = command ? argv.elements[0] : first
  return pathLiterals(executable).some((value) => /(?:^|[\/\\])security$/.test(value)) &&
    argv.elements.slice(command ? 1 : 0).some((value) => /^find-(generic|internet)-password$/.test(literal(value) ?? ""))
}

const ACCESS_CONTROLS = [
  { name: "original Node spawnSync lookup", text: 'spawnSync("security", ["find-generic-password", "-s", service])' },
  { name: "original Bun command array lookup", text: 'Bun.spawn(["/usr/bin/security", "find-internet-password"])' },
  { name: "original execFile lookup", text: 'execFile("security", ["find-internet-password"])' },
  { name: "original execFileSync lookup", text: 'execFileSync("security", ["find-generic-password"])' },
  { name: "original exec command lookup", text: 'exec("security find-generic-password -s \\"Claude Code-credentials\\"")' },
  { name: "original execSync command lookup", text: 'execSync("security find-internet-password")' },
  { name: "original joined credential path", text: 'readFileSync(join(dir, ".credentials.json"))' },
  { name: "original namespaced readFile", text: 'fs.readFile("/home/owner/.claude/.credentials.json")' },
  { name: "original stream read", text: 'createReadStream(".credentials.json")' },
  { name: "original Bun file path", text: 'Bun.file(join(dir, ".credentials.json")).json()' },
  { name: "original OAuth property access", text: "parsed.claudeAiOauth.accessToken" },
  { name: "original OAuth literal element access", text: 'parsed["claudeAiOauth"].accessToken' },
  { name: "multiline process argv", text: 'spawnSync(\n"security",\n["find-generic-password"]\n)' },
  { name: "Bun namespace whitespace", text: 'Bun . file(".credentials.json")' },
  { name: "Bun namespace comments", text: 'Bun /* receiver */ . /* method */ file(".credentials.json")' },
  { name: "Bun literal element call", text: 'Bun["file"](".credentials.json")' },
  { name: "fs literal element call", text: 'fs["readFileSync"](".credentials.json")' },
  { name: "parenthesized read function", text: '(readFileSync)(".credentials.json")' },
  { name: "parenthesized Bun receiver, callee and path", text: '((Bun)[("file")])((".credentials.json"))' },
  { name: "namespaced resolved path", text: 'fs.readFileSync(path.resolve(dir, path.join(".claude", ".credentials.json")))' },
  { name: "literal element path builder", text: 'readFileSync(path["join"](dir, ".credentials.json"))' },
  { name: "posix path builder", text: 'readFileSync(path.posix.join(dir, ".credentials.json"))' },
  { name: "win32 path builder", text: 'readFileSync(path.win32.resolve(dir, ".credentials.json"))' },
  { name: "literal template path", text: 'Bun.file(`.credentials.json`)' },
  { name: "structural Node process callee", text: '(cp["spawnSync"])("security", ["find-generic-password"])' },
  { name: "structural Bun process array", text: '(Bun /* receiver */ ["spawnSync"])(["security", "find-generic-password"])' },
  { name: "Bun documented cmd option", text: 'Bun.spawn({ cmd: ["security", "find-generic-password"], env: {} })' },
  { name: "Bun literal cmd key", text: 'Bun["spawn"]({ ["cmd"]: ["security", "find-internet-password"] })' },
  { name: "nested actual read in benign callback", text: 'fs.readFile("settings", () => readFileSync(".credentials.json"))' },
  { name: "nested actual read in options", text: 'fs.readFile("settings", { value: Bun["file"](".credentials.json") })' },
]

for (const control of ACCESS_CONTROLS)
  test(`credential access detected: ${control.name}`, () => expect(hits("sample.ts", control.text)).toHaveLength(1))

const BENIGN_CONTROLS = [
  { name: "callback mention", text: 'fs.readFile("settings", () => console.log(".credentials.json"))' },
  { name: "options mention", text: 'fs.readFileSync("settings", { example: ".credentials.json" })' },
  { name: "Bun options mention", text: 'Bun.file("settings", { example: ".credentials.json" })' },
  { name: "unknown path wrapper mention", text: 'readFileSync(describe("settings", ".credentials.json"))' },
  { name: "path builder callback mention", text: 'readFileSync(path.join("settings", () => console.log(".credentials.json")))' },
  { name: "unrelated join receiver", text: 'readFileSync(logger.join("settings", ".credentials.json"))' },
  { name: "Node process callback mention", text: 'execFile("security", ["help"], () => console.log("find-generic-password"))' },
  { name: "Node process options mention", text: 'spawnSync("security", ["help"], { example: "find-generic-password" })' },
  { name: "different executable with security in argv", text: 'spawnSync("echo", ["security", "find-generic-password"])' },
  { name: "Bun process options mention", text: 'Bun.spawn({ cmd: ["security", "help"], env: { example: "find-generic-password" } })' },
  { name: "Bun process non-cmd mention", text: 'Bun.spawn({ cmd: ["echo"], example: ["security", "find-generic-password"] })' },
  { name: "exec callback mention", text: 'exec("security help", () => console.log("find-generic-password"))' },
]

for (const control of BENIGN_CONTROLS)
  test(`credential mention ignored: ${control.name}`, () => expect(hits("sample.ts", control.text)).toEqual([]))

test("comments, strings and policy fixtures mentioning credentials are not reads", () => {
  const text = [
    '// readFileSync(".credentials.json"); security find-generic-password; parsed.claudeAiOauth',
    'const service = "Claude Code-credentials"',
    'const policy = { denied: [".credentials.json", "claudeAiOauth", "find-internet-password"] }',
    'expect(message).toContain(".credentials.json")',
    'const credentials = await ask("the owner")',
    'readFileSync("settings.json")',
    'execFile("security", ["help"])',
  ].join("\n")
  expect(hits("sample.ts", text)).toEqual([])
  expect(hits("sample.tsx", `${text}\nconst view = <div>.credentials.json</div>`)).toEqual([])
  // Raw non-JS sentinels keep their original reach; these languages are not silently skipped.
  expect(hits("sample.sh", 'security find-generic-password -s "Claude Code-credentials"')).toHaveLength(1)
  expect(hits("sample.py", 'open(".credentials.json").read()')).toHaveLength(1)
  expect(hits("sample.sh", "claude auth status --json")).toEqual([])
})

async function inventory(root: string) {
  const files = (await Promise.all(SCOPE.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: root }))))).flat()
  return files.map((file) => file.replaceAll("\\", "/")).filter((file) => !file.split("/").includes("node_modules"))
}

test("Bun inventory reaches planted package source, script and Desktop test reads from the supplied root", async () => {
  await using fixture = {
    root: await mkdtemp(path.join(tmpdir(), "credential-inventory-")),
    [Symbol.asyncDispose]() { return rm(this.root, { recursive: true, force: true }) },
  }
  const planted = [
    { file: "packages/orchestra/src/claude-code/sdk.ts", text: 'fs.readFile("settings", () => console.log(".credentials.json"))' },
    { file: "packages/desktop/src/main/credential-control.test.ts", text: 'Bun["file"](".credentials.json")' },
    { file: "packages/desktop/script/credential-control.cjs", text: '(readFileSync)(".credentials.json")' },
    { file: "packages/desktop/src/main/noop.ts", text: '// Bun["file"](".credentials.json")' },
    { file: "modules/capability-assets/src/catalog.ts", text: 'Bun["file"](".credentials.json")' },
    { file: "modules/maestro/arsenal/src/registry.ts", text: '(readFileSync)(".credentials.json")' },
    { file: "packages/desktop/src/node_modules/ignored.ts", text: 'Bun["file"](".credentials.json")' },
    { file: "packages/desktop/test/outside.ts", text: 'Bun["file"](".credentials.json")' },
  ]
  await Promise.all(planted.map(async (item) => {
    await mkdir(path.dirname(path.join(fixture.root, item.file)), { recursive: true })
    await Bun.write(path.join(fixture.root, item.file), item.text)
  }))
  const files = await inventory(fixture.root)
  expect(files.toSorted()).toEqual(planted.slice(0, 6).map((item) => item.file).toSorted())
  const found = (await Promise.all(files.map(async (file) => hits(file, await Bun.file(path.join(fixture.root, file)).text())))).flat()
  expect(found).toHaveLength(4)
  expect(found.some((hit) => hit.includes("credential-control.test.ts:"))).toBe(true)
  expect(found.some((hit) => hit.includes("credential-control.cjs:"))).toBe(true)
})

test("package sources and scripts contain no declared credential access constructs or raw non-JS indicators", async () => {
  const scanned = await inventory(ROOT)
  // Positive controls: the scan reaches Claude mode's spawn seam and a broad slice of the repository.
  expect(scanned).toContain("packages/orchestra/src/claude-code/sdk.ts")
  expect(scanned).toContain("packages/desktop/src/main/index.ts")
  expect(scanned).toContain("modules/capability-assets/src/catalog.ts")
  expect(scanned).toContain("modules/relay/src/arm/evaluate.ts")
  expect(scanned).toContain("modules/maestro/arsenal/src/registry.ts")
  expect(scanned.length).toBeGreaterThan(500)
  const found = (await Promise.all(scanned.map(async (file) => hits(file, await Bun.file(path.join(ROOT, file)).text())))).flat()
  if (found.length) throw new Error(["Credential access constructs or raw non-JS indicators found:", ...found].join("\n"))
  // Real-source teeth in both SDK and Desktop: no source-directory or test-fixture exemptions.
  for (const file of ["packages/orchestra/src/claude-code/sdk.ts", "packages/desktop/src/main/index.ts", "modules/capability-assets/src/catalog.ts"]) {
    const text = await Bun.file(path.join(ROOT, file)).text()
    expect(hits(file, `${text}\n// readFileSync(".credentials.json")`)).toEqual([])
    expect(hits(file, `${text}\nreadFileSync(".credentials.json")`)).toHaveLength(1)
  }
})
