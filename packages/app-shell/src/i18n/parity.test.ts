import { describe, expect, test } from "bun:test"
import { desktopNativePluralCategories } from "./desktop-native"

const appLocales = [
  "ar",
  "br",
  "bs",
  "da",
  "de",
  "es",
  "fr",
  "ja",
  "ko",
  "no",
  "pl",
  "ru",
  "uk",
  "th",
  "tr",
  "zh",
  "zht",
  "hi",
  "nl",
  "id",
  "vi",
  "it",
  "ur",
  "pa",
  "az",
  "fi",
  "sv",
  "am",
  "bg",
  "bn",
  "ca",
  "cs",
  "dv",
  "dz",
  "el",
  "et",
  "fa",
  "fo",
  "hr",
  "hu",
  "hy",
  "is",
  "ka",
  "km",
  "lo",
  "lt",
  "lv",
  "mk",
  "mn",
  "ms",
  "my",
  "ne",
  "ro",
  "si",
  "sk",
  "sl",
  "sq",
  "sr",
  "tg",
  "tk",
  "uz",
] as const
const desktopLocales = appLocales
const pluralCategories = new Map(
  appLocales.map(
    (locale) =>
      [
        locale,
        desktopNativePluralCategories(locale).filter((category) => category !== "one" && category !== "other"),
      ] as const,
  ),
)

const domains = [
  {
    name: "app",
    source: "./en.ts",
    target: (locale: string) => `./${locale}.ts`,
    locales: appLocales,
    // en.ts spreads the Lean domain for its English base; the other locales carry those keys in ./lean/<locale>.ts.
    omit: "./lean/en.ts",
  },
  {
    name: "ui",
    source: "../../../ui/src/i18n/en.ts",
    target: (locale: string) => `../../../ui/src/i18n/${locale}.ts`,
    locales: appLocales,
  },
  {
    name: "desktop",
    source: "../../../../apps/desktop/src/renderer/i18n/en.ts",
    target: (locale: string) => `../../../../apps/desktop/src/renderer/i18n/${locale}.ts`,
    locales: desktopLocales,
  },
  // Kept last: plural parity covers domains.slice(0, 2) (app, ui).
  {
    name: "lean",
    source: "./lean/en.ts",
    target: (locale: string) => `./lean/${locale}.ts`,
    locales: appLocales,
  },
] as const

