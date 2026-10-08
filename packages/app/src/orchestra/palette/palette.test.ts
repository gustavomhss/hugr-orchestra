import { describe, expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import path from "node:path"
import { nordTheme } from "@orchestra/ui/theme/default-themes"
import { PALETTES, recolors } from "./catalog"
import { parseColor, toLch } from "./color"
import { convertTheme } from "./convert"
import { PALETTE_DEFINITIONS } from "./definitions"
import { AA, generatePalettes, measureBase, measurePalette, PALETTE_SOURCES, parseSources } from "./generate"
import { hueDelta } from "./remap"

const src = path.join(import.meta.dir, "../..")
const generatedDir = path.join(import.meta.dir, "generated")
const sources = parseSources(
  Object.fromEntries(
    await Promise.all(PALETTE_SOURCES.map(async (file) => [file, await Bun.file(path.join(src, file)).text()])),
  ),
)
const generated = generatePalettes(sources, PALETTE_DEFINITIONS)
const shipped = (name: string) => Bun.file(path.join(generatedDir, name)).text()
const recolored = PALETTE_DEFINITIONS.map((definition) => [definition.id, definition] as const)
// The role colors a palette must carry, read back from what it ships.
const ROLES = [
  "--orchestra-text",
  "--orchestra-muted",
  "--orchestra-accent",
  "--orchestra-success",
  "--orchestra-warm",
  "--orchestra-danger",
]

describe("Orchestra palettes", () => {
  test("the shipped stylesheets are exactly the generator's output", async () => {
    expect(generated.failures).toEqual([])
    expect((await readdir(generatedDir)).toSorted()).toEqual(Object.keys(generated.files).toSorted())
    for (const [name, content] of Object.entries(generated.files)) expect(await shipped(name)).toBe(content)
  }, 60_000)

  test("the picker offers Orchestra's own schemes and exactly the defined palettes", () => {
    expect(PALETTES.filter((palette) => !recolors(palette)).map((palette) => palette.id)).toEqual([
      "system",
      "dark",
      "light",
    ])
    expect(PALETTES.filter(recolors).map((palette) => [palette.id, palette.scheme])).toEqual(
      PALETTE_DEFINITIONS.map((definition) => [definition.id, definition.scheme]),
    )
    // Dark and Light are today's skin: nothing is generated for them.
    expect(Object.keys(generated.files).filter((name) => /palette-(dark|light|system)\.css/.test(name))).toEqual([])
  })

  test.each(recolored)(
    "%s holds every text and syntax color at AA on the glass over the backdrop",
    async (id, definition) => {
      const checks = measurePalette(sources, definition.scheme, await shipped(`palette-${id}.css`))
      // The measurement must reach the role tokens and the code colors, or a passing result means nothing.
      for (const role of ROLES) expect(checks.some((check) => check.name === role)).toBe(true)
      expect(checks.filter((check) => check.source === "code").length).toBeGreaterThan(5)
      expect(checks.filter((check) => check.ratio < AA)).toEqual([])
    },
    60_000,
  )

  test("the gate rejects a palette whose muted text drops below AA", async () => {
    const css = (await shipped("palette-nord.css")).replace(
      /--orchestra-muted: #[0-9a-f]{6}/,
      "--orchestra-muted: #3a3b45",
    )
    const failing = measurePalette(sources, "dark", css).filter((check) => check.ratio < AA)
    expect(failing.map((check) => check.name)).toContain("--orchestra-muted")
  })

  test.each(recolored)("%s keeps the hue of each of its roles", async (id, definition) => {
    const css = await shipped(`palette-${id}.css`)
    const pairs = [
      ["--orchestra-accent", definition.roles.accent],
      ["--orchestra-success", definition.roles.success],
      ["--orchestra-warm", definition.roles.warning],
      ["--orchestra-danger", definition.roles.danger],
    ] as const
    for (const [token, role] of pairs) {
      const written = new RegExp(`${token}: (#[0-9a-f]{6})`).exec(css)?.[1]
      expect(written, token).toBeDefined()
      const from = toLch(parseColor(role)!)
      const to = toLch(parseColor(written!)!)
      // Hue is meaningless for near-gray colors; AA adjustments may only move lightness.
      if (from.c > 0.04 && to.c > 0.04) expect(Math.abs(hueDelta(to.h, from.h)), `${id} ${token}`).toBeLessThan(4)
    }
  })

  test("Orchestra Dark and Light hold every role color at AA, like the palettes", () => {
    const roles = /^--(orchestra-(text|body|muted|accent|success|warm|danger)|mx-(strong|dim|blue|good|bad))$/
    for (const scheme of ["dark", "light"] as const) {
      const checks = measureBase(sources, scheme).filter((check) => roles.test(check.name))
      // Every role token is measured, or an empty shortfall list means nothing.
      expect(new Set(checks.map((check) => check.name)).size, scheme).toBe(12)
      expect(
        checks.filter((check) => check.ratio < AA).map((check) => `${check.name} ${check.value}`),
        scheme,
      ).toEqual([])
    }
  })

  test("the converter reads an inherited theme's colors into palette roles", () => {
    const roles = convertTheme(nordTheme, "dark")
    expect(roles).toMatchObject({
      background: "#2e3440",
      text: "#e5e9f0",
      accent: "#88c0d0",
      success: "#a3be8c",
      warning: "#d08770",
      danger: "#bf616a",
    })
    expect(roles.syntax).toMatchObject({ comment: "#616e88", keyword: "#81a1c1", constant: "#b48ead" })
  })

  test("AMOLED paints true black behind its glass", async () => {
    const first = await shipped("first-paint.css")
    expect(first).toContain('html[data-orchestra-palette="amoled"]')
    expect(
      /html\[data-orchestra-palette="amoled"\]\[data-color-scheme\] \{\n  --orchestra-background: #000000;/.test(first),
    ).toBe(true)
    const css = await shipped("palette-amoled.css")
    // The overlay over the photograph is opaque black, so no photograph shows through.
    const overlay = /--orchestra-workspace-overlay:\s*(linear-gradient\([^)]*\))/.exec(css)?.[1]
    expect(overlay).toBe("linear-gradient(180deg, #000000, #000000 42%, #000000)")
  })
})
