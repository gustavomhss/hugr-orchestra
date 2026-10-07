import { describe, expect, test } from "bun:test"
import { DESKTOP_NATIVE_LOCALES } from "./desktop-native"
import { ORCHESTRA_COPY } from "./orchestra"

type Dictionaries = Record<string, Record<string, Record<string, string>>>

// The product is HuGR Orchestra, so no copy may name OpenCode. A key below may keep the exact text given, because it
// names something outside Orchestra. Only that text is allowed, and only in that key. Commands, config files and
// folders shown on screen use Orchestra's own names (orchestra, orchestra.json, .orchestra/), so none is listed.
const EXTERNAL_NAMES: Record<string, Record<string, string>> = {}

const sources = {
  app: (locale: string) => `./${locale}.ts`,
  ui: (locale: string) => `../../../ui/src/i18n/${locale}.ts`,
  desktop: (locale: string) => `../../../desktop/src/renderer/i18n/${locale}.ts`,
}

describe("product name in copy", () => {
  test("no dictionary in any locale names OpenCode outside the declared external names", async () => {
    // An empty locale list would scan nothing and pass.
    expect(DESKTOP_NATIVE_LOCALES).toContain("en")
    expect(DESKTOP_NATIVE_LOCALES.length).toBeGreaterThan(1)
    expect(problems(await load(), EXTERNAL_NAMES)).toEqual([])
  }, 30_000) // Cold compilation of every locale is a corpus gate, not a UI-response latency check.

  test("names each planted mention, empty dictionary and stale exception", async () => {
    const dictionaries = structuredClone(await load())
    dictionaries.app!.de!["app.name.desktop"] = "OpenCode Desktop"
    dictionaries.desktop!.ja!["desktop.updater.none.message"] = "opencode"
    // A declared external name is allowed only as its exact text: the rest of the value is still checked.
    dictionaries.ui!.en!["planted.provider"] = "OpenCode Go"
    dictionaries.ui!.fr!["planted.provider"] = "OpenCode Go, by OpenCode"
    dictionaries.app!.pt = {}
    expect(
      problems(dictionaries, {
        ...EXTERNAL_NAMES,
        app: { "app.name.desktop": "Zen" },
        ui: { "planted.provider": "OpenCode Go" },
      }),
    ).toEqual([
      "app/de app.name.desktop: OpenCode Desktop",
      "app/pt: empty dictionary",
      "ui/fr planted.provider: OpenCode Go, by OpenCode",
      "desktop/ja desktop.updater.none.message: opencode",
      "app app.name.desktop: stale exception, English no longer contains Zen",
    ])
  })
})

async function load() {
  const dictionaries: Dictionaries = { orchestra: { en: ORCHESTRA_COPY } }
  for (const [domain, source] of Object.entries(sources)) {
    dictionaries[domain] = Object.fromEntries(
      await Promise.all(DESKTOP_NATIVE_LOCALES.map(async (locale) => {
        const module: { dict: Record<string, string> } = await import(source(locale))
        return [locale, module.dict] as const
      })),
    )
  }
  return dictionaries
}

function problems(dictionaries: Dictionaries, external: Record<string, Record<string, string>>) {
  const found = Object.entries(dictionaries).flatMap(([domain, locales]) =>
    Object.entries(locales).flatMap(([locale, dict]) => {
      if (Object.keys(dict).length === 0) return [`${domain}/${locale}: empty dictionary`]
      return Object.entries(dict).flatMap(([key, value]) => {
        const allowed = external[domain]?.[key]
        const rest = allowed ? value.split(allowed).join("") : value
        return /opencode/i.test(rest) ? [`${domain}/${locale} ${key}: ${value}`] : []
      })
    }),
  )
  const stale = Object.entries(external).flatMap(([domain, keys]) =>
    Object.entries(keys).flatMap(([key, allowed]) =>
      dictionaries[domain]?.en?.[key]?.includes(allowed)
        ? []
        : [`${domain} ${key}: stale exception, English no longer contains ${allowed}`],
    ),
  )
  return [...found, ...stale]
}
