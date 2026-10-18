// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type ArsenalContext } from "../contract.ts";
import { compile, diagnosticText } from "./compiler.ts";
import { AcquisitionError, requireContext } from "./acquisition.ts";
export interface BriefUsageAvailable { exports: string[]; helpers: string[]; importNames: string[] }
export interface BriefUsageOptions { declared: string[]; source?: string; available?: BriefUsageAvailable }
export async function detectBriefUsage(opts: BriefUsageOptions, context?: ArsenalContext) {
  const sourceMode = Object.hasOwn(opts, "source");
  const availableMode = Object.hasOwn(opts, "available");
  if (sourceMode && availableMode) throw new AcquisitionError("BRIEF_MODE_CONFLICT", "supply source XOR available; source cannot be ignored");
  if (!sourceMode && !availableMode) throw new AcquisitionError("BRIEF_ACQUISITION_MISSING", "source or complete available universe required");
  if (Array.isArray(opts.declared) && opts.declared.length === 0) throw new AcquisitionError("BRIEF_DECLARED_EMPTY", "at least one declared symbol required");
  if (!validSymbols(opts.declared)) throw new AcquisitionError("BRIEF_SYMBOL_INVALID", "declared must contain at most 1000 identifiers of at most 200 characters");
  if (availableMode) {
    const available = opts.available;
    const fields = ["exports", "helpers", "importNames"] as const;
    if (!available || typeof available !== "object" || fields.some((field) => !Object.hasOwn(available, field)))
      throw new AcquisitionError("BRIEF_AVAILABLE_INCOMPLETE", "exports, helpers and importNames arrays are required");
    if (Object.keys(available).some((field) => !fields.some((known) => known === field)) || fields.some((field) => !validSymbols(available[field])))
      throw new AcquisitionError("BRIEF_AVAILABLE_INVALID", "availability fields must be bounded identifier arrays");
    const universe = new Set([...available.exports, ...available.helpers, ...available.importNames]);
    if (universe.size === 0) throw new AcquisitionError("BRIEF_UNIVERSE_EMPTY", "complete available universe contains no symbols");
    const overSpec = [...new Set(opts.declared.filter((name) => !universe.has(name)))].sort();
    return { overSpec, ok: overSpec.length === 0, backend: "set-difference", diagnostics: [] };
  }
  if (typeof opts.source !== "string" || opts.source.length === 0 || opts.source.length > 1000000)
    throw new AcquisitionError("BRIEF_SOURCE_INVALID", "source must contain between 1 and 1000000 characters");
  const result = await compile({ files: { "__maestro_brief.ts": `${opts.source}\nexport {};\n` }, noUnusedLocals: true }, requireContext(context));
  const { default: compiler } = await import("typescript");
  const ast = compiler.createSourceFile("brief.ts", opts.source!, compiler.ScriptTarget.Latest, true);
  const mentioned = new Set<string>();
  const visit = (node: import("typescript").Node): void => {
    if (compiler.isIdentifier(node)) mentioned.add(node.text);
    compiler.forEachChild(node, visit);
  };
  visit(ast);
  const unused = result.diagnostics.filter((item) => [6133, 6192, 6196].includes(item.code));
  const overSpec = [...new Set([...opts.declared.filter((name) => !mentioned.has(name)), ...unused.flatMap((item) => {
    if (item.code === 6192) return opts.declared.filter((name) => new RegExp(`\\b${name}\\b`).test(opts.source!.slice(item.start, (item.start ?? 0) + (item.length ?? 0))));
    const symbol = /^'([^']+)' is declared/.exec(item.message)?.[1];
    return symbol && opts.declared.includes(symbol) ? [symbol] : [];
  })])].sort();
  const errors = result.diagnostics.filter((item) => ![6133, 6192, 6196].includes(item.code));
  return { overSpec, ok: overSpec.length === 0 && errors.length === 0, backend: "typescript", diagnostics: result.diagnostics.map(diagnosticText) };
}

function validSymbols(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 1000 && value.every((name: unknown) => typeof name === "string" && name.length <= 200 && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name));
}
