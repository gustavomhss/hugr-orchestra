import type { LeanDashboard } from "@orchestra/schema/lean-dashboard"

export function leanNumber(value: number | null | undefined, locale: string, unavailable: string, signed = false) {
  if (value === null || value === undefined || !Number.isSafeInteger(value)) return unavailable
  return new Intl.NumberFormat(locale, { signDisplay: signed ? "exceptZero" : "auto" }).format(value)
}

export function leanTokens(savings: LeanDashboard.Savings | undefined) {
  return savings?.tokenCalls === savings?.calls ? savings?.tokensSaved : null
}
