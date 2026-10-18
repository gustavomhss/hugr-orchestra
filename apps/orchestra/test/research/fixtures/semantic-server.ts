// Disclosed mechanical fixture: real TypeScript language service over a native JSON-RPC/stdin transport.
// It contains no held-out research answer or grading oracle.
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createMessageConnection, ResponseError, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node"
import ts from "typescript"

const connection = createMessageConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout))
const documents = new Map<string, { text: string; version: number }>()
const state: { root: string; files: string[]; options: ts.CompilerOptions; service?: ts.LanguageService } = {
  root: process.cwd(), files: [], options: {},
}
const document = (file: string) => ts.createSourceFile(file, documents.get(file)?.text ?? ts.sys.readFile(file) ?? "", ts.ScriptTarget.Latest)
const location = (file: string, span: ts.TextSpan) => ({ uri: pathToFileURL(file).href, range: {
  start: document(file).getLineAndCharacterOfPosition(span.start), end: document(file).getLineAndCharacterOfPosition(span.start + span.length),
} })

connection.onRequest("initialize", (params: { rootUri?: string }) => {
  state.root = params.rootUri ? fileURLToPath(params.rootUri) : process.cwd()
  const config = ts.readConfigFile(path.join(state.root, "tsconfig.json"), ts.sys.readFile)
  if (config.error) throw new ResponseError(-32603, "Fixture TypeScript configuration unavailable")
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, state.root)
  state.files = parsed.fileNames
  state.options = parsed.options
  state.service = ts.createLanguageService({
    getCompilationSettings: () => state.options, getScriptFileNames: () => state.files,
    getScriptVersion: (file) => String(documents.get(file)?.version ?? 0),
    getScriptSnapshot: (file) => {
      const text = documents.get(file)?.text ?? ts.sys.readFile(file)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => state.root, getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory,
  })
  return { capabilities: { textDocumentSync: 1, definitionProvider: true, referencesProvider: true, workspaceSymbolProvider: true } }
})
connection.onNotification("textDocument/didOpen", (params: { textDocument: { uri: string; text: string; version: number } }) => {
  documents.set(fileURLToPath(params.textDocument.uri), { text: params.textDocument.text, version: params.textDocument.version })
})
connection.onNotification("textDocument/didChange", (params: { textDocument: { uri: string; version: number }; contentChanges: { text: string }[] }) => {
  documents.set(fileURLToPath(params.textDocument.uri), { text: params.contentChanges.at(-1)?.text ?? "", version: params.textDocument.version })
})
for (const method of ["textDocument/definition", "textDocument/references", "workspace/symbol"]) connection.onRequest(method,
  (params: { textDocument?: { uri: string }; position?: { line: number; character: number }; query?: string }) => {
    if (process.argv.includes("--fail-queries")) throw new ResponseError(-32603, "Deliberate RPC failure control")
    const service = state.service
    if (!service) throw new ResponseError(-32603, "Fixture language service not initialized")
    if (method === "workspace/symbol") return service.getNavigateToItems(params.query ?? "", undefined, undefined, true).map((item) => ({
      name: item.name, kind: 13, location: location(item.fileName, item.textSpan),
    }))
    if (!params.textDocument || !params.position) throw new ResponseError(-32602, "Missing native position")
    const file = fileURLToPath(params.textDocument.uri)
    const position = document(file).getPositionOfLineAndCharacter(params.position.line, params.position.character)
    const result = method === "textDocument/definition" ? service.getDefinitionAtPosition(file, position) : service.getReferencesAtPosition(file, position)
    return result?.map((item) => location(item.fileName, item.textSpan)) ?? []
  })
connection.onRequest("shutdown", () => null)
connection.onNotification("exit", () => process.exit(0))
connection.listen()
