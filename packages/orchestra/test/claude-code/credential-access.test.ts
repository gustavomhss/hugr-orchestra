import { expect, test } from "bun:test"
import path from "node:path"
import ts from "typescript"

// Repair: mentions are not reads. In JS/TS this syntactic guard covers literal arguments to direct readFile,
// readFileSync, createReadStream and Bun.file calls; security password lookups in direct spawn/spawnSync,
// exec/execSync and execFile/execFileSync calls; and .claudeAiOauth / ["claudeAiOauth"] access.
// It does not resolve aliases, computed paths, data flow or arbitrary shell/wrapper execution. Python/shell retain
// conservative raw credential indicators, not a parsed read audit. This is not proof of every possible read.
// Claude Code signs in from its own store; Orchestra learns status from the SDK (specs/claude-code-engine.md, "Auth").

const ROOT = path.resolve(import.meta.dir, "../../../..")
const SCOPE = "packages/*/{src,script}/**/*.{ts,tsx,js,mjs,cjs,py,sh}"
const READS = [/find-(generic|internet)-password/, /\.credentials\.json/, /Claude Code-credentials/, /claudeAiOauth/]

function hits(file: string, text: string) {
  if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file))
    return text.split("\n").flatMap((line, index) => READS.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  function visit(node: ts.Node) {
    const name = ts.isCallExpression(node)
      ? ts.isIdentifier(node.expression) ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : undefined
      : undefined
    const args = ts.isCallExpression(node) && name !== undefined &&
      ["readFile", "readFileSync", "createReadStream", "file", "spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync"].includes(name)
      ? node.arguments.flatMap(literals) : []
    const read = name !== undefined && (["readFile", "readFileSync", "createReadStream"].includes(name) ||
      name === "file" && ts.isCallExpression(node) && node.expression.getText(source) === "Bun.file") &&
      args.some((value) => value.includes(".credentials.json"))
    const lookup = name !== undefined && ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync"].includes(name) &&
      /(?:^|[\/\s])security(?:\s|$)/.test(args.join(" ")) && /find-(generic|internet)-password/.test(args.join(" "))
    const record = ts.isPropertyAccessExpression(node) && node.name.text === "claudeAiOauth" ||
      ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "claudeAiOauth"
    if (read || lookup || record)
      found.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${node.getText(source)}`)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function literals(node: ts.Node): string[] {
  if (ts.isStringLiteralLike(node)) return [node.text]
  const values: string[] = []
  ts.forEachChild(node, (child) => { values.push(...literals(child)) })
  return values
}

test("the parser flags each declared credential access construct", () => {
  const sample = [
    'spawnSync("security", ["find-generic-password", "-s", service])',
    'Bun.spawn(["/usr/bin/security", "find-internet-password"])',
    'execFile("security", ["find-internet-password"])',
    'execFileSync("security", ["find-generic-password"])',
    'exec("security find-generic-password -s \\"Claude Code-credentials\\"")',
    'execSync("security find-internet-password")',
    'readFileSync(join(dir, ".credentials.json"))',
    'fs.readFile("/home/owner/.claude/.credentials.json")',
    'createReadStream(".credentials.json")',
    'Bun.file(join(dir, ".credentials.json")).json()',
    "parsed.claudeAiOauth.accessToken",
    'parsed["claudeAiOauth"].accessToken',
  ]
  for (const text of sample) expect(hits("sample.ts", text)).toHaveLength(1)
  expect(hits("sample.ts", 'spawnSync(\n"security",\n["find-generic-password"]\n)')).toHaveLength(1)
})

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

test("package sources and scripts contain no declared credential access constructs or raw non-JS indicators", async () => {
  const files = await Array.fromAsync(new Bun.Glob(SCOPE).scan({ cwd: ROOT }))
  const scanned = files.filter((file) => !file.split(path.sep).includes("node_modules"))
  // Positive controls: the scan reaches Claude mode's spawn seam and a broad slice of the repository.
  expect(scanned.map((file) => file.split(path.sep).join("/"))).toContain("packages/orchestra/src/claude-code/sdk.ts")
  expect(scanned.map((file) => file.split(path.sep).join("/"))).toContain("packages/desktop/src/main/index.ts")
  expect(scanned.length).toBeGreaterThan(500)
  const found = (await Promise.all(scanned.map(async (file) => hits(file, await Bun.file(path.join(ROOT, file)).text())))).flat()
  if (found.length) throw new Error(["Credential access constructs or raw non-JS indicators found:", ...found].join("\n"))
  // Real-source teeth in both SDK and Desktop: no source-directory or test-fixture exemptions.
  for (const file of ["packages/orchestra/src/claude-code/sdk.ts", "packages/desktop/src/main/index.ts"]) {
    const text = await Bun.file(path.join(ROOT, file)).text()
    expect(hits(file, `${text}\n// readFileSync(".credentials.json")`)).toEqual([])
    expect(hits(file, `${text}\nreadFileSync(".credentials.json")`)).toHaveLength(1)
  }
})
