// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type SymbolInfo } from "../plan.ts";
import { blocks } from "./text.ts";
import { AcquisitionError } from "./acquisition.ts";

export interface Partition { symbols: SymbolInfo[]; assignment: Record<string, string>; pinned: string[] }
const VALUE_KINDS = new Set(["const", "class", "enum", "function"]);

export function proposePartition(source: string, k: number): Partition {
  if (!Number.isInteger(k) || k < 1 || k > 100) throw new AcquisitionError("PARTITION_COUNT_INVALID", "k must be an integer between 1 and 100");
  const parsed = blocks(source);
  const symbols = new Map<string, SymbolInfo>();
  parsed.forEach((block) => {
    const kind = block.keyword === "abstract class" ? "class" : ["let", "var"].includes(block.keyword) ? "const" : block.keyword as SymbolInfo["kind"];
    const previous = symbols.get(block.name);
    symbols.set(block.name, { name: block.name, kind: previous && VALUE_KINDS.has(previous.kind) ? previous.kind : kind, exported: block.exported || Boolean(previous?.exported) });
  });
  const names = [...symbols.keys()];
  const assignment = Object.fromEntries(names.map((name, i) => [name, `m${Math.min(k - 1, Math.floor(i / (names.length / k))) + 1}`]));
  const parent = new Map(names.map((name) => [name, name]));
  const find = (name: string): string => parent.get(name) === name ? name : find(parent.get(name)!);
  parsed.filter((block) => ["let", "var"].includes(block.keyword)).forEach((mutable) => {
    parsed.filter((block) => block.name !== mutable.name && new RegExp(`\\b${mutable.name}\\b`).test(block.content)).forEach((block) => parent.set(find(block.name), find(mutable.name)));
  });
  const clusters = new Map<string, string[]>();
  names.forEach((name) => clusters.set(find(name), [...(clusters.get(find(name)) ?? []), name]));
  const pinned = [...clusters.values()].filter((cluster) => cluster.length > 1).flatMap((cluster) => {
    cluster.forEach((name) => assignment[name] = assignment[cluster[0]]);
    return cluster;
  });
  return { symbols: [...symbols.values()], assignment, pinned };
}
