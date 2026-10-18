export function duration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "—"
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = total % 60
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : "", `${remainder}s`].filter(Boolean).join(" ")
}

export function stamp(iso?: string, locale?: string): string {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date)
}

export function shortSHA(value?: string): string {
  return value ? value.slice(0, 8) : "—"
}

// Decimal units match the provider UIs (GitHub and GitLab report 1 KB as 1000 bytes).
export function bytes(value?: number, locale?: string): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) return "—"
  const [unit, size] = value >= 1e9 ? ["gigabyte", value / 1e9] as const : value >= 1e6 ? ["megabyte", value / 1e6] as const
    : value >= 1e3 ? ["kilobyte", value / 1e3] as const : ["byte", value] as const
  return new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short", maximumFractionDigits: size < 10 && unit !== "byte" ? 1 : 0 }).format(size)
}

// "in 29 days", "8 minutes ago", "yesterday"; the largest whole unit that fits.
export function relative(iso?: string, locale?: string, now = Date.now()): string {
  if (!iso) return "—"
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return "—"
  const seconds = Math.round((time - now) / 1000)
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]] as const
  const match = units.find((item) => Math.abs(seconds) >= item[1])
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  return match ? format.format(Math.trunc(seconds / match[1]), match[0]) : format.format(seconds, "second")
}
