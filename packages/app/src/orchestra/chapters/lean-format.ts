import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"

export function leanNumber(value: number | null | undefined, locale: string, unavailable: string, signed = false) {
  if (value === null || value === undefined || !Number.isSafeInteger(value)) return unavailable
  return new Intl.NumberFormat(locale, { signDisplay: signed ? "exceptZero" : "auto" }).format(value)
}

export function leanTokens(savings: LeanDashboard.Savings | undefined) {
  return savings?.tokenCalls === savings?.calls ? savings?.tokensSaved : null
}

export function leanBytes(value: number | null | undefined, locale: string, unavailable: string) {
  if (value === null || value === undefined || !Number.isSafeInteger(value)) return unavailable
  const unit = Math.abs(value) >= 1024 ** 2 ? 1024 ** 2 : Math.abs(value) >= 1024 ? 1024 : 1
  if (unit === 1) return leanNumber(value, locale, unavailable, true)
  return `${new Intl.NumberFormat(locale, { signDisplay: "exceptZero", maximumFractionDigits: 2 }).format(value / unit)} ${unit === 1024 ? "KiB" : "MiB"}`
}

export function leanTime(value: number, locale: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return
  return {
    iso: date.toISOString(),
    label: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date),
  }
}
