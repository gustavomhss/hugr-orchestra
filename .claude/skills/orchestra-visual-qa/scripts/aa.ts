import path from "node:path"
import { AA, measureBase, PALETTE_SOURCES, parseSources } from "../src/orchestra/palette/generate"
const src = path.join(import.meta.dir, "../src")
const texts = await Promise.all(PALETTE_SOURCES.map(async (f) => [f, await Bun.file(path.join(src, f)).text()]))
const sources = parseSources(Object.fromEntries(texts))
for (const scheme of ["dark", "light"] as const) {
  const checks = measureBase(sources, scheme)
  const bad = checks.filter((c) => c.ratio < AA)
  const worst = checks.toSorted((a, b) => a.ratio - b.ratio).slice(0, 5)
  console.log(scheme, "checks", checks.length, "below AA", bad.length)
  for (const c of (bad.length ? bad : worst)) console.log("  ", c.ratio.toFixed(2), c.source, c.name, c.value)
}
