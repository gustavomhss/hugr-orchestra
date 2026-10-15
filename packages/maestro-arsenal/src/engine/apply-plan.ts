// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type Plan, EXTERNAL, LEAD } from "../plan.ts";
import { blocks, topImports } from "./text.ts";
export interface AppliedFiles { modules: { id: string; content: string }[]; barrel: string }
export interface ApplyOptions { source: string; plan: Plan; externalImports?: Record<string, string>; barrelName?: string }

export function applyPlan(opts: ApplyOptions): AppliedFiles {
  const sourceBlocks = new Map<string, string>();
  blocks(opts.source).forEach((block) => sourceBlocks.set(block.name, [sourceBlocks.get(block.name), block.content].filter(Boolean).join("\n\n")));
  const sourceOrder = [...sourceBlocks.keys()];
  const relocTo = new Map(opts.plan.relocations.map((item) => [item.symbol, item.to]));
  const origImports = topImports(opts.source);
  const modules = opts.plan.modules.map((module) => {
    const own = new Set([...module.exports, ...module.helpers]);
    const names = sourceOrder.filter((name) => own.has(name) && !relocTo.has(name) || relocTo.get(name) === module.id);
    const header = module.imports.flatMap((item) => {
      if (item.from === EXTERNAL) return item.names.flatMap((name) => opts.externalImports?.[name] ? [`import { ${name} } from '${opts.externalImports[name]}';`] : []);
      return [`import { ${item.names.join(", ")} } from './${item.from === LEAD ? "_shared" : item.from}.js';`];
    });
    return { id: module.id, content: [...[origImports, ...header].filter(Boolean), "", ...names.map((name) => sourceBlocks.get(name)), "export {};", ""].join("\n") };
  });
  const lifted = sourceOrder.filter((name) => relocTo.get(name) === LEAD);
  if (lifted.length) modules.push({ id: "_shared", content: [origImports, "", ...lifted.map((name) => {
    const source = sourceBlocks.get(name)!;
    return /^export\s/.test(source) ? source : `export ${source}`;
  }), "export {};", ""].join("\n") });
  return { modules, barrel: ["// Generated decomposition barrel.", ...opts.plan.modules.map((module) => module.id).sort().map((id) => `export * from './${id}.js';`), ""].join("\n") };
}
