import { DateTime } from "luxon"

export function createSessionContextFormatter(locale: string) {
  const usd = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" })
  return {
    currency(value: number | null | undefined) {
      if (value === undefined || value === null) return "—"
      return usd.format(value)
    },
    number(value: number | null | undefined) {
      if (value === undefined) return "—"
      if (value === null) return "—"
      return value.toLocaleString(locale)
    },
    percent(value: number | null | undefined) {
      if (value === undefined) return "—"
      if (value === null) return "—"
      return value.toLocaleString(locale) + "%"
    },
    time(value: number | undefined) {
      if (!value) return "—"
      return DateTime.fromMillis(value).setLocale(locale).toLocaleString(DateTime.DATETIME_MED)
    },
  }
}
