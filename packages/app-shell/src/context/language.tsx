import * as i18n from "@solid-primitives/i18n"
import { createEffect, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import { createSimpleContext } from "@orchestra/ui/context"
import { pluralCategory, type UiI18nPluralKey } from "@orchestra/ui/context/i18n"
import { Persist, persisted } from "@/utils/persist"
import { dict as en } from "@/i18n/en"
import { dict as uiEn } from "@orchestra/ui/i18n/en"
import { EDIT_REVIEW_COPY } from "@orchestra/ui/i18n/edit-review"
import { ORCHESTRA_COPY } from "@/i18n/orchestra"
import {
  createDesktopNativeBundle,
  detectDesktopNativeLocale,
  DESKTOP_NATIVE_ENGLISH,
  DESKTOP_NATIVE_LABELS,
  DESKTOP_NATIVE_LOCALES,
  DESKTOP_NATIVE_LOCALE_TAGS,
  type DesktopNativeBundle,
  type DesktopNativeLocale,
} from "@/i18n/desktop-native"

export type Locale = DesktopNativeLocale
export type Direction = "ltr" | "rtl"

const RTL_LOCALES: ReadonlySet<Locale> = new Set(["ar", "ur", "pa", "fa", "dv"])

function localeDirection(locale: Locale): Direction {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr"
}

type RawDictionary = typeof en & typeof uiEn & typeof ORCHESTRA_COPY & typeof EDIT_REVIEW_COPY
type Dictionary = i18n.Flatten<RawDictionary>
type PluralKey =
  | UiI18nPluralKey
  | "session.question.pending"
  | "session.followupDock.summary"
  | "session.revertDock.summary"
  | "janitor.notify.title"
  | "orchestra.env.preserved"
  | "orchestra.tasks.count"
  // Atlas views word their counts with orchestra.atlas.<view>.<name>.one / .other (i18n/orchestra-chapters/atlas-*.ts).
  | `orchestra.atlas.${string}`
type Source = { dict: Record<string, string> }

function cookie(locale: Locale) {
  return `oc_locale=${encodeURIComponent(locale)}; Path=/; Max-Age=31536000; SameSite=Lax`
}

const LOCALES: readonly Locale[] = DESKTOP_NATIVE_LOCALES

const INTL = DESKTOP_NATIVE_LOCALE_TAGS

const base = i18n.flatten({ ...en, ...uiEn, ...ORCHESTRA_COPY, ...EDIT_REVIEW_COPY })
const dicts = new Map<Locale, Dictionary>([["en", base]])

const merge = (app: Promise<Source>, ui: Promise<Source>, lean: Promise<Source>) =>
  Promise.all([app, ui, lean]).then(([a, b, c]) => ({ ...base, ...i18n.flatten({ ...a.dict, ...b.dict, ...c.dict }) }) as Dictionary)

const loaders: Record<Exclude<Locale, "en">, () => Promise<Dictionary>> = {
  zh: () => merge(import("@/i18n/zh"), import("@orchestra/ui/i18n/zh"), import("@/i18n/lean/zh")),
  zht: () => merge(import("@/i18n/zht"), import("@orchestra/ui/i18n/zht"), import("@/i18n/lean/zht")),
  ko: () => merge(import("@/i18n/ko"), import("@orchestra/ui/i18n/ko"), import("@/i18n/lean/ko")),
  de: () => merge(import("@/i18n/de"), import("@orchestra/ui/i18n/de"), import("@/i18n/lean/de")),
  es: () => merge(import("@/i18n/es"), import("@orchestra/ui/i18n/es"), import("@/i18n/lean/es")),
  fr: () => merge(import("@/i18n/fr"), import("@orchestra/ui/i18n/fr"), import("@/i18n/lean/fr")),
  da: () => merge(import("@/i18n/da"), import("@orchestra/ui/i18n/da"), import("@/i18n/lean/da")),
  ja: () => merge(import("@/i18n/ja"), import("@orchestra/ui/i18n/ja"), import("@/i18n/lean/ja")),
  pl: () => merge(import("@/i18n/pl"), import("@orchestra/ui/i18n/pl"), import("@/i18n/lean/pl")),
  ru: () => merge(import("@/i18n/ru"), import("@orchestra/ui/i18n/ru"), import("@/i18n/lean/ru")),
  uk: () => merge(import("@/i18n/uk"), import("@orchestra/ui/i18n/uk"), import("@/i18n/lean/uk")),
  ar: () => merge(import("@/i18n/ar"), import("@orchestra/ui/i18n/ar"), import("@/i18n/lean/ar")),
  no: () => merge(import("@/i18n/no"), import("@orchestra/ui/i18n/no"), import("@/i18n/lean/no")),
  br: () => merge(import("@/i18n/br"), import("@orchestra/ui/i18n/br"), import("@/i18n/lean/br")),
  th: () => merge(import("@/i18n/th"), import("@orchestra/ui/i18n/th"), import("@/i18n/lean/th")),
  bs: () => merge(import("@/i18n/bs"), import("@orchestra/ui/i18n/bs"), import("@/i18n/lean/bs")),
  tr: () => merge(import("@/i18n/tr"), import("@orchestra/ui/i18n/tr"), import("@/i18n/lean/tr")),
  hi: () => merge(import("@/i18n/hi"), import("@orchestra/ui/i18n/hi"), import("@/i18n/lean/hi")),
  nl: () => merge(import("@/i18n/nl"), import("@orchestra/ui/i18n/nl"), import("@/i18n/lean/nl")),
  id: () => merge(import("@/i18n/id"), import("@orchestra/ui/i18n/id"), import("@/i18n/lean/id")),
  vi: () => merge(import("@/i18n/vi"), import("@orchestra/ui/i18n/vi"), import("@/i18n/lean/vi")),
  it: () => merge(import("@/i18n/it"), import("@orchestra/ui/i18n/it"), import("@/i18n/lean/it")),
  ur: () => merge(import("@/i18n/ur"), import("@orchestra/ui/i18n/ur"), import("@/i18n/lean/ur")),
  pa: () => merge(import("@/i18n/pa"), import("@orchestra/ui/i18n/pa"), import("@/i18n/lean/pa")),
  az: () => merge(import("@/i18n/az"), import("@orchestra/ui/i18n/az"), import("@/i18n/lean/az")),
  fi: () => merge(import("@/i18n/fi"), import("@orchestra/ui/i18n/fi"), import("@/i18n/lean/fi")),
  sv: () => merge(import("@/i18n/sv"), import("@orchestra/ui/i18n/sv"), import("@/i18n/lean/sv")),
  am: () => merge(import("@/i18n/am"), import("@orchestra/ui/i18n/am"), import("@/i18n/lean/am")),
  bg: () => merge(import("@/i18n/bg"), import("@orchestra/ui/i18n/bg"), import("@/i18n/lean/bg")),
  bn: () => merge(import("@/i18n/bn"), import("@orchestra/ui/i18n/bn"), import("@/i18n/lean/bn")),
  ca: () => merge(import("@/i18n/ca"), import("@orchestra/ui/i18n/ca"), import("@/i18n/lean/ca")),
  cs: () => merge(import("@/i18n/cs"), import("@orchestra/ui/i18n/cs"), import("@/i18n/lean/cs")),
  dv: () => merge(import("@/i18n/dv"), import("@orchestra/ui/i18n/dv"), import("@/i18n/lean/dv")),
  dz: () => merge(import("@/i18n/dz"), import("@orchestra/ui/i18n/dz"), import("@/i18n/lean/dz")),
  el: () => merge(import("@/i18n/el"), import("@orchestra/ui/i18n/el"), import("@/i18n/lean/el")),
  et: () => merge(import("@/i18n/et"), import("@orchestra/ui/i18n/et"), import("@/i18n/lean/et")),
  fa: () => merge(import("@/i18n/fa"), import("@orchestra/ui/i18n/fa"), import("@/i18n/lean/fa")),
  fo: () => merge(import("@/i18n/fo"), import("@orchestra/ui/i18n/fo"), import("@/i18n/lean/fo")),
  hr: () => merge(import("@/i18n/hr"), import("@orchestra/ui/i18n/hr"), import("@/i18n/lean/hr")),
  hu: () => merge(import("@/i18n/hu"), import("@orchestra/ui/i18n/hu"), import("@/i18n/lean/hu")),
  hy: () => merge(import("@/i18n/hy"), import("@orchestra/ui/i18n/hy"), import("@/i18n/lean/hy")),
  is: () => merge(import("@/i18n/is"), import("@orchestra/ui/i18n/is"), import("@/i18n/lean/is")),
  ka: () => merge(import("@/i18n/ka"), import("@orchestra/ui/i18n/ka"), import("@/i18n/lean/ka")),
  km: () => merge(import("@/i18n/km"), import("@orchestra/ui/i18n/km"), import("@/i18n/lean/km")),
  lo: () => merge(import("@/i18n/lo"), import("@orchestra/ui/i18n/lo"), import("@/i18n/lean/lo")),
  lt: () => merge(import("@/i18n/lt"), import("@orchestra/ui/i18n/lt"), import("@/i18n/lean/lt")),
  lv: () => merge(import("@/i18n/lv"), import("@orchestra/ui/i18n/lv"), import("@/i18n/lean/lv")),
  mk: () => merge(import("@/i18n/mk"), import("@orchestra/ui/i18n/mk"), import("@/i18n/lean/mk")),
  mn: () => merge(import("@/i18n/mn"), import("@orchestra/ui/i18n/mn"), import("@/i18n/lean/mn")),
  ms: () => merge(import("@/i18n/ms"), import("@orchestra/ui/i18n/ms"), import("@/i18n/lean/ms")),
  my: () => merge(import("@/i18n/my"), import("@orchestra/ui/i18n/my"), import("@/i18n/lean/my")),
  ne: () => merge(import("@/i18n/ne"), import("@orchestra/ui/i18n/ne"), import("@/i18n/lean/ne")),
  ro: () => merge(import("@/i18n/ro"), import("@orchestra/ui/i18n/ro"), import("@/i18n/lean/ro")),
  si: () => merge(import("@/i18n/si"), import("@orchestra/ui/i18n/si"), import("@/i18n/lean/si")),
  sk: () => merge(import("@/i18n/sk"), import("@orchestra/ui/i18n/sk"), import("@/i18n/lean/sk")),
  sl: () => merge(import("@/i18n/sl"), import("@orchestra/ui/i18n/sl"), import("@/i18n/lean/sl")),
  sq: () => merge(import("@/i18n/sq"), import("@orchestra/ui/i18n/sq"), import("@/i18n/lean/sq")),
  sr: () => merge(import("@/i18n/sr"), import("@orchestra/ui/i18n/sr"), import("@/i18n/lean/sr")),
  tg: () => merge(import("@/i18n/tg"), import("@orchestra/ui/i18n/tg"), import("@/i18n/lean/tg")),
  tk: () => merge(import("@/i18n/tk"), import("@orchestra/ui/i18n/tk"), import("@/i18n/lean/tk")),
  uz: () => merge(import("@/i18n/uz"), import("@orchestra/ui/i18n/uz"), import("@/i18n/lean/uz")),
}

function loadDict(locale: Locale) {
  const hit = dicts.get(locale)
  if (hit) return Promise.resolve(hit)
  if (locale === "en") return Promise.resolve(base)
  const load = loaders[locale]
  return load().then((next: Dictionary) => {
    dicts.set(locale, next)
    return next
  })
}

export function loadLocaleDict(locale: Locale) {
  return loadDict(locale).then(() => undefined)
}

function detectLocale(): Locale {
  if (typeof navigator !== "object") return "en"
  return detectDesktopNativeLocale(navigator.languages?.length ? navigator.languages : [navigator.language])
}

export function normalizeLocale(value: string): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : "en"
}

