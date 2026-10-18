// Adapted from TechLead a68e7af, Copyright 2026 HuGR Labs, Apache-2.0.
const CLOSES = /from\s*['"][^'"]+['"]|^\s*import\s*['"][^'"]+['"]/;
export const DECL = /^(export\s+)?(?:async\s+)?(const|let|var|type|interface|class|enum|function|abstract class)\s+([A-Za-z0-9_]+)/;

export function topImports(source: string): string {
  const lines = source.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^import\b(?![.(])/.test(lines[i])) continue;
    const start = i;
    while (i < lines.length && !CLOSES.test(lines[i])) i++;
    out.push(lines.slice(start, Math.min(i, lines.length - 1) + 1).join("\n"));
  }
  return out.join("\n");
}

export function stripImports(source: string): string {
  const lines = source.split("\n");
  const keep: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^import\b(?![.(])/.test(lines[i])) {
      while (i < lines.length && !CLOSES.test(lines[i])) i++;
      continue;
    }
    keep.push(lines[i]);
  }
  return keep.join("\n");
}

export function blocks(source: string) {
  const lines = source.split("\n");
  const starts = lines.flatMap((line, i) => {
    const match = DECL.exec(line);
    return match ? [{ i, name: match[3], exported: Boolean(match[1]), keyword: match[2] }] : [];
  });
  return starts.map((start, i) => ({ ...start, content: stripImports(lines.slice(start.i, starts[i + 1]?.i ?? lines.length).join("\n")).trimEnd() }));
}