describe("i18n parity", () => {
  test("non-English locales have every English key and required plural variants", async () => {
    for (const domain of domains) {
      const source = await domainSource(domain)
      for (const locale of domain.locales) {
        const target = await dictionary(domain.target(locale))
        const missing = Object.keys(source).filter((key) => !Object.hasOwn(target, key))
        const extra = Object.keys(target)
          .filter((key) => !Object.hasOwn(source, key))
          .sort()
        const expected = pluralFamilies(source)
          .flatMap((key) => (pluralCategories.get(locale) ?? []).map((category) => `${key}.${category}`))
          .sort()
        expect({ domain: domain.name, locale, missing, extra }).toEqual({
          domain: domain.name,
          locale,
          missing: [],
          extra: expected,
        })
      }
    }
  }, 30000)

  test("non-English locales preserve English placeholders", async () => {
    for (const domain of domains) {
      const source = await domainSource(domain)
      for (const locale of domain.locales) {
        const target = await dictionary(domain.target(locale))
        const mismatched = Object.keys(source).filter(
          (key) => Object.hasOwn(target, key) && placeholders(source[key]).join() !== placeholders(target[key]).join(),
        )
        const pluralMismatched = pluralFamilies(source).flatMap((key) =>
          (pluralCategories.get(locale) ?? [])
            .map((category) => `${key}.${category}`)
            .filter((variant) => placeholders(source[`${key}.other`]).join() !== placeholders(target[variant]).join()),
        )
        expect({ domain: domain.name, locale, mismatched, pluralMismatched }).toEqual({
          domain: domain.name,
          locale,
          mismatched: [],
          pluralMismatched: [],
        })
      }
    }
  }, 30000)

  test("non-English locales translate targeted unseen session keys", async () => {
    const source = await dictionary("./en.ts")
    for (const locale of appLocales) {
      const target = await dictionary(`./${locale}.ts`)
      for (const key of ["command.session.previous.unseen", "command.session.next.unseen"]) {
        expect(target[key]).toBeDefined()
        expect(target[key]).not.toBe(source[key])
      }
    }
  })

  test("subagent model recovery copy is localized in every declared app dictionary", async () => {
    const source = await dictionary("./en.ts")
    const keys = ["saveFailed", "inherited"].map((key) => `dialog.subagentModels.${key}`)
    expect(appLocales.length).toBeGreaterThan(0)
    for (const locale of appLocales) {
      const target = await dictionary(`./${locale}.ts`)
      for (const key of keys) {
        expect({ locale, key, translated: Object.hasOwn(target, key) && !!target[key].trim() && target[key] !== source[key] })
          .toEqual({ locale, key, translated: true })
      }
    }
  })

  test("pt-BR values differ from English except for an explicit allowlist of identical terms", async () => {
    // Brand and tool names, keyboard keys, native language names, debug-bar labels, placeholders and loanwords that are
    // standard Brazilian UI vocabulary. Anything else equal to English is an untranslated string.
    const identicalPrefixes = [
      "sound.option.",
      "session.header.open.app.",
      "debugBar.",
      "common.key.",
      "model.provider.",
      "settings.permissions.tool.",
    ]
    const identicalKeys = new Set([
      "command.category.terminal",
      "command.category.mcp",
      "command.prompt.mode.shell",
      "command.prompt.mode.normal",
      "prompt.mode.shell",
      "prompt.mode.normal",
      "dialog.provider.group.popular",
      "provider.custom.models.id.label",
      "model.input.pdf",
      "common.loading.ellipsis",
      "appDock.linux.title",
      "dialog.mcp.title",
      "dialog.server.add.placeholder",
      "dialog.server.add.namePlaceholder",
      "wsl.server.label",
      "wsl.onboarding.desktopVersion",
      "error.chain.status",
      "error.page.circular",
      "session.tasks.kind.shell",
      "session.tasks.stats.tokens",
      "session.new.workspace.triggerLocal",
      "status.popover.trigger",
      "status.popover.tab.mcp",
      "status.popover.tab.lsp",
      "status.popover.tab.plugins",
      "lsp.label.connected",
      "terminal.title",
      "terminal.title.numbered",
      "desktop.menu.app",
      "appDock.browser.downloads",
      "session.header.open.finder",
      "app.name.desktop",
      "settings.section.desktop",
      "settings.desktop.section.wsl",
      "settings.general.section.feed",
      "settings.general.row.showTerminal.title",
      "settings.mcp.title",
      "ui.leanToolMetrics.status",
      "ui.leanToolMetrics.milliseconds",
      "ui.lineComment.label.suffix",
      "ui.lineComment.editorLabel.suffix",
      "ui.list.emptyWithFilter.suffix",
      "ui.tool.glob",
      "ui.tool.grep",
      "ui.tool.shell",
      "ui.message.duration.seconds",
      "ui.message.duration.minutesSeconds",
      "lean.page.category.lint",
      "lean.page.item",
    ])
    for (const domain of [
      { source: "./en.ts", target: "./br.ts" },
      { source: "../../../ui/src/i18n/en.ts", target: "../../../ui/src/i18n/br.ts" },
      { source: "./lean/en.ts", target: "./lean/br.ts" },
    ]) {
      const source = await dictionary(domain.source)
      const target = await dictionary(domain.target)
      const untranslated = Object.keys(target).filter(
        (key) =>
          target[key] === source[key] &&
          /\p{L}/u.test(target[key]) &&
          !identicalKeys.has(key) &&
          !identicalPrefixes.some((prefix) => key.startsWith(prefix)),
      )
      expect({ target: domain.target, untranslated }).toEqual({ target: domain.target, untranslated: [] })
    }
  })

  test("changed-file summary keys preserve rendered English copy and localize complete phrases", async () => {
    const source = await dictionary("../../../ui/src/i18n/en.ts")
    expect(source["ui.sessionTurn.diffs.changed.one"].replace("{{count}}", "1")).toBe("1 Changed file")
    expect(source["ui.sessionTurn.diffs.changed.other"].replace("{{count}}", "2")).toBe("2 Changed files")
    expect(source["ui.sessionTurn.diffs.changed"]).toBeUndefined()

    for (const locale of appLocales) {
      const target = await dictionary(`../../../ui/src/i18n/${locale}.ts`)
      for (const key of ["ui.sessionTurn.diffs.changed.one", "ui.sessionTurn.diffs.changed.other"]) {
        expect(target[key].trim()).not.toBe("")
        expect(placeholders(target[key])).toEqual(["count"])
      }
    }
  })
})

describe("i18n plural parity", () => {
  test("locale-specific categories exist and preserve count placeholders", async () => {
    for (const domain of domains.slice(0, 2)) {
      const source = await dictionary(domain.source)
      const families = pluralFamilies(source)
      for (const locale of domain.locales) {
        const target = await dictionary(domain.target(locale))
        const missing = families.flatMap((key) =>
          (pluralCategories.get(locale) ?? [])
            .map((category) => `${key}.${category}`)
            .filter((variant) => !Object.hasOwn(target, variant)),
        )
        const mismatched = families.flatMap((key) =>
          (pluralCategories.get(locale) ?? [])
            .map((category) => `${key}.${category}`)
            .filter(
              (variant) =>
                Object.hasOwn(target, variant) &&
                placeholders(source[`${key}.other`]).join() !== placeholders(target[variant]).join(),
            ),
        )
        expect({ domain: domain.name, locale, missing, mismatched }).toEqual({
          domain: domain.name,
          locale,
          missing: [],
          mismatched: [],
        })
      }
    }
  })
})

// A domain's English keys, minus keys another domain owns (the app domain does not own the Lean keys en.ts spreads).
async function domainSource(domain: { source: string; omit?: string }) {
  const source = await dictionary(domain.source)
  if (!domain.omit) return source
  const owned = await dictionary(domain.omit)
  return Object.fromEntries(Object.entries(source).filter(([key]) => !Object.hasOwn(owned, key)))
}

async function dictionary(file: string) {
  const module: unknown = await import(file)
  if (typeof module !== "object" || module === null || !("dict" in module) || !isDictionary(module.dict)) {
    throw new Error(`Invalid translation dictionary: ${file}`)
  }
  return module.dict
}

function isDictionary(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  return Object.values(value).every((item) => typeof item === "string")
}

function placeholders(value: string) {
  return Array.from(value.matchAll(/{{\s*([^}]+?)\s*}}/g), (match) => match[1]).sort()
}

function pluralFamilies(dictionary: Record<string, string>) {
  return Object.keys(dictionary)
    .filter(
      (key) =>
        key.endsWith(".one") &&
        dictionary[key].includes("{{count}}") &&
        dictionary[`${key.slice(0, -4)}.other`]?.includes("{{count}}"),
    )
    .map((key) => key.slice(0, -4))
}
