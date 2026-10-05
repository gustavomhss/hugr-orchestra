import { expect, test } from "bun:test"
import ts from "typescript"
import { frame, requirements } from "../../scripts/app-dock-workspace-proof"

test("workspace gate rejects missing, empty, duplicate and unmatched required cases", async () => {
  const manifest = await Bun.file(new URL("./workspace-scenarios.json", import.meta.url)).json()
  const handlers = ["W01", "W02", "W03", "W04", "W05", "W06"]
  expect(requirements(manifest, handlers).map((row) => row.id)).toEqual(handlers)
  expect(() => requirements({}, handlers)).toThrow("manifest-invalid-or-required-missing")
  expect(() => requirements({ ...manifest, required: [] }, handlers)).toThrow("manifest-required-empty")
  expect(() => requirements({ ...manifest, required: [...manifest.required, manifest.required[0]] }, handlers)).toThrow("manifest-case-duplicate")
  expect(() => requirements(manifest, handlers.slice(0, -1))).toThrow("manifest-handler-correspondence")
  expect(() => requirements({ ...manifest, required: manifest.required.slice(0, -1) }, handlers.slice(0, -1))).toThrow("manifest-handler-correspondence")
})

test("workspace wire evidence enforces UTF-8, one complete bounded frame and raw digest", () => {
  const raw = '{"v":1,"id":"control","ok":true,"value":"café 🧪"}\n'
  const bytes = Buffer.from(raw)
  expect(frame(bytes)).toMatchObject({ raw, bytes: bytes.length, value: { id: "control", value: "café 🧪" } })
  expect(frame(bytes).sha256).toBe(new Bun.CryptoHasher("sha256").update(bytes).digest("hex"))
  expect(() => frame(bytes.subarray(0, -1))).toThrow("wire-frame-bound-or-delimiter")
  expect(() => frame(Buffer.concat([bytes, bytes]))).toThrow("wire-frame-bound-or-delimiter")
  expect(() => frame(Buffer.from([0xff, 10]))).toThrow()
  expect(() => frame(Buffer.alloc(262145, 10))).toThrow("wire-frame-bound-or-delimiter")
})

test("workspace embedded Python fixture sources parse with the real Python parser", async () => {
  const source = ts.createSourceFile("app-dock-workspace-proof.ts", await Bun.file(new URL("../../scripts/app-dock-workspace-proof.ts", import.meta.url)).text(), ts.ScriptTarget.Latest)
  const names = ["setup", "readFile", "codeView"]
  const bodies = source.statements.flatMap((statement) => ts.isVariableStatement(statement) ? statement.declarationList.declarations : [])
    .flatMap((declaration) => ts.isIdentifier(declaration.name) && names.includes(declaration.name.text)
      && declaration.initializer && ts.isNoSubstitutionTemplateLiteral(declaration.initializer)
      ? [{ name: declaration.name.text, source: declaration.initializer.text }] : [])
  expect(bodies.map((body) => body.name).sort()).toEqual(names.toSorted())
  const python = "import ast,json,sys; bodies=json.load(sys.stdin); [ast.parse(body['source'],filename=body['name']) for body in bodies]; print(len(bodies))"
  const process = Bun.spawn(["python3", "-B", "-c", python], { stdin: new Blob([JSON.stringify(bodies)]), stdout: "pipe", stderr: "pipe" })
  const result = await Promise.all([process.exited, new Response(process.stdout).text(), new Response(process.stderr).text()])
  expect(result).toEqual([0, "3\n", ""])
  const invalid = Bun.spawn(["python3", "-B", "-c", python], { stdin: new Blob([JSON.stringify([{ name: "invalid-control", source: "if :" }])]), stdout: "pipe", stderr: "pipe" })
  expect(await invalid.exited).not.toBe(0)
  expect(await new Response(invalid.stderr).text()).toContain("SyntaxError")
})
