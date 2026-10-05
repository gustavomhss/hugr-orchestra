// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
// Native addon loads only on supported-file extraction. Partial trees never certify coverage.
import { createRequire } from "node:module";
import type Parser from "tree-sitter";
import { type ArsenalContext } from "../contract.ts";
import { AcquisitionError, requireContext } from "../engine/acquisition.ts";
import { runProcess } from "../engine/process.ts";
import { trustedAsset } from "../engine/trusted-assets.ts";
import { type FileSymbols, type SymbolInfo, type SymbolKind, type FileImport } from "./contracts.ts";
const KINDS: Record<string, SymbolKind> = { function_declaration: "function", class_declaration: "class", abstract_class_declaration: "class", interface_declaration: "interface", type_alias_declaration: "type", enum_declaration: "enum", lexical_declaration: "const", variable_declaration: "const", function_definition: "function", class_definition: "class" };

export async function extractSymbols(path: string, source: string, context?: ArsenalContext): Promise<FileSymbols> {
  if (source.length > 1_000_000) throw new AcquisitionError("PARSER_INPUT_CAP", "source exceeds 1M characters");
  const local = extractNative(path, source);
  if (local.coverage.reason !== "parser-unavailable" || !process.versions.bun) return local;
  // Some native packages ship Node builds but omit Bun's expected prebuild filename.
  // A fixed, package-owned Node worker preserves actual parsing; host authorizes launch.
  const host = requireContext(context);
  const worker = trustedAsset("parser-worker").entry;
  const result = await runProcess(["node", "--experimental-strip-types", worker], host.directory, host, JSON.stringify({ path, source })).catch((error: unknown) => {
    if (!(error instanceof AcquisitionError)) throw error;
    return { stdout: "", stderr: error.message, exit: -1 };
  });
  if (result.exit !== 0 || !result.stdout || result.stdout.length > 2_000_000) return { ...local, coverage: { ...local.coverage, detail: `parser-worker failed: exit ${result.exit}; ${result.stderr.slice(0, 500)}` } };
  const parsed: unknown = await Promise.resolve().then(() => JSON.parse(result.stdout)).catch(() => undefined);
  if (!validResult(parsed, path)) return { ...local, coverage: { ...local.coverage, detail: "parser-worker malformed diagnostics" } };
  return parsed;
}

function validResult(value: unknown, path: string): value is FileSymbols {
  if (!value || typeof value !== "object" || !("path" in value) || value.path !== path || !("symbols" in value) || !Array.isArray(value.symbols) || !("imports" in value) || !Array.isArray(value.imports) || !("coverage" in value) || !value.coverage || typeof value.coverage !== "object" || !("complete" in value.coverage) || typeof value.coverage.complete !== "boolean") return false;
  return value.symbols.every((item: unknown) => item !== null && typeof item === "object" && "name" in item && typeof item.name === "string" && "kind" in item && typeof item.kind === "string" && "signature" in item && typeof item.signature === "string" && "line" in item && Number.isInteger(item.line) && "exported" in item && typeof item.exported === "boolean") && value.imports.every((item: unknown) => item !== null && typeof item === "object" && "from" in item && typeof item.from === "string" && "names" in item && Array.isArray(item.names) && item.names.every((name: unknown) => typeof name === "string"));
}

export function extractNative(path: string, source: string): FileSymbols {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  const grammar = [".tsx", ".jsx"].includes(extension) ? "tsx" : [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"].includes(extension) ? "typescript" : extension === ".py" ? "python" : undefined;
  const scope = "top-level declarations/static imports; structural reconnaissance, not Own facts";
  if (!grammar) return { path, symbols: [], imports: [], coverage: { complete: false, reason: "unsupported-language", scope } };
  // Native require/parse is the genuinely fallible boundary; preserve reason instead of empty success.
  try {
    const require = createRequire(import.meta.url);
    const ParserCtor = require("tree-sitter") as typeof import("tree-sitter");
    const parser = new ParserCtor();
    if (grammar === "python") parser.setLanguage(require("tree-sitter-python") as Parser.Language);
    if (grammar !== "python") {
      const grammars = require("tree-sitter-typescript") as { typescript: Parser.Language; tsx: Parser.Language };
      parser.setLanguage(grammars[grammar]);
    }
    const tree = parser.parse(source);
    if (!tree) return { path, symbols: [], imports: [], coverage: { complete: false, reason: "partial-parse", scope } };
    const symbols: SymbolInfo[] = [];
    const imports: FileImport[] = [];
    const state = { unsupported: false };
    const symbol = (node: Parser.SyntaxNode, exported: boolean) => {
      const kind = KINDS[node.type];
      if (!kind) { state.unsupported = true; return; }
      const names = kind === "const" ? node.namedChildren.filter((child) => child.type === "variable_declarator").map((child) => child.childForFieldName("name")) : [node.childForFieldName("name")];
      names.forEach((name) => {
        if (!name || !["identifier", "type_identifier"].includes(name.type)) { state.unsupported = true; return; }
        symbols.push({ name: name.text, kind, signature: node.text.split("\n")[0].trim().slice(0, 120), line: node.startPosition.row + 1, exported });
      });
    };
    tree.rootNode.namedChildren.forEach((node) => {
      if (node.type === "comment" || node.type === "expression_statement" && grammar === "python" && node.namedChildren[0]?.type === "string") return;
      if (grammar !== "python" && node.type === "import_statement") {
        const from = node.childForFieldName("source")?.text ?? node.namedChildren.find((child) => child.type === "string")?.text;
        if (!from) { state.unsupported = true; return; }
        const clause = node.namedChildren.find((child) => child.type === "import_clause");
        const names = clause?.namedChildren.flatMap((child) => {
          if (child.type === "identifier") return [child.text];
          if (child.type === "namespace_import") return child.namedChildren.filter((item) => item.type === "identifier").map((item) => item.text);
          return child.namedChildren.filter((item) => item.type === "import_specifier").flatMap((item) => item.childForFieldName("name")?.text ?? []);
        }) ?? [];
        imports.push({ from: from.slice(1, -1), names });
        return;
      }
      if (grammar === "python" && ["import_from_statement", "import_statement"].includes(node.type)) {
        const from = node.childForFieldName("module_name")?.text;
        const names = node.namedChildren.filter((child) => child.type === "dotted_name" || child.type === "identifier" || child.type === "aliased_import").map((child) => child.childForFieldName("name")?.text ?? child.text);
        if (from) imports.push({ from, names: names.filter((name) => name !== from) });
        if (!from) names.forEach((name) => imports.push({ from: name, names: [] }));
        return;
      }
      if (node.type === "export_statement") {
        const declaration = node.namedChildren.find((child) => KINDS[child.type]);
        if (declaration) { symbol(declaration, true); return; }
        state.unsupported = true;
        return;
      }
      if (node.type === "decorated_definition") {
        const declaration = node.namedChildren.find((child) => KINDS[child.type]);
        if (declaration) { symbol(declaration, true); return; }
      }
      symbol(node, grammar === "python");
    });
    const partial = tree.rootNode.hasError;
    return { path, symbols, imports, coverage: { complete: !partial && !state.unsupported, reason: partial ? "partial-parse" : state.unsupported ? "unsupported-syntax" : undefined, scope } };
  } catch {
    return { path, symbols: [], imports: [], coverage: { complete: false, reason: "parser-unavailable", scope } };
  }
}
