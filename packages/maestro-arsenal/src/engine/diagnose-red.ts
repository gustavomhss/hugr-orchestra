// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
export interface RedDiagnosis { reason: string; kind: "LIMIT" | "TRACKED" }
export function diagnoseSharedMutable(source: string, missing: { symbol: string }[]): string | null {
  const names = new Set([...source.matchAll(/^(?:export\s+)?(?:let|var)\s+([A-Za-z0-9_]+)/gm)].map((match) => match[1]));
  const hits = [...new Set(missing.map((item) => item.symbol))].filter((name) => names.has(name));
  return hits.length ? `shared module-level mutable state (${hits.join(", ")}) across split — ES modules forbid reassigning imports` : null;
}
export function diagnoseRed(source: string, errors: string[], missing: { symbol: string }[]): RedDiagnosis | null {
  if (!errors.length) return null;
  const mutable = diagnoseSharedMutable(source, missing);
  if (mutable || errors.some((error) => error.includes("TS2632"))) return { kind: "LIMIT", reason: mutable ?? "mutable binding and writer cannot cross ES-module boundary" };
  const testGlobal = errors.join("\n").match(/Cannot find name '(describe|it|test|expect|beforeEach|afterEach|vi|jest)'/)?.[1];
  if (testGlobal && !new RegExp(`^(export\\s+)?(async\\s+)?(const|let|var|function|class)\\s+${testGlobal}\\b`, "m").test(source))
    return { kind: "LIMIT", reason: `test-runner global '${testGlobal}' not defined in source` };
  return { kind: "TRACKED", reason: `compiler rejected decomposition: ${errors[0]}` };
}
