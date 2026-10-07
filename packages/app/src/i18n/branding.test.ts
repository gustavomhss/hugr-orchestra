import { describe, expect, test } from "bun:test"
import { DESKTOP_NATIVE_LOCALES } from "./desktop-native"
import { ORCHESTRA_COPY } from "./orchestra"

type Dictionaries = Record<string, Record<string, Record<string, string>>>

// The product is HuGR Orchestra, so no copy may name OpenCode. These keys may keep the exact text shown because it
// names something outside Orchestra: the OpenCode Zen and OpenCode Go model services, the opencode.json config file,
// the .opencode/ project folder and the opencode command. Only that text is allowed, and only in that key.
const EXTERNAL_NAMES: Record<string, Record<string, string>> = {
  app: {
    "dialog.plugins.empty": "opencode.json",
    "error.chain.checkConfig": "opencode.json",
  },
  desktop: { "desktop.cli.installed.message": "opencode" },
  orchestra: { "orchestra.skills.dialog.addDetail": ".opencode/" },
}

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
  })

  test("names each planted mention, empty dictionary and stale exception", async () => {
    const dictionaries = structuredClone(await load())
    dictionaries.app!.de!["app.name.desktop"] = "OpenCode Desktop"
    dictionaries.desktop!.ja!["desktop.updater.none.message"] = "opencode"
    dictionaries.ui!.fr!["dialog.usageExceeded.freeTier.description"] = "OpenCode Go, by OpenCode"
    dictionaries.app!.pt = {}
    expect(
      problems(dictionaries, { ...EXTERNAL_NAMES, app: { ...EXTERNAL_NAMES.app, "app.name.desktop": "Zen" } }),
    ).toEqual([
      "app/de app.name.desktop: OpenCode Desktop",
      "app/pt: empty dictionary",
      "ui/fr dialog.usageExceeded.freeTier.description: OpenCode Go, by OpenCode",
      "desktop/ja desktop.updater.none.message: opencode",
      "app app.name.desktop: stale exception, English no longer contains Zen",
    ])
  })
})

async function load() {
  const dictionaries: Dictionaries = { orchestra: { en: ORCHESTRA_COPY } }
  for (const [domain, source] of Object.entries(sources)) {
    dictionaries[domain] = {}
    for (const locale of DESKTOP_NATIVE_LOCALES) {
      const module: { dict: Record<string, string> } = await import(source(locale))
      dictionaries[domain][locale] = module.dict
    }
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
