// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { type SymbolInfo } from "../plan.ts";
import { blocks } from "./text.ts";

export function ownerUsedHelpers(source: string, symbols: SymbolInfo[], assignment: Record<string, string>): string[] {
  const parsed = blocks(source);
  return symbols.filter((symbol) => !symbol.exported && parsed.some((block) => block.name !== symbol.name && assignment[block.name] === assignment[symbol.name] && new RegExp(`\\b${symbol.name}\\b`).test(block.content))).map((symbol) => symbol.name).sort();
}
