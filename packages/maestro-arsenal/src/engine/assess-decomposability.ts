// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { blocks } from "./text.ts";
export function assessDecomposability(source: string, opts?: { dominanceThreshold?: number; minLoc?: number }) {
  const parsed = blocks(source);
  const symbolCount = new Set(parsed.map((block) => block.name)).size;
  const totalLoc = source.split("\n").length;
  const dominant = parsed.map((block) => ({ name: block.name, locPct: block.content.split("\n").length / totalLoc })).sort((a, b) => b.locPct - a.locPct)[0];
  if (symbolCount < 2) return { decomposable: false, reason: `only ${symbolCount} top-level declaration(s) — nothing to split`, symbolCount, totalLoc };
  if (totalLoc >= (opts?.minLoc ?? 30) && dominant.locPct > (opts?.dominanceThreshold ?? 0.85))
    return { decomposable: false, reason: `dominated by '${dominant.name}' (${Math.round(dominant.locPct * 100)}% of LOC) — requires method-level extraction`, symbolCount, totalLoc, dominant };
  return { decomposable: true, reason: `${symbolCount} top-level declarations`, symbolCount, totalLoc, dominant };
}
