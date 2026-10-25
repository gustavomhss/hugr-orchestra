import path from "node:path"
import { formatColor, fromLch, parseColor, toLch } from "../src/orchestra/palette/color"
import { measureBase, PALETTE_SOURCES, parseSources } from "../src/orchestra/palette/generate"
const src = path.join(import.meta.dir, "../src")
const read = async () =>
  parseSources(Object.fromEntries(await Promise.all(PALETTE_SOURCES.map(async (f) => [f, await Bun.file(path.join(src, f)).text()]))))
const target = (name: string) => (/icon|button|chevron/.test(name) ? 3.1 : 4.6)
for (let round = 0; round < 40; round++) {
  let changed = 0
  for (const scheme of ["dark", "light"] as const) {
    const fails = measureBase(await read(), scheme).filter((c) => c.source !== "code" && c.name.startsWith("--") && c.ratio < target(c.name))
    for (const c of fails) {
      const file = path.join(src, c.source)
      const text = await Bun.file(file).text()
      const from = `${c.name}: ${c.value};`
      if (text.split(from).length !== 2) { console.log("skip ambiguous", c.source, from); continue }
      const lch = toLch(parseColor(c.value)!)
      const next = formatColor(fromLch({ ...lch, l: Math.max(0, Math.min(1, lch.l + (scheme === "dark" ? 0.015 : -0.015))) }))
      await Bun.write(file, text.replace(from, `${c.name}: ${next};`))
      changed++
    }
  }
  if (!changed) { console.log("done after", round, "rounds"); break }
}
