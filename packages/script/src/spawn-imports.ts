// Pure scanning half of the spawn-import gate (script/check-spawn-imports.ts): which spawning modules a source file
// imports and whether its code names the MCP SDK's stdio client transport.
import ts from "typescript"

const MODULES: Record<string, string> = {
  "cross-spawn": "cross-spawn",
  "bun-pty": "bun-pty",
  "@lydell/node-pty": "@lydell/node-pty",
  child_process: "child_process",
  "node:child_process": "child_process",
  "hugr-omni": "hugr-omni",
  "@modelcontextprotocol/sdk/client/stdio": "StdioClientTransport",
  "@modelcontextprotocol/sdk/client/stdio.js": "StdioClientTransport",
}
const STDIO = "StdioClientTransport"
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g

export function hits(file: string, text: string) {
  const modules = [...text.matchAll(SPECIFIER)].flatMap((match) => {
    const hit = match[1] === undefined ? undefined : MODULES[match[1]]
    return hit === undefined ? [] : [hit]
  })
  return [...new Set([...modules, ...(namesStdio(file, text) ? [STDIO] : [])])].sort((a, b) => a.localeCompare(b))
}

// Whether the code (not a comment or a string) names the stdio transport: an identifier, or an element-access key.
function namesStdio(file: string, text: string) {
  if (!text.includes(STDIO)) return false
  const kind = /\.(?:tsx|jsx)$/.test(file) ? ts.ScriptKind.TSX : /\.(?:js|mjs|cjs)$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS
  const visit = (node: ts.Node): boolean =>
    (ts.isIdentifier(node) && node.text === STDIO) ||
    (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === STDIO) ||
    ts.forEachChild(node, visit) === true
  return visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind))
}
