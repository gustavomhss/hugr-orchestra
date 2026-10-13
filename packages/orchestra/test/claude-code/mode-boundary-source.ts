import ts from "typescript"

/** Parse and validate one source without loading dependencies or emitting declaration files. */
export function readBoundarySource(item: { file: string; text: string }, cwd: string) {
  const source = ts.createSourceFile(item.file, item.text, ts.ScriptTarget.Latest, true,
    item.file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const diagnostics = ts.createProgram([item.file], {
    noLib: true, noResolve: true, target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve,
  }, {
    getSourceFile: (file) => file === item.file ? source : undefined,
    getDefaultLibFileName: () => "",
    writeFile: () => {},
    getCurrentDirectory: () => cwd,
    getCanonicalFileName: (file) => file,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (file) => file === item.file,
    readFile: (file) => file === item.file ? item.text : undefined,
  }).getSyntacticDiagnostics(source)
  if (diagnostics.length) throw new Error([
    `Cannot extract imports from ${item.file}:`,
    ...diagnostics.map((diagnostic) => `TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`),
  ].join("\n"))
  const specifiers: string[] = []
  function visit(node: ts.Node) {
    const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
      : ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression
      : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal
      : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        ts.isIdentifier(node.expression) && node.expression.text === "require") ? node.arguments[0] : undefined
    if (specifier && ts.isStringLiteralLike(specifier)) specifiers.push(specifier.text)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return { source, specifiers }
}
