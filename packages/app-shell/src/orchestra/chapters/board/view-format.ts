import type { useLanguage } from "@/context/language"
import { range, type Forecast } from "./plan"

type Language = ReturnType<typeof useLanguage>

export function narrow<K extends Forecast["kind"]>(forecast: Forecast, kind: K) {
  return forecast.kind === kind ? (forecast as Extract<Forecast, { kind: K }>) : undefined
}

export function outlook(language: Language, forecast: Forecast) {
  if (forecast.kind === "done") return language.t("orchestra.board.forecast.done")
  if (forecast.kind === "waits") return language.t("orchestra.board.forecast.waits", { on: forecast.on })
  if (forecast.kind === "insufficient")
    return language.t("orchestra.board.forecast.insufficient", { needed: forecast.needed, shipped: forecast.shipped })
  return range(forecast.p50, forecast.p85, language.intl())
}

// Stage entries are real instants, not UTC midnights, so they read in the owner's time zone.
export function localDate(language: Language, at: number) {
  return new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(at)
}

// Declared refusals arrive as the server's tagged JSON body; anything else (transport, parse) has no words to show.
export function refusal(error: unknown) {
  if (typeof error !== "object" || error === null || !("_tag" in error) || !("message" in error)) return
  return typeof error.message === "string" && error.message ? error.message : undefined
}