function readStoredLocale() {
  if (typeof localStorage !== "object") return
  try {
    const raw = localStorage.getItem("orchestra.global.dat:language")
    if (!raw) return
    const next = JSON.parse(raw) as { locale?: string }
    if (typeof next?.locale !== "string") return
    return normalizeLocale(next.locale)
  } catch {
    return
  }
}

const warm = readStoredLocale() ?? detectLocale()
const initialLocale =
  warm === "en"
    ? Promise.resolve(warm)
    : loadDict(warm).then(
        () => warm,
        () => "en" as const,
      )

export function loadInitialLocale() {
  return initialLocale
}

export const { use: useLanguage, provider: LanguageProvider } = createSimpleContext({
  name: "Language",
  gate: false,
  init: (props: { locale?: Locale; onNativeTranslations?: (bundle: DesktopNativeBundle) => void }) => {
    const initial = props.locale ?? readStoredLocale() ?? detectLocale()
    const [store, setStore, _, ready] = persisted(
      Persist.global("language", ["language.v1"]),
      createStore({
        locale: initial,
      }),
    )

    const locale = createMemo<Locale>(() => normalizeLocale(store.locale))
    const intl = createMemo(() => INTL[locale()])
    const [layout, setLayout] = createStore({ direction: undefined as Direction | undefined })
    const direction = createMemo(() => layout.direction ?? localeDirection(locale()))
    const layoutLocale = createMemo(() => {
      if (!layout.direction) return intl()
      // Kobalte derives menu direction from locale rather than accepting a direction override.
      return layout.direction === "rtl" ? "ar" : "en"
    })

    const [dict] = createResource(locale, loadDict, {
      initialValue: dicts.get(initial) ?? base,
    })

    const t = i18n.translator(() => dict() ?? base, i18n.resolveTemplate) as (
      key: keyof Dictionary,
      params?: Record<string, string | number | boolean>,
    ) => string

    const plural = (key: PluralKey, count: number, params?: Record<string, string | number | boolean>) => {
      const category = pluralCategory(intl(), count)
      const current = (dict.loading ? base : (dict() ?? base)) as Record<string, string>
      const candidate = `${key}.${category}`
      const fallback = `${key}.other`
      return i18n.resolveTemplate(current[candidate] ?? current[fallback] ?? fallback, { ...params, count })
    }

    const label = (value: Locale) => DESKTOP_NATIVE_LABELS[value]

    createEffect(() => {
      if (typeof document !== "object") return
      const value = locale()
      document.documentElement.lang = intl()
      document.documentElement.dir = direction()
      document.cookie = cookie(value)
    })

    createEffect(() => {
      if (!props.onNativeTranslations || dict.loading) return
      const current = dict()
      if (!current) return
      props.onNativeTranslations(
        createDesktopNativeBundle(locale(), (key) => current[key] ?? DESKTOP_NATIVE_ENGLISH[key]),
      )
    })

    return {
      ready,
      locale,
      intl,
      direction,
      layoutLocale,
      locales: LOCALES,
      label,
      t,
      plural,
      setLocale(next: Locale) {
        setStore("locale", normalizeLocale(next))
      },
      setDirection(next: Direction) {
        setLayout("direction", next === localeDirection(locale()) ? undefined : next)
      },
    }
  },
})
