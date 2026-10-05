// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { resolve } from "node:path";
import { type ArsenalContext } from "../contract.ts";
import { compile, diagnosticText, missingName } from "./compiler.ts";
import { AcquisitionError, inside, requireContext, safeModule } from "./acquisition.ts";
export interface FlowWp { id: string; files: { path: string; source: string }[] }
export interface SymbolFlowOptions { wps: FlowWp[] }
export interface UndeclaredFlow { symbol: string; from: string; to: string; file: string }
export async function detectSymbolFlow(opts: SymbolFlowOptions, supplied?: ArsenalContext) {
  const context = requireContext(supplied);
  if (!opts.wps.length || opts.wps.some((wp) => !wp.files.length)) throw new AcquisitionError("FLOW_EMPTY_INPUT", "WP union must contain files");
  const files: Record<string, string> = {};
  const owners = new Map<string, string>();
  const symbols = new Map<string, Set<string>>();
  await context.authorize({ effect: "process", paths: [context.directory], commands: ["typescript:parse symbol ownership"] });
  const { default: compiler } = await import("typescript");
  opts.wps.forEach((wp) => {
    safeModule(wp.id);
    wp.files.forEach((file) => {
      const path = resolve(context.directory, file.path);
      if (!inside(context.directory, path) || !/\.(?:[cm]?ts|tsx)$/.test(path)) throw new AcquisitionError("FLOW_PATH_INVALID", file.path);
      if (owners.has(path)) throw new AcquisitionError("FLOW_DUPLICATE_FILE", file.path);
      owners.set(path, wp.id);
      files[path] = `${file.source}\nexport {};\n`;
      const ast = compiler.createSourceFile(path, file.source, compiler.ScriptTarget.Latest, true);
      ast.statements.forEach((statement) => {
        const declarations = compiler.isVariableStatement(statement) ? statement.declarationList.declarations : compiler.isFunctionDeclaration(statement) || compiler.isClassDeclaration(statement) || compiler.isInterfaceDeclaration(statement) || compiler.isTypeAliasDeclaration(statement) || compiler.isEnumDeclaration(statement) ? [statement] : [];
        declarations.forEach((declaration) => {
          const name = declaration.name;
          if (!name || !compiler.isIdentifier(name)) return;
          symbols.set(name.text, new Set([...(symbols.get(name.text) ?? []), wp.id]));
        });
      });
    });
  });
  const result = await compile({ files }, context);
  const flows = result.diagnostics.flatMap((item): UndeclaredFlow[] => {
    const symbol = missingName(item);
    const to = item.file && owners.get(item.file);
    if (!symbol || !to || !item.file) return [];
    return [...(symbols.get(symbol) ?? [])].filter((from) => from !== to).map((from) => ({ symbol, from, to, file: item.file! }));
  });
  const undeclaredFlows = [...new Map(flows.map((flow) => [`${flow.to}:${flow.symbol}:${flow.file}:${flow.from}`, flow])).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, flow]) => flow);
  return { undeclaredFlows, ok: result.diagnostics.length === 0, diagnostics: result.diagnostics.map(diagnosticText) };
}
