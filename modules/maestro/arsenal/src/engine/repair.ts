// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type AppliedFiles } from "./apply-plan.ts";
import { blocks, topImports, stripImports } from "./text.ts";
export interface Missing { module: string; symbol: string }

export function repairImports(files: AppliedFiles, barrelName: string, missing: Missing[], sourceOrder?: string[]) {
  const modules = new Map(files.modules.map((module) => [module.id, module.content]));
  const hadShared = modules.has("_shared");
  if (!hadShared) modules.set("_shared", `${topImports(files.modules[0]?.content ?? "")}\nexport {};\n`);
  const imports = new Map<string, Map<string, string>>();
  const progress = { added: 0, moved: 0 };
  const addImport = (module: string, symbol: string, from: string) => {
    if (from === module || new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b`).test(modules.get(module) ?? "")) return;
    if (!imports.has(module)) imports.set(module, new Map());
    imports.get(module)!.set(symbol, from);
  };
  missing.forEach((site) => {
    const declaration = [...modules].flatMap(([id, source]) => blocks(source).map((block) => ({ id, block }))).find((item) => item.block.name === site.symbol);
    if (!declaration || declaration.id === site.module) return;
    if (declaration.block.exported) return addImport(site.module, site.symbol, declaration.id);
    if (declaration.id === "_shared") return;
    // Same-name const/type declarations travel together, preserving merged declarations.
    const selected = blocks(modules.get(declaration.id)!).filter((block) => block.name === site.symbol);
    const source = selected.map((block) => /^export\s/.test(block.content) ? block.content : `export ${block.content}`).join("\n\n");
    modules.set(declaration.id, selected.reduce((out, block) => out.replace(block.content, ""), modules.get(declaration.id)!));
    modules.set("_shared", `${source}\n${modules.get("_shared")}`);
    progress.moved++;
    addImport(site.module, site.symbol, "_shared");
  });
  imports.forEach((symbols, module) => {
    if (!modules.has(module)) return;
    const grouped = new Map<string, string[]>();
    symbols.forEach((from, symbol) => grouped.set(from, [...(grouped.get(from) ?? []), symbol]));
    progress.added += symbols.size;
    modules.set(module, [...grouped].sort().map(([from, symbols]) => `import { ${symbols.sort().join(", ")} } from './${from}.js';`).join("\n") + "\n" + modules.get(module));
  });
  if (sourceOrder) {
    const source = modules.get("_shared")!;
    const ordered = blocks(source).sort((a, b) => (sourceOrder.indexOf(a.name) < 0 ? 1e9 : sourceOrder.indexOf(a.name)) - (sourceOrder.indexOf(b.name) < 0 ? 1e9 : sourceOrder.indexOf(b.name)));
    modules.set("_shared", [topImports(source), ...ordered.map((block) => stripImports(block.content).replace(/^export\s*\{\s*\};?$/gm, "")), "export {};"].join("\n"));
  }
  return {
    files: { barrel: files.barrel, modules: [...modules].filter(([id, content]) => id !== "_shared" || hadShared || content.replace(/export\s*\{\s*\};?/, "").trim()).map(([id, content]) => ({ id, content: `${content}\nexport {};\n` })) },
    ...progress,
  };
}
