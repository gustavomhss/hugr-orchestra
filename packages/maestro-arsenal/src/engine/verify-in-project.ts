// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
// Virtual siblings retain actual project resolution; baseline is a multiset, never an empty fallback.
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { type ArsenalContext } from "../contract.ts";
import { type AppliedFiles } from "./apply-plan.ts";
import { compile, diagnosticKey, diagnosticText, missingName, type CompilerDiagnostic } from "./compiler.ts";
import { projectPath, safeModule } from "./acquisition.ts";

export async function computeBaseline(godfilePath: string, context: ArsenalContext) {
  const target = await projectPath(context, godfilePath);
  return compile({ files: { [target]: await Bun.file(target).text() }, targetPath: target, includeProject: true }, context);
}

export async function verifyInProject(opts: {
  godfilePath: string; files: AppliedFiles; barrelName: string; baseline?: CompilerDiagnostic[];
}, context: ArsenalContext) {
  const target = await projectPath(context, opts.godfilePath);
  const prefix = `__maestro_${randomUUID().replaceAll("-", "")}`;
  const names = new Map(opts.files.modules.map((module) => [safeModule(module.id), join(dirname(target), `${prefix}-${module.id}.ts`)]));
  names.set(safeModule(opts.barrelName), target);
  const rewrite = (source: string) => [...names].reduce((out, [id, path]) => {
    const local = `./${path.slice(path.lastIndexOf("/") + 1).replace(/\.ts$/, ".js")}`;
    return out.replaceAll(`'./${id}.js'`, `'${local}'`).replaceAll(`"./${id}.js"`, `"${local}"`);
  }, source);
  const virtual = Object.fromEntries(opts.files.modules.map((module) => [names.get(module.id)!, rewrite(module.content)]));
  virtual[target] = rewrite(opts.files.barrel);
  const result = await compile({ files: virtual, targetPath: target, includeProject: true }, context);
  const generated = new Set(Object.keys(virtual));
  const key = (item: CompilerDiagnostic, baseline = false) => `${item.file && (baseline ? item.file === target : generated.has(item.file)) ? "<decomposition>" : item.file ?? "<config>"}:${diagnosticKey(item)}`;
  const counts = new Map<string, number>();
  (opts.baseline ?? []).forEach((item) => counts.set(key(item, true), (counts.get(key(item, true)) ?? 0) + 1));
  const errors = result.diagnostics.filter((item) => {
    const remaining = counts.get(key(item)) ?? 0;
    if (!remaining) return true;
    counts.set(key(item), remaining - 1);
    return false;
  });
  const missing = errors.flatMap((item) => {
    const symbol = missingName(item);
    const module = [...names].find(([, path]) => path === item.file)?.[0];
    return symbol && module ? [{ module, symbol }] : [];
  });
  return { ok: errors.length === 0, errors: errors.map(diagnosticText), tsconfig: result.tsconfig, missing };
}
