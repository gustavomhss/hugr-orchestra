// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
import { posix } from "node:path";
import { type FileSymbols, type DeterministicMap } from "./contracts.ts";
export function isTestPath(path: string) { return path.split("/").some((segment) => ["tests", "test", "__tests__", "spec", "benchmark", "benchmarks", "examples", "example", "e2e", "fixtures"].includes(segment)) || /^test[_.]|[_.]test\.|\.spec\.|^conftest\./i.test(posix.basename(path)); }
function resolveSpecifier(specifier: string, from: string, paths: Set<string>) {
  if (!specifier.startsWith(".")) return null;
  const candidate = posix.normalize(posix.join(posix.dirname(from), specifier));
  return [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.js`, `${candidate}/index.ts`, `${candidate}/index.tsx`, `${candidate}/index.js`, candidate.replace(/\.(js|jsx)$/, ".ts")].find((path) => paths.has(path)) ?? null;
}
export function deriveMap(files: FileSymbols[]): DeterministicMap {
  const paths = new Set(files.map((file) => file.path));
  const outgoing = new Map(files.map((file) => [file.path, [...new Set(file.imports.flatMap((item) => {
    const resolved = resolveSpecifier(item.from, file.path, paths);
    return resolved && resolved !== file.path ? [resolved] : [];
  }))]]));
  const rank = new Map(files.map((file) => [file.path, 1 / files.length]));
  for (let iteration = 0; iteration < 20; iteration++) {
    const next = new Map(files.map((file) => [file.path, 0.15 / files.length]));
    files.forEach((file) => {
      const targets = outgoing.get(file.path)!;
      const recipients = targets.length ? targets : [...paths];
      recipients.forEach((path) => next.set(path, next.get(path)! + rank.get(file.path)! * 0.85 / recipients.length));
    });
    next.forEach((value, path) => rank.set(path, value));
  }
  const symbols = files.flatMap((file) => file.symbols.filter((symbol) => symbol.exported).map((symbol) => ({ what: `${symbol.kind} ${symbol.name}`, path: file.path, name: symbol.name })));
  symbols.sort((a, b) => Number(isTestPath(a.path)) - Number(isTestPath(b.path)) || rank.get(b.path)! - rank.get(a.path)! || a.path.localeCompare(b.path) || a.name.localeCompare(b.name));
  const deps = [...new Set(files.flatMap((file) => file.imports.flatMap((item) => {
    const resolved = resolveSpecifier(item.from, file.path, paths);
    return resolved && resolved !== file.path ? [`${file.path} imports ${item.names.length ? [...item.names].sort().join(", ") : "*"} from ${resolved}`] : [];
  })))].sort();
  const incoming = new Set([...outgoing.values()].flat());
  const entryPoints = files.filter((file) => !isTestPath(file.path) && (/^(index|main|server|cli)\./i.test(posix.basename(file.path)) || !incoming.has(file.path))).map((file) => file.path).sort();
  return { whereThingsLive: symbols.slice(0, 40).map((item) => ({ what: item.what, path: item.path })), deps: deps.slice(0, 40), entryPoints: entryPoints.slice(0, 15), areas: [...new Set(files.map((file) => file.path.includes("/") ? file.path.split("/")[0] : "(root)"))].sort(), omitted: { symbols: Math.max(0, symbols.length - 40), deps: Math.max(0, deps.length - 40), entryPoints: Math.max(0, entryPoints.length - 15) } };
}
