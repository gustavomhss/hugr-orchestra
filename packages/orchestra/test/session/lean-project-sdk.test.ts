import { expect, test } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import ts from "typescript"
import { ProjectApi } from "../../src/server/routes/instance/httpapi/groups/project"

const root = path.resolve(import.meta.dir, "../../../..")
async function run(command: string[], cwd = root) {
  const proc = Bun.spawn(command, { cwd, env: process.env, stdout: "pipe", stderr: "pipe", timeout: 240000 })
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  if (code !== 0) throw new Error(`${command.join(" ")} exited ${code}\n${stdout}\n${stderr}`)
  return stdout
}

test("actual legacy SDK regeneration includes native Lean routes; unchanged Protocol client remains byte-identical", async () => {
  if (!process.env.GITHUB_RUN_ID) throw new Error("SDK regeneration requires CI")
  const digest = async () => {
    const files = await Array.fromAsync(new Bun.Glob("src/generated{,-effect}/**/*").scan({ cwd: path.join(root, "packages/client") }))
    expect(files.length).toBeGreaterThan(0)
    return Promise.all(files.sort().map(async (file) => [file,
      createHash("sha256").update(await Bun.file(path.join(root, "packages/client", file)).bytes()).digest("hex")]))
  }
  const before = await digest()
  await run(["bun", "packages/sdk/js/script/build.ts"])
  await run(["bun", "run", "generate"], path.join(root, "packages/client"))
  expect(await digest()).toEqual(before)
  const sdk = await Bun.file(path.join(root, "packages/sdk/js/src/v2/gen/sdk.gen.ts")).text()
  const ast = ts.createSourceFile("sdk.gen.ts", sdk, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const project = ast.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "Project")
  if (!project || !ts.isClassDeclaration(project)) throw new Error("Generated Project class missing")
  const methods = project.members.filter(ts.isMethodDeclaration).map((method) => method.name.getText(ast))
  expect(methods).toContain("current") // Positive control for the AST selection.
  const endpoints = Object.values(ProjectApi.groups.project.endpoints).filter((endpoint) => endpoint.path.startsWith("/project/lean"))
  expect(endpoints).toHaveLength(3)
  for (const endpoint of endpoints) expect(methods).toContain(endpoint.name)
  const diff = await run(["git", "diff", "--", "packages/sdk/js/src", "packages/client/src/generated", "packages/client/src/generated-effect"])
  console.log("LEAN_GENERATED_PATCH_BEGIN\n" + diff + "\nLEAN_GENERATED_PATCH_END")
  console.log("LEAN_CLIENT_IDENTITY " + JSON.stringify(before))
  const types = ts.createSourceFile("types.gen.ts", await Bun.file(path.join(root, "packages/sdk/js/src/v2/gen/types.gen.ts")).text(), ts.ScriptTarget.Latest, true)
  const nullable = (type: ts.TypeNode | undefined) => !!type && ts.isUnionTypeNode(type)
    && type.types.some((node) => ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword)
  const control = ts.createSourceFile("control.ts", "type Control = number | null", ts.ScriptTarget.Latest, true).statements[0]
  expect(ts.isTypeAliasDeclaration(control) && nullable(control.type)).toBe(true)
  for (const [name, fields] of [["LeanProfileSavings", ["bytesSaved", "tokensSaved"]], ["LeanProfileExecution", ["exit", "bytesSaved", "tokensSaved"]]] as const) {
    const declaration = types.statements.find((node) => ts.isTypeAliasDeclaration(node) && node.name.text === name)
    if (!declaration || !ts.isTypeAliasDeclaration(declaration) || !ts.isTypeLiteralNode(declaration.type)) throw new Error(`Generated ${name} missing`)
    for (const field of fields) {
      const property = declaration.type.members.find((member) => member.name?.getText(types) === field)
      if (!property || !ts.isPropertySignature(property) || !nullable(property.type)) throw new Error(`Generated ${name}.${field} lost Schema.NullOr(null)`)
    }
  }
  await run(["bun", "typecheck"], path.join(root, "packages/sdk/js"))
  await run(["bun", "typecheck"], path.join(root, "packages/orchestra"))
  const files = ["packages/sdk/js/src/v2/gen/types.gen.ts", "packages/sdk/js/src/v2/gen/sdk.gen.ts"]
  const generated = await Promise.all(files.map(async (file) => ({ file,
    sha256: createHash("sha256").update(await Bun.file(path.join(root, file)).bytes()).digest("hex"),
    blob: (await run(["git", "hash-object", file])).trim(),
  })))
  console.log("LEAN_GENERATED_FILES " + JSON.stringify(generated))
  for (const method of project.members.filter(ts.isMethodDeclaration).filter((method) => endpoints.some((endpoint) => endpoint.name === method.name.getText(ast))))
    console.log("LEAN_PROJECT_METHOD " + method.getText(ast))
}, 600000)
