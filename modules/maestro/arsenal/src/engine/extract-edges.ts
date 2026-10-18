// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { type SoundEdge } from "../plan.ts";
import { type ArsenalContext } from "../contract.ts";
import { blocks, topImports } from "./text.ts";
import { compile, missingName } from "./compiler.ts";
import { safeModule } from "./acquisition.ts";
export interface ExtractOptions { source: string; assignment: Record<string, string>; targetPath?: string }

export async function extractEdges(opts: ExtractOptions, context: ArsenalContext): Promise<SoundEdge[]> {
  const prefix = `__maestro_${randomUUID().replaceAll("-", "")}`;
  const grouped = new Map<string, string[]>();
  blocks(opts.source).forEach((block) => {
    const owner = opts.assignment[block.name];
    if (owner === undefined) return;
    safeModule(owner);
    grouped.set(owner, [...(grouped.get(owner) ?? []), block.content]);
  });
  const fileOwners = new Map([...grouped.keys()].map((id) => [resolve(context.directory, dirname(opts.targetPath ?? "target.ts"), `${prefix}-${id}.ts`), id]));
  const files = Object.fromEntries([...fileOwners].map(([path, owner]) => [path, `${topImports(opts.source)}\n${grouped.get(owner)!.join("\n\n")}\nexport {};\n`]));
  const result = await compile({ files, targetPath: opts.targetPath }, context);
  const edges = result.diagnostics.flatMap((item) => {
    const symbol = missingName(item);
    const neededBy = item.file && fileOwners.get(item.file);
    return symbol && neededBy ? [{ symbol, neededBy }] : [];
  });
  return [...new Map(edges.map((edge) => [`${edge.neededBy}:${edge.symbol}`, edge])).values()].sort((a, b) => `${a.neededBy}:${a.symbol}`.localeCompare(`${b.neededBy}:${b.symbol}`));
}
