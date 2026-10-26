export function elapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const seconds = String(total % 60).padStart(2, "0")
  if (total < 3600) return `${Math.floor(total / 60)}:${seconds}`
  return `${Math.floor(total / 3600)}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${seconds}`
}
