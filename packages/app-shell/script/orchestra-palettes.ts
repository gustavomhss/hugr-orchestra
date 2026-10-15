#!/usr/bin/env bun
// Writes Orchestra's palette stylesheets (src/orchestra/palette/generated) from its own stylesheets and the
// palette definitions. Run from packages/app after changing Orchestra's CSS colors or a palette:
//   bun run script/orchestra-palettes.ts
import path from "node:path"
import { PALETTE_DEFINITIONS } from "../src/orchestra/palette/definitions"
import { generatePalettes, PALETTE_SOURCES, parseSources } from "../src/orchestra/palette/generate"

const src = path.join(import.meta.dir, "../src")
const texts = await Promise.all(
  PALETTE_SOURCES.map(async (file) => [file, await Bun.file(path.join(src, file)).text()]),
)
const generated = generatePalettes(parseSources(Object.fromEntries(texts)), PALETTE_DEFINITIONS)

if (generated.failures.length > 0) {
  // A palette that cannot hold AA without changing hue does not ship: remove it from the catalog and definitions.
  console.error(
    generated.failures
      .map((item) => `${item.palette}: ${item.source} ${item.name} ${item.value} ${item.ratio.toFixed(2)}:1`)
      .join("\n"),
  )
  process.exit(1)
}

const out = path.join(src, "orchestra/palette/generated")
await Promise.all(Object.entries(generated.files).map(([name, content]) => Bun.write(path.join(out, name), content)))
console.log(`wrote ${Object.keys(generated.files).length} files to ${path.relative(process.cwd(), out)}`)
